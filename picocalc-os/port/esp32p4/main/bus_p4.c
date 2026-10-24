// The ESP32-P4's bus back ends. The kernel task turns each bus effect of a segment into a request and queues
// it for that bus's worker task; the worker does the transfer with ESP-IDF's i2c_master or spi_master and
// queues the result back (p4_kq), and the kernel task settles the world's promise. One worker per bus keeps
// a bus's transfers in the order they were issued, and makes each one atomic: the keyboard and power drivers
// rely on a register read (write, 2 ms, read) not being split by the other's access to the same STM32.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "freertos/task.h"
#include "p4.h"

static const char *TAG = "bus";

enum { REQ_I2C, REQ_SPI_CMD, REQ_SPI_PIXELS };
typedef struct {
  int kind, w, epoch, promise;
  int addr, hz;                 // i2c: the device; spi: the clock
  uint8_t bytes[64]; int nbytes, nread;
  vtime_t gap_us;               // i2c: the bus is held this long between the write and the read
  int cmd;                      // spi command byte
  int buf; const uint16_t *px; int stride, x, y, wd, ht;   // spi pixels: a pinned framebuffer's front buffer
} req_t;

QueueHandle_t p4_kq;
static QueueHandle_t q_i2c, q_spi;

static void post(int bus, const req_t *r, int ok, const char *json, vtime_t t0, uint32_t bytes) {
  kmsg_t m = { .bus = bus, .w = r->w, .epoch = r->epoch, .promise = r->promise, .ok = ok, .buf = -1,
               .t0 = t0, .t1 = port_clock(), .bytes = bytes };
  if (r->kind == REQ_SPI_PIXELS) m.buf = r->buf;
  if (json) snprintf(m.json, sizeof m.json, "%s", json);
  xQueueSend(p4_kq, &m, portMAX_DELAY);
}

// ---- i2c0: the STM32 southbridge at 0x1F (keyboard FIFO, backlight, battery) ---------------------------------
static i2c_master_bus_handle_t i2c_bus;
static struct { int addr, hz; i2c_master_dev_handle_t dev; } i2c_devs[8];

static i2c_master_dev_handle_t i2c_dev(int addr, int hz) {
  for (int i = 0; i < 8; i++) if (i2c_devs[i].dev && i2c_devs[i].addr == addr && i2c_devs[i].hz == hz) return i2c_devs[i].dev;
  for (int i = 0; i < 8; i++) {
    if (i2c_devs[i].dev) continue;
    i2c_device_config_t cfg = { .dev_addr_length = I2C_ADDR_BIT_LEN_7, .device_address = (uint16_t)addr, .scl_speed_hz = (uint32_t)hz };
    if (i2c_master_bus_add_device(i2c_bus, &cfg, &i2c_devs[i].dev) != ESP_OK) return NULL;
    i2c_devs[i].addr = addr; i2c_devs[i].hz = hz;
    return i2c_devs[i].dev;
  }
  return NULL;
}

static void i2c_worker(void *arg) {
  req_t r;
  for (;;) {
    xQueueReceive(q_i2c, &r, portMAX_DELAY);
    vtime_t t0 = port_clock();
    i2c_master_dev_handle_t dev = i2c_dev(r.addr, r.hz);
    esp_err_t err = dev ? ESP_OK : ESP_ERR_NO_MEM;
    uint8_t rd[16] = { 0 };
    if (!err && r.nbytes) err = i2c_master_transmit(dev, r.bytes, r.nbytes, 50);
    if (!err && r.nread) {
      if (r.gap_us >= 1000) vTaskDelay(pdMS_TO_TICKS((r.gap_us + 999) / 1000));
      else if (r.gap_us > 0) esp_rom_delay_us((uint32_t)r.gap_us);
      err = i2c_master_receive(dev, rd, r.nread, 50);
    }
    char json[96];
    if (err) snprintf(json, sizeof json, "\"i2c0 0x%02x: %s\"", r.addr, esp_err_to_name(err));
    else {
      int k = snprintf(json, sizeof json, "[");
      for (int i = 0; i < r.nread; i++) k += snprintf(json + k, sizeof json - k, "%s%d", i ? "," : "", rd[i]);
      snprintf(json + k, sizeof json - k, "]");
    }
    post(BUS_I2C0, &r, !err, json, t0, (uint32_t)(r.nbytes + r.nread + 2));
  }
}

void bus_run_i2c(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle);
  if (!h) {
    kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"the handle went away before the transfer\""), at);
  } else {
    req_t r = { .kind = REQ_I2C, .w = d->w, .epoch = d->epoch, .promise = d->promise, .addr = h->addr, .hz = h->hz,
                .nbytes = d->nbytes > 64 ? 64 : d->nbytes, .nread = d->nread > 16 ? 16 : d->nread, .gap_us = d->delay };
    memcpy(r.bytes, d->bytes, (size_t)r.nbytes);
    xQueueSend(q_i2c, &r, portMAX_DELAY);
  }
  free(d->bytes); d->bytes = NULL;
}

// ---- spi2: the ST7365P panel. D/C low for a command byte, high for its parameters and for pixels -------------
static spi_device_handle_t spi_dev;
static int spi_hz;
enum { CHUNK = 32768 };
static uint8_t *bounce[2];      // internal, DMA-capable: pixels are byte-swapped into these and sent from them
static uint8_t *small;          // commands and their parameters

static esp_err_t spi_ensure(int hz) {
  if (spi_dev && hz == spi_hz) return ESP_OK;
  if (spi_dev) { spi_bus_remove_device(spi_dev); spi_dev = NULL; }
  spi_device_interface_config_t cfg = {
    .clock_source = SPI_CLK_SRC_SPLL,   // the default (XTAL) source rejects clocks above 20 MHz on these GPIO-matrix pins
    .clock_speed_hz = hz, .mode = 0, .spics_io_num = PIN_LCD_CS, .queue_size = 2,
  };
  esp_err_t err = spi_bus_add_device(SPI2_HOST, &cfg, &spi_dev);
  if (err) return err;
  spi_hz = hz;
  int khz = 0;
  spi_device_get_actual_freq(spi_dev, &khz);
  ESP_LOGI(TAG, "spi2: panel device at %d Hz requested, %d kHz actual", hz, khz);
  return ESP_OK;
}

static esp_err_t spi_send(const uint8_t *p, int n) {
  spi_transaction_t t = { .length = (size_t)n * 8, .tx_buffer = p };
  return spi_device_polling_transmit(spi_dev, &t);
}

static esp_err_t spi_pixels(const req_t *r, uint32_t *sent) {
  size_t total = (size_t)r->wd * r->ht * 2, off = 0;
  spi_transaction_t t[2];
  int cur = 0, inflight = 0;
  esp_err_t err = ESP_OK;
  int row = 0, col = 0;   // where in the rectangle the next pixel comes from
  gpio_set_level(PIN_LCD_DC, 1);
  while (off < total && !err) {
    if (inflight == 2) { spi_transaction_t *done; err = spi_device_get_trans_result(spi_dev, &done, portMAX_DELAY); inflight--; if (err) break; }
    size_t m = total - off < CHUNK ? total - off : CHUNK;
    uint8_t *b = bounce[cur];
    for (size_t k = 0; k < m; k += 2) {
      uint16_t v = r->px[(size_t)(r->y + row) * r->stride + r->x + col];
      b[k] = (uint8_t)(v >> 8); b[k + 1] = (uint8_t)v;   // the panel takes RGB565 big-endian
      if (++col == r->wd) { col = 0; row++; }
    }
    t[cur] = (spi_transaction_t){ .length = m * 8, .tx_buffer = b };
    err = spi_device_queue_trans(spi_dev, &t[cur], portMAX_DELAY);
    if (err) break;
    inflight++; off += m; cur ^= 1;
  }
  while (inflight > 0) { spi_transaction_t *done; spi_device_get_trans_result(spi_dev, &done, portMAX_DELAY); inflight--; }
  *sent = (uint32_t)off;
  return err;
}

static void spi_worker(void *arg) {
  req_t r;
  for (;;) {
    xQueueReceive(q_spi, &r, portMAX_DELAY);
    vtime_t t0 = port_clock();
    esp_err_t err = spi_ensure(r.hz);
    uint32_t bytes = 0;
    if (!err && r.kind == REQ_SPI_CMD) {
      small[0] = (uint8_t)r.cmd;
      gpio_set_level(PIN_LCD_DC, 0);
      err = spi_send(small, 1);
      if (!err && r.nbytes) {
        memcpy(small, r.bytes, (size_t)r.nbytes);
        gpio_set_level(PIN_LCD_DC, 1);
        err = spi_send(small, r.nbytes);
      }
      bytes = (uint32_t)(1 + r.nbytes);
    } else if (!err) err = spi_pixels(&r, &bytes);
    char json[96] = "";
    if (err) snprintf(json, sizeof json, "\"spi2: %s\"", esp_err_to_name(err));
    post(BUS_SPI2, &r, !err, err ? json : NULL, t0, bytes);
  }
}

void bus_run_spi_cmd(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle);
  req_t r = { .kind = REQ_SPI_CMD, .w = d->w, .epoch = d->epoch, .promise = d->promise, .hz = h ? h->hz : 1000000,
              .cmd = d->op, .nbytes = d->nbytes > 64 ? 64 : d->nbytes };
  memcpy(r.bytes, d->bytes, (size_t)r.nbytes);
  xQueueSend(q_spi, &r, portMAX_DELAY);
  free(d->bytes); d->bytes = NULL;
}

void bus_run_spi_pixels(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle), *fb = handle_find(d->fb);
  dmabuf_t *b = handle_buf(fb);
  if (!b) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"the framebuffer went away before the transfer\""), at); return; }
  int x = d->x, y = d->y, w = d->wd, hh = d->ht;
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { hh += y; y = 0; }
  if (x + w > b->w) w = b->w - x;
  if (y + hh > b->h) hh = b->h - y;
  if (w <= 0 || hh <= 0) { kernel_settle_at(d->w, d->epoch, d->promise, 1, NULL, at); return; }
  b->refs++;   // pinned until the transfer is done, even if every handle to it goes away meanwhile
  req_t r = { .kind = REQ_SPI_PIXELS, .w = d->w, .epoch = d->epoch, .promise = d->promise, .hz = h ? h->hz : 1000000,
              .buf = fb->buf, .px = b->front, .stride = b->w, .x = x, .y = y, .wd = w, .ht = hh };
  xQueueSend(q_spi, &r, portMAX_DELAY);
}

// ---- the kernel task's side ----------------------------------------------------------------------------------
void bus_p4_done(const kmsg_t *m) {
  bus_finish(m->bus, m->t0, m->t1, m->bytes, !m->ok);
  if (m->buf >= 0) dmabuf_unref(m->buf);
  kernel_settle_at(m->w, m->epoch, m->promise, m->ok, m->json[0] ? xstrdup(m->json) : NULL, m->t1);
}

void bus_p4_init(void) {
  // the kernel queue is big enough for every request the bus queues can hold, so a worker never waits on it
  // while the kernel task waits on the worker's request queue
  q_i2c = xQueueCreate(64, sizeof(req_t));
  q_spi = xQueueCreate(256, sizeof(req_t));
  p4_kq = xQueueCreate(64 + 256 + 64, sizeof(kmsg_t));

  // the panel's D/C and reset lines; a hardware reset now, so the JS driver's SWRESET finds it out of reset
  gpio_config_t out = { .pin_bit_mask = (1ULL << PIN_LCD_DC) | (1ULL << PIN_LCD_RST), .mode = GPIO_MODE_OUTPUT };
  ESP_ERROR_CHECK(gpio_config(&out));
  gpio_set_level(PIN_LCD_DC, 0);
  gpio_set_level(PIN_LCD_RST, 1); vTaskDelay(pdMS_TO_TICKS(10));
  gpio_set_level(PIN_LCD_RST, 0); vTaskDelay(pdMS_TO_TICKS(30));
  gpio_set_level(PIN_LCD_RST, 1); vTaskDelay(pdMS_TO_TICKS(150));

  spi_bus_config_t sb = { .mosi_io_num = PIN_LCD_MOSI, .miso_io_num = -1, .sclk_io_num = PIN_LCD_SCK,
                          .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = CHUNK };
  ESP_ERROR_CHECK(spi_bus_initialize(SPI2_HOST, &sb, SPI_DMA_CH_AUTO));
  for (int i = 0; i < 2; i++) bounce[i] = heap_caps_malloc(CHUNK, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  small = heap_caps_malloc(64, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  if (!bounce[0] || !bounce[1] || !small) ESP_LOGE(TAG, "no internal DMA memory for the SPI bounce buffers");

  i2c_master_bus_config_t ib = { .clk_source = I2C_CLK_SRC_DEFAULT, .i2c_port = I2C_NUM_0, .scl_io_num = PIN_KBD_SCL,
                                 .sda_io_num = PIN_KBD_SDA, .glitch_ignore_cnt = 7, .flags.enable_internal_pullup = true };
  ESP_ERROR_CHECK(i2c_new_master_bus(&ib, &i2c_bus));

  xTaskCreatePinnedToCore(i2c_worker, "bus_i2c0", 4096, NULL, 6, NULL, 0);
  xTaskCreatePinnedToCore(spi_worker, "bus_spi2", 4096, NULL, 6, NULL, 0);
  ESP_LOGI(TAG, "i2c0 sda=%d scl=%d; spi2 sck=%d mosi=%d cs=%d dc=%d rst=%d", PIN_KBD_SDA, PIN_KBD_SCL,
           PIN_LCD_SCK, PIN_LCD_MOSI, PIN_LCD_CS, PIN_LCD_DC, PIN_LCD_RST);
}

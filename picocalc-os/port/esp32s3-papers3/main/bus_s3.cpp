// The PaperS3's bus back ends. The kernel task turns each bus effect of a segment into a request for that bus's
// worker task; the worker does it and queues the result back (s3_kq), and the kernel task settles the world's
// promise. One worker per bus keeps the bus's transfers in order and each one whole.
//
//   i2c1  the GT911 touch controller (0x5D) and the BM8563 clock (0x51), through M5GFX's I2C layer (lgfx::i2c),
//         so the firmware has one I2C implementation and no clash between ESP-IDF's two I2C drivers
//   epd0  the ED047TC1 panel through M5GFX's EPD bus and panel, configured as M5GFX configures the PaperS3
//         but without its touch driver or board autodetect (the OS owns i2c1)
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <M5GFX.h>
#include <lgfx/v1/platforms/esp32/Bus_EPD.h>
#include <lgfx/v1/platforms/esp32/Panel_EPD.hpp>
#include "driver/gpio.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/task.h"
extern "C" {
#include "s3.h"
}

static const char *TAG = "bus";

enum { REQ_I2C, REQ_EPD };
typedef struct {
  int kind, w, epoch, promise;
  int addr, hz;                 // i2c
  uint8_t bytes[64]; int nbytes, nread;
  vtime_t gap_us;
  int buf; const pixel_t *px; int stride, x, y, wd, ht, mode;   // epd: a pinned framebuffer's front buffer
} req_t;

QueueHandle_t s3_kq;
static QueueHandle_t q_i2c, q_epd;
static int bus_i2c1 = 0, bus_epd0 = 1;

static void post(int bus, const req_t *r, int ok, const char *json, vtime_t t0, uint32_t bytes) {
  kmsg_t m = {};
  m.bus = bus; m.w = r->w; m.epoch = r->epoch; m.promise = r->promise; m.ok = ok; m.buf = r->kind == REQ_EPD ? r->buf : -1;
  m.t0 = t0; m.t1 = port_clock(); m.bytes = bytes;
  if (json) snprintf(m.json, sizeof m.json, "%s", json);
  xQueueSend(s3_kq, &m, portMAX_DELAY);
}

// ---- i2c1 ----------------------------------------------------------------------------------------------------
static void i2c_worker(void *arg) {
  req_t r;
  for (;;) {
    xQueueReceive(q_i2c, &r, portMAX_DELAY);
    vtime_t t0 = port_clock();
    s3_pm_hold(PM_I2C);   // the I2C clock is derived from APB
    uint8_t rd[64] = { 0 };
    bool ok;
#ifdef S3_QEMU   // no I2C controller under QEMU: every device answers zeros (no touch; the clock at its reset value)
    ok = true; vTaskDelay(1);
#else
    if (r.nread && r.gap_us <= 0) ok = lgfx::i2c::transactionWriteRead(1, r.addr, r.bytes, (uint8_t)r.nbytes, rd, (size_t)r.nread, (uint32_t)r.hz).has_value();
    else {
      ok = !r.nbytes || lgfx::i2c::transactionWrite(1, r.addr, r.bytes, (uint8_t)r.nbytes, (uint32_t)r.hz).has_value();
      if (ok && r.nread) {
        vTaskDelay(pdMS_TO_TICKS((r.gap_us + 999) / 1000));
        ok = lgfx::i2c::transactionRead(1, r.addr, rd, (uint8_t)r.nread, (uint32_t)r.hz).has_value();
      }
    }
#endif
    s3_pm_release(PM_I2C);
    char json[200];
    if (!ok) snprintf(json, sizeof json, "\"no answer from 0x%02x on i2c1\"", r.addr);
    else {
      int k = snprintf(json, sizeof json, "[");
      for (int i = 0; i < r.nread && k < (int)sizeof json - 6; i++) k += snprintf(json + k, sizeof json - k, "%s%d", i ? "," : "", rd[i]);
      snprintf(json + k, sizeof json - k, "]");
    }
    post(bus_i2c1, &r, ok, json, t0, (uint32_t)(r.nbytes + r.nread + 2));
  }
}

extern "C" void bus_run_i2c(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle);
  if (!h) kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"the handle went away before the transfer\""), at);
  else {
    req_t r = {};
    r.kind = REQ_I2C; r.w = d->w; r.epoch = d->epoch; r.promise = d->promise; r.addr = h->addr; r.hz = h->hz;
    r.nbytes = d->nbytes > 64 ? 64 : d->nbytes; r.nread = d->nread > 48 ? 48 : d->nread; r.gap_us = d->delay;
    memcpy(r.bytes, d->bytes, (size_t)r.nbytes);
    xQueueSend(q_i2c, &r, portMAX_DELAY);
  }
  free(d->bytes); d->bytes = NULL;
}

// ---- epd0 ------------------------------------------------------------------------------------------------------
class PaperPanel : public lgfx::LGFX_Device {
  lgfx::Bus_EPD bus_;
  lgfx::Panel_EPD panel_;
 public:
  PaperPanel() {
    auto b = bus_.config();
    b.bus_speed = 16000000;
    const int8_t data[8] = { 6, 14, 7, 12, 9, 11, 8, 10 };
    for (int i = 0; i < 8; i++) b.pin_data[i] = data[i];
    b.pin_pwr = 46; b.pin_spv = 17; b.pin_ckv = 18; b.pin_sph = 13; b.pin_oe = 45; b.pin_le = 15; b.pin_cl = 16;
    b.bus_width = 8;
    bus_.config(b);
    panel_.setBus(&bus_);
    auto d = panel_.config_detail();
    d.line_padding = 8;
    panel_.config_detail(d);
    auto c = panel_.config();
    c.memory_width = 960; c.panel_width = 960; c.memory_height = 540; c.panel_height = 540;
    c.offset_rotation = 3; c.offset_x = 0; c.offset_y = 0; c.bus_shared = false;
    panel_.config(c);
    setPanel(&panel_);
  }
};
static PaperPanel *panel;
static const epd_mode_t MODES[EPD_MODES] = { epd_mode_t::epd_quality, epd_mode_t::epd_text, epd_mode_t::epd_fast, epd_mode_t::epd_fastest };

static bool wait_idle(void) {   // bounded, so a wedged panel cannot stop the worker for good
  int64_t t0 = port_clock();
  while (panel->displayBusy()) {
    if (port_clock() - t0 > 5000000) return false;
    vTaskDelay(1);
  }
  return true;
}

static void epd_worker(void *arg) {
  req_t r;
  for (;;) {
    xQueueReceive(q_epd, &r, portMAX_DELAY);
    vtime_t t0 = port_clock();
#ifdef S3_QEMU   // no panel under QEMU: be busy as long as the simulator's panel is (sim/papers3/epd.c)
    static const int busy_ms[EPD_MODES] = { 450, 300, 120, 60 };
    vTaskDelay(pdMS_TO_TICKS(busy_ms[r.mode]));
    bool ok = true;
#else
    bool ok = wait_idle();
#endif
    s3_pm_hold(PM_EPD);   // the waveform is timed by the CPU: full speed and no sleep until it ends
    if (ok && panel) {
      panel->setEpdMode(MODES[r.mode]);
      panel->startWrite();
      for (int j = 0; j < r.ht; j++)
        panel->pushImage(r.x, r.y + j, r.wd, 1, (const lgfx::grayscale_t *)(r.px + (size_t)(r.y + j) * r.stride + r.x));
      panel->endWrite();
      panel->display(r.x, r.y, r.wd, r.ht);
      // display() only queues the update for M5GFX's own task; waitDisplay() returns when the waveform is done,
      // so the time reported is the panel's
      panel->waitDisplay();
    }
    s3_pm_release(PM_EPD);
    char json[64];
    if (ok) snprintf(json, sizeof json, "{\"ms\":%.1f}", (port_clock() - t0) / 1000.0);
    else snprintf(json, sizeof json, "\"the panel stayed busy for 5 s\"");
    post(bus_epd0, &r, ok, json, t0, (uint32_t)(r.wd * r.ht));
  }
}

extern "C" void bus_run_epd(deferred_t *d, vtime_t at) {
  handle_t *fb = handle_find(d->fb);
  dmabuf_t *b = handle_buf(fb);
  if (!b) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"the framebuffer went away before the update\""), at); return; }
  int x = d->x, y = d->y, w = d->wd, hh = d->ht;
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { hh += y; y = 0; }
  if (x + w > b->w) w = b->w - x;
  if (y + hh > b->h) hh = b->h - y;
  if (w <= 0 || hh <= 0) { kernel_settle_at(d->w, d->epoch, d->promise, 1, xstrdup("{\"ms\":0}"), at); return; }
  b->refs++;   // pinned until the update is done, even if every handle to it goes away meanwhile
  req_t r = {};
  r.kind = REQ_EPD; r.w = d->w; r.epoch = d->epoch; r.promise = d->promise;
  r.buf = fb->buf; r.px = b->front; r.stride = b->w; r.x = x; r.y = y; r.wd = w; r.ht = hh; r.mode = d->op;
  xQueueSend(q_epd, &r, portMAX_DELAY);
}

// the PaperS3 has no SPI panel; hw.c's SPI operations fail here
extern "C" void bus_run_spi_cmd(deferred_t *d, vtime_t at) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"this board has no spi bus\""), at); free(d->bytes); d->bytes = NULL; }
extern "C" void bus_run_spi_pixels(deferred_t *d, vtime_t at) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"this board has no spi bus\""), at); }

// ---- the kernel task's side ----------------------------------------------------------------------------------
extern "C" void bus_s3_done(const kmsg_t *m) {
  bus_finish(m->bus, m->t0, m->t1, m->bytes, !m->ok);
  if (m->buf >= 0) dmabuf_unref(m->buf);
  kernel_settle_at(m->w, m->epoch, m->promise, m->ok, m->json[0] ? xstrdup(m->json) : NULL, m->t1);
}

extern "C" void bus_s3_init(void) {
  q_i2c = xQueueCreate(64, sizeof(req_t));
  q_epd = xQueueCreate(16, sizeof(req_t));
#ifdef S3_QEMU
  s3_kq = xQueueCreate(24, sizeof(kmsg_t));   // internal RAM is all there is under QEMU, and the test worlds use no bus
#else
  s3_kq = xQueueCreate(64 + 16 + 32, sizeof(kmsg_t));
#endif

  // keep the power latch on (M5GFX's autodetect does this for the PaperS3; we do not call it)
  gpio_config_t out = {};
  out.pin_bit_mask = 1ULL << PIN_PWROFF; out.mode = GPIO_MODE_OUTPUT;
  gpio_config(&out);
  gpio_set_level((gpio_num_t)PIN_PWROFF, 0);

#ifdef S3_QEMU
  ESP_LOGW(TAG, "QEMU build: no panel, the i2c devices answer zeros");
#else
  if (!lgfx::i2c::init(1, PIN_I2C1_SDA, PIN_I2C1_SCL).has_value()) ESP_LOGE(TAG, "i2c1 did not start");

  panel = new PaperPanel();
  panel->init();
  for (int rot = 0; rot < 4 && panel->width() != 540; rot++) panel->setRotation(rot);   // portrait: 540 x 960
  panel->setAutoDisplay(false);
  ESP_LOGI(TAG, "epd0: %d x %d (rotation %d); i2c1 sda=%d scl=%d", (int)panel->width(), (int)panel->height(), panel->getRotation(), PIN_I2C1_SDA, PIN_I2C1_SCL);
#endif

  xTaskCreatePinnedToCore(i2c_worker, "bus_i2c1", 4096, NULL, 6, NULL, 0);
  xTaskCreatePinnedToCore(epd_worker, "bus_epd0", 6144, NULL, 4, NULL, 0);
}

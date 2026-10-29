// The PaperS3 port: the real clock, world arenas and framebuffers in PSRAM, the JS tree compiled into the
// firmware (js_bundle.c from js-papers3/), the battery ADC and the charger's status pin.
#include <stdlib.h>
#include <string.h>
#include "driver/gpio.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_pm.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "s3.h"

static int64_t t_boot = -1;
vtime_t port_clock(void) {
  int64_t t = esp_timer_get_time();
  if (t_boot < 0) t_boot = t;
  return t - t_boot;   // since the kernel started, like the host's virtual clock
}

// A world's arena is one block; MicroQuickJS wants it word-aligned and never reallocates it.
#ifdef S3_QEMU
#define PSRAM MALLOC_CAP_8BIT   // no PSRAM under QEMU (sdkconfig.qemu)
#else
#define PSRAM (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
#endif
void *port_heap_malloc(size_t n) { return heap_caps_aligned_alloc(8, n, PSRAM); }
void *port_heap_realloc(void *p, size_t n) { return heap_caps_realloc(p, n, PSRAM); }
void port_heap_free(void *p) { heap_caps_free(p); }
size_t port_heap_usable(const void *p) { return heap_caps_get_allocated_size((void *)p); }
void *port_big_calloc(size_t n) { return heap_caps_calloc(1, n, PSRAM); }
void port_big_free(void *p) { heap_caps_free(p); }
size_t port_js_stack(void) { return 0; }   // MicroQuickJS keeps its stack in the arena
const char *port_board_name(void) { return "M5Stack PaperS3"; }
const char *const *port_bus_names(void) { static const char *const b[] = { "i2c1", "epd0", NULL }; return b; }
char *port_epd_info(void) { return xstrdup("{\"w\":540,\"h\":960,\"grays\":16,\"modes\":[\"quality\",\"text\",\"fast\",\"fastest\"]}"); }

struct js_file { const char *path; const unsigned char *data; size_t len; };
extern const struct js_file js_bundle[];

char *port_read_file(const char *path, size_t *len) {
  if (!strncmp(path, "js/", 3)) path += 3;
  for (const struct js_file *f = js_bundle; f->path; f++) {
    if (strcmp(f->path, path)) continue;
    char *b = malloc(f->len + 1);
    if (!b) return NULL;
    memcpy(b, f->data, f->len + 1);
    if (len) *len = f->len;
    return b;
  }
  return NULL;
}

// ---- battery and charger ----------------------------------------------------------------------------------
static adc_oneshot_unit_handle_t adc1;
static adc_cali_handle_t cali;

void port_s3_init(void) {
#ifdef S3_QEMU
  return;
#endif
  adc_oneshot_unit_init_cfg_t u = { .unit_id = ADC_UNIT_1 };
  if (adc_oneshot_new_unit(&u, &adc1) == ESP_OK) {
    adc_oneshot_chan_cfg_t c = { .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT };
    adc_oneshot_config_channel(adc1, BAT_ADC_CHANNEL, &c);
    adc_cali_curve_fitting_config_t cc = { .unit_id = ADC_UNIT_1, .chan = BAT_ADC_CHANNEL, .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT };
    if (adc_cali_create_scheme_curve_fitting(&cc, &cali) != ESP_OK) cali = NULL;
  }
  gpio_config_t in = { .pin_bit_mask = 1ULL << PIN_CHARGE, .mode = GPIO_MODE_INPUT, .pull_up_en = GPIO_PULLUP_ENABLE };
  gpio_config(&in);
}

int port_adc_read_mv(int unit, int channel) {
#ifdef S3_QEMU
  return unit == 1 && channel == BAT_ADC_CHANNEL ? 1950 : 0;   // no ADC under QEMU: a half-full cell behind the 1:2 divider
#endif
  if (unit != 1 || !adc1) return 0;
  int raw = 0, mv = 0;
  if (adc_oneshot_read(adc1, channel, &raw) != ESP_OK) return 0;
  if (cali && adc_cali_raw_to_voltage(cali, raw, &mv) == ESP_OK) return mv;
  return raw * 3300 / 4095;
}
int port_gpio_get(int pin) { return gpio_get_level(pin); }

// ---- the persistent store ---------------------------------------------------------------------------------------
// NVS in its own partition ("store", partitions.csv), one NVS namespace per store namespace. NVS writes a record
// whole or not at all, even if the power goes in the middle. Without the partition (an older partition table)
// every record reads as absent and writes fail: the system runs, it only forgets.
static nvs_handle_t store_w, store_k;
void s3_store_init(void) {
  esp_err_t e = nvs_flash_init_partition("store");
  if (e == ESP_ERR_NVS_NO_FREE_PAGES || e == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_LOGW("store", "the store's format is unusable (%s): erasing it", esp_err_to_name(e));
    nvs_flash_erase_partition("store");
    e = nvs_flash_init_partition("store");
  }
  if (e == ESP_OK) e = nvs_open_from_partition("store", "w", NVS_READWRITE, &store_w);
  if (e == ESP_OK) e = nvs_open_from_partition("store", "k", NVS_READWRITE, &store_k);
  if (e != ESP_OK) { ESP_LOGE("store", "no persistent store: %s", esp_err_to_name(e)); store_w = store_k = 0; return; }
  nvs_stats_t st;
  if (nvs_get_stats("store", &st) == ESP_OK) ESP_LOGI("store", "%u of %u entries used", (unsigned)st.used_entries, (unsigned)st.total_entries);
}
static nvs_handle_t store_ns(const char *ns) { return !strcmp(ns, "w") ? store_w : !strcmp(ns, "k") ? store_k : 0; }
char *port_store_get(const char *ns, const char *key, size_t *len) {
  nvs_handle_t h = store_ns(ns);
  size_t n = 0;
  if (!h || nvs_get_blob(h, key, NULL, &n) != ESP_OK) return NULL;
  char *b = malloc(n + 1);
  if (!b) return NULL;
  if (nvs_get_blob(h, key, b, &n) != ESP_OK) { free(b); return NULL; }
  b[n] = 0;
  if (len) *len = n;
  return b;
}
int port_store_set(const char *ns, const char *key, const void *data, size_t len) {
  nvs_handle_t h = store_ns(ns);
  if (!h) return -1;
  esp_err_t e = len ? nvs_set_blob(h, key, data, len) : nvs_erase_key(h, key);
  if (e == ESP_ERR_NVS_NOT_FOUND) e = ESP_OK;   // removing what is not there
  if (e == ESP_OK) e = nvs_commit(h);
  if (e != ESP_OK) ESP_LOGE("store", "%s/%s: %s", ns, key, esp_err_to_name(e));
  return e == ESP_OK ? 0 : -1;
}

// ---- pin interrupts ---------------------------------------------------------------------------------------------
// The handler masks its pin and posts the handle to the kernel task, which delivers an "irq" message; the kernel
// re-arms the pin when the world's turn for it ends. The GPIO ISR service is not in IRAM (flags 0), so the
// handler may call ordinary driver functions.
static int irq_handle[GPIO_NUM_MAX];
static void gpio_isr(void *arg) {
  int pin = (int)(intptr_t)arg;
  gpio_intr_disable(pin);
  kmsg_t m = { 0 };
  m.irq = irq_handle[pin];
  BaseType_t woken = pdFALSE;
  xQueueSendFromISR(s3_kq, &m, &woken);
  if (woken) portYIELD_FROM_ISR();
}

// ---- power management ---------------------------------------------------------------------------------------------
static esp_pm_lock_handle_t pm_locks[PM_LOCKS][2];

#if CONFIG_PM_ENABLE
// External power keeps the chip out of light sleep. Light sleep turns the USB pads off, so a host that is plugged
// in while the chip sleeps cannot enumerate it, and IDF's own lock (CONFIG_USJ_NO_AUTO_LS_ON_CONNECTION) only
// starts once the host sends frames, i.e. after enumeration. The signal is the charger's status pin (GPIO4, low
// while charging): the board's USB-detect line (GPIO5 in M5's demo) reads 0 with USB in on this unit. Once a host
// has enumerated the chip, IDF's lock holds it awake even after charging ends. The pin's interrupt watches for the
// other level each time; while it is high the low level is also a wake source, so plugging in wakes the chip.
#define PIN_POWER_IN PIN_CHARGE
static esp_pm_lock_handle_t power_lock;
static void power_in_isr(void *arg) {
  (void)arg;
  if (gpio_get_level(PIN_POWER_IN) == 0) {
    esp_pm_lock_acquire(power_lock);
    gpio_wakeup_disable(PIN_POWER_IN);
    gpio_set_intr_type(PIN_POWER_IN, GPIO_INTR_HIGH_LEVEL);
  } else {
    esp_pm_lock_release(power_lock);
    gpio_wakeup_enable(PIN_POWER_IN, GPIO_INTR_LOW_LEVEL);   // also sets the interrupt type to the low level
  }
}
#endif

void s3_pm_init(void) {
#if CONFIG_PM_ENABLE
  esp_pm_config_t pm = { .max_freq_mhz = 240, .min_freq_mhz = 40, .light_sleep_enable = true };
  if (esp_pm_configure(&pm) != ESP_OK) { ESP_LOGE("pm", "power management did not start"); return; }
  esp_pm_lock_create(ESP_PM_CPU_FREQ_MAX, 0, "kernel", &pm_locks[PM_KERNEL][0]);
  esp_pm_lock_create(ESP_PM_CPU_FREQ_MAX, 0, "epd", &pm_locks[PM_EPD][0]);
  esp_pm_lock_create(ESP_PM_NO_LIGHT_SLEEP, 0, "epd", &pm_locks[PM_EPD][1]);
  esp_pm_lock_create(ESP_PM_APB_FREQ_MAX, 0, "i2c", &pm_locks[PM_I2C][0]);
  esp_sleep_enable_gpio_wakeup();   // watched pins wake the chip (port_gpio_watch)

  esp_pm_lock_create(ESP_PM_NO_LIGHT_SLEEP, 0, "power_in", &power_lock);
  gpio_config_t c = { .pin_bit_mask = 1ULL << PIN_POWER_IN, .mode = GPIO_MODE_INPUT, .pull_up_en = GPIO_PULLUP_ENABLE };
  esp_err_t e = gpio_install_isr_service(0);
  if (gpio_config(&c) != ESP_OK || (e != ESP_OK && e != ESP_ERR_INVALID_STATE) ||
      gpio_isr_handler_add(PIN_POWER_IN, power_in_isr, NULL) != ESP_OK) {
    ESP_LOGE("pm", "no external-power detection: the chip stays awake");
    esp_pm_lock_acquire(power_lock);
    return;
  }
  ESP_LOGI("pm", "external power %s (GPIO%d)", gpio_get_level(PIN_POWER_IN) ? "out" : "in", PIN_POWER_IN);
  power_in_isr(NULL);   // take the lock (or arm the wakeup) for the level now
  gpio_intr_enable(PIN_POWER_IN);
#endif
}
void s3_pm_hold(int which) { for (int i = 0; i < 2; i++) if (pm_locks[which][i]) esp_pm_lock_acquire(pm_locks[which][i]); }
void s3_pm_release(int which) { for (int i = 0; i < 2; i++) if (pm_locks[which][i]) esp_pm_lock_release(pm_locks[which][i]); }

int port_gpio_watch(int pin, int mode, int handle_id) {
  static const gpio_int_type_t TYPE[] = { GPIO_INTR_DISABLE, GPIO_INTR_LOW_LEVEL, GPIO_INTR_HIGH_LEVEL, GPIO_INTR_NEGEDGE, GPIO_INTR_POSEDGE };
  static bool service;
  if (pin < 0 || pin >= GPIO_NUM_MAX || mode <= IRQ_NONE || mode > IRQ_RISING) return -1;
  if (!service) {
    esp_err_t e = gpio_install_isr_service(0);
    if (e != ESP_OK && e != ESP_ERR_INVALID_STATE) return -1;   // INVALID_STATE: someone installed it already
    service = true;
  }
  gpio_config_t c = { .pin_bit_mask = 1ULL << pin, .mode = GPIO_MODE_INPUT, .intr_type = TYPE[mode],
                      .pull_up_en = mode == IRQ_LOW || mode == IRQ_FALLING, .pull_down_en = mode == IRQ_HIGH || mode == IRQ_RISING };
  if (gpio_config(&c) != ESP_OK) return -1;
  irq_handle[pin] = handle_id;
  if (gpio_isr_handler_add(pin, gpio_isr, (void *)(intptr_t)pin) != ESP_OK) return -1;
  gpio_intr_enable(pin);
#if CONFIG_PM_ENABLE
  // light sleep wakes on a level: the active one (an edge's resting level is the other)
  gpio_wakeup_enable(pin, mode == IRQ_LOW || mode == IRQ_FALLING ? GPIO_INTR_LOW_LEVEL : GPIO_INTR_HIGH_LEVEL);
#endif
  return 0;
}
void port_gpio_arm(int pin, int mode) { (void)mode; gpio_intr_enable(pin); }
void port_gpio_unwatch(int pin) {
  gpio_intr_disable(pin);
  gpio_isr_handler_remove(pin);
#if CONFIG_PM_ENABLE
  gpio_wakeup_disable(pin);
#endif
  irq_handle[pin] = 0;
}

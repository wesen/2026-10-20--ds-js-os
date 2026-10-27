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
#include "esp_timer.h"
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

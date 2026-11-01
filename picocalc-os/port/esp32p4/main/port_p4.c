// The ESP32-P4 port: the real clock, world heaps and framebuffers in PSRAM, and the JS tree compiled into the
// firmware (js_bundle.c, made by bundle_js.cmake from the same js/ directory the host reads).
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "p4.h"

static int64_t t_boot = -1;
vtime_t port_clock(void) {
  int64_t t = esp_timer_get_time();
  if (t_boot < 0) t_boot = t;
  return t - t_boot;   // since the kernel started, like the host's virtual clock
}

// QuickJS's allocator puts its block headers and arenas on JS_MALLOC_ALIGN (8) boundaries and the compiler
// relies on it; ESP-IDF's heap only promises 4 (a PSRAM malloc(24) came back at ...a94). glibc gives 16, so
// the host never shows this. Every world-heap block is 8-aligned here, and realloc keeps it so.
#define PSRAM (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
#define ALIGN 8
void *port_heap_malloc(size_t n) { return heap_caps_aligned_alloc(ALIGN, n, PSRAM); }
void *port_heap_realloc(void *p, size_t n) {
  if (!p) return port_heap_malloc(n);
  size_t old = heap_caps_get_allocated_size(p);
  if (n <= old && n + 64 > old) return p;   // shrinking a little, or growing within the block: keep it
  void *q = heap_caps_aligned_alloc(ALIGN, n, PSRAM);
  if (!q) return NULL;
  memcpy(q, p, old < n ? old : n);
  heap_caps_free(p);
  return q;
}
void port_heap_free(void *p) { heap_caps_free(p); }
size_t port_heap_usable(const void *p) { return heap_caps_get_allocated_size((void *)p); }
void *port_big_calloc(size_t n) { return heap_caps_calloc(1, n, PSRAM); }
void port_big_free(void *p) { heap_caps_free(p); }
// the kernel task has an 80 KB stack; runtimes are made a few KB below its top, and C frames below a
// JS call (host calls, printf) need room past the limit
size_t port_js_stack(void) { return 56 * 1024; }
const char *const *port_bus_names(void) { static const char *const b[] = { "i2c0", "spi2", NULL }; return b; }
const char *port_board_name(void) { return "ESP32-P4 in a PicoCalc"; }

// The system time is set by SNTP once Wi-Fi is up (agent_p4.c); before that it counts from 1970.
int64_t port_wall_ms(void) {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  if (tv.tv_sec < 1735689600) return -1;   // before 2025-01-01: not set yet
  return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}
int port_gpio_watch(int pin, int mode, int handle_id) { (void)pin; (void)mode; (void)handle_id; return -1; }   // no pin interrupts here
void port_gpio_arm(int pin, int mode) { (void)pin; (void)mode; }
void port_gpio_unwatch(int pin) { (void)pin; }
// Native worlds: WebAssembly modules in WAMR (nucleus/native_wasm.c), and, in a build with PICOCALC_NATIVE_ELF,
// machine code: the ELF modules of the firmware's own manifest (optional/native_elf, trusted drivers, not isolated).
#if PICOCALC_NATIVE_ELF
const native_backend_t *elf_backend(void);
#endif
const native_backend_t *port_native_backend(int engine) {
  if (engine == ENG_WASM) return wasm_backend();
#if PICOCALC_NATIVE_ELF
  if (engine == ENG_NATIVE) return elf_backend();
#endif
  return NULL;
}

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

// The log ring's lock: ESP-IDF logs from the Wi-Fi, event and file tasks as well as the kernel's. A critical section
// also keeps the kernel task from preempting a lower-priority task on its core that holds the lock.
static portMUX_TYPE log_mux = portMUX_INITIALIZER_UNLOCKED;
void port_log_lock(void) { portENTER_CRITICAL(&log_mux); }
void port_log_unlock(void) { portEXIT_CRITICAL(&log_mux); }

// ESP-IDF's log goes to the console as before, and each line into the ring as well, for the Logs app.
static vprintf_like_t esp_out;
static int log_hook(const char *fmt, va_list ap) {
  char b[160];
  va_list copy;
  va_copy(copy, ap);
  vsnprintf(b, sizeof b, fmt, copy);
  va_end(copy);
  kernel_log_add(t_boot < 0 ? 0 : esp_timer_get_time() - t_boot, b);
  return esp_out(fmt, ap);
}
void p4_log_init(void) {
  kernel_log_init();
  esp_out = esp_log_set_vprintf(log_hook);
}

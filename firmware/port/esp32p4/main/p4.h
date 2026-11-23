// What the ESP32-P4 port's files share: the board's pins, and the queue through which the bus workers and the
// console hand work to the kernel task. Only the kernel task touches K.
#pragma once
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "nucleus.h"

// The same-position RPico adapter (verified in esp32-s3-m5/0099).
#define PIN_KBD_SDA 50
#define PIN_KBD_SCL 49
#define PIN_LCD_SCK 3
#define PIN_LCD_MOSI 2
#define PIN_LCD_CS 7
#define PIN_LCD_DC 24
#define PIN_LCD_RST 25

// A finished bus transfer, a console command (line != NULL) or a finished file job (fs != NULL), for the kernel task.
typedef struct {
  char *line;
  fs_job_t *fs;
  int bus, w, epoch, promise, ok, buf;
  vtime_t t0, t1;
  uint32_t bytes;
  char json[96];
} kmsg_t;
extern QueueHandle_t p4_kq;

#if PICOCALC_TYPED_RAY
void p4_typed_ray_poll(void);
#endif

void bus_p4_init(void);
void bus_p4_done(const kmsg_t *m);    // the kernel task's side of a finished transfer
void bus_p4_inject_key(int state, int code);
bool bus_p4_hold(int timeout_ms);     // stop keyboard-bus transactions (before a reboot or a flash); true when idle   // a console key event (state 1 down, 2 hold, 3 up), read as if typed
void console_exec(char *line);        // main_p4.c, on the kernel task
void p4_fs_init(void);                // mounts the files partition at /files, starts the fs worker
void p4_fs_done(fs_job_t *j);         // the kernel task's side of a finished file job
void p4_fs_console(const char *cmd, const char *arg);   // ls [PATH], cat PATH, df, put PATH [BASE64]
char *p4_bundle_read(const char *path, size_t *len, char *buffer, size_t capacity);
void p4_log_init(void);               // ESP-IDF's log lines into the kernel's log ring too
void p4_store_init(void);             // never erases failed/old NVS automatically
bool p4_config_available(void);
void p4_tz_apply(void);               // the saved time zone (NVS "settings"/"tz") into TZ; UTC without one
void p4_tz_console(const char *arg);  // console: tz [POSIX TZ]
void p4_agent_init(void);             // creates the native worker; never touches K from that worker
void p4_agent_console(const char *args); // secret values are accepted but never echoed

#if PICOCALC_TYPED_APPS
// typed_p4.c: the Typed compiler on the handheld and the apps of typed_apps.h (apps/typed/NAME/app.json).
#include "typed_apps.h"
typedef struct {
  size_t heap_bytes;         // the compiler's heap cap
  vtime_t duration_us;       // the compile is interrupted after this long
  const char *rv32_backend;  // a bundled RV32 back end instead of typed/rv32.js (bench studies), or NULL
  const char *policy;        // a named RV32 code-generation policy (typed-rv32.js POLICIES), or NULL
} p4_compile_limits;
char *p4_typed_compile(const char *app, const char *source_kind, const char *source,
                       size_t source_length, const char *linker, const char *entry,
                       const char *const *compiler, const char *reactor, size_t reactor_length,
                       size_t *length, vtime_t started, const p4_compile_limits *limits);
const p4_typed_app *p4_typed_app_find(const char *name);
p4_compile_limits p4_typed_app_limits(const p4_typed_app *app);
// The app compiled from its bundled source (variant: an index into its variants, 0 without), or from text.
char *p4_typed_app_compile(const p4_typed_app *app, int variant, const char *text, size_t text_length,
                           const char *kind, size_t *length);
char *p4_typed_world_read(const char *path, size_t *length, bool *served);  // NAME/compiled.bin of a boot world
void p4_typed_console(const char *args);
#endif

#if PICOCALC_BENCH
bool p4_bench_console(const char *cmd, const char *args);   // bench/board/firmware: false if cmd is not a benchmark
#endif

// The Candela gallery's console command (PICOCALC-CANDELA-GALLERY, candela_gallery_p4.c), one more case of
// console_exec's dispatch. A macro, so that main_p4.c gains no line without the option: its line numbers, which
// ESP_ERROR_CHECK writes into the playable firmware, stay as they were.
#if PICOCALC_CANDELA_GALLERY
void p4_gallery_console(const char *args);
#define P4_GALLERY_CONSOLE(cmd, rest) else if (!strcmp(cmd, "gallery")) p4_gallery_console(rest);
#else
#define P4_GALLERY_CONSOLE(cmd, rest)
#endif

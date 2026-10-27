// The nucleus: the small C core of the PicoCalc OS. It owns the QuickJS runtimes (one per world), the
// virtual clock and event queue, mailboxes and channels, the hardware handles that JS drivers hold,
// and the pixel primitives. Everything else (drivers, compositor, apps) is JavaScript.
//
// What differs between targets is behind the port API at the end of this file. The host build (host/,
// sim/) runs on Linux against simulated hardware on a virtual clock; the ESP32-P4 build (port/esp32p4/)
// drives the real buses with ESP-IDF and runs the same kernel loop in a FreeRTOS task on the real clock.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

// A framebuffer pixel: RGB565 on the PicoCalc; 8-bit gray (0 black, 255 white) with NUCLEUS_GRAY8 (the PaperS3).
#ifdef NUCLEUS_GRAY8
typedef uint8_t pixel_t;
#else
typedef uint16_t pixel_t;
#endif

typedef int64_t vtime_t;                      // virtual microseconds since boot
#define MS(x) ((vtime_t)((x) * 1000))
#define VT_INF INT64_MAX
#define WALL_BOOT_MS 1792662060000.0   // what the wall clock reads at boot until an RTC says otherwise: 2026-10-22 09:41 UTC

// ---- the device profile: what things cost on the virtual clock ---------------------------------------
typedef struct {
  const char *name;
  double ns_per_step;       // one interrupt-counter step (a loop back-edge or a call) in a world
  vtime_t turn_base_us;     // entering a world and leaving it
  double fill_ns_per_px;    // gfx fill
  double text_ns_per_px;    // gfx glyph blending (per cell pixel)
  double diff_ns_per_px;    // comparing the back and front framebuffers
  double json_ns_per_byte;  // encoding or decoding a message payload
  vtime_t spi_chunk_us;     // per-DMA-chunk overhead on SPI
  double mem_scale;         // host bytes per device byte (64-bit pointers make worlds bigger)
  double loop_ms;           // what the 100k-iteration calibration loop takes on the device (vm_calibrate)
} profile_t;
extern profile_t PROFILE;

// ---- messages -------------------------------------------------------------------------------------------
enum { M_ON, M_TICK, M_START };
#define MAX_MSG_HANDLES 8
typedef struct msg {
  struct msg *next;
  int kind;
  char *type;               // message type or channel name
  char *json;               // payload as JSON text, or NULL
  int from;                 // world id, or -1 for the kernel
  int ask;                  // ask id, or 0
  int timer;                // M_TICK: which timer
  int hs[MAX_MSG_HANDLES], nh;  // handles the receiver is given on delivery
  vtime_t t;                // when it was sent
  uint64_t seq;
} msg_t;

typedef struct settle { struct settle *next; int promise; int ok; char *json; vtime_t t; uint64_t seq; } settle_t;

// ---- worlds ---------------------------------------------------------------------------------------------
enum { W_IDLE, W_BUSY, W_RESTARTING, W_STOPPED };
#define MAX_WORLDS 32
#define MAX_LIST 16
#define NAME_LEN 32

typedef struct world {
  int id;
  char name[NAME_LEN], kind[12], file[96], title[NAME_LEN];
  char *source;
  struct vmw *vm;           // the engine binding's state for this world (vm.c, vm_mqjs.c); NULL when not running
  int status;
  int prio;                 // the lane takes runnable worlds by priority, then by arrival
  bool boot_ready; vtime_t boot_t; uint64_t boot_seq;
  int epoch;                // bumped on every restart: timers, settles and replies of an older epoch are dropped
  msg_t *mbox, *mbox_tail; int mbox_len, mbox_peak;
  settle_t *settles, *settles_tail;
  // what the world declared through its builder
  char needs[MAX_LIST][NAME_LEN]; int n_needs;
  char provides[MAX_LIST][NAME_LEN]; int n_provides;
  int every_ms[MAX_LIST]; int n_every; bool tick_queued[MAX_LIST];
  bool has_start, has_screen;
  char *frame;              // last frame it published
  // the turn in progress
  bool in_turn;
  int turn_ask;             // the ask this turn answers, 0 if none
  char turn_type[NAME_LEN];
  bool turn_async, turn_done, turn_failed, turn_rejected;
  char *turn_result, *turn_error;
  int reply_hs[MAX_MSG_HANDLES], reply_nh;
  // limits, from the manifest
  char claims[MAX_LIST][NAME_LEN]; int n_claims;
  size_t mem_limit;         // device bytes
  vtime_t budget_us;        // per segment
  // accounting
  size_t mem_used;          // host bytes, from the allocator
  bool oom, overrun;
  int64_t interrupts;       // interrupt-handler calls since the runtime was made
  int64_t seg_interrupts0; int seg_counter0;
  int64_t budget_interrupts;
  vtime_t crash_times[8]; int n_crash_times;
  int restarts;
  char last_error[240];
  char *trace;              // the stack of the last error
  uint64_t turns, msgs;
  vtime_t cpu_us, turn_started;
  vtime_t prof_engine_us, prof_render_us;   // real-time mode: the parts of cpu_us spent in the engine and rendering
  uint64_t prof_segments, prof_steps;
  unsigned gcs;             // garbage collections in the current instance (engines that count them)
  vtime_t seg_deadline;     // real-time mode: the segment is stopped when the clock passes this
  uint64_t seed;
} world_t;

// ---- events ---------------------------------------------------------------------------------------------
enum { E_DELIVER, E_TICK, E_SETTLE, E_RESTART, E_FN };
typedef struct event {
  vtime_t t; uint64_t seq;
  int type, w, epoch, a;
  msg_t *msg;
  settle_t *settle;
  void (*fn)(void *arg, int a);
  void *arg;
} event_t;

// ---- handles: hardware a world holds ---------------------------------------------------------------------
enum { H_I2C, H_SPI, H_DMA, H_EPD, H_ADC, H_GPIO };
enum { R_READ = 1, R_WRITE = 2, R_GRANT = 4 };
typedef struct {
  int id, type, rights, parent, minter;
  uint64_t holders;         // bit per world id
  bool live, revoked;
  char claim[NAME_LEN];
  int bus, addr, hz;        // H_I2C / H_SPI / H_EPD (bus); H_ADC (addr = unit, hz = channel); H_GPIO (addr = pin)
  int buf;                  // H_DMA: index into the buffer table (shared by a handle and its children)
} handle_t;
#define MAX_HANDLES 128

typedef struct {            // a DMA-capable framebuffer of pixel_t: drawn into back, sent from front
  bool live; int refs;
  int w, h;
  pixel_t *back, *front;
  size_t bytes;
} dmabuf_t;
#define MAX_BUFS 16

typedef struct {            // a bus: transfers on it are serialised
  const char *name;
  vtime_t free_at;
  vtime_t busy_us;
  uint64_t bytes, transfers, errors;
} bus_t;
#define MAX_BUSES 4
enum { BUS_I2C0, BUS_SPI2 };   // the PicoCalc's buses, in the order its ports name them (port_bus_names)

// ---- deferred effects: what a segment did, applied when it ends -------------------------------------------
typedef struct deferred {
  struct deferred *next;
  void (*run)(struct deferred *d, vtime_t at);
  int w, epoch, promise;
  msg_t *msg;
  int handle, fb, op;
  int x, y, wd, ht;
  uint8_t *bytes; int nbytes, nread;
  vtime_t delay;
  char *json; int ok;
} deferred_t;

// ---- the kernel ---------------------------------------------------------------------------------------------
#define MAX_ASKS 1024
typedef struct {
  int id, from, from_epoch, to, promise;
  bool live;
  vtime_t deadline;
} ask_t;

typedef struct {
  vtime_t vnow;
  vtime_t lane_free;
  uint64_t seq;
  world_t *worlds[MAX_WORLDS]; int n_worlds;
  world_t *cur;
  vtime_t seg_cost;
  deferred_t *defer_head, *defer_tail;
  handle_t handles[MAX_HANDLES]; int n_handles;
  dmabuf_t bufs[MAX_BUFS];
  bus_t buses[MAX_BUSES]; int n_buses;
  ask_t asks[MAX_ASKS]; int next_ask;
  int next_promise;
  uint64_t turns, segments, published, delivered, crashes;
  vtime_t lane_busy;
  bool verbose, quiet, trace;
  bool realtime;            // the port's real clock (port_clock) instead of the virtual one
  char *prelude; size_t prelude_len;
  char js_root[256];
  FILE *uart;               // the console UART: kernel log and fault frames for the host
} kernel_t;
extern kernel_t K;

// kernel.c
void kernel_init(const char *js_root, const char *uart_path);
int kernel_boot(const char *manifest_path);
void kernel_run_until(vtime_t t);
vtime_t kernel_next_wake(void);
void kernel_shutdown(void);
event_t *new_event(int type, vtime_t t);
void schedule(event_t *e);
void schedule_fn(vtime_t t, void (*fn)(void *, int), void *arg, int a);
void klog(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
world_t *world_by_name(const char *name);
world_t *world_by_id(int id);
msg_t *new_msg(int kind, const char *type, const char *json, int from);
void free_msg(msg_t *m);
void defer(deferred_t *d);
void defer_deliver(world_t *to, msg_t *m);
void defer_settle(world_t *W, int promise, int ok, const char *json, vtime_t delay);
void kernel_settle_at(int w, int epoch, int promise, int ok, char *json, vtime_t t);
vtime_t kernel_now(void);
void kernel_publish(world_t *from, const char *ch, const char *json, const int *hs, int nh);
int kernel_ask(world_t *from, world_t *to, const char *type, const char *json, const int *hs, int nh, int promise, vtime_t timeout);
void crash(world_t *W, const char *why);
int kernel_restart_world(world_t *W);
void kernel_fault(world_t *W, const char *why);
char *kernel_worlds_json(void);
char *kernel_stats_json(void);
void kernel_stats_print(void);
bool world_needs(world_t *W, const char *ch);
bool world_provides(world_t *W, const char *ch);
bool world_claims(world_t *W, const char *claim);

// the engine binding: vm.c (QuickJS) or vm_mqjs.c (MicroQuickJS); one is linked into a build
typedef struct {                // one entry of system.json's "worlds", as the binding's JSON parser read it
  char name[NAME_LEN], file[96];
  bool has_budget, has_mem, has_prio;
  double budget_ms, mem_kb, priority;
  char claims[MAX_LIST][NAME_LEN]; int n_claims;
} manifest_world_t;
int vm_read_manifest(const char *json, size_t n, const char *path, int (*add)(void *arg, const manifest_world_t *w), void *arg);
const char *vm_engine_name(void);
int vm_create(world_t *W);
void vm_dispose(world_t *W);
void vm_begin_segment(world_t *W, vtime_t budget_us);
int64_t vm_steps(world_t *W);
int vm_dispatch(world_t *W, msg_t *m);
int vm_settle(world_t *W, settle_t *s);
char *vm_render(world_t *W);
void vm_calibrate(void);

// hw.c
handle_t *handle_find(int id);
handle_t *handle_new(int type, world_t *holder, const char *claim);
handle_t *handle_use(world_t *W, int id, int type, int right, char *err, size_t n);
handle_t *handle_child(world_t *W, handle_t *h, int rights);
void handle_grant(handle_t *h, world_t *to);
void handle_release(handle_t *h, world_t *W);
void handles_drop_world(world_t *W);
bool world_holds(world_t *W, int id);
int dmabuf_alloc(int w, int h);
dmabuf_t *handle_buf(handle_t *h);
void dmabuf_unref(int i);
int bus_index(const char *name);   // -1 if this board has no such bus
vtime_t bus_start(int bus, vtime_t at);
void bus_finish(int bus, vtime_t start, vtime_t end, uint64_t bytes, bool error);
void hw_i2c(world_t *W, handle_t *h, const uint8_t *wr, int nwr, int nrd, vtime_t gap, int promise);
void hw_spi_cmd(world_t *W, handle_t *h, int cmd, const uint8_t *data, int n, int promise);
void hw_spi_pixels(world_t *W, handle_t *h, handle_t *fb, int x, int y, int w, int hh, int promise);
char *hw_handles_json(void);
char *hw_buses_json(void);

// gfx.c
void gfx_fill(dmabuf_t *b, int x, int y, int w, int h, pixel_t c);
void gfx_rect(dmabuf_t *b, int x, int y, int w, int h, pixel_t c);
int gfx_text(dmabuf_t *b, int x, int y, const char *s, int font, pixel_t fg, int max_w);
void gfx_line(dmabuf_t *b, int x0, int y0, int x1, int y1, pixel_t c);
int gfx_measure(const char *s, int font);                    // width in pixels
char *gfx_wrap_json(const char *s, int font, int max_w);     // ["line", ...] word-wrapped to max_w, malloc'ed
char *gfx_fonts_json(void);                                  // {name: [w, h], ...}
int gfx_font_index(const char *name);
void gfx_font_size(int font, int *w, int *h);
int gfx_text_len(const char *s);
int gfx_commit(dmabuf_t *b, int *rects, int max_rects);
pixel_t gfx_color(const char *s);
const char *gfx_font_names(void);

// png.c (host only)
int png_write_rgb(const char *path, const uint8_t *rgb, int w, int h);

// util.c
char *xstrdup(const char *s);
char *read_file(const char *path, size_t *len);
typedef struct { char *s; size_t n, cap; } sbuf_t;
void sb_add(sbuf_t *b, const char *s);
void sb_printf(sbuf_t *b, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
void sb_json_str(sbuf_t *b, const char *s);

// ---- the port: what a build target provides (host/ + sim/ on Linux, port/esp32p4/ on the device) ---------------
vtime_t port_clock(void);                 // real time, microseconds since boot; used when K.realtime
void *port_heap_malloc(size_t n);         // world heaps
void *port_heap_realloc(void *p, size_t n);
void port_heap_free(void *p);
size_t port_heap_usable(const void *p);
void *port_big_calloc(size_t n);          // framebuffers
void port_big_free(void *p);
size_t port_js_stack(void);               // the JS stack limit of a world's runtime
char *port_read_file(const char *path, size_t *len);   // a malloc'ed, NUL-terminated copy, or NULL
const char *port_board_name(void);
const char *const *port_bus_names(void);   // the board's buses, NULL-terminated; their order gives their indices
// the bus back ends: each starts the transfer a deferred effect describes, at the time the segment that issued
// it ended, and settles d->promise once with kernel_settle_at(). They own d->bytes (free it or take it).
void bus_run_i2c(deferred_t *d, vtime_t at);
void bus_run_spi_cmd(deferred_t *d, vtime_t at);
void bus_run_spi_pixels(deferred_t *d, vtime_t at);
void bus_run_epd(deferred_t *d, vtime_t at);    // an e-paper update: rect (x, y, wd, ht) of buffer d->fb, waveform mode d->op
char *port_epd_info(void);                      // the panel as JSON: {"w", "h", "modes"}, malloc'ed
int port_adc_read_mv(int unit, int channel);    // H_ADC: millivolts at the pin
int port_gpio_get(int pin);                     // H_GPIO: the pin's level

// e-paper waveform modes (hw.c): "quality" (16 grays, clean), "text", "fast" (black/white), "fastest"
enum { EPD_QUALITY, EPD_TEXT, EPD_FAST, EPD_FASTEST, EPD_MODES };
extern const char *const epd_mode_names[EPD_MODES];
int epd_mode_index(const char *name);

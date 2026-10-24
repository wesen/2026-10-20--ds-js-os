// The nucleus: the small C core of the PicoCalc OS. It owns the QuickJS runtimes (one per world), the
// virtual clock and event queue, mailboxes and channels, the hardware handles that JS drivers hold,
// and the pixel primitives. Everything else (drivers, compositor, apps) is JavaScript.
//
// The host build runs on Linux against simulated hardware (sim/). An ESP32-P4 build would replace
// sim/ and hw.c's bus back ends with ESP-IDF drivers and run the same kernel loop in a FreeRTOS task.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "quickjs.h"

typedef int64_t vtime_t;                      // virtual microseconds since boot
#define MS(x) ((vtime_t)((x) * 1000))
#define VT_INF INT64_MAX

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

typedef struct { int id; JSValue resolve, reject; } pending_t;

typedef struct world {
  int id;
  char name[NAME_LEN], kind[12], file[96], title[NAME_LEN];
  char *source;
  JSRuntime *rt;
  JSContext *ctx;
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
  pending_t *pend; int n_pend, cap_pend;
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
  uint64_t seed;
  JSValue fn_dispatch, fn_render;
  JSValue unhandled[8], unhandled_why[8]; int n_unhandled;
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
enum { H_I2C, H_SPI, H_DMA };
enum { R_READ = 1, R_WRITE = 2, R_GRANT = 4 };
typedef struct {
  int id, type, rights, parent, minter;
  uint64_t holders;         // bit per world id
  bool live, revoked;
  char claim[NAME_LEN];
  int bus, addr, hz;        // H_I2C / H_SPI
  int buf;                  // H_DMA: index into the buffer table (shared by a handle and its children)
} handle_t;
#define MAX_HANDLES 128

typedef struct {            // a DMA-capable RGB565 framebuffer: drawn into back, sent from front
  bool live; int refs;
  int w, h;
  uint16_t *back, *front;
  size_t bytes;
} dmabuf_t;
#define MAX_BUFS 16

typedef struct {            // a bus: transfers on it are serialised
  const char *name;
  vtime_t free_at;
  vtime_t busy_us;
  uint64_t bytes, transfers, errors;
} bus_t;
enum { BUS_I2C0, BUS_SPI2, N_BUSES };

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
  bus_t buses[N_BUSES];
  ask_t asks[MAX_ASKS]; int next_ask;
  int next_promise;
  uint64_t turns, segments, published, delivered, crashes;
  vtime_t lane_busy;
  bool verbose, quiet, trace;
  char *prelude; size_t prelude_len;
  char js_root[256];
  FILE *uart;               // the console UART: kernel log and fault frames for the host
} kernel_t;
extern kernel_t K;

// kernel.c
void kernel_init(const char *js_root, const char *uart_path);
int kernel_boot(const char *manifest_path);
void kernel_run_until(vtime_t t);
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

// vm.c
int vm_create(world_t *W);
void vm_dispose(world_t *W);
void vm_begin_segment(world_t *W, vtime_t budget_us);
int64_t vm_steps(world_t *W);
int vm_dispatch(world_t *W, msg_t *m);
int vm_settle(world_t *W, settle_t *s);
char *vm_render(world_t *W);
int vm_new_promise(world_t *W, JSValue *promise);
const char *vm_exception(JSContext *ctx, char *buf, size_t n);
void vm_calibrate(void);

// hw.c
handle_t *handle_new(int type, world_t *holder, const char *claim);
handle_t *handle_use(world_t *W, int id, int type, int right, char *err, size_t n);
handle_t *handle_child(world_t *W, handle_t *h, int rights);
void handle_grant(handle_t *h, world_t *to);
void handle_release(handle_t *h, world_t *W);
void handles_drop_world(world_t *W);
bool world_holds(world_t *W, int id);
int dmabuf_alloc(int w, int h);
dmabuf_t *handle_buf(handle_t *h);
void hw_i2c(world_t *W, handle_t *h, const uint8_t *wr, int nwr, int nrd, vtime_t gap, int promise);
void hw_spi_cmd(world_t *W, handle_t *h, int cmd, const uint8_t *data, int n, int promise);
void hw_spi_pixels(world_t *W, handle_t *h, handle_t *fb, int x, int y, int w, int hh, int promise);
char *hw_handles_json(void);
char *hw_buses_json(void);

// gfx.c
void gfx_fill(dmabuf_t *b, int x, int y, int w, int h, uint16_t c);
void gfx_rect(dmabuf_t *b, int x, int y, int w, int h, uint16_t c);
int gfx_text(dmabuf_t *b, int x, int y, const char *s, int font, uint16_t fg, int max_w);
void gfx_line(dmabuf_t *b, int x0, int y0, int x1, int y1, uint16_t c);
int gfx_font_index(const char *name);
void gfx_font_size(int font, int *w, int *h);
int gfx_text_len(const char *s);
int gfx_commit(dmabuf_t *b, int *rects, int max_rects);
uint16_t gfx_color(const char *s);
const char *gfx_font_names(void);

// sim/
void sim_init(void);
void st7365p_reset(void);
void st7365p_cmd(uint8_t cmd, vtime_t t);
void st7365p_data(const uint8_t *d, int n, vtime_t t);
int st7365p_capture_png(const char *path, int scale);
void st7365p_report(void);
void stm32_init(void);
int stm32_i2c(const uint8_t *wr, int nwr, uint8_t *rd, int nrd);
void stm32_key(uint8_t code, int state);
void stm32_battery(int pct, bool charging);
int stm32_backlight(void);

// png.c
int png_write_rgb(const char *path, const uint8_t *rgb, int w, int h);

// util.c
char *xstrdup(const char *s);
char *read_file(const char *path, size_t *len);
typedef struct { char *s; size_t n, cap; } sbuf_t;
void sb_add(sbuf_t *b, const char *s);
void sb_printf(sbuf_t *b, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
void sb_json_str(sbuf_t *b, const char *s);

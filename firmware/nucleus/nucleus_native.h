// Native worlds (native.c): part of nucleus.h, which includes this file where the section belongs (after the
// engine binding, before the port). Include nucleus.h, not this file.
#pragma once
// ---- native worlds (native.c): a binary instead of JavaScript ----------------------------------------------------
// A world's engine is the manifest's "engine": "js" (the binding above), "wasm" (a WebAssembly module) or "native"
// (machine code for this board: a Linux process on the host; on the P4, in a build with PICOCALC_NATIVE_ELF, an ELF
// module of the firmware's own manifest, a trusted driver). The kernel calls an engine through eng_*, which
// picks the binding or native.c; native.c delivers events to the port's backend for the engine and carries out the
// binary's system calls with the same checks and deferred effects as the binding's operations.
enum { ENG_JS, ENG_WASM, ENG_NATIVE, ENG_COUNT };
const char *engine_name(int engine);
int engine_index(const char *name);   // -1 if there is no such engine
enum { NW_MESSAGE, NW_TICK, NW_START, NW_IRQ, NW_SETTLE, NW_INIT };   // event kinds (the first four are msg_t kinds)
enum { NW_DONE = 0, NW_LATER = 1 };   // what an event handler returns: the turn is over, or it answers later
// System calls, numbered for the wire (sdk/nw_wire.h, the WebAssembly imports): see nat_syscall
enum {
  NW_LOG = 1, NW_NOW, NW_SELF, NW_SEND, NW_PUBLISH, NW_REPLY, NW_REJECT, NW_NEED, NW_PROVIDE, NW_EVERY, NW_KIND,
  NW_ASK, NW_SLEEP, NW_I2C_OPEN, NW_I2C, NW_RELEASE, NW_STORE_LOAD, NW_STORE_SAVE, NW_TIMER, NW_SCREEN, NW_PRESENT,
  NW_CLOCK_WALL, NW_CLOCK_ZONE, NW_CLOCK_SETZONE, NW_NET_INFO, NW_NET_SCAN, NW_NET_RESULT, NW_NET_JOIN,
  NW_FS_OPEN, NW_FS_READ, NW_CLOCK_OFFSET, NW_FS_WRITE, NW_CLOCK_TODAY,
  NW_FS_AT, NW_REVOKE, NW_ASK_FILE,
  NW_FS_OP, NW_PAINTER_PUBLISH,
  NW_CALLS
};
// Firmware-private CJI operations. The compiler uses the matching CJI constants in world-native.js.
enum {
  CJI_HANDLE_INFO = 1001, CJI_FS_OPEN, CJI_FS_AT, CJI_FS_OP, CJI_REVOKE,
  CJI_DMA = 1010, CJI_NARROW, CJI_SPI, CJI_CMD, CJI_PIXELS, CJI_FILL, CJI_RECT, CJI_LINE,
  CJI_TEXT, CJI_COMMIT, CJI_INVALIDATE, CJI_FONTS, CJI_PAINTER_DRAW, CJI_RAYTRACE,
  CJI_WORLDS = 1030, CJI_STATS, CJI_STORE_STATUS, CJI_AGENT_STATUS, CJI_AGENT_START, CJI_AGENT_POLL,
  CJI_AGENT_CANCEL, CJI_AGENT_BODY
};
typedef struct {                // one event for a binary
  int kind;
  const char *type, *json, *from;   // NUL-terminated; json is "null" when there is no payload
  size_t type_len, json_len, from_len;
  int ask, timer, token, ok;
} nw_event_t;
typedef struct {                // one system call from a binary: the strings are its bytes, not NUL-terminated
  int op;
  int32_t i[3];
  int64_t v;
  const char *s[3];
  size_t n[3];
} nw_call_t;
#define NW_STR_MAX 65536        // the longest string a system call takes or returns (a file, a record, a payload)
#define NW_OUT_MAX 16384        // what a call can return (a store record is read in full up to store_kb)
#define NW_SCREEN_MAX 16384     // a native world's screen: its tree and hints (a JavaScript world's is not bounded)
#define NW_HINTS_MAX 120        // the hint bar's text
typedef struct native_backend {
  const char *name;                                  // "proc", "wasm", "elf"
  int (*load)(world_t *W, char *why, size_t n);      // make the instance from W->source / source_len
  int (*event)(world_t *W, const nw_event_t *e);     // run one event; NW_DONE, NW_LATER, or -1 (W->last_error set)
  void (*unload)(world_t *W);                        // destroy the instance
} native_backend_t;
typedef struct native {
  const native_backend_t *be;
  void *inst;                   // the backend's instance
  bool cji_handles;             // set by the P4 loader for bundled CJI modules
  bool in_init;                 // its init is running: declarations are allowed
  vtime_t budget_us;            // this segment's budget
  char err[200];                // why its last system call failed
  char *agent_body;             // completed response until its immediate CJI body read
  bool store_pending, store_failed;
  char *screen;                 // its screen as nw_screen last set it: {"tree":...,"hints":"..."}, or NULL
} native_t;
const native_backend_t *port_native_backend(int engine);   // NULL: this board cannot run that engine
const native_backend_t *wasm_backend(void);   // WebAssembly in WAMR (native_wasm.c); NULL when built without it
int nat_create(world_t *W);
void nat_dispose(world_t *W);
void nat_begin_segment(world_t *W, vtime_t budget_us);
int nat_dispatch(world_t *W, msg_t *m);
int nat_settle(world_t *W, settle_t *s);
// A binary's system call, for the world running now: the result (>= 0), or a negative number with W->nat->err set.
// A call that returns text writes at most out_n - 1 bytes and a NUL to out and returns their number.
int64_t nat_syscall(world_t *W, const nw_call_t *c, char *out, size_t out_n);
char *nat_render(world_t *W);   // a copy of the screen it set, for the kernel's render step; NULL if none

// The kernel calls a world's engine through these.
static inline int eng_create(world_t *W) { return W->engine == ENG_JS ? vm_create(W) : nat_create(W); }
static inline void eng_dispose(world_t *W) { if (W->engine == ENG_JS) vm_dispose(W); else nat_dispose(W); }
static inline void eng_begin_segment(world_t *W, vtime_t b) { if (W->engine == ENG_JS) vm_begin_segment(W, b); else nat_begin_segment(W, b); }
static inline int64_t eng_steps(world_t *W) { return W->engine == ENG_JS ? vm_steps(W) : 0; }   // a native backend adds its cost to K.seg_cost
static inline int eng_dispatch(world_t *W, msg_t *m) { return W->engine == ENG_JS ? vm_dispatch(W, m) : nat_dispatch(W, m); }
static inline int eng_settle(world_t *W, settle_t *s) { return W->engine == ENG_JS ? vm_settle(W, s) : nat_settle(W, s); }
static inline char *eng_render(world_t *W) { return W->engine == ENG_JS ? vm_render(W) : nat_render(W); }
static inline bool eng_running(world_t *W) { return W->vm || W->nat; }

// hw.c
handle_t *handle_find(int id);
const char *handle_type_name(int type);
handle_t *handle_new(int type, world_t *holder, const char *claim);
handle_t *handle_use(world_t *W, int id, int type, int right, char *err, size_t n);
bool handle_may_grant(world_t *W, int id, char *err, size_t n);
handle_t *handle_child(world_t *W, handle_t *h, int rights);
void handle_grant(handle_t *h, world_t *to);
void handle_release(handle_t *h, world_t *W);
void handles_drop_world(world_t *W);
int hw_gpio_watch(handle_t *h, int mode);   // nonzero if this board's pin cannot interrupt
void hw_gpio_unwatch(handle_t *h);
bool world_holds(world_t *W, int id);
int dmabuf_alloc(int w, int h);
dmabuf_t *handle_buf(handle_t *h);
int dmabuf_persist(dmabuf_t *b);   // front -> the kernel's store record "frame": its size, or -1 (too busy, no store)
bool dmabuf_adopt(dmabuf_t *b);    // the saved record -> front, once (it is removed); false if there was none
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
#if PICOCALC_RAYTRACE
bool gfx_raytrace(dmabuf_t *b, int sx, int sy, int lx, int ly, int selection);
#endif
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
void gfx_invalidate(dmabuf_t *b);   // the panel lost its picture: the next commit sends everything
uint32_t gfx_hash(const dmabuf_t *b);   // of the back buffer (the compositor's paint check)
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
bool utf8_valid(const unsigned char *s, size_t n);   // well-formed UTF-8 (no overlongs, surrogates or > U+10FFFF)
bool net_ssid_ok(const char *s);       // 1 to 32 bytes of UTF-8 without control characters
bool net_password_ok(const char *s);   // empty, 8 to 63 printable ASCII characters, or 64 hexadecimal digits
const char *clock_zone(void);
bool tz_valid(const char *s);          // a plausible POSIX TZ string (the C library interprets it)
void secret_wipe(void *p, size_t n);


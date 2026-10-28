// One MicroQuickJS context per world (the PaperS3 build). The context lives in one fixed arena of the world's
// heap limit, so running out of it is the world running out of memory. The engine has no promises and no
// job queue: the asynchronous host calls return a promise id, and the prelude (js-papers3/prelude.js) keeps
// the callbacks and runs them when the kernel settles that id through __settle. C never holds a JS value
// across a call that could collect (the collector moves objects); structured results go to JS as JSON text.
//
// Entry points the prelude defines:  __init() -> meta, __dispatch(kind, type, json, from, isAsk) -> reply JSON,
//                                    __settle(id, ok, json), __render() -> frame JSON
// Host calls it is given:            __k(op, ...) for things that finish now, __ka(op, ...) -> promise id
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"
#include "mquickjs.h"

struct vmw {
  JSContext *ctx;
  uint8_t *arena;
  size_t size;
  unsigned ooms;            // out-of-memory errors seen: one more after a segment means it hit its limit
};
extern const JSSTDLibraryDef js_stdlib;   // mqjs_stdlib.h, generated from third_party/mquickjs/nucleus_stdlib.c

const char *vm_engine_name(void) { return "MicroQuickJS " MQJS_VERSION; }

// ---- the engine's log: errors print their backtrace through it ------------------------------------------
static sbuf_t *log_sink;
static void log_write(void *opaque, const void *buf, size_t n) {
  (void)opaque;
  if (log_sink) sb_printf(log_sink, "%.*s", (int)n, (const char *)buf);
}

// The pending exception as "message (file:line)", with the backtrace after a newline (as vm.c gives it).
static void exception_text(JSContext *ctx, char *out, size_t n) {
  JSValue e = JS_GetException(ctx);
  sbuf_t b = { 0 };
  log_sink = &b;
  JS_PrintValueF(ctx, e, JS_DUMP_LONG);
  log_sink = NULL;
  const char *s = b.s ? b.s : "exception";
  const char *nl = strchr(s, '\n');
  int mlen = nl ? (int)(nl - s) : (int)strlen(s);
  char where[128] = "";
  for (const char *p = nl; p && (p = strstr(p, "at ")); p += 3) {   // the first frame that is not the prelude
    const char *open = strchr(p, '('), *close = open ? strchr(open, ')') : NULL, *end = strchr(p, '\n');
    if (open && close && (!end || close < end) && strncmp(open + 1, "prelude.js", 10) && strncmp(open + 1, "<kernel>", 8)) {
      snprintf(where, sizeof where, " (%.*s)", (int)(close - open - 1), open + 1);
      break;
    }
  }
  snprintf(out, n, "%.*s%s%s%s", mlen, s, where, nl ? "\n" : "", nl ? nl + 1 : "");
  free(b.s);
}

static void set_error(world_t *W) {
  char b[2048];
  exception_text(W->vm->ctx, b, sizeof b);
  char *nl = strchr(b, '\n');
  free(W->trace);
  W->trace = nl ? xstrdup(nl + 1) : NULL;
  if (nl) *nl = 0;
  snprintf(W->last_error, sizeof W->last_error, "%s", b);
  if (strstr(b, "out of memory")) W->oom = true;
}

// ---- work counting ------------------------------------------------------------------------------------------
static int on_interrupt(JSContext *ctx, void *opaque) {
  (void)ctx;
  world_t *W = opaque;
  W->interrupts++;
  if (K.realtime ? port_clock() > W->seg_deadline : W->interrupts - W->seg_interrupts0 > W->budget_interrupts) { W->overrun = true; return 1; }
  return 0;
}

void vm_begin_segment(world_t *W, vtime_t budget_us) {
  W->seg_interrupts0 = W->interrupts;
  W->seg_counter0 = W->vm && W->vm->ctx ? JS_GetInterruptCounter(W->vm->ctx) : JS_GetInterruptCounterInit();
  W->budget_interrupts = (int64_t)((double)budget_us * 1000.0 / (PROFILE.ns_per_step * JS_GetInterruptCounterInit())) + 1;
  W->seg_deadline = K.realtime ? port_clock() + budget_us : VT_INF;
  W->overrun = false;
}

int64_t vm_steps(world_t *W) {
  if (!W->vm || !W->vm->ctx) return 0;
  return (W->interrupts - W->seg_interrupts0) * JS_GetInterruptCounterInit() + W->seg_counter0 - JS_GetInterruptCounter(W->vm->ctx);
}

// What a world uses: the heap the last collection left live (the collector only runs when the arena is full,
// so the heap's end is mostly garbage), plus its stack. Running out of the arena is still exact.
static void note_memory(world_t *W) {
  size_t heap, stack, live; unsigned gcs;
  JS_GetMemoryUsage(W->vm->ctx, &heap, &stack, &live, &gcs);
  W->mem_used = (gcs ? live : heap) + stack;
  W->gcs = gcs;
  unsigned ooms = JS_GetOutOfMemoryCount(W->vm->ctx);
  if (ooms != W->vm->ooms) { W->vm->ooms = ooms; W->oom = true; }   // even if the world caught the error
}

// ---- arguments: copied out at once (a string's bytes can move at the next allocation) -------------------------
static int iarg(JSContext *ctx, JSValue *argv, int argc, int i, int def) {
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return def;
  double d; if (JS_ToNumber(ctx, &d, argv[i])) return def;
  return (int)d;
}
static double darg(JSContext *ctx, JSValue *argv, int argc, int i, double def) {
  if (i >= argc || JS_IsUndefined(argv[i])) return def;
  double d; if (JS_ToNumber(ctx, &d, argv[i])) return def;
  return d;
}
static char *sarg(JSContext *ctx, JSValue *argv, int argc, int i) {   // a copy, or NULL
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return NULL;
  JSCStringBuf cb;
  size_t n;
  const char *s = JS_ToCStringLen(ctx, &n, argv[i], &cb);
  if (!s) return xstrdup("");
  char *c = malloc(n + 1);
  memcpy(c, s, n); c[n] = 0;
  return c;
}
static int int_list(JSContext *ctx, JSValue *argv, int argc, int i, int *out, int max) {
  if (i >= argc || !JS_IsPtr(argv[i]) || JS_GetClassID(ctx, argv[i]) != JS_CLASS_ARRAY) return 0;
  int n = 0;
  JSValue lv = JS_GetPropertyStr(ctx, argv[i], "length");
  JS_ToInt32(ctx, &n, lv);
  if (n > max) n = max;
  for (int k = 0; k < n; k++) { int x = 0; JS_ToInt32(ctx, &x, JS_GetPropertyUint32(ctx, argv[i], (uint32_t)k)); out[k] = x; }
  return n;
}
static pixel_t color_arg(JSContext *ctx, JSValue *argv, int argc, int i) {
  if (i < argc && JS_IsString(ctx, argv[i])) { char *s = sarg(ctx, argv, argc, i); pixel_t c = gfx_color(s); free(s); return c; }
  return (pixel_t)iarg(ctx, argv, argc, i, 0);
}
static JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static JSValue fail(JSContext *ctx, const char *fmt, ...) {
  char b[256]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  return JS_ThrowError(ctx, JS_CLASS_ERROR, "%s", b);
}
static JSValue json_value(JSContext *ctx, char *json) {   // takes ownership; parsed in the world
  if (!json) return JS_NULL;
  JSValue v = JS_Parse(ctx, json, strlen(json), "<kernel>", JS_EVAL_JSON);
  free(json);
  return v;
}
static void charge_json(size_t n) { K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); }

static bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh) {
  char err[160];
  for (int i = 0; i < nh; i++) {
    handle_t *h = handle_use(W, hs[i], -1, 0, err, sizeof err);
    if (!h) { fail(ctx, "%s", err); return false; }
    if (!(h->rights & R_GRANT) && h->minter != W->id) { fail(ctx, "handle %d cannot be passed on by %s", hs[i], W->name); return false; }
  }
  return true;
}

#define WORLD ((world_t *)JS_GetContextOpaque(ctx))
typedef JSValue (*op_fn)(JSContext *ctx, world_t *W, int argc, JSValue *argv);

// ---- sync operations -----------------------------------------------------------------------------------------
static JSValue op_now(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)W; (void)argc; (void)argv; return JS_NewFloat64(ctx, kernel_now() / 1000.0); }
static JSValue op_self(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)argc; (void)argv; return JS_NewString(ctx, W->name); }
static JSValue op_seed(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)argc; (void)argv; return JS_NewFloat64(ctx, (double)(W->seed & 0xffffffff)); }
static JSValue op_log(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  char *s = sarg(ctx, argv, argc, 0);
  klog("%s: %s", W->name, s ? s : "");
  free(s);
  return JS_UNDEFINED;
}
// where an error was made: the first frame of its backtrace that is not the prelude, as "file:line:col", or ""
static JSValue op_err_where(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W;
  if (argc < 1 || !JS_IsError(ctx, argv[0])) return JS_NewString(ctx, "");
  sbuf_t b = { 0 };
  log_sink = &b;
  JS_PrintValueF(ctx, argv[0], JS_DUMP_LONG);
  log_sink = NULL;
  char where[128] = "";
  for (const char *p = b.s ? strchr(b.s, '\n') : NULL; p && (p = strstr(p, "at ")); p += 3) {
    const char *open = strchr(p, '('), *close = open ? strchr(open, ')') : NULL, *end = strchr(p, '\n');
    if (open && close && (!end || close < end) && strncmp(open + 1, "prelude.js", 10) && strncmp(open + 1, "<kernel>", 8)) {
      snprintf(where, sizeof where, "%.*s", (int)(close - open - 1), open + 1);
      break;
    }
  }
  free(b.s);
  return JS_NewString(ctx, where);
}
static JSValue op_engine(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)W; (void)argc; (void)argv; return JS_NewString(ctx, vm_engine_name()); }

static JSValue op_send(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int hs[MAX_MSG_HANDLES], nh = int_list(ctx, argv, argc, 3, hs, MAX_MSG_HANDLES);
  char *to = sarg(ctx, argv, argc, 0), *type = sarg(ctx, argv, argc, 1), *json = sarg(ctx, argv, argc, 2);
  world_t *T = to ? world_by_name(to) : NULL;
  JSValue r = JS_UNDEFINED;
  if (!T) r = fail(ctx, "there is no world called \"%s\"", to ? to : "");
  else if (check_grants(ctx, W, hs, nh)) {
    msg_t *m = new_msg(M_ON, type, json, W->id);
    memcpy(m->hs, hs, sizeof(int) * nh); m->nh = nh;
    charge_json(json ? strlen(json) : 0);
    defer_deliver(T, m);
  } else r = JS_EXCEPTION;
  free(to); free(type); free(json);
  return r;
}

static JSValue op_publish(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int hs[MAX_MSG_HANDLES], nh = int_list(ctx, argv, argc, 2, hs, MAX_MSG_HANDLES);
  char *ch = sarg(ctx, argv, argc, 0), *json = sarg(ctx, argv, argc, 1);
  JSValue r = JS_UNDEFINED;
  if (!ch || !world_provides(W, ch)) r = fail(ctx, "%s does not provide the channel \"%s\"", W->name, ch ? ch : "");
  else if (check_grants(ctx, W, hs, nh)) { charge_json(json ? strlen(json) : 0); kernel_publish(W, ch, json, hs, nh); }
  else r = JS_EXCEPTION;
  free(ch); free(json);
  return r;
}

static JSValue op_turn_async(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)ctx; (void)argc; (void)argv; W->turn_async = true; return JS_UNDEFINED; }
static JSValue op_turn_done(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!W->in_turn || W->turn_done) return JS_UNDEFINED;
  int hs[MAX_MSG_HANDLES], nh = int_list(ctx, argv, argc, 1, hs, MAX_MSG_HANDLES);
  if (!check_grants(ctx, W, hs, nh)) return JS_EXCEPTION;
  free(W->turn_result);
  W->turn_result = sarg(ctx, argv, argc, 0);
  memcpy(W->reply_hs, hs, sizeof(int) * nh); W->reply_nh = nh;
  W->turn_done = true;
  return JS_UNDEFINED;
}
static JSValue op_turn_fail(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!W->in_turn || W->turn_done) return JS_UNDEFINED;
  free(W->turn_error);
  W->turn_error = sarg(ctx, argv, argc, 0);
  W->turn_failed = true;
  return JS_UNDEFINED;
}
static JSValue op_turn_reject(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  free(W->turn_error);
  W->turn_error = sarg(ctx, argv, argc, 0);
  W->turn_rejected = true;
  return JS_UNDEFINED;
}

// ---- handles --------------------------------------------------------------------------------------------------
static char *handle_json(handle_t *h) {
  static const char *types[] = { "i2c", "spi", "dma", "epd", "adc", "gpio" };
  sbuf_t b = { 0 };
  sb_printf(&b, "{\"id\":%d,\"type\":\"%s\",\"rights\":\"%s%s%s\",\"claim\":", h->id, types[h->type],
            h->rights & R_READ ? "r" : "", h->rights & R_WRITE ? "w" : "", h->rights & R_GRANT ? "g" : "");
  sb_json_str(&b, h->claim);
  dmabuf_t *db = handle_buf(h);
  if (db) sb_printf(&b, ",\"w\":%d,\"h\":%d", db->w, db->h);
  sb_add(&b, "}");
  return b.s;
}
static JSValue handle_value(JSContext *ctx, handle_t *h) { return h ? json_value(ctx, handle_json(h)) : fail(ctx, "out of handles"); }

// "i2c1:0x5d": a device on one of the board's I2C buses
static JSValue op_hw_i2c(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  char *claim = sarg(ctx, argv, argc, 0);
  int hz = iarg(ctx, argv, argc, 1, 400000);
  char bus[16] = ""; unsigned addr = 0;
  const char *colon = claim ? strchr(claim, ':') : NULL;
  if (colon && colon - claim < (int)sizeof bus) { memcpy(bus, claim, (size_t)(colon - claim)); bus[colon - claim] = 0; }
  int bi = bus[0] ? bus_index(bus) : -1;
  JSValue r;
  if (!colon || strncmp(claim, "i2c", 3) || bi < 0 || sscanf(colon + 1, "%x", &addr) != 1) r = fail(ctx, "\"%s\" is not an i2c claim on this board (like \"i2c1:0x5d\")", claim ? claim : "");
  else if (!world_claims(W, claim)) r = fail(ctx, "%s has no claim on %s", W->name, claim);
  else {
    handle_t *h = handle_new(H_I2C, W, claim);
    if (h) { h->bus = bi; h->addr = (int)addr; h->hz = hz; }
    r = handle_value(ctx, h);
  }
  free(claim);
  return r;
}
// "epd0": the e-paper panel
static JSValue op_hw_epd(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  char *claim = sarg(ctx, argv, argc, 0);
  int bi = claim ? bus_index(claim) : -1;
  JSValue r;
  if (!claim || strncmp(claim, "epd", 3) || bi < 0) r = fail(ctx, "\"%s\" is not a panel on this board (it has \"epd0\")", claim ? claim : "");
  else if (!world_claims(W, claim)) r = fail(ctx, "%s has no claim on %s", W->name, claim);
  else { handle_t *h = handle_new(H_EPD, W, claim); if (h) h->bus = bi; r = handle_value(ctx, h); }
  free(claim);
  return r;
}
// "adc1:2": ADC unit 1, channel 2 (the battery on the PaperS3)
static JSValue op_hw_adc(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  char *claim = sarg(ctx, argv, argc, 0);
  int unit = 0, ch = 0;
  JSValue r;
  if (!claim || sscanf(claim, "adc%d:%d", &unit, &ch) != 2) r = fail(ctx, "\"%s\" is not an adc claim (like \"adc1:2\")", claim ? claim : "");
  else if (!world_claims(W, claim)) r = fail(ctx, "%s has no claim on %s", W->name, claim);
  else { handle_t *h = handle_new(H_ADC, W, claim); if (h) { h->addr = unit; h->hz = ch; } r = handle_value(ctx, h); }
  free(claim);
  return r;
}
// "gpio:4": one input pin
static JSValue op_hw_gpio(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  char *claim = sarg(ctx, argv, argc, 0);
  int pin = -1;
  JSValue r;
  if (!claim || sscanf(claim, "gpio:%d", &pin) != 1) r = fail(ctx, "\"%s\" is not a gpio claim (like \"gpio:4\")", claim ? claim : "");
  else if (!world_claims(W, claim)) r = fail(ctx, "%s has no claim on %s", W->name, claim);
  else { handle_t *h = handle_new(H_GPIO, W, claim); if (h) h->addr = pin; r = handle_value(ctx, h); }
  free(claim);
  return r;
}
static JSValue op_dma_alloc(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int w = iarg(ctx, argv, argc, 0, 540), h = iarg(ctx, argv, argc, 1, 960);
  if (!world_claims(W, "dma")) return fail(ctx, "%s has no claim on dma", W->name);
  if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return fail(ctx, "a framebuffer is at most 1024 x 1024");
  int b = dmabuf_alloc(w, h);
  if (b < 0) return fail(ctx, "out of framebuffers");
  handle_t *hd = handle_new(H_DMA, W, "dma");
  if (!hd) return fail(ctx, "out of handles");
  hd->buf = b;
  return handle_value(ctx, hd);
}

static handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right) {
  char err[160];
  handle_t *h = handle_use(W, id, type, right, err, sizeof err);
  if (!h) fail(ctx, "%s", err);
  return h;
}

static JSValue op_h_info(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int id = iarg(ctx, argv, argc, 0, 0);
  if (!world_holds(W, id)) return JS_NULL;
  handle_t *h = handle_find(id);
  return h ? json_value(ctx, handle_json(h)) : JS_NULL;
}
static JSValue op_h_attenuate(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), -1, 0);
  if (!h) return JS_EXCEPTION;
  char *r = sarg(ctx, argv, argc, 1);
  int rights = 0;
  for (char *p = r; p && *p; p++) rights |= *p == 'r' ? R_READ : *p == 'w' ? R_WRITE : *p == 'g' ? R_GRANT : 0;
  free(r);
  return handle_value(ctx, handle_child(W, h, rights));
}
static JSValue op_h_revoke(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int id = iarg(ctx, argv, argc, 0, 0);
  handle_t *h = handle_find(id);
  if (!h) return fail(ctx, "there is no handle %d", id);
  if (h->minter != W->id || !h->parent) return fail(ctx, "only the world that narrowed handle %d can revoke it", id);
  h->revoked = true;
  return JS_TRUE;
}
static JSValue op_h_release(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int id = iarg(ctx, argv, argc, 0, 0);
  handle_t *h = handle_find(id);
  if (h && world_holds(W, id)) { handle_release(h, W); return JS_TRUE; }
  return JS_FALSE;
}

static JSValue op_adc_read(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_ADC, R_READ);
  if (!h) return JS_EXCEPTION;
  return JS_NewInt32(ctx, port_adc_read_mv(h->addr, h->hz));
}
static JSValue op_gpio_get(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_GPIO, R_READ);
  if (!h) return JS_EXCEPTION;
  return JS_NewInt32(ctx, port_gpio_get(h->addr));
}
// h.watch(mode): the pin's interrupts arrive as "irq" messages (one at a time: the pin is re-armed when the turn
// that handled one ends); h.unwatch() stops them
static JSValue op_gpio_watch(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_GPIO, R_READ);
  if (!h) return JS_EXCEPTION;
  char *m = sarg(ctx, argv, argc, 1);
  int mode = !m ? 0 : !strcmp(m, "low") ? IRQ_LOW : !strcmp(m, "high") ? IRQ_HIGH : !strcmp(m, "falling") ? IRQ_FALLING : !strcmp(m, "rising") ? IRQ_RISING : 0;
  free(m);
  if (!mode) return fail(ctx, "watch takes \"low\", \"high\", \"falling\" or \"rising\"");
  if (hw_gpio_watch(h, mode)) return fail(ctx, "gpio %d cannot interrupt on this board", h->addr);
  return JS_UNDEFINED;
}
static JSValue op_gpio_unwatch(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_GPIO, R_READ);
  if (!h) return JS_EXCEPTION;
  hw_gpio_unwatch(h);
  return JS_UNDEFINED;
}
static JSValue op_epd_info(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_EPD, R_READ)) return JS_EXCEPTION;
  return json_value(ctx, port_epd_info());
}

// ---- pixels ----------------------------------------------------------------------------------------------------
static dmabuf_t *fb_arg(JSContext *ctx, world_t *W, JSValue *argv, int argc) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_DMA, R_WRITE);
  if (!h) return NULL;
  dmabuf_t *b = handle_buf(h);
  if (!b) fail(ctx, "the framebuffer is gone");
  return b;
}
static JSValue op_gfx_fill(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_fill(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
static JSValue op_gfx_rect(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_rect(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
static JSValue op_gfx_line(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_line(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
static JSValue op_gfx_text(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  pixel_t c = color_arg(ctx, argv, argc, 5);
  char *s = sarg(ctx, argv, argc, 3), *font = sarg(ctx, argv, argc, 4);
  int w = gfx_text(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), s ? s : "", gfx_font_index(font ? font : "m"), c, iarg(ctx, argv, argc, 6, 0));
  free(s); free(font);
  return JS_NewInt32(ctx, w);
}
static JSValue op_gfx_measure(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W;
  char *s = sarg(ctx, argv, argc, 0), *font = sarg(ctx, argv, argc, 1);
  int w = gfx_measure(s ? s : "", gfx_font_index(font ? font : "m"));
  free(s); free(font);
  return JS_NewInt32(ctx, w);
}
static JSValue op_gfx_wrap(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W;
  char *s = sarg(ctx, argv, argc, 0), *font = sarg(ctx, argv, argc, 1);
  char *json = gfx_wrap_json(s ? s : "", gfx_font_index(font ? font : "m"), iarg(ctx, argv, argc, 2, 100));
  free(s); free(font);
  return json_value(ctx, json);
}
static JSValue op_gfx_commit(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  int r[64 * 4];
  int n = gfx_commit(b, r, 64);
  sbuf_t j = { 0 };
  sb_add(&j, "[");
  for (int i = 0; i < n; i++) sb_printf(&j, "%s[%d,%d,%d,%d]", i ? "," : "", r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]);
  sb_add(&j, "]");
  return json_value(ctx, j.s);
}
static JSValue op_gfx_invalidate(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_invalidate(b);
  return JS_UNDEFINED;
}
static JSValue op_gfx_hash(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  return JS_NewFloat64(ctx, gfx_hash(b));
}
static JSValue op_gfx_fonts(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W; (void)argc; (void)argv;
  return json_value(ctx, gfx_fonts_json());
}

static JSValue op_sys_json(JSContext *ctx, world_t *W, const char *what, const char *fields) {
  if (!world_claims(W, "sys.read")) return fail(ctx, "%s has no claim on sys.read", W->name);
  char *j = !strcmp(what, "worlds") ? kernel_worlds_json_fields(fields) : !strcmp(what, "handles") ? hw_handles_json() : kernel_stats_json();
  charge_json(strlen(j));
  return json_value(ctx, j);
}
static JSValue op_sys_worlds(JSContext *ctx, world_t *W, int argc, JSValue *argv) {   // (fields): "name,state", or all
  char *fields = argc > 0 ? sarg(ctx, argv, argc, 0) : NULL;
  JSValue r = op_sys_json(ctx, W, "worlds", fields);
  free(fields);
  return r;
}
static JSValue op_sys_handles(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "handles", NULL); }
static JSValue op_sys_stats(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "stats", NULL); }

static void run_fault(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *T = world_by_id(d->w);
  if (T) kernel_fault(T, d->json);
  free(d->json);
}
static void run_restart(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *T = world_by_id(d->w);
  if (T) kernel_restart_world(T);
}
static JSValue op_sys_admin(JSContext *ctx, world_t *W, int argc, JSValue *argv, bool restart) {
  if (!world_claims(W, "sys.admin")) return fail(ctx, "%s has no claim on sys.admin", W->name);
  char *name = sarg(ctx, argv, argc, 0);
  world_t *T = name ? world_by_name(name) : NULL;
  free(name);
  if (!T) return fail(ctx, "there is no such world");
  deferred_t *d = calloc(1, sizeof(*d));
  d->w = T->id;
  if (restart) d->run = run_restart;
  else { char t[96]; snprintf(t, sizeof t, "killed by %s", W->name); d->run = run_fault; d->json = xstrdup(t); }
  defer(d);
  return JS_TRUE;
}
static JSValue op_sys_fault(JSContext *ctx, world_t *W, int argc, JSValue *argv) { return op_sys_admin(ctx, W, argc, argv, false); }
// timers.start(i) / timers.stop(i): the world's own declared timers
static JSValue op_timer_set(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int i = iarg(ctx, argv, argc, 0, -1);
  if (i < 0 || i >= W->n_every) return fail(ctx, "%s has no timer %d", W->name, i);
  kernel_timer_set(W, i, argc > 1 && argv[1] == JS_TRUE);   // the prelude passes a boolean
  return JS_UNDEFINED;
}
// sys.front(name): the compositor (the world that takes the "frames") says which world is on screen; only that one
// is rendered after its turns
static JSValue op_sys_front(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!world_needs(W, "frames")) return fail(ctx, "only the world that takes the frames says which world is in front");
  char *name = sarg(ctx, argv, argc, 0);
  world_t *T = name ? world_by_name(name) : NULL;
  free(name);
  if (!T) return fail(ctx, "no such world");
  if (K.front != T->id + 1) { free(T->frame); T->frame = NULL; }   // its next turn publishes a frame, even an unchanged one
  K.front = T->id + 1;
  return JS_UNDEFINED;
}
static JSValue op_sys_restart(JSContext *ctx, world_t *W, int argc, JSValue *argv) { return op_sys_admin(ctx, W, argc, argv, true); }

// the wall clock: what Date.now() reads; the clock driver sets it from the RTC (claim "sys.clock")
static double wall_offset_ms = WALL_BOOT_MS;
static JSValue op_clock_set(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!world_claims(W, "sys.clock")) return fail(ctx, "%s has no claim on sys.clock", W->name);
  wall_offset_ms = darg(ctx, argv, argc, 0, WALL_BOOT_MS) - kernel_now() / 1000.0;
  return JS_UNDEFINED;
}

static const struct { const char *name; op_fn fn; } SYNC_OPS[] = {
  { "gfx.text", op_gfx_text }, { "gfx.fill", op_gfx_fill }, { "gfx.rect", op_gfx_rect }, { "gfx.line", op_gfx_line },
  { "gfx.commit", op_gfx_commit }, { "gfx.fonts", op_gfx_fonts }, { "gfx.invalidate", op_gfx_invalidate }, { "gfx.hash", op_gfx_hash },
  { "gfx.measure", op_gfx_measure }, { "gfx.wrap", op_gfx_wrap },
  { "now", op_now }, { "send", op_send }, { "publish", op_publish }, { "log", op_log }, { "self", op_self }, { "seed", op_seed },
  { "engine", op_engine }, { "err.where", op_err_where }, { "clock.set", op_clock_set },
  { "turn.async", op_turn_async }, { "turn.done", op_turn_done }, { "turn.fail", op_turn_fail }, { "turn.reject", op_turn_reject },
  { "hw.i2c", op_hw_i2c }, { "hw.epd", op_hw_epd }, { "hw.adc", op_hw_adc }, { "hw.gpio", op_hw_gpio }, { "dma.alloc", op_dma_alloc },
  { "h.info", op_h_info }, { "h.attenuate", op_h_attenuate }, { "h.revoke", op_h_revoke }, { "h.release", op_h_release },
  { "adc.read", op_adc_read }, { "gpio.get", op_gpio_get }, { "gpio.watch", op_gpio_watch }, { "gpio.unwatch", op_gpio_unwatch },
  { "epd.info", op_epd_info },
  { "sys.worlds", op_sys_worlds }, { "sys.handles", op_sys_handles }, { "sys.stats", op_sys_stats },
  { "sys.fault", op_sys_fault }, { "sys.restart", op_sys_restart }, { "sys.front", op_sys_front }, { "timer.set", op_timer_set },
};

#define N_SYNC_OPS (sizeof SYNC_OPS / sizeof SYNC_OPS[0])
static const char *ASYNC_OPS[] = { "sleep", "ask", "i2c", "epd.update" };
#define N_ASYNC_OPS (sizeof ASYNC_OPS / sizeof ASYNC_OPS[0])

// Time spent in each host operation, from the call into C (name lookup included) to its return. Real-time mode
// only, like the kernel's prof counters, so host captures cannot change.
static op_prof_t op_prof[N_SYNC_OPS + N_ASYNC_OPS];
int vm_op_prof(const op_prof_t **out) {
  for (size_t i = 0; i < N_SYNC_OPS + N_ASYNC_OPS; i++) op_prof[i].name = i < N_SYNC_OPS ? SYNC_OPS[i].name : ASYNC_OPS[i - N_SYNC_OPS];
  *out = op_prof;
  return (int)(N_SYNC_OPS + N_ASYNC_OPS);
}
void vm_op_prof_reset(void) { memset(op_prof, 0, sizeof op_prof); }
static void op_prof_add(size_t i, vtime_t t0) { if (K.realtime) { op_prof[i].us += port_clock() - t0; op_prof[i].n++; } }

JSValue js_nucleus_k(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
  (void)this_val;
  argc &= ~FRAME_CF_CTOR;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__k needs an operation");
  vtime_t t0 = K.realtime ? port_clock() : 0;
  char *op = sarg(ctx, argv, argc, 0);
  for (size_t i = 0; op && i < N_SYNC_OPS; i++)
    if (!strcmp(op, SYNC_OPS[i].name)) {
      free(op);
      K.seg_cost += 1;   // a host call costs about a microsecond
      JSValue r = SYNC_OPS[i].fn(ctx, W, argc - 1, argv + 1);
      op_prof_add(i, t0);
      return r;
    }
  JSValue r = fail(ctx, "no such kernel operation: %s", op ? op : "?");
  free(op);
  return r;
}

// ---- async operations: each returns a promise id the kernel settles later through __settle ---------------------
static void run_epd(deferred_t *d, vtime_t at) { bus_run_epd(d, at); }

JSValue js_nucleus_ka(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
  (void)this_val;
  argc &= ~FRAME_CF_CTOR;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__ka needs an operation");
  vtime_t t0 = K.realtime ? port_clock() : 0;
  char *op = sarg(ctx, argv, argc, 0);
  argc--; argv++;
  K.seg_cost += 1;
  JSValue r;
  int id = ++K.next_promise;
  if (!op) r = fail(ctx, "__ka needs an operation");
  else if (!strcmp(op, "sleep")) {
    defer_settle(W, id, 1, NULL, (vtime_t)(darg(ctx, argv, argc, 0, 0) * 1000));
    r = JS_NewInt32(ctx, id);
  } else if (!strcmp(op, "ask")) {
    int hs[MAX_MSG_HANDLES], nh = int_list(ctx, argv, argc, 3, hs, MAX_MSG_HANDLES);
    double timeout = darg(ctx, argv, argc, 4, 2000);
    char *to = sarg(ctx, argv, argc, 0), *type = sarg(ctx, argv, argc, 1), *json = sarg(ctx, argv, argc, 2);
    world_t *T = to ? world_by_name(to) : NULL;
    if (!T) r = fail(ctx, "there is no world called \"%s\"", to ? to : "");
    else if (T == W) r = fail(ctx, "a world cannot ask itself (it would wait for its own turn to end)");
    else if (!check_grants(ctx, W, hs, nh)) r = JS_EXCEPTION;
    else { charge_json(json ? strlen(json) : 0); kernel_ask(W, T, type, json, hs, nh, id, (vtime_t)(timeout * 1000)); r = JS_NewInt32(ctx, id); }
    free(to); free(type); free(json);
  } else if (!strcmp(op, "i2c")) {
    int wr[64], nwr = int_list(ctx, argv, argc, 1, wr, 64), nrd = iarg(ctx, argv, argc, 2, 0);
    vtime_t gap = (vtime_t)(darg(ctx, argv, argc, 3, 0) * 1000);
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_I2C, R_WRITE);
    if (!h) r = JS_EXCEPTION;
    else if (nrd > 64) r = fail(ctx, "an i2c read is at most 64 bytes");
    else {
      uint8_t b[64];
      for (int i = 0; i < nwr; i++) b[i] = (uint8_t)wr[i];
      hw_i2c(W, h, b, nwr, nrd, gap, id);
      r = JS_NewInt32(ctx, id);
    }
  } else if (!strcmp(op, "epd.update")) {
    // (epd, fb, x, y, w, h, mode): the rectangle of the framebuffer's front buffer, in that waveform mode
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_EPD, R_WRITE);
    handle_t *fb = h ? use(ctx, W, iarg(ctx, argv, argc, 1, 0), H_DMA, R_READ) : NULL;
    char *mode = fb ? sarg(ctx, argv, argc, 6) : NULL;
    int m = mode ? epd_mode_index(mode) : -1;
    if (!h || !fb) r = JS_EXCEPTION;
    else if (m < 0) r = fail(ctx, "\"%s\" is not a refresh mode (quality, text, fast, fastest)", mode ? mode : "");
    else {
      deferred_t *d = calloc(1, sizeof(*d));
      d->run = run_epd; d->w = W->id; d->epoch = W->epoch; d->promise = id; d->handle = h->id; d->fb = fb->id; d->op = m;
      d->x = iarg(ctx, argv, argc, 2, 0); d->y = iarg(ctx, argv, argc, 3, 0); d->wd = iarg(ctx, argv, argc, 4, 0); d->ht = iarg(ctx, argv, argc, 5, 0);
      defer(d);
      r = JS_NewInt32(ctx, id);
    }
    free(mode);
  } else r = fail(ctx, "no such kernel operation: %s", op);
  for (size_t i = 0; op && i < N_ASYNC_OPS; i++) if (!strcmp(op, ASYNC_OPS[i])) op_prof_add(N_SYNC_OPS + i, t0);
  free(op);
  return r;
}

// ---- calls into the world -----------------------------------------------------------------------------------------
// Push args (already made: ints, bools, null) and string args, then call the global fn. Strings are made one at a
// time after the values before them are on the stack, where the collector sees them.
typedef struct { int kind; double num; const char *str; } arg_t;   // kind: 0 number, 1 string (NULL: null), 2 bool
static JSValue call_global(world_t *W, const char *fn, const arg_t *args, int n) {
  JSContext *ctx = W->vm->ctx;
  if (JS_StackCheck(ctx, n + 2)) return JS_EXCEPTION;
  for (int i = n - 1; i >= 0; i--) {
    JSValue v;
    if (args[i].kind == 1) v = args[i].str ? JS_NewString(ctx, args[i].str) : JS_NULL;
    else if (args[i].kind == 2) v = JS_NewBool(args[i].num != 0);
    else v = JS_NewFloat64(ctx, args[i].num);
    if (JS_IsException(v)) return v;
    JS_PushArg(ctx, v);
  }
  JSValue f = JS_GetPropertyStr(ctx, JS_GetGlobalObject(ctx), fn);
  if (!JS_IsFunction(ctx, f)) return JS_ThrowError(ctx, JS_CLASS_TYPE_ERROR, "the prelude did not define %s", fn);
  JS_PushArg(ctx, f);
  JS_PushArg(ctx, JS_NULL);
  return JS_Call(ctx, n);
}
static char *string_result(JSContext *ctx, JSValue r) {   // a copy of a string result, or NULL
  if (!JS_IsString(ctx, r)) return NULL;
  JSCStringBuf cb; size_t n;
  const char *s = JS_ToCStringLen(ctx, &n, r, &cb);
  char *c = malloc(n + 1);
  memcpy(c, s, n); c[n] = 0;
  return c;
}

static int eval_file(world_t *W, const char *src, size_t n, const char *name) {
  JSValue r = JS_Eval(W->vm->ctx, src, n, name, 0);
  if (JS_IsException(r)) { set_error(W); return -1; }
  return 0;
}

static void read_list(JSContext *ctx, JSValue *meta, const char *key, char (*dst)[NAME_LEN], int *n) {
  *n = 0;
  JSValue a = JS_GetPropertyStr(ctx, *meta, key);
  if (!JS_IsPtr(a) || JS_GetClassID(ctx, a) != JS_CLASS_ARRAY) return;
  int len = 0; JS_ToInt32(ctx, &len, JS_GetPropertyStr(ctx, a, "length"));
  for (int i = 0; i < len && i < MAX_LIST; i++) {
    a = JS_GetPropertyStr(ctx, *meta, key);   // re-read: a string conversion may have moved the array
    JSValue e = JS_GetPropertyUint32(ctx, a, (uint32_t)i);
    JSCStringBuf cb;
    const char *s = JS_ToCString(ctx, e, &cb);
    snprintf(dst[(*n)++], NAME_LEN, "%s", s ? s : "");
  }
}

static int read_meta(world_t *W, JSValue *meta) {
  JSContext *ctx = W->vm->ctx;
  read_list(ctx, meta, "needs", W->needs, &W->n_needs);
  read_list(ctx, meta, "provides", W->provides, &W->n_provides);
  W->n_every = 0;
  JSValue ev = JS_GetPropertyStr(ctx, *meta, "every");
  if (JS_IsPtr(ev) && JS_GetClassID(ctx, ev) == JS_CLASS_ARRAY) {
    int len = 0; JS_ToInt32(ctx, &len, JS_GetPropertyStr(ctx, ev, "length"));
    for (int i = 0; i < len && i < MAX_LIST; i++) { int x = 0; JS_ToInt32(ctx, &x, JS_GetPropertyUint32(ctx, ev, (uint32_t)i)); W->every_ms[W->n_every++] = x; }
  }
  JSValue pz = JS_GetPropertyStr(ctx, *meta, "paused");   // timers declared { paused: true } start stopped
  for (int i = 0; i < W->n_every; i++) W->timer_off[i] = JS_IsPtr(pz) && JS_GetPropertyUint32(ctx, pz, (uint32_t)i) == JS_TRUE;
  W->has_start = JS_GetPropertyStr(ctx, *meta, "start") == JS_TRUE;
  W->has_screen = JS_GetPropertyStr(ctx, *meta, "screen") == JS_TRUE;
  JSCStringBuf cb;
  const char *s = JS_ToCString(ctx, JS_GetPropertyStr(ctx, *meta, "kind"), &cb);
  snprintf(W->kind, sizeof W->kind, "%s", s ? s : "world");
  s = JS_ToCString(ctx, JS_GetPropertyStr(ctx, *meta, "title"), &cb);
  snprintf(W->title, sizeof W->title, "%s", s ? s : W->name);
  return 0;
}

// ---- lifecycle ----------------------------------------------------------------------------------------------
static size_t arena_size(world_t *W) { return (size_t)((double)W->mem_limit * PROFILE.mem_scale); }

int vm_create(world_t *W) {
  W->oom = false; W->interrupts = 0; W->mem_used = 0;
  W->vm = calloc(1, sizeof(*W->vm));
  W->vm->size = arena_size(W);
  W->vm->arena = port_heap_malloc(W->vm->size);
  if (!W->vm->arena) { snprintf(W->last_error, sizeof W->last_error, "no memory for a %zu KB arena", W->mem_limit / 1024); return -1; }
  JSContext *ctx = W->vm->ctx = JS_NewContext(W->vm->arena, W->vm->size, &js_stdlib);
  if (!ctx) { snprintf(W->last_error, sizeof W->last_error, "could not make a context within %zu KB", W->mem_limit / 1024); return -1; }
  JS_SetContextOpaque(ctx, W);
  JS_SetInterruptHandler(ctx, on_interrupt);
  JS_SetLogFunc(ctx, log_write);
  JS_SetRandomSeed(ctx, W->seed);
  vm_begin_segment(W, MS(600));   // booting may take longer than a turn
  int rc = eval_file(W, K.prelude, K.prelude_len, "prelude.js");
  if (!rc) rc = eval_file(W, W->source, strlen(W->source), W->file);
  if (!rc) {
    JSGCRef meta_ref;
    JSValue *meta = JS_PushGCRef(ctx, &meta_ref);
    *meta = call_global(W, "__init", NULL, 0);
    if (JS_IsException(*meta)) { set_error(W); rc = -1; }
    else read_meta(W, meta);
    JS_PopGCRef(ctx, &meta_ref);
  }
  if (W->oom || (rc && strstr(W->last_error, "out of memory"))) {
    W->oom = true;
    snprintf(W->last_error, sizeof W->last_error, "ran out of memory while starting (its limit is %zu KB)", W->mem_limit / 1024);
  }
  if (!rc) JS_GC(ctx);   // what starting left live, so the first figure means something
  note_memory(W);
  return rc;
}

void vm_dispose(world_t *W) {
  if (!W->vm) return;
  if (W->vm->ctx) JS_FreeContext(W->vm->ctx);
  port_heap_free(W->vm->arena);
  free(W->vm);
  W->vm = NULL;
}

int vm_dispatch(world_t *W, msg_t *m) {
  JSContext *ctx = W->vm->ctx;
  world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
  if (m->json) charge_json(strlen(m->json));
  arg_t a[5] = {
    { 0, m->kind == M_IRQ ? M_ON : m->kind, NULL },   // to the world an interrupt is an ordinary message, "irq"
    m->kind == M_TICK ? (arg_t){ 0, m->timer, NULL } : (arg_t){ 1, 0, m->type ? m->type : "" },
    { 1, 0, m->json },
    { 1, 0, F ? F->name : NULL },
    { 2, m->ask != 0, NULL },
  };
  JSValue r = call_global(W, "__dispatch", a, 5);
  int rc = 0;
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  else if (!W->turn_async && !W->turn_rejected && !W->turn_done) {
    W->turn_done = true;
    free(W->turn_result);
    W->turn_result = string_result(ctx, r);
  }
  note_memory(W);
  return rc;
}

int vm_settle(world_t *W, settle_t *s) {
  arg_t a[3] = { { 0, s->promise, NULL }, { 2, s->ok, NULL }, { 1, 0, s->json } };
  if (s->json) charge_json(strlen(s->json));
  JSValue r = call_global(W, "__settle", a, 3);
  int rc = 0;
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  note_memory(W);
  return rc;
}

char *vm_render(world_t *W) {
  JSValue r = call_global(W, "__render", NULL, 0);
  if (JS_IsException(r)) { set_error(W); W->turn_failed = true; free(W->turn_error); W->turn_error = xstrdup(W->last_error); return NULL; }
  char *out = string_result(W->vm->ctx, r);
  if (out) charge_json(strlen(out));
  note_memory(W);
  return out;
}

// ---- the manifest: parsed in a scratch context ----------------------------------------------------------------
static int get_str(JSContext *ctx, JSValue *o, const char *key, char *dst, size_t n) {
  JSValue v = JS_GetPropertyStr(ctx, *o, key);
  if (JS_IsUndefined(v)) return 0;
  JSCStringBuf cb;
  const char *s = JS_ToCString(ctx, v, &cb);
  snprintf(dst, n, "%s", s ? s : "");
  return 1;
}
static int get_num(JSContext *ctx, JSValue *o, const char *key, double *d) {
  JSValue v = JS_GetPropertyStr(ctx, *o, key);
  if (JS_IsUndefined(v)) return 0;
  return !JS_ToNumber(ctx, d, v);
}

int vm_read_manifest(const char *json, size_t n, const char *path, int (*add)(void *arg, const manifest_world_t *w), void *arg) {
  size_t size = 64 * 1024 + n * 16;
  uint8_t *mem = port_heap_malloc(size);   // a temporary arena, from the worlds' allocator (PSRAM on the device)
  if (!mem) { fprintf(stderr, "%s: no memory to read the manifest (%u KB)\n", path, (unsigned)(size / 1024)); return -1; }
  JSContext *ctx = JS_NewContext(mem, size, &js_stdlib);
  JS_SetLogFunc(ctx, log_write);
  char *txt = malloc(n + 1); memcpy(txt, json, n); txt[n] = 0;   // the parser wants a terminating NUL
  JSGCRef root_ref, w_ref;
  JSValue *root = JS_PushGCRef(ctx, &root_ref), *w = JS_PushGCRef(ctx, &w_ref);
  *root = JS_Parse(ctx, txt, n, path, JS_EVAL_JSON);
  free(txt);
  int rc = 0;
  if (JS_IsException(*root)) { char b[512]; exception_text(ctx, b, sizeof b); fprintf(stderr, "%s: %s\n", path, b); rc = -1; }
  int count = 0;
  if (!rc) { JSValue ws = JS_GetPropertyStr(ctx, *root, "worlds"); JS_ToInt32(ctx, &count, JS_GetPropertyStr(ctx, ws, "length")); }
  for (int i = 0; !rc && i < count; i++) {
    *w = JS_GetPropertyUint32(ctx, JS_GetPropertyStr(ctx, *root, "worlds"), (uint32_t)i);
    manifest_world_t mw = { 0 };
    if (!get_str(ctx, w, "name", mw.name, sizeof mw.name)) snprintf(mw.name, sizeof mw.name, "?");
    if (!get_str(ctx, w, "file", mw.file, sizeof mw.file)) snprintf(mw.file, sizeof mw.file, "?");
    mw.has_budget = get_num(ctx, w, "budget_ms", &mw.budget_ms);
    mw.has_mem = get_num(ctx, w, "mem_kb", &mw.mem_kb);
    mw.has_prio = get_num(ctx, w, "priority", &mw.priority);
    int nc = 0;
    JS_ToInt32(ctx, &nc, JS_GetPropertyStr(ctx, JS_GetPropertyStr(ctx, *w, "claims"), "length"));
    for (int k = 0; k < nc && k < MAX_LIST; k++) {
      JSValue e = JS_GetPropertyUint32(ctx, JS_GetPropertyStr(ctx, *w, "claims"), (uint32_t)k);
      JSCStringBuf cb;
      const char *s = JS_ToCString(ctx, e, &cb);
      snprintf(mw.claims[mw.n_claims++], NAME_LEN, "%s", s ? s : "");
    }
    if (add(arg, &mw)) rc = -1;
  }
  JS_PopGCRef(ctx, &w_ref); JS_PopGCRef(ctx, &root_ref);
  JS_FreeContext(ctx);
  port_heap_free(mem);
  return rc;
}

// ---- calibration: the same loops as vm.c, counted in steps -----------------------------------------------------
static int count_interrupt(JSContext *ctx, void *o) { (void)ctx; (*(int64_t *)o)++; return 0; }
static int64_t count_steps(const char *src, double *real_ms) {
  size_t size = 64 * 1024;
  uint8_t *mem = port_heap_malloc(size);
  *real_ms = 0;
  if (!mem) return 0;   // no calibration: the profile's estimate stands
  JSContext *ctx = JS_NewContext(mem, size, &js_stdlib);
  int64_t n = 0;
  JS_SetContextOpaque(ctx, &n);
  JS_SetInterruptHandler(ctx, count_interrupt);
  int c0 = JS_GetInterruptCounter(ctx);
  vtime_t t0 = K.realtime ? port_clock() : 0;
  JS_Eval(ctx, src, strlen(src), "calibrate.js", JS_EVAL_RETVAL);
  *real_ms = K.realtime ? (port_clock() - t0) / 1000.0 : 0;
  int64_t steps = n * JS_GetInterruptCounterInit() + c0 - JS_GetInterruptCounter(ctx);
  JS_FreeContext(ctx);
  port_heap_free(mem);
  return steps;
}
double vm_fib20_ms;
void vm_calibrate(void) {
  double loop_ms, fib_ms;
  int64_t loop = count_steps("(function(){var s=0; for(var i=0;i<100000;i++) s+=i; return s;})()", &loop_ms);
  int64_t fib = count_steps("(function(){function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()", &fib_ms);
  if (loop > 0) PROFILE.ns_per_step = PROFILE.loop_ms * 1e6 / (double)loop;
  vm_fib20_ms = fib * PROFILE.ns_per_step / 1e6;
  if (K.verbose) fprintf(stderr, "calibration: the 100k loop is %lld steps, so a step is %.0f virtual ns; fib(20) is %lld steps = %.1f virtual ms\n",
                         (long long)loop, PROFILE.ns_per_step, (long long)fib, vm_fib20_ms);
  if (K.realtime) klog("calibration on the real clock: the 100k loop took %.1f ms (the model says %.0f), fib(20) %.1f ms (the model says %.1f)",
                       loop_ms, (double)PROFILE.loop_ms, fib_ms, vm_fib20_ms);
}

// Date.now(): the wall clock (the RTC's time once the clock driver has read it)
JSValue js_date_now(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
  (void)this_val; (void)argc; (void)argv;
  return JS_NewFloat64(ctx, wall_offset_ms + kernel_now() / 1000.0);
}

#include "mqjs_stdlib.h"

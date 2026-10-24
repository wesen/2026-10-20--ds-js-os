// One QuickJS runtime per world: its own heap (with a hard limit), its own job queue, and an interrupt
// handler that counts the work a turn does and stops it at its budget. The host functions here are
// the only way out of a world: __k(op, ...) for things that finish now, __ka(op, ...) for things that
// finish later and return a promise. The prelude (js/prelude.js) wraps them in the API worlds use.
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

// ---- the allocator: per-world accounting and limit (the blocks come from the port's world heap) ----------
static size_t host_limit(world_t *W) { return (size_t)((double)W->mem_limit * PROFILE.mem_scale); }

static void *w_malloc(JSMallocState *s, size_t size) {
  world_t *W = s->opaque;
  if (W->mem_used + size > host_limit(W)) { W->oom = true; return NULL; }
  void *p = port_heap_malloc(size);
  if (!p) return NULL;
  size_t u = port_heap_usable(p) + 8;
  W->mem_used += u; s->malloc_size += u; s->malloc_count++;
  return p;
}
static void w_free(JSMallocState *s, void *p) {
  if (!p) return;
  world_t *W = s->opaque;
  size_t u = port_heap_usable(p) + 8;
  W->mem_used -= u; s->malloc_size -= u; s->malloc_count--;
  port_heap_free(p);
}
static void *w_realloc(JSMallocState *s, void *p, size_t size) {
  world_t *W = s->opaque;
  if (!p) return size ? w_malloc(s, size) : NULL;
  size_t old = port_heap_usable(p) + 8;
  if (!size) { w_free(s, p); return NULL; }
  if (W->mem_used - old + size > host_limit(W)) { W->oom = true; return NULL; }
  void *q = port_heap_realloc(p, size);
  if (!q) return NULL;
  size_t u = port_heap_usable(q) + 8;
  W->mem_used = W->mem_used - old + u; s->malloc_size = s->malloc_size - old + u;
  return q;
}
static size_t w_usable(const void *p) { return port_heap_usable(p); }
static const JSMallocFunctions MF = { w_malloc, w_free, w_realloc, w_usable };

// ---- work counting ------------------------------------------------------------------------------------------
static int on_interrupt(JSRuntime *rt, void *opaque) {
  (void)rt;
  world_t *W = opaque;
  W->interrupts++;
  if (W->oom) return 1;
  if (K.realtime ? port_clock() > W->seg_deadline : W->interrupts - W->seg_interrupts0 > W->budget_interrupts) { W->overrun = true; return 1; }
  return 0;
}

void vm_begin_segment(world_t *W, vtime_t budget_us) {
  W->seg_interrupts0 = W->interrupts;
  W->seg_counter0 = W->ctx ? JS_GetInterruptCounter(W->ctx) : JS_GetInterruptCounterInit();
  W->budget_interrupts = (int64_t)((double)budget_us * 1000.0 / (PROFILE.ns_per_step * JS_GetInterruptCounterInit())) + 1;
  W->seg_deadline = K.realtime ? port_clock() + budget_us : VT_INF;
  W->overrun = false;
}

int64_t vm_steps(world_t *W) {
  if (!W->ctx) return 0;
  return (W->interrupts - W->seg_interrupts0) * JS_GetInterruptCounterInit() + W->seg_counter0 - JS_GetInterruptCounter(W->ctx);
}

// ---- errors --------------------------------------------------------------------------------------------------
// The exception as "message (file:line)", with the stack after a newline.
const char *vm_exception(JSContext *ctx, char *buf, size_t n) {
  JSValue e = JS_GetException(ctx);
  const char *msg = NULL, *stack = NULL;
  JSValue sv = JS_UNDEFINED;
  if (JS_IsError(ctx, e)) {
    JSValue mv = JS_GetPropertyStr(ctx, e, "message"), nv = JS_GetPropertyStr(ctx, e, "name");
    const char *m = JS_ToCString(ctx, mv), *nm = JS_ToCString(ctx, nv);
    char t[400];
    snprintf(t, sizeof t, "%s%s%s", (nm && strcmp(nm, "Error")) ? nm : "", (nm && strcmp(nm, "Error")) ? ": " : "", m ? m : "");
    msg = xstrdup(t);
    JS_FreeCString(ctx, m); JS_FreeCString(ctx, nm); JS_FreeValue(ctx, mv); JS_FreeValue(ctx, nv);
    sv = JS_GetPropertyStr(ctx, e, "stack");
    if (JS_IsString(sv)) stack = JS_ToCString(ctx, sv);
  } else {
    const char *m = JS_ToCString(ctx, e);
    msg = xstrdup(m ? m : "exception");
    JS_FreeCString(ctx, m);
  }
  // the first stack frame that is not the prelude
  char where[128] = "";
  if (stack) {
    const char *p = stack;
    while ((p = strstr(p, "at "))) {
      const char *open = strchr(p, '('), *nl = strchr(p, '\n');
      const char *close = open ? strchr(open, ')') : NULL;
      if (open && close && (!nl || close < nl) && strncmp(open + 1, "prelude.js", 10) && strncmp(open + 1, "<kernel>", 8)) {
        snprintf(where, sizeof where, " (%.*s)", (int)(close - open - 1), open + 1);
        break;
      }
      p += 3;
    }
  }
  snprintf(buf, n, "%s%s%s%s", msg, where, stack ? "\n" : "", stack ? stack : "");
  free((void *)msg);
  if (stack) JS_FreeCString(ctx, stack);
  JS_FreeValue(ctx, sv);
  JS_FreeValue(ctx, e);
  return buf;
}

static void set_error(world_t *W) {
  char b[2048];
  vm_exception(W->ctx, b, sizeof b);
  char *nl = strchr(b, '\n');
  free(W->trace);
  W->trace = nl ? xstrdup(nl + 1) : NULL;
  if (nl) *nl = 0;
  snprintf(W->last_error, sizeof W->last_error, "%s", b);
}

// ---- argument helpers ---------------------------------------------------------------------------------------
static int iarg(JSContext *ctx, JSValueConst *argv, int argc, int i, int def) {
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return def;
  double d; if (JS_ToFloat64(ctx, &d, argv[i])) return def;
  return (int)d;
}
static double darg(JSContext *ctx, JSValueConst *argv, int argc, int i, double def) {
  if (i >= argc || JS_IsUndefined(argv[i])) return def;
  double d; if (JS_ToFloat64(ctx, &d, argv[i])) return def;
  return d;
}
static char *sarg(JSContext *ctx, JSValueConst *argv, int argc, int i) {   // a copy, or NULL
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return NULL;
  const char *s = JS_ToCString(ctx, argv[i]);
  char *c = xstrdup(s ? s : "");
  JS_FreeCString(ctx, s);
  return c;
}
static int int_list(JSContext *ctx, JSValueConst v, int *out, int max) {
  if (!JS_IsArray(ctx, v)) return 0;
  JSValue lv = JS_GetPropertyStr(ctx, v, "length");
  int32_t n = 0; JS_ToInt32(ctx, &n, lv); JS_FreeValue(ctx, lv);
  if (n > max) n = max;
  for (int i = 0; i < n; i++) { JSValue e = JS_GetPropertyUint32(ctx, v, (uint32_t)i); int32_t x = 0; JS_ToInt32(ctx, &x, e); out[i] = x; JS_FreeValue(ctx, e); }
  return n;
}
static uint16_t color_arg(JSContext *ctx, JSValueConst *argv, int argc, int i) {
  if (i < argc && JS_IsString(argv[i])) { const char *s = JS_ToCString(ctx, argv[i]); uint16_t c = gfx_color(s); JS_FreeCString(ctx, s); return c; }
  return (uint16_t)iarg(ctx, argv, argc, i, 0);
}
static JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static JSValue fail(JSContext *ctx, const char *fmt, ...) {
  char b[256]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  JSValue e = JS_NewError(ctx);
  JS_SetPropertyStr(ctx, e, "message", JS_NewString(ctx, b));
  return JS_Throw(ctx, e);
}
static JSValue json_value(JSContext *ctx, char *json) {   // takes ownership
  if (!json) return JS_NULL;
  JSValue v = JS_ParseJSON(ctx, json, strlen(json), "<kernel>");
  free(json);
  return v;
}
static void charge_json(size_t n) { K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); }

// handles named in a message must be held by the sender, and passable
static bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh) {
  char err[160];
  for (int i = 0; i < nh; i++) {
    handle_t *h = handle_use(W, hs[i], -1, 0, err, sizeof err);
    if (!h) { fail(ctx, "%s", err); return false; }
    // a handle can be passed on if it carries the grant right, or by the world that narrowed it
    if (!(h->rights & R_GRANT) && h->minter != W->id) { fail(ctx, "handle %d cannot be passed on by %s", hs[i], W->name); return false; }
  }
  return true;
}

#define WORLD (world_t *)JS_GetContextOpaque(ctx)
typedef JSValue (*op_fn)(JSContext *ctx, world_t *W, int argc, JSValueConst *argv);

// ---- sync operations -----------------------------------------------------------------------------------------
static JSValue op_now(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)W; (void)argc; (void)argv;
  return JS_NewFloat64(ctx, kernel_now() / 1000.0);
}
static JSValue op_self(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return JS_NewString(ctx, W->name); }
static JSValue op_seed(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return JS_NewFloat64(ctx, (double)(W->seed & 0xffffffff)); }
static JSValue op_log(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *s = sarg(ctx, argv, argc, 0);
  klog("%s: %s", W->name, s ? s : "");
  free(s);
  return JS_UNDEFINED;
}

static JSValue op_send(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *to = sarg(ctx, argv, argc, 0), *type = sarg(ctx, argv, argc, 1), *json = sarg(ctx, argv, argc, 2);
  int hs[MAX_MSG_HANDLES], nh = argc > 3 ? int_list(ctx, argv[3], hs, MAX_MSG_HANDLES) : 0;
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

static JSValue op_publish(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *ch = sarg(ctx, argv, argc, 0), *json = sarg(ctx, argv, argc, 1);
  int hs[MAX_MSG_HANDLES], nh = argc > 2 ? int_list(ctx, argv[2], hs, MAX_MSG_HANDLES) : 0;
  JSValue r = JS_UNDEFINED;
  if (!ch || !world_provides(W, ch)) r = fail(ctx, "%s does not provide the channel \"%s\"", W->name, ch ? ch : "");
  else if (check_grants(ctx, W, hs, nh)) { charge_json(json ? strlen(json) : 0); kernel_publish(W, ch, json, hs, nh); }
  else r = JS_EXCEPTION;
  free(ch); free(json);
  return r;
}

static JSValue op_turn_async(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)ctx; (void)argc; (void)argv; W->turn_async = true; return JS_UNDEFINED; }
static JSValue op_turn_done(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!W->in_turn || W->turn_done) return JS_UNDEFINED;
  int hs[MAX_MSG_HANDLES], nh = argc > 1 ? int_list(ctx, argv[1], hs, MAX_MSG_HANDLES) : 0;
  if (!check_grants(ctx, W, hs, nh)) return JS_EXCEPTION;
  free(W->turn_result);
  W->turn_result = sarg(ctx, argv, argc, 0);
  memcpy(W->reply_hs, hs, sizeof(int) * nh); W->reply_nh = nh;
  W->turn_done = true;
  return JS_UNDEFINED;
}
static JSValue op_turn_fail(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!W->in_turn || W->turn_done) return JS_UNDEFINED;
  free(W->turn_error);
  W->turn_error = sarg(ctx, argv, argc, 0);
  W->turn_failed = true;
  return JS_UNDEFINED;
}
static JSValue op_turn_reject(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {   // an ask the world cannot answer; it does not crash
  free(W->turn_error);
  W->turn_error = sarg(ctx, argv, argc, 0);
  W->turn_rejected = true;
  return JS_UNDEFINED;
}

static JSValue handle_info(JSContext *ctx, handle_t *h) {
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "id", JS_NewInt32(ctx, h->id));
  JS_SetPropertyStr(ctx, o, "type", JS_NewString(ctx, h->type == H_I2C ? "i2c" : h->type == H_SPI ? "spi" : "dma"));
  char r[4] = { 0 }; int k = 0;
  if (h->rights & R_READ) r[k++] = 'r';
  if (h->rights & R_WRITE) r[k++] = 'w';
  if (h->rights & R_GRANT) r[k++] = 'g';
  JS_SetPropertyStr(ctx, o, "rights", JS_NewString(ctx, r));
  JS_SetPropertyStr(ctx, o, "claim", JS_NewString(ctx, h->claim));
  dmabuf_t *b = handle_buf(h);
  if (b) { JS_SetPropertyStr(ctx, o, "w", JS_NewInt32(ctx, b->w)); JS_SetPropertyStr(ctx, o, "h", JS_NewInt32(ctx, b->h)); }
  return o;
}

static JSValue op_hw_i2c(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *claim = sarg(ctx, argv, argc, 0);
  int hz = iarg(ctx, argv, argc, 1, 10000);
  JSValue r;
  unsigned addr = 0;
  if (!claim || strncmp(claim, "i2c0:", 5) || sscanf(claim + 5, "%x", &addr) != 1) r = fail(ctx, "\"%s\" is not an i2c claim (like \"i2c0:0x1f\")", claim ? claim : "");
  else if (!world_claims(W, claim)) r = fail(ctx, "%s has no claim on %s", W->name, claim);
  else {
    handle_t *h = handle_new(H_I2C, W, claim);
    if (!h) r = fail(ctx, "out of handles");
    else { h->bus = BUS_I2C0; h->addr = (int)addr; h->hz = hz; r = handle_info(ctx, h); }
  }
  free(claim);
  return r;
}
static JSValue op_hw_spi(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *claim = sarg(ctx, argv, argc, 0);
  int hz = iarg(ctx, argv, argc, 1, 40000000);
  JSValue r;
  if (!claim || strcmp(claim, "spi2")) r = fail(ctx, "\"%s\" is not an spi claim (the panel is on \"spi2\")", claim ? claim : "");
  else if (!world_claims(W, claim)) r = fail(ctx, "%s has no claim on %s", W->name, claim);
  else {
    handle_t *h = handle_new(H_SPI, W, claim);
    if (!h) r = fail(ctx, "out of handles");
    else { h->bus = BUS_SPI2; h->hz = hz > 80000000 ? 80000000 : hz; r = handle_info(ctx, h); }
  }
  free(claim);
  return r;
}
static JSValue op_dma_alloc(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  int w = iarg(ctx, argv, argc, 0, 320), h = iarg(ctx, argv, argc, 1, 320);
  if (!world_claims(W, "dma")) return fail(ctx, "%s has no claim on dma", W->name);
  if (w <= 0 || h <= 0 || w > 640 || h > 640) return fail(ctx, "a framebuffer is at most 640 x 640");
  int b = dmabuf_alloc(w, h);
  if (b < 0) return fail(ctx, "out of DMA buffers");
  handle_t *hd = handle_new(H_DMA, W, "dma");
  if (!hd) return fail(ctx, "out of handles");
  hd->buf = b;
  return handle_info(ctx, hd);
}

static handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right) {
  char err[160];
  handle_t *h = handle_use(W, id, type, right, err, sizeof err);
  if (!h) fail(ctx, "%s", err);
  return h;
}

static JSValue op_h_info(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  int id = iarg(ctx, argv, argc, 0, 0);
  if (!world_holds(W, id)) return JS_NULL;
  for (int i = 0; i < MAX_HANDLES; i++) if (K.handles[i].live && K.handles[i].id == id) return handle_info(ctx, &K.handles[i]);
  return JS_NULL;
}
static JSValue op_h_attenuate(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), -1, 0);
  if (!h) return JS_EXCEPTION;
  char *r = sarg(ctx, argv, argc, 1);
  int rights = 0;
  for (char *p = r; p && *p; p++) rights |= *p == 'r' ? R_READ : *p == 'w' ? R_WRITE : *p == 'g' ? R_GRANT : 0;
  free(r);
  handle_t *c = handle_child(W, h, rights);
  if (!c) return fail(ctx, "out of handles");
  return handle_info(ctx, c);
}
static JSValue op_h_revoke(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  int id = iarg(ctx, argv, argc, 0, 0);
  for (int i = 0; i < MAX_HANDLES; i++) {
    handle_t *h = &K.handles[i];
    if (!h->live || h->id != id) continue;
    if (h->minter != W->id || !h->parent) return fail(ctx, "only the world that narrowed handle %d can revoke it", id);
    h->revoked = true;
    return JS_TRUE;
  }
  return fail(ctx, "there is no handle %d", id);
}
static JSValue op_h_release(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  int id = iarg(ctx, argv, argc, 0, 0);
  for (int i = 0; i < MAX_HANDLES; i++) if (K.handles[i].live && K.handles[i].id == id && world_holds(W, id)) { handle_release(&K.handles[i], W); return JS_TRUE; }
  return JS_FALSE;
}

static dmabuf_t *fb_arg(JSContext *ctx, world_t *W, JSValueConst *argv, int argc) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_DMA, R_WRITE);
  if (!h) return NULL;
  dmabuf_t *b = handle_buf(h);
  if (!b) fail(ctx, "the framebuffer is gone");
  return b;
}
static JSValue op_gfx_fill(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_fill(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
static JSValue op_gfx_rect(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_rect(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
static JSValue op_gfx_line(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_line(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
static JSValue op_gfx_text(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  char *s = sarg(ctx, argv, argc, 3), *font = sarg(ctx, argv, argc, 4);
  int w = gfx_text(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), s ? s : "", gfx_font_index(font ? font : "m"),
                   color_arg(ctx, argv, argc, 5), iarg(ctx, argv, argc, 6, 0));
  free(s); free(font);
  return JS_NewInt32(ctx, w);
}
static JSValue op_gfx_commit(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  int r[64 * 4];
  int n = gfx_commit(b, r, 64);
  JSValue a = JS_NewArray(ctx);
  for (int i = 0; i < n; i++) {
    JSValue e = JS_NewArray(ctx);
    for (int k = 0; k < 4; k++) JS_SetPropertyUint32(ctx, e, (uint32_t)k, JS_NewInt32(ctx, r[i * 4 + k]));
    JS_SetPropertyUint32(ctx, a, (uint32_t)i, e);
  }
  return a;
}
static JSValue op_gfx_invalidate(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {   // the panel lost its picture: send everything next time
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  for (size_t i = 0; i < (size_t)b->w * b->h; i++) b->front[i] = (uint16_t)~b->back[i];
  return JS_UNDEFINED;
}
static JSValue op_gfx_fonts(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)W; (void)argc; (void)argv;
  JSValue o = JS_NewObject(ctx);
  const char *names[] = { "s", "m", "mb", "l", "xl" };
  for (int i = 0; i < 5; i++) {
    int w, h; gfx_font_size(gfx_font_index(names[i]), &w, &h);
    JSValue e = JS_NewArray(ctx);
    JS_SetPropertyUint32(ctx, e, 0, JS_NewInt32(ctx, w)); JS_SetPropertyUint32(ctx, e, 1, JS_NewInt32(ctx, h));
    JS_SetPropertyStr(ctx, o, names[i], e);
  }
  return o;
}

static JSValue op_sys_json(JSContext *ctx, world_t *W, const char *what) {
  if (!world_claims(W, "sys.read")) return fail(ctx, "%s has no claim on sys.read", W->name);
  char *j = !strcmp(what, "worlds") ? kernel_worlds_json() : !strcmp(what, "handles") ? hw_handles_json() : kernel_stats_json();
  charge_json(strlen(j));
  return json_value(ctx, j);
}
static JSValue op_sys_worlds(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "worlds"); }
static JSValue op_sys_handles(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "handles"); }
static JSValue op_sys_stats(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "stats"); }

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
static JSValue op_sys_admin(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, bool restart) {
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
static JSValue op_sys_fault(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { return op_sys_admin(ctx, W, argc, argv, false); }
static JSValue op_sys_restart(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { return op_sys_admin(ctx, W, argc, argv, true); }

static const struct { const char *name; op_fn fn; } SYNC_OPS[] = {
  { "gfx.text", op_gfx_text }, { "gfx.fill", op_gfx_fill }, { "gfx.rect", op_gfx_rect }, { "gfx.line", op_gfx_line },
  { "gfx.commit", op_gfx_commit }, { "gfx.fonts", op_gfx_fonts }, { "gfx.invalidate", op_gfx_invalidate },
  { "now", op_now }, { "send", op_send }, { "publish", op_publish }, { "log", op_log }, { "self", op_self }, { "seed", op_seed },
  { "turn.async", op_turn_async }, { "turn.done", op_turn_done }, { "turn.fail", op_turn_fail }, { "turn.reject", op_turn_reject },
  { "hw.i2c", op_hw_i2c }, { "hw.spi", op_hw_spi }, { "dma.alloc", op_dma_alloc },
  { "h.info", op_h_info }, { "h.attenuate", op_h_attenuate }, { "h.revoke", op_h_revoke }, { "h.release", op_h_release },
  { "sys.worlds", op_sys_worlds }, { "sys.handles", op_sys_handles }, { "sys.stats", op_sys_stats },
  { "sys.fault", op_sys_fault }, { "sys.restart", op_sys_restart },
};

static JSValue host_k(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__k needs an operation");
  const char *op = JS_ToCString(ctx, argv[0]);
  if (!op) return JS_EXCEPTION;
  for (size_t i = 0; i < sizeof SYNC_OPS / sizeof SYNC_OPS[0]; i++)
    if (!strcmp(op, SYNC_OPS[i].name)) {
      JS_FreeCString(ctx, op);
      K.seg_cost += 1;   // a host call costs about a microsecond
      return SYNC_OPS[i].fn(ctx, W, argc - 1, argv + 1);
    }
  JSValue r = fail(ctx, "no such kernel operation: %s", op);
  JS_FreeCString(ctx, op);
  return r;
}

// ---- async operations: each returns a promise the kernel settles later -----------------------------------------
int vm_new_promise(world_t *W, JSValue *out) {
  JSValue f[2];
  JSValue p = JS_NewPromiseCapability(W->ctx, f);
  if (JS_IsException(p)) return -1;
  if (W->n_pend == W->cap_pend) { W->cap_pend = W->cap_pend ? W->cap_pend * 2 : 16; W->pend = realloc(W->pend, sizeof(pending_t) * W->cap_pend); }
  int id = ++K.next_promise;
  W->pend[W->n_pend++] = (pending_t){ id, f[0], f[1] };
  *out = p;
  return id;
}

static JSValue host_ka(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__ka needs an operation");
  const char *op = JS_ToCString(ctx, argv[0]);
  if (!op) return JS_EXCEPTION;
  argc--; argv++;
  K.seg_cost += 1;
  JSValue p = JS_UNDEFINED;
  JSValue r = JS_UNDEFINED;
  int id;
  if (!strcmp(op, "sleep")) {
    double ms = darg(ctx, argv, argc, 0, 0);
    if ((id = vm_new_promise(W, &p)) < 0) goto ex;
    defer_settle(W, id, 1, NULL, (vtime_t)(ms * 1000));
    r = p;
  } else if (!strcmp(op, "ask")) {
    char *to = sarg(ctx, argv, argc, 0), *type = sarg(ctx, argv, argc, 1), *json = sarg(ctx, argv, argc, 2);
    int hs[MAX_MSG_HANDLES], nh = argc > 3 ? int_list(ctx, argv[3], hs, MAX_MSG_HANDLES) : 0;
    double timeout = darg(ctx, argv, argc, 4, 2000);
    world_t *T = to ? world_by_name(to) : NULL;
    if (!T) r = fail(ctx, "there is no world called \"%s\"", to ? to : "");
    else if (T == W) r = fail(ctx, "a world cannot ask itself (it would wait for its own turn to end)");
    else if (!check_grants(ctx, W, hs, nh)) r = JS_EXCEPTION;
    else if ((id = vm_new_promise(W, &p)) < 0) r = JS_EXCEPTION;
    else { charge_json(json ? strlen(json) : 0); kernel_ask(W, T, type, json, hs, nh, id, (vtime_t)(timeout * 1000)); r = p; }
    free(to); free(type); free(json);
  } else if (!strcmp(op, "i2c")) {
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_I2C, R_WRITE);
    int wr[32], nwr = h && argc > 1 ? int_list(ctx, argv[1], wr, 32) : 0, nrd = iarg(ctx, argv, argc, 2, 0);
    if (!h) r = JS_EXCEPTION;
    else {
      uint8_t b[32];
      for (int i = 0; i < nwr; i++) b[i] = (uint8_t)wr[i];
      if ((id = vm_new_promise(W, &p)) < 0) goto ex;
      hw_i2c(W, h, b, nwr, nrd, (vtime_t)(darg(ctx, argv, argc, 3, 0) * 1000), id);
      r = p;
    }
  } else if (!strcmp(op, "spi.cmd")) {
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_SPI, R_WRITE);
    int dv[64], n = h && argc > 2 ? int_list(ctx, argv[2], dv, 64) : 0;
    if (!h) r = JS_EXCEPTION;
    else {
      uint8_t b[64];
      for (int i = 0; i < n; i++) b[i] = (uint8_t)dv[i];
      if ((id = vm_new_promise(W, &p)) < 0) goto ex;
      hw_spi_cmd(W, h, iarg(ctx, argv, argc, 1, 0), b, n, id);
      r = p;
    }
  } else if (!strcmp(op, "spi.pixels")) {
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_SPI, R_WRITE);
    handle_t *fb = h ? use(ctx, W, iarg(ctx, argv, argc, 1, 0), H_DMA, R_READ) : NULL;
    if (!h || !fb) r = JS_EXCEPTION;
    else {
      if ((id = vm_new_promise(W, &p)) < 0) goto ex;
      hw_spi_pixels(W, h, fb, iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), iarg(ctx, argv, argc, 5, 0), id);
      r = p;
    }
  } else r = fail(ctx, "no such kernel operation: %s", op);
  JS_FreeCString(ctx, op);
  return r;
ex:
  JS_FreeCString(ctx, op);
  return JS_EXCEPTION;
}

// ---- lifecycle ----------------------------------------------------------------------------------------------
// A rejection with no handler yet is noted; if a handler is attached before the job queue drains (as
// the prelude does for an async handler's promise), it is forgotten; what is left is reported.
static void on_rejection(JSContext *ctx, JSValueConst promise, JSValueConst reason, JS_BOOL handled, void *opaque) {
  world_t *W = opaque;
  if (!handled) {
    if (W->n_unhandled < 8) { W->unhandled[W->n_unhandled] = JS_DupValue(ctx, promise); W->unhandled_why[W->n_unhandled++] = JS_DupValue(ctx, reason); }
    return;
  }
  for (int i = 0; i < W->n_unhandled; i++)
    if (JS_VALUE_GET_PTR(W->unhandled[i]) == JS_VALUE_GET_PTR(promise)) {
      JS_FreeValue(ctx, W->unhandled[i]); JS_FreeValue(ctx, W->unhandled_why[i]);
      W->unhandled[i] = W->unhandled[--W->n_unhandled]; W->unhandled_why[i] = W->unhandled_why[W->n_unhandled];
      return;
    }
}
static void drop_unhandled(world_t *W, bool report) {
  for (int i = 0; i < W->n_unhandled; i++) {
    if (report) {
      const char *m = JS_ToCString(W->ctx, W->unhandled_why[i]);
      klog("%s: a promise was rejected and nothing handled it: %s", W->name, m ? m : "?");
      JS_FreeCString(W->ctx, m);
    }
    JS_FreeValue(W->ctx, W->unhandled[i]); JS_FreeValue(W->ctx, W->unhandled_why[i]);
  }
  W->n_unhandled = 0;
}

static int run_jobs(world_t *W) {
  for (;;) {
    JSContext *c;
    int r = JS_ExecutePendingJob(W->rt, &c);
    if (r == 0) { drop_unhandled(W, true); return 0; }
    if (r < 0) { set_error(W); return -1; }
  }
}

static int read_meta(world_t *W, JSValue meta) {
  JSContext *ctx = W->ctx;
  struct { const char *key; char (*dst)[NAME_LEN]; int *n; } lists[] = {
    { "needs", W->needs, &W->n_needs }, { "provides", W->provides, &W->n_provides },
  };
  for (int l = 0; l < 2; l++) {
    JSValue a = JS_GetPropertyStr(ctx, meta, lists[l].key);
    JSValue lv = JS_GetPropertyStr(ctx, a, "length");
    int32_t n = 0; JS_ToInt32(ctx, &n, lv);
    *lists[l].n = 0;
    for (int i = 0; i < n && i < MAX_LIST; i++) {
      JSValue e = JS_GetPropertyUint32(ctx, a, (uint32_t)i);
      const char *s = JS_ToCString(ctx, e);
      snprintf(lists[l].dst[(*lists[l].n)++], NAME_LEN, "%s", s ? s : "");
      JS_FreeCString(ctx, s); JS_FreeValue(ctx, e);
    }
    JS_FreeValue(ctx, lv); JS_FreeValue(ctx, a);
  }
  JSValue ev = JS_GetPropertyStr(ctx, meta, "every");
  W->n_every = int_list(ctx, ev, W->every_ms, MAX_LIST);
  JS_FreeValue(ctx, ev);
  JSValue v;
  v = JS_GetPropertyStr(ctx, meta, "start"); W->has_start = JS_ToBool(ctx, v); JS_FreeValue(ctx, v);
  v = JS_GetPropertyStr(ctx, meta, "screen"); W->has_screen = JS_ToBool(ctx, v); JS_FreeValue(ctx, v);
  v = JS_GetPropertyStr(ctx, meta, "kind"); { const char *s = JS_ToCString(ctx, v); snprintf(W->kind, sizeof W->kind, "%s", s ? s : "world"); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, v);
  v = JS_GetPropertyStr(ctx, meta, "title"); { const char *s = JS_ToCString(ctx, v); snprintf(W->title, sizeof W->title, "%s", s ? s : W->name); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, v);
  return 0;
}

int vm_create(world_t *W) {
  W->oom = false; W->interrupts = 0; W->mem_used = 0;
  W->rt = JS_NewRuntime2(&MF, W);
  if (!W->rt) { snprintf(W->last_error, sizeof W->last_error, "could not make a runtime within %zu KB", W->mem_limit / 1024); return -1; }
  JS_SetMaxStackSize(W->rt, port_js_stack());
  JS_SetInterruptHandler(W->rt, on_interrupt, W);
  JS_SetHostPromiseRejectionTracker(W->rt, on_rejection, W);
  W->ctx = JS_NewContext(W->rt);
  if (!W->ctx) { snprintf(W->last_error, sizeof W->last_error, "could not make a context within %zu KB", W->mem_limit / 1024); JS_FreeRuntime(W->rt); W->rt = NULL; return -1; }
  JS_SetContextOpaque(W->ctx, W);
  vm_begin_segment(W, MS(600));   // booting may take longer than a turn
  JSContext *ctx = W->ctx;
  JSValue g = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, g, "__k", JS_NewCFunction(ctx, host_k, "__k", 1));
  JS_SetPropertyStr(ctx, g, "__ka", JS_NewCFunction(ctx, host_ka, "__ka", 1));
  W->fn_dispatch = JS_UNDEFINED; W->fn_render = JS_UNDEFINED;
  int rc = 0;
  JSValue r = JS_Eval(ctx, K.prelude, K.prelude_len, "prelude.js", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  JS_FreeValue(ctx, r);
  if (!rc) {
    r = JS_Eval(ctx, W->source, strlen(W->source), W->file, JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) { set_error(W); rc = -1; }
    JS_FreeValue(ctx, r);
  }
  if (!rc) {
    JSValue init = JS_GetPropertyStr(ctx, g, "__init");
    JSValue meta = JS_Call(ctx, init, JS_UNDEFINED, 0, NULL);
    if (JS_IsException(meta)) { set_error(W); rc = -1; }
    else read_meta(W, meta);
    JS_FreeValue(ctx, meta); JS_FreeValue(ctx, init);
  }
  if (!rc) {
    W->fn_dispatch = JS_GetPropertyStr(ctx, g, "__dispatch");
    W->fn_render = JS_GetPropertyStr(ctx, g, "__render");
    rc = run_jobs(W);
  }
  JS_FreeValue(ctx, g);
  if (rc && W->oom) snprintf(W->last_error, sizeof W->last_error, "ran out of memory while starting (its limit is %zu KB)", W->mem_limit / 1024);
  return rc;
}

void vm_dispose(world_t *W) {
  if (!W->rt) return;
  JSContext *ctx = W->ctx;
  drop_unhandled(W, false);
  for (int i = 0; i < W->n_pend; i++) { JS_FreeValue(ctx, W->pend[i].resolve); JS_FreeValue(ctx, W->pend[i].reject); }
  W->n_pend = 0;
  JS_FreeValue(ctx, W->fn_dispatch); JS_FreeValue(ctx, W->fn_render);
  W->fn_dispatch = W->fn_render = JS_UNDEFINED;
  JS_FreeContext(ctx);
  JS_FreeRuntime(W->rt);
  W->rt = NULL; W->ctx = NULL;
}

int vm_dispatch(world_t *W, msg_t *m) {
  JSContext *ctx = W->ctx;
  world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
  if (m->json) charge_json(strlen(m->json));
  JSValue a[5];
  a[0] = JS_NewInt32(ctx, m->kind);
  a[1] = m->kind == M_TICK ? JS_NewInt32(ctx, m->timer) : JS_NewString(ctx, m->type ? m->type : "");
  a[2] = m->json ? JS_NewString(ctx, m->json) : JS_NULL;
  a[3] = F ? JS_NewString(ctx, F->name) : JS_NULL;
  a[4] = JS_NewBool(ctx, m->ask != 0);
  JSValue r = JS_Call(ctx, W->fn_dispatch, JS_UNDEFINED, 5, (JSValueConst *)a);
  for (int i = 0; i < 5; i++) JS_FreeValue(ctx, a[i]);
  if (JS_IsException(r)) { set_error(W); return -1; }
  if (!W->turn_async && !W->turn_rejected && !W->turn_done) {
    W->turn_done = true;
    free(W->turn_result);
    W->turn_result = NULL;
    if (JS_IsString(r)) { const char *s = JS_ToCString(ctx, r); W->turn_result = xstrdup(s); JS_FreeCString(ctx, s); }
  }
  JS_FreeValue(ctx, r);
  return run_jobs(W);
}

int vm_settle(world_t *W, settle_t *s) {
  JSContext *ctx = W->ctx;
  int k = -1;
  for (int i = 0; i < W->n_pend; i++) if (W->pend[i].id == s->promise) { k = i; break; }
  if (k < 0) return 0;
  pending_t p = W->pend[k];
  W->pend[k] = W->pend[--W->n_pend];
  JSValue v;
  if (s->ok) v = s->json ? JS_ParseJSON(ctx, s->json, strlen(s->json), "<kernel>") : JS_UNDEFINED;
  else {
    v = JS_NewError(ctx);
    JSValue msg = s->json ? JS_ParseJSON(ctx, s->json, strlen(s->json), "<kernel>") : JS_NewString(ctx, "failed");
    JS_SetPropertyStr(ctx, v, "message", msg);
  }
  if (s->json) charge_json(strlen(s->json));
  JSValue r = JS_Call(ctx, s->ok ? p.resolve : p.reject, JS_UNDEFINED, 1, (JSValueConst *)&v);
  JS_FreeValue(ctx, v);
  JS_FreeValue(ctx, p.resolve); JS_FreeValue(ctx, p.reject);
  int rc = 0;
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  JS_FreeValue(ctx, r);
  return rc ? rc : run_jobs(W);
}

char *vm_render(world_t *W) {
  JSContext *ctx = W->ctx;
  JSValue r = JS_Call(ctx, W->fn_render, JS_UNDEFINED, 0, NULL);
  if (JS_IsException(r)) { set_error(W); W->turn_failed = true; free(W->turn_error); W->turn_error = xstrdup(W->last_error); return NULL; }
  char *out = NULL;
  if (JS_IsString(r)) { size_t n; const char *s = JS_ToCStringLen(ctx, &n, r); out = xstrdup(s); JS_FreeCString(ctx, s); charge_json(n); }
  JS_FreeValue(ctx, r);
  return out;
}

// The virtual cost of one interrupt-counter step, from a measurement on the ESP32-P4: the 0101 firmware's
// "js bench" runs this 100,000-iteration loop in 133 ms on the device (esp32-s3-m5/0101-esp32-p4-native-quickjs).
// fib(20), measured there at 31 ms, is counted too, as a check on the model.
static int count_interrupt(JSRuntime *rt, void *o) { (void)rt; (*(int64_t *)o)++; return 0; }
static int64_t count_steps(const char *src, double *real_ms) {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  int64_t n = 0;
  JS_SetInterruptHandler(rt, count_interrupt, &n);
  int c0 = JS_GetInterruptCounter(ctx);
  vtime_t t0 = K.realtime ? port_clock() : 0;
  JSValue r = JS_Eval(ctx, src, strlen(src), "calibrate.js", JS_EVAL_TYPE_GLOBAL);
  *real_ms = K.realtime ? (port_clock() - t0) / 1000.0 : 0;
  int64_t steps = n * JS_GetInterruptCounterInit() + c0 - JS_GetInterruptCounter(ctx);
  JS_FreeValue(ctx, r);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return steps;
}
double vm_fib20_ms;
void vm_calibrate(void) {
  double loop_ms, fib_ms;
  int64_t loop = count_steps("(()=>{let s=0; for(let i=0;i<100000;i++) s+=i; return s;})()", &loop_ms);
  int64_t fib = count_steps("(()=>{function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()", &fib_ms);
  if (loop > 0) PROFILE.ns_per_step = 133e6 / (double)loop;
  vm_fib20_ms = fib * PROFILE.ns_per_step / 1e6;
  if (K.verbose) fprintf(stderr, "calibration: the 100k loop is %lld steps, so a step is %.0f virtual ns; fib(20) is %lld steps = %.1f virtual ms (31 ms on the device)\n",
                         (long long)loop, PROFILE.ns_per_step, (long long)fib, vm_fib20_ms);
  if (K.realtime) klog("calibration on the real clock: the 100k loop took %.1f ms (the model says 133), fib(20) %.1f ms (the model says %.1f)",
                       loop_ms, fib_ms, vm_fib20_ms);
}

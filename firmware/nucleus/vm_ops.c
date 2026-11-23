// A world's operations on itself (time, identity, log), on messages and turns, on handles, hardware and files, and on
// its framebuffer (QuickJS binding; vm.c has the runtime, vm_sys.c the system operations and the host functions).
#include <stdarg.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_quickjs.h"

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

void set_error(world_t *W) {
  char b[2048];
  vm_exception(W->vm->ctx, b, sizeof b);
  char *nl = strchr(b, '\n');
  free(W->trace);
  W->trace = nl ? xstrdup(nl + 1) : NULL;
  if (nl) *nl = 0;
  snprintf(W->last_error, sizeof W->last_error, "%s", b);
}

// ---- argument helpers ---------------------------------------------------------------------------------------
int iarg(JSContext *ctx, JSValueConst *argv, int argc, int i, int def) {
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return def;
  double d; if (JS_ToFloat64(ctx, &d, argv[i])) return def;
  return (int)d;
}
double darg(JSContext *ctx, JSValueConst *argv, int argc, int i, double def) {
  if (i >= argc || JS_IsUndefined(argv[i])) return def;
  double d; if (JS_ToFloat64(ctx, &d, argv[i])) return def;
  return d;
}
char *sarg(JSContext *ctx, JSValueConst *argv, int argc, int i) {   // a copy, or NULL
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return NULL;
  const char *s = JS_ToCString(ctx, argv[i]);
  char *c = xstrdup(s ? s : "");
  JS_FreeCString(ctx, s);
  return c;
}
int int_list(JSContext *ctx, JSValueConst v, int *out, int max) {
  if (!JS_IsArray(ctx, v)) return 0;
  JSValue lv = JS_GetPropertyStr(ctx, v, "length");
  int32_t n = 0; JS_ToInt32(ctx, &n, lv); JS_FreeValue(ctx, lv);
  if (n > max) n = max;
  for (int i = 0; i < n; i++) { JSValue e = JS_GetPropertyUint32(ctx, v, (uint32_t)i); int32_t x = 0; JS_ToInt32(ctx, &x, e); out[i] = x; JS_FreeValue(ctx, e); }
  return n;
}
pixel_t color_arg(JSContext *ctx, JSValueConst *argv, int argc, int i) {
  if (i < argc && JS_IsString(argv[i])) { const char *s = JS_ToCString(ctx, argv[i]); pixel_t c = gfx_color(s); JS_FreeCString(ctx, s); return c; }
  return (pixel_t)iarg(ctx, argv, argc, i, 0);
}
JSValue fail(JSContext *ctx, const char *fmt, ...) {
  char b[256]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  JSValue e = JS_NewError(ctx);
  JS_SetPropertyStr(ctx, e, "message", JS_NewString(ctx, b));
  return JS_Throw(ctx, e);
}
JSValue json_value(JSContext *ctx, char *json) {   // takes ownership
  if (!json) return JS_NULL;
  JSValue v = JS_ParseJSON(ctx, json, strlen(json), "<kernel>");
  free(json);
  return v;
}
void charge_json(size_t n) { K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); }

// handles named in a message must be held by the sender, and passable
bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh) {
  char err[160];
  for (int i = 0; i < nh; i++) {
    if (!handle_may_grant(W, hs[i], err, sizeof err)) { fail(ctx, "%s", err); return false; }
  }
  return true;
}


// ---- sync operations -----------------------------------------------------------------------------------------
static JSValue op_now(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)W; (void)argc; (void)argv;
  return JS_NewFloat64(ctx, kernel_now() / 1000.0);
}
static JSValue op_clock_wall(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)W; (void)argc; (void)argv;
  int64_t t = port_wall_ms();
  return t < 0 ? JS_NULL : JS_NewFloat64(ctx, (double)t);
}
static JSValue op_clock_zone(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)W; (void)argc; (void)argv;
  return JS_NewString(ctx, clock_zone());
}
// The time zone for every world (claim sys.clock): QuickJS reads TZ through the C library for each local time.
static JSValue op_clock_setzone(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!world_claims(W, "sys.clock")) return fail(ctx, "%s has no claim on sys.clock", W->name);
  char *tz = sarg(ctx, argv, argc, 0);
  JSValue r;
  if (!tz || !tz_valid(tz)) r = fail(ctx, "expected a POSIX time zone like EST5EDT,M3.2.0,M11.1.0");
  else {
    int saved = port_tz_set(tz) == 0;
    r = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, r, "zone", JS_NewString(ctx, tz));
    JS_SetPropertyStr(ctx, r, "saved", JS_NewBool(ctx, saved));
  }
  free(tz);
  return r;
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

// publish(channel, json, handles, retain): retain keeps the post for worlds that start later (kernel_retain); a
// retained post carries no handles, which would otherwise be granted long after they were sent
static JSValue op_publish(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *ch = sarg(ctx, argv, argc, 0), *json = sarg(ctx, argv, argc, 1);
  int hs[MAX_MSG_HANDLES], nh = argc > 2 ? int_list(ctx, argv[2], hs, MAX_MSG_HANDLES) : 0;
  bool retain = argc > 3 && JS_ToBool(ctx, argv[3]) > 0;
  char why[160];
  JSValue r = JS_UNDEFINED;
  if (!ch || !world_provides(W, ch)) r = fail(ctx, "%s does not provide the channel \"%s\"", W->name, ch ? ch : "");
  else if (!world_may_use(W, ch)) r = fail(ctx, "%s has no claim on %s", W->name, channel_claim(ch));
  else if (retain && nh) r = fail(ctx, "a retained post cannot carry handles");
  else if (retain && kernel_retain(W, ch, json, why, sizeof why)) r = fail(ctx, "%s", why);
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
  JS_SetPropertyStr(ctx, o, "type", JS_NewString(ctx, handle_type_name(h->type)));
  if (h->type == H_FS) {
    JS_SetPropertyStr(ctx, o, "path", JS_NewString(ctx, h->path));
    JS_SetPropertyStr(ctx, o, "file", JS_NewBool(ctx, h->file));
  }
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

// Files. hw.fs("fs:/notes") gives a world a handle to the directory its manifest names (creating it); h.at(path,
// rights) narrows a directory handle to a path inside it, a file if nothing or a file is there. Every operation is
// asynchronous (__ka "fs"): a deferred effect hands the job to the port once the segment has ended cleanly.
static JSValue op_hw_fs(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char err[160], *claim = sarg(ctx, argv, argc, 0);
  handle_t *h = fs_open_claim(W, claim, err, sizeof err);
  free(claim);
  return h ? handle_info(ctx, h) : fail(ctx, "%s", err);
}

static JSValue op_fs_at(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char err[160], *rel = sarg(ctx, argv, argc, 1), *rs = sarg(ctx, argv, argc, 2);
  handle_t *h = fs_at(W, iarg(ctx, argv, argc, 0, 0), rel, rs, err, sizeof err);
  free(rel); free(rs);
  return h ? handle_info(ctx, h) : fail(ctx, "%s", err);
}

JSValue ka_fs(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p) {
  char err[160], *op = sarg(ctx, argv, argc, 1), *rel = sarg(ctx, argv, argc, 2);
  size_t len = 0;
  const char *arg = argc > 3 ? JS_ToCStringLen(ctx, &len, argv[3]) : NULL;
  fs_job_t *j = fs_prepare(W, iarg(ctx, argv, argc, 0, 0), op, rel, arg, len, err, sizeof err);
  free(op); free(rel);
  if (arg) JS_FreeCString(ctx, arg);
  if (!j) return fail(ctx, "%s", err);
  int id = vm_new_promise(W, p);
  if (id < 0) { fs_job_free(j); return JS_EXCEPTION; }
  fs_defer(W, j, id);
  return JS_UNDEFINED;
}

handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right) {
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
#if PICOCALC_RAYTRACE
static JSValue op_gfx_raytrace(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc);
  if (!b) return JS_EXCEPTION;
  if (strcmp(W->name, "compositor")) return fail(ctx, "raytrace requires the compositor");
  if (!gfx_raytrace(b, iarg(ctx, argv, argc, 1, -1), iarg(ctx, argv, argc, 2, -1),
                    iarg(ctx, argv, argc, 3, -1), iarg(ctx, argv, argc, 4, -1), iarg(ctx, argv, argc, 5, 0)))
    return fail(ctx, "invalid raytrace viewport or scene");
  return JS_UNDEFINED;
}
#endif
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
  gfx_invalidate(b);
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


// The operations above by name; vm_sys.c's __k looks a name up here first.
const vm_op_t VM_OPS[] = {
#if PICOCALC_RAYTRACE
  { "gfx.raytrace", op_gfx_raytrace },
#endif
  { "gfx.text", op_gfx_text }, { "gfx.fill", op_gfx_fill }, { "gfx.rect", op_gfx_rect }, { "gfx.line", op_gfx_line },
  { "gfx.commit", op_gfx_commit }, { "gfx.fonts", op_gfx_fonts }, { "gfx.invalidate", op_gfx_invalidate },
  { "now", op_now }, { "clock.wall", op_clock_wall }, { "clock.zone", op_clock_zone }, { "clock.setzone", op_clock_setzone }, { "send", op_send }, { "publish", op_publish }, { "log", op_log }, { "self", op_self }, { "seed", op_seed },
  { "turn.async", op_turn_async }, { "turn.done", op_turn_done }, { "turn.fail", op_turn_fail }, { "turn.reject", op_turn_reject },
  { "hw.i2c", op_hw_i2c }, { "hw.spi", op_hw_spi }, { "dma.alloc", op_dma_alloc },
  { "h.info", op_h_info }, { "h.attenuate", op_h_attenuate }, { "h.revoke", op_h_revoke }, { "h.release", op_h_release },
  { "hw.fs", op_hw_fs }, { "fs.at", op_fs_at },
};
const size_t VM_N_OPS = sizeof VM_OPS / sizeof VM_OPS[0];

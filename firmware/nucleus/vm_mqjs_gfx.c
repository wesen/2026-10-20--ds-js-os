// Pixels, the system's operations, the clock and a world's store: the MicroQuickJS binding (vm_mqjs_ops.c has
// the table that names them).
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_mqjs.h"

// ---- pixels ----------------------------------------------------------------------------------------------------
static dmabuf_t *fb_arg(JSContext *ctx, world_t *W, JSValue *argv, int argc) {
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_DMA, R_WRITE);
  if (!h) return NULL;
  dmabuf_t *b = handle_buf(h);
  if (!b) fail(ctx, "the framebuffer is gone");
  return b;
}
JSValue op_gfx_fill(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_fill(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
JSValue op_gfx_rect(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_rect(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
JSValue op_gfx_line(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_line(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), color_arg(ctx, argv, argc, 5));
  return JS_UNDEFINED;
}
JSValue op_gfx_text(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  pixel_t c = color_arg(ctx, argv, argc, 5);
  char *s = sarg(ctx, argv, argc, 3), *font = sarg(ctx, argv, argc, 4);
  int w = gfx_text(b, iarg(ctx, argv, argc, 1, 0), iarg(ctx, argv, argc, 2, 0), s ? s : "", gfx_font_index(font ? font : "m"), c, iarg(ctx, argv, argc, 6, 0));
  free(s); free(font);
  return JS_NewInt32(ctx, w);
}
JSValue op_gfx_measure(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W;
  char *s = sarg(ctx, argv, argc, 0), *font = sarg(ctx, argv, argc, 1);
  int w = gfx_measure(s ? s : "", gfx_font_index(font ? font : "m"));
  free(s); free(font);
  return JS_NewInt32(ctx, w);
}
JSValue op_gfx_wrap(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W;
  char *s = sarg(ctx, argv, argc, 0), *font = sarg(ctx, argv, argc, 1);
  char *json = gfx_wrap_json(s ? s : "", gfx_font_index(font ? font : "m"), iarg(ctx, argv, argc, 2, 100));
  free(s); free(font);
  return json_value(ctx, json);
}
JSValue op_gfx_commit(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  int r[64 * 4];
  int n = gfx_commit(b, r, 64);
  sbuf_t j = { 0 };
  sb_add(&j, "[");
  for (int i = 0; i < n; i++) sb_printf(&j, "%s[%d,%d,%d,%d]", i ? "," : "", r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]);
  sb_add(&j, "]");
  return json_value(ctx, j.s);
}
JSValue op_gfx_invalidate(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  gfx_invalidate(b);
  return JS_UNDEFINED;
}
// fb.persist() / fb.adopt(): the panel's picture across a power-off (hw.c), for the world that takes the frames.
// persist saves front when the segment ends; adopt loads the saved picture into front now.
static void run_persist(deferred_t *d, vtime_t at) {
  (void)at;
  dmabuf_t *b = handle_buf(handle_find(d->fb));
  vtime_t t0 = K.realtime ? port_clock() : 0;
  int n = b ? dmabuf_persist(b) : -1;
  if (n < 0) klog("the panel's picture was not saved");
  else if (K.realtime) klog("saved the panel's picture: %d bytes in %.1f ms", n, (port_clock() - t0) / 1000.0);
  else klog("saved the panel's picture: %d bytes", n);
}
JSValue op_gfx_persist(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!world_needs(W, "frames")) return fail(ctx, "only the world that takes the frames saves the panel's picture");
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_persist; d->w = W->id; d->fb = iarg(ctx, argv, argc, 0, 0);
  defer(d);
  return JS_UNDEFINED;
}
JSValue op_gfx_adopt(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!world_needs(W, "frames")) return fail(ctx, "only the world that takes the frames adopts the panel's picture");
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  return dmabuf_adopt(b) ? JS_TRUE : JS_FALSE;
}
JSValue op_gfx_hash(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  dmabuf_t *b = fb_arg(ctx, W, argv, argc); if (!b) return JS_EXCEPTION;
  return JS_NewFloat64(ctx, gfx_hash(b));
}
JSValue op_gfx_fonts(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)W; (void)argc; (void)argv;
  return json_value(ctx, gfx_fonts_json());
}

static JSValue op_sys_json(JSContext *ctx, world_t *W, const char *what, const char *fields) {
  if (!world_claims(W, "sys.read")) return fail(ctx, "%s has no claim on sys.read", W->name);
  char *j = !strcmp(what, "worlds") ? kernel_worlds_json_fields(fields) : !strcmp(what, "handles") ? hw_handles_json() : kernel_stats_json();
  charge_json(strlen(j));
  return json_value(ctx, j);
}
JSValue op_sys_worlds(JSContext *ctx, world_t *W, int argc, JSValue *argv) {   // (fields): "name,state", or all
  char *fields = argc > 0 ? sarg(ctx, argv, argc, 0) : NULL;
  JSValue r = op_sys_json(ctx, W, "worlds", fields);
  free(fields);
  return r;
}
JSValue op_sys_handles(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "handles", NULL); }
JSValue op_sys_stats(JSContext *ctx, world_t *W, int argc, JSValue *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "stats", NULL); }

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
JSValue op_sys_fault(JSContext *ctx, world_t *W, int argc, JSValue *argv) { return op_sys_admin(ctx, W, argc, argv, false); }
// timers.start(i) / timers.stop(i): the world's own declared timers
JSValue op_timer_set(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int i = iarg(ctx, argv, argc, 0, -1);
  if (i < 0 || i >= W->n_every) return fail(ctx, "%s has no timer %d", W->name, i);
  kernel_timer_set(W, i, argc > 1 && argv[1] == JS_TRUE);   // the prelude passes a boolean
  return JS_UNDEFINED;
}
// sys.front(name): the compositor (the world that takes the "frames") says which world is on screen; only that one
// is rendered after its turns
JSValue op_sys_front(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!world_needs(W, "frames")) return fail(ctx, "only the world that takes the frames says which world is in front");
  char *name = sarg(ctx, argv, argc, 0);
  world_t *T = name ? world_by_name(name) : NULL;
  free(name);
  if (!T) return fail(ctx, "no such world");
  if (K.front != T->id + 1) { free(T->frame); T->frame = NULL; }   // its next turn publishes a frame, even an unchanged one
  K.front = T->id + 1;
  return JS_UNDEFINED;
}
JSValue op_sys_restart(JSContext *ctx, world_t *W, int argc, JSValue *argv) { return op_sys_admin(ctx, W, argc, argv, true); }

// the wall clock: what Date.now() reads; the clock driver sets it from the RTC (claim "sys.clock")
double wall_offset_ms = WALL_BOOT_MS;
JSValue op_clock_set(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (!world_claims(W, "sys.clock")) return fail(ctx, "%s has no claim on sys.clock", W->name);
  wall_offset_ms = darg(ctx, argv, argc, 0, WALL_BOOT_MS) - kernel_now() / 1000.0;
  return JS_UNDEFINED;
}

// The power: switch the board off. The promise settles only if the board is still running afterwards (external
// power keeps it on), with { off: false, why }; the world then carries on.
void run_poweroff(deferred_t *d, vtime_t at) {
  char why[120] = "";
  klog("switching the board off");
  if (port_power_off(why, sizeof why) == 0) return;   // off (the host's board: halted until it is woken)
  klog("the board stayed on: %s", why);
  sbuf_t b = { 0 };
  sb_add(&b, "{\"off\":false,\"why\":"); sb_json_str(&b, why); sb_add(&b, "}");
  kernel_settle_at(d->w, d->epoch, d->promise, 1, b.s, at);
}

// The persistent store: one record per world, a JSON object the prelude keeps (store.get / store.set). The
// record is read now and written when the segment ends, so a segment that faults never reaches flash; several
// writes in one segment become one. NVS names are at most 15 characters, so a longer world name has no store.
#define STORE_NAME_MAX 15
JSValue op_store_load(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  (void)argc; (void)argv;
  size_t n = 0;
  char *j = strlen(W->name) <= STORE_NAME_MAX ? port_store_get("w", W->name, &n) : NULL;
  if (!j) return JS_NULL;
  charge_json(n);
  JSValue r = JS_NewStringLen(ctx, j, n);
  free(j);
  return r;
}
static void run_store_save(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *T = world_by_id(d->w);
  bool empty = !strcmp(d->json, "{}");
  if (T && port_store_set("w", T->name, d->json, empty ? 0 : strlen(d->json))) klog("%s: the store did not take its record", T->name);
  free(d->json);
}
JSValue op_store_save(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  if (strlen(W->name) > STORE_NAME_MAX) return fail(ctx, "%s has no store: its name is longer than %d characters", W->name, STORE_NAME_MAX);
  char *json = sarg(ctx, argv, argc, 0);
  if (!json) return fail(ctx, "store.save needs the record");
  size_t n = strlen(json);
  if (n > W->store_limit) {
    free(json);
    return fail(ctx, "%s's store would be %zu KB; its limit is %zu KB", W->name, (n + 1023) / 1024, W->store_limit / 1024);
  }
  charge_json(n);
  for (deferred_t *d = K.defer_head; d; d = d->next)   // a write of this segment already waits: it takes the newer record
    if (d->run == run_store_save && d->w == W->id) { free(d->json); d->json = json; return JS_UNDEFINED; }
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_store_save; d->w = W->id; d->json = json;
  defer(d);
  return JS_UNDEFINED;
}


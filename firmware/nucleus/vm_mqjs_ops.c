// A world's own, message, handle and hardware operations, the operation table with __k, and the asynchronous
// operations (__ka): the MicroQuickJS binding (vm_mqjs.c has the runtime, vm_mqjs_gfx.c the rest).
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_mqjs.h"

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

// publish(channel, json, handles, retain): as in vm.c
static JSValue op_publish(JSContext *ctx, world_t *W, int argc, JSValue *argv) {
  int hs[MAX_MSG_HANDLES], nh = int_list(ctx, argv, argc, 2, hs, MAX_MSG_HANDLES);
  char *ch = sarg(ctx, argv, argc, 0), *json = sarg(ctx, argv, argc, 1);
  bool retain = argc > 3 && argv[3] == JS_TRUE;   // the prelude passes a boolean
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

handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right) {
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

static const struct { const char *name; op_fn fn; } SYNC_OPS[] = {
  { "gfx.text", op_gfx_text }, { "gfx.fill", op_gfx_fill }, { "gfx.rect", op_gfx_rect }, { "gfx.line", op_gfx_line },
  { "gfx.commit", op_gfx_commit }, { "gfx.fonts", op_gfx_fonts }, { "gfx.invalidate", op_gfx_invalidate }, { "gfx.hash", op_gfx_hash },
  { "gfx.persist", op_gfx_persist }, { "gfx.adopt", op_gfx_adopt },
  { "gfx.measure", op_gfx_measure }, { "gfx.wrap", op_gfx_wrap },
  { "now", op_now }, { "send", op_send }, { "publish", op_publish }, { "log", op_log }, { "self", op_self }, { "seed", op_seed },
  { "engine", op_engine }, { "err.where", op_err_where }, { "clock.set", op_clock_set },
  { "store.load", op_store_load }, { "store.save", op_store_save },
  { "turn.async", op_turn_async }, { "turn.done", op_turn_done }, { "turn.fail", op_turn_fail }, { "turn.reject", op_turn_reject },
  { "hw.i2c", op_hw_i2c }, { "hw.epd", op_hw_epd }, { "hw.adc", op_hw_adc }, { "hw.gpio", op_hw_gpio }, { "dma.alloc", op_dma_alloc },
  { "h.info", op_h_info }, { "h.attenuate", op_h_attenuate }, { "h.revoke", op_h_revoke }, { "h.release", op_h_release },
  { "adc.read", op_adc_read }, { "gpio.get", op_gpio_get }, { "gpio.watch", op_gpio_watch }, { "gpio.unwatch", op_gpio_unwatch },
  { "epd.info", op_epd_info },
  { "sys.worlds", op_sys_worlds }, { "sys.handles", op_sys_handles }, { "sys.stats", op_sys_stats },
  { "sys.fault", op_sys_fault }, { "sys.restart", op_sys_restart }, { "sys.front", op_sys_front }, { "timer.set", op_timer_set },
};

#define N_SYNC_OPS (sizeof SYNC_OPS / sizeof SYNC_OPS[0])
static const char *ASYNC_OPS[] = { "sleep", "ask", "i2c", "epd.update", "poweroff" };
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
  } else if (!strcmp(op, "poweroff")) {   // sys.powerOff(): after the segment's other effects (its store writes)
    if (!world_claims(W, "sys.power")) r = fail(ctx, "%s has no claim on sys.power", W->name);
    else {
      deferred_t *d = calloc(1, sizeof(*d));
      d->run = run_poweroff; d->w = W->id; d->epoch = W->epoch; d->promise = id;
      defer(d);
      r = JS_NewInt32(ctx, id);
    }
  } else r = fail(ctx, "no such kernel operation: %s", op);
  for (size_t i = 0; op && i < N_ASYNC_OPS; i++) if (!strcmp(op, ASYNC_OPS[i])) op_prof_add(N_SYNC_OPS + i, t0);
  free(op);
  return r;
}


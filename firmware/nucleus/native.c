// Native worlds: a binary instead of JavaScript (a WebAssembly module, or machine code for this board). The kernel
// calls them through eng_* like any world; here a kernel message becomes an event for the port's backend, and the
// binary's system calls are carried out with the same claims, handles and deferred effects as vm.c's operations.
// The backend decides how the binary is isolated: a Linux process under seccomp on the host (host/native_proc.c), or
// WAMR's interpreter for a WebAssembly module on any board (native_wasm.c).
//
// Everything a binary passes is untrusted: strings arrive with a length and are copied, names are checked for
// length and embedded NULs, and declarations are accepted only while the binary's init runs.
#include <limits.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "native_internal.h"

// Every backend numbers the system calls as the SDK does: the wire (processes) and the imports (WebAssembly)
_Static_assert((int)NW_CALL_LOG == (int)NW_LOG && (int)NW_CALL_TIMER == (int)NW_TIMER && (int)NW_CALL_COUNT == (int)NW_CALLS, "sdk/nw_wire.h and nucleus_native.h number the system calls alike");
_Static_assert(NW_WIRE_INIT == (int)NW_INIT, "the init event's kind");
_Static_assert(NW_WIRE_STR_MAX == NW_STR_MAX, "the longest string");

static const char *const ENGINES[ENG_COUNT] = { "js", "wasm", "native" };
const char *engine_name(int e) { return e >= 0 && e < ENG_COUNT ? ENGINES[e] : "?"; }
int engine_index(const char *n) { for (int i = 0; i < ENG_COUNT; i++) if (!strcmp(n, ENGINES[i])) return i; return -1; }

// ---- the engine functions ----------------------------------------------------------------------------------------
void nat_begin_segment(world_t *W, vtime_t budget_us) {
  W->overrun = false;
  if (W->nat) W->nat->budget_us = budget_us;
}

int nat_create(world_t *W) {
  W->oom = false; W->overrun = false; W->mem_used = 0;
  W->n_needs = W->n_provides = W->n_every = 0;
  W->has_screen = false;
  W->has_start = true;   // a native world always hears NW_START once it has booted
  snprintf(W->kind, sizeof W->kind, "world");
  snprintf(W->title, sizeof W->title, "%s", W->name);
  const native_backend_t *be = port_native_backend(W->engine);
  if (!be) { snprintf(W->last_error, sizeof W->last_error, "this board cannot run %s worlds", engine_name(W->engine)); return -1; }
  W->nat = calloc(1, sizeof *W->nat);
  if (!W->nat) { snprintf(W->last_error, sizeof W->last_error, "out of memory"); return -1; }
  W->nat->be = be;
  nat_begin_segment(W, MS(600));   // loading and init may take longer than a turn, as booting a JS world does
  char why[200] = "";
  if (be->load(W, why, sizeof why) < 0) {
    snprintf(W->last_error, sizeof W->last_error, "%s", why[0] ? why : "the binary could not be loaded");
    return -1;
  }
  W->nat->in_init = true;
  nw_event_t e = { .kind = NW_INIT, .type = "", .json = "null", .json_len = 4, .from = "" };
  int r = be->event(W, &e);
  W->nat->in_init = false;
  return r < 0 ? -1 : 0;
}

void nat_dispose(world_t *W) {
  if (!W->nat) return;
  if (W->nat->inst) W->nat->be->unload(W);
  agent_drop(W);
  free(W->nat->agent_body);
  free(W->nat->screen);
  free(W->nat);
  W->nat = NULL;
  W->mem_used = 0;
}

int nat_dispatch(world_t *W, msg_t *m) {
  world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
#if PICOCALC_MOBILE_PAINTER
  if (m->painter_length) {
    extern void p4_painter_receive(world_t *, world_t *, bool, const uint8_t *, size_t);
    if (W->nat->cji_handles && kernel_chess_painter_current(W, m))
      p4_painter_receive(W, F, m->painter_source, (const uint8_t *)(m + 1), m->painter_length);
    W->turn_done = true;
    return 0;
  }
#endif
  nw_event_t e = { 0 };
  e.kind = m->kind == M_ON ? NW_MESSAGE : m->kind == M_TICK ? NW_TICK : m->kind == M_START ? NW_START : NW_IRQ;
  e.type = m->kind == M_TICK ? "" : m->type ? m->type : "";
  e.json = m->json ? m->json : "null";
  e.from = F ? F->name : "";
  e.type_len = strlen(e.type); e.json_len = strlen(e.json); e.from_len = strlen(e.from);
  e.ask = m->ask != 0;
  e.timer = m->timer;
  if (m->json) K.seg_cost += (vtime_t)(e.json_len * PROFILE.json_ns_per_byte / 1000.0);
  int r = W->nat->be->event(W, &e);
  if (r < 0) return -1;
  if (r == NW_LATER && !W->turn_done && !W->turn_rejected) W->turn_async = true;   // it answers in a later segment
  else if (!W->turn_done && !W->turn_rejected) { W->turn_done = true; free(W->turn_result); W->turn_result = NULL; }
  return 0;
}

// A settle: the result of an asynchronous call. While an asynchronous turn is open, NW_DONE from the handler ends it
// (answering null if the binary did not reply); outside a turn the return value means nothing.
int nat_settle(world_t *W, settle_t *s) {
  nw_event_t e = { 0 };
  e.kind = NW_SETTLE;
  e.type = ""; e.from = "";
  e.json = s->json ? s->json : "null";
  e.json_len = strlen(e.json);
  e.token = s->promise; e.ok = s->ok;
  int r = W->nat->be->event(W, &e);
  if (r < 0) return -1;
  if (r == NW_DONE && W->in_turn && W->turn_async && !W->turn_done && !W->turn_rejected) {
    W->turn_done = true; free(W->turn_result); W->turn_result = NULL;
  }
  return 0;
}

// The kernel's render step, after each segment of a world with a screen: the screen nw_screen last set. The kernel
// compares it with the last one posted and posts it on "frames" only if it changed, as for a JavaScript world.
char *nat_render(world_t *W) { return W->nat && W->nat->screen ? xstrdup(W->nat->screen) : NULL; }

// ---- system calls ------------------------------------------------------------------------------------------------
static void run_store_save(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *W = world_by_id(d->w);
  if (W && W->nat && W->epoch == d->epoch) {
    bool empty = !strcmp(d->json, "{}") || !d->json[0];
    W->nat->store_pending = false;
    W->nat->store_failed = port_store_set("w", W->name, d->json, empty ? 0 : strlen(d->json)) != 0;
    if (W->nat->store_failed) klog("%s: persistent storage write failed", W->name);
  }
  free(d->json);
}

int64_t nat_syscall(world_t *W, const nw_call_t *c, char *out, size_t out_n) {
  if (out && out_n) out[0] = 0;
  K.seg_cost += 1;   // a kernel call costs about a microsecond, as for JavaScript
  for (int i = 0; i < 3; i++) if (c->n[i] > NW_STR_MAX) return fail(W, "a system call's string is longer than %d bytes", NW_STR_MAX);
  grants_t grants = {0};
  int payload = c->op == NW_SEND || c->op == NW_ASK ? 2 : c->op == NW_PUBLISH ? 1 : c->op == NW_REPLY ? 0 : -1;
  if (payload >= 0 && c->n[payload]) {
    if (!nat_json_ok(c->s[payload], c->n[payload], W->nat->cji_handles ? &grants : NULL))
      return fail(W, W->nat->cji_handles ? "invalid JSON or capability marker" : BAD_JSON);
    for (int i = 0; i < grants.count; i++) {
      char err[160];
      if (!handle_may_grant(W, grants.ids[i], err, sizeof err)) return fail(W, "%s", err);
    }
  }
  if (c->op >= CJI_HANDLE_INFO && !W->nat->cji_handles) return fail(W, "operation requires a bundled CJI module");
#if PICOCALC_MOBILE_PAINTER
  if (c->op == CJI_PAINTER_DRAW) return cji_graphics(W, c, out, out_n);
#endif
#if PICOCALC_RAYTRACE
  if (c->op == CJI_RAYTRACE) return cji_graphics(W, c, out, out_n);
#endif
  if (c->op >= CJI_DMA && c->op <= CJI_FONTS) return cji_graphics(W, c, out, out_n);
  int64_t device = nat_syscall_device(W, c, out, out_n);
  if (device != NAT_NOT_DEVICE) return device;
  switch (c->op) {
    case NW_LOG: {
      char *s = str(c, 0);
      klog("%s: %s", W->name, s ? s : "");
      free(s);
      return 0;
    }
    case NW_NOW: return kernel_now();
    case NW_SELF: snprintf(out, out_n, "%s", W->name); return (int64_t)strlen(out);
    case NW_PAINTER_PUBLISH: {
#if PICOCALC_MOBILE_PAINTER
      if (W->user || strcmp(W->name, "chess") || strcmp(W->file, "chess/compiled.bin") || W->nat->in_init)
        return fail(W, "painter publication requires bundled Chess");
      world_t *T = world_by_name("compositor");
      if (!T || T->user || T->engine != ENG_NATIVE || T->status == W_STOPPED)
        return fail(W, "the native compositor is unavailable");
      if ((c->i[0] != 0 && c->i[0] != 1) || c->n[1] || c->n[2] ||
          !kernel_chess_painter_send(W, T, c->i[0] == 1, (const uint8_t *)c->s[0], c->n[0]))
        return fail(W, "painter packet exceeds transport capacity");
      return 0;
#else
      return fail(W, "painter publication is unavailable");
#endif
    }
    case NW_SEND: {
      if (!name_ok(c, 0, NAME_LEN) || !name_ok(c, 1, NAME_LEN)) return fail(W, "send needs a world's name and a message type");
      char *to = str(c, 0), *type = str(c, 1), *json = c->n[2] ? str(c, 2) : NULL;
      world_t *T = to ? world_by_name(to) : NULL;
      int64_t r = 0;
      if (!to || !type || (c->n[2] && !json)) r = fail(W, "out of memory");
      else if (!T) r = fail(W, "there is no world called \"%s\"", to);
      else {
        msg_t *m = new_msg(M_ON, type, json, W->id);
        memcpy(m->hs, grants.ids, grants.count * sizeof(int));
        m->nh = grants.count;
        charge(c->n[2]);
        defer_deliver(T, m);
      }
      free(to); free(type); free(json);
      return r;
    }
    case NW_PUBLISH: {
      if (!name_ok(c, 0, NAME_LEN)) return fail(W, "publish needs a channel's name");
      char *ch = str(c, 0), *json = c->n[1] ? str(c, 1) : NULL;
      int64_t r = 0;
      char why[160];
      if (!ch || (c->n[1] && !json)) r = fail(W, "out of memory");
      else if (!world_provides(W, ch)) r = fail(W, "%s does not provide the channel \"%s\"", W->name, ch);
      else if (!world_may_use(W, ch)) r = fail(W, "%s has no claim on %s", W->name, channel_claim(ch));
      else if ((c->i[0] & 1) && grants.count) r = fail(W, "a retained post cannot carry handles");
      else if ((c->i[0] & 1) && kernel_retain(W, ch, json, why, sizeof why)) r = fail(W, "%s", why);   // bit 0: retain
      else { charge(c->n[1]); kernel_publish(W, ch, json, grants.ids, grants.count); }
      free(ch); free(json);
      return r;
    }
    case NW_REPLY: {
      if (!W->in_turn || W->turn_done || W->turn_rejected) return 0;   // nothing to answer, or answered already
      char *json = c->n[0] ? str(c, 0) : NULL;
      if (c->n[0] && !json) return fail(W, "out of memory");
      free(W->turn_result);
      memcpy(W->reply_hs, grants.ids, grants.count * sizeof(int)); W->reply_nh = grants.count;
      W->turn_result = json;
      W->turn_done = true;
      return 0;
    }
    case NW_REJECT:
      if (!W->in_turn || W->turn_done || W->turn_rejected) return 0;
      free(W->turn_error);
      W->turn_error = c->n[0] ? str(c, 0) : xstrdup("refused");
      W->turn_rejected = true;
      return 0;
    case NW_NEED: case NW_PROVIDE: {
      if (!W->nat->in_init) return fail(W, "channels are declared only while a world starts");
      if (!name_ok(c, 0, NAME_LEN)) return fail(W, "a channel's name is 1 to %d bytes", NAME_LEN - 1);
      char *ch = str(c, 0);
      bool need = c->op == NW_NEED;
      char (*l)[NAME_LEN] = need ? W->needs : W->provides;
      int *n = need ? &W->n_needs : &W->n_provides;
      int64_t r = 0;
      if (!world_may_use(W, ch)) r = fail(W, "the channel \"%s\" takes the claim %s, which the manifest does not give %s", ch, channel_claim(ch), W->name);
      else if (!in_list(l, *n, ch)) { if (*n >= MAX_LIST) r = fail(W, "at most %d channels", MAX_LIST); else snprintf(l[(*n)++], NAME_LEN, "%s", ch); }
      free(ch);
      return r;
    }
    case NW_EVERY:
      if (!W->nat->in_init) return fail(W, "timers are declared only while a world starts");
      if (c->i[0] < 10) return fail(W, "a timer ticks at most every 10 ms");
      if (W->n_every >= MAX_LIST) return fail(W, "at most %d timers", MAX_LIST);
      W->every_ms[W->n_every] = c->i[0];
      W->timer_off[W->n_every] = false;
      return W->n_every++;
    case NW_KIND: {
      if (!W->nat->in_init) return fail(W, "a world's kind is declared only while it starts");
      char *k = str(c, 0);
      int64_t r = 0;
      if (!k || (strcmp(k, "driver") && strcmp(k, "service") && strcmp(k, "app") && strcmp(k, "world"))) r = fail(W, "a kind is driver, service, app or world");
      else snprintf(W->kind, sizeof W->kind, "%s", k);
      free(k);
      return r;
    }
    case NW_ASK: case NW_ASK_FILE: {
      if (!name_ok(c, 0, NAME_LEN) || !name_ok(c, 1, NAME_LEN)) return fail(W, "ask needs a world's name and a message type");
      char *json;
      if (c->op == NW_ASK_FILE) {
        int id = c->i[1];
        char err[160];
        if (!handle_may_grant(W, id, err, sizeof err)) return fail(W, "%s", err);
        handle_t *file = handle_find(id);
        if (file->type != H_FS || !file->file || !file->parent)
          return fail(W, "a file ask needs a narrowed file handle");
        if (!name_ok(c, 2, FS_PATH_MAX)) return fail(W, "a file ask needs a display name");
        char *name = str(c, 2);
        if (!name) return fail(W, "out of memory");
        sbuf_t payload = {0};
        sb_printf(&payload, "{\"file\":{\"$h\":%d},\"name\":", id);
        sb_json_str(&payload, name);
        sb_add(&payload, "}");
        free(name);
        if (!nat_json_ok(payload.s, payload.n, &grants)) {
          free(payload.s);
          return fail(W, "invalid UTF-8 in file display name");
        }
        json = payload.s;
      } else json = c->n[2] ? str(c, 2) : NULL;
      char *to = str(c, 0), *type = str(c, 1);
      world_t *T = to ? world_by_name(to) : NULL;
      int64_t r;
      if (!to || !type || (c->n[2] && !json)) r = fail(W, "out of memory");
      else if (!T) r = fail(W, "there is no world called \"%s\"", to);
      else if (T == W) r = fail(W, "a world cannot ask itself (it would wait for its own turn to end)");
      else {
        int id = ++K.next_promise;
        vtime_t timeout = c->i[0] > 0 ? MS(c->i[0]) : MS(2000);
        if (json) charge(strlen(json));
        kernel_ask(W, T, type, json, grants.ids, grants.count, id, timeout);
        r = id;
      }
      free(to); free(type); free(json);
      return r;
    }
    case NW_SLEEP: {
      if (c->i[0] < 0) return fail(W, "sleep takes milliseconds, 0 or more");
      int id = ++K.next_promise;
      defer_settle(W, id, 1, NULL, MS(c->i[0]));
      return id;
    }
    case NW_I2C_OPEN: {
      if (!name_ok(c, 0, NAME_LEN)) return fail(W, "an i2c claim is like \"i2c0:0x1f\"");
      char *claim = str(c, 0);
      unsigned addr = 0;
      int64_t r;
      if (strncmp(claim, "i2c0:", 5) || sscanf(claim + 5, "%x", &addr) != 1) r = fail(W, "\"%s\" is not an i2c claim (like \"i2c0:0x1f\")", claim);
      else if (!world_claims(W, claim)) r = fail(W, "%s has no claim on %s", W->name, claim);
      else {
        handle_t *h = handle_new(H_I2C, W, claim);
        if (!h) r = fail(W, "out of handles");
        else { h->bus = BUS_I2C0; h->addr = (int)addr; h->hz = c->i[0] > 0 ? c->i[0] : 10000; r = h->id; }
      }
      free(claim);
      return r;
    }
    case NW_I2C: {
      char err[160];
      handle_t *h = handle_use(W, c->i[0], H_I2C, R_WRITE, err, sizeof err);
      if (!h) return fail(W, "%s", err);
      if (c->n[0] > 32 || c->i[1] < 0 || c->i[1] > 32) return fail(W, "an i2c transfer writes and reads at most 32 bytes");
      if (c->i[2] < 0 || c->i[2] > 1000000) return fail(W, "the gap before an i2c read is 0 to 1000 ms");
      int id = ++K.next_promise;
      hw_i2c(W, h, (const uint8_t *)c->s[0], (int)c->n[0], c->i[1], c->i[2] > 0 ? (vtime_t)c->i[2] : 0, id);
      return id;
    }
    case NW_RELEASE:
      for (int i = 0; i < MAX_HANDLES; i++)
        if (K.handles[i].live && K.handles[i].id == c->i[0] && world_holds(W, c->i[0])) { handle_release(&K.handles[i], W); return 1; }
      return 0;
    case NW_STORE_LOAD: {
      for (deferred_t *d = K.defer_head; d; d = d->next) {
        if (d->run == run_store_save && d->w == W->id && d->epoch == W->epoch)
          return text_result(W, xstrdup(d->json), out, out_n);
      }
      size_t n = 0;
      char *j = strlen(W->name) <= 15 ? port_store_get("w", W->name, &n) : NULL;
      if (!j) return 0;
      int64_t r;
      if (n > W->store_limit) r = fail(W, "the saved record is larger than the world's store quota");
      else if (n >= out_n) r = fail(W, "the saved record (%zu bytes) does not fit the buffer", n);
      else { memcpy(out, j, n); out[n] = 0; charge(n); r = (int64_t)n; }
      free(j);
      return r;
    }
    case NW_STORE_SAVE: {
      if (strlen(W->name) > 15) return fail(W, "a persistent world's name is at most 15 characters");
      if (c->n[0] > W->store_limit) return fail(W, "store quota exceeded (%zu bytes)", W->store_limit);
      if (!c->n[0] || !payload_ok(c, 0)) return fail(W, "a record is a JSON object or value: " BAD_JSON);
      char *json = str(c, 0);
      if (!json) return fail(W, "out of memory");
      charge(c->n[0]);
      for (deferred_t *d = K.defer_head; d; d = d->next)   // the last save in a segment wins
        if (d->run == run_store_save && d->w == W->id) { free(d->json); d->json = json; return 0; }
      deferred_t *d = calloc(1, sizeof *d);
      if (!d) { free(json); return fail(W, "out of memory"); }
      W->nat->store_pending = true;
      d->run = run_store_save; d->w = W->id; d->epoch = W->epoch; d->json = json;
      defer(d);
      return 0;
    }
    case NW_SCREEN: {   // nw_screen(tree, hints): what it shows from now on; the kernel posts it after this event
      if (!c->n[0] || !payload_ok(c, 0) || c->s[0][0] != '{') return fail(W, "a screen is a tree of ui nodes, a JSON object");
      if (!text_ok(c, 1, NW_HINTS_MAX)) return fail(W, "hints are at most %d bytes of text", NW_HINTS_MAX);
      if (c->n[0] + c->n[1] > NW_SCREEN_MAX) return fail(W, "a screen is at most %d bytes", NW_SCREEN_MAX);
      char *tree = str(c, 0), *hints = str(c, 1);
      sbuf_t b = { 0 };
      sb_add(&b, "{\"tree\":"); sb_add(&b, tree ? tree : "{}"); sb_add(&b, ",\"hints\":"); sb_json_str(&b, hints ? hints : ""); sb_add(&b, "}");
      free(tree); free(hints);
      if (!b.s) return fail(W, "out of memory");
      free(W->nat->screen);
      W->nat->screen = b.s;
      W->has_screen = true;
      charge(c->n[0]);
      return 0;
    }
    case NW_PRESENT: {   // nw_title, nw_icon, nw_about, nw_key: field, value
      if (!W->nat->in_init) return fail(W, "what a world shows on the launcher is declared only while it starts");
      if (!name_ok(c, 0, NAME_LEN)) return fail(W, "a world presents its title, icon, about or key");
      bool icon = c->n[0] == 4 && !memcmp(c->s[0], "icon", 4);
      if (icon ? !c->n[1] || !payload_ok(c, 1) : !text_ok(c, 1, ICON_MAX)) return fail(W, icon ? "an icon is a JSON array of drawing operations" : "not text");
      char *field = str(c, 0), *value = str(c, 1), why[160];
      int64_t r = kernel_present(W, field, value, why, sizeof why) ? fail(W, "%s", why) : 0;
      free(field); free(value);
      return r;
    }
    case NW_TIMER:
      if (c->i[0] < 0 || c->i[0] >= W->n_every) return fail(W, "there is no timer %d", (int)c->i[0]);
      kernel_timer_set(W, c->i[0], c->i[1] != 0);
      return 0;
  }
  return fail(W, "there is no system call %d", (int)c->op);
}

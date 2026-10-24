// The kernel: one lane of execution, on a virtual clock (the host) or the port's real one (the device). Worlds take turns; a turn is one message
// handled to completion (or, for an async handler, until its promise settles, in several segments).
// What a segment does to the outside (messages, channel posts, bus transfers, replies) is collected
// and applied when it ends, at the virtual time it ends, so a turn that crashes has no effects.
//
// Supervision: a world that throws, runs past its budget or runs out of memory is stopped, its
// handles are dropped, and it is restarted after a backoff (100 ms, doubling, at most 2 s). Five
// crashes within ten seconds and it stays stopped. Every crash is also written to the UART as a fault
// frame, for a host-side fault handler to pick up.
//
// On the virtual clock a segment costs what the device profile says it would; on the real clock
// (K.realtime) it costs what it took, and the port's main loop calls kernel_run_until(port_clock()).
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

kernel_t K;
static vtime_t apply_at = -1;   // while a segment's effects are applied: the time it ended
static vtime_t frozen_now = -1; // while a crash is handled: the time it happened
profile_t PROFILE = {
  .name = "esp32p4-picocalc",
  .ns_per_step = 1330,          // replaced by vm_calibrate()
  .turn_base_us = 40,
  .fill_ns_per_px = 2.5,        // 16-bit stores into PSRAM
  .text_ns_per_px = 6.0,        // read, blend, write
  .diff_ns_per_px = 1.2,        // 32-bit compares, cached
  .json_ns_per_byte = 25,
  .spi_chunk_us = 12,
  .mem_scale = sizeof(void *) == 8 ? 1.17 : 1.0,   // measured: a world takes about 17% more host memory on 64-bit (see README)
};

// ---- the event queue: a binary heap ordered by (time, sequence) -------------------------------------------
static event_t **heap; static int heap_n, heap_cap;
static bool before(event_t *a, event_t *b) { return a->t < b->t || (a->t == b->t && a->seq < b->seq); }
void schedule(event_t *e) {
  if (heap_n == heap_cap) { heap_cap = heap_cap ? heap_cap * 2 : 256; heap = realloc(heap, sizeof(*heap) * heap_cap); }
  int i = heap_n++;
  heap[i] = e;
  while (i > 0) { int p = (i - 1) / 2; if (!before(heap[i], heap[p])) break; event_t *t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p; }
}
static event_t *pop(void) {
  event_t *top = heap[0];
  heap[0] = heap[--heap_n];
  int i = 0;
  for (;;) {
    int l = 2 * i + 1, r = l + 1, m = i;
    if (l < heap_n && before(heap[l], heap[m])) m = l;
    if (r < heap_n && before(heap[r], heap[m])) m = r;
    if (m == i) break;
    event_t *t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m;
  }
  return top;
}
event_t *new_event(int type, vtime_t t) { event_t *e = calloc(1, sizeof(*e)); e->type = type; e->t = t; e->seq = ++K.seq; return e; }
void schedule_fn(vtime_t t, void (*fn)(void *, int), void *arg, int a) { event_t *e = new_event(E_FN, t); e->fn = fn; e->arg = arg; e->a = a; schedule(e); }

// ---- logging -----------------------------------------------------------------------------------------------
static int restarts_of(world_t *W) { return W->restarts > 0 ? W->restarts - 1 : 0; }   // restarts counts boots
vtime_t kernel_now(void) {
  if (frozen_now >= 0) return frozen_now;
  if (K.realtime) return port_clock();
  if (!K.cur) return apply_at >= 0 ? apply_at : K.vnow;
  return K.vnow + PROFILE.turn_base_us + (vtime_t)(vm_steps(K.cur) * PROFILE.ns_per_step / 1000.0) + K.seg_cost;
}
void klog(const char *fmt, ...) {
  char b[1024];
  va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  if (K.uart) fprintf(K.uart, "[%10.3f] %s\n", kernel_now() / 1000.0, b);
  if (K.verbose) fprintf(stderr, "[%10.3f] %s\n", kernel_now() / 1000.0, b);
}

// A fault frame on the UART: one line, "#OCT1 " and a JSON object. A host-side handler reads these
// (and could answer on the RX line) without the device needing a network.
static void uart_fault(world_t *W, const char *why, const char *detail) {
  if (!K.uart) return;
  sbuf_t b = { 0 };
  sb_printf(&b, "#OCT1 {\"ev\":\"fault\",\"t\":%.3f,\"world\":", kernel_now() / 1000.0);
  sb_json_str(&b, W->name);
  sb_add(&b, ",\"file\":"); sb_json_str(&b, W->file);
  sb_add(&b, ",\"handling\":"); sb_json_str(&b, W->in_turn ? W->turn_type : "");
  sb_add(&b, ",\"why\":"); sb_json_str(&b, why);
  sb_printf(&b, ",\"crashes\":%d,\"mem_kb\":%zu,\"limit_kb\":%zu", W->n_crash_times,
            (size_t)(W->mem_used / PROFILE.mem_scale / 1024), W->mem_limit / 1024);
  if (detail) { sb_add(&b, ",\"detail\":"); sb_json_str(&b, detail); }
  sb_add(&b, "}\n");
  fputs(b.s, K.uart);
  fflush(K.uart);
  free(b.s);
}

// ---- worlds ----------------------------------------------------------------------------------------------
world_t *world_by_name(const char *name) { for (int i = 0; i < K.n_worlds; i++) if (!strcmp(K.worlds[i]->name, name)) return K.worlds[i]; return NULL; }
world_t *world_by_id(int id) { return id >= 0 && id < K.n_worlds ? K.worlds[id] : NULL; }
static bool in_list(char (*l)[NAME_LEN], int n, const char *s) { for (int i = 0; i < n; i++) if (!strcmp(l[i], s)) return true; return false; }
bool world_needs(world_t *W, const char *ch) { return in_list(W->needs, W->n_needs, ch); }
bool world_provides(world_t *W, const char *ch) { return in_list(W->provides, W->n_provides, ch); }
bool world_claims(world_t *W, const char *c) { return in_list(W->claims, W->n_claims, c); }
static bool alive(world_t *W) { return W->status == W_IDLE && W->ctx; }

msg_t *new_msg(int kind, const char *type, const char *json, int from) {
  msg_t *m = calloc(1, sizeof(*m));
  m->kind = kind; m->type = xstrdup(type ? type : ""); m->json = xstrdup(json); m->from = from;
  return m;
}
void free_msg(msg_t *m) { if (!m) return; free(m->type); free(m->json); free(m); }

// ---- deferred effects --------------------------------------------------------------------------------------
void defer(deferred_t *d) {
  if (!K.cur) { d->run(d, apply_at >= 0 ? apply_at : K.vnow); free(d); return; }
  d->next = NULL;
  if (K.defer_tail) K.defer_tail->next = d; else K.defer_head = d;
  K.defer_tail = d;
}
static void apply_deferred(vtime_t at) {
  apply_at = at;
  while (K.defer_head) {
    deferred_t *d = K.defer_head;
    K.defer_head = d->next;
    if (!K.defer_head) K.defer_tail = NULL;
    d->run(d, at);
    free(d);
  }
  apply_at = -1;
}
static void discard_deferred(void) {
  while (K.defer_head) {
    deferred_t *d = K.defer_head;
    K.defer_head = d->next;
    free_msg(d->msg); free(d->bytes); free(d->json); free(d);
  }
  K.defer_tail = NULL;
}

static void run_deliver(deferred_t *d, vtime_t at) {
  event_t *e = new_event(E_DELIVER, at);
  e->w = d->w; e->msg = d->msg;
  schedule(e);
}
void defer_deliver(world_t *to, msg_t *m) {
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_deliver; d->w = to->id; d->msg = m;
  defer(d);
}

void kernel_settle_at(int w, int epoch, int promise, int ok, char *json, vtime_t t) {
  event_t *e = new_event(E_SETTLE, t);
  e->w = w; e->epoch = epoch;
  e->settle = calloc(1, sizeof(settle_t));
  e->settle->promise = promise; e->settle->ok = ok; e->settle->json = json;
  schedule(e);
}
static void run_settle(deferred_t *d, vtime_t at) { kernel_settle_at(d->w, d->epoch, d->promise, d->ok, d->json, at + d->delay); }
void defer_settle(world_t *W, int promise, int ok, const char *json, vtime_t delay) {
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_settle; d->w = W->id; d->epoch = W->epoch; d->promise = promise; d->ok = ok; d->json = xstrdup(json); d->delay = delay;
  defer(d);
}
static char *json_string(const char *s) { sbuf_t b = { 0 }; sb_json_str(&b, s); return b.s; }

// ---- channels and asks ------------------------------------------------------------------------------------
void kernel_publish(world_t *from, const char *ch, const char *json, const int *hs, int nh) {
  K.published++;
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *T = K.worlds[i];
    if (T == from || T->status == W_STOPPED || !world_needs(T, ch)) continue;
    msg_t *m = new_msg(M_ON, ch, json, from ? from->id : -1);
    for (int k = 0; k < nh && k < MAX_MSG_HANDLES; k++) m->hs[m->nh++] = hs[k];
    defer_deliver(T, m);
  }
}

static ask_t *find_ask(int id) { ask_t *a = &K.asks[id % MAX_ASKS]; return a->id == id && a->live ? a : NULL; }

static void settle_ask(int id, int ok, const char *json, const int *hs, int nh) {
  ask_t *a = find_ask(id);
  if (!a) return;
  a->live = false;
  world_t *F = world_by_id(a->from);
  if (!F || F->epoch != a->from_epoch || !alive(F)) return;
  for (int i = 0; i < nh; i++)
    for (int k = 0; k < MAX_HANDLES; k++) if (K.handles[k].live && K.handles[k].id == hs[i]) handle_grant(&K.handles[k], F);
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_settle; d->w = F->id; d->epoch = F->epoch; d->promise = a->promise; d->ok = ok;
  d->json = ok ? xstrdup(json ? json : "null") : json_string(json ? json : "failed");
  defer(d);
}

static void ask_timeout(void *arg, int id) {
  (void)arg;
  ask_t *a = find_ask(id);
  if (!a) return;
  world_t *T = world_by_id(a->to);
  char t[160];
  snprintf(t, sizeof t, "no reply from %s within %lld ms", T ? T->name : "?", (long long)(a->deadline / 1000));
  settle_ask(id, 0, t, NULL, 0);
}
static void run_ask_timer(deferred_t *d, vtime_t at) { schedule_fn(at + d->delay, ask_timeout, NULL, d->op); }

int kernel_ask(world_t *from, world_t *to, const char *type, const char *json, const int *hs, int nh, int promise, vtime_t timeout) {
  if (to->status == W_STOPPED) {
    char t[160]; snprintf(t, sizeof t, "%s is stopped", to->name);
    char *j = json_string(t);
    defer_settle(from, promise, 0, j, 0);
    free(j);
    return 0;
  }
  int id = ++K.next_ask;
  ask_t *a = &K.asks[id % MAX_ASKS];
  *a = (ask_t){ .id = id, .from = from->id, .from_epoch = from->epoch, .to = to->id, .promise = promise, .live = true, .deadline = timeout };
  msg_t *m = new_msg(M_ON, type, json, from->id);
  m->ask = id;
  for (int k = 0; k < nh; k++) m->hs[m->nh++] = hs[k];
  defer_deliver(to, m);
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_ask_timer; d->op = id; d->delay = timeout;
  defer(d);
  return id;
}

// ---- status ---------------------------------------------------------------------------------------------------
static void publish_status(world_t *W, const char *state, const char *why, vtime_t in_us) {
  sbuf_t b = { 0 };
  sb_add(&b, "{\"world\":"); sb_json_str(&b, W->name);
  sb_add(&b, ",\"state\":"); sb_json_str(&b, state);
  if (why) { sb_add(&b, ",\"why\":"); sb_json_str(&b, why); }
  sb_printf(&b, ",\"restarts\":%d,\"crashes\":%d,\"in_ms\":%lld,\"t\":%.3f}", restarts_of(W), W->n_crash_times, (long long)(in_us / 1000), kernel_now() / 1000.0);
  kernel_publish(NULL, "worlds.status", b.s, NULL, 0);
  free(b.s);
}

// ---- supervision --------------------------------------------------------------------------------------------
static void clear_turn(world_t *W) {
  W->in_turn = false; W->turn_ask = 0; W->turn_async = W->turn_done = W->turn_failed = W->turn_rejected = false;
  free(W->turn_result); free(W->turn_error); W->turn_result = W->turn_error = NULL; W->reply_nh = 0;
}

static void fail_mailbox(world_t *W, const char *why) {
  msg_t *m = W->mbox;
  while (m) { msg_t *n = m->next; if (m->ask) settle_ask(m->ask, 0, why, NULL, 0); free_msg(m); m = n; }
  W->mbox = W->mbox_tail = NULL; W->mbox_len = 0;
}

static void crash_at(world_t *W, const char *why);
void crash(world_t *W, const char *why) {
  if (W->status != W_IDLE) return;
  frozen_now = kernel_now();
  crash_at(W, why);
  frozen_now = -1;
}
static void crash_at(world_t *W, const char *why) {
  if (K.cur == W) discard_deferred();
  K.crashes++;
  char first[240];
  snprintf(first, sizeof first, "%s", why);
  char *nl = strchr(first, '\n');
  if (nl) *nl = 0;
  snprintf(W->last_error, sizeof W->last_error, "%s", first);
  // crashes in the last ten seconds decide between a restart and a stop
  vtime_t now = kernel_now();
  int keep = 0;
  for (int i = 0; i < W->n_crash_times; i++) if (now - W->crash_times[i] < MS(10000)) W->crash_times[keep++] = W->crash_times[i];
  W->n_crash_times = keep;
  if (W->n_crash_times < 8) W->crash_times[W->n_crash_times++] = now;
  int recent = W->n_crash_times;
  klog("%s crashed%s%s: %s", W->name, W->in_turn ? " handling " : "", W->in_turn ? W->turn_type : "", first);
  uart_fault(W, first, strchr(why, '\n') ? strchr(why, '\n') + 1 : W->trace);
  free(W->trace); W->trace = NULL;
  char t[300];
  snprintf(t, sizeof t, "%s crashed: %s", W->name, first);
  if (W->in_turn && W->turn_ask) settle_ask(W->turn_ask, 0, t, NULL, 0);
  vm_dispose(W);
  handles_drop_world(W);
  while (W->settles) { settle_t *s = W->settles; W->settles = s->next; free(s->json); free(s); }
  W->settles_tail = NULL;
  clear_turn(W);
  free(W->frame); W->frame = NULL;
  for (int i = 0; i < MAX_LIST; i++) W->tick_queued[i] = false;
  W->epoch++;
  if (recent >= 5) {
    W->status = W_STOPPED;
    char s[160]; snprintf(s, sizeof s, "%s is stopped", W->name);
    fail_mailbox(W, s);
    klog("%s crashed %d times in ten seconds; it stays stopped", W->name, recent);
    publish_status(W, "stopped", first, 0);
    return;
  }
  W->status = W_RESTARTING;
  vtime_t delay = MS(100) << (recent - 1);
  if (delay > MS(2000)) delay = MS(2000);
  event_t *e = new_event(E_RESTART, now + delay);
  e->w = W->id; e->epoch = W->epoch;
  schedule(e);
  publish_status(W, "crashed", first, delay);
}

void kernel_fault(world_t *W, const char *why) {
  if (W->status == W_IDLE) crash(W, why);
}

// A stopped (or running) world, started again by an administrator.
int kernel_restart_world(world_t *W) {
  if (W->status == W_IDLE) { crash(W, "restarted by an administrator"); W->n_crash_times = 0; return 0; }
  if (W->status == W_STOPPED) {
    W->n_crash_times = 0;
    W->status = W_RESTARTING;
    W->boot_ready = true; W->boot_t = K.vnow; W->boot_seq = ++K.seq;
  }
  return 0;
}

// ---- booting a world (a segment on the lane) ------------------------------------------------------------------
static void start_timers(world_t *W, vtime_t at) {
  for (int i = 0; i < W->n_every; i++) {
    if (W->every_ms[i] <= 0) continue;
    event_t *e = new_event(E_TICK, at + MS(W->every_ms[i]));
    e->w = W->id; e->epoch = W->epoch; e->a = i;
    schedule(e);
  }
}

static int boot_world(world_t *W) {
  int rc = vm_create(W);
  if (rc) return rc;
  if (W->prio < 0) W->prio = !strcmp(W->kind, "driver") ? 3 : !strcmp(W->kind, "service") ? 2 : 1;
  W->status = W_IDLE;
  if (W->has_start) {
    msg_t *m = new_msg(M_START, "start", NULL, -1);
    m->t = K.vnow; m->seq = ++K.seq;
    m->next = W->mbox; W->mbox = m;
    if (!W->mbox_tail) W->mbox_tail = m;
    W->mbox_len++;
  }
  return 0;
}

// ---- the lane --------------------------------------------------------------------------------------------------
static world_t *pick(bool *is_settle) {
  world_t *best = NULL; vtime_t bt = 0; uint64_t bs = 0; bool bset = false; int bp = 0;
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    vtime_t t; uint64_t s; bool set = false, ok = false;
    if (W->boot_ready) { t = W->boot_t; s = W->boot_seq; ok = true; }
    else if (W->status == W_IDLE) {
      if (W->settles) { t = W->settles->t; s = W->settles->seq; ok = true; set = true; }
      if (!W->in_turn && W->mbox && (!ok || W->mbox->t < t || (W->mbox->t == t && W->mbox->seq < s))) { t = W->mbox->t; s = W->mbox->seq; ok = true; set = false; }
    }
    int pr = W->boot_ready ? 10 : W->prio;   // starting a world comes first, in manifest order
    if (ok && (!best || pr > bp || (pr == bp && (t < bt || (t == bt && s < bs))))) { best = W; bt = t; bs = s; bset = set; bp = pr; }
  }
  *is_settle = bset;
  return best;
}

static void finish_turn(world_t *W) {
  if (W->turn_ask) {
    if (W->turn_rejected) settle_ask(W->turn_ask, 0, W->turn_error, NULL, 0);
    else settle_ask(W->turn_ask, 1, W->turn_result, W->reply_hs, W->reply_nh);
  }
  W->turns++; K.turns++;
  clear_turn(W);
}

static void run_segment(world_t *W, bool is_settle) {
  if (K.realtime) K.vnow = port_clock();   // it starts now, which may be later than when it was due
  K.cur = W; K.seg_cost = 0; K.segments++;
  int rc = 0;
  const char *budget_kind = "turn";
  vtime_t budget = W->budget_us;
  bool booting = W->boot_ready;
  if (booting) {
    W->boot_ready = false;
    budget_kind = "start";
    budget = MS(600);
    rc = boot_world(W);
    if (rc == 0 && W->restarts++ > 0) publish_status(W, "running", NULL, 0);
  } else {
    vm_begin_segment(W, budget);
    if (is_settle) {
      settle_t *s = W->settles;
      W->settles = s->next;
      if (!W->settles) W->settles_tail = NULL;
      rc = vm_settle(W, s);
      free(s->json); free(s);
    } else {
      msg_t *m = W->mbox;
      W->mbox = m->next;
      if (!W->mbox) W->mbox_tail = NULL;
      W->mbox_len--;
      W->in_turn = true; W->turn_ask = m->ask; W->msgs++;
      W->turn_started = K.vnow;
      if (m->kind == M_TICK) { W->tick_queued[m->timer] = false; snprintf(W->turn_type, sizeof W->turn_type, "every %d ms", W->every_ms[m->timer]); }
      else snprintf(W->turn_type, sizeof W->turn_type, "%s", m->type);
      if (K.trace) {
        world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
        klog("%s <- %s%s from %s %.120s", W->name, W->turn_type, m->ask ? " (ask)" : "", F ? F->name : "kernel", m->json ? m->json : "");
      }
      rc = vm_dispatch(W, m);
      free_msg(m);
    }
  }
  // render what the world shows, as part of its segment
  if (rc == 0 && !booting && W->ctx && W->has_screen && !W->oom && !W->overrun) {
    char *f = vm_render(W);
    if (f && (!W->frame || strcmp(f, W->frame))) {
      free(W->frame); W->frame = f;
      sbuf_t b = { 0 };
      sb_add(&b, "{\"app\":"); sb_json_str(&b, W->name);
      sb_add(&b, ",\"title\":"); sb_json_str(&b, W->title);
      sb_add(&b, ",\"frame\":"); sb_add(&b, f); sb_add(&b, "}");
      kernel_publish(W, "frames", b.s, NULL, 0);
      free(b.s);
    } else free(f);
  }
  int64_t steps = vm_steps(W);
  vtime_t cost = K.realtime ? port_clock() - K.vnow
                            : PROFILE.turn_base_us + (vtime_t)(steps * PROFILE.ns_per_step / 1000.0) + K.seg_cost;
  char why[300] = "";
  if (W->oom) snprintf(why, sizeof why, "ran out of memory (its limit is %zu KB)", W->mem_limit / 1024);
  else if (W->overrun) snprintf(why, sizeof why, "ran past its %s budget of %lld virtual ms", budget_kind, (long long)(budget / 1000));
  else if (rc < 0) snprintf(why, sizeof why, "%s", W->last_error);
  else if (W->turn_failed) snprintf(why, sizeof why, "%s", W->turn_error ? W->turn_error : "its turn failed");
  W->cpu_us += cost;
  K.lane_busy += cost;
  if (why[0]) {
    if (W->status == W_RESTARTING || W->status == W_STOPPED) {   // it never started: count it as a crash of the start
      W->status = W_IDLE;
    }
    crash(W, why);
  } else if (W->in_turn && (W->turn_done || W->turn_rejected)) finish_turn(W);
  if (rc == 0 && booting && !why[0]) start_timers(W, K.vnow + cost);
  K.lane_free = K.vnow + cost;
  K.cur = NULL;
  apply_deferred(K.lane_free);
}

static void handle_event(event_t *e) {
  world_t *W = world_by_id(e->w);
  switch (e->type) {
    case E_DELIVER: {
      msg_t *m = e->msg;
      if (!W || W->status == W_STOPPED) {
        if (m->ask) { char t[96]; snprintf(t, sizeof t, "%s is stopped", W ? W->name : "?"); settle_ask(m->ask, 0, t, NULL, 0); }
        free_msg(m);
        break;
      }
      for (int i = 0; i < m->nh; i++)
        for (int k = 0; k < MAX_HANDLES; k++) if (K.handles[k].live && K.handles[k].id == m->hs[i]) handle_grant(&K.handles[k], W);
      m->t = e->t; m->seq = ++K.seq;
      if (W->mbox_tail) W->mbox_tail->next = m; else W->mbox = m;
      W->mbox_tail = m;
      if (++W->mbox_len > W->mbox_peak) W->mbox_peak = W->mbox_len;
      K.delivered++;
      break;
    }
    case E_TICK:
      if (!W || W->epoch != e->epoch || W->status != W_IDLE) break;
      if (!W->tick_queued[e->a]) {
        msg_t *m = new_msg(M_TICK, "tick", NULL, -1);
        m->timer = e->a; m->t = e->t; m->seq = ++K.seq;
        if (W->mbox_tail) W->mbox_tail->next = m; else W->mbox = m;
        W->mbox_tail = m;
        W->mbox_len++;
        W->tick_queued[e->a] = true;
      }
      { event_t *n = new_event(E_TICK, e->t + MS(W->every_ms[e->a])); n->w = e->w; n->epoch = e->epoch; n->a = e->a; schedule(n); }
      break;
    case E_SETTLE:
      if (W && W->epoch == e->epoch && W->status == W_IDLE) {
        settle_t *s = e->settle;
        s->t = e->t; s->seq = ++K.seq; s->next = NULL;
        if (W->settles_tail) W->settles_tail->next = s; else W->settles = s;
        W->settles_tail = s;
        e->settle = NULL;
      }
      if (e->settle) { free(e->settle->json); free(e->settle); }
      break;
    case E_RESTART:
      if (W && W->epoch == e->epoch && W->status == W_RESTARTING) { W->boot_ready = true; W->boot_t = e->t; W->boot_seq = ++K.seq; }
      break;
    case E_FN:
      e->fn(e->arg, e->a);
      break;
  }
  free(e);
}

void kernel_run_until(vtime_t until) {
  for (;;) {
    bool is_settle;
    world_t *R = pick(&is_settle);
    vtime_t t_lane = K.vnow > K.lane_free ? K.vnow : K.lane_free;
    vtime_t t_ev = heap_n ? heap[0]->t : VT_INF;
    if (R && t_lane <= until && t_lane < t_ev) { K.vnow = t_lane; run_segment(R, is_settle); continue; }
    if (heap_n && t_ev <= until) { event_t *e = pop(); if (e->t > K.vnow) K.vnow = e->t; handle_event(e); continue; }
    break;
  }
  if (K.vnow < until) K.vnow = until;
}

// When kernel_run_until next has something to do: the time the lane is free if a world is runnable, else
// the earliest event, else VT_INF. The real-time loop sleeps until then (or until a bus finishes).
vtime_t kernel_next_wake(void) {
  bool is_settle;
  if (pick(&is_settle)) return K.vnow > K.lane_free ? K.vnow : K.lane_free;
  return heap_n ? heap[0]->t : VT_INF;
}

// ---- boot ----------------------------------------------------------------------------------------------------------
void kernel_init(const char *js_root, const char *uart_path) {
  snprintf(K.js_root, sizeof K.js_root, "%s", js_root);
  K.buses[BUS_I2C0].name = "i2c0";
  K.buses[BUS_SPI2].name = "spi2";
  K.uart = uart_path ? fopen(uart_path, "w") : NULL;
  char p[512];
  snprintf(p, sizeof p, "%s/prelude.js", js_root);
  K.prelude = port_read_file(p, &K.prelude_len);
  if (!K.prelude) { fprintf(stderr, "cannot read %s\n", p); exit(1); }
  vm_calibrate();
}

static uint64_t hash(const char *s) { uint64_t h = 1469598103934665603ull; while (*s) { h ^= (unsigned char)*s++; h *= 1099511628211ull; } return h; }

int kernel_boot(const char *manifest) {
  size_t n;
  char *txt = port_read_file(manifest, &n);
  if (!txt) { fprintf(stderr, "cannot read %s\n", manifest); return -1; }
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  JSValue v = JS_ParseJSON(ctx, txt, n, manifest);
  free(txt);
  if (JS_IsException(v)) { char b[512]; fprintf(stderr, "%s: %s\n", manifest, vm_exception(ctx, b, sizeof b)); return -1; }
  JSValue ws = JS_GetPropertyStr(ctx, v, "worlds");
  JSValue lv = JS_GetPropertyStr(ctx, ws, "length");
  int count = 0; JS_ToInt32(ctx, &count, lv); JS_FreeValue(ctx, lv);
  for (int i = 0; i < count && K.n_worlds < MAX_WORLDS; i++) {
    JSValue o = JS_GetPropertyUint32(ctx, ws, (uint32_t)i);
    world_t *W = calloc(1, sizeof(*W));
    W->id = K.n_worlds;
    JSValue f;
    const char *s;
    f = JS_GetPropertyStr(ctx, o, "name"); s = JS_ToCString(ctx, f); snprintf(W->name, sizeof W->name, "%s", s ? s : "?"); JS_FreeCString(ctx, s); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "file"); s = JS_ToCString(ctx, f); snprintf(W->file, sizeof W->file, "%s", s ? s : "?"); JS_FreeCString(ctx, s); JS_FreeValue(ctx, f);
    double d = 0;
    f = JS_GetPropertyStr(ctx, o, "budget_ms"); W->budget_us = JS_IsUndefined(f) ? MS(50) : (JS_ToFloat64(ctx, &d, f), (vtime_t)(d * 1000)); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "mem_kb"); W->mem_limit = JS_IsUndefined(f) ? 1024 * 1024 : (JS_ToFloat64(ctx, &d, f), (size_t)(d * 1024)); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "priority"); W->prio = JS_IsUndefined(f) ? -1 : (JS_ToFloat64(ctx, &d, f), (int)d); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "claims");
    JSValue cl = JS_GetPropertyStr(ctx, f, "length"); int nc = 0; JS_ToInt32(ctx, &nc, cl); JS_FreeValue(ctx, cl);
    for (int k = 0; k < nc && k < MAX_LIST; k++) {
      JSValue e = JS_GetPropertyUint32(ctx, f, (uint32_t)k);
      s = JS_ToCString(ctx, e); snprintf(W->claims[W->n_claims++], NAME_LEN, "%s", s ? s : ""); JS_FreeCString(ctx, s); JS_FreeValue(ctx, e);
    }
    JS_FreeValue(ctx, f);
    JS_FreeValue(ctx, o);
    char path[512];
    snprintf(path, sizeof path, "%s/%s", K.js_root, W->file);
    W->source = port_read_file(path, NULL);
    if (!W->source) { fprintf(stderr, "cannot read %s\n", path); return -1; }
    snprintf(W->kind, sizeof W->kind, "world");
    snprintf(W->title, sizeof W->title, "%s", W->name);
    W->seed = hash(W->name);
    W->status = W_RESTARTING;
    W->boot_ready = true; W->boot_t = 0; W->boot_seq = ++K.seq;
    W->fn_dispatch = W->fn_render = JS_UNDEFINED;
    K.worlds[K.n_worlds++] = W;
  }
  JS_FreeValue(ctx, ws); JS_FreeValue(ctx, v);
  JS_FreeContext(ctx); JS_FreeRuntime(rt);
  klog("booting %d worlds from %s", K.n_worlds, manifest);
  return 0;
}

void kernel_shutdown(void) {
  for (int i = 0; i < K.n_worlds; i++) vm_dispose(K.worlds[i]);
  if (K.uart) fclose(K.uart);
}

// ---- reports ---------------------------------------------------------------------------------------------------
static const char *state_name(world_t *W) {
  if (W->status == W_STOPPED) return "stopped";
  if (W->status == W_RESTARTING) return "restarting";
  if (W->in_turn) return W->turn_async ? "waiting" : "busy";
  return "idle";
}

char *kernel_worlds_json(void) {
  sbuf_t b = { 0 };
  sb_add(&b, "[");
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    sb_add(&b, i ? ",{\"name\":" : "{\"name\":"); sb_json_str(&b, W->name);
    sb_add(&b, ",\"kind\":"); sb_json_str(&b, W->kind);
    sb_add(&b, ",\"title\":"); sb_json_str(&b, W->title);
    sb_printf(&b, ",\"state\":\"%s\",\"turns\":%llu,\"msgs\":%llu,\"cpu_ms\":%.3f,\"mem_kb\":%.1f,\"limit_kb\":%zu,\"mbox\":%d,\"mbox_peak\":%d,\"restarts\":%d,\"budget_ms\":%lld",
              state_name(W), (unsigned long long)W->turns, (unsigned long long)W->msgs, W->cpu_us / 1000.0, W->mem_used / PROFILE.mem_scale / 1024.0,
              W->mem_limit / 1024, W->mbox_len, W->mbox_peak, restarts_of(W), (long long)(W->budget_us / 1000));
    sb_add(&b, ",\"last_error\":"); sb_json_str(&b, W->last_error);
    sb_add(&b, ",\"claims\":[");
    for (int k = 0; k < W->n_claims; k++) { if (k) sb_add(&b, ","); sb_json_str(&b, W->claims[k]); }
    sb_add(&b, "]}");
  }
  sb_add(&b, "]");
  return b.s;
}

char *kernel_stats_json(void) {
  sbuf_t b = { 0 };
  char *buses = hw_buses_json();
  int nh = 0;
  for (int i = 0; i < MAX_HANDLES; i++) nh += K.handles[i].live;
  sb_printf(&b, "{\"t_ms\":%.3f,\"lane_busy_ms\":%.3f,\"turns\":%llu,\"segments\":%llu,\"published\":%llu,\"delivered\":%llu,\"crashes\":%llu,\"handles\":%d,\"step_ns\":%.1f,\"buses\":%s}",
            kernel_now() / 1000.0, K.lane_busy / 1000.0, (unsigned long long)K.turns, (unsigned long long)K.segments,
            (unsigned long long)K.published, (unsigned long long)K.delivered, (unsigned long long)K.crashes, nh, PROFILE.ns_per_step, buses);
  free(buses);
  return b.s;
}

void kernel_stats_print(void) {
  printf("t = %.1f ms, lane busy %.1f ms (%.1f%%), %llu turns, %llu published, %llu delivered, %llu crashes\n",
         K.vnow / 1000.0, K.lane_busy / 1000.0, K.vnow ? 100.0 * K.lane_busy / K.vnow : 0.0, (unsigned long long)K.turns,
         (unsigned long long)K.published, (unsigned long long)K.delivered, (unsigned long long)K.crashes);
  printf("  %-11s %-8s %-10s %7s %9s %8s %6s %4s  %s\n", "world", "kind", "state", "turns", "cpu ms", "mem KB", "limit", "rst", "last error");
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    printf("  %-11s %-8s %-10s %7llu %9.2f %8.1f %6zu %4d  %s\n", W->name, W->kind, state_name(W), (unsigned long long)W->turns, W->cpu_us / 1000.0,
           W->mem_used / PROFILE.mem_scale / 1024.0, W->mem_limit / 1024, restarts_of(W), W->last_error);
  }
  for (int i = 0; i < N_BUSES; i++)
    printf("  bus %-5s busy %8.2f ms, %llu transfers, %llu bytes, %llu errors\n", K.buses[i].name, K.buses[i].busy_us / 1000.0,
           (unsigned long long)K.buses[i].transfers, (unsigned long long)K.buses[i].bytes, (unsigned long long)K.buses[i].errors);
}

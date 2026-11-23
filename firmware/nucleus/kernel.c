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
#include "kernel_internal.h"
#if PICOCALC_MOBILE_PAINTER
#include "../sdk/typed/chess-psix.h"
#endif

kernel_t K;
#if PICOCALC_MOBILE_PAINTER
unsigned painter_pending[2];
#endif
vtime_t apply_at = -1;
vtime_t frozen_now = -1;
#ifdef BOARD_PAPERS3
// The PaperS3: an ESP32-S3 at 240 MHz with octal PSRAM, worlds on MicroQuickJS, 8-bit gray framebuffers.
// Estimates until the device has measured them (design doc, phase 5).
profile_t PROFILE = {
  .name = "esp32s3-papers3",
  .ns_per_step = 2500,          // replaced by vm_calibrate()
  .turn_base_us = 60,
  .fill_ns_per_px = 2.0,        // 8-bit stores into PSRAM
  .text_ns_per_px = 6.0,        // read, blend, write
  .diff_ns_per_px = 0.8,        // byte compares, a word at a time
  .json_ns_per_byte = 40,
  .spi_chunk_us = 0,
  .mem_scale = sizeof(void *) == 8 ? 1.7 : 1.0,   // 64-bit JSValues on the host; the test worlds' live sizes on Xtensa (QEMU) agree within 3%
  .loop_ms = 250,               // estimate: the 100k loop on mquickjs at 240 MHz
  .wasm_ns_per_op = 60,         // estimate: WAMR's fast interpreter at 240 MHz (no WebAssembly on this device)
};
#else
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
  .loop_ms = 133,               // measured (esp32-s3-m5/0101); vm.c uses it as a constant
  .wasm_ns_per_op = 70,         // measured: natives/bench.c, 0.866 us per 12.5-instruction iteration (PICOCALC-NATIVE N4)
};
#endif

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
int restarts_of(world_t *W) { return W->restarts > 0 ? W->restarts - 1 : 0; }   // restarts counts boots
vtime_t kernel_now(void) {
  if (frozen_now >= 0) return frozen_now;
  if (K.realtime) return port_clock();
  if (!K.cur) return apply_at >= 0 ? apply_at : K.vnow;
  return K.vnow + PROFILE.turn_base_us + (vtime_t)(eng_steps(K.cur) * PROFILE.ns_per_step / 1000.0) + K.seg_cost;
}
void klog(const char *fmt, ...) {
  char b[1024];
  va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  if (K.uart) fprintf(K.uart, "[%10.3f] %s\n", kernel_now() / 1000.0, b);
  if (K.verbose) fprintf(stderr, "[%10.3f] %s\n", kernel_now() / 1000.0, b);
  kernel_log_add(kernel_now(), b);
}

// The log ring: the last LOG_LINES lines, numbered from 1, so a reader asks for the lines after the last one it has
// and sees from the oldest number still here whether it missed some. The port's own log (ESP-IDF's on the device)
// adds lines from other tasks, so every access holds the port's log lock, and only for a copy.
#define LOG_LINES 256
#define LOG_TEXT 120
#define LOG_PAGE 64
typedef struct { uint32_t n; int64_t t_us, wall_ms; char s[LOG_TEXT]; } log_line_t;
static log_line_t *ring;
static uint32_t ring_next = 1;

void kernel_log_init(void) { if (!ring) ring = calloc(LOG_LINES, sizeof *ring); }
void kernel_log_add(vtime_t t_us, const char *text) {
  if (!ring || !text) return;
  char s[LOG_TEXT];
  size_t n = 0;
  const char *p = text;
  for (; *p && n < sizeof s - 1; p++) {
    if (*p == '\033' && p[1] == '[') {   // a colour code: ESC [ ... letter
      for (p += 2; *p && !((*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z')); p++) { }
      if (!*p) break;
      continue;
    }
    s[n++] = *p == '\n' || *p == '\r' || *p == '\t' ? ' ' : *p;
  }
  if (((unsigned char)*p & 0xc0) == 0x80) {   // cut in the middle of a character: drop its first bytes too
    while (n > 0 && ((unsigned char)s[n - 1] & 0xc0) == 0x80) n--;
    if (n > 0) n--;
  }
  while (n > 0 && s[n - 1] == ' ') n--;
  s[n] = 0;
  if (!n) return;
  int64_t wall = port_wall_ms();
  port_log_lock();
  log_line_t *l = &ring[ring_next % LOG_LINES];
  l->n = ring_next++; l->t_us = t_us; l->wall_ms = wall;
  memcpy(l->s, s, n + 1);
  port_log_unlock();
}

char *kernel_log_json(uint32_t after) {
  log_line_t *copy = malloc(sizeof(log_line_t) * LOG_PAGE);
  int got = 0;
  uint32_t first, next;
  port_log_lock();
  next = ring_next;
  first = next > LOG_LINES ? next - LOG_LINES : 1;
  for (uint32_t n = after + 1 > first ? after + 1 : first; ring && copy && n < next && got < LOG_PAGE; n++) copy[got++] = ring[n % LOG_LINES];
  port_log_unlock();
  sbuf_t b = { 0 };
  sb_printf(&b, "{\"first\":%u,\"next\":%u,\"lines\":[", (unsigned)first, (unsigned)next);
  for (int i = 0; i < got; i++) {
    sb_printf(&b, "%s{\"n\":%u,\"t\":%lld,\"wall\":%lld,\"s\":", i ? "," : "", (unsigned)copy[i].n,
              (long long)(copy[i].t_us / 1000), (long long)copy[i].wall_ms);
    sb_json_str(&b, copy[i].s);
    sb_add(&b, "}");
  }
  sb_add(&b, "]}");
  free(copy);
  return b.s;
}

// A fault frame on the UART: one line, "#OCT1 " and a JSON object. A host-side handler reads these
// (and could answer on the RX line) without the device needing a network.
void uart_fault(world_t *W, const char *why, const char *detail) {
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
// Channels that carry what the user types or sees: a world needs or provides one only with its claim, so no world
// can listen to keystrokes or read another app's screen, or forge either, unless the manifest says it may.
static const struct { const char *channel, *claim; } GUARDED[] = {
  { "keys", "keys.raw" }, { "frames", "frames.read" }, { "touch", "touch.raw" },
};
const char *channel_claim(const char *ch) {
  for (size_t i = 0; i < sizeof GUARDED / sizeof GUARDED[0]; i++) if (!strcmp(GUARDED[i].channel, ch)) return GUARDED[i].claim;
  return NULL;
}
bool world_may_use(world_t *W, const char *ch) { const char *c = channel_claim(ch); return !c || world_claims(W, c); }
bool channels_allowed(world_t *W) {
  for (int l = 0; l < 2; l++) {
    char (*names)[NAME_LEN] = l ? W->provides : W->needs;
    for (int i = 0, n = l ? W->n_provides : W->n_needs; i < n; i++)
      if (!world_may_use(W, names[i])) {
        snprintf(W->last_error, sizeof W->last_error, "the channel \"%s\" takes the claim %s, which the manifest does not give %s",
                 names[i], channel_claim(names[i]), W->name);
        return false;
      }
  }
  return true;
}
bool alive(world_t *W) { return W->status == W_IDLE && eng_running(W); }

msg_t *new_msg(int kind, const char *type, const char *json, int from) {
  msg_t *m = calloc(1, sizeof(*m));
  m->kind = kind; m->type = xstrdup(type ? type : ""); m->json = xstrdup(json); m->from = from;
  return m;
}
void free_msg(msg_t *m) {
  if (!m) return;
#if PICOCALC_MOBILE_PAINTER
  if (m->painter_length) painter_pending[m->painter_source]--;
#endif
  free(m->type); free(m->json); free(m);
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
#if PICOCALC_AGENDA_EARLY_BOOT
    if (ok && !W->boot_ready && (set || W->mbox->kind == M_START)) {
      extern bool p4_agenda_boot_dispatch(const world_t *, int);
      if (p4_agenda_boot_dispatch(W, set ? W->settles->promise : 0)) pr = 11;
    }
#endif
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
  handle_t *h = W->turn_irq ? handle_find(W->turn_irq) : NULL;
  if (h && h->irq_mode) { h->irq_pending = false; port_gpio_arm(h->addr, h->irq_mode); }   // the next interrupt may come
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
#if PICOCALC_TYPED_AGENDA
  extern void p4_agenda_stage(const world_t *, const char *);
  if (booting) p4_agenda_stage(W, "world-init");
  if (is_settle) p4_agenda_stage(W, "settle");
#endif
  if (booting) {
    if (K.trace) klog("starting %s (%s)", W->name, W->file);
    W->boot_ready = false;
    budget_kind = "start";
    budget = MS(600);
    rc = boot_world(W);
#if PICOCALC_TYPED_AGENDA
    p4_agenda_stage(W, "world-init-done");
#endif
    if (rc == 0 && W->restarts++ > 0) publish_status(W, "running", NULL, 0);
  } else {
    eng_begin_segment(W, budget);
    if (is_settle) {
      settle_t *s = W->settles;
      W->settles = s->next;
      if (!W->settles) W->settles_tail = NULL;
      rc = eng_settle(W, s);
      free(s->json); free(s);
    } else {
      msg_t *m = W->mbox;
      W->mbox = m->next;
      if (!W->mbox) W->mbox_tail = NULL;
      W->mbox_len--;
      W->in_turn = true; W->turn_ask = m->ask; W->msgs++;
      W->turn_started = K.vnow;
      if (m->kind == M_TICK) { W->tick_queued[m->timer] = false; snprintf(W->turn_type, sizeof W->turn_type, "every %d ms", W->every_ms[m->timer]); }
      else if (m->kind == M_IRQ) { W->turn_irq = m->irq; snprintf(W->turn_type, sizeof W->turn_type, "irq"); }
      else snprintf(W->turn_type, sizeof W->turn_type, "%s", m->type);
      if (K.trace) {
        world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
        // keystrokes are not logged: one of them may be part of a password
        bool typed = !strcmp(m->type, "key") || !strcmp(m->type, "keys");
        klog("%s <- %s%s from %s %.120s", W->name, W->turn_type, m->ask ? " (ask)" : "", F ? F->name : "kernel",
             typed ? "[key]" : m->json ? m->json : "");
      }
      rc = eng_dispatch(W, m);
      free_msg(m);
    }
  }
  vtime_t t_render = K.realtime ? port_clock() : 0;
  if (K.realtime) W->prof_engine_us += t_render - K.vnow;
  // render what the world shows, as part of its segment
  // (only the world on screen, once the compositor names one, and any world that has not shown a frame yet)
  bool shown = !K.front || K.front == W->id + 1 || !W->frame;
  if (rc == 0 && !booting && eng_running(W) && W->has_screen && shown && !W->oom && !W->overrun) {
    char *f = eng_render(W);
    if (f && (!W->frame || strcmp(f, W->frame))) {
      free(W->frame); W->frame = f;
      char *post = frame_message(W);
      kernel_publish(W, "frames", post, NULL, 0);
#if PICOCALC_TYPED_AGENDA
      extern void p4_agenda_frame(world_t *, vtime_t);
      p4_agenda_frame(W, K.vnow);
#endif
      free(post);
    } else free(f);
  }
  if (K.realtime) W->prof_render_us += port_clock() - t_render;
  W->prof_segments++;
  int64_t steps = eng_steps(W);
  W->prof_steps += steps;
  vtime_t cost = K.realtime ? port_clock() - K.vnow
                            : PROFILE.turn_base_us + (vtime_t)(steps * PROFILE.ns_per_step / 1000.0) + K.seg_cost;
  char why[300] = "";
  if (W->oom) snprintf(why, sizeof why, "ran out of memory (its limit is %zu KB)", W->mem_limit / 1024);
#if PICOCALC_CANDELA_WORLD
  else if (W->overrun) snprintf(why, sizeof why, "ran past its %s budget of %lld %sms", W->seg_long ? "long segment" : budget_kind, (long long)((W->seg_long ? W->long_budget_us : budget) / 1000), K.realtime || W->engine == ENG_NATIVE ? "" : "virtual ");   // a process runs in real time
#else
  else if (W->overrun) snprintf(why, sizeof why, "ran past its %s budget of %lld %sms", budget_kind, (long long)(budget / 1000), K.realtime || W->engine == ENG_NATIVE ? "" : "virtual ");   // a process runs in real time
#endif
  else if (rc < 0) snprintf(why, sizeof why, "%s", W->last_error);
  else if (W->turn_failed) snprintf(why, sizeof why, "%s", W->turn_error ? W->turn_error : "its turn failed");
  W->cpu_us += cost;
  K.lane_busy += cost;
#if PICOCALC_TYPED_AGENDA
  // finish_turn and crash clear the current turn label.
  extern void p4_agenda_world_segment(const world_t *, vtime_t, vtime_t, bool);
  p4_agenda_world_segment(W, K.vnow, cost, booting);
#endif
  if (why[0]) {
    if (W->status == W_RESTARTING || W->status == W_STOPPED) {   // it never started: count it as a crash of the start
      W->status = W_IDLE;
    }
    crash(W, why);
  } else if (W->in_turn && (W->turn_done || W->turn_rejected)) finish_turn(W);
  if (rc == 0 && booting && !why[0]) { start_timers(W, K.vnow + cost); replay_retained(W); }
  K.lane_free = K.vnow + cost;
  K.cur = NULL;
  apply_deferred(K.lane_free);
}

static void handle_event(event_t *e) {
  world_t *W = world_by_id(e->w);
  switch (e->type) {
    case E_DELIVER: {
      msg_t *m = e->msg;
#if PICOCALC_MOBILE_PAINTER
      if (m->painter_length && (!W || !kernel_chess_painter_current(W, m))) { free_msg(m); break; }
#endif
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
      if (!W || W->epoch != e->epoch || W->status != W_IDLE || W->timer_off[e->a] || e->b != W->timer_gen[e->a]) break;
      if (!W->tick_queued[e->a]) {
        msg_t *m = new_msg(M_TICK, "tick", NULL, -1);
        m->timer = e->a; m->t = e->t; m->seq = ++K.seq;
        if (W->mbox_tail) W->mbox_tail->next = m; else W->mbox = m;
        W->mbox_tail = m;
        W->mbox_len++;
        W->tick_queued[e->a] = true;
      }
      { event_t *n = new_event(E_TICK, e->t + MS(W->every_ms[e->a])); n->w = e->w; n->epoch = e->epoch; n->a = e->a; n->b = e->b; schedule(n); }
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
    if (K.halted) return;   // the board is off: its time passes outside the kernel (host/main_host.c)
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

// The host's power-off: what a cold boot would find, so kernel_init and kernel_boot can run again in this process.
// The console log, the verbosity and the JS root stay; the board (its glass, clock and store) is the board's.
void kernel_reset(void) {
  discard_deferred();
  for (int i = 0; i < heap_n; i++) {
    event_t *e = heap[i];
    free_msg(e->msg);
    if (e->settle) { free(e->settle->json); free(e->settle); }
    free(e);
  }
  heap_n = 0;
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    eng_dispose(W);
    for (msg_t *m = W->mbox; m; ) { msg_t *n = m->next; free_msg(m); m = n; }
    for (settle_t *st = W->settles; st; ) { settle_t *n = st->next; free(st->json); free(st); st = n; }
    free(W->source); free(W->frame); free(W->trace); free(W->turn_result); free(W->turn_error); free(W->icon);
    drop_retained(W);
    free(W);
  }
  for (int i = 0; i < MAX_BUFS; i++) if (K.bufs[i].live) { port_big_free(K.bufs[i].back); port_big_free(K.bufs[i].front); }
  free(K.prelude);
  FILE *uart = K.uart;
  bool verbose = K.verbose, quiet = K.quiet, trace = K.trace, realtime = K.realtime;
  char root[sizeof K.js_root];
  memcpy(root, K.js_root, sizeof root);
  memset(&K, 0, sizeof K);
#if PICOCALC_MOBILE_PAINTER
  memset(painter_pending, 0, sizeof painter_pending);
#endif
  K.uart = uart; K.verbose = verbose; K.quiet = quiet; K.trace = trace; K.realtime = realtime;
  memcpy(K.js_root, root, sizeof root);
  apply_at = -1; frozen_now = -1;
  vm_reset();
}


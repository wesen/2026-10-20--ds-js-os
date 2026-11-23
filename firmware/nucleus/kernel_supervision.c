// Supervision (crashes, backoff, restarts), apps from storage, booting a world and booting the system.
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_internal.h"
#if PICOCALC_MOBILE_PAINTER
#include "../sdk/typed/chess-psix.h"
#endif

// ---- supervision --------------------------------------------------------------------------------------------
void clear_turn(world_t *W) {
  W->in_turn = false; W->turn_ask = 0; W->turn_irq = 0; W->turn_async = W->turn_done = W->turn_failed = W->turn_rejected = false;
  free(W->turn_result); free(W->turn_error); W->turn_result = W->turn_error = NULL; W->reply_nh = 0;
}

static void fail_mailbox(world_t *W, const char *why) {
  msg_t *m = W->mbox;
  while (m) { msg_t *n = m->next; if (m->ask) settle_ask(m->ask, 0, why, NULL, 0); free_msg(m); m = n; }
  W->mbox = W->mbox_tail = NULL; W->mbox_len = 0;
}

// What a world leaves when its VM goes: the ask it was answering fails with why, its handles, pending replies, turn,
// frame and ticks go, and a new epoch makes stale timers and replies miss it.
static void teardown(world_t *W, const char *why) {
  if (W->in_turn && W->turn_ask) settle_ask(W->turn_ask, 0, why, NULL, 0);
  eng_dispose(W);
  handles_drop_world(W);
  while (W->settles) { settle_t *s = W->settles; W->settles = s->next; free(s->json); free(s); }
  W->settles_tail = NULL;
  clear_turn(W);
  free(W->frame); W->frame = NULL;
  drop_retained(W);
#if PICOCALC_MOBILE_PAINTER
  msg_t **link = &W->mbox;
  W->mbox_tail = NULL;
  while (*link) {
    msg_t *m = *link;
    if (m->painter_length) {
      *link = m->next;
      W->mbox_len--;
      free_msg(m);
    } else {
      W->mbox_tail = m;
      link = &m->next;
    }
  }
#endif
  for (int i = 0; i < MAX_LIST; i++) W->tick_queued[i] = false;
  W->epoch++;
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
  teardown(W, t);
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

// ---- apps from storage ----------------------------------------------------------------------------------------
// A spawned world is named u-<name> and gets no claims; spawning the same name again keeps its slot (world ids are
// referenced by handles, asks and timers, so a slot never changes hands) and boots the new source.
static uint64_t hash(const char *s);
static int spawn_named(const char *wname, const char *name, const char *source, size_t len, int engine, vtime_t at, char *why, size_t n) {
  world_t *W = world_by_name(wname);
  if (W && !W->user) { snprintf(why, n, "%s is a system world", wname); return -1; }
  char *copy = malloc(len + 1);
  if (!copy) { snprintf(why, n, "source allocation failed"); return -1; }
  memcpy(copy, source, len);
  copy[len] = 0;
  if (!W) {
    if (K.n_worlds >= MAX_WORLDS) { free(copy); snprintf(why, n, "no room for another world (%d at most)", MAX_WORLDS); return -1; }
    W = calloc(1, sizeof(*W));
    if (!W) { free(copy); snprintf(why, n, "world allocation failed"); return -1; }
    W->id = K.n_worlds;
    snprintf(W->name, sizeof W->name, "%s", wname);
    snprintf(W->kind, sizeof W->kind, "world");
    snprintf(W->title, sizeof W->title, "%s", wname);
    W->budget_us = MS(50); W->mem_limit = 384 * 1024; W->store_limit = 8 * 1024; W->prio = -1;
    W->user = true;
    W->seed = hash(wname);
    W->status = W_STOPPED;
    K.worlds[K.n_worlds++] = W;
  }
  if (W->status == W_IDLE) { teardown(W, "it was started again"); W->status = W_RESTARTING; }   // with its old engine
  free(W->source);
  W->source = copy;
  W->source_len = len;
  W->engine = engine;
  snprintf(W->file, sizeof W->file, "apps/%s.%s", name, engine == ENG_NATIVE ? "elf" : engine == ENG_WASM ? "wasm" : "js");
  if (W->status == W_STOPPED) W->status = W_RESTARTING;
  if (!W->boot_ready) { W->boot_ready = true; W->boot_t = at; W->boot_seq = ++K.seq; }   // a pending restart's event is now stale
  W->epoch++;
  W->n_crash_times = 0;
  W->last_error[0] = 0;
  klog("starting %s from storage (%zu bytes%s)", wname, len, engine == ENG_WASM ? ", WebAssembly" : "");
  return 0;
}

int kernel_spawn(const char *name, const char *source, size_t len, int engine, vtime_t at, char *why, size_t n) {
  char wname[NAME_LEN];
  snprintf(wname, sizeof wname, "u-%s", name);
  return spawn_named(wname, name, source, len, engine, at, why, n);
}

// Only the physical operator's installer calls this. sys.spawn always has a u- prefix.
int kernel_develop(const char *source, size_t len, int engine, char *why, size_t n) {
  int rc = spawn_named("dev-cji", "dev-cji", source, len, engine, kernel_now(), why, n);
  if (rc == 0) {
    world_t *W = world_by_name("dev-cji");
    fail_mailbox(W, "development revision replaced");
    W->prio = -1; // derive priority from the new revision's declared kind
    memset(W->timer_off, 0, sizeof W->timer_off);
  }
  return rc;
}

// The end of sys.spawn(name, handle): the file's bytes have been read (fs.c, FS_LOAD) without passing through any
// world. A module that starts with \0asm is WebAssembly; anything else must be JavaScript text. Machine code is
// never started from storage: on the P4 it would run unisolated, and on the host only the manifest names it.
void kernel_spawn_loaded(fs_job_t *j, vtime_t at) {
  char why[200] = "";
  if (j->ok) {
    bool wasm = j->len >= 4 && !memcmp(j->data, "\0asm", 4);
    if (!wasm && (j->len > USER_SOURCE_MAX || memchr(j->data, 0, j->len) || !utf8_valid((const unsigned char *)j->data, j->len)))
      snprintf(why, sizeof why, "%s is neither JavaScript (UTF-8 text, at most %d KB) nor WebAssembly", j->path, USER_SOURCE_MAX / 1024);
    else if (kernel_spawn(j->name, j->data, j->len, wasm ? ENG_WASM : ENG_JS, at, why, sizeof why)) {}
    else {
      char r[96];
      snprintf(r, sizeof r, "{\"world\":\"u-%s\",\"engine\":\"%s\"}", j->name, wasm ? "wasm" : "js");
      kernel_settle_at(j->w, j->epoch, j->promise, 1, xstrdup(r), at);
      return;
    }
    sbuf_t b = { 0 };
    sb_json_str(&b, why);
    kernel_settle_at(j->w, j->epoch, j->promise, 0, b.s, at);
    return;
  }
  kernel_settle_at(j->w, j->epoch, j->promise, 0, j->json, at);   // why the file could not be read
  j->json = NULL;
}

void kernel_stop_world(world_t *W, const char *by) {
  if (W->status == W_STOPPED) return;
  char t[160];
  snprintf(t, sizeof t, "%s was stopped by %s", W->name, by);
  if (W->status == W_IDLE) teardown(W, t);
  else W->epoch++;   // a restart that was due is cancelled
  W->boot_ready = false;
  W->status = W_STOPPED;
  W->n_crash_times = 0;
  snprintf(W->last_error, sizeof W->last_error, "stopped by %s", by);
  fail_mailbox(W, t);
  klog("%s", t);
  publish_status(W, "stopped", W->last_error, 0);
}

// ---- booting a world (a segment on the lane) ------------------------------------------------------------------
static void start_timer(world_t *W, int i, vtime_t at) {
  if (W->every_ms[i] <= 0 || W->timer_off[i]) return;
  event_t *e = new_event(E_TICK, at + MS(W->every_ms[i]));
  e->w = W->id; e->epoch = W->epoch; e->a = i; e->b = W->timer_gen[i];
  schedule(e);
}
void start_timers(world_t *W, vtime_t at) { for (int i = 0; i < W->n_every; i++) start_timer(W, i, at); }

// A watched pin fired. The world that holds its handle gets an "irq" message; the port keeps the pin masked
// until that turn ends (finish_turn re-arms it), so one interrupt at a time is outstanding and a line that
// stays active cannot flood the mailbox.
void kernel_irq(int handle_id, vtime_t t) {
  handle_t *h = handle_find(handle_id);
  if (!h || !h->irq_mode || h->irq_pending) return;
  world_t *W = world_by_id(h->minter);
  if (!W || !alive(W)) return;   // a world on its way down: its handles are dropped, which unwatches the pin
  h->irq_pending = true;
  char json[64];
  snprintf(json, sizeof json, "{\"pin\":%d,\"t\":%.3f}", h->addr, t / 1000.0);
  msg_t *m = new_msg(M_IRQ, "irq", json, -1);
  m->irq = h->id;
  defer_deliver(W, m);
}

// Stopping a timer drops the ticks already scheduled (their generation is old); starting it again ticks one
// period from now. A world that is not running only records the setting, for when it starts.
void kernel_timer_set(world_t *W, int i, bool on) {
  if (i < 0 || i >= W->n_every || W->timer_off[i] == !on) return;
  W->timer_off[i] = !on;
  W->timer_gen[i]++;
  if (on && W->status == W_IDLE && eng_running(W)) start_timer(W, i, K.vnow);
}

int boot_world(world_t *W) {
  free(W->icon); W->icon = NULL; W->about[0] = W->key[0] = 0;   // declared again by the code that starts now
  int rc = eng_create(W);
  if (rc) return rc;
  if (!channels_allowed(W)) return -1;
  if (W->user) snprintf(W->title, sizeof W->title, "%s", W->name);   // no app from storage may call itself "Settings"
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

// ---- boot ----------------------------------------------------------------------------------------------------------
void kernel_init(const char *js_root, const char *uart_path) {
  snprintf(K.js_root, sizeof K.js_root, "%s", js_root);
  for (const char *const *b = port_bus_names(); *b && K.n_buses < MAX_BUSES; b++) K.buses[K.n_buses++].name = *b;
  if (uart_path) K.uart = fopen(uart_path, "w");   // else whatever the port set (the device: stdout)
  kernel_log_init();
  char p[512];
  snprintf(p, sizeof p, "%s/prelude.js", js_root);
  K.prelude = port_read_file(p, &K.prelude_len);
  if (!K.prelude) { fprintf(stderr, "cannot read %s\n", p); exit(1); }
  vm_calibrate();
}

static uint64_t hash(const char *s) { uint64_t h = 1469598103934665603ull; while (*s) { h ^= (unsigned char)*s++; h *= 1099511628211ull; } return h; }

// One world of the manifest, as the engine binding parsed it.
static int add_world(void *arg, const manifest_world_t *mw) {
  (void)arg;
  if (K.n_worlds >= MAX_WORLDS) return 0;
  world_t *W = calloc(1, sizeof(*W));
  W->id = K.n_worlds;
  snprintf(W->name, sizeof W->name, "%s", mw->name);
  snprintf(W->file, sizeof W->file, "%s", mw->file);
  W->budget_us = mw->has_budget ? (vtime_t)(mw->budget_ms * 1000) : MS(50);
  W->mem_limit = mw->has_mem ? (size_t)(mw->mem_kb * 1024) : 1024 * 1024;
  W->prio = mw->has_prio ? (int)mw->priority : -1;
  W->store_limit = mw->has_store ? (size_t)(mw->store_kb * 1024) : 16 * 1024;
#if PICOCALC_CANDELA_WORLD
  W->long_budget_us = mw->has_long ? (vtime_t)(mw->long_ms * 1000) : 0;
  W->js_stack = mw->has_stack ? (size_t)(mw->stack_kb * 1024) : 0;
#endif
  for (int k = 0; k < mw->n_claims && k < MAX_LIST; k++) snprintf(W->claims[W->n_claims++], NAME_LEN, "%s", mw->claims[k]);
  W->engine = mw->engine[0] ? engine_index(mw->engine) : ENG_JS;
  if (W->engine < 0) { fprintf(stderr, "%s: there is no engine \"%s\" (js, wasm, native)\n", W->name, mw->engine); free(W); return -1; }
  char path[512];
  snprintf(path, sizeof path, "%s/%s", K.js_root, W->file);
  W->source = port_read_file(path, &W->source_len);   // JavaScript text, or a binary's bytes
  if (!W->source) { fprintf(stderr, "cannot read %s\n", path); free(W); return -1; }
  snprintf(W->kind, sizeof W->kind, "world");
  snprintf(W->title, sizeof W->title, "%s", W->name);
  W->seed = hash(W->name);
  W->status = W_RESTARTING;
  W->boot_ready = true; W->boot_t = 0; W->boot_seq = ++K.seq;
  K.worlds[K.n_worlds++] = W;
  return 0;
}

// May run more than once: each manifest adds its worlds (the P4 boots its machine-code worlds from a second one).
int kernel_boot(const char *manifest) {
  size_t n;
  int before = K.n_worlds;
  char *txt = port_read_file(manifest, &n);
  if (!txt) { fprintf(stderr, "cannot read %s\n", manifest); return -1; }
  int rc = vm_read_manifest(txt, n, manifest, add_world, NULL);
  free(txt);
  if (rc) return -1;
  klog("booting %d worlds from %s", K.n_worlds - before, manifest);
  return 0;
}

void kernel_shutdown(void) {
  for (int i = 0; i < K.n_worlds; i++) eng_dispose(K.worlds[i]);
  if (K.uart) fclose(K.uart);
}


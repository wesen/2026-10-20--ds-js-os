// Deferred effects (what a segment did, applied when it ends), channels and asks (kernel.c has the lane).
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_internal.h"
#if PICOCALC_MOBILE_PAINTER
#include "../sdk/typed/chess-psix.h"
#endif

// ---- deferred effects --------------------------------------------------------------------------------------
void defer(deferred_t *d) {
  if (!K.cur) { d->run(d, apply_at >= 0 ? apply_at : K.vnow); free(d); return; }
  d->next = NULL;
  if (K.defer_tail) K.defer_tail->next = d; else K.defer_head = d;
  K.defer_tail = d;
}
void apply_deferred(vtime_t at) {
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
void discard_deferred(void) {
  while (K.defer_head) {
    deferred_t *d = K.defer_head;
    K.defer_head = d->next;
    free_msg(d->msg); free(d->bytes); free(d->json); fs_job_free(d->job); free(d);
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

#if PICOCALC_MOBILE_PAINTER
bool kernel_chess_painter_send(world_t *from, world_t *to, bool source, const uint8_t *bytes, size_t length) {
  const unsigned max_pending = source ? 2 : 8;
  const unsigned max_bytes = source ? CHESS_PAINTER_SOURCE_MAX : CHESS_PSIX_MAX;
  if (!bytes || !length || length > max_bytes || painter_pending[source] >= max_pending) return false;
  msg_t *m = calloc(1, sizeof(*m) + length);
  deferred_t *d = calloc(1, sizeof(*d));
  if (!m || !d) { free(m); free(d); return false; }
  const char *name = source ? "painter.source" : "painter.frame";
  size_t name_size = strlen(name) + 1;
  m->type = malloc(name_size);
  if (!m->type) { free(m); free(d); return false; }
  memcpy(m->type, name, name_size);
  m->kind = M_ON;
  m->from = from->id;
  m->painter_from_epoch = from->epoch;
  m->painter_to_epoch = to->epoch;
  m->painter_source = source;
  m->painter_length = length;
  memcpy(m + 1, bytes, length);
  painter_pending[source]++;
  d->run = run_deliver; d->w = to->id; d->msg = m;
  defer(d);
  return true;
}

bool kernel_chess_painter_current(const world_t *to, const msg_t *m) {
  world_t *from = world_by_id(m->from);
  return from && from->status == W_IDLE && from->epoch == m->painter_from_epoch &&
         to->engine == ENG_NATIVE && to->epoch == m->painter_to_epoch;
}
#endif

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
    if (T == from || T->status == W_STOPPED || !world_needs(T, ch) || !world_may_use(T, ch)) continue;
    msg_t *m = new_msg(M_ON, ch, json, from ? from->id : -1);
    for (int k = 0; k < nh && k < MAX_MSG_HANDLES; k++) m->hs[m->nh++] = hs[k];
    defer_deliver(T, m);
  }
}

// Retained posts. A post is an event unless its publisher says it is state ({ retain: true }): then the kernel keeps
// the last one per publisher and channel, and a world that starts later and needs the channel is given it (after its
// start message), so a restarted compositor learns the battery level without waiting for it to change. A world's
// frame is its retained post on "frames", kept in W->frame. Retained posts go with their publisher (teardown).
static int provided(world_t *W, const char *ch) { for (int i = 0; i < W->n_provides; i++) if (!strcmp(W->provides[i], ch)) return i; return -1; }

int kernel_retain(world_t *W, const char *ch, const char *json, char *why, size_t n) {
  int i = provided(W, ch);
  if (i < 0) { snprintf(why, n, "%s does not provide the channel \"%s\"", W->name, ch); return -1; }
  size_t len = json ? strlen(json) : 4, old = W->retained[i] ? strlen(W->retained[i]) : 0;
  if (W->retained_bytes - old + len > RETAIN_MAX) { snprintf(why, n, "a world's retained posts are at most %d bytes", RETAIN_MAX); return -1; }
  free(W->retained[i]);
  W->retained[i] = xstrdup(json ? json : "null");
  W->retained_bytes = W->retained_bytes - old + len;
  return 0;
}

void drop_retained(world_t *W) {
  for (int i = 0; i < MAX_LIST; i++) { free(W->retained[i]); W->retained[i] = NULL; }
  W->retained_bytes = 0;
}

// The post on "frames" for W's frame, as the compositor gets it: the kernel names the app, so no world can show a
// frame in another's name.
char *frame_message(world_t *W) {
  sbuf_t b = { 0 };
  sb_add(&b, "{\"app\":"); sb_json_str(&b, W->name);
  sb_add(&b, ",\"title\":"); sb_json_str(&b, W->title);
  sb_add(&b, ",\"frame\":"); sb_add(&b, W->frame); sb_add(&b, "}");
  return b.s;
}

// What T missed while it was not running: every other world's retained post on each channel T needs, with the
// checks of a live post. Called in T's start segment, so the posts are its deferred effects: they arrive after its
// start message and before anything published later, and a start that fails delivers none of them.
void replay_retained(world_t *T) {
  for (int c = 0; c < T->n_needs; c++) {
    const char *ch = T->needs[c];
    if (!world_may_use(T, ch)) continue;
    bool frames = !strcmp(ch, "frames");
    for (int i = 0; i < K.n_worlds; i++) {
      world_t *P = K.worlds[i];
      if (P == T || P->status != W_IDLE) continue;
      char *own = frames && P->frame ? frame_message(P) : NULL;
      int k = frames ? -1 : provided(P, ch);
      const char *json = own ? own : k >= 0 ? P->retained[k] : NULL;
      if (json) defer_deliver(T, new_msg(M_ON, ch, json, P->id));
      free(own);
    }
  }
}

// What a world shows about itself on the launcher, declared while it starts (the JavaScript builder through read_meta,
// a native world through NW_PRESENT), and cleared when it starts again. The kernel checks shape and size; the launcher
// checks what an icon draws before it shows one. A storage app's title is set to its world name after its start
// (boot_world), and the launcher ignores its key.
static bool plain_text(const char *s) { for (; *s; s++) if ((unsigned char)*s < 0x20 || *s == 0x7f) return false; return true; }
int kernel_present(world_t *W, const char *field, const char *v, char *why, size_t n) {
  size_t len = v ? strlen(v) : 0;
  if (!v) { snprintf(why, n, "%s needs a value", field); return -1; }
  if (!strcmp(field, "title")) {
    if (!len || len >= sizeof W->title || !plain_text(v)) { snprintf(why, n, "a title is 1 to %d bytes of text", (int)sizeof W->title - 1); return -1; }
    snprintf(W->title, sizeof W->title, "%s", v);
  } else if (!strcmp(field, "icon")) {
    if (len > ICON_MAX || v[0] != '[') { snprintf(why, n, "an icon is a JSON array of drawing operations, at most %d bytes", ICON_MAX); return -1; }
    free(W->icon);
    W->icon = xstrdup(v);
  } else if (!strcmp(field, "about")) {
    if (len >= sizeof W->about || !plain_text(v)) { snprintf(why, n, "an app's description is at most %d bytes of text", (int)sizeof W->about - 1); return -1; }
    snprintf(W->about, sizeof W->about, "%s", v);
  } else if (!strcmp(field, "key")) {
    if (len != 1 || !((v[0] >= 'a' && v[0] <= 'z') || (v[0] >= '0' && v[0] <= '9'))) { snprintf(why, n, "a shortcut key is one of a-z and 0-9"); return -1; }
    snprintf(W->key, sizeof W->key, "%s", v);
  } else {
    snprintf(why, n, "a world presents its title, icon, about or key, not \"%s\"", field);
    return -1;
  }
  return 0;
}

static ask_t *find_ask(int id) { ask_t *a = &K.asks[id % MAX_ASKS]; return a->id == id && a->live ? a : NULL; }

void settle_ask(int id, int ok, const char *json, const int *hs, int nh) {
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


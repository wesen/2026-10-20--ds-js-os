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
#include "nucleus.h"
#include "../sdk/nw_wire.h"

// Every backend numbers the system calls as the SDK does: the wire (processes) and the imports (WebAssembly)
_Static_assert((int)NW_CALL_LOG == (int)NW_LOG && (int)NW_CALL_TIMER == (int)NW_TIMER && (int)NW_CALL_COUNT == (int)NW_CALLS, "sdk/nw_wire.h and nucleus.h number the system calls alike");
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
static int64_t fail(world_t *W, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static int64_t fail(world_t *W, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt); vsnprintf(W->nat->err, sizeof W->nat->err, fmt, ap); va_end(ap);
  return -1;
}
// A call's string i as a NUL-terminated copy (the caller frees it).
static char *str(const nw_call_t *c, int i) {
  char *p = malloc(c->n[i] + 1);
  if (!p) return NULL;
  if (c->n[i]) memcpy(p, c->s[i], c->n[i]);
  p[c->n[i]] = 0;
  return p;
}
// A name (a world, a channel, a claim, a message type): 1 to max - 1 bytes and no NUL inside.
static bool name_ok(const nw_call_t *c, int i, size_t max) { return c->n[i] > 0 && c->n[i] < max && !memchr(c->s[i], 0, c->n[i]); }
static void charge(size_t n) { K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); }
static bool in_list(char (*l)[NAME_LEN], int n, const char *s) { for (int i = 0; i < n; i++) if (!strcmp(l[i], s)) return true; return false; }

// ---- payloads ----------------------------------------------------------------------------------------------------
// A JavaScript world sends what JSON.stringify made; a binary sends any bytes. A payload must therefore be strict JSON
// (RFC 8259, UTF-8, nested at most 64 deep) before it reaches another world, or the receiver's JSON.parse would throw
// inside its turn and crash it. Bundled CJI payloads can name handles. The
// public file-ask operation generates its own marker after checking the sender.
typedef struct { int ids[MAX_MSG_HANDLES], count; } grants_t;
typedef struct { const unsigned char *p, *e; int depth; grants_t *grants; } jp_t;
static void jws(jp_t *j) { while (j->p < j->e && (*j->p == ' ' || *j->p == '\t' || *j->p == '\n' || *j->p == '\r')) j->p++; }
static bool jlit(jp_t *j, const char *w) {
  size_t n = strlen(w);
  if ((size_t)(j->e - j->p) < n || memcmp(j->p, w, n)) return false;
  j->p += n;
  return true;
}
static int utf8_len(const unsigned char *p, const unsigned char *e) {   // a valid sequence's length at p; 0 if invalid
  unsigned c = p[0];
  int n = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC2 ? 2 : 0;
  if (!n || c > 0xF4 || e - p < n) return 0;
  unsigned v = c & (0x7Fu >> n);
  for (int i = 1; i < n; i++) { if ((p[i] & 0xC0) != 0x80) return 0; v = v << 6 | (p[i] & 0x3F); }
  if ((n == 3 && v < 0x800) || (n == 4 && (v < 0x10000 || v > 0x10FFFF)) || (v >= 0xD800 && v <= 0xDFFF)) return 0;
  return n;
}
// A string; its first key_n - 1 characters, decoded, go to key (non-ASCII characters as 0x80)
static bool jstr(jp_t *j, char *key, size_t key_n) {
  size_t k = 0;
  if (j->p >= j->e || *j->p != '"') return false;
  j->p++;
  while (j->p < j->e) {
    unsigned c = *j->p, ch;
    if (c == '"') { j->p++; if (key) key[k < key_n - 1 ? k : key_n - 1] = 0; return true; }
    if (c < 0x20) return false;
    if (c == '\\') {
      if (j->e - j->p < 2) return false;
      unsigned char x = j->p[1];
      j->p += 2;
      if (x == 'u') {
        if (j->e - j->p < 4) return false;
        ch = 0;
        for (int i = 0; i < 4; i++) {
          unsigned char h = j->p[i];
          if (h >= '0' && h <= '9') ch = ch * 16 + (h - '0');
          else if ((h | 0x20) >= 'a' && (h | 0x20) <= 'f') ch = ch * 16 + ((h | 0x20) - 'a' + 10);
          else return false;
        }
        j->p += 4;
      } else if (strchr("\"\\/bfnrt", x) && x) ch = x == 'b' ? 8 : x == 'f' ? 12 : x == 'n' ? 10 : x == 'r' ? 13 : x == 't' ? 9 : x;
      else return false;
    } else if (c < 0x80) { ch = c; j->p++; }
    else { int n = utf8_len(j->p, j->e); if (!n) return false; j->p += n; ch = 0x80; }
    if (key && k < key_n - 1) key[k] = (char)(ch && ch < 0x80 ? ch : 0x80);
    k++;
  }
  return false;
}
static bool jdigits(jp_t *j) { const unsigned char *s = j->p; while (j->p < j->e && *j->p >= '0' && *j->p <= '9') j->p++; return j->p > s; }
static bool jnum(jp_t *j) {
  if (j->p < j->e && *j->p == '-') j->p++;
  if (j->p < j->e && *j->p == '0') j->p++;
  else if (!jdigits(j)) return false;
  if (j->p < j->e && *j->p == '.') { j->p++; if (!jdigits(j)) return false; }
  if (j->p < j->e && (*j->p == 'e' || *j->p == 'E')) {
    j->p++;
    if (j->p < j->e && (*j->p == '+' || *j->p == '-')) j->p++;
    if (!jdigits(j)) return false;
  }
  return true;
}
// A marker occupies an entire object. Its decimal ID must fit the kernel's positive int.
static bool jhandle(jp_t *j) {
  jws(j);
  if (!j->grants || j->p == j->e || *j->p < '1' || *j->p > '9') return false;
  int id = 0;
  while (j->p < j->e && *j->p >= '0' && *j->p <= '9') {
    int digit = *j->p++ - '0';
    if (id > (INT_MAX - digit) / 10) return false;
    id = id * 10 + digit;
  }
  jws(j);
  if (j->p == j->e || *j->p++ != '}') return false;
  for (int i = 0; i < j->grants->count; i++) if (j->grants->ids[i] == id) return true;
  if (j->grants->count == MAX_MSG_HANDLES) return false;
  j->grants->ids[j->grants->count++] = id;
  return true;
}
static bool jvalue(jp_t *j) {
  jws(j);
  if (j->p >= j->e) return false;
  unsigned char c = *j->p;
  if (c == '{' || c == '[') {
    unsigned char close = c == '{' ? '}' : ']';
    if (++j->depth > 64) return false;
    j->p++; jws(j);
    if (j->p < j->e && *j->p == close) { j->p++; j->depth--; return true; }
    bool first = true;
    for (;;) {
      if (c == '{') {
        char key[4];
        jws(j);
        if (!jstr(j, key, sizeof key)) return false;
        jws(j);
        if (j->p >= j->e || *j->p++ != ':') return false;
        if (!strcmp(key, "$h")) { j->depth--; return first && jhandle(j); }
        first = false;
      }
      if (!jvalue(j)) return false;
      jws(j);
      if (j->p >= j->e) return false;
      unsigned char d = *j->p++;
      if (d == close) { j->depth--; return true; }
      if (d != ',') return false;
    }
  }
  if (c == '"') return jstr(j, NULL, 0);
  if (c == 't') return jlit(j, "true");
  if (c == 'f') return jlit(j, "false");
  if (c == 'n') return jlit(j, "null");
  return jnum(j);
}
static bool nat_json_ok(const char *s, size_t n, grants_t *grants) {
  jp_t j = { (const unsigned char *)s, (const unsigned char *)s + n, 0, grants };
  if (!jvalue(&j)) return false;
  jws(&j);
  return j.p == j.e;
}
// A call's string i, if present, must be such a payload.
static bool payload_ok(const nw_call_t *c, int i) { return c->n[i] == 0 || nat_json_ok(c->s[i], c->n[i], NULL); }
#define BAD_JSON "the payload is not strict JSON (UTF-8, at most 64 deep, no \"$h\" keys)"
// Text shown to the user (a title, a description, hints): at most max bytes of UTF-8, no control characters.
static bool text_ok(const nw_call_t *c, int i, size_t max) {
  const unsigned char *p = (const unsigned char *)c->s[i], *e = p + c->n[i];
  if (c->n[i] > max) return false;
  while (p < e) {
    if (*p < 0x20 || *p == 0x7f) return false;
    if (*p < 0x80) { p++; continue; }
    int k = utf8_len(p, e);
    if (!k) return false;
    p += k;
  }
  return true;
}

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

// Bundled CJI graphics operations. Rectangle arguments use four signed little-endian
// 32-bit words. The CJI compiler and firmware both target the same RV32 P4.
static int64_t text_result(world_t *W, char *json, char *out, size_t cap) {
  if (!json) return fail(W, "out of memory");
  size_t len = strlen(json);
  if (len < cap) memcpy(out, json, len + 1);
  free(json);
  return len < cap ? (int64_t)len : fail(W, "result exceeds output buffer");
}

static int64_t cji_graphics(world_t *W, const nw_call_t *c, char *out, size_t cap) {
  char err[160];
  int id = c->i[0], arg = c->i[1], op = c->op;
  int32_t rect[4] = {0};
  if (op == CJI_PIXELS || (op >= CJI_FILL && op <= CJI_TEXT)) {
    if (c->n[0] < sizeof rect || c->n[0] > sizeof rect + 7) return fail(W, "invalid drawing packet");
    if (op != CJI_PIXELS && c->n[0] > sizeof rect) {
      char color[8] = {0};
      memcpy(color, c->s[0] + sizeof rect, c->n[0] - sizeof rect);
      arg = gfx_color(color);
    }
    memcpy(rect, c->s[0], sizeof rect);
  }
  if (op == CJI_FONTS) return text_result(W, gfx_fonts_json(), out, cap);
  if (op == CJI_DMA) {
    if (!world_claims(W, "dma")) return fail(W, "%s has no claim on dma", W->name);
    if (id < 1 || arg < 1 || id > 640 || arg > 640) return fail(W, "a framebuffer is at most 640 x 640");
    int buf = dmabuf_alloc(id, arg);
    if (buf < 0) return fail(W, "out of DMA buffers");
    handle_t *h = handle_new(H_DMA, W, "dma");
    if (!h) { dmabuf_unref(buf); return fail(W, "out of handles"); }
    h->buf = buf;
    return h->id;
  }
  if (op == CJI_SPI) {
    if (c->n[0] != 4 || memcmp(c->s[0], "spi2", 4)) return fail(W, "panel SPI claim must be spi2");
    if (!world_claims(W, "spi2")) return fail(W, "%s has no claim on spi2", W->name);
    handle_t *h = handle_new(H_SPI, W, "spi2");
    if (!h) return fail(W, "out of handles");
    h->bus = BUS_SPI2;
    h->hz = id > 80000000 ? 80000000 : id;
    return h->id;
  }
  if (op == CJI_NARROW) {
    handle_t *parent = handle_use(W, id, -1, 0, err, sizeof err);
    if (!parent) return fail(W, "%s", err);
    handle_t *child = handle_child(W, parent, arg);
    return child ? child->id : fail(W, "out of handles");
  }
  if (op == CJI_CMD || op == CJI_PIXELS) {
    handle_t *spi = handle_use(W, id, H_SPI, R_WRITE, err, sizeof err);
    if (!spi) return fail(W, "%s", err);
    int token;
    if (op == CJI_CMD) {
      if (c->n[0] > 64) return fail(W, "a panel command carries at most 64 bytes");
      token = ++K.next_promise;
      hw_spi_cmd(W, spi, arg, (const uint8_t *)c->s[0], c->n[0], token);
    } else {
      handle_t *fb = handle_use(W, arg, H_DMA, R_READ, err, sizeof err);
      if (!fb) return fail(W, "%s", err);
      token = ++K.next_promise;
      hw_spi_pixels(W, spi, fb, rect[0], rect[1], rect[2], rect[3], token);
    }
    return token;
  }
  handle_t *h = handle_use(W, id, H_DMA, R_WRITE, err, sizeof err);
  if (!h) return fail(W, "%s", err);
  dmabuf_t *b = handle_buf(h);
  if (!b) return fail(W, "framebuffer is gone");
#if PICOCALC_MOBILE_PAINTER
  if (op == CJI_PAINTER_DRAW) {
    extern bool p4_painter_draw(dmabuf_t *, int, char *, size_t);
    if (strcmp(W->name, "compositor")) return fail(W, "painter requires the compositor");
    if (!p4_painter_draw(b, arg, out, cap)) return fail(W, "no accepted painter output");
    return strlen(out);
  }
#endif
  if (op == CJI_INVALIDATE) { gfx_invalidate(b); return 0; }
  if (op == CJI_COMMIT) {
    int rs[64 * 4], count = gfx_commit(b, rs, 64);
    sbuf_t json = {0};
    sb_add(&json, "[");
    for (int i = 0; i < count; ++i) {
      const int *r = rs + 4*i;
      sb_printf(&json, "%s[%d,%d,%d,%d]", i ? "," : "", r[0], r[1], r[2], r[3]);
    }
    sb_add(&json, "]");
    return text_result(W, json.s, out, cap);
  }
  if (op == CJI_TEXT) {
    char *text = str(c, 1), *font = str(c, 2);
    int width = text && font ? gfx_text(b, rect[0], rect[1], text, gfx_font_index(font), arg, rect[2]) : -1;
    free(text); free(font);
    return width >= 0 ? width : fail(W, "out of memory");
  }
  if (op == CJI_FILL) gfx_fill(b, rect[0], rect[1], rect[2], rect[3], arg);
  else if (op == CJI_RECT) gfx_rect(b, rect[0], rect[1], rect[2], rect[3], arg);
  else gfx_line(b, rect[0], rect[1], rect[2], rect[3], arg);
  return 0;
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
  if (c->op >= CJI_DMA && c->op <= CJI_FONTS) return cji_graphics(W, c, out, out_n);
  switch (c->op) {
    // Firmware-private CJI operation, outside the public native wire ABI.
    case CJI_HANDLE_INFO: {
      char err[160];
      handle_t *h = handle_use(W, c->i[0], -1, 0, err, sizeof err);
      if (!h) return fail(W, "%s", err);
      return snprintf(out, out_n, "{\"type\":\"%s\",\"rights\":\"%s%s%s\",\"path\":\"%s\",\"file\":%s}",
                      handle_type_name(h->type), h->rights & R_READ ? "r" : "", h->rights & R_WRITE ? "w" : "",
                      h->rights & R_GRANT ? "g" : "", h->path, h->file ? "true" : "false");
    }
    case CJI_FS_OPEN: case CJI_FS_AT: case CJI_FS_OP: case NW_FS_OP: {
      char err[160] = "out of memory";
      char *args[3] = {0};
      int64_t result = -1;
      bool submit = c->op == CJI_FS_OP || c->op == NW_FS_OP;
      for (int i = 0; i < 3; i++) {
        if (!c->s[i]) continue;
        if (c->n[i] && memchr(c->s[i], 0, c->n[i]) && !(submit && i == 2 &&
            args[0] && (!strcmp(args[0], "write") || !strcmp(args[0], "append")))) {
          snprintf(err, sizeof err, "unexpected NUL in file operation");
          goto fs_done;
        }
        if (!(args[i] = str(c, i))) goto fs_done;
      }
      if (submit) {
        fs_job_t *job = fs_prepare(W, c->i[0], args[0], args[1], args[2], c->n[2], err, sizeof err);
        if (job) {
          result = ++K.next_promise;
          fs_defer(W, job, (int)result);
        }
      } else {
        handle_t *h = c->op == CJI_FS_OPEN ? fs_open_claim(W, args[0], err, sizeof err)
                                     : fs_at(W, c->i[0], args[0], args[1], err, sizeof err);
        if (h) result = h->id;
      }
fs_done:
      for (int i = 0; i < 3; i++) free(args[i]);
      return result < 0 ? fail(W, "%s", err) : result;
    }
    case CJI_REVOKE: case NW_REVOKE: {
      handle_t *h = handle_find(c->i[0]);
      if (!h) return fail(W, "there is no handle %d", (int)c->i[0]);
      if (h->minter != W->id || !h->parent) return fail(W, "only the world that narrowed handle %d can revoke it", h->id);
      h->revoked = true;
      return 1;
    }
    case CJI_WORLDS: case CJI_STATS: {
      if (!world_claims(W, "sys.read")) return fail(W, "%s has no claim on sys.read", W->name);
      char *fields = c->s[0] ? str(c, 0) : NULL;
      char *json = c->op == CJI_STATS ? kernel_stats_json() : kernel_worlds_json_fields(fields);
      free(fields);
      if (json) charge(strlen(json));
      return text_result(W, json, out, out_n);
    }
    case CJI_STORE_STATUS: {
      return snprintf(out, out_n, "{\"pending\":%s,\"error\":\"%s\"}", W->nat->store_pending ? "true" : "false",
                      W->nat->store_failed ? "persistent storage write failed" : "");
    }
    case CJI_AGENT_STATUS: case CJI_AGENT_START: case CJI_AGENT_POLL: case CJI_AGENT_CANCEL: case CJI_AGENT_BODY: {
      if (!world_claims(W, "net.agent")) return fail(W, "%s has no claim on net.agent", W->name);
      char err[160];
      int rc;
      if (c->op == CJI_AGENT_STATUS) return text_result(W, agent_status_json(), out, out_n);
      if (c->op == CJI_AGENT_START) rc = agent_start(W, c->s[0], c->n[0], err, sizeof err);
      else if (c->op == CJI_AGENT_CANCEL) rc = agent_cancel(W, c->i[0], err, sizeof err);
      else if (c->op == CJI_AGENT_BODY) {
        // The prelude consumes the body immediately after a completed poll in the same segment.
        char *body = W->nat->agent_body;
        W->nat->agent_body = NULL;
        return body ? text_result(W, body, out, out_n) : 0;
      } else {
        agent_net_result_t result;
        rc = agent_poll(W, c->i[0], &result, err, sizeof err);
        if (rc == 1) {
          free(W->nat->agent_body);
          W->nat->agent_body = result.body;
          sbuf_t json = {0};
          sb_printf(&json, "{\"status\":%d,\"error\":", result.status);
          sb_json_str(&json, result.error);
          sb_add(&json, "}");
          return text_result(W, json.s, out, out_n);
        }
      }
      return rc < 0 ? fail(W, "%s", err) : rc;
    }
    case NW_FS_OPEN: case NW_FS_AT: case NW_FS_READ: case NW_FS_WRITE: {
      if (c->n[0] && memchr(c->s[0], 0, c->n[0])) return fail(W, "unexpected NUL in file operation");
      char *path = str(c, 0);
      if (!path) return fail(W, "out of memory");
      char err[160];
      int result = -1;
      if (c->op == NW_FS_OPEN) {
        handle_t *handle = fs_open_claim(W, path, err, sizeof err);
        if (handle) result = handle->id;
      } else if (c->op == NW_FS_AT) {
        const char *rights = NULL;
        if (c->n[1] == 1 && c->s[1][0] == 'r') rights = "r";
        else if (c->n[1] == 1 && c->s[1][0] == 'w') rights = "w";
        else if (c->n[1] == 2 && !memcmp(c->s[1], "rw", 2)) rights = "rw";
        if (!rights) snprintf(err, sizeof err, "file rights must be r, w, or rw");
        else {
          handle_t *handle = fs_at(W, c->i[0], path, rights, err, sizeof err);
          if (handle) result = handle->id;
        }
      } else {
        bool write = c->op == NW_FS_WRITE;
        const char *text = c->s[1] ? c->s[1] : "";
        fs_job_t *job = fs_prepare(W, c->i[0], write ? "write" : "read", path,
                                   write ? text : NULL, write ? c->n[1] : 0, err, sizeof err);
        if (job) {
          result = ++K.next_promise;
          fs_defer(W, job, result);
        }
      }
      free(path);
      return result < 0 ? fail(W, "%s", err) : result;
    }
    case NW_CLOCK_OFFSET: {
      int64_t seconds = c->v / 1000;
      // Match the Date binding on ports with 32-bit time_t.
      if (sizeof(time_t) == 4) {
        int64_t min = (time_t)-1 < 0 ? INT32_MIN : 0;
        int64_t max = (time_t)-1 < 0 ? (int64_t)INT32_MAX : UINT32_MAX;
        if (seconds < min) seconds = min;
        if (seconds > max) seconds = max;
      }
      time_t instant = (time_t)seconds;
      struct tm utc, local;
      if (!gmtime_r(&instant, &utc) || !localtime_r(&instant, &local))
        return fail(W, "invalid clock instant");
      int days = local.tm_yday - utc.tm_yday;
      if (local.tm_year != utc.tm_year) days = local.tm_year > utc.tm_year ? 1 : -1;
      int minutes = (days * 24 + local.tm_hour - utc.tm_hour) * 60 + local.tm_min - utc.tm_min;
      return minutes + 1440;
    }
    case NW_CLOCK_WALL: return port_wall_ms();
    case NW_CLOCK_TODAY: {
      int64_t wall = port_wall_ms();
      if (wall < 0) return -1;
      int64_t seconds = wall / 1000;
      time_t instant = (time_t)seconds;
      struct tm local;
      if ((int64_t)instant != seconds || !localtime_r(&instant, &local)) return -1;
      int year = local.tm_year + 1900;
      if (year < 0 || year > 9999) return -1;
      return year * 10000 + (local.tm_mon + 1) * 100 + local.tm_mday;
    }
    case NW_CLOCK_ZONE: return snprintf(out, out_n, "%s", clock_zone());
    case NW_CLOCK_SETZONE: {
      if (!world_claims(W, "sys.clock")) return fail(W, "%s has no claim on sys.clock", W->name);
      if (!name_ok(c, 0, 64)) return fail(W, "invalid time zone");
      char *zone = str(c, 0);
      int64_t result = tz_valid(zone) ? (port_tz_set(zone) == 0) : fail(W, "invalid time zone");
      free(zone);
      return result;
    }
    case NW_NET_INFO: case NW_NET_RESULT: {
      if (!world_claims(W, "net.admin") && !(c->op == NW_NET_INFO && world_claims(W, "sys.read")))
        return fail(W, "%s has no claim on net.admin", W->name);
      char *json = c->op == NW_NET_INFO ? port_net_info() : port_net_scan_result();
      if (!json) return 0;
      size_t len = strlen(json);
      if (len >= out_n) { free(json); return fail(W, "network result exceeds buffer"); }
      memcpy(out, json, len + 1); free(json); charge(len);
      return len;
    }
    case NW_NET_SCAN: case NW_NET_JOIN: {
      if (!world_claims(W, "net.admin")) return fail(W, "%s has no claim on net.admin", W->name);
      char why[160] = "";
      if (c->op == NW_NET_SCAN) return port_net_scan(why, sizeof why) ? fail(W, "%s", why) : 1;
      if (!name_ok(c, 0, 33) || c->n[1] > 64 || (c->n[1] && memchr(c->s[1], 0, c->n[1])))
        return fail(W, "invalid Wi-Fi credentials");
      char *ssid = str(c, 0), *pw = str(c, 1);
      int64_t result;
      if (!net_ssid_ok(ssid) || !net_password_ok(pw)) result = fail(W, "invalid Wi-Fi credentials");
      else result = port_net_join(ssid, pw, why, sizeof why) ? fail(W, "%s", why) : 1;
      if (pw) secret_wipe(pw, c->n[1]);
      free(pw); free(ssid);
      return result;
    }
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

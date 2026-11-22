// candela-qjs.c: run an ES module in the vendored QuickJS (picocalc-os/third_party/quickjs) on the host,
// with a counting allocator, so the cost of Candela's front end can be measured in the same engine the
// PicoCalc's worlds use.
//
// usage: candela-qjs [-s STACK_KB] [-m LIMIT_KB] [--memo-ggx] MODULE.mjs [ARGS...]
//   -s STACK_KB   JS_SetMaxStackSize (default 0 = no limit; the ESP32-P4 gives worlds 56 KB)
//   -m LIMIT_KB   JS_SetMemoryLimit on the accounted bytes (default none; a P4 world defaults to 1024 KB)
//   --memo-ggx    in-memory rewrite of Candela's src/kernel.js as it is loaded: ggxTableWGSL() keeps its first
//                 result (the table is a constant). The file on disk is not changed; the runner fails if the
//                 pattern is not found exactly once. Off by default.
//
// The module may import relative and absolute paths (QuickJS's default name normalizer, files read from disk).
// Globals: console.log/info/warn/error, performance.now(), and `host` (see host_funcs below). The job queue is
// drained after the module is evaluated; an unhandled rejection or a rejected top-level promise exits with 1.
//
// Memory: each allocation carries a 16-byte header with its requested size, so the runner reports
//   req   = bytes QuickJS asked for (independent of the C allocator), and
//   acct  = usable size + 8 per block, which is QuickJS's own malloc_size accounting (MALLOC_OVERHEAD = 8)
//           and what nucleus/vm.c's world allocator counts against a world's limit.
// Peaks of both are kept; host.resetPeak() starts a new peak window.
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <errno.h>
#include <dirent.h>
#include <malloc.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <time.h>
#include "quickjs.h"

// ---------- counting allocator ----------
#define HDR 16
typedef struct {
  size_t cur_req, peak_req, cur_acct, peak_acct;
  uint64_t n_alloc, n_free, n_realloc, total_req;
  size_t limit;            // on acct; 0 = none
} Mem;
static Mem M;

static inline size_t usable_of(void *base) { return malloc_usable_size(base) - HDR; }
static inline void bump(void) {
  if (M.cur_req > M.peak_req) M.peak_req = M.cur_req;
  if (M.cur_acct > M.peak_acct) M.peak_acct = M.cur_acct;
}
static void *c_malloc(JSMallocState *s, size_t size) {
  if (M.limit && M.cur_acct + size + 8 > M.limit) return NULL;
  char *b = malloc(size + HDR);
  if (!b) return NULL;
  *(size_t *)b = size;
  size_t u = usable_of(b) + 8;
  M.cur_req += size; M.cur_acct += u; M.n_alloc++; M.total_req += size; bump();
  s->malloc_count++; s->malloc_size += u;
  return b + HDR;
}
static void c_free(JSMallocState *s, void *p) {
  if (!p) return;
  char *b = (char *)p - HDR;
  size_t size = *(size_t *)b, u = usable_of(b) + 8;
  M.cur_req -= size; M.cur_acct -= u; M.n_free++;
  s->malloc_count--; s->malloc_size -= u;
  free(b);
}
static void *c_realloc(JSMallocState *s, void *p, size_t size) {
  if (!p) return size ? c_malloc(s, size) : NULL;
  if (!size) { c_free(s, p); return NULL; }
  char *b = (char *)p - HDR;
  size_t old = *(size_t *)b, oldu = usable_of(b) + 8;
  if (M.limit && M.cur_acct - oldu + size + 8 > M.limit) return NULL;
  char *nb = realloc(b, size + HDR);
  if (!nb) return NULL;
  *(size_t *)nb = size;
  size_t u = usable_of(nb) + 8;
  M.cur_req = M.cur_req - old + size; M.cur_acct = M.cur_acct - oldu + u; M.n_realloc++;
  if (size > old) M.total_req += size - old;
  bump();
  s->malloc_size = s->malloc_size - oldu + u;
  return nb + HDR;
}
static size_t c_usable(const void *p) { return p ? usable_of((char *)p - HDR) : 0; }
static const JSMallocFunctions MF = { c_malloc, c_free, c_realloc, c_usable };

// ---------- clock ----------
static double now_ms(void) {
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}
// CPU time of this (single-threaded) process: immune to being descheduled on a loaded host, not to clock scaling
static double cpu_ms(void) {
  struct timespec ts; clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &ts);
  return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}
// interrupt-counter steps (loop back-edges and calls), counted as nucleus/vm.c counts a world's work:
// steps = interrupts * JS_INTERRUPT_COUNTER_INIT + (INIT - counter now); the counter starts at INIT per context
static int64_t n_interrupts = 0;
static int count_interrupt(JSRuntime *rt, void *o) { n_interrupts++; return 0; }

// C stack high-water mark. host.stackPaint() fills PAINT bytes of free stack below the caller with a pattern;
// host.stackUsed() finds the deepest byte that changed and returns its distance from main()'s frame, which is
// about where QuickJS measures its own stack limit from (JS_NewRuntime records the stack top). With -s, QuickJS
// would throw at that distance; the ESP32-P4 gives a world's QuickJS 56 KB.
#define PAINT (2u << 20)
#define PATTERN 0xA5
static char *stack_ref, *paint_lo;
static void __attribute__((noinline)) stack_paint(void) {
  char *sp = __builtin_frame_address(0);
  volatile char *lo = (volatile char *)(sp - 512 - PAINT);   // stay clear of this frame
  for (size_t i = 0; i < PAINT; i++) lo[i] = PATTERN;
  paint_lo = (char *)lo;
}
static size_t stack_used(void) {
  if (!paint_lo) return 0;
  volatile char *p = (volatile char *)paint_lo;
  size_t i = 0; while (i < PAINT && p[i] == (char)PATTERN) i++;
  return (size_t)(stack_ref - (paint_lo + i));
}

// ---------- files ----------
static char *read_file(const char *path, size_t *len) {
  FILE *f = fopen(path, "rb"); if (!f) return NULL;
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  char *buf = malloc(n + 1); if (!buf) { fclose(f); return NULL; }
  if (fread(buf, 1, n, f) != (size_t)n) { free(buf); fclose(f); return NULL; }
  buf[n] = 0; fclose(f); if (len) *len = n; return buf;
}

// ---------- module loader (with load-time accounting) ----------
// QuickJS calls the loader re-entrantly: compiling a module loads the modules it imports from inside that
// JS_Eval call. So the total counts only outermost calls (inclusive of nested ones), and each module's own
// time is its inclusive time minus its children's.
static double loader_ms = 0;      // read + parse/compile of module sources, outermost calls only
static uint64_t loader_bytes = 0, loader_count = 0;
static int load_depth = 0;
static double child_ms[64];
#define MAX_MODS 64
static struct { char name[64]; size_t bytes; double self_ms; } mods[MAX_MODS];
static int memo_ggx = 0, memo_ggx_applied = 0;
static const char *GGX_FROM = "export function ggxTableWGSL() {\n  const t = ggxAlbedoTable();";
static const char *GGX_TO = "let __ggxMemo = null;\nexport function ggxTableWGSL() {\n  const t = __ggxMemo || (__ggxMemo = ggxAlbedoTable());";

static char *rewrite_once(char *src, size_t *len, const char *from, const char *to, int *ok) {
  char *a = strstr(src, from); *ok = 0;
  if (!a || strstr(a + 1, from)) return src;
  size_t fl = strlen(from), tl = strlen(to), pre = a - src, n = *len - fl + tl;
  char *out = malloc(n + 1);
  memcpy(out, src, pre); memcpy(out + pre, to, tl); memcpy(out + pre + tl, a + fl, *len - pre - fl); out[n] = 0;
  free(src); *len = n; *ok = 1; return out;
}
static int ends_with(const char *s, const char *suf) { size_t a = strlen(s), b = strlen(suf); return a >= b && !strcmp(s + a - b, suf); }

static JSModuleDef *load_module(JSContext *ctx, const char *name, void *opaque) {
  double t0 = now_ms();
  int depth = load_depth++;
  if (depth < 63) child_ms[depth + 1] = 0;
  size_t len; char *src = read_file(name, &len);
  if (!src) { load_depth--; JS_ThrowReferenceError(ctx, "could not load module '%s'", name); return NULL; }
  if (memo_ggx && ends_with(name, "/src/kernel.js")) {
    int ok; src = rewrite_once(src, &len, GGX_FROM, GGX_TO, &ok);
    if (!ok) { free(src); load_depth--; JS_ThrowInternalError(ctx, "--memo-ggx: pattern not found exactly once in %s", name); return NULL; }
    memo_ggx_applied++;
  }
  JSValue fn = JS_Eval(ctx, src, len, name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  free(src);
  double incl = now_ms() - t0, kids = depth < 63 ? child_ms[depth + 1] : 0;
  load_depth--;
  if (depth == 0) loader_ms += incl; else if (depth < 64) child_ms[depth] += incl;
  if (loader_count < MAX_MODS) {
    const char *b = strrchr(name, '/'); b = b ? b + 1 : name;
    snprintf(mods[loader_count].name, sizeof mods[0].name, "%s", b);
    mods[loader_count].bytes = len; mods[loader_count].self_ms = incl - kids;
  }
  loader_bytes += len; loader_count++;
  if (JS_IsException(fn)) return NULL;
  JSModuleDef *m = JS_VALUE_GET_PTR(fn);
  JS_FreeValue(ctx, fn);
  return m;
}

// ---------- globals ----------
static void print_value(JSContext *ctx, FILE *f, JSValueConst v) {
  const char *s = JS_ToCString(ctx, v);
  fputs(s ? s : "<unprintable>", f);
  if (s) JS_FreeCString(ctx, s);
}
static JSValue js_print_to(JSContext *ctx, int argc, JSValueConst *argv, FILE *f) {
  for (int i = 0; i < argc; i++) { if (i) fputc(' ', f); print_value(ctx, f, argv[i]); }
  fputc('\n', f); fflush(f);
  return JS_UNDEFINED;
}
static JSValue js_log(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { return js_print_to(ctx, argc, argv, stdout); }
static JSValue js_err(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { return js_print_to(ctx, argc, argv, stderr); }
static JSValue js_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, now_ms()); }
static JSValue js_stack_paint(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { stack_paint(); return JS_UNDEFINED; }
static JSValue js_stack_used(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, (double)stack_used()); }
static JSValue js_cpu(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, cpu_ms()); }
static JSValue js_steps(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int init = JS_GetInterruptCounterInit();
  return JS_NewFloat64(ctx, (double)(n_interrupts * init + init - JS_GetInterruptCounter(ctx)));
}

static JSValue js_read_file(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *p = JS_ToCString(ctx, argv[0]); if (!p) return JS_EXCEPTION;
  size_t len; char *buf = read_file(p, &len); JS_FreeCString(ctx, p);
  if (!buf) return JS_NULL;
  JSValue s = JS_NewStringLen(ctx, buf, len); free(buf); return s;
}
static JSValue js_write_file(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *p = JS_ToCString(ctx, argv[0]); if (!p) return JS_EXCEPTION;
  size_t len; const char *s = JS_ToCStringLen(ctx, &len, argv[1]);
  if (!s) { JS_FreeCString(ctx, p); return JS_EXCEPTION; }
  FILE *f = fopen(p, "wb"); int ok = f && fwrite(s, 1, len, f) == len; if (f) fclose(f);
  JS_FreeCString(ctx, p); JS_FreeCString(ctx, s);
  return JS_NewBool(ctx, ok);
}
static JSValue js_list_dir(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *p = JS_ToCString(ctx, argv[0]); if (!p) return JS_EXCEPTION;
  DIR *d = opendir(p); JS_FreeCString(ctx, p);
  if (!d) return JS_NULL;
  JSValue a = JS_NewArray(ctx); uint32_t i = 0; struct dirent *e;
  while ((e = readdir(d))) { if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue; JS_SetPropertyUint32(ctx, a, i++, JS_NewString(ctx, e->d_name)); }
  closedir(d); return a;
}
static JSValue js_is_dir(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *p = JS_ToCString(ctx, argv[0]); if (!p) return JS_EXCEPTION;
  struct stat st; int r = stat(p, &st) == 0 && S_ISDIR(st.st_mode); JS_FreeCString(ctx, p);
  return JS_NewBool(ctx, r);
}
static void set_num(JSContext *ctx, JSValue o, const char *k, double v) { JS_SetPropertyStr(ctx, o, k, JS_NewFloat64(ctx, v)); }
static JSValue js_mem(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  JSValue o = JS_NewObject(ctx);
  set_num(ctx, o, "cur", M.cur_req); set_num(ctx, o, "peak", M.peak_req);
  set_num(ctx, o, "curAcct", M.cur_acct); set_num(ctx, o, "peakAcct", M.peak_acct);
  set_num(ctx, o, "allocs", M.n_alloc); set_num(ctx, o, "frees", M.n_free); set_num(ctx, o, "reallocs", M.n_realloc);
  set_num(ctx, o, "totalReq", (double)M.total_req);
  struct rusage ru; getrusage(RUSAGE_SELF, &ru); set_num(ctx, o, "maxRssKB", ru.ru_maxrss);
  return o;
}
static JSValue js_reset_peak(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  M.peak_req = M.cur_req; M.peak_acct = M.cur_acct; return JS_UNDEFINED;
}
static JSValue js_gc(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { JS_RunGC(JS_GetRuntime(ctx)); return JS_UNDEFINED; }
static JSValue js_mem_usage(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  JSMemoryUsage u; JS_ComputeMemoryUsage(JS_GetRuntime(ctx), &u);
  JSValue o = JS_NewObject(ctx);
#define F(x) set_num(ctx, o, #x, (double)u.x)
  F(malloc_size); F(malloc_count); F(memory_used_size); F(memory_used_count); F(atom_count); F(atom_size); F(str_count); F(str_size);
  F(obj_count); F(obj_size); F(prop_count); F(prop_size); F(shape_count); F(shape_size); F(js_func_count); F(js_func_size);
  F(js_func_code_size); F(js_func_pc2line_count); F(js_func_pc2line_size); F(c_func_count); F(array_count); F(fast_array_count);
  F(fast_array_elements); F(binary_object_count); F(binary_object_size);
#undef F
  return o;
}
static JSValue js_loader(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  JSValue o = JS_NewObject(ctx);
  set_num(ctx, o, "ms", loader_ms); set_num(ctx, o, "bytes", (double)loader_bytes); set_num(ctx, o, "modules", (double)loader_count);
  set_num(ctx, o, "memoGgx", memo_ggx_applied);
  JSValue a = JS_NewArray(ctx);
  for (uint64_t k = 0; k < loader_count && k < MAX_MODS; k++) {
    JSValue m = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, m, "name", JS_NewString(ctx, mods[k].name));
    set_num(ctx, m, "bytes", mods[k].bytes); set_num(ctx, m, "selfMs", mods[k].self_ms);
    JS_SetPropertyUint32(ctx, a, (uint32_t)k, m);
  }
  JS_SetPropertyStr(ctx, o, "modulesList", a);
  return o;
}
static JSValue js_eval_script(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  // host.evalScript(src, name): global (non-module) evaluation, for probes
  size_t len; const char *s = JS_ToCStringLen(ctx, &len, argv[0]); if (!s) return JS_EXCEPTION;
  const char *n = argc > 1 ? JS_ToCString(ctx, argv[1]) : NULL;
  JSValue r = JS_Eval(ctx, s, len, n ? n : "<eval>", JS_EVAL_TYPE_GLOBAL);
  JS_FreeCString(ctx, s); if (n) JS_FreeCString(ctx, n);
  return r;
}

// atob(s): WHATWG forgiving-base64 decode to a binary string (one char per byte), as browsers and Node provide.
// QuickJS has no atob; preset K-09 calls it on module load. This is the one Candela-facing global shim.
static int b64v(int c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}
static JSValue js_atob(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t n; const char *in = JS_ToCStringLen(ctx, &n, argc ? argv[0] : JS_UNDEFINED); if (!in) return JS_EXCEPTION;
  char *t = malloc(n + 1); size_t m = 0;
  for (size_t i = 0; i < n; i++) { unsigned char c = in[i]; if (c == ' ' || c == '\t' || c == '\n' || c == '\f' || c == '\r') continue; t[m++] = c; }
  JS_FreeCString(ctx, in);
  if (m % 4 == 0 && m && t[m - 1] == '=') { m--; if (t[m - 1] == '=') m--; }
  if (m % 4 == 1) { free(t); return JS_ThrowTypeError(ctx, "atob: invalid base64 (InvalidCharacterError)"); }
  // output as UTF-8 of the Latin-1 code points, so JS_NewStringLen builds a string of chars 0..255
  char *out = malloc(m / 4 * 3 * 2 + 8); size_t o = 0; uint32_t acc = 0; int bits = 0;
  for (size_t i = 0; i < m; i++) {
    int v = b64v((unsigned char)t[i]);
    if (v < 0) { free(t); free(out); return JS_ThrowTypeError(ctx, "atob: invalid base64 (InvalidCharacterError)"); }
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; unsigned b = (acc >> bits) & 0xff; if (b < 0x80) out[o++] = b; else { out[o++] = 0xc0 | (b >> 6); out[o++] = 0x80 | (b & 0x3f); } }
  }
  JSValue r = JS_NewStringLen(ctx, out, o); free(t); free(out); return r;
}

static const JSCFunctionListEntry host_funcs[] = {
  JS_CFUNC_DEF("now", 0, js_now),
  JS_CFUNC_DEF("cpu", 0, js_cpu),
  JS_CFUNC_DEF("steps", 0, js_steps),
  JS_CFUNC_DEF("stackPaint", 0, js_stack_paint),
  JS_CFUNC_DEF("stackUsed", 0, js_stack_used),
  JS_CFUNC_DEF("readFile", 1, js_read_file),
  JS_CFUNC_DEF("writeFile", 2, js_write_file),
  JS_CFUNC_DEF("listDir", 1, js_list_dir),
  JS_CFUNC_DEF("isDir", 1, js_is_dir),
  JS_CFUNC_DEF("mem", 0, js_mem),
  JS_CFUNC_DEF("resetPeak", 0, js_reset_peak),
  JS_CFUNC_DEF("gc", 0, js_gc),
  JS_CFUNC_DEF("memUsage", 0, js_mem_usage),
  JS_CFUNC_DEF("loader", 0, js_loader),
  JS_CFUNC_DEF("evalScript", 2, js_eval_script),
};

// ---------- errors ----------
static void dump_error(JSContext *ctx, JSValueConst e) {
  print_value(ctx, stderr, e); fputc('\n', stderr);
  if (JS_IsObject(e)) {
    JSValue st = JS_GetPropertyStr(ctx, e, "stack");
    if (!JS_IsUndefined(st)) { print_value(ctx, stderr, st); fputc('\n', stderr); }
    JS_FreeValue(ctx, st);
  }
}
static int unhandled = 0;
static void on_rejection(JSContext *ctx, JSValueConst promise, JSValueConst reason, JS_BOOL is_handled, void *opaque) {
  // QuickJS calls this when a promise is rejected before a handler is attached; Candela's async module bodies
  // do that routinely and attach the handler a job later (is_handled = 1 then). Only a count left over at exit fails.
  if (!is_handled) { fputs("rejection without a handler yet: ", stderr); dump_error(ctx, reason); unhandled++; }
  else if (unhandled > 0) unhandled--;
}

int main(int argc, char **argv) {
  stack_ref = __builtin_frame_address(0);
  size_t stack_kb = 0; int i = 1;
  for (; i < argc && argv[i][0] == '-'; i++) {
    if (!strcmp(argv[i], "-s") && i + 1 < argc) stack_kb = strtoul(argv[++i], NULL, 10);
    else if (!strcmp(argv[i], "-m") && i + 1 < argc) M.limit = strtoul(argv[++i], NULL, 10) * 1024;
    else if (!strcmp(argv[i], "--memo-ggx")) memo_ggx = 1;
    else { fprintf(stderr, "unknown option %s\n", argv[i]); return 2; }
  }
  if (i >= argc) { fprintf(stderr, "usage: candela-qjs [-s STACK_KB] [-m LIMIT_KB] [--memo-ggx] MODULE.mjs [ARGS...]\n"); return 2; }
  const char *main_path = argv[i];

  double t_rt0 = now_ms();
  JSRuntime *rt = JS_NewRuntime2(&MF, NULL);
  JS_SetMaxStackSize(rt, stack_kb * 1024);   // 0 disables the check
  JS_SetModuleLoaderFunc(rt, NULL, load_module, NULL);
  JS_SetHostPromiseRejectionTracker(rt, on_rejection, NULL);
  JS_SetInterruptHandler(rt, count_interrupt, NULL);
  JSContext *ctx = JS_NewContext(rt);
  double t_rt1 = now_ms();
  size_t mem_rt = M.cur_req, mem_rt_acct = M.cur_acct;

  JSValue g = JS_GetGlobalObject(ctx);
  JSValue con = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, con, "log", JS_NewCFunction(ctx, js_log, "log", 1));
  JS_SetPropertyStr(ctx, con, "info", JS_NewCFunction(ctx, js_log, "info", 1));
  JS_SetPropertyStr(ctx, con, "warn", JS_NewCFunction(ctx, js_err, "warn", 1));
  JS_SetPropertyStr(ctx, con, "error", JS_NewCFunction(ctx, js_err, "error", 1));
  JS_SetPropertyStr(ctx, g, "console", con);
  JSValue perf = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, perf, "now", JS_NewCFunction(ctx, js_now, "now", 0));
  JS_SetPropertyStr(ctx, g, "performance", perf);
  JS_SetPropertyStr(ctx, g, "atob", JS_NewCFunction(ctx, js_atob, "atob", 1));
  JSValue host = JS_NewObject(ctx);
  JS_SetPropertyFunctionList(ctx, host, host_funcs, sizeof host_funcs / sizeof host_funcs[0]);
  JSValue args = JS_NewArray(ctx);
  for (int k = i + 1; k < argc; k++) JS_SetPropertyUint32(ctx, args, k - i - 1, JS_NewString(ctx, argv[k]));
  JS_SetPropertyStr(ctx, host, "args", args);
  JSValue rtinfo = JS_NewObject(ctx);
  set_num(ctx, rtinfo, "newRuntimeMs", t_rt1 - t_rt0); set_num(ctx, rtinfo, "runtimeBytes", mem_rt); set_num(ctx, rtinfo, "runtimeBytesAcct", mem_rt_acct);
  set_num(ctx, rtinfo, "pointerBytes", sizeof(void *)); set_num(ctx, rtinfo, "jsValueBytes", sizeof(JSValue));
  set_num(ctx, rtinfo, "stackKB", stack_kb); set_num(ctx, rtinfo, "limitKB", M.limit / 1024);
  JS_SetPropertyStr(ctx, rtinfo, "version", JS_NewString(ctx, CONFIG_VERSION));
  JS_SetPropertyStr(ctx, host, "runtime", rtinfo);
  JS_SetPropertyStr(ctx, g, "host", host);
  JS_FreeValue(ctx, g);

  size_t len; char *src = read_file(main_path, &len);
  if (!src) { fprintf(stderr, "cannot read %s\n", main_path); return 2; }
  JSValue r = JS_Eval(ctx, src, len, main_path, JS_EVAL_TYPE_MODULE);
  free(src);
  int rc = 0;
  if (JS_IsException(r)) { JSValue e = JS_GetException(ctx); dump_error(ctx, e); JS_FreeValue(ctx, e); rc = 1; }
  for (;;) {
    JSContext *c1; int k = JS_ExecutePendingJob(rt, &c1);
    if (k == 0) break;
    if (k < 0) { JSValue e = JS_GetException(c1); dump_error(c1, e); JS_FreeValue(c1, e); rc = 1; }
  }
  if (!rc && JS_IsObject(r) && JS_PromiseState(ctx, r) == JS_PROMISE_REJECTED) {
    JSValue e = JS_PromiseResult(ctx, r); fputs("module rejected: ", stderr); dump_error(ctx, e); JS_FreeValue(ctx, e); rc = 1;
  } else if (!rc && JS_IsObject(r) && JS_PromiseState(ctx, r) == JS_PROMISE_PENDING) {
    fputs("module still pending after the job queue drained\n", stderr); rc = 1;
  }
  if (unhandled > 0) rc = 1;
  JS_FreeValue(ctx, r);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return rc;
}

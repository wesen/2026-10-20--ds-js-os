// 14-compile-heap.c: the Candela gallery's Typed compile in the vendored QuickJS on the host, with the device's
// compile-heap accounting (firmware/port/esp32p4/main/typed_p4.c: live bytes by malloc_usable_size, peak, limit)
// (PICOCALC-CANDELA-KERNEL-CODEGEN).
//
// usage: 14-compile-heap REPO SOURCE.typed REACTOR.elf [LIMIT_BYTES] [OPTIONS_JSON]
//
// Loads REPO's compiler/typed/{tape,typed-wasm,typed-rv32}.js and apps/typed/candela-gallery/link.js as the device
// does (typedRv32Load evaluates compiler/typed/typed-rv32-*.js on demand; __typedLexIndex is the device's
// typed_lex_index.c), calls linkCandelaGallery(source, reactor, {policy: "kernel", ...OPTIONS_JSON}) and prints one
// JSON line: status, peak and live compile-heap bytes, the module's bytes, milliseconds. A 64-bit build's pointers
// and JSValues are larger than the device's, so compare peaks between builds of one width.
// build: gcc -O2 -I firmware/third_party/quickjs -I firmware/port/esp32p4/main this.c
//        firmware/port/esp32p4/main/typed_lex_index.c <quickjs objects> -lm -lpthread
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"
#include "typed_lex_index.h"

static const char *repo;
static size_t live, peak, limit = (size_t)-1;

static void account(size_t old, size_t now) { live = live - old + now; if (live > peak) peak = live; }
static void *h_malloc(JSMallocState *s, size_t n) {
  (void)s;
  if (live >= limit || n > limit - live) return NULL;
  void *p = malloc(n);
  if (p) account(0, malloc_usable_size(p));
  return p;
}
static void h_free(JSMallocState *s, void *p) { (void)s; if (p) { account(malloc_usable_size(p), 0); free(p); } }
static void *h_realloc(JSMallocState *s, void *p, size_t n) {
  (void)s;
  if (!p) return h_malloc(s, n);
  size_t old = malloc_usable_size(p), retained = live - old;
  if (retained >= limit || n > limit - retained) return NULL;
  void *q = realloc(p, n);
  if (q) account(old, malloc_usable_size(q));
  return q;
}
static size_t h_usable(const void *p) { return malloc_usable_size((void *)p); }
static const JSMallocFunctions allocator = {h_malloc, h_free, h_realloc, h_usable};

static char *slurp(const char *path, size_t *length) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *b = malloc((size_t)n + 1);
  if (b && fread(b, 1, (size_t)n, f) != (size_t)n) { free(b); b = NULL; }
  fclose(f);
  if (b) { b[n] = 0; *length = (size_t)n; }
  return b;
}

static int eval_path(JSContext *ctx, const char *path) {
  size_t n;
  char *text = slurp(path, &n);
  if (!text) { fprintf(stderr, "cannot read %s\n", path); return 0; }
  JSValue v = JS_Eval(ctx, text, n, path, JS_EVAL_TYPE_GLOBAL);
  free(text);
  int ok = !JS_IsException(v);
  JS_FreeValue(ctx, v);
  return ok;
}

static JSValue rv32_load(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  const char *file = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
  char path[1024];
  snprintf(path, sizeof path, "%s/compiler/typed/%s", repo, file ? file : "");
  JS_FreeCString(ctx, file);
  if (!eval_path(ctx, path) && !JS_HasException(ctx)) return JS_ThrowReferenceError(ctx, "%s is missing", path);
  return JS_UNDEFINED;
}

// __heap(reset): [live, peak] compile-heap bytes; with reset, the peak restarts from the live bytes.
static JSValue heap_fn(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  JSValue r = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, r, 0, JS_NewFloat64(ctx, (double)live));
  JS_SetPropertyUint32(ctx, r, 1, JS_NewFloat64(ctx, (double)peak));
  if (argc > 0 && JS_ToBool(ctx, argv[0])) peak = live;
  return r;
}

static double now_ms(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec * 1e3 + t.tv_nsec / 1e6;
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: %s REPO SOURCE REACTOR [LIMIT] [OPTIONS_JSON]\n", argv[0]); return 2; }
  repo = argv[1];
  if (argc > 4) limit = strtoull(argv[4], NULL, 10);
  const char *options = argc > 5 ? argv[5] : "{}";
  size_t source_n, reactor_n;
  char *source = slurp(argv[2], &source_n), *reactor = slurp(argv[3], &reactor_n);
  if (!source || !reactor) { fprintf(stderr, "cannot read the source or the reactor\n"); return 2; }
  JSRuntime *rt = JS_NewRuntime2(&allocator, NULL);
  JS_SetMaxStackSize(rt, 0);
  JSContext *ctx = JS_NewContext(rt);
  typed_lex_index_install(ctx);
  JSValue global = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, global, "typedRv32Load", JS_NewCFunction(ctx, rv32_load, "typedRv32Load", 1));
  JS_SetPropertyStr(ctx, global, "__heap", JS_NewCFunction(ctx, heap_fn, "__heap", 1));
  char path[1024];
  const char *files[] = {"compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
                         "apps/typed/candela-gallery/link.js"};
  for (unsigned i = 0; i < 4; i++) {
    snprintf(path, sizeof path, "%s/%s", repo, files[i]);
    if (!eval_path(ctx, path)) { fprintf(stderr, "cannot evaluate %s\n", path); return 2; }
  }
  const size_t loaded = live;
  const double t0 = now_ms();
  JSValue fn = JS_GetPropertyStr(ctx, global, "linkCandelaGallery");
  // OPTIONS_JSON, or @FILE: a script that sets globalThis.compileOptions (and may print with globalThis.print)
  JSValue opts;
  if (options[0] == '@') {
    if (!eval_path(ctx, options + 1)) { fprintf(stderr, "cannot evaluate %s\n", options + 1); return 2; }
    opts = JS_GetPropertyStr(ctx, global, "compileOptions");
  } else opts = JS_ParseJSON(ctx, options, strlen(options), "options");
  JS_SetPropertyStr(ctx, opts, "policy", JS_NewString(ctx, "kernel"));
  JSValue buf = JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_n);
  JSValue view_args[] = {buf, JS_NewUint32(ctx, 0), JS_NewUint32(ctx, (uint32_t)reactor_n)};
  JSValue view = JS_NewTypedArray(ctx, 3, view_args, JS_TYPED_ARRAY_UINT8);
  JS_FreeValue(ctx, buf);
  JSValue args[] = {JS_NewStringLen(ctx, source, source_n), view, opts};
  JSValue r = JS_Call(ctx, fn, JS_UNDEFINED, 3, args);
  const double ms = now_ms() - t0;
  size_t module = 0;
  const char *status = "ok";
  if (JS_IsException(r)) {
    JSValue e = JS_GetException(ctx);
    const char *m = JS_ToCString(ctx, e);
    fprintf(stderr, "compile rejected: %s\n", m ? m : "?");
    JS_FreeCString(ctx, m);
    JS_FreeValue(ctx, e);
    status = "failed";
  } else {
    size_t off, size, unit;
    JSValue b = JS_GetTypedArrayBuffer(ctx, r, &off, &size, &unit);
    module = size;
    JS_FreeValue(ctx, b);
  }
  JSValue log = JS_GetPropertyStr(ctx, global, "heapLog");
  if (!JS_IsUndefined(log)) {
    JSValue text = JS_JSONStringify(ctx, log, JS_UNDEFINED, JS_UNDEFINED);
    const char *t = JS_ToCString(ctx, text);
    if (t) fprintf(stderr, "%s\n", t);
    JS_FreeCString(ctx, t);
    JS_FreeValue(ctx, text);
  }
  JS_FreeValue(ctx, log);
  const size_t before_gc = live;
  JS_RunGC(rt);
  printf("{\"status\":\"%s\",\"peakBytes\":%zu,\"loadedBytes\":%zu,\"liveAtEndBytes\":%zu,\"liveAfterGcBytes\":%zu,"
         "\"moduleBytes\":%zu,\"ms\":%.0f,\"pointerBytes\":%zu}\n",
         status, peak, loaded, before_gc, live, module, ms, sizeof(void *));
  return 0;
}

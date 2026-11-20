// Time the phases of the typed compiler inside QuickJS, the interpreter that runs it on the device.
// Host x86 timings: use the proportions, not the absolute values.
// Build and run: see 04-compile-phase-timing.sh
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"

static char *slurp(const char *path, size_t *length) {
  FILE *f = fopen(path, "rb");
  if (!f) { perror(path); exit(1); }
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  char *data = malloc(n + 1);
  if (fread(data, 1, n, f) != (size_t)n) exit(1);
  data[n] = 0; fclose(f); *length = n;
  return data;
}

static JSValue js_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
  return JS_NewFloat64(ctx, ts.tv_sec * 1e3 + ts.tv_nsec / 1e6);
}
static JSValue js_print(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *s = JS_ToCString(ctx, argv[0]); puts(s ? s : "?"); JS_FreeCString(ctx, s);
  return JS_UNDEFINED;
}
static JSValue js_peak(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  JSMemoryUsage usage; JS_ComputeMemoryUsage(JS_GetRuntime(ctx), &usage);
  return JS_NewFloat64(ctx, (double)usage.memory_used_size);
}

static void eval(JSContext *ctx, const char *path) {
  size_t n; char *text = slurp(path, &n);
  JSValue v = JS_Eval(ctx, text, n, path, JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(v)) {
    JSValue e = JS_GetException(ctx); const char *s = JS_ToCString(ctx, e);
    fprintf(stderr, "%s: %s\n", path, s ? s : "?"); exit(1);
  }
  JS_FreeValue(ctx, v); free(text);
}

int main(int argc, char **argv) {
  if (argc < 6) { fprintf(stderr, "usage: %s compiler-dir source wasm-reactor elf-reactor|- driver.js\n", argv[0]); return 2; }
  JSRuntime *rt = JS_NewRuntime();
  JS_SetMaxStackSize(rt, 4 * 1024 * 1024);
  JSContext *ctx = JS_NewContext(rt);
  JSValue global = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, global, "__now", JS_NewCFunction(ctx, js_now, "__now", 0));
  JS_SetPropertyStr(ctx, global, "__print", JS_NewCFunction(ctx, js_print, "__print", 1));
  JS_SetPropertyStr(ctx, global, "__memory", JS_NewCFunction(ctx, js_peak, "__memory", 0));
  char path[1024];
  size_t n; char *source = slurp(argv[2], &n);
  JS_SetPropertyStr(ctx, global, "__source", JS_NewStringLen(ctx, source, n));
  char *wasm = slurp(argv[3], &n);
  JS_SetPropertyStr(ctx, global, "__wasmReactor", JS_NewArrayBufferCopy(ctx, (const uint8_t *)wasm, n));
  if (strcmp(argv[4], "-")) {
    char *elf = slurp(argv[4], &n);
    JS_SetPropertyStr(ctx, global, "__elfReactor", JS_NewArrayBufferCopy(ctx, (const uint8_t *)elf, n));
  }
  snprintf(path, sizeof path, "%s/typed-wasm.js", argv[1]);
  size_t tn; char *compiler = slurp(path, &tn);
  JS_SetPropertyStr(ctx, global, "__compilerText", JS_NewStringLen(ctx, compiler, tn));
  snprintf(path, sizeof path, "%s/typed-world.js", argv[1]);
  size_t wn; char *world = slurp(path, &wn);
  JS_SetPropertyStr(ctx, global, "__worldText", JS_NewStringLen(ctx, world, wn));
  snprintf(path, sizeof path, "%s/typed-wasm.js", argv[1]);
  double t0 = JS_VALUE_GET_FLOAT64(js_now(ctx, JS_UNDEFINED, 0, NULL));
  eval(ctx, path);
  snprintf(path, sizeof path, "%s/typed-rv32.js", argv[1]); eval(ctx, path);
  snprintf(path, sizeof path, "%s/typed-world.js", argv[1]); eval(ctx, path);
  double t1 = JS_VALUE_GET_FLOAT64(js_now(ctx, JS_UNDEFINED, 0, NULL));
  JS_SetPropertyStr(ctx, global, "__loadMs", JS_NewFloat64(ctx, t1 - t0));
  JS_FreeValue(ctx, global);
  eval(ctx, argv[5]);
  return 0;
}

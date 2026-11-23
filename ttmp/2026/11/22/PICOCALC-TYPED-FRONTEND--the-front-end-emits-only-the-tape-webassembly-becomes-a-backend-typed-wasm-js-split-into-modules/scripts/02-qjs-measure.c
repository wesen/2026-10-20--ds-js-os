// Compile time and peak heap of one Typed compile in a bare QuickJS realm on the host (the interpreter the P4 runs).
// PICOCALC-TYPED-TAPE's scripts/02-qjs-compile-time.c plus an allocator that records the peak.
//
//   cc -O2 -DCONFIG_VERSION='"host"' -I firmware/third_party/quickjs -o qjs-measure 02-qjs-measure.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-measure ROUNDS SOURCE MODE ARG FILE...
//
// MODE rv32:  typedRv32.compile(SOURCE, typedWorld.imports, 1 << 20, {policy: ARG}).image.length
// MODE wasm:  compileTypedWorld(SOURCE, <bytes of the reactor file ARG>).length
// Each round creates a fresh runtime, evaluates the compiler FILEs (parsing each time) and compiles once. It prints,
// per round, the microseconds spent loading and compiling, the peak QuickJS heap during the compile above the heap
// after loading (bytes from malloc_usable_size, as QuickJS accounts them) and the output length.
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"

static size_t peak;

static void *measure_malloc(JSMallocState *s, size_t size) {
    void *p = malloc(size);
    if (!p) return NULL;
    s->malloc_count++;
    s->malloc_size += malloc_usable_size(p);
    if (s->malloc_size > peak) peak = s->malloc_size;
    return p;
}

static void measure_free(JSMallocState *s, void *p) {
    if (!p) return;
    s->malloc_count--;
    s->malloc_size -= malloc_usable_size(p);
    free(p);
}

static void *measure_realloc(JSMallocState *s, void *p, size_t size) {
    if (!p) return size ? measure_malloc(s, size) : NULL;
    size_t old = malloc_usable_size(p);
    if (!size) { measure_free(s, p); return NULL; }
    void *q = realloc(p, size);
    if (!q) return NULL;
    s->malloc_size += malloc_usable_size(q) - old;
    if (s->malloc_size > peak) peak = s->malloc_size;
    return q;
}

static size_t measure_usable(const void *p) { return malloc_usable_size((void *)p); }

static const JSMallocFunctions functions = {measure_malloc, measure_free, measure_realloc, measure_usable};

static char *slurp(const char *path, size_t *length) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(2); }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *text = malloc(n + 1);
    if (fread(text, 1, n, f) != (size_t)n) { perror(path); exit(2); }
    text[n] = 0;
    fclose(f);
    *length = n;
    return text;
}

static double now_us(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec * 1e6 + t.tv_nsec / 1e3;
}

static void fail(JSContext *ctx, const char *what) {
    JSValue e = JS_GetException(ctx);
    const char *s = JS_ToCString(ctx, e);
    fprintf(stderr, "%s: %s\n", what, s ? s : "?");
    exit(1);
}

int main(int argc, char **argv) {
    if (argc < 6) { fprintf(stderr, "usage: %s ROUNDS SOURCE MODE ARG FILE...\n", argv[0]); return 2; }
    int rounds = atoi(argv[1]);
    int wasm = !strcmp(argv[3], "wasm");
    size_t source_length, reactor_length = 0;
    char *source = slurp(argv[2], &source_length);
    char *reactor = wasm ? slurp(argv[4], &reactor_length) : NULL;
    for (int round = 0; round < rounds; round++) {
        JSRuntime *rt = JS_NewRuntime2(&functions, NULL);
        JS_SetMaxStackSize(rt, 8 << 20);
        JSContext *ctx = JS_NewContext(rt);
        double t0 = now_us();
        for (int i = 5; i < argc; i++) {
            size_t n;
            char *text = slurp(argv[i], &n);
            JSValue v = JS_Eval(ctx, text, n, argv[i], JS_EVAL_TYPE_GLOBAL);
            free(text);
            if (JS_IsException(v)) fail(ctx, argv[i]);
            JS_FreeValue(ctx, v);
        }
        JSValue global = JS_GetGlobalObject(ctx);
        JS_SetPropertyStr(ctx, global, "SOURCE", JS_NewStringLen(ctx, source, source_length));
        if (wasm) {
            JS_SetPropertyStr(ctx, global, "REACTOR",
                JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_length));
        } else {
            JS_SetPropertyStr(ctx, global, "POLICY", JS_NewString(ctx, argv[4]));
        }
        JS_FreeValue(ctx, global);
        JS_RunGC(rt);
        JSMemoryUsage usage;
        JS_ComputeMemoryUsage(rt, &usage);
        size_t base = usage.malloc_size;
        peak = base;
        const char *run = wasm
            ? "compileTypedWorld(SOURCE, new Uint8Array(REACTOR)).length"
            : "typedRv32.compile(SOURCE, typedWorld.imports, 1 << 20, {policy: POLICY}).image.length";
        double t1 = now_us();
        JSValue v = JS_Eval(ctx, run, strlen(run), "<compile>", JS_EVAL_TYPE_GLOBAL);
        double t2 = now_us();
        if (JS_IsException(v)) fail(ctx, "compile");
        int32_t bytes = 0;
        JS_ToInt32(ctx, &bytes, v);
        JS_FreeValue(ctx, v);
        printf("%d load_us=%.0f compile_us=%.0f peak=%zu out=%d\n", round, t1 - t0, t2 - t1, peak - base, bytes);
        JS_FreeContext(ctx);
        JS_FreeRuntime(rt);
    }
    return 0;
}

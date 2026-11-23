// Per-pass compile time of the Typed compiler in a bare QuickJS realm on the host (the interpreter the P4
// runs), and the realm's memory after loading the compiler and at the end of the compile.
//
//   cc -O2 -DCONFIG_VERSION='"2026-06-04"' -I firmware/third_party/quickjs -o qjs-pass-timing 04-qjs-pass-timing.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-pass-timing ROUNDS SOURCE POLICY IMPORTS DRIVER MODE FILE...
//
// Each round creates a fresh runtime, defines performance.now (microsecond clock), evaluates the compiler
// FILEs and sets SOURCE, POLICY and WORLD (IMPORTS
// "world": link against typedWorld.imports) and evaluates DRIVER (pass-totals.js), which returns a JSON
// string. It prints one line per round:
//   {"round":R,"load_us":..,"load_bytes":..,"peak_bytes":..,"result":{...}}
// load_bytes is the runtime's malloc_size after loading the files, peak_bytes the largest malloc_size seen
// by a tracking allocator over the whole round (the P4's "peak_js_bytes" counts the same).
// MODE "parse" parses every FILE in every round. MODE "cache" does what typed_p4.c does: the first round
// parses each FILE with JS_EVAL_FLAG_COMPILE_ONLY and keeps JS_WriteObject's bytecode outside the runtime;
// later rounds JS_ReadObject it instead of parsing.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <malloc.h>
#include "quickjs.h"

static size_t used, peak;

static void *track_malloc(JSMallocState *state, size_t size) {
    void *p = malloc(size);
    if (p) { used += malloc_usable_size(p); if (used > peak) peak = used; }
    return p;
}
static void track_free(JSMallocState *state, void *p) {
    if (!p) return;
    used -= malloc_usable_size(p);
    free(p);
}
static void *track_realloc(JSMallocState *state, void *p, size_t size) {
    size_t before = p ? malloc_usable_size(p) : 0;
    void *q = realloc(p, size);
    if (!q && size) return NULL;
    used -= before;
    if (q) { used += malloc_usable_size(q); if (used > peak) peak = used; }
    return q;
}
static size_t track_usable(const void *p) { return malloc_usable_size((void *)p); }
static const JSMallocFunctions tracking = {track_malloc, track_free, track_realloc, track_usable};

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

static JSValue performance_now(JSContext *ctx, JSValueConst this, int argc, JSValueConst *argv) {
    return JS_NewFloat64(ctx, now_us() / 1e3);
}

static void fail(JSContext *ctx, const char *what) {
    JSValue e = JS_GetException(ctx);
    const char *s = JS_ToCString(ctx, e);
    fprintf(stderr, "%s: %s\n", what, s ? s : "?");
    exit(1);
}

int main(int argc, char **argv) {
    if (argc < 8) {
        fprintf(stderr, "usage: %s ROUNDS SOURCE POLICY IMPORTS DRIVER MODE FILE...\n", argv[0]);
        return 2;
    }
    int rounds = atoi(argv[1]);
    size_t source_length, driver_length;
    char *source = slurp(argv[2], &source_length);
    char *driver = slurp(argv[5], &driver_length);
    int cache = !strcmp(argv[6], "cache");
    uint8_t *bytecode[64] = {0};
    size_t bytecode_length[64] = {0};
    if (argc - 7 > 64) { fprintf(stderr, "too many files\n"); return 2; }
    for (int round = 0; round < rounds; round++) {
        used = peak = 0;
        JSRuntime *rt = JS_NewRuntime2(&tracking, NULL);
        JS_SetMaxStackSize(rt, 8 << 20);
        JSContext *ctx = JS_NewContext(rt);
        JSValue global = JS_GetGlobalObject(ctx);
        JSValue performance = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, performance, "now", JS_NewCFunction(ctx, performance_now, "now", 0));
        JS_SetPropertyStr(ctx, global, "performance", performance);
        double t0 = now_us();
        for (int i = 7; i < argc; i++) {
            JSValue function;
            if (cache && bytecode[i - 7]) {
                function = JS_ReadObject(ctx, bytecode[i - 7], bytecode_length[i - 7], JS_READ_OBJ_BYTECODE);
            } else {
                size_t n;
                char *text = slurp(argv[i], &n);
                function = JS_Eval(ctx, text, n, argv[i], JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
                free(text);
                if (cache && !JS_IsException(function)) {
                    size_t size = 0;
                    uint8_t *written = JS_WriteObject(ctx, &size, function, JS_WRITE_OBJ_BYTECODE);
                    bytecode[i - 7] = malloc(size);
                    memcpy(bytecode[i - 7], written, size);
                    bytecode_length[i - 7] = size;
                    js_free(ctx, written);
                    fprintf(stderr, "bytecode %s %zu\n", argv[i], size);
                }
            }
            if (JS_IsException(function)) fail(ctx, argv[i]);
            JSValue v = JS_EvalFunction(ctx, function);
            if (JS_IsException(v)) fail(ctx, argv[i]);
            JS_FreeValue(ctx, v);
        }
        double t1 = now_us();
        size_t load_bytes = used;
        JS_SetPropertyStr(ctx, global, "SOURCE", JS_NewStringLen(ctx, source, source_length));
        JS_SetPropertyStr(ctx, global, "POLICY", JS_NewString(ctx, argv[3]));
        JS_SetPropertyStr(ctx, global, "WORLD", JS_NewBool(ctx, !strcmp(argv[4], "world")));
        JS_FreeValue(ctx, global);
        JSValue v = JS_Eval(ctx, driver, driver_length, argv[5], JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(v)) fail(ctx, "compile");
        const char *result = JS_ToCString(ctx, v);
        printf("{\"round\":%d,\"load_us\":%.0f,\"load_bytes\":%zu,\"peak_bytes\":%zu,\"result\":%s}\n",
               round, t1 - t0, load_bytes, peak, result);
        fflush(stdout);
        JS_FreeCString(ctx, result);
        JS_FreeValue(ctx, v);
        JS_FreeContext(ctx);
        JS_FreeRuntime(rt);
    }
    return 0;
}

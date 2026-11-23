// Time the Typed compiler in a bare QuickJS realm on the host (the interpreter the P4 runs).
//
//   cc -O2 -I firmware/third_party/quickjs -o qjs-compile-time 02-qjs-compile-time.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-compile-time ROUNDS SOURCE POLICY IMPORTS FILE...
//
// Each round creates a fresh runtime, evaluates the compiler FILEs (as typed_p4.c does, but parsing
// each time), then compiles SOURCE once with {policy: POLICY} (IMPORTS: "world" for typedWorld.imports,
// anything else for none). It prints, per round, the microseconds spent loading the files and
// compiling, and the image's length, so that two compiler revisions can be compared in alternation.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"

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
    if (argc < 6) { fprintf(stderr, "usage: %s ROUNDS SOURCE POLICY IMPORTS FILE...\n", argv[0]); return 2; }
    int rounds = atoi(argv[1]);
    size_t source_length;
    char *source = slurp(argv[2], &source_length);
    for (int round = 0; round < rounds; round++) {
        JSRuntime *rt = JS_NewRuntime();
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
        double t1 = now_us();
        JSValue global = JS_GetGlobalObject(ctx);
        JS_SetPropertyStr(ctx, global, "SOURCE", JS_NewStringLen(ctx, source, source_length));
        JS_SetPropertyStr(ctx, global, "POLICY", JS_NewString(ctx, argv[3]));
        JS_SetPropertyStr(ctx, global, "WORLD", JS_NewBool(ctx, !strcmp(argv[4], "world")));
        JS_FreeValue(ctx, global);
        const char *run = "typedRv32.compile(SOURCE, WORLD ? typedWorld.imports : [], 1 << 20, {policy: POLICY}).image.length";
        JSValue v = JS_Eval(ctx, run, strlen(run), "<compile>", JS_EVAL_TYPE_GLOBAL);
        double t2 = now_us();
        if (JS_IsException(v)) fail(ctx, "compile");
        int32_t bytes = 0;
        JS_ToInt32(ctx, &bytes, v);
        JS_FreeValue(ctx, v);
        printf("%d load_us=%.0f compile_us=%.0f image=%d\n", round, t1 - t0, t2 - t1, bytes);
        JS_FreeContext(ctx);
        JS_FreeRuntime(rt);
    }
    return 0;
}

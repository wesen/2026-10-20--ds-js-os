// One warm compile in bare QuickJS on the host, as typed_p4.c runs it, for callgrind's cache simulation: a first
// runtime parses each compiler FILE (strip flags as given) and keeps its bytecode; a second runtime reads the
// bytecode, then measured_compile() evaluates DRIVER (which reads SOURCE, POLICY and WORLD). Run under
//   valgrind --tool=callgrind --cache-sim=yes --toggle-collect=measured_compile \
//            --I1=16384,4,64 --D1=65536,4,64 --LL=131072,8,64 qjs-compile ...
// to count only the compile's instructions and simulated misses.
//
//   cc -O2 -g -DCONFIG_VERSION='"2026-06-04"' -I firmware/third_party/quickjs -o /tmp/qjs-compile 11-qjs-compile.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-compile STRIP SOURCE POLICY WORLD DRIVER FILE...    WORLD: world (link against typedWorld.imports) or none
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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

static void fail(JSContext *ctx, const char *what) {
    JSValue e = JS_GetException(ctx);
    const char *m = JS_ToCString(ctx, e);
    fprintf(stderr, "%s: %s\n", what, m ? m : "?");
    exit(1);
}

__attribute__((noinline)) JSValue measured_compile(JSContext *ctx, const char *driver, size_t n, const char *name) {
    return JS_Eval(ctx, driver, n, name, JS_EVAL_TYPE_GLOBAL);
}

int main(int argc, char **argv) {
    if (argc < 7) { fprintf(stderr, "usage: qjs-compile STRIP SOURCE POLICY WORLD DRIVER FILE...\n"); return 2; }
    int strip = atoi(argv[1]), files = argc - 6;
    uint8_t **bytes = calloc(files, sizeof *bytes);
    size_t *lengths = calloc(files, sizeof *lengths);
    JSRuntime *rt = JS_NewRuntime();
    JS_SetStripInfo(rt, strip == 1 ? JS_STRIP_SOURCE : strip == 2 ? JS_STRIP_DEBUG : 0);
    JSContext *ctx = JS_NewContext(rt);
    for (int i = 0; i < files; i++) {
        size_t n;
        char *text = slurp(argv[i + 6], &n);
        JSValue fn = JS_Eval(ctx, text, n, argv[i + 6], JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
        if (JS_IsException(fn)) fail(ctx, argv[i + 6]);
        uint8_t *w = JS_WriteObject(ctx, &lengths[i], fn, JS_WRITE_OBJ_BYTECODE);
        bytes[i] = malloc(lengths[i]);
        memcpy(bytes[i], w, lengths[i]);
        js_free(ctx, w);
        JS_FreeValue(ctx, fn);
        free(text);
    }
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    rt = JS_NewRuntime();
    JS_SetMaxStackSize(rt, 8 << 20);
    ctx = JS_NewContext(rt);
    for (int i = 0; i < files; i++) {
        JSValue fn = JS_ReadObject(ctx, bytes[i], lengths[i], JS_READ_OBJ_BYTECODE);
        if (JS_IsException(fn)) fail(ctx, argv[i + 6]);
        JSValue v = JS_EvalFunction(ctx, fn);
        if (JS_IsException(v)) fail(ctx, argv[i + 6]);
        JS_FreeValue(ctx, v);
    }
    size_t n, dn;
    char *source = slurp(argv[2], &n);
    char *driver = slurp(argv[5], &dn);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "SOURCE", JS_NewStringLen(ctx, source, n));
    JS_SetPropertyStr(ctx, global, "POLICY", JS_NewString(ctx, argv[3]));
    JS_SetPropertyStr(ctx, global, "WORLD", JS_NewBool(ctx, !strcmp(argv[4], "world")));
    JS_FreeValue(ctx, global);
    JSValue result = measured_compile(ctx, driver, dn, argv[5]);
    if (JS_IsException(result)) fail(ctx, "compile");
    const char *s = JS_ToCString(ctx, result);
    puts(s ? s : "");
    return 0;
}

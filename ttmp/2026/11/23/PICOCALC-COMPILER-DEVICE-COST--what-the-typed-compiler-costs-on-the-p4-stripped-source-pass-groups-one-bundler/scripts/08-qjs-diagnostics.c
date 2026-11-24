// Compile errors through the compiler as the P4 runs it, per QuickJS strip mode: each compiler FILE is parsed in a
// runtime with the strip flags and its bytecode written (as the first boot compile does), then a fresh runtime reads
// the bytecode (as every later compile does) and evaluates DRIVER, whose completion value (a string) is printed.
// typed_p4.c prints a rejected compile as "<app> compile rejected: " + String(exception), then the stack.
//
//   cc -O2 -DCONFIG_VERSION='"2026-06-04"' -I firmware/third_party/quickjs -o /tmp/qjs-diagnostics 08-qjs-diagnostics.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-diagnostics STRIP DRIVER FILE...      STRIP: 0, 1 (JS_STRIP_SOURCE), 2 (JS_STRIP_DEBUG)
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

int main(int argc, char **argv) {
    if (argc < 4) { fprintf(stderr, "usage: qjs-diagnostics STRIP DRIVER FILE...\n"); return 2; }
    int strip = atoi(argv[1]), files = argc - 3;
    uint8_t **bytes = calloc(files, sizeof *bytes);
    size_t *lengths = calloc(files, sizeof *lengths);
    JSRuntime *rt = JS_NewRuntime();
    JS_SetStripInfo(rt, strip == 1 ? JS_STRIP_SOURCE : strip == 2 ? JS_STRIP_DEBUG : 0);
    JSContext *ctx = JS_NewContext(rt);
    for (int i = 0; i < files; i++) {
        size_t n;
        char *text = slurp(argv[i + 3], &n);
        JSValue fn = JS_Eval(ctx, text, n, argv[i + 3], JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
        if (JS_IsException(fn)) fail(ctx, argv[i + 3]);
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
    ctx = JS_NewContext(rt);
    for (int i = 0; i < files; i++) {
        JSValue fn = JS_ReadObject(ctx, bytes[i], lengths[i], JS_READ_OBJ_BYTECODE);
        if (JS_IsException(fn)) fail(ctx, argv[i + 3]);
        JSValue v = JS_EvalFunction(ctx, fn);
        if (JS_IsException(v)) fail(ctx, argv[i + 3]);
        JS_FreeValue(ctx, v);
    }
    size_t n;
    char *driver = slurp(argv[2], &n);
    JSValue result = JS_Eval(ctx, driver, n, argv[2], JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) fail(ctx, argv[2]);
    const char *s = JS_ToCString(ctx, result);
    puts(s ? s : "");
    return 0;
}

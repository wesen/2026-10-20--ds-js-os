// A bare QuickJS realm on the host with the P4's lexical index (typed_lex_index.c) installed, evaluating FILEs in
// order. 02-check-lex-index.js, evaluated last, compares the index's tokens with the reference lexer's.
//
//   cc -O2 -DCONFIG_VERSION='"host"' -I firmware/third_party/quickjs -I firmware/port/esp32p4/main \
//      -o qjs-lex-index 01-qjs-lex-index.c firmware/port/esp32p4/main/typed_lex_index.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-lex-index FILE...
#include <stdio.h>
#include <stdlib.h>
#include "quickjs.h"
#include "typed_lex_index.h"

static char *slurp(const char *path, size_t *n) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    rewind(f);
    char *data = malloc((size_t)size + 1);
    if (!data || fread(data, 1, (size_t)size, f) != (size_t)size) { fclose(f); free(data); return NULL; }
    fclose(f);
    data[size] = 0;
    *n = (size_t)size;
    return data;
}

static JSValue print(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self;
    for (int i = 0; i < argc; i++) {
        const char *s = JS_ToCString(ctx, argv[i]);
        if (!s) return JS_EXCEPTION;
        printf(i ? " %s" : "%s", s);
        JS_FreeCString(ctx, s);
    }
    printf("\n");
    return JS_UNDEFINED;
}

static JSValue read_file(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self; (void)argc;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;
    size_t n;
    char *data = slurp(path, &n);
    JS_FreeCString(ctx, path);
    if (!data) return JS_ThrowInternalError(ctx, "cannot read file");
    JSValue text = JS_NewStringLen(ctx, data, n);
    free(data);
    return text;
}

int main(int argc, char **argv) {
    JSRuntime *rt = JS_NewRuntime();
    JSContext *ctx = JS_NewContext(rt);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "print", JS_NewCFunction(ctx, print, "print", 1));
    JS_SetPropertyStr(ctx, global, "readFile", JS_NewCFunction(ctx, read_file, "readFile", 1));
    JS_FreeValue(ctx, global);
    if (!typed_lex_index_install(ctx)) return 2;
    for (int i = 1; i < argc; i++) {
        size_t n;
        char *source = slurp(argv[i], &n);
        if (!source) { fprintf(stderr, "cannot read %s\n", argv[i]); return 2; }
        JSValue result = JS_Eval(ctx, source, n, argv[i], JS_EVAL_TYPE_GLOBAL);
        free(source);
        if (JS_IsException(result)) {
            JSValue error = JS_GetException(ctx);
            const char *message = JS_ToCString(ctx, error);
            JSValue stack = JS_GetPropertyStr(ctx, error, "stack");
            const char *trace = JS_ToCString(ctx, stack);
            fprintf(stderr, "%s: %s\n%s\n", argv[i], message ? message : "?", trace ? trace : "");
            return 1;
        }
        JS_FreeValue(ctx, result);
    }
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return 0;
}

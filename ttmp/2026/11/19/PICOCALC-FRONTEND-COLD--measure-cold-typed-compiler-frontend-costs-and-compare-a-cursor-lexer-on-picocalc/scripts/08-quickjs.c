// Cold native compiler and lexical differential runner using vendored QuickJS.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

static int64_t micros(clockid_t clock) {
    struct timespec time;
    clock_gettime(clock, &time);
    return (int64_t)time.tv_sec * 1000000 + time.tv_nsec / 1000;
}

static void check(int ok, const char *why) {
    if (!ok) {
        fprintf(stderr, "%s\n", why);
        exit(1);
    }
}

static char *read_file(const char *path, size_t *length) {
    FILE *input = fopen(path, "rb");
    check(input && !fseek(input, 0, SEEK_END), path);
    long size = ftell(input);
    check(size >= 0 && !fseek(input, 0, SEEK_SET), path);
    char *text = malloc((size_t)size + 1);
    check(text && fread(text, 1, (size_t)size, input) == (size_t)size, path);
    check(!fclose(input), path);
    text[size] = 0;
    *length = (size_t)size;
    return text;
}

static void write_file(const char *path, const void *bytes, size_t size) {
    FILE *output = fopen(path, "wb");
    check(output && fwrite(bytes, 1, size, output) == size && !fclose(output), path);
}

static JSValue ensure(JSContext *ctx, JSValue value) {
    if (JS_IsException(value)) {
        JSValue error = JS_GetException(ctx);
        const char *text = JS_ToCString(ctx, error);
        fprintf(stderr, "QuickJS failed: %s\n", text ? text : "unknown exception");
        exit(1);
    }
    return value;
}

static JSValue evaluate(JSContext *ctx, const char *path, int export_lexer) {
    size_t length;
    char *text = read_file(path, &length);
    if (export_lexer) {
        const char *anchor = "globalThis.compileTyped =";
        const char *inject = "globalThis.TestLexer = Lexer;\n";
        const char *at = strstr(text, anchor);
        check(at != NULL, "lexer export anchor missing");
        size_t prefix = (size_t)(at - text);
        size_t extra = strlen(inject);
        char *code = malloc(length + extra + 1);
        check(code != NULL, "lexer export source allocation");
        memcpy(code, text, prefix);
        memcpy(code + prefix, inject, extra);
        memcpy(code + prefix + extra, at, length - prefix + 1);
        free(text);
        text = code;
        length += extra;
    }
    JSValue result = ensure(ctx, JS_Eval(ctx, text, length, path, JS_EVAL_TYPE_GLOBAL));
    free(text);
    return result;
}

static void compile(JSRuntime *rt, JSContext *ctx, char **args, int64_t start, int64_t cpu_start) {
    for (unsigned i = 0; i < 3; i++) JS_FreeValue(ctx, evaluate(ctx, args[i], 0));

    size_t source_length, reactor_length;
    char *text = read_file(args[3], &source_length);
    char *reactor = read_file(args[4], &reactor_length);
    JSValue src = ensure(ctx, JS_NewStringLen(ctx, text, source_length));
    JSValue bytes = ensure(ctx, JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_length));
    free(text);
    free(reactor);
    JSValue view_args[] = {bytes, JS_NewUint32(ctx, 0), JS_NewUint32(ctx, (uint32_t)reactor_length)};
    JSValue view = ensure(ctx, JS_NewTypedArray(ctx, 3, view_args, JS_TYPED_ARRAY_UINT8));
    JS_FreeValue(ctx, bytes);
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue function = ensure(ctx, JS_GetPropertyStr(ctx, global, args[5]));
    JSValue values[] = {src, view};
    JSValue result = ensure(ctx, JS_Call(ctx, function, JS_UNDEFINED, 2, values));
    JS_FreeValue(ctx, function);
    JS_FreeValue(ctx, global);
    JS_FreeValue(ctx, view);
    JS_FreeValue(ctx, src);
    size_t offset, size, unit, available;
    JSValue buffer = ensure(ctx, JS_GetTypedArrayBuffer(ctx, result, &offset, &size, &unit));
    uint8_t *data = JS_GetArrayBuffer(ctx, &available, buffer);
    check(data && unit == 1 && offset <= available && size <= available - offset, "compiled module is not a byte array");
    uint8_t *copy = malloc(size);
    check(copy != NULL, "module allocation");
    memcpy(copy, data + offset, size);
    JS_FreeValue(ctx, buffer);
    JS_FreeValue(ctx, result);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    int64_t elapsed = micros(CLOCK_MONOTONIC) - start;
    int64_t cpu_elapsed = micros(CLOCK_PROCESS_CPUTIME_ID) - cpu_start;
    write_file(args[6], copy, size);
    free(copy);
    printf("%lld %lld\n", (long long)elapsed, (long long)cpu_elapsed);
}

static void lex(JSRuntime *rt, JSContext *ctx, char **args) {
    JS_FreeValue(ctx, evaluate(ctx, args[0], 1));
    JS_FreeValue(ctx, evaluate(ctx, args[1], 0));
    JSValue result = evaluate(ctx, args[2], 0);
    size_t length;
    const char *tokens = JS_ToCStringLen(ctx, &length, result);
    check(tokens != NULL, "lexical fixture result");
    write_file(args[3], tokens, length);
    JS_FreeCString(ctx, tokens);
    JS_FreeValue(ctx, result);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
}

int main(int argc, char **argv) {
    int compiling = argc == 9 && !strcmp(argv[1], "compile");
    check(compiling || (argc == 6 && !strcmp(argv[1], "lex")),
          "usage: quickjs compile wasm rv32 linker source reactor entry output | quickjs lex wasm rv32 fixture output");
    int64_t start = micros(CLOCK_MONOTONIC);
    int64_t cpu_start = micros(CLOCK_PROCESS_CPUTIME_ID);
    JSRuntime *rt = JS_NewRuntime();
    check(rt != NULL, "runtime allocation");
    JS_SetMaxStackSize(rt, 8 * 1024 * 1024);
    JSContext *ctx = JS_NewContext(rt);
    check(ctx != NULL, "context allocation");
    if (compiling) {
        compile(rt, ctx, argv + 2, start, cpu_start);
    } else {
        lex(rt, ctx, argv + 2);
    }
}

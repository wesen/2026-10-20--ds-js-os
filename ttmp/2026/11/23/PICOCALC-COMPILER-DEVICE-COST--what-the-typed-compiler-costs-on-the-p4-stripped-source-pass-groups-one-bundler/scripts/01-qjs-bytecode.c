// The compiler's QuickJS bytecode and realm on the host, per strip mode, as typed_p4.c makes and reads them.
//
//   cc -O2 -DCONFIG_VERSION='"2026-06-04"' -I firmware/third_party/quickjs -o /tmp/qjs-bytecode 01-qjs-bytecode.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-bytecode STRIP FILE...      STRIP: 0 (none), 1 (JS_STRIP_SOURCE), 2 (JS_STRIP_DEBUG)
//
// Phase 1 (as the first boot compile): one runtime with the strip flags parses each FILE with
// JS_EVAL_FLAG_COMPILE_ONLY, keeps JS_WriteObject's bytecode, evaluates the function, and records the runtime's
// tracked heap after each file. Phase 2 (as every later compile): a fresh runtime reads each kept bytecode with
// JS_ReadObject and evaluates it, recording the heap after each. Prints one JSON object.
// The heap counts malloc_usable_size, as typed_p4.c counts port_heap_usable (the P4's block sizes differ).
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"

static size_t used, peak;
static void *track_malloc(JSMallocState *s, size_t n) {
    void *p = malloc(n);
    if (p) { used += malloc_usable_size(p); if (used > peak) peak = used; }
    return p;
}
static void track_free(JSMallocState *s, void *p) { if (p) { used -= malloc_usable_size(p); free(p); } }
static void *track_realloc(JSMallocState *s, void *p, size_t n) {
    size_t before = p ? malloc_usable_size(p) : 0;
    void *q = realloc(p, n);
    if (!q && n) return NULL;
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

static void fail(JSContext *ctx, const char *what) {
    JSValue e = JS_GetException(ctx);
    const char *m = JS_ToCString(ctx, e);
    fprintf(stderr, "%s: %s\n", what, m ? m : "?");
    exit(1);
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: qjs-bytecode STRIP FILE...\n"); return 2; }
    int strip = atoi(argv[1]);
    int files = argc - 2;
    uint8_t **bytes = calloc(files, sizeof *bytes);
    size_t *lengths = calloc(files, sizeof *lengths);
    printf("{\"strip\":%d,\"files\":[", strip);
    used = peak = 0;
    JSRuntime *rt = JS_NewRuntime2(&tracking, NULL);
    JS_SetStripInfo(rt, strip == 1 ? JS_STRIP_SOURCE : strip == 2 ? JS_STRIP_DEBUG : 0);
    JSContext *ctx = JS_NewContext(rt);
    size_t base = used;
    for (int i = 0; i < files; i++) {
        size_t n;
        char *text = slurp(argv[i + 2], &n);
        JSValue fn = JS_Eval(ctx, text, n, argv[i + 2], JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
        if (JS_IsException(fn)) fail(ctx, argv[i + 2]);
        size_t size = 0;
        uint8_t *w = JS_WriteObject(ctx, &size, fn, JS_WRITE_OBJ_BYTECODE);
        bytes[i] = malloc(size);
        memcpy(bytes[i], w, size);
        lengths[i] = size;
        js_free(ctx, w);
        JSValue v = JS_EvalFunction(ctx, fn);
        if (JS_IsException(v)) fail(ctx, argv[i + 2]);
        JS_FreeValue(ctx, v);
        free(text);
        printf("%s{\"file\":\"%s\",\"sourceBytes\":%zu,\"bytecodeBytes\":%zu,\"parsedRealmBytes\":%zu}", i ? "," : "",
               argv[i + 2], n, size, used - base);
    }
    size_t parsed_peak = peak - base;
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    used = peak = 0;
    rt = JS_NewRuntime2(&tracking, NULL);
    ctx = JS_NewContext(rt);
    base = used;
    printf("],\"read\":[");
    for (int i = 0; i < files; i++) {
        JSValue fn = JS_ReadObject(ctx, bytes[i], lengths[i], JS_READ_OBJ_BYTECODE);
        if (JS_IsException(fn)) fail(ctx, argv[i + 2]);
        JSValue v = JS_EvalFunction(ctx, fn);
        if (JS_IsException(v)) fail(ctx, argv[i + 2]);
        JS_FreeValue(ctx, v);
        printf("%s%zu", i ? "," : "", used - base);
    }
    printf("],\"parsedPeak\":%zu,\"readPeak\":%zu}\n", parsed_peak, peak - base);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return 0;
}

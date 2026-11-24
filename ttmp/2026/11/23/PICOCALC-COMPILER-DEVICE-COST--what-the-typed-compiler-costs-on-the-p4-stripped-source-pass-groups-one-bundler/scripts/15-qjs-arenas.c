// The embedder heap calls of one warm compile on the host, with typed_p4.c's allocator policy: an allocator that, like
// compile_malloc, does not maintain malloc_state.malloc_size (so QuickJS never starts its cycle collector), counting
// mallocs, frees and reallocs from the compile's start, and with PARK=1 typed_p4.c's arena parking (requests of
// 3584..4096 bytes served as 4096-byte blocks, up to 64 freed ones kept and reused).
//
//   cc -O2 -DCONFIG_VERSION='"2026-06-04"' -I firmware/third_party/quickjs -o /tmp/qjs-arenas 15-qjs-arenas.c \
//      firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread
//   qjs-arenas PARK STRIP SOURCE POLICY WORLD DRIVER FILE...
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"

static int park, counting;
static size_t live, peak, mallocs, frees, reallocs, reused;
static void *parked[64];
static int parked_count;

static void account(size_t old, size_t now) { live = live - old + now; if (live > peak) peak = live; }
static void *a_malloc(JSMallocState *s, size_t n) {
    int arena = park && n >= 3584 && n <= 4096;
    if (arena && parked_count) { reused += counting; return parked[--parked_count]; }
    if (arena) n = 4096;
    void *p = malloc(n);
    if (p) account(0, malloc_usable_size(p));
    mallocs += counting;
    return p;
}
static void a_free(JSMallocState *s, void *p) {
    if (!p) return;
    size_t u = malloc_usable_size(p);
    if (park && u >= 4096 && u < 4160 && parked_count < 64) { parked[parked_count++] = p; return; }
    account(u, 0);
    free(p);
    frees += counting;
}
static void *a_realloc(JSMallocState *s, void *p, size_t n) {
    if (!p) return a_malloc(s, n);
    if (!n) { a_free(s, p); return NULL; }
    size_t old = malloc_usable_size(p);
    void *q = realloc(p, n);
    if (q) account(old, malloc_usable_size(q));
    reallocs += counting;
    return q;
}
static size_t a_usable(const void *p) { return malloc_usable_size((void *)p); }
static const JSMallocFunctions device_like = {a_malloc, a_free, a_realloc, a_usable};

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
    if (argc < 8) { fprintf(stderr, "usage: qjs-arenas PARK STRIP SOURCE POLICY WORLD DRIVER FILE...\n"); return 2; }
    park = atoi(argv[1]);
    int strip = atoi(argv[2]), files = argc - 7;
    uint8_t **bytes = calloc(files, sizeof *bytes);
    size_t *lengths = calloc(files, sizeof *lengths);
    JSRuntime *rt = JS_NewRuntime();
    JS_SetStripInfo(rt, strip == 1 ? JS_STRIP_SOURCE : strip == 2 ? JS_STRIP_DEBUG : 0);
    JSContext *ctx = JS_NewContext(rt);
    for (int i = 0; i < files; i++) {
        size_t n;
        char *text = slurp(argv[i + 7], &n);
        JSValue fn = JS_Eval(ctx, text, n, argv[i + 7], JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
        if (JS_IsException(fn)) fail(ctx, argv[i + 7]);
        uint8_t *w = JS_WriteObject(ctx, &lengths[i], fn, JS_WRITE_OBJ_BYTECODE);
        bytes[i] = malloc(lengths[i]);
        memcpy(bytes[i], w, lengths[i]);
        js_free(ctx, w);
        JS_FreeValue(ctx, fn);
        free(text);
    }
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    rt = JS_NewRuntime2(&device_like, NULL);
    JS_SetMaxStackSize(rt, 8 << 20);
    ctx = JS_NewContext(rt);
    for (int i = 0; i < files; i++) {
        JSValue fn = JS_ReadObject(ctx, bytes[i], lengths[i], JS_READ_OBJ_BYTECODE);
        if (JS_IsException(fn)) fail(ctx, argv[i + 7]);
        JSValue v = JS_EvalFunction(ctx, fn);
        if (JS_IsException(v)) fail(ctx, argv[i + 7]);
        JS_FreeValue(ctx, v);
    }
    size_t loaded = live, n, dn;
    char *source = slurp(argv[3], &n);
    char *driver = slurp(argv[6], &dn);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "SOURCE", JS_NewStringLen(ctx, source, n));
    JS_SetPropertyStr(ctx, global, "POLICY", JS_NewString(ctx, argv[4]));
    JS_SetPropertyStr(ctx, global, "WORLD", JS_NewBool(ctx, !strcmp(argv[5], "world")));
    JS_FreeValue(ctx, global);
    counting = 1;
    JSValue result = JS_Eval(ctx, driver, dn, argv[6], JS_EVAL_TYPE_GLOBAL);
    counting = 0;
    if (JS_IsException(result)) fail(ctx, "compile");
    const char *s = JS_ToCString(ctx, result);
    printf("{\"park\":%d,\"strip\":%d,\"result\":%s,\"realmBytes\":%zu,\"peakBytes\":%zu,\"mallocs\":%zu,\"frees\":%zu,"
           "\"reallocs\":%zu,\"reused\":%zu}\n", park, strip, s ? s : "null", loaded, peak, mallocs, frees, reallocs, reused);
    return 0;
}

/* Both engines receive the same JSON and message type. Only dispatch is timed.
 * Materialize the fake kernel's reply outside that interval. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>
#include "nw.h"
#include "quickjs.h"

static int checksum;
static int received;
#define nw_reply fixture_unused_reply
#define NW_PRINTF(...) ((void)0)
#include "nw_fake_calls.inc"
#undef nw_reply
int nw_reply(const char *json) {
    char *end;
    long value = strtol(json, &end, 10);
    if (!*json || *end || value < 0 || value > INT32_MAX) abort();
    checksum = (int)value;
    received++;
    return 0;
}

static uint64_t monotonic_ns(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)t.tv_sec * 1000000000 + t.tv_nsec;
}

static void require_js(JSContext *ctx, JSValue value) {
    if (!JS_IsException(value)) return;
    JSValue error = JS_GetException(ctx);
    const char *why = JS_ToCString(ctx, error);
    fprintf(stderr, "QuickJS exception: %s\n", why ? why : "(unknown)");
    exit(1);
}

static void evaluate(JSContext *ctx, const char *text, size_t len, const char *name) {
    JSValue value = JS_Eval(ctx, text, len, name, JS_EVAL_TYPE_GLOBAL);
    require_js(ctx, value);
    JS_FreeValue(ctx, value);
}

static void load(JSContext *ctx, const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f || fseek(f, 0, SEEK_END)) abort();
    long len = ftell(f);
    if (len < 0 || fseek(f, 0, SEEK_SET)) abort();
    char *buf = calloc((size_t)len + 1, 1);
    if (!buf || fread(buf, 1, len, f) != (size_t)len) abort();
    fclose(f);
    evaluate(ctx, buf, len, path);
    free(buf);
}

static JSValue quick_dispatch(JSContext *ctx, JSValue fn, const char *type, const char *json, int ask,
                              uint64_t *elapsed) {
    JSValue args[] = {JS_NewInt32(ctx, 0), JS_NewString(ctx, type), JS_NewString(ctx, json),
                      JS_NewString(ctx, "harness"), JS_NewBool(ctx, ask)};
    uint64_t start = monotonic_ns();
    JSValue result = JS_Call(ctx, fn, JS_UNDEFINED, 5, args);
    *elapsed = monotonic_ns() - start;
    require_js(ctx, result);
    for (int i = 0; i < 5; i++) JS_FreeValue(ctx, args[i]);
    return result;
}

int main(int argc, char **argv) {
    if (argc != 5) return 2;
    const char *type = argv[3], *json = argv[4];
    JSRuntime *rt = JS_NewRuntime();
    JSContext *ctx = JS_NewContext(rt);
    const char *bootstrap = "globalThis.__k = op => { if(op==='self') return 'bench';"
                            " if(op==='seed') return 1; throw Error(op); };";
    evaluate(ctx, bootstrap, strlen(bootstrap), "fixture kernel");
    load(ctx, argv[1]);
    load(ctx, argv[2]);
    evaluate(ctx, "__init()", strlen("__init()"), "init");
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue fn = JS_GetPropertyStr(ctx, global, "__dispatch");
    nw_init();
    nw_event event = {.kind=NW_MESSAGE, .type=type, .json=json, .json_len=(int)strlen(json), .from="harness"};
    nw_event readback = {.kind=NW_MESSAGE, .type="state", .json="null", .json_len=4, .from="harness", .ask=1};
    for (int i = 0; i <= 24; i++) {
        for (int j = 0; j < 2; j++) {
            uint64_t elapsed;
            int value;
            int quick = (i+j) % 2;
            if (quick) {
                JSValue result = quick_dispatch(ctx, fn, type, json, 0, &elapsed);
                JS_FreeValue(ctx, result);
                uint64_t ignored;
                result = quick_dispatch(ctx, fn, "state", "null", 1, &ignored);
                if (JS_ToInt32(ctx, &value, result)) abort();
                JS_FreeValue(ctx, result);
            } else {
                uint64_t start = monotonic_ns();
                int status = nw_on_event(&event);
                elapsed = monotonic_ns() - start;
                received = 0;
                if (status != NW_DONE || nw_on_event(&readback) != NW_DONE || received != 1) abort();
                value = checksum;
            }
            printf("%d,%s,%llu,%d\n", i, quick ? "quickjs" : "cji-aot",
                   (unsigned long long)elapsed, value);
        }
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return 0;
}

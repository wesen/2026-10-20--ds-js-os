/* Linux host harness for the repository's vendored QuickJS. */
#include <malloc.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"

/* Track QuickJS-accounted live bytes after each successful allocation
 * callback. Use the same Linux malloc accounting as QuickJS itself. */
enum { MALLOC_OVERHEAD = 8, LANE_COUNT = 4 };
typedef struct { size_t live, peak; } Heap;

static size_t usable(const void *ptr)
{
    return malloc_usable_size((void *)ptr);
}

static void observe(JSMallocState *state)
{
    Heap *heap = state->opaque;
    heap->live = state->malloc_size;
    if (heap->live > heap->peak) heap->peak = heap->live;
}

static void *track_malloc(JSMallocState *state, size_t size)
{
    if (state->malloc_size + size > state->malloc_limit) return NULL;
    void *ptr = malloc(size);
    if (ptr) {
        state->malloc_count++;
        state->malloc_size += usable(ptr) + MALLOC_OVERHEAD;
        observe(state);
    }
    return ptr;
}

static void track_free(JSMallocState *state, void *ptr)
{
    if (!ptr) return;
    state->malloc_count--;
    state->malloc_size -= usable(ptr) + MALLOC_OVERHEAD;
    free(ptr);
    observe(state);
}

static void *track_realloc(JSMallocState *state, void *ptr, size_t size)
{
    if (!size) {
        track_free(state, ptr);
        return NULL;
    }
    if (!ptr) return track_malloc(state, size);
    const size_t old_size = usable(ptr);
    if (state->malloc_size + size - old_size > state->malloc_limit) return NULL;
    void *resized = realloc(ptr, size);
    if (resized) {
        state->malloc_size = state->malloc_size - old_size + usable(resized);
        observe(state);
    }
    return resized;
}

static const JSMallocFunctions tracking = {track_malloc, track_free, track_realloc, usable};

typedef struct { char *text; size_t size; } Text;

typedef struct {
    const char *name;
    JSRuntime *runtime;
    JSContext *ctx;
    JSValue action;
    Heap heap;
    double load_ms;
} Lane;

static void die(const char *reason)
{
    fprintf(stderr, "%s\n", reason);
    exit(1);
}

static Text read_file(const char *path)
{
    FILE *file = fopen(path, "rb");
    if (!file) { perror(path); exit(1); }
    if (fseek(file, 0, SEEK_END)) die("cannot seek source");
    long length = ftell(file);
    if (length < 0 || fseek(file, 0, SEEK_SET)) die("cannot size source");
    char *text = malloc((size_t)length + 1);
    if (!text || fread(text, 1, (size_t)length, file) != (size_t)length) die("cannot read source");
    text[length] = '\0';
    fclose(file);
    return (Text){text, (size_t)length};
}

static double now(void)
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts)) die("cannot read clock");
    return (double)ts.tv_sec * 1000 + (double)ts.tv_nsec * 0.000001;
}

static void check(JSContext *ctx, JSValue value, const char *stage)
{
    if (JS_IsException(value)) {
        JSValue exc = JS_GetException(ctx);
        const char *message = JS_ToCString(ctx, exc);
        fprintf(stderr, "%s: %s\n", stage, message ? message : "(exception)");
        exit(1);
    }
}

static void load(JSContext *ctx, Text script, const char *path)
{
    JSValue result = JS_Eval(ctx, script.text, script.size, path, JS_EVAL_TYPE_GLOBAL);
    check(ctx, result, path);
    JS_FreeValue(ctx, result);
}

static JSValue get_function(JSContext *ctx, const char *name)
{
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue result = JS_GetPropertyStr(ctx, global, name);
    JS_FreeValue(ctx, global);
    if (!JS_IsFunction(ctx, result)) die("missing driver function");
    return result;
}

static void setup(Lane *lane, const char *dir, Text driver, Text source, Text imports,
                  const char *phase, bool measure_heap)
{
    lane->runtime = measure_heap ? JS_NewRuntime2(&tracking, &lane->heap) : JS_NewRuntime();
    if (!lane->runtime) die("cannot allocate QuickJS runtime");
    JS_SetMaxStackSize(lane->runtime, 4 * 1024 * 1024);
    lane->ctx = JS_NewContext(lane->runtime);
    if (!lane->ctx) die("cannot allocate QuickJS context");
    JSContext *ctx = lane->ctx;
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "__source", JS_NewStringLen(ctx, source.text, source.size));
    JS_SetPropertyStr(ctx, global, "__imports", JS_NewStringLen(ctx, imports.text, imports.size));
    JS_FreeValue(ctx, global);

    char path[4096];
    const char *suffix = (!strcmp(phase, "lower") || !strcmp(phase, "verify")) ? "-replay" : "";
    snprintf(path, sizeof(path), "%s/%s%s.js", dir, lane->name, suffix);
    Text code = read_file(path);
    double start = now();
    load(ctx, code, path);
    lane->load_ms = now() - start;
    free(code.text);
    load(ctx, driver, "driver.js");

    const char *action = "runCompile";
    if (!strcmp(phase, "lower")) {
        JSValue prepare = get_function(ctx, "prepareLower");
        JSValue result = JS_Call(ctx, prepare, JS_UNDEFINED, 0, NULL);
        check(ctx, result, "prepare");
        JS_FreeValue(ctx, result);
        JS_FreeValue(ctx, prepare);
        action = "runLower";
    } else if (!strcmp(phase, "front")) action = "runFront";
    else if (!strcmp(phase, "verify") || !strcmp(phase, "verify-full")) action = "verify";
    else if (!strcmp(phase, "inspect")) action = "inspectFunction";
    lane->action = get_function(ctx, action);
}

static void close_lane(Lane *lane)
{
    JS_FreeValue(lane->ctx, lane->action);
    JS_FreeContext(lane->ctx);
    JS_FreeRuntime(lane->runtime);
}

static double timed_call(Lane *lane)
{
    double start = now();
    JSValue result = JS_Call(lane->ctx, lane->action, JS_UNDEFINED, 0, NULL);
    double elapsed = now() - start;
    check(lane->ctx, result, lane->name);
    JS_FreeValue(lane->ctx, result);
    return elapsed;
}

int main(int argc, char **argv)
{
    if (argc != 8) die("usage: qjs-runner VARIANTS DRIVER SOURCE IMPORTS PHASE ROUNDS ROTATION");
    const char *phase = argv[5];
    int rounds = atoi(argv[6]), rotation = atoi(argv[7]);
    if (rounds < 1 || rotation < 0) die("invalid iteration schedule");
    const bool memory = !strcmp(phase, "memory");
    const bool exact = !strcmp(phase, "verify") || !strcmp(phase, "verify-full") || !strcmp(phase, "inspect");
    const bool partial = !strcmp(phase, "lower") || !strcmp(phase, "front");
    const int count = (partial || !strcmp(phase, "inspect")) ? 3 : LANE_COUNT;
    Lane lanes[LANE_COUNT] = {{.name = "bytes"}, {.name = "unframed"},
                              {.name = "packed"}, {.name = "stream"}};
    Text driver = read_file(argv[2]), source = read_file(argv[3]), imports = read_file(argv[4]);
    for (int order = 0; order < count; order++) {
        Lane *lane = &lanes[(order + rotation) % count];
        setup(lane, argv[1], driver, source, imports, phase, memory);
        if (!memory && !exact) continue;
        if (memory) JS_RunGC(lane->runtime);
        size_t initial = lane->heap.live;
        lane->heap.peak = initial;
        JSValue result = JS_Call(lane->ctx, lane->action, JS_UNDEFINED, 0, NULL);
        check(lane->ctx, result, lane->name);
        if (memory) {
            printf("%s\t%zu\t%zu\t%zu\n", lane->name, initial, lane->heap.peak, lane->heap.live);
        } else {
            const char *serialized = JS_ToCString(lane->ctx, result);
            if (!serialized) die("cannot serialize verification output");
            printf("%s\t%s\n", lane->name, serialized);
            JS_FreeCString(lane->ctx, serialized);
        }
        JS_FreeValue(lane->ctx, result);
        close_lane(lane);
    }
    if (!memory && !exact) {
        for (int order = 0; order < count; order++) {
            Lane *lane = &lanes[(order + rotation) % count];
            printf("first\t%s\t%.6f\t%.6f\n", lane->name, lane->load_ms, timed_call(lane));
        }
        for (int warmup = 0; warmup < 2; warmup++)
            for (int order = 0; order < count; order++)
                timed_call(&lanes[(order + rotation + warmup + 1) % count]);
        for (int round = 0; round < rounds; round++) {
            for (int order = 0; order < count; order++) {
                Lane *lane = &lanes[(order + rotation + round) % count];
                printf("repeat\t%s\t%d\t%.6f\n", lane->name, round, timed_call(lane));
            }
        }
        for (int i = 0; i < count; i++) close_lane(&lanes[i]);
    }
    free(driver.text);
    free(source.text);
    free(imports.text);
    return 0;
}

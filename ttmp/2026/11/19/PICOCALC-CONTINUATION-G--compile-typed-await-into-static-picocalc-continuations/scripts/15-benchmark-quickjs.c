// Isolate continuation discovery or compile a complete typed world to RV32.
// Links the same vendored QuickJS sources used by the PicoCalc compiler.
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

typedef struct {
    size_t live, peak;
    size_t limit;
} Allocation;

static void accounted(Allocation *allocation, size_t old, size_t current) {
    allocation->live = allocation->live - old + current;
    if (allocation->peak < allocation->live) allocation->peak = allocation->live;
}

static void *tracked_malloc(JSMallocState *state, size_t size) {
    Allocation *allocation = state->opaque;
    if (allocation->live > allocation->limit || size > allocation->limit - allocation->live) return NULL;
    void *ptr = malloc(size);
    if (ptr) accounted(allocation, 0, malloc_usable_size(ptr));
    return ptr;
}

static void tracked_free(JSMallocState *state, void *ptr) {
    if (!ptr) return;
    accounted(state->opaque, malloc_usable_size(ptr), 0);
    free(ptr);
}

static void *tracked_realloc(JSMallocState *state, void *ptr, size_t size) {
    if (!ptr) return tracked_malloc(state, size);
    if (!size) {
        tracked_free(state, ptr);
        return NULL;
    }
    Allocation *allocation = state->opaque;
    size_t previous = malloc_usable_size(ptr);
    size_t retained = allocation->live - previous;
    if (retained > allocation->limit || size > allocation->limit - retained) return NULL;
    void *result = realloc(ptr, size);
    if (result) accounted(allocation, previous, malloc_usable_size(result));
    return result;
}

static size_t tracked_usable(const void *ptr) {
    return malloc_usable_size((void *)ptr);
}

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1000000.0;
}

static char *read_file(const char *path, size_t *length) {
    FILE *file = fopen(path, "rb");
    if (!file) {
        perror(path);
        exit(1);
    }
    if (fseek(file, 0, SEEK_END)) exit(1);
    long size = ftell(file);
    if (size < 0 || fseek(file, 0, SEEK_SET)) exit(1);
    char *text = malloc((size_t)size + 1);
    if (!text || fread(text, 1, (size_t)size, file) != (size_t)size) exit(1);
    text[size] = 0;
    fclose(file);
    *length = (size_t)size;
    return text;
}

static JSValue eval(JSContext *context, const char *text, size_t length, const char *name) {
    JSValue value = JS_Eval(context, text, length, name, JS_EVAL_TYPE_GLOBAL);
    if (!JS_IsException(value)) return value;
    JSValue error = JS_GetException(context);
    const char *reason = JS_ToCString(context, error);
    fprintf(stderr, "%s: %s\n", name, reason ? reason : "<out of memory>");
    exit(1);
}

int main(int argc, char **argv) {
    if ((argc != 4 && argc != 5) || (strcmp(argv[3], "rewrite") && strcmp(argv[3], "rv32"))) {
        fprintf(stderr, "usage: %s COMPILER_DIR ASSEMBLED_SOURCE rewrite|rv32 [LIMIT_MIB]\n", argv[0]);
        return 2;
    }
    const size_t limit_mib = argc == 5 ? (size_t)strtoul(argv[4], NULL, 10) : 4;
    Allocation allocation = {.limit = limit_mib * 1024 * 1024};
    const JSMallocFunctions mallocs = {tracked_malloc, tracked_free, tracked_realloc, tracked_usable};
    JSRuntime *runtime = JS_NewRuntime2(&mallocs, &allocation);
    if (!runtime) return 1;
    JS_SetMaxStackSize(runtime, 2 * 1024 * 1024);
    JSContext *context = JS_NewContext(runtime);
    if (!context) return 1;
    size_t length;
    char *source = read_file(argv[2], &length);
    JSValue global = JS_GetGlobalObject(context);
    if (JS_SetPropertyStr(context, global, "fixtureSource", JS_NewStringLen(context, source, length)) < 0) return 1;
    free(source);
    JS_FreeValue(context, global);

    const char *files[] = {"typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"};
    const double started = now_ms();
    for (size_t i = 0; i < sizeof files / sizeof *files; ++i) {
        char path[1024];
        const int printed = snprintf(path, sizeof path, "%s/%s", argv[1], files[i]);
        if (printed < 0 || (size_t)printed >= sizeof path) return 1;
        char *compiler = read_file(path, &length);
        JS_FreeValue(context, eval(context, compiler, length, path));
        free(compiler);
    }
    const double loaded = now_ms();
    const size_t load_peak = allocation.peak;
    const char *driver = !strcmp(argv[3], "rewrite")
        ? "JSON.stringify({bytes: typedAsync.rewrite(fixtureSource, typedWorld.imports)?.source.length ?? 0})"
        : "const p = typedRv32.compile(fixtureSource, typedWorld.imports, 96 * 1024);"
          "JSON.stringify({bytes: p.image.length, fields: Object.keys(p.records.WorldState).length})";
    JSValue result = eval(context, driver, strlen(driver), argv[3]);
    const double completed = now_ms();
    const char *data = JS_ToCString(context, result);
    if (!data) return 1;
    printf("{\"mode\":\"%s\",\"load_ms\":%.3f,\"phase_ms\":%.3f,"
           "\"load_peak_bytes\":%zu,\"peak_bytes\":%zu,\"result\":%s}\n",
           argv[3], loaded - started, completed - loaded, load_peak, allocation.peak, data);
    JS_FreeCString(context, data);
    JS_FreeValue(context, result);
    JS_FreeContext(context);
    JS_FreeRuntime(runtime);
    return 0;
}

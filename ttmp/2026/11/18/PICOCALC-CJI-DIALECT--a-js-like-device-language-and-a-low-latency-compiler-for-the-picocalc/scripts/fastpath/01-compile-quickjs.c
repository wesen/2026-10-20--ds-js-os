/* Use the QuickJS API corresponding to qjsc, retaining source locations.
 * The harness measures phases on trusted repository sources and their own output.
 */
#include <inttypes.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

typedef struct {
    size_t peak;
} Allocation;

static void update_peak(JSMallocState *state)
{
    Allocation *allocation = state->opaque;
    if (state->malloc_size > allocation->peak)
        allocation->peak = state->malloc_size;
}

static size_t usable_size(const void *p)
{
    return malloc_usable_size((void *)p);
}

static void *tracked_malloc(JSMallocState *state, size_t size)
{
    void *p = malloc(size);
    if (p) {
        state->malloc_size += usable_size(p) + 8;
        state->malloc_count++;
        update_peak(state);
    }
    return p;
}

static void tracked_free(JSMallocState *state, void *p)
{
    if (!p)
        return;
    state->malloc_size -= usable_size(p) + 8;
    state->malloc_count--;
    free(p);
}

static void *tracked_realloc(JSMallocState *state, void *p, size_t size)
{
    if (!p)
        return size ? tracked_malloc(state, size) : NULL;
    if (!size) {
        tracked_free(state, p);
        return NULL;
    }
    size_t old_size = usable_size(p) + 8;
    void *next = realloc(p, size);
    if (next) {
        state->malloc_size = state->malloc_size - old_size + usable_size(next) + 8;
        update_peak(state);
    }
    return next;
}

static const JSMallocFunctions allocator = {
    tracked_malloc, tracked_free, tracked_realloc, usable_size,
};

static uint64_t now_ns(void)
{
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t)) {
        perror("clock_gettime");
        exit(EXIT_FAILURE);
    }
    return (uint64_t)t.tv_sec * UINT64_C(1000000000) + t.tv_nsec;
}

static void fail_js(JSContext *ctx, const char *stage, const char *name)
{
    JSValue exception = JS_GetException(ctx);
    const char *error = JS_ToCString(ctx, exception);
    fprintf(stderr, "%s %s: %s\n", stage, name, error ? error : "unknown QuickJS error");
    JS_FreeCString(ctx, error);
    JS_FreeValue(ctx, exception);
    exit(EXIT_FAILURE);
}

static JSContext *new_context(Allocation *allocation, JSRuntime **runtime, size_t *base)
{
    *runtime = JS_NewRuntime2(&allocator, allocation);
    if (!*runtime) {
        fprintf(stderr, "could not allocate QuickJS runtime\n");
        exit(EXIT_FAILURE);
    }
    JSContext *ctx = JS_NewContext(*runtime);
    if (!ctx) {
        fprintf(stderr, "could not allocate QuickJS context\n");
        exit(EXIT_FAILURE);
    }
    JSMemoryUsage usage;
    JS_ComputeMemoryUsage(*runtime, &usage);
    *base = usage.malloc_size;
    allocation->peak = *base;
    return ctx;
}

static char *read_source(const char *path, size_t *size)
{
    FILE *file = fopen(path, "rb");
    if (!file || fseek(file, 0, SEEK_END)) {
        perror(path);
        exit(EXIT_FAILURE);
    }
    long n = ftell(file);
    if (n < 0 || fseek(file, 0, SEEK_SET)) {
        perror(path);
        exit(EXIT_FAILURE);
    }
    char *source = malloc((size_t)n + 1);
    if (!source || fread(source, 1, n, file) != (size_t)n || fclose(file)) {
        perror(path);
        exit(EXIT_FAILURE);
    }
    *size = n;
    source[n] = '\0';
    return source;
}

static uint8_t *measure(const char *source, size_t size, const char *name, size_t *byte_count, int strip_flags)
{
    Allocation compiler = {0};
    JSRuntime *compile_rt;
    size_t compile_base;
    JSContext *compile_ctx = new_context(&compiler, &compile_rt, &compile_base);

    JS_SetStripInfo(compile_rt, strip_flags);
    uint64_t begin = now_ns();
    JSValue function = JS_Eval(compile_ctx, source, size, name,
                               JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    uint64_t compiled = now_ns();
    if (JS_IsException(function))
        fail_js(compile_ctx, "compile", name);

    size_t compile_peak = compiler.peak;
    uint8_t *serialized = JS_WriteObject(compile_ctx, byte_count, function, JS_WRITE_OBJ_BYTECODE);
    uint64_t written = now_ns();
    if (!serialized)
        fail_js(compile_ctx, "serialize", name);

    uint8_t *bytes = malloc(*byte_count);
    if (!bytes) {
        perror("malloc");
        exit(EXIT_FAILURE);
    }
    memcpy(bytes, serialized, *byte_count);
    size_t write_peak = compiler.peak;
    js_free(compile_ctx, serialized);
    JS_FreeValue(compile_ctx, function);
    JS_FreeContext(compile_ctx);
    JS_FreeRuntime(compile_rt);

    Allocation reader = {0};
    JSRuntime *read_rt;
    size_t read_base;
    JSContext *read_ctx = new_context(&reader, &read_rt, &read_base);
    uint64_t read_start = now_ns();
    JSValue loaded = JS_ReadObject(read_ctx, bytes, *byte_count, JS_READ_OBJ_BYTECODE);
    uint64_t read_end = now_ns();
    if (JS_IsException(loaded))
        fail_js(read_ctx, "deserialize", name);
    if (JS_VALUE_GET_TAG(loaded) != JS_TAG_FUNCTION_BYTECODE) {
        fprintf(stderr, "%s did not deserialize as a global script\n", name);
        exit(EXIT_FAILURE);
    }

    if (!strip_flags)
        printf("%" PRIu64 " %" PRIu64 " %" PRIu64 " %zu %zu %zu %zu %zu\n",
           compiled - begin, written - compiled, read_end - read_start,
           compile_base, compile_peak, write_peak, read_base, reader.peak);
    JS_FreeValue(read_ctx, loaded);
    JS_FreeContext(read_ctx);
    JS_FreeRuntime(read_rt);
    return bytes;
}

int main(int argc, char **argv)
{
    if (argc != 5) {
        fprintf(stderr, "usage: %s source-file script-name output-bytecode repetitions\n", argv[0]);
        return EXIT_FAILURE;
    }
    size_t source_size, byte_count;
    char *source = read_source(argv[1], &source_size);
    int repetitions = atoi(argv[4]);
    if (repetitions < 2)
        return EXIT_FAILURE;

    uint8_t *expected = measure(source, source_size, argv[2], &byte_count, 0);
    for (int i = 1; i < repetitions; i++) {
        size_t observed_count;
        uint8_t *observed = measure(source, source_size, argv[2], &observed_count, 0);
        if (observed_count != byte_count || memcmp(expected, observed, byte_count)) {
            fprintf(stderr, "%s serialized differently in a fresh runtime\n", argv[2]);
            return EXIT_FAILURE;
        }
        free(observed);
    }

    size_t strip_source_count, strip_debug_count;
    free(measure(source, source_size, argv[2], &strip_source_count, JS_STRIP_SOURCE));
    free(measure(source, source_size, argv[2], &strip_debug_count, JS_STRIP_DEBUG));
    printf("%zu %zu\n", strip_source_count, strip_debug_count);

    FILE *output = fopen(argv[3], "wb");
    if (!output || fwrite(expected, 1, byte_count, output) != byte_count || fclose(output)) {
        perror(argv[3]);
        return EXIT_FAILURE;
    }
    free(expected);
    free(source);
    return EXIT_SUCCESS;
}

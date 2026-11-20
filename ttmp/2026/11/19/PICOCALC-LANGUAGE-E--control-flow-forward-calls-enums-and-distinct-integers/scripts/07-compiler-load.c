// Measure JS_Eval independently of file reads, runtime creation, or a user compile.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

enum { FILES = 4 };
static const char *order[FILES] = {"typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"};

typedef struct {
    char *text;
    size_t length;
} compiler_file;

static double now(clockid_t id)
{
    struct timespec t;
    if (clock_gettime(id, &t)) exit(1);
    return t.tv_sec * 1e3 + t.tv_nsec / 1e6;
}

static compiler_file read_file(const char *directory, const char *name, int optional)
{
    char path[1024];
    if (snprintf(path, sizeof(path), "%s/%s", directory, name) >= (int)sizeof(path)) exit(1);
    FILE *file = fopen(path, "rb");
    if (!file && optional) return (compiler_file){0};
    if (!file) { perror(path); exit(1); }
    if (fseek(file, 0, SEEK_END)) exit(1);
    long size = ftell(file);
    if (size < 0 || fseek(file, 0, SEEK_SET)) exit(1);
    char *text = malloc((size_t)size + 1);
    if (!text || fread(text, 1, size, file) != (size_t)size) exit(1);
    text[size] = '\0';
    fclose(file);
    return (compiler_file){text, (size_t)size};
}

static void run(const char *directory, const char *variant, int native)
{
    compiler_file compiler[FILES] = {0};
    for (int i = 0; i < FILES; i++) {
        if (i == 2 && !native) continue;
        compiler[i] = read_file(directory, order[i], i == 1);
    }
    for (int run = 0; run <= 21; run++) {
        double startup = now(CLOCK_MONOTONIC);
        JSRuntime *runtime = JS_NewRuntime();
        if (!runtime) exit(1);
        JS_SetMaxStackSize(runtime, 4 * 1024 * 1024);
        JSContext *context = JS_NewContext(runtime);
        if (!context) exit(1);
        startup = now(CLOCK_MONOTONIC) - startup;
        double cpu = now(CLOCK_PROCESS_CPUTIME_ID);
        double wall = now(CLOCK_MONOTONIC);
        double phases[FILES] = {0};
        for (int i = 0; i < FILES; i++) {
            if (!compiler[i].text) continue;
            double start = now(CLOCK_MONOTONIC);
            JSValue value = JS_Eval(context, compiler[i].text, compiler[i].length, order[i], JS_EVAL_TYPE_GLOBAL);
            phases[i] = now(CLOCK_MONOTONIC) - start;
            if (JS_IsException(value)) {
                JSValue exception = JS_GetException(context);
                fprintf(stderr, "%s: %s\n", order[i], JS_ToCString(context, exception));
                exit(1);
            }
            JS_FreeValue(context, value);
        }
        wall = now(CLOCK_MONOTONIC) - wall;
        cpu = now(CLOCK_PROCESS_CPUTIME_ID) - cpu;
        if (run) {
            printf("%s,%s,%d,%.5f,%.5f,%.5f", variant, native ? "rv32" : "wasm", run,
                   startup, wall, cpu);
            for (int i = 0; i < FILES; i++) printf(",%.5f", phases[i]);
            putchar('\n');
        }
        JS_FreeContext(context);
        JS_FreeRuntime(runtime);
    }
    for (int i = 0; i < FILES; i++) free(compiler[i].text);
}

int main(int argc, char **argv)
{
    if (argc < 3 || (argc - 1) % 2) {
        fprintf(stderr, "usage: %s label compiler-path [label compiler-path ...]\n", argv[0]);
        return 2;
    }
    puts("variant,target,run,context_wall_ms,eval_wall_ms,eval_cpu_ms,wasm_js_ms,async_js_ms,rv32_js_ms,world_js_ms");
    for (int i = 1; i < argc; i += 2) {
        run(argv[i + 1], argv[i], 1);
        run(argv[i + 1], argv[i], 0);
    }
    return 0;
}

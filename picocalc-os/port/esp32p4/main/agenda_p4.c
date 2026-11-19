#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "p4.h"
#include "quickjs.h"

#define SOURCE_LIMIT (64 * 1024)
#define COMPILER_LIMIT (2 * 1024 * 1024)
#define COMPILER_US 1700000
#define FIRST_FRAME_TARGET_US 2000000

#if PICOCALC_RV32_AGENDA
#define AGENDA_ENGINE ENG_NATIVE
#define AGENDA_COMPILE "compileAgendaRv32"
#else
#define AGENDA_ENGINE ENG_WASM
#define AGENDA_COMPILE "compileAgenda"
#endif

typedef struct {
  size_t live, peak;
  vtime_t deadline;
} compile_heap;

static unsigned char *startup_module;
static size_t startup_length;
static vtime_t first_response;
static vtime_t boot_frame_deadline;

// Buffer the timing data because UART writes would compete with the startup turns.
typedef struct {
  const char *name;
  vtime_t first_us, total_us, js_us[4];
  unsigned attempts;
  int engine;
} world_startup;

static world_startup startup[MAX_WORLDS];
static bool recording_boot;
static bool boot_report_pending;

static void account(compile_heap *heap, size_t old, size_t current) {
  heap->live = heap->live - old + current;
  if (heap->live > heap->peak) heap->peak = heap->live;
}

static void *compile_malloc(JSMallocState *state, size_t size) {
  compile_heap *heap = state->opaque;
  if (heap->live >= COMPILER_LIMIT || size > COMPILER_LIMIT - heap->live) return NULL;
  void *ptr = port_heap_malloc(size);
  if (ptr) account(heap, 0, port_heap_usable(ptr));
  return ptr;
}

static void compile_free(JSMallocState *state, void *ptr) {
  if (!ptr) return;
  account(state->opaque, port_heap_usable(ptr), 0);
  port_heap_free(ptr);
}

static void *compile_realloc(JSMallocState *state, void *ptr, size_t size) {
  if (!ptr) return compile_malloc(state, size);
  if (!size) { compile_free(state, ptr); return NULL; }
  compile_heap *heap = state->opaque;
  size_t old = port_heap_usable(ptr);
  size_t retained = heap->live - old;
  if (retained >= COMPILER_LIMIT || size > COMPILER_LIMIT - retained) return NULL;
  void *next = port_heap_realloc(ptr, size);
  if (next) account(heap, old, port_heap_usable(next));
  return next;
}

static const JSMallocFunctions compiler_allocator = {
  compile_malloc, compile_free, compile_realloc, port_heap_usable,
};

static int compile_interrupt(JSRuntime *rt, void *opaque) {
  compile_heap *heap = opaque;
  return port_clock() >= heap->deadline;
}

static bool eval_file(JSContext *ctx, const char *path) {
  size_t length;
  char *text = p4_bundle_read(path, &length, NULL, 0);
  if (!text) return false;
  JSValue value = JS_Eval(ctx, text, length, path, JS_EVAL_TYPE_GLOBAL);
  free(text);
  bool ok = !JS_IsException(value);
  JS_FreeValue(ctx, value);
  return ok;
}

static char *read_source(bool edit, size_t *length) {
  if (!edit) return p4_bundle_read("agenda/reminder.typed", length, NULL, 0);
  const char *root = port_fs_root();
  if (!root) return NULL;
  char path[128];
  int n = snprintf(path, sizeof path, "%s/notes/agenda.typed", root);
  if (n < 0 || n >= sizeof path) return NULL;
  FILE *file = fopen(path, "rb");
  if (!file) return NULL;
  char *text = malloc(SOURCE_LIMIT + 1);
  if (text) {
    *length = fread(text, 1, SOURCE_LIMIT + 1, file);
    if (ferror(file) || *length > SOURCE_LIMIT || memchr(text, 0, *length) ||
        !utf8_valid((const unsigned char *)text, *length)) {
      free(text);
      text = NULL;
    }
  }
  fclose(file);
  return text;
}

static unsigned char *compile(bool edit, size_t *length, vtime_t *started) {
  *started = port_clock();
  size_t source_length = 0, reactor_length = 0;
  char *source = read_source(edit, &source_length);
  char *reactor = p4_bundle_read("agenda/reactor.bin", &reactor_length, NULL, 0);
  if (!source || !reactor) {
    puts("agenda compile: source or reactor unavailable");
    free(source); free(reactor);
    return NULL;
  }
  compile_heap heap = {.deadline = *started + COMPILER_US};
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);
  JSContext *ctx = NULL;
  unsigned char *module = NULL;
  if (!rt) goto done;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetInterruptHandler(rt, compile_interrupt, &heap);
  ctx = JS_NewContext(rt);
  if (!ctx) goto done;
  if (!eval_file(ctx, "agenda/typed-wasm.js") || !eval_file(ctx, "agenda/compile.js")) goto rejected;
#if PICOCALC_RV32_AGENDA
  if (!eval_file(ctx, "agenda/typed-rv32.js")) goto rejected;
#endif
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue function = JS_GetPropertyStr(ctx, global, AGENDA_COMPILE);
  JSValue reactor_buffer = JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_length);
  // This QuickJS C entry reads three argument slots for a buffer view.
  JSValue view_args[] = {reactor_buffer, JS_NewUint32(ctx, 0), JS_NewUint32(ctx, reactor_length)};
  JSValue reactor_view = JS_IsException(reactor_buffer) ? JS_EXCEPTION
      : JS_NewTypedArray(ctx, 3, view_args, JS_TYPED_ARRAY_UINT8);
  JS_FreeValue(ctx, reactor_buffer);
  JSValue args[] = {JS_NewStringLen(ctx, source, source_length), reactor_view};
  JSValue result = JS_EXCEPTION;
  if (!JS_IsException(args[0]) && !JS_IsException(args[1])) result = JS_Call(ctx, function, JS_UNDEFINED, 2, args);
  JS_FreeValue(ctx, args[1]); JS_FreeValue(ctx, args[0]);
  JS_FreeValue(ctx, function); JS_FreeValue(ctx, global);
  if (JS_IsException(result)) goto rejected;
  size_t offset = 0, size = 0, unit = 0, available = 0;
  JSValue buffer = JS_GetTypedArrayBuffer(ctx, result, &offset, &size, &unit);
  uint8_t *bytes = JS_IsException(buffer) ? NULL : JS_GetArrayBuffer(ctx, &available, buffer);
  if (bytes && unit == 1 && offset <= available && size <= available - offset && size <= UINT32_MAX - 1) {
    module = malloc(size + 1);
    if (module) {
      memcpy(module, bytes + offset, size);
      module[size] = 0;
      *length = size;
    }
  }
  JS_FreeValue(ctx, buffer);
  JS_FreeValue(ctx, result);
  goto done;

rejected:
  {
    JSValue exception = JS_GetException(ctx);
    const char *message = JS_ToCString(ctx, exception);
    printf("agenda compile rejected: %s\n", message ? message : "unknown compiler error");
    if (JS_IsError(ctx, exception)) {
      JSValue stack = JS_GetPropertyStr(ctx, exception, "stack");
      const char *trace = JS_IsString(stack) ? JS_ToCString(ctx, stack) : NULL;
      if (trace) printf("%s\n", trace);
      JS_FreeCString(ctx, trace);
      JS_FreeValue(ctx, stack);
    }
    JS_FreeCString(ctx, message);
    JS_FreeValue(ctx, exception);
  }
done:
  if (ctx) JS_FreeContext(ctx);
  if (rt) JS_FreeRuntime(rt);
  free(source); free(reactor);
  printf("agenda compile source=%s status=%s us=%lld peak_js_bytes=%zu module_bytes=%zu\n",
         edit ? "edit" : "bundle", module ? "ok" : "failed",
         (long long)(port_clock() - *started), heap.peak, module ? *length : 0);
  return module;
}

bool p4_agenda_prepare(void) {
  startup_module = compile(false, &startup_length, &first_response);
  if (startup_module) {
    boot_frame_deadline = first_response + FIRST_FRAME_TARGET_US;
    recording_boot = true;
    printf("agenda boot source_start_us=%lld\n", (long long)first_response);
  }
  return startup_module != NULL;
}

bool p4_agenda_boot_frame_pending(void) {
  return boot_frame_deadline && port_clock() < boot_frame_deadline;
}

char *p4_agenda_take_module(size_t *length) {
  char *module = (char *)startup_module;
  startup_module = NULL;
  if (length) *length = startup_length;
  return module;
}

void p4_agenda_console(const char *command) {
  bool edit = !strcmp(command, "build");
  if (!edit && strcmp(command, "baseline")) {
    puts("agenda baseline | agenda build (reads notes/agenda.typed)");
    return;
  }
  world_t *world = world_by_name("agenda");
  if (!world || world->engine != AGENDA_ENGINE) {
    puts("agenda: the typed world is not active");
    return;
  }
  size_t length = 0;
  vtime_t started;
  unsigned char *module = compile(edit, &length, &started);
  if (!module) return;
  // The candidate is fully compiled before touching the running world.
  free(world->source);
  world->source = (char *)module;
  world->source_len = length;
  first_response = started;
  kernel_restart_world(world);
}

void p4_agenda_stage(const world_t *world, const char *stage) {
  if (!first_response) return;
  if (world && (strcmp(world->name, "agenda") || world->engine != AGENDA_ENGINE)) return;
  printf("agenda stage %s us=%lld\n", stage, (long long)(port_clock() - first_response));
}

void p4_agenda_world_boot(const world_t *world, vtime_t start, vtime_t cost) {
  if (!recording_boot) return;
  world_startup *sample = &startup[world->id];
  if (!sample->attempts++) {
    sample->name = world->name;
    sample->engine = world->engine;
    sample->first_us = start - (boot_frame_deadline - FIRST_FRAME_TARGET_US);
  }
  sample->total_us += cost;
}

void p4_agenda_js_boot(const world_t *world, const vtime_t *stages) {
  if (!recording_boot) return;
  world_startup *sample = &startup[world->id];
  for (int i = 0; i < 4; i++) sample->js_us[i] += stages[i + 1] - stages[i];
}

void p4_agenda_report_boot(void) {
  if (!boot_report_pending) return;
  boot_report_pending = false;
  for (int i = 0; i < MAX_WORLDS; i++) {
    const world_startup *sample = &startup[i];
    if (!sample->attempts) continue;
    printf("agenda boot-world name=%s engine=%d first_us=%lld total_us=%lld attempts=%u"
           " js_setup_us=%lld js_prelude_us=%lld js_source_us=%lld js_init_us=%lld\n",
           sample->name, sample->engine, (long long)sample->first_us,
           (long long)sample->total_us, sample->attempts,
           (long long)sample->js_us[0], (long long)sample->js_us[1],
           (long long)sample->js_us[2], (long long)sample->js_us[3]);
  }
}

void p4_agenda_frame(world_t *world, vtime_t segment_start) {
  if (strcmp(world->name, "agenda") || world->engine != AGENDA_ENGINE) return;
  vtime_t now = port_clock();
  if (first_response) {
    printf("agenda response us=%lld world_bytes=%zu\n",
           (long long)(now - first_response), world->mem_used);
    first_response = 0;
  }
  boot_frame_deadline = 0;
  printf("agenda frame turn_us=%lld world_bytes=%zu\n",
         (long long)(now - segment_start), world->mem_used);
  if (recording_boot) {
    recording_boot = false;
    boot_report_pending = true;
  }
}

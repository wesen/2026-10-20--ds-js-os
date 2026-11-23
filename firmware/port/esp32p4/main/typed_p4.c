#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "p4.h"
#include "typed_lex_index.h"
#include "quickjs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

#define COMPILER_LIMIT (2 * 1024 * 1024)
#define COMPILER_US 1700000

typedef struct {
  size_t live, peak, limit;
  vtime_t deadline;
} compile_heap;

static void account(compile_heap *heap, size_t old, size_t current) {
  heap->live = heap->live - old + current;
  if (heap->live > heap->peak) heap->peak = heap->live;
}

static void *compile_malloc(JSMallocState *state, size_t size) {
  compile_heap *heap = state->opaque;
  if (heap->live >= heap->limit || size > heap->limit - heap->live) return NULL;
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
  if (retained >= heap->limit || size > heap->limit - retained) return NULL;
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

// Every compile runs in a fresh runtime that evaluates the compiler's own sources, 0.41 s to
// 0.53 s on the P4 (PICOCALC-COMPILE-BUDGET Step 3). The first runtime to evaluate a source
// keeps its QuickJS bytecode here, outside every compiler heap; later runtimes read the bytecode
// instead of parsing. Bytecode does not depend on the runtime that wrote it, so the evaluated
// functions, and the modules they compile, are the same either way. Entries are written once,
// under the lock, and never freed.
typedef struct {
  char path[48];
  uint8_t *bytes;
  size_t length;
} compiled_source;
// One entry per compiler source a firmware evaluates. The playable firmware evaluates eleven
// (typed/tape.js, wasm.js, async.js, rv32.js, rv32-inline.js, rv32-loops.js, world.js and four
// app linkers); a source that finds no free entry is parsed on every compile.
static compiled_source compiled_sources[16];
static SemaphoreHandle_t compiled_lock;
static portMUX_TYPE compiled_lock_init = portMUX_INITIALIZER_UNLOCKED;

static compiled_source *compiled_find(const char *path, bool claim) {
  taskENTER_CRITICAL(&compiled_lock_init);
  if (!compiled_lock) compiled_lock = xSemaphoreCreateMutex();
  taskEXIT_CRITICAL(&compiled_lock_init);
  compiled_source *found = NULL;
  xSemaphoreTake(compiled_lock, portMAX_DELAY);
  for (size_t i = 0; i < sizeof(compiled_sources) / sizeof(*compiled_sources) && !found; i++) {
    compiled_source *entry = &compiled_sources[i];
    if (entry->path[0] && !strcmp(entry->path, path)) found = entry;
    else if (!entry->path[0] && claim && strlen(path) < sizeof(entry->path)) {
      strcpy(entry->path, path);
      found = entry;
    }
  }
  xSemaphoreGive(compiled_lock);
  return found;
}

static bool eval_file(JSContext *ctx, const char *path) {
  compiled_source *cached = compiled_find(path, false);
  uint8_t *bytes = cached ? cached->bytes : NULL;
  if (bytes) {
    JSValue function = JS_ReadObject(ctx, bytes, cached->length, JS_READ_OBJ_BYTECODE);
    if (!JS_IsException(function)) {
      JSValue value = JS_EvalFunction(ctx, function);
      bool ok = !JS_IsException(value);
      JS_FreeValue(ctx, value);
      return ok;
    }
    JS_FreeValue(ctx, JS_GetException(ctx));
    printf("typed compiler bytecode: cannot read %s, parsing it\n", path);
  }
  size_t length;
  char *text = p4_bundle_read(path, &length, NULL, 0);
  if (!text) return false;
  JSValue function = JS_Eval(ctx, text, length, path, JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
  free(text);
  if (JS_IsException(function)) return false;
  if (!bytes) {
    size_t size = 0;
    uint8_t *written = JS_WriteObject(ctx, &size, function, JS_WRITE_OBJ_BYTECODE);
    uint8_t *copy = written ? port_heap_malloc(size) : NULL;
    if (copy) {
      memcpy(copy, written, size);
      compiled_source *entry = compiled_find(path, true);
      xSemaphoreTake(compiled_lock, portMAX_DELAY);
      if (entry && !entry->bytes) {
        entry->length = size;
        entry->bytes = copy;
        copy = NULL;
        printf("typed compiler bytecode: %s %u bytes\n", path, (unsigned)size);
      }
      xSemaphoreGive(compiled_lock);
      if (copy) port_heap_free(copy);
    }
    if (written) js_free(ctx, written);
  }
  JSValue value = JS_EvalFunction(ctx, function);
  bool ok = !JS_IsException(value);
  JS_FreeValue(ctx, value);
  return ok;
}

// typedRv32Load(file): the RV32 backend asks for a pass group's bundle ("typed-rv32-loops.js",
// bundled as typed/rv32-loops.js) the first time a compile's policy needs it, so a compile under
// "interactive" never loads one (PICOCALC-TYPED-PIPELINE).
static JSValue rv32_load(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *file = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
  char path[48];
  bool named = file && !strncmp(file, "typed-", 6) &&
               snprintf(path, sizeof(path), "typed/%s", file + 6) < (int)sizeof(path);
  JS_FreeCString(ctx, file);
  if (!named) return JS_ThrowTypeError(ctx, "typedRv32Load: not a typed-rv32 bundle");
  // eval_file leaves an evaluation's exception pending, which the backend's call then raises.
  if (!eval_file(ctx, path) && !JS_HasException(ctx)) return JS_ThrowReferenceError(ctx, "%s is not bundled", path);
  return JS_UNDEFINED;
}

static bool install_rv32_load(JSContext *ctx) {
  JSValue global = JS_GetGlobalObject(ctx);
  bool ok = JS_SetPropertyStr(ctx, global, "typedRv32Load", JS_NewCFunction(ctx, rv32_load, "typedRv32Load", 1)) >= 0;
  JS_FreeValue(ctx, global);
  return ok;
}

char *p4_typed_compile(const char *app, const char *source_kind, const char *source,
                       size_t source_length, const char *linker, const char *entry, int engine,
                       const char *reactor, size_t reactor_length, size_t *length, vtime_t started,
                       const p4_compile_limits *limits) {
  compile_heap heap = {
    .limit = limits && limits->heap_bytes ? limits->heap_bytes : COMPILER_LIMIT,
    .deadline = started + (limits && limits->duration_us ? limits->duration_us : COMPILER_US),
  };
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);
  JSContext *ctx = NULL;
  char *module = NULL;
  if (!rt) goto done;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetInterruptHandler(rt, compile_interrupt, &heap);
  ctx = JS_NewContext(rt);
  if (!ctx) goto done;
  if (!typed_lex_index_install(ctx) || !install_rv32_load(ctx)) goto rejected;
  if (!eval_file(ctx, "typed/tape.js") || !eval_file(ctx, "typed/wasm.js") ||
      (!strcmp(linker, "typed/world.js") && !eval_file(ctx, "typed/async.js")) ||
      (engine == ENG_NATIVE && !eval_file(ctx, limits && limits->rv32_backend ? limits->rv32_backend : "typed/rv32.js")) ||
      !eval_file(ctx, linker)) goto rejected;
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue function = JS_GetPropertyStr(ctx, global, entry);
  JSValue reactor_buffer = JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_length);
  // This QuickJS C entry reads three argument slots for a buffer view.
  JSValue view_args[] = {reactor_buffer, JS_NewUint32(ctx, 0), JS_NewUint32(ctx, reactor_length)};
  JSValue reactor_view = JS_IsException(reactor_buffer) ? JS_EXCEPTION
      : JS_NewTypedArray(ctx, 3, view_args, JS_TYPED_ARRAY_UINT8);
  JS_FreeValue(ctx, reactor_buffer);
  JSValue args[] = {JS_NewStringLen(ctx, source, source_length), reactor_view, JS_UNDEFINED};
  int argc = 2;
  JSValue result = JS_EXCEPTION;
  bool ready = !JS_IsException(args[0]) && !JS_IsException(args[1]);
  if (ready && engine == ENG_NATIVE) {
#ifdef PICOCALC_RV32_BUFFER_FUNCTIONS
    args[2] = JS_NewObject(ctx);
    ready = !JS_IsException(args[2]) && JS_SetPropertyStr(ctx, args[2], "streamFunctions", JS_FALSE) >= 0;
    argc = 3;
    if (ready) printf("%s native compiler functions=buffered\n", app);
#else
    printf("%s native compiler functions=streamed\n", app);
#endif
    // A named policy selects how much the compiler optimizes this world: interactive worlds
    // trade generated-code speed for a boot compile inside their deadline (COMPILE-BUDGET).
    if (ready && limits && limits->policy) {
      if (argc < 3) {
        args[2] = JS_NewObject(ctx);
        ready = !JS_IsException(args[2]);
        argc = 3;
      }
      ready = ready && JS_SetPropertyStr(ctx, args[2], "policy", JS_NewString(ctx, limits->policy)) >= 0;
      if (ready) printf("%s native compiler policy=%s\n", app, limits->policy);
    }
  }
  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);
  JS_FreeValue(ctx, args[2]);
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
    printf("%s compile rejected: %s\n", app, message ? message : "unknown compiler error");
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
  printf("%s compile source=%s status=%s us=%lld peak_js_bytes=%zu module_bytes=%zu\n",
         app, source_kind, module ? "ok" : "failed",
         (long long)(port_clock() - started), heap.peak, module ? *length : 0);
  return module;
}

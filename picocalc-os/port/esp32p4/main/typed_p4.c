#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "p4.h"
#include "typed_lex_index.h"
#include "quickjs.h"

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
  if (!typed_lex_index_install(ctx)) goto rejected;
  if (!eval_file(ctx, "typed/wasm.js") ||
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

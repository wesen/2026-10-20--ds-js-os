/* Only the endpoint image uses these routines. 05-p4.c.inc supplies the loader. */
#include "esp_log.h"

static JSValue rebuild_endpoint_prepare(JSContext *ctx, bool incremental) {
  static const char *const stock[] = {"rebuild/stock-wasm.js", "rebuild/stock-rv32.js", "rebuild/stock-files.js"};
  static const char *const candidate[] = {"rebuild/wasm.js", "rebuild/rv32.js", "rebuild/files.js"};
  const char *const *compiler = incremental ? candidate : stock;
  for (size_t i = 0; i < 3; ++i) {
    if (!eval_file(ctx, compiler[i])) return JS_EXCEPTION;
  }
  if ((incremental && !eval_file(ctx, "rebuild/incremental.js")) ||
      !eval_file(ctx, "rebuild/cases.js") || !eval_file(ctx, "rebuild/endpoint.js")) return JS_EXCEPTION;

  size_t source_size = 0, reactor_size = 0;
  char *source = p4_bundle_read("files/files.typed", &source_size, NULL, 0);
  char *reactor = p4_bundle_read("files/reactor.bin", &reactor_size, NULL, 0);
  JSValue runner = JS_EXCEPTION;
  if (source && reactor) {
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue prepare = JS_GetPropertyStr(ctx, global, "rebuildEndpoint");
    JSValue base = JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_size);
    JSValue view_args[] = {base, JS_NewUint32(ctx, 0), JS_NewUint32(ctx, reactor_size)};
    JSValue view = JS_IsException(base) ? JS_EXCEPTION : JS_NewTypedArray(ctx, 3, view_args, JS_TYPED_ARRAY_UINT8);
    JSValue args[] = {JS_NewStringLen(ctx, source, source_size), view, JS_NewBool(ctx, incremental)};
    if (!JS_IsException(args[0]) && !JS_IsException(view)) runner = JS_Call(ctx, prepare, JS_UNDEFINED, 3, args);
    for (size_t i = 0; i < 3; ++i) JS_FreeValue(ctx, args[i]);
    JS_FreeValue(ctx, base);
    JS_FreeValue(ctx, prepare);
    JS_FreeValue(ctx, global);
  }
  free(reactor);
  free(source);
  return runner;
}

static bool rebuild_endpoint(unsigned block, unsigned position, bool incremental) {
  compile_heap heap = {.limit = COMPILER_LIMIT, .deadline = port_clock() + 6000000};
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);
  if (!rt) return false;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetInterruptHandler(rt, compile_interrupt, &heap);
  JSContext *ctx = JS_NewContext(rt);
  bool ok = false;
  if (!ctx) goto done;

  JSValue runner = rebuild_endpoint_prepare(ctx, incremental);
  if (JS_IsException(runner)) {
    rebuild_exception(ctx);
    goto done;
  }
  JSValue compile = JS_GetPropertyStr(ctx, runner, "compile");
  JSValue changed = JS_GetPropertyStr(ctx, runner, "changed");
  size_t live_before = heap.live;
  heap.peak = live_before;
  heap.deadline = port_clock() + 3000000;

  // The same clock spans the source handoff, JS compile, ELF load and return.
  const vtime_t start = port_clock();
  JSValue result = JS_Call(ctx, compile, JS_UNDEFINED, 1, &changed);
  size_t offset = 0, size = 0, unit = 0, capacity = 0;
  JSValue buffer = JS_IsException(result) ? JS_UNDEFINED : JS_GetTypedArrayBuffer(ctx, result, &offset, &size, &unit);
  const uint8_t *bytes = JS_IsException(buffer) || JS_IsUndefined(buffer) ? NULL :
      JS_GetArrayBuffer(ctx, &capacity, buffer);
  rebuild_guest_sample guest;
  if (bytes && unit == 1 && size && offset <= capacity && size <= capacity - offset &&
      rebuild_run_guest(bytes + offset, size, &guest)) {
    // The callee's return timestamp was recorded before any output or hashing.
    ok = rebuild_expected_guest(&guest);
    printf("ENDPOINTROW %u %u %s %lld %lld %lld %zu %zu %zu %zu %d %u %u %u ",
           block, position, incremental ? "rebuild" : "clean", (long long)(guest.end - start),
           (long long)guest.load_us, (long long)guest.run_us, live_before, heap.live, heap.peak,
           size, guest.result, guest.units[0], guest.units[1], guest.units[2]);
    rebuild_hash(bytes + offset, size);
    puts("");
  } else if (JS_IsException(result) || JS_IsException(buffer)) {
    rebuild_exception(ctx);
  }
  JS_FreeValue(ctx, buffer);
  JS_FreeValue(ctx, result);
  JS_FreeValue(ctx, changed);
  JS_FreeValue(ctx, compile);
  JS_FreeValue(ctx, runner);
done:
  if (ctx) JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return ok;
}

char *p4_editor_compile(size_t *length) {
  static bool ran;
  if (!ran) {
    ran = true;
    rebuild_elf_resolver_setup();
    esp_log_level_set("ELF", ESP_LOG_NONE);
    puts("ENDPOINTSTART");
    bool ok = true;
    for (unsigned block = 0; block < 6 && ok; ++block) {
      for (unsigned position = 0; position < 2 && ok; ++position) {
        ok = rebuild_endpoint(block, position, (block + position) % 2);
      }
    }
    puts(ok ? "ENDPOINTDONE" : "ENDPOINTFAIL");
  }
  return rebuild_editor_compile(length);
}

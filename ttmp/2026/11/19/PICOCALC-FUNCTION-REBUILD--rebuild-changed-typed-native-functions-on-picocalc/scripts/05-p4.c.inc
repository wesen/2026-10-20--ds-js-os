/* Appended to the isolated typed_p4.c to share its allocator and bundle I/O. */
#include <inttypes.h>
#include "esp_elf.h"
#include "mbedtls/sha256.h"

char *rebuild_editor_compile(size_t *length);

typedef struct { uint32_t length; uint16_t units[96]; } rebuild_string;

static JSValue rebuild_clock(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  return JS_NewInt64(ctx, port_clock());
}

static JSValue rebuild_heap(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  compile_heap *heap = JS_GetContextOpaque(ctx);
  if (JS_ToBool(ctx, argv[0])) {
    heap->peak = heap->live;
    return JS_UNDEFINED;
  }
  JSValue result = JS_NewObject(ctx);
  if (!JS_IsException(result)) {
    JS_SetPropertyStr(ctx, result, "live", JS_NewUint32(ctx, heap->live));
    JS_SetPropertyStr(ctx, result, "peak", JS_NewUint32(ctx, heap->peak));
  }
  return result;
}

static void rebuild_hash(const uint8_t *bytes, size_t size) {
  uint8_t digest[32];
  mbedtls_sha256(bytes, size, digest, 0);
  for (size_t i = 0; i < sizeof digest; ++i) printf("%02x", digest[i]);
}

static bool rebuild_guest(const uint8_t *bytes, size_t size, const char *id) {
  static const uint32_t magic[] = {0x4147454e, 0x44415256, 0x3332534c};
  size_t entry_offset = 0;
  for (size_t at = 0; at + 36 <= size; at += 4) {
    if (memcmp(bytes + at, magic, sizeof magic)) continue;
    uint32_t entries, capacity;
    memcpy(&capacity, bytes + at + 12, 4);
    memcpy(&entries, bytes + at + 16, 4);
    if (entry_offset || entries != 4 || capacity > size - at || capacity < 36) return false;
    entry_offset = at + 20;  // Files has no runtime imports; filesName is entry stub 0.
    at += capacity - 4;
  }
  if (!entry_offset || ((uintptr_t)bytes & 3)) return false;

  // Use the firmware's ELF loader and executable PSRAM configuration. The
  // reactor's entry setup lives elsewhere; this pure Files call needs no world.
  const vtime_t load_at = port_clock();
  esp_elf_t elf;
  esp_elf_init(&elf);
  int rc = esp_elf_relocate(&elf, bytes, size);
  if (rc) {
    printf("REBUILDERROR guest ELF load %d\n", rc);
    esp_elf_deinit(&elf);
    return false;
  }
  const elf32_hdr_t *header = (const void *)bytes;
  const elf32_phdr_t *segments = (const void *)(bytes + header->phoff);
  uintptr_t mapped = 0;
  for (uint16_t i = 0; i < header->phnum; ++i) {
    const elf32_phdr_t *segment = segments + i;
    if (segment->type == PT_LOAD && (segment->flags & 1) && entry_offset >= segment->offset &&
        entry_offset - segment->offset < segment->filesz) {
      mapped = esp_elf_map_sym(&elf, segment->vaddr + entry_offset - segment->offset);
      break;
    }
  }
  const vtime_t load_us = port_clock() - load_at;
  if (!mapped) {
    esp_elf_deinit(&elf);
    return false;
  }
  int (*entry)(const rebuild_string *, rebuild_string *) = (void *)mapped;
  rebuild_string input = {.length = 3, .units = {'_', 'A', 'b'}};
  rebuild_string output = {.length = 96};
  const vtime_t start = port_clock();
  const int result = entry(&input, &output);
  const vtime_t run_us = port_clock() - start;
  esp_elf_deinit(&elf);
  printf("REBUILDGUEST %s %lld %lld %d %u %u %u\n", id, (long long)load_us,
         (long long)run_us, result, output.units[0], output.units[1], output.units[2]);
  return !strcmp(id, "seed") ? result == -1 :
      result == 3 && output.units[0] == '_' && output.units[1] == 'A' && output.units[2] == 'b';
}

static void rebuild_exception(JSContext *ctx) {
  JSValue error = JS_GetException(ctx);
  const char *message = JS_ToCString(ctx, error);
  printf("REBUILDERROR %s\n", message ? message : "no exception");
  JS_FreeCString(ctx, message);
  JS_FreeValue(ctx, error);
}

static bool rebuild_row(JSContext *ctx, JSValueConst row, unsigned block, const char *kind, bool marked) {
  if (JS_IsException(row)) {
    rebuild_exception(ctx);
    return false;
  }
  JSValue report = JS_GetPropertyStr(ctx, row, "report");
  JSValue array = JS_GetPropertyStr(ctx, row, "bytes");
  JSValue which = JS_GetPropertyStr(ctx, row, "guest");
  const char *json = JS_ToCString(ctx, report);
  const char *id = JS_ToCString(ctx, which);
  size_t size = 0, offset = 0, unit = 0, capacity = 0;
  JSValue buffer = JS_UNDEFINED;
  const uint8_t *bytes = NULL;
  bool ok = json && id;
  if (ok && !JS_IsUndefined(array)) {
    buffer = JS_GetTypedArrayBuffer(ctx, array, &offset, &size, &unit);
    bytes = JS_IsException(buffer) ? NULL : JS_GetArrayBuffer(ctx, &capacity, buffer);
    ok = bytes && unit == 1 && size && offset <= capacity && size <= capacity - offset;
  }
  if (ok) {
    printf("REBUILDROW %u %s %u ", block, kind, marked);
    if (bytes) rebuild_hash(bytes + offset, size); else putchar('-');
    printf(" %zu %s\n", size, json);
    if (*id) ok = bytes && rebuild_guest(bytes + offset, size, id);
  }
  JS_FreeCString(ctx, id);
  JS_FreeCString(ctx, json);
  JS_FreeValue(ctx, buffer);
  JS_FreeValue(ctx, which);
  JS_FreeValue(ctx, array);
  JS_FreeValue(ctx, report);
  return ok;
}

static bool rebuild_series(unsigned block, const char *kind, bool marked) {
  const vtime_t started = port_clock();
  compile_heap heap = {.limit = COMPILER_LIMIT, .deadline = started + 6000000};
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);
  if (!rt) return false;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetInterruptHandler(rt, compile_interrupt, &heap);
  JSContext *ctx = JS_NewContext(rt);
  bool ok = ctx != NULL;
  if (!ok) goto done;
  JS_SetContextOpaque(ctx, &heap);
  static const char *const scripts[] = {
    "rebuild/wasm.js", "rebuild/rv32.js", "rebuild/files.js", "rebuild/incremental.js", "rebuild/cases.js",
  };
  for (size_t i = 0; i < sizeof scripts / sizeof *scripts; ++i) {
    if (!eval_file(ctx, scripts[i])) {
      rebuild_exception(ctx);
      ok = false;
      goto done;
    }
  }
  JSValue global = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, global, "labClock", JS_NewCFunction(ctx, rebuild_clock, "labClock", 0));
  JS_SetPropertyStr(ctx, global, "labHeap", JS_NewCFunction(ctx, rebuild_heap, "labHeap", 1));
  JSValue prepare = JS_GetPropertyStr(ctx, global, "rebuildDevicePrepare");
  size_t source_size = 0, reactor_size = 0;
  char *source = p4_bundle_read("files/files.typed", &source_size, NULL, 0);
  char *reactor = p4_bundle_read("files/reactor.bin", &reactor_size, NULL, 0);
  JSValue runner = JS_EXCEPTION;
  if (source && reactor) {
    JSValue base = JS_NewArrayBufferCopy(ctx, (const uint8_t *)reactor, reactor_size);
    JSValue view_args[] = {base, JS_NewUint32(ctx, 0), JS_NewUint32(ctx, reactor_size)};
    JSValue view = JS_IsException(base) ? JS_EXCEPTION : JS_NewTypedArray(ctx, 3, view_args, JS_TYPED_ARRAY_UINT8);
    JSValue args[] = {JS_NewString(ctx, kind), JS_NewStringLen(ctx, source, source_size), view,
                     JS_NewBool(ctx, marked)};
    if (!JS_IsException(args[1]) && !JS_IsException(view))
      runner = JS_Call(ctx, prepare, JS_UNDEFINED, 4, args);
    for (size_t i = 0; i < 4; ++i) JS_FreeValue(ctx, args[i]);
    JS_FreeValue(ctx, base);
  }
  free(reactor);
  free(source);
  JS_FreeValue(ctx, prepare);
  JS_FreeValue(ctx, global);
  if (JS_IsException(runner)) {
    if (source_size && reactor_size) rebuild_exception(ctx);
    ok = false;
    goto done;
  }
  JSValue count_val = JS_GetPropertyStr(ctx, runner, "count");
  JSValue step = JS_GetPropertyStr(ctx, runner, "step");
  uint32_t count;
  ok = !JS_ToUint32(ctx, &count, count_val) && count > 0 && count <= 32;
  JS_FreeValue(ctx, count_val);
  printf("REBUILDSETUP %u %s %u %lld %zu %zu\n", block, kind, marked,
         (long long)(port_clock() - started), heap.live, heap.peak);
  for (uint32_t i = 0; ok && i < count; ++i) {
    heap.deadline = port_clock() + 3000000;
    JSValue args[] = {JS_NewUint32(ctx, i), JS_NewBool(ctx, (block + i) % 2)};
    JSValue row = JS_Call(ctx, step, runner, 2, args);
    ok = rebuild_row(ctx, row, block, kind, marked);
    JS_FreeValue(ctx, row);
  }
  JS_FreeValue(ctx, step);
  JS_FreeValue(ctx, runner);
done:
  if (ctx) JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return ok;
}

static bool rebuild_cold(unsigned block) {
  puts("REBUILDCOLDSTART");
  size_t length = 0;
  char *bytes = p4_files_compile(&length);
  if (!bytes) return false;
  printf("REBUILDCOLD %u %zu ", block, length);
  rebuild_hash((const uint8_t *)bytes, length);
  puts("");
  free(bytes);
  return true;
}

char *p4_editor_compile(size_t *length) {
  static bool ran;
  if (!ran) {
    ran = true;
    puts("REBUILDSTART");
    bool ok = true;
    for (unsigned block = 0; block < 4 && ok; ++block) {
      if (!(block % 2)) ok = rebuild_cold(block);
      for (unsigned i = 0; i < 2 && ok; ++i) {
        const bool marked = (block + i) % 2;
        ok = rebuild_series(block, "files", marked) && rebuild_series(block, "fixture", marked);
      }
      if (ok && block % 2) ok = rebuild_cold(block);
    }
    puts(ok ? "REBUILDDONE" : "REBUILDFAIL");
  }
  return rebuild_editor_compile(length);
}

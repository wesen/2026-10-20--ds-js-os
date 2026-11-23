// The Typed compiler on the handheld, and the one path every Typed app (typed_apps.h, generated from
// apps/typed/NAME/app.json) is compiled through: p4_typed_app_compile with the limits, policy, linker and entry of
// its manifest. A boot world's module is served to the kernel as NAME/compiled.bin (p4_typed_world_read). Every
// compile first asks the compiled-module cache (typed_cache_p4.c) and gives it the module it compiles.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "p4.h"
#include "typed_apps.h"
#include "typed_cache.h"
#include "typed_lex_index.h"
#include "quickjs.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

typedef struct {
  size_t live, peak, limit;
  vtime_t deadline;
  unsigned over_limit, no_psram;   // refused allocations: past the heap cap, or PSRAM had no block
} compile_heap;

// QuickJS starts its cycle collector from the size the allocator reports in malloc_size (js_trigger_gc: at 1.5 times
// the size the last collection left). Its own allocator keeps that count; a custom one must, as the worlds' does
// (nucleus/vm.c). This one did not until PICOCALC-COMPILE-CACHE, so no compile ever collected a cycle: the gallery's
// Typed program grew past 17.8 MB and ran PSRAM empty.
static void account(JSMallocState *state, size_t old, size_t current) {
  compile_heap *heap = state->opaque;
  heap->live = heap->live - old + current;
  if (heap->live > heap->peak) heap->peak = heap->live;
  state->malloc_size = heap->live;
  state->malloc_count += (current != 0) - (old != 0);
}

// A compile must not take the PSRAM the running worlds need: the gallery's Typed program, compiled beside them,
// once left PSRAM empty and the keyboard, compositor, snake and settings worlds failed for want of memory
// (PICOCALC-COMPILE-CACHE diary step 6). Past RESERVE_FROM bytes of live heap (no boot compile gets there), an
// allocation that would leave less than RESERVE free is refused, and the compile fails instead.
enum { RESERVE = 3 << 20, RESERVE_FROM = 8 << 20 };
static bool psram_spare(compile_heap *heap, size_t size) {
  if (heap->live < RESERVE_FROM || heap_caps_get_free_size(MALLOC_CAP_SPIRAM) >= size + RESERVE) return true;
  heap->no_psram++;
  return false;
}

static void *compile_malloc(JSMallocState *state, size_t size) {
  compile_heap *heap = state->opaque;
  if (heap->live >= heap->limit || size > heap->limit - heap->live) { heap->over_limit++; return NULL; }
  if (!psram_spare(heap, size)) return NULL;
  void *ptr = port_heap_malloc(size);
  if (ptr) account(state, 0, port_heap_usable(ptr));
  else heap->no_psram++;
  return ptr;
}

static void compile_free(JSMallocState *state, void *ptr) {
  if (!ptr) return;
  account(state, port_heap_usable(ptr), 0);
  port_heap_free(ptr);
}

static void *compile_realloc(JSMallocState *state, void *ptr, size_t size) {
  if (!ptr) return compile_malloc(state, size);
  if (!size) { compile_free(state, ptr); return NULL; }
  compile_heap *heap = state->opaque;
  size_t old = port_heap_usable(ptr);
  size_t retained = heap->live - old;
  if (retained >= heap->limit || size > heap->limit - retained) { heap->over_limit++; return NULL; }
  if (size > old && !psram_spare(heap, size)) return NULL;
  void *next = port_heap_realloc(ptr, size);
  if (next) account(state, old, port_heap_usable(next));
  else heap->no_psram++;
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
                       size_t source_length, const char *linker, const char *entry,
                       const char *const *compiler, const char *reactor, size_t reactor_length,
                       size_t *length, vtime_t started, const p4_compile_limits *limits) {
  compile_heap heap = {.limit = limits->heap_bytes, .deadline = started + limits->duration_us};
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);
  JSContext *ctx = NULL;
  char *module = NULL;
  if (!rt) goto done;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetInterruptHandler(rt, compile_interrupt, &heap);
  ctx = JS_NewContext(rt);
  if (!ctx) goto done;
  if (!typed_lex_index_install(ctx) || !install_rv32_load(ctx)) goto rejected;
  // The tape definition, the front end, the compiler modules the app names (typed/async.js), the RV32 back end, then the linker.
  if (!eval_file(ctx, "typed/tape.js") || !eval_file(ctx, "typed/wasm.js")) goto rejected;
  for (const char *const *m = compiler; m && *m; m++)
    if (!eval_file(ctx, *m)) goto rejected;
  if (!eval_file(ctx, limits->rv32_backend ? limits->rv32_backend : "typed/rv32.js") ||
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
  if (ready) {
    printf("%s native compiler functions=streamed\n", app);
    // A named policy selects how much the compiler optimizes this world: interactive worlds
    // trade generated-code speed for a boot compile inside their deadline (COMPILE-BUDGET).
    if (limits->policy) {
      args[2] = JS_NewObject(ctx);
      ready = !JS_IsException(args[2]) &&
              JS_SetPropertyStr(ctx, args[2], "policy", JS_NewString(ctx, limits->policy)) >= 0;
      argc = 3;
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
  const vtime_t elapsed = port_clock() - started;
  uint8_t sha[32] = {0};
  if (module) tc_sha256(module, *length, sha);
  printf("%s compile source=%s status=%s us=%lld peak_js_bytes=%zu module_bytes=%zu sha=%02x%02x%02x%02x%02x%02x%02x%02x\n",
         app, source_kind, module ? "ok" : "failed", (long long)elapsed, heap.peak, module ? *length : 0,
         sha[0], sha[1], sha[2], sha[3], sha[4], sha[5], sha[6], sha[7]);
  if (!module)   // why: the heap cap, PSRAM, or neither (a compile error, the deadline)
    printf("%s compile refused_over_limit=%u refused_no_psram=%u heap_limit=%zu psram_free=%zu psram_largest=%zu\n", app,
           heap.over_limit, heap.no_psram, heap.limit, heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
           heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM));
  return module;
}

const p4_typed_app *p4_typed_app_find(const char *name) {
  for (size_t i = 0; i < p4_typed_app_count; i++)
    if (!strcmp(p4_typed_apps[i].name, name)) return &p4_typed_apps[i];
  return NULL;
}

p4_compile_limits p4_typed_app_limits(const p4_typed_app *app) {
  return (p4_compile_limits){.heap_bytes = app->heap_bytes, .duration_us = app->deadline_us, .policy = app->policy};
}

// The app's editable source replaced by its file under the store (Agenda: notes/agenda.typed for reminder.typed),
// between the sources before and after it.
static char *read_edited(const p4_typed_app *app, size_t *length) {
  const char *root = port_fs_root();
  char path[160];
  if (!app->edit_file || !root || snprintf(path, sizeof path, "%s/%s", root, app->edit_file) >= (int)sizeof path)
    return NULL;
  FILE *file = fopen(path, "rb");
  if (!file) return NULL;
  size_t head_length = 0, tail_length = 0;
  char *head = p4_bundle_read(app->edit_head, &head_length, NULL, 0);
  char *tail = head ? p4_bundle_read(app->edit_tail, &tail_length, NULL, 0) : NULL;
  char *text = tail ? malloc(head_length + app->edit_limit + 1 + tail_length + 1) : NULL;
  if (text) memcpy(text, head, head_length);
  size_t read = text ? fread(text + head_length, 1, app->edit_limit + 1, file) : 0;
  bool ok = text && !ferror(file) && read <= app->edit_limit && !memchr(text + head_length, 0, read) &&
            utf8_valid((const unsigned char *)text + head_length, read);
  fclose(file);
  size_t n = head_length + read;
  if (ok) {
    text[n++] = '\n';
    memcpy(text + n, tail, tail_length);
    n += tail_length;
    text[n] = 0;
    *length = n;
  } else {
    free(text);
    text = NULL;
  }
  free(head);
  free(tail);
  return text;
}

// Real compiles (not cache hits) running now, and when the last one ended: a background compile waits for quiet.
// Per core: the cache's writer (core 1) waits only for compiles that share its core.
static volatile int compiles_running[2];
static volatile vtime_t compiles_ended[2] = {-1, -1};
bool p4_typed_compiles_quiet(int core, int64_t quiet_us) {
  for (int c = 0; c < 2; c++)
    if ((core < 0 || c == core) &&
        (compiles_running[c] || (compiles_ended[c] >= 0 && port_clock() - compiles_ended[c] < quiet_us)))
      return false;
  return true;
}

bool p4_typed_app_cached(const p4_typed_app *app, int variant) {
  if (!app || variant < 0 || (app->n_variants ? variant >= app->n_variants : variant != 0)) return false;
  const p4_compile_limits limits = p4_typed_app_limits(app);
  uint8_t key[32];
  return p4_typed_cache_key(app, app->n_variants ? app->variants[variant].source : app->source, NULL, 0, &limits, key) &&
         p4_typed_cache_has(key);
}

// The cache's key covers every input of the compile (typed_cache_p4.c); the deadline and heap limits apply only to a
// real compile, whose clock starts after the lookup. The label kind (or the variant's source) groups entries for eviction.
static char *compile_app(const p4_typed_app *app, int variant, const char *text, size_t text_length, const char *kind,
                         size_t *length, bool cached) {
  const vtime_t asked = port_clock();
  if (variant < 0 || (app->n_variants ? variant >= app->n_variants : variant != 0)) return NULL;
  const char *bundled = app->n_variants ? app->variants[variant].source : app->source;
  const p4_compile_limits limits = p4_typed_app_limits(app);
  uint8_t key[32];
  const bool keyed = cached && p4_typed_cache_key(app, bundled, text, text_length, &limits, key);
  char *module = keyed ? p4_typed_cache_read(app->name, key, length, port_clock() - asked) : NULL;
  if (module) return module;
  const int core = xPortGetCoreID();
  __atomic_add_fetch(&compiles_running[core], 1, __ATOMIC_SEQ_CST);
  const vtime_t started = port_clock();
  size_t source_length = text_length, reactor_length = 0;
  char *source = text ? NULL : p4_bundle_read(bundled, &source_length, NULL, 0);
  char *reactor = p4_bundle_read(app->reactor, &reactor_length, NULL, 0);
  if ((text || source) && reactor) {
    module = p4_typed_compile(app->name, kind ? kind : bundled, text ? text : source, source_length, app->link,
                              app->entry, app->compiler, reactor, reactor_length, length, started, &limits);
  } else {
    printf("%s compile: source or reactor unavailable\n", app->name);
  }
  free(reactor);
  free(source);
  compiles_ended[core] = port_clock();
  __atomic_sub_fetch(&compiles_running[core], 1, __ATOMIC_SEQ_CST);
  if (module && keyed) p4_typed_cache_store(app->name, kind ? kind : bundled, key, module, *length, port_clock() - started);
  return module;
}

char *p4_typed_app_compile(const p4_typed_app *app, int variant, const char *text, size_t text_length,
                           const char *kind, size_t *length) {
  return compile_app(app, variant, text, text_length, kind, length, true);
}

// typed cache verify [APP]: every bundled source that has an entry is compiled again, without the cache, and the two
// modules compared. Without APP the gallery's program is left out (an 85 s compile with a 20 MB heap).
static void cache_verify(const char *only) {
  unsigned checked = 0, same = 0;
  for (size_t i = 0; i < p4_typed_app_count; i++) {
    const p4_typed_app *app = &p4_typed_apps[i];
    if (only[0] ? strcmp(app->name, only) : !strcmp(app->name, "candela-gallery")) continue;
    for (int v = 0; v < (app->n_variants ? app->n_variants : 1); v++) {
      const char *bundled = app->n_variants ? app->variants[v].source : app->source;
      const p4_compile_limits limits = p4_typed_app_limits(app);
      uint8_t key[32], a[32] = {0}, b[32] = {0};
      size_t cached_length = 0, fresh_length = 0;
      if (!p4_typed_cache_key(app, bundled, NULL, 0, &limits, key)) continue;
      char *cached = p4_typed_cache_read(app->name, key, &cached_length, 0);
      if (!cached) continue;
      char *fresh = compile_app(app, v, NULL, 0, "verify", &fresh_length, false);
      tc_sha256(cached, cached_length, a);
      if (fresh) tc_sha256(fresh, fresh_length, b);
      const bool equal = fresh && fresh_length == cached_length && !memcmp(fresh, cached, cached_length);
      printf("TCVERIFY {\"app\":\"%s\",\"source\":\"%s\",\"same\":%s,\"cachedBytes\":%zu,\"freshBytes\":%zu,"
             "\"cachedSha\":\"%02x%02x%02x%02x%02x%02x%02x%02x\",\"freshSha\":\"%02x%02x%02x%02x%02x%02x%02x%02x\"}\n",
             app->name, bundled, equal ? "true" : "false", cached_length, fresh_length, a[0], a[1], a[2], a[3], a[4], a[5],
             a[6], a[7], b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);
      checked++;
      same += equal;
      free(cached);
      free(fresh);
    }
  }
  printf("TCVERIFY {\"checked\":%u,\"same\":%u}\n", checked, same);
}

// The kernel reads a boot world's file while it boots (kernel.c add_world): NAME/compiled.bin is the app compiled
// now. NULL when the compile fails or misses its deadline; the manifest's fallback then runs the JavaScript world.
char *p4_typed_world_read(const char *path, size_t *length, bool *served) {
  *served = false;
  const char *slash = strchr(path, '/');
  if (!slash || strcmp(slash, "/compiled.bin")) return NULL;
  for (size_t i = 0; i < p4_typed_app_count; i++) {
    const p4_typed_app *app = &p4_typed_apps[i];
    if (!app->world || strlen(app->name) != (size_t)(slash - path) || strncmp(app->name, path, slash - path)) continue;
    *served = true;
    return p4_typed_app_compile(app, 0, NULL, 0, "bundle", length);
  }
  return NULL;
}

// typed: the apps and their limits; typed NAME baseline|build: compile a running world again, from the bundle or
// with its editable file, and restart it on the new module (the candidate is compiled before the world is touched).
void p4_typed_console(const char *args) {
  char name[32] = "", verb[16] = "";
  int n = sscanf(args, "%31s %15s", name, verb);
  if (n <= 0) {
    for (size_t i = 0; i < p4_typed_app_count; i++) {
      const p4_typed_app *a = &p4_typed_apps[i];
      printf("TYPEDAPP {\"name\":\"%s\",\"world\":%d,\"policy\":\"%s\",\"heapBytes\":%u,\"deadlineUs\":%lld,"
             "\"variants\":%d,\"editable\":%d}\n", a->name, a->world, a->policy ? a->policy : "default",
             (unsigned)a->heap_bytes, (long long)a->deadline_us, a->n_variants, a->edit_file != NULL);
    }
    return;
  }
  if (!strcmp(name, "cache")) {
    char only[32] = "";
    if (!strcmp(verb, "verify")) {
      sscanf(args, "%*s %*s %31s", only);
      cache_verify(only);
    } else {
      p4_typed_cache_console(strstr(args, "cache") + 5);
    }
    return;
  }
  const p4_typed_app *app = p4_typed_app_find(name);
  bool edit = !strcmp(verb, "build");
  if (!app || !app->world || (!edit && strcmp(verb, "baseline")) || (edit && !app->edit_file)) {
    puts("typed | typed WORLD baseline | typed WORLD build (an editable world, from its file under the store) | "
         "typed cache [clear | verify [APP] | corrupt APP [flip|cut]]");
    return;
  }
  world_t *world = world_by_name(app->name);
  char file[96];
  snprintf(file, sizeof file, "%s/compiled.bin", app->name);
  if (!world || world->engine != ENG_NATIVE || strcmp(world->file, file)) {
    printf("typed: %s is not running as its compiled world\n", app->name);
    return;
  }
  size_t length = 0;
  char *module = NULL;
  if (edit) {
    size_t text_length = 0;
    char *text = read_edited(app, &text_length);
    if (!text) {
      printf("typed: cannot read %s\n", app->edit_file);
      return;
    }
    module = p4_typed_app_compile(app, 0, text, text_length, "edit", &length);
    free(text);
  } else {
    module = p4_typed_app_compile(app, 0, NULL, 0, "bundle", &length);
  }
  if (!module) return;
  free(world->source);
  world->source = module;
  world->source_len = length;
  kernel_restart_world(world);
}

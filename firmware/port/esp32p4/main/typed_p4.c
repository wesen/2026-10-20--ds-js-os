// The Typed compiler on the handheld, and the one path every Typed app (typed_apps.h, generated from
// apps/typed/NAME/app.json) is compiled through: p4_typed_app_compile with the limits, policy, linker and entry of
// its manifest. A boot world's module is served to the kernel as NAME/compiled.bin (p4_typed_world_read).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "p4.h"
#include "typed_apps.h"
#include "typed_lex_index.h"
#include "quickjs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

typedef struct {
  size_t live, peak, limit;
  vtime_t deadline;
} compile_heap;

// Where one compile's time went, printed after it as one TYPEDCOMPILE line (outside the timed compile): each compiler
// source it evaluated (from the bytecode cache or parsed, with the time to load the bytecode and to run the source's
// top level), the call to the linker's entry (front end, back end and link; a pass group the back end loads is an
// evaluation inside it) and the runtime's teardown (PICOCALC-COMPILER-DEVICE-COST).
typedef struct {
  char path[32];
  bool parsed, in_call;
  vtime_t load_us, run_us;
  size_t live;  // the compiler heap after the evaluation
} compile_eval;

typedef struct {
  compile_heap heap;  // first: the allocator's and the interrupt handler's opaque
  bool in_call;
  int evals;
  compile_eval eval[12];
  vtime_t before_us, setup_us, call_us, free_us;  // before: from `started` (reading the source and reactor)
} compile_state;

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
  compile_state *state = JS_GetContextOpaque(ctx);
  compile_eval *record = state && state->evals < (int)(sizeof(state->eval) / sizeof(*state->eval))
      ? &state->eval[state->evals++] : NULL;
  vtime_t begun = port_clock();
  if (record) {
    snprintf(record->path, sizeof(record->path), "%s", path);
    record->in_call = state->in_call;
  }
  compiled_source *cached = compiled_find(path, false);
  uint8_t *bytes = cached ? cached->bytes : NULL;
  JSValue function = JS_UNDEFINED;
  if (bytes) {
    function = JS_ReadObject(ctx, bytes, cached->length, JS_READ_OBJ_BYTECODE);
    if (JS_IsException(function)) {
      JS_FreeValue(ctx, JS_GetException(ctx));
      printf("typed compiler bytecode: cannot read %s, parsing it\n", path);
    }
  }
  if (!bytes || JS_IsException(function)) {
    size_t length;
    char *text = p4_bundle_read(path, &length, NULL, 0);
    if (!text) return false;
    function = JS_Eval(ctx, text, length, path, JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    free(text);
    if (JS_IsException(function)) return false;
    if (record) record->parsed = true;
  }
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
  vtime_t loaded = port_clock();
  JSValue value = JS_EvalFunction(ctx, function);
  bool ok = !JS_IsException(value);
  JS_FreeValue(ctx, value);
  if (record) {
    record->load_us = loaded - begun;
    record->run_us = port_clock() - loaded;
    record->live = state->heap.live;
  }
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
  compile_state state = {.heap = {.limit = limits->heap_bytes, .deadline = started + limits->duration_us}};
  compile_heap *heap = &state.heap;
  vtime_t phase = port_clock();
  state.before_us = phase - started;
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, heap);
  JSContext *ctx = NULL;
  char *module = NULL;
  if (!rt) goto done;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetInterruptHandler(rt, compile_interrupt, heap);
  ctx = JS_NewContext(rt);
  if (!ctx) goto done;
  JS_SetContextOpaque(ctx, &state);
  if (!typed_lex_index_install(ctx) || !install_rv32_load(ctx)) goto rejected;
  state.setup_us = port_clock() - phase;
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
  if (ready) {
    state.in_call = true;
    phase = port_clock();
    result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);
    state.call_us = port_clock() - phase;
    state.in_call = false;
  }
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
  phase = port_clock();
  if (ctx) JS_FreeContext(ctx);
  if (rt) JS_FreeRuntime(rt);
  state.free_us = port_clock() - phase;
  printf("%s compile source=%s status=%s us=%lld peak_js_bytes=%zu module_bytes=%zu\n",
         app, source_kind, module ? "ok" : "failed",
         (long long)(port_clock() - started), heap->peak, module ? *length : 0);
  printf("TYPEDCOMPILE {\"app\":\"%s\",\"beforeUs\":%lld,\"setupUs\":%lld,\"callUs\":%lld,\"freeUs\":%lld,\"evals\":[",
         app, (long long)state.before_us, (long long)state.setup_us, (long long)state.call_us, (long long)state.free_us);
  for (int i = 0; i < state.evals; i++) {
    const compile_eval *e = &state.eval[i];
    printf("%s{\"path\":\"%s\",\"bytecode\":\"%s\",\"inCall\":%s,\"loadUs\":%lld,\"runUs\":%lld,\"liveBytes\":%zu}",
           i ? "," : "", e->path, e->parsed ? "parsed" : "cached", e->in_call ? "true" : "false",
           (long long)e->load_us, (long long)e->run_us, e->live);
  }
  printf("]}\n");
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

char *p4_typed_app_compile(const p4_typed_app *app, int variant, const char *text, size_t text_length,
                           const char *kind, size_t *length) {
  vtime_t started = port_clock();
  if (variant < 0 || (app->n_variants ? variant >= app->n_variants : variant != 0)) return NULL;
  const char *bundled = app->n_variants ? app->variants[variant].source : app->source;
  size_t source_length = text_length, reactor_length = 0;
  char *source = text ? NULL : p4_bundle_read(bundled, &source_length, NULL, 0);
  char *reactor = p4_bundle_read(app->reactor, &reactor_length, NULL, 0);
  char *module = NULL;
  if ((text || source) && reactor) {
    const p4_compile_limits limits = p4_typed_app_limits(app);
    module = p4_typed_compile(app->name, kind ? kind : bundled, text ? text : source, source_length, app->link,
                              app->entry, app->compiler, reactor, reactor_length, length, started, &limits);
  } else {
    printf("%s compile: source or reactor unavailable\n", app->name);
  }
  free(reactor);
  free(source);
  return module;
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
  const p4_typed_app *app = p4_typed_app_find(name);
  bool edit = !strcmp(verb, "build");
  if (!app || !app->world || (!edit && strcmp(verb, "baseline")) || (edit && !app->edit_file)) {
    puts("typed | typed WORLD baseline | typed WORLD build (an editable world, from its file under the store)");
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

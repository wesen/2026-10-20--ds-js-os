// One MicroQuickJS context per world (the PaperS3 build). The context lives in one fixed arena of the world's
// heap limit, so running out of it is the world running out of memory. The engine has no promises and no
// job queue: the asynchronous host calls return a promise id, and the prelude (js-papers3/prelude.js) keeps
// the callbacks and runs them when the kernel settles that id through __settle. C never holds a JS value
// across a call that could collect (the collector moves objects); structured results go to JS as JSON text.
//
// Entry points the prelude defines:  __init() -> meta, __dispatch(kind, type, json, from, isAsk) -> reply JSON,
//                                    __settle(id, ok, json), __render() -> frame JSON
// Host calls it is given:            __k(op, ...) for things that finish now, __ka(op, ...) -> promise id
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_mqjs.h"

extern const JSSTDLibraryDef js_stdlib;   // mqjs_stdlib.h, generated from third_party/mquickjs/nucleus_stdlib.c

const char *vm_engine_name(void) { return "MicroQuickJS " MQJS_VERSION; }

// ---- the engine's log: errors print their backtrace through it ------------------------------------------
sbuf_t *log_sink;
static void log_write(void *opaque, const void *buf, size_t n) {
  (void)opaque;
  if (log_sink) sb_printf(log_sink, "%.*s", (int)n, (const char *)buf);
}

// The pending exception as "message (file:line)", with the backtrace after a newline (as vm.c gives it).
static void exception_text(JSContext *ctx, char *out, size_t n) {
  JSValue e = JS_GetException(ctx);
  sbuf_t b = { 0 };
  log_sink = &b;
  JS_PrintValueF(ctx, e, JS_DUMP_LONG);
  log_sink = NULL;
  const char *s = b.s ? b.s : "exception";
  const char *nl = strchr(s, '\n');
  int mlen = nl ? (int)(nl - s) : (int)strlen(s);
  char where[128] = "";
  for (const char *p = nl; p && (p = strstr(p, "at ")); p += 3) {   // the first frame that is not the prelude
    const char *open = strchr(p, '('), *close = open ? strchr(open, ')') : NULL, *end = strchr(p, '\n');
    if (open && close && (!end || close < end) && strncmp(open + 1, "prelude.js", 10) && strncmp(open + 1, "<kernel>", 8)) {
      snprintf(where, sizeof where, " (%.*s)", (int)(close - open - 1), open + 1);
      break;
    }
  }
  snprintf(out, n, "%.*s%s%s%s", mlen, s, where, nl ? "\n" : "", nl ? nl + 1 : "");
  free(b.s);
}

static void set_error(world_t *W) {
  char b[2048];
  exception_text(W->vm->ctx, b, sizeof b);
  char *nl = strchr(b, '\n');
  free(W->trace);
  W->trace = nl ? xstrdup(nl + 1) : NULL;
  if (nl) *nl = 0;
  snprintf(W->last_error, sizeof W->last_error, "%s", b);
  if (strstr(b, "out of memory")) W->oom = true;
}

// ---- work counting ------------------------------------------------------------------------------------------
static int on_interrupt(JSContext *ctx, void *opaque) {
  (void)ctx;
  world_t *W = opaque;
  W->interrupts++;
  if (K.realtime ? port_clock() > W->seg_deadline : W->interrupts - W->seg_interrupts0 > W->budget_interrupts) { W->overrun = true; return 1; }
  return 0;
}

void vm_begin_segment(world_t *W, vtime_t budget_us) {
  W->seg_interrupts0 = W->interrupts;
  W->seg_counter0 = W->vm && W->vm->ctx ? JS_GetInterruptCounter(W->vm->ctx) : JS_GetInterruptCounterInit();
  W->budget_interrupts = (int64_t)((double)budget_us * 1000.0 / (PROFILE.ns_per_step * JS_GetInterruptCounterInit())) + 1;
  W->seg_deadline = K.realtime ? port_clock() + budget_us : VT_INF;
  W->overrun = false;
}

int64_t vm_steps(world_t *W) {
  if (!W->vm || !W->vm->ctx) return 0;
  return (W->interrupts - W->seg_interrupts0) * JS_GetInterruptCounterInit() + W->seg_counter0 - JS_GetInterruptCounter(W->vm->ctx);
}

// What a world uses: the heap the last collection left live (the collector only runs when the arena is full,
// so the heap's end is mostly garbage), plus its stack. Running out of the arena is still exact.
static void note_memory(world_t *W) {
  size_t heap, stack, live; unsigned gcs;
  JS_GetMemoryUsage(W->vm->ctx, &heap, &stack, &live, &gcs);
  W->mem_used = (gcs ? live : heap) + stack;
  W->gcs = gcs;
  unsigned ooms = JS_GetOutOfMemoryCount(W->vm->ctx);
  if (ooms != W->vm->ooms) { W->vm->ooms = ooms; W->oom = true; }   // even if the world caught the error
}

// ---- arguments: copied out at once (a string's bytes can move at the next allocation) -------------------------
int iarg(JSContext *ctx, JSValue *argv, int argc, int i, int def) {
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return def;
  double d; if (JS_ToNumber(ctx, &d, argv[i])) return def;
  return (int)d;
}
double darg(JSContext *ctx, JSValue *argv, int argc, int i, double def) {
  if (i >= argc || JS_IsUndefined(argv[i])) return def;
  double d; if (JS_ToNumber(ctx, &d, argv[i])) return def;
  return d;
}
char *sarg(JSContext *ctx, JSValue *argv, int argc, int i) {   // a copy, or NULL
  if (i >= argc || JS_IsUndefined(argv[i]) || JS_IsNull(argv[i])) return NULL;
  JSCStringBuf cb;
  size_t n;
  const char *s = JS_ToCStringLen(ctx, &n, argv[i], &cb);
  if (!s) return xstrdup("");
  char *c = malloc(n + 1);
  memcpy(c, s, n); c[n] = 0;
  return c;
}
int int_list(JSContext *ctx, JSValue *argv, int argc, int i, int *out, int max) {
  if (i >= argc || !JS_IsPtr(argv[i]) || JS_GetClassID(ctx, argv[i]) != JS_CLASS_ARRAY) return 0;
  int n = 0;
  JSValue lv = JS_GetPropertyStr(ctx, argv[i], "length");
  JS_ToInt32(ctx, &n, lv);
  if (n > max) n = max;
  for (int k = 0; k < n; k++) { int x = 0; JS_ToInt32(ctx, &x, JS_GetPropertyUint32(ctx, argv[i], (uint32_t)k)); out[k] = x; }
  return n;
}
pixel_t color_arg(JSContext *ctx, JSValue *argv, int argc, int i) {
  if (i < argc && JS_IsString(ctx, argv[i])) { char *s = sarg(ctx, argv, argc, i); pixel_t c = gfx_color(s); free(s); return c; }
  return (pixel_t)iarg(ctx, argv, argc, i, 0);
}
JSValue fail(JSContext *ctx, const char *fmt, ...) {
  char b[256]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  return JS_ThrowError(ctx, JS_CLASS_ERROR, "%s", b);
}
JSValue json_value(JSContext *ctx, char *json) {   // takes ownership; parsed in the world
  if (!json) return JS_NULL;
  JSValue v = JS_Parse(ctx, json, strlen(json), "<kernel>", JS_EVAL_JSON);
  free(json);
  return v;
}
void charge_json(size_t n) { K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); }

bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh) {
  char err[160];
  for (int i = 0; i < nh; i++) {
    handle_t *h = handle_use(W, hs[i], -1, 0, err, sizeof err);
    if (!h) { fail(ctx, "%s", err); return false; }
    if (!(h->rights & R_GRANT) && h->minter != W->id) { fail(ctx, "handle %d cannot be passed on by %s", hs[i], W->name); return false; }
  }
  return true;
}

// ---- calls into the world -----------------------------------------------------------------------------------------
// Push args (already made: ints, bools, null) and string args, then call the global fn. Strings are made one at a
// time after the values before them are on the stack, where the collector sees them.
typedef struct { int kind; double num; const char *str; } arg_t;   // kind: 0 number, 1 string (NULL: null), 2 bool
static JSValue call_global(world_t *W, const char *fn, const arg_t *args, int n) {
  JSContext *ctx = W->vm->ctx;
  if (JS_StackCheck(ctx, n + 2)) return JS_EXCEPTION;
  for (int i = n - 1; i >= 0; i--) {
    JSValue v;
    if (args[i].kind == 1) v = args[i].str ? JS_NewString(ctx, args[i].str) : JS_NULL;
    else if (args[i].kind == 2) v = JS_NewBool(args[i].num != 0);
    else v = JS_NewFloat64(ctx, args[i].num);
    if (JS_IsException(v)) return v;
    JS_PushArg(ctx, v);
  }
  JSValue f = JS_GetPropertyStr(ctx, JS_GetGlobalObject(ctx), fn);
  if (!JS_IsFunction(ctx, f)) return JS_ThrowError(ctx, JS_CLASS_TYPE_ERROR, "the prelude did not define %s", fn);
  JS_PushArg(ctx, f);
  JS_PushArg(ctx, JS_NULL);
  return JS_Call(ctx, n);
}
static char *string_result(JSContext *ctx, JSValue r) {   // a copy of a string result, or NULL
  if (!JS_IsString(ctx, r)) return NULL;
  JSCStringBuf cb; size_t n;
  const char *s = JS_ToCStringLen(ctx, &n, r, &cb);
  char *c = malloc(n + 1);
  memcpy(c, s, n); c[n] = 0;
  return c;
}

static int eval_file(world_t *W, const char *src, size_t n, const char *name) {
  JSValue r = JS_Eval(W->vm->ctx, src, n, name, 0);
  if (JS_IsException(r)) { set_error(W); return -1; }
  return 0;
}

static void read_list(JSContext *ctx, JSValue *meta, const char *key, char (*dst)[NAME_LEN], int *n) {
  *n = 0;
  JSValue a = JS_GetPropertyStr(ctx, *meta, key);
  if (!JS_IsPtr(a) || JS_GetClassID(ctx, a) != JS_CLASS_ARRAY) return;
  int len = 0; JS_ToInt32(ctx, &len, JS_GetPropertyStr(ctx, a, "length"));
  for (int i = 0; i < len && i < MAX_LIST; i++) {
    a = JS_GetPropertyStr(ctx, *meta, key);   // re-read: a string conversion may have moved the array
    JSValue e = JS_GetPropertyUint32(ctx, a, (uint32_t)i);
    JSCStringBuf cb;
    const char *s = JS_ToCString(ctx, e, &cb);
    snprintf(dst[(*n)++], NAME_LEN, "%s", s ? s : "");
  }
}

static int read_meta(world_t *W, JSValue *meta) {
  JSContext *ctx = W->vm->ctx;
  read_list(ctx, meta, "needs", W->needs, &W->n_needs);
  read_list(ctx, meta, "provides", W->provides, &W->n_provides);
  W->n_every = 0;
  JSValue ev = JS_GetPropertyStr(ctx, *meta, "every");
  if (JS_IsPtr(ev) && JS_GetClassID(ctx, ev) == JS_CLASS_ARRAY) {
    int len = 0; JS_ToInt32(ctx, &len, JS_GetPropertyStr(ctx, ev, "length"));
    for (int i = 0; i < len && i < MAX_LIST; i++) { int x = 0; JS_ToInt32(ctx, &x, JS_GetPropertyUint32(ctx, ev, (uint32_t)i)); W->every_ms[W->n_every++] = x; }
  }
  JSValue pz = JS_GetPropertyStr(ctx, *meta, "paused");   // timers declared { paused: true } start stopped
  for (int i = 0; i < W->n_every; i++) W->timer_off[i] = JS_IsPtr(pz) && JS_GetPropertyUint32(ctx, pz, (uint32_t)i) == JS_TRUE;
  W->has_start = JS_GetPropertyStr(ctx, *meta, "start") == JS_TRUE;
  W->has_screen = JS_GetPropertyStr(ctx, *meta, "screen") == JS_TRUE;
  JSCStringBuf cb;
  const char *s = JS_ToCString(ctx, JS_GetPropertyStr(ctx, *meta, "kind"), &cb);
  snprintf(W->kind, sizeof W->kind, "%s", s ? s : "world");
  s = JS_ToCString(ctx, JS_GetPropertyStr(ctx, *meta, "title"), &cb);
  snprintf(W->title, sizeof W->title, "%s", s ? s : W->name);
  return 0;
}

// ---- the prelude, compiled once ----------------------------------------------------------------------------
// Every world runs the same prelude, and parsing it was most of a world's start (about 140 ms on the PaperS3).
// The binding compiles it once, before the first world starts, into a bytecode image. Each world then copies
// the image, relocates the copy (which also swaps its copies of names the stdlib has for the stdlib's own) and
// runs it. One image cannot serve several contexts: a context that interns one of the image's string constants
// marks that string unique in place, and the next context would see a "unique" string in none of its tables.
// mquickjs requires the load to come before a context interns any string of its own, so it is the first thing
// a new world does. If compiling fails, worlds parse the source as before.
static uint8_t *prelude_bc;   // header + code, as JS_PrepareBytecode left them (not relocated)
static uint32_t prelude_bc_len;
static bool prelude_tried;

static void compile_prelude(void) {
  prelude_tried = true;
  size_t size = 128 * 1024;   // scratch, freed below (the 64-bit host needs between 48 and 64 KB)
  uint8_t *mem = port_heap_malloc(size);
  if (!mem) return;
  JSContext *ctx = JS_NewContext2(mem, size, &js_stdlib, 1);   // compile mode: parse only, then keep the code
  if (ctx) {
    JSValue f = JS_Parse(ctx, K.prelude, K.prelude_len, "prelude.js", 0);
    if (!JS_IsException(f)) {
      JSBytecodeHeader hdr;
      const uint8_t *data;
      uint32_t len;
      JS_PrepareBytecode(ctx, &hdr, &data, &len, f);   // the code is the arena's used part, data .. data + len
      if ((prelude_bc = port_heap_malloc(sizeof hdr + len))) {
        memcpy(prelude_bc, &hdr, sizeof hdr);
        memcpy(prelude_bc + sizeof hdr, data, len);
        prelude_bc_len = sizeof hdr + len;
      }
    }
    JS_FreeContext(ctx);
  }
  port_heap_free(mem);
  if (!prelude_bc) klog("the prelude did not compile to bytecode; every world parses it");
}

static int run_prelude(world_t *W) {
  JSContext *ctx = W->vm->ctx;
  if (!prelude_bc) return eval_file(W, K.prelude, K.prelude_len, "prelude.js");
  uint8_t *bc = W->vm->prelude = port_heap_malloc(prelude_bc_len);
  if (!bc) { snprintf(W->last_error, sizeof W->last_error, "no memory for the prelude's code"); return -1; }
  memcpy(bc, prelude_bc, prelude_bc_len);
  if (JS_RelocateBytecode(ctx, bc, prelude_bc_len)) { snprintf(W->last_error, sizeof W->last_error, "the prelude's code did not relocate"); return -1; }
  JSValue r = JS_LoadBytecode(ctx, bc);
  if (!JS_IsException(r)) r = JS_Run(ctx, r);
  if (JS_IsException(r)) { set_error(W); return -1; }
  return 0;
}

// ---- lifecycle ----------------------------------------------------------------------------------------------
static size_t arena_size(world_t *W) { return (size_t)((double)W->mem_limit * PROFILE.mem_scale); }

int vm_create(world_t *W) {
  if (!prelude_tried) compile_prelude();
  W->oom = false; W->interrupts = 0; W->mem_used = 0;
  W->vm = calloc(1, sizeof(*W->vm));
  W->vm->size = arena_size(W);
  W->vm->arena = port_heap_malloc(W->vm->size);
  if (!W->vm->arena) { snprintf(W->last_error, sizeof W->last_error, "no memory for a %zu KB arena", W->mem_limit / 1024); return -1; }
  JSContext *ctx = W->vm->ctx = JS_NewContext(W->vm->arena, W->vm->size, &js_stdlib);
  if (!ctx) { snprintf(W->last_error, sizeof W->last_error, "could not make a context within %zu KB", W->mem_limit / 1024); return -1; }
  JS_SetContextOpaque(ctx, W);
  JS_SetInterruptHandler(ctx, on_interrupt);
  JS_SetLogFunc(ctx, log_write);
  JS_SetRandomSeed(ctx, W->seed);
  vm_begin_segment(W, MS(600));   // booting may take longer than a turn
  int rc = run_prelude(W);
  if (!rc) rc = eval_file(W, W->source, strlen(W->source), W->file);
  if (!rc) {
    JSGCRef meta_ref;
    JSValue *meta = JS_PushGCRef(ctx, &meta_ref);
    *meta = call_global(W, "__init", NULL, 0);
    if (JS_IsException(*meta)) { set_error(W); rc = -1; }
    else read_meta(W, meta);
    JS_PopGCRef(ctx, &meta_ref);
  }
  if (W->oom || (rc && strstr(W->last_error, "out of memory"))) {
    W->oom = true;
    snprintf(W->last_error, sizeof W->last_error, "ran out of memory while starting (its limit is %zu KB)", W->mem_limit / 1024);
  }
  if (!rc) JS_GC(ctx);   // what starting left live, so the first figure means something
  note_memory(W);
  return rc;
}

void vm_dispose(world_t *W) {
  if (!W->vm) return;
  if (W->vm->ctx) JS_FreeContext(W->vm->ctx);
  port_heap_free(W->vm->arena);
  port_heap_free(W->vm->prelude);
  free(W->vm);
  W->vm = NULL;
}

int vm_dispatch(world_t *W, msg_t *m) {
  JSContext *ctx = W->vm->ctx;
  world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
  if (m->json) charge_json(strlen(m->json));
  arg_t a[5] = {
    { 0, m->kind == M_IRQ ? M_ON : m->kind, NULL },   // to the world an interrupt is an ordinary message, "irq"
    m->kind == M_TICK ? (arg_t){ 0, m->timer, NULL } : (arg_t){ 1, 0, m->type ? m->type : "" },
    { 1, 0, m->json },
    { 1, 0, F ? F->name : NULL },
    { 2, m->ask != 0, NULL },
  };
  JSValue r = call_global(W, "__dispatch", a, 5);
  int rc = 0;
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  else if (!W->turn_async && !W->turn_rejected && !W->turn_done) {
    W->turn_done = true;
    free(W->turn_result);
    W->turn_result = string_result(ctx, r);
  }
  note_memory(W);
  return rc;
}

int vm_settle(world_t *W, settle_t *s) {
  arg_t a[3] = { { 0, s->promise, NULL }, { 2, s->ok, NULL }, { 1, 0, s->json } };
  if (s->json) charge_json(strlen(s->json));
  JSValue r = call_global(W, "__settle", a, 3);
  int rc = 0;
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  note_memory(W);
  return rc;
}

char *vm_render(world_t *W) {
  JSValue r = call_global(W, "__render", NULL, 0);
  if (JS_IsException(r)) { set_error(W); W->turn_failed = true; free(W->turn_error); W->turn_error = xstrdup(W->last_error); return NULL; }
  char *out = string_result(W->vm->ctx, r);
  if (out) charge_json(strlen(out));
  note_memory(W);
  return out;
}

// ---- the manifest: parsed in a scratch context ----------------------------------------------------------------
static int get_str(JSContext *ctx, JSValue *o, const char *key, char *dst, size_t n) {
  JSValue v = JS_GetPropertyStr(ctx, *o, key);
  if (JS_IsUndefined(v)) return 0;
  JSCStringBuf cb;
  const char *s = JS_ToCString(ctx, v, &cb);
  snprintf(dst, n, "%s", s ? s : "");
  return 1;
}
static int get_num(JSContext *ctx, JSValue *o, const char *key, double *d) {
  JSValue v = JS_GetPropertyStr(ctx, *o, key);
  if (JS_IsUndefined(v)) return 0;
  return !JS_ToNumber(ctx, d, v);
}

int vm_read_manifest(const char *json, size_t n, const char *path, int (*add)(void *arg, const manifest_world_t *w), void *arg) {
  size_t size = 64 * 1024 + n * 16;
  uint8_t *mem = port_heap_malloc(size);   // a temporary arena, from the worlds' allocator (PSRAM on the device)
  if (!mem) { fprintf(stderr, "%s: no memory to read the manifest (%u KB)\n", path, (unsigned)(size / 1024)); return -1; }
  JSContext *ctx = JS_NewContext(mem, size, &js_stdlib);
  JS_SetLogFunc(ctx, log_write);
  char *txt = malloc(n + 1); memcpy(txt, json, n); txt[n] = 0;   // the parser wants a terminating NUL
  JSGCRef root_ref, w_ref;
  JSValue *root = JS_PushGCRef(ctx, &root_ref), *w = JS_PushGCRef(ctx, &w_ref);
  *root = JS_Parse(ctx, txt, n, path, JS_EVAL_JSON);
  free(txt);
  int rc = 0;
  if (JS_IsException(*root)) { char b[512]; exception_text(ctx, b, sizeof b); fprintf(stderr, "%s: %s\n", path, b); rc = -1; }
  int count = 0;
  if (!rc) { JSValue ws = JS_GetPropertyStr(ctx, *root, "worlds"); JS_ToInt32(ctx, &count, JS_GetPropertyStr(ctx, ws, "length")); }
  for (int i = 0; !rc && i < count; i++) {
    *w = JS_GetPropertyUint32(ctx, JS_GetPropertyStr(ctx, *root, "worlds"), (uint32_t)i);
    manifest_world_t mw = { 0 };
    if (!get_str(ctx, w, "name", mw.name, sizeof mw.name)) snprintf(mw.name, sizeof mw.name, "?");
    if (!get_str(ctx, w, "file", mw.file, sizeof mw.file)) snprintf(mw.file, sizeof mw.file, "?");
    get_str(ctx, w, "engine", mw.engine, sizeof mw.engine);
    mw.has_budget = get_num(ctx, w, "budget_ms", &mw.budget_ms);
    mw.has_mem = get_num(ctx, w, "mem_kb", &mw.mem_kb);
    mw.has_prio = get_num(ctx, w, "priority", &mw.priority);
    mw.has_store = get_num(ctx, w, "store_kb", &mw.store_kb);
    int nc = 0;
    JS_ToInt32(ctx, &nc, JS_GetPropertyStr(ctx, JS_GetPropertyStr(ctx, *w, "claims"), "length"));
    for (int k = 0; k < nc && k < MAX_LIST; k++) {
      JSValue e = JS_GetPropertyUint32(ctx, JS_GetPropertyStr(ctx, *w, "claims"), (uint32_t)k);
      JSCStringBuf cb;
      const char *s = JS_ToCString(ctx, e, &cb);
      snprintf(mw.claims[mw.n_claims++], NAME_LEN, "%s", s ? s : "");
    }
    if (add(arg, &mw)) rc = -1;
  }
  JS_PopGCRef(ctx, &w_ref); JS_PopGCRef(ctx, &root_ref);
  JS_FreeContext(ctx);
  port_heap_free(mem);
  return rc;
}

// ---- calibration: the same loops as vm.c, counted in steps -----------------------------------------------------
static int count_interrupt(JSContext *ctx, void *o) { (void)ctx; (*(int64_t *)o)++; return 0; }
static int64_t count_steps(const char *src, double *real_ms) {
  size_t size = 64 * 1024;
  uint8_t *mem = port_heap_malloc(size);
  *real_ms = 0;
  if (!mem) return 0;   // no calibration: the profile's estimate stands
  JSContext *ctx = JS_NewContext(mem, size, &js_stdlib);
  int64_t n = 0;
  JS_SetContextOpaque(ctx, &n);
  JS_SetInterruptHandler(ctx, count_interrupt);
  int c0 = JS_GetInterruptCounter(ctx);
  vtime_t t0 = K.realtime ? port_clock() : 0;
  JS_Eval(ctx, src, strlen(src), "calibrate.js", JS_EVAL_RETVAL);
  *real_ms = K.realtime ? (port_clock() - t0) / 1000.0 : 0;
  int64_t steps = n * JS_GetInterruptCounterInit() + c0 - JS_GetInterruptCounter(ctx);
  JS_FreeContext(ctx);
  port_heap_free(mem);
  return steps;
}
double vm_fib20_ms;
void vm_calibrate(void) {
  double loop_ms, fib_ms;
  int64_t loop = count_steps("(function(){var s=0; for(var i=0;i<100000;i++) s+=i; return s;})()", &loop_ms);
  int64_t fib = count_steps("(function(){function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()", &fib_ms);
  if (loop > 0) PROFILE.ns_per_step = PROFILE.loop_ms * 1e6 / (double)loop;
  vm_fib20_ms = fib * PROFILE.ns_per_step / 1e6;
  if (K.verbose) fprintf(stderr, "calibration: the 100k loop is %lld steps, so a step is %.0f virtual ns; fib(20) is %lld steps = %.1f virtual ms\n",
                         (long long)loop, PROFILE.ns_per_step, (long long)fib, vm_fib20_ms);
  if (K.realtime) klog("calibration on the real clock: the 100k loop took %.1f ms (the model says %.0f), fib(20) %.1f ms (the model says %.1f)",
                       loop_ms, (double)PROFILE.loop_ms, fib_ms, vm_fib20_ms);
}

void vm_reset(void) { wall_offset_ms = WALL_BOOT_MS; vm_op_prof_reset(); }   // the compiled prelude stays: the same text

// Date.now(): the wall clock (the RTC's time once the clock driver has read it)
JSValue js_date_now(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
  (void)this_val; (void)argc; (void)argv;
  return JS_NewFloat64(ctx, wall_offset_ms + kernel_now() / 1000.0);
}

#include "mqjs_stdlib.h"

// One QuickJS runtime per world: its own heap (with a hard limit), its own job queue, and an interrupt
// handler that counts the work a turn does and stops it at its budget. The host functions here are
// the only way out of a world: __k(op, ...) for things that finish now, __ka(op, ...) for things that
// finish later and return a promise. The prelude (js/prelude.js) wraps them in the API worlds use.
#include <stdarg.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_quickjs.h"
#if PICOCALC_CANDELA_WORLD
#include "candela_world.h"
#endif

const char *vm_engine_name(void) { return "QuickJS " CONFIG_VERSION; }

// ---- the allocator: per-world accounting and limit (the blocks come from the port's world heap) ----------
static size_t host_limit(world_t *W) { return (size_t)((double)W->mem_limit * PROFILE.mem_scale); }

static void *w_malloc(JSMallocState *s, size_t size) {
  world_t *W = s->opaque;
  if (W->mem_used + size > host_limit(W)) { W->oom = true; return NULL; }
  void *p = port_heap_malloc(size);
  if (!p) return NULL;
  size_t u = port_heap_usable(p) + 8;
  W->mem_used += u; s->malloc_size += u; s->malloc_count++;
#if PICOCALC_CANDELA_WORLD
  if (W->mem_used > W->mem_peak) W->mem_peak = W->mem_used;
#endif
  return p;
}
static void w_free(JSMallocState *s, void *p) {
  if (!p) return;
  world_t *W = s->opaque;
  size_t u = port_heap_usable(p) + 8;
  W->mem_used -= u; s->malloc_size -= u; s->malloc_count--;
  port_heap_free(p);
}
static void *w_realloc(JSMallocState *s, void *p, size_t size) {
  world_t *W = s->opaque;
  if (!p) return size ? w_malloc(s, size) : NULL;
  size_t old = port_heap_usable(p) + 8;
  if (!size) { w_free(s, p); return NULL; }
  if (W->mem_used - old + size > host_limit(W)) { W->oom = true; return NULL; }
  void *q = port_heap_realloc(p, size);
  if (!q) return NULL;
  size_t u = port_heap_usable(q) + 8;
  W->mem_used = W->mem_used - old + u; s->malloc_size = s->malloc_size - old + u;
#if PICOCALC_CANDELA_WORLD
  if (W->mem_used > W->mem_peak) W->mem_peak = W->mem_used;
#endif
  return q;
}
static size_t w_usable(const void *p) { return port_heap_usable(p); }
static const JSMallocFunctions MF = { w_malloc, w_free, w_realloc, w_usable };

// ---- work counting ------------------------------------------------------------------------------------------
static int on_interrupt(JSRuntime *rt, void *opaque) {
  (void)rt;
  world_t *W = opaque;
  W->interrupts++;
  if (W->oom) return 1;
  if (K.realtime ? port_clock() > W->seg_deadline : W->interrupts - W->seg_interrupts0 > W->budget_interrupts) { W->overrun = true; return 1; }
  return 0;
}

void vm_begin_segment(world_t *W, vtime_t budget_us) {
  W->seg_interrupts0 = W->interrupts;
  W->seg_counter0 = W->vm && W->vm->ctx ? JS_GetInterruptCounter(W->vm->ctx) : JS_GetInterruptCounterInit();
  W->budget_interrupts = (int64_t)((double)budget_us * 1000.0 / (PROFILE.ns_per_step * JS_GetInterruptCounterInit())) + 1;
  W->seg_deadline = K.realtime ? port_clock() + budget_us : VT_INF;
  W->overrun = false;
#if PICOCALC_CANDELA_WORLD
  W->seg_long = false;
#endif
}

#if PICOCALC_CANDELA_WORLD
// A long segment: this segment runs on the world's long budget (manifest "long_ms") instead of its turn budget, counted
// from the segment's start. For work that cannot be split across turns, such as a Candela scene build; it holds the
// lane as a boot segment does. A world without long_ms cannot ask.
int vm_long_segment(world_t *W, char *why, size_t n) {
  if (!W->long_budget_us) { snprintf(why, n, "%s has no long_ms in its manifest", W->name); return -1; }
  if (W->seg_long) return 0;
  W->seg_long = true;
  W->budget_interrupts = (int64_t)((double)W->long_budget_us * 1000.0 / (PROFILE.ns_per_step * JS_GetInterruptCounterInit())) + 1;
  if (K.realtime) W->seg_deadline = K.vnow + W->long_budget_us;
  return 0;
}
#endif

int64_t vm_steps(world_t *W) {
  if (!W->vm || !W->vm->ctx) return 0;
  return (W->interrupts - W->seg_interrupts0) * JS_GetInterruptCounterInit() + W->seg_counter0 - JS_GetInterruptCounter(W->vm->ctx);
}
// ---- lifecycle ----------------------------------------------------------------------------------------------
// A rejection with no handler yet is noted; if a handler is attached before the job queue drains (as
// the prelude does for an async handler's promise), it is forgotten; what is left is reported.
static void on_rejection(JSContext *ctx, JSValueConst promise, JSValueConst reason, JS_BOOL handled, void *opaque) {
  world_t *W = opaque;
  if (!handled) {
    if (W->vm->n_unhandled < 8) { W->vm->unhandled[W->vm->n_unhandled] = JS_DupValue(ctx, promise); W->vm->unhandled_why[W->vm->n_unhandled++] = JS_DupValue(ctx, reason); }
    return;
  }
  for (int i = 0; i < W->vm->n_unhandled; i++)
    if (JS_VALUE_GET_PTR(W->vm->unhandled[i]) == JS_VALUE_GET_PTR(promise)) {
      JS_FreeValue(ctx, W->vm->unhandled[i]); JS_FreeValue(ctx, W->vm->unhandled_why[i]);
      W->vm->unhandled[i] = W->vm->unhandled[--W->vm->n_unhandled]; W->vm->unhandled_why[i] = W->vm->unhandled_why[W->vm->n_unhandled];
      return;
    }
}
static void drop_unhandled(world_t *W, bool report) {
  for (int i = 0; i < W->vm->n_unhandled; i++) {
    if (report) {
      const char *m = JS_ToCString(W->vm->ctx, W->vm->unhandled_why[i]);
      klog("%s: a promise was rejected and nothing handled it: %s", W->name, m ? m : "?");
      JS_FreeCString(W->vm->ctx, m);
    }
    JS_FreeValue(W->vm->ctx, W->vm->unhandled[i]); JS_FreeValue(W->vm->ctx, W->vm->unhandled_why[i]);
  }
  W->vm->n_unhandled = 0;
}

static int run_jobs(world_t *W) {
  for (;;) {
    JSContext *c;
    int r = JS_ExecutePendingJob(W->vm->rt, &c);
    if (r == 0) { drop_unhandled(W, true); return 0; }
    if (r < 0) { set_error(W); return -1; }
  }
}

static int read_meta(world_t *W, JSValue meta) {
  JSContext *ctx = W->vm->ctx;
  struct { const char *key; char (*dst)[NAME_LEN]; int *n; } lists[] = {
    { "needs", W->needs, &W->n_needs }, { "provides", W->provides, &W->n_provides },
  };
  for (int l = 0; l < 2; l++) {
    JSValue a = JS_GetPropertyStr(ctx, meta, lists[l].key);
    JSValue lv = JS_GetPropertyStr(ctx, a, "length");
    int32_t n = 0; JS_ToInt32(ctx, &n, lv);
    *lists[l].n = 0;
    for (int i = 0; i < n && i < MAX_LIST; i++) {
      JSValue e = JS_GetPropertyUint32(ctx, a, (uint32_t)i);
      const char *s = JS_ToCString(ctx, e);
      snprintf(lists[l].dst[(*lists[l].n)++], NAME_LEN, "%s", s ? s : "");
      JS_FreeCString(ctx, s); JS_FreeValue(ctx, e);
    }
    JS_FreeValue(ctx, lv); JS_FreeValue(ctx, a);
  }
  JSValue ev = JS_GetPropertyStr(ctx, meta, "every");
  W->n_every = int_list(ctx, ev, W->every_ms, MAX_LIST);
  JS_FreeValue(ctx, ev);
  JSValue v;
  v = JS_GetPropertyStr(ctx, meta, "start"); W->has_start = JS_ToBool(ctx, v); JS_FreeValue(ctx, v);
  v = JS_GetPropertyStr(ctx, meta, "screen"); W->has_screen = JS_ToBool(ctx, v); JS_FreeValue(ctx, v);
  v = JS_GetPropertyStr(ctx, meta, "kind"); { const char *s = JS_ToCString(ctx, v); snprintf(W->kind, sizeof W->kind, "%s", s ? s : "world"); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, v);
  v = JS_GetPropertyStr(ctx, meta, "title"); { const char *s = JS_ToCString(ctx, v); snprintf(W->title, sizeof W->title, "%s", s ? s : W->name); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, v);
  // what it shows on the launcher (.icon, .about, .key), checked by the kernel as a native world's is
  static const char *const SHOWN[] = { "icon", "about", "key" };
  for (int i = 0; i < 3; i++) {
    v = JS_GetPropertyStr(ctx, meta, SHOWN[i]);
    if (!JS_IsUndefined(v) && !JS_IsNull(v)) {
      JSValue t = i == 0 ? JS_JSONStringify(ctx, v, JS_UNDEFINED, JS_UNDEFINED) : JS_DupValue(ctx, v);
      const char *s = JS_IsException(t) ? NULL : JS_ToCString(ctx, t);
      char why[160] = "";
      int r = s ? kernel_present(W, SHOWN[i], s, why, sizeof why) : -1;
      if (r) snprintf(W->last_error, sizeof W->last_error, "%s", why[0] ? why : "its icon is not plain data");
      JS_FreeCString(ctx, s); JS_FreeValue(ctx, t);
      if (r) { JS_FreeValue(ctx, v); return -1; }
    }
    JS_FreeValue(ctx, v);
  }
  return 0;
}

#if PICOCALC_PRELUDE_CACHE
static uint8_t *prelude_bytecode;
static size_t prelude_bytecode_len;
static bool prelude_cache_tried;

static void build_prelude_cache(void) {
  prelude_cache_tried = true;
  vtime_t start = port_clock();
  JSRuntime *rt = JS_NewRuntime();
  if (!rt) return;
  JS_SetMaxStackSize(rt, port_js_stack());
  JS_SetMemoryLimit(rt, 512 * 1024);
  JSContext *ctx = JS_NewContext(rt);
  if (ctx) {
    JSValue script = JS_Eval(ctx, K.prelude, K.prelude_len, "prelude.js",
                             JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    if (!JS_IsException(script)) {
      size_t length = 0;
      uint8_t *bytes = JS_WriteObject(ctx, &length, script, JS_WRITE_OBJ_BYTECODE);
      if (bytes) {
        prelude_bytecode = port_heap_malloc(length);
        if (prelude_bytecode) {
          memcpy(prelude_bytecode, bytes, length);
          prelude_bytecode_len = length;
        }
        js_free(ctx, bytes);
      }
    }
    JS_FreeValue(ctx, script);
    JS_FreeContext(ctx);
  }
  JS_FreeRuntime(rt);
  printf("quickjs prelude cache bytes=%zu build_us=%lld\n",
         prelude_bytecode_len, (long long)(port_clock() - start));
}
#endif

static JSValue eval_prelude(JSContext *ctx) {
#if PICOCALC_PRELUDE_CACHE
  if (!prelude_cache_tried) build_prelude_cache();
  if (prelude_bytecode) {
    // This is a copy of a firmware script compiled by this same QuickJS build.
    // Decode a fresh function and constants in the destination runtime.
    JSValue script = JS_ReadObject(ctx, prelude_bytecode, prelude_bytecode_len, JS_READ_OBJ_BYTECODE);
    if (JS_IsException(script)) return script;
    return JS_EvalFunction(ctx, script);
  }
#endif
  return JS_Eval(ctx, K.prelude, K.prelude_len, "prelude.js", JS_EVAL_TYPE_GLOBAL);
}

int vm_create(world_t *W) {
  W->oom = false; W->interrupts = 0; W->mem_used = 0;
#if PICOCALC_CANDELA_WORLD
  W->mem_peak = 0;
#endif
  W->vm = calloc(1, sizeof(*W->vm));
  W->vm->rt = JS_NewRuntime2(&MF, W);
  if (!W->vm->rt) { snprintf(W->last_error, sizeof W->last_error, "could not make a runtime within %zu KB", W->mem_limit / 1024); return -1; }
#if PICOCALC_CANDELA_WORLD
  JS_SetMaxStackSize(W->vm->rt, W->js_stack && W->js_stack < port_js_stack() ? W->js_stack : port_js_stack());
#else
  JS_SetMaxStackSize(W->vm->rt, port_js_stack());
#endif
  JS_SetInterruptHandler(W->vm->rt, on_interrupt, W);
  JS_SetHostPromiseRejectionTracker(W->vm->rt, on_rejection, W);
  W->vm->ctx = JS_NewContext(W->vm->rt);
  if (!W->vm->ctx) { snprintf(W->last_error, sizeof W->last_error, "could not make a context within %zu KB", W->mem_limit / 1024); JS_FreeRuntime(W->vm->rt); W->vm->rt = NULL; return -1; }
  JS_SetContextOpaque(W->vm->ctx, W);
  vm_begin_segment(W, MS(600));   // booting may take longer than a turn
  JSContext *ctx = W->vm->ctx;
  JSValue g = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, g, "__k", JS_NewCFunction(ctx, host_k, "__k", 1));
  JS_SetPropertyStr(ctx, g, "__ka", JS_NewCFunction(ctx, host_ka, "__ka", 1));
  W->vm->fn_dispatch = JS_UNDEFINED; W->vm->fn_render = JS_UNDEFINED;
  int rc = 0;
  JSValue r = eval_prelude(ctx);
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  JS_FreeValue(ctx, r);
#if PICOCALC_CANDELA_WORLD
  // the Candela world (claim "candela"): its bytecode module loader and host object, after the prelude
  if (!rc && world_claims(W, "candela") && candela_world_install(W, ctx)) { set_error(W); rc = -1; }
#endif
  if (!rc) {
    r = JS_Eval(ctx, W->source, strlen(W->source), W->file, JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) { set_error(W); rc = -1; }
    JS_FreeValue(ctx, r);
  }
  if (!rc) {
    JSValue init = JS_GetPropertyStr(ctx, g, "__init");
    JSValue meta = JS_Call(ctx, init, JS_UNDEFINED, 0, NULL);
    if (JS_IsException(meta)) { set_error(W); rc = -1; }
    else if (read_meta(W, meta)) rc = -1;   // W->last_error says why
    JS_FreeValue(ctx, meta); JS_FreeValue(ctx, init);
  }
  if (!rc) {
    W->vm->fn_dispatch = JS_GetPropertyStr(ctx, g, "__dispatch");
    W->vm->fn_render = JS_GetPropertyStr(ctx, g, "__render");
    rc = run_jobs(W);
  }
  JS_FreeValue(ctx, g);
  if (rc && W->oom) snprintf(W->last_error, sizeof W->last_error, "ran out of memory while starting (its limit is %zu KB)", W->mem_limit / 1024);
  return rc;
}

void vm_dispose(world_t *W) {
  agent_drop(W);
#if PICOCALC_CANDELA_WORLD
  candela_world_dispose(W);
#endif
  if (!W->vm) return;
  if (!W->vm->rt) { free(W->vm); W->vm = NULL; return; }
  JSContext *ctx = W->vm->ctx;
  drop_unhandled(W, false);
  for (int i = 0; i < W->vm->n_pend; i++) { JS_FreeValue(ctx, W->vm->pend[i].resolve); JS_FreeValue(ctx, W->vm->pend[i].reject); }
  W->vm->n_pend = 0;
  JS_FreeValue(ctx, W->vm->fn_dispatch); JS_FreeValue(ctx, W->vm->fn_render);
  W->vm->fn_dispatch = W->vm->fn_render = JS_UNDEFINED;
  JS_FreeContext(ctx);
  JS_FreeRuntime(W->vm->rt);
  free(W->vm->pend);
  free(W->vm);
  W->vm = NULL;
}

int vm_dispatch(world_t *W, msg_t *m) {
  JSContext *ctx = W->vm->ctx;
  world_t *F = m->from >= 0 ? world_by_id(m->from) : NULL;
  if (m->json) charge_json(strlen(m->json));
  JSValue a[5];
  a[0] = JS_NewInt32(ctx, m->kind);
  a[1] = m->kind == M_TICK ? JS_NewInt32(ctx, m->timer) : JS_NewString(ctx, m->type ? m->type : "");
  a[2] = m->json ? JS_NewString(ctx, m->json) : JS_NULL;
  a[3] = F ? JS_NewString(ctx, F->name) : JS_NULL;
  a[4] = JS_NewBool(ctx, m->ask != 0);
  JSValue r = JS_Call(ctx, W->vm->fn_dispatch, JS_UNDEFINED, 5, (JSValueConst *)a);
  for (int i = 0; i < 5; i++) JS_FreeValue(ctx, a[i]);
  if (JS_IsException(r)) { set_error(W); return -1; }
  if (!W->turn_async && !W->turn_rejected && !W->turn_done) {
    W->turn_done = true;
    free(W->turn_result);
    W->turn_result = NULL;
    if (JS_IsString(r)) { const char *s = JS_ToCString(ctx, r); W->turn_result = xstrdup(s); JS_FreeCString(ctx, s); }
  }
  JS_FreeValue(ctx, r);
  return run_jobs(W);
}

int vm_settle(world_t *W, settle_t *s) {
  JSContext *ctx = W->vm->ctx;
  int k = -1;
  for (int i = 0; i < W->vm->n_pend; i++) if (W->vm->pend[i].id == s->promise) { k = i; break; }
  if (k < 0) return 0;
  pending_t p = W->vm->pend[k];
  W->vm->pend[k] = W->vm->pend[--W->vm->n_pend];
  JSValue v;
  if (s->ok) v = s->json ? JS_ParseJSON(ctx, s->json, strlen(s->json), "<kernel>") : JS_UNDEFINED;
  else {
    v = JS_NewError(ctx);
    JSValue msg = s->json ? JS_ParseJSON(ctx, s->json, strlen(s->json), "<kernel>") : JS_NewString(ctx, "failed");
    JS_SetPropertyStr(ctx, v, "message", msg);
  }
  if (s->json) charge_json(strlen(s->json));
  JSValue r = JS_Call(ctx, s->ok ? p.resolve : p.reject, JS_UNDEFINED, 1, (JSValueConst *)&v);
  JS_FreeValue(ctx, v);
  JS_FreeValue(ctx, p.resolve); JS_FreeValue(ctx, p.reject);
  int rc = 0;
  if (JS_IsException(r)) { set_error(W); rc = -1; }
  JS_FreeValue(ctx, r);
  return rc ? rc : run_jobs(W);
}

char *vm_render(world_t *W) {
  JSContext *ctx = W->vm->ctx;
  JSValue r = JS_Call(ctx, W->vm->fn_render, JS_UNDEFINED, 0, NULL);
  if (JS_IsException(r)) { set_error(W); W->turn_failed = true; free(W->turn_error); W->turn_error = xstrdup(W->last_error); return NULL; }
  char *out = NULL;
  if (JS_IsString(r)) { size_t n; const char *s = JS_ToCStringLen(ctx, &n, r); out = xstrdup(s); JS_FreeCString(ctx, s); charge_json(n); }
  JS_FreeValue(ctx, r);
  return out;
}

// ---- the manifest ---------------------------------------------------------------------------------------------
int vm_read_manifest(const char *json, size_t n, const char *path, int (*add)(void *arg, const manifest_world_t *w), void *arg) {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  JSValue v = JS_ParseJSON(ctx, json, n, path);
  int rc = 0;
  if (JS_IsException(v)) {
    char b[512]; fprintf(stderr, "%s: %s\n", path, vm_exception(ctx, b, sizeof b));
    JS_FreeContext(ctx); JS_FreeRuntime(rt);
    return -1;
  }
  JSValue ws = JS_GetPropertyStr(ctx, v, "worlds");
  JSValue lv = JS_GetPropertyStr(ctx, ws, "length");
  int32_t count = 0; JS_ToInt32(ctx, &count, lv); JS_FreeValue(ctx, lv);
  for (int i = 0; !rc && i < count; i++) {
    JSValue o = JS_GetPropertyUint32(ctx, ws, (uint32_t)i);
    manifest_world_t mw = { 0 };
    JSValue f;
    const char *s;
    f = JS_GetPropertyStr(ctx, o, "name"); s = JS_ToCString(ctx, f); snprintf(mw.name, sizeof mw.name, "%s", s ? s : "?"); JS_FreeCString(ctx, s); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "file"); s = JS_ToCString(ctx, f); snprintf(mw.file, sizeof mw.file, "%s", s ? s : "?"); JS_FreeCString(ctx, s); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "engine"); if (!JS_IsUndefined(f)) { s = JS_ToCString(ctx, f); snprintf(mw.engine, sizeof mw.engine, "%s", s ? s : "?"); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "fallback"); if (!JS_IsUndefined(f)) { s = JS_ToCString(ctx, f); snprintf(mw.fallback, sizeof mw.fallback, "%s", s ? s : ""); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "budget_ms"); if ((mw.has_budget = !JS_IsUndefined(f))) JS_ToFloat64(ctx, &mw.budget_ms, f); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "mem_kb"); if ((mw.has_mem = !JS_IsUndefined(f))) JS_ToFloat64(ctx, &mw.mem_kb, f); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "priority"); if ((mw.has_prio = !JS_IsUndefined(f))) JS_ToFloat64(ctx, &mw.priority, f); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "store_kb"); if ((mw.has_store = !JS_IsUndefined(f))) JS_ToFloat64(ctx, &mw.store_kb, f); JS_FreeValue(ctx, f);
#if PICOCALC_CANDELA_WORLD
    f = JS_GetPropertyStr(ctx, o, "long_ms"); if ((mw.has_long = !JS_IsUndefined(f))) JS_ToFloat64(ctx, &mw.long_ms, f); JS_FreeValue(ctx, f);
    f = JS_GetPropertyStr(ctx, o, "stack_kb"); if ((mw.has_stack = !JS_IsUndefined(f))) JS_ToFloat64(ctx, &mw.stack_kb, f); JS_FreeValue(ctx, f);
#endif
    f = JS_GetPropertyStr(ctx, o, "claims");
    JSValue cl = JS_GetPropertyStr(ctx, f, "length"); int32_t nc = 0; JS_ToInt32(ctx, &nc, cl); JS_FreeValue(ctx, cl);
    for (int k = 0; k < nc && k < MAX_LIST; k++) {
      JSValue e = JS_GetPropertyUint32(ctx, f, (uint32_t)k);
      s = JS_ToCString(ctx, e); snprintf(mw.claims[mw.n_claims++], NAME_LEN, "%s", s ? s : ""); JS_FreeCString(ctx, s); JS_FreeValue(ctx, e);
    }
    JS_FreeValue(ctx, f);
    JS_FreeValue(ctx, o);
    if (add(arg, &mw)) rc = -1;
  }
  JS_FreeValue(ctx, ws); JS_FreeValue(ctx, v);
  JS_FreeContext(ctx); JS_FreeRuntime(rt);
  return rc;
}

// The virtual cost of one interrupt-counter step, from a measurement on the ESP32-P4: the 0101 firmware's
// "js bench" runs this 100,000-iteration loop in 133 ms on the device (esp32-s3-m5/0101-esp32-p4-native-quickjs).
// fib(20), measured there at 31 ms, is counted too, as a check on the model.
static int count_interrupt(JSRuntime *rt, void *o) { (void)rt; (*(int64_t *)o)++; return 0; }
static int64_t count_steps(const char *src, double *real_ms) {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  int64_t n = 0;
  JS_SetInterruptHandler(rt, count_interrupt, &n);
  int c0 = JS_GetInterruptCounter(ctx);
  vtime_t t0 = K.realtime ? port_clock() : 0;
  JSValue r = JS_Eval(ctx, src, strlen(src), "calibrate.js", JS_EVAL_TYPE_GLOBAL);
  *real_ms = K.realtime ? (port_clock() - t0) / 1000.0 : 0;
  int64_t steps = n * JS_GetInterruptCounterInit() + c0 - JS_GetInterruptCounter(ctx);
  JS_FreeValue(ctx, r);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return steps;
}
double vm_fib20_ms;
void vm_reset(void) {
#if PICOCALC_PRELUDE_CACHE
  port_heap_free(prelude_bytecode);
  prelude_bytecode = NULL;
  prelude_bytecode_len = 0;
  prelude_cache_tried = false;
#endif
  agent_reset();
}

void vm_calibrate(void) {
  double loop_ms, fib_ms;
  int64_t loop = count_steps("(()=>{let s=0; for(let i=0;i<100000;i++) s+=i; return s;})()", &loop_ms);
  int64_t fib = count_steps("(()=>{function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()", &fib_ms);
  if (loop > 0) PROFILE.ns_per_step = 133e6 / (double)loop;
  vm_fib20_ms = fib * PROFILE.ns_per_step / 1e6;
  if (K.verbose) fprintf(stderr, "calibration: the 100k loop is %lld steps, so a step is %.0f virtual ns; fib(20) is %lld steps = %.1f virtual ms (31 ms on the device)\n",
                         (long long)loop, PROFILE.ns_per_step, (long long)fib, vm_fib20_ms);
  if (K.realtime) klog("calibration on the real clock: the 100k loop took %.1f ms (the model says 133), fib(20) %.1f ms (the model says %.1f)",
                       loop_ms, fib_ms, vm_fib20_ms);
}

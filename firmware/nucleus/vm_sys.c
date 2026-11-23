// The system's operations (worlds, handles, statistics, logs, spawning, faults), the network's, a world's store and
// the agent's; then the two host functions every operation is reached through (QuickJS binding).
#include <stdarg.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_quickjs.h"

static JSValue op_sys_json(JSContext *ctx, world_t *W, const char *what) {
  if (!world_claims(W, "sys.read")) return fail(ctx, "%s has no claim on sys.read", W->name);
  char *j = !strcmp(what, "worlds") ? kernel_worlds_json() : !strcmp(what, "handles") ? hw_handles_json() : kernel_stats_json();
  charge_json(strlen(j));
  return json_value(ctx, j);
}
// Network administration, for Settings. The password passes through here once: checked, copied by the port, wiped.
static JSValue op_net_info(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)argc; (void)argv;
  if (!world_claims(W, "net.admin") && !world_claims(W, "sys.read")) return fail(ctx, "%s has no claim on net.admin", W->name);
  char *j = port_net_info();
  charge_json(j ? strlen(j) : 0);
  return json_value(ctx, j);
}
static JSValue op_net_scan(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)argc; (void)argv;
  if (!world_claims(W, "net.admin")) return fail(ctx, "%s has no claim on net.admin", W->name);
  char why[160] = "";
  if (port_net_scan(why, sizeof why)) return fail(ctx, "%s", why[0] ? why : "cannot scan");
  return JS_TRUE;
}
static JSValue op_net_scan_result(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)argc; (void)argv;
  if (!world_claims(W, "net.admin")) return fail(ctx, "%s has no claim on net.admin", W->name);
  char *j = port_net_scan_result();
  if (j) charge_json(strlen(j));
  return json_value(ctx, j);
}
static JSValue op_net_join(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!world_claims(W, "net.admin")) return fail(ctx, "%s has no claim on net.admin", W->name);
  char *ssid = sarg(ctx, argv, argc, 0), *pw = argc > 1 && !JS_IsUndefined(argv[1]) ? sarg(ctx, argv, argc, 1) : xstrdup("");
  char why[160] = "";
  JSValue r = JS_TRUE;
  if (!net_ssid_ok(ssid)) r = fail(ctx, "a network name is 1 to 32 bytes");
  else if (!pw || !net_password_ok(pw)) r = fail(ctx, "a Wi-Fi password is 8 to 63 characters, or 64 hexadecimal digits");
  else if (port_net_join(ssid, pw, why, sizeof why)) r = fail(ctx, "%s", why[0] ? why : "cannot join");
  if (pw) { secret_wipe(pw, strlen(pw)); free(pw); }
  free(ssid);
  return r;
}

// The kernel's log, for the Logs app (claim sys.log): what worlds print can be private, so sys.read is not enough.
static JSValue op_sys_log(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!world_claims(W, "sys.log")) return fail(ctx, "%s has no claim on sys.log", W->name);
  double after = darg(ctx, argv, argc, 0, 0);
  char *j = kernel_log_json(after > 0 && after < 4e9 ? (uint32_t)after : 0);
  charge_json(strlen(j));
  JSValue r = json_value(ctx, j);
  return r;
}
// sys.worlds(fields): every world, or only the comma-separated fields named ("name,state"); "icon", "about" and "key",
// what apps show on the launcher, come only when named
static JSValue op_sys_worlds(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char *fields = sarg(ctx, argv, argc, 0);
  if (!fields) return op_sys_json(ctx, W, "worlds");
  if (!world_claims(W, "sys.read")) { free(fields); return fail(ctx, "%s has no claim on sys.read", W->name); }
  char *j = kernel_worlds_json_fields(fields);
  free(fields);
  charge_json(strlen(j));
  return json_value(ctx, j);
}
static JSValue op_sys_handles(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "handles"); }
static JSValue op_sys_stats(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { (void)argc; (void)argv; return op_sys_json(ctx, W, "stats"); }

static void run_fault(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *T = world_by_id(d->w);
  if (T) kernel_fault(T, d->json);
  free(d->json);
}
static void run_restart(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *T = world_by_id(d->w);
  if (T) kernel_restart_world(T);
}
static JSValue op_sys_admin(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, bool restart) {
  if (!world_claims(W, "sys.admin")) return fail(ctx, "%s has no claim on sys.admin", W->name);
  char *name = sarg(ctx, argv, argc, 0);
  world_t *T = name ? world_by_name(name) : NULL;
  free(name);
  if (!T) return fail(ctx, "there is no such world");
  deferred_t *d = calloc(1, sizeof(*d));
  d->w = T->id;
  if (restart) d->run = run_restart;
  else { char t[96]; snprintf(t, sizeof t, "killed by %s", W->name); d->run = run_fault; d->json = xstrdup(t); }
  defer(d);
  return JS_TRUE;
}
static JSValue op_sys_fault(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { return op_sys_admin(ctx, W, argc, argv, false); }
// Apps from storage (claim sys.spawn). With text, the caller passes the source it read; with a file handle, the
// kernel reads the file the handle names (ka_spawn).
static bool app_name_ok(const char *s) {
  size_t n = s ? strlen(s) : 0;
  if (!n || n > 12) return false;
  for (const char *p = s; *p; p++) if (!((*p >= 'a' && *p <= 'z') || (*p >= '0' && *p <= '9') || *p == '-')) return false;
  return true;
}
static void run_spawn(deferred_t *d, vtime_t at) {
  char why[160];
  if (kernel_spawn(d->json, (const char *)d->bytes, strlen((const char *)d->bytes), ENG_JS, at, why, sizeof why)) klog("cannot start u-%s: %s", d->json, why);
  free(d->json); free(d->bytes);
}
static JSValue op_sys_spawn(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!world_claims(W, "sys.spawn")) return fail(ctx, "%s has no claim on sys.spawn", W->name);
  char *name = sarg(ctx, argv, argc, 0), *src = sarg(ctx, argv, argc, 1);
  JSValue r;
  char wname[NAME_LEN];
  snprintf(wname, sizeof wname, "u-%s", name ? name : "");
  world_t *T = name ? world_by_name(wname) : NULL;
  if (!app_name_ok(name)) r = fail(ctx, "an app's name is 1 to 12 characters: a-z, 0-9 and -");
  else if (!src || !*src) r = fail(ctx, "an app needs its source");
  else if (strlen(src) > USER_SOURCE_MAX) r = fail(ctx, "an app's source is at most %d KB", USER_SOURCE_MAX / 1024);
  else if (T && !T->user) r = fail(ctx, "%s is a system world", wname);
  else if (!T && K.n_worlds >= MAX_WORLDS) r = fail(ctx, "no room for another world (%d at most)", MAX_WORLDS);
  else {
    deferred_t *d = calloc(1, sizeof(*d));
    d->run = run_spawn; d->json = name; d->bytes = (uint8_t *)src; name = src = NULL;
    defer(d);
    r = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, r, "world", JS_NewString(ctx, wname));
  }
  free(name); free(src);
  return r;
}
// __ka("sys.spawn", name, handle): an app from a file the caller holds a handle to, JavaScript or WebAssembly by its
// first bytes. The kernel reads the bytes itself after the segment (fs.c, FS_LOAD), so a binary never passes through
// JavaScript, and kernel_spawn_loaded starts u-<name> and settles the promise with { world, engine }.
JSValue ka_spawn(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p) {
  if (!world_claims(W, "sys.spawn")) return fail(ctx, "%s has no claim on sys.spawn", W->name);
  char *name = sarg(ctx, argv, argc, 0);
  char wname[NAME_LEN];
  snprintf(wname, sizeof wname, "u-%s", name ? name : "");
  world_t *T = name ? world_by_name(wname) : NULL;
  const char *why = !app_name_ok(name) ? "an app's name is 1 to 12 characters: a-z, 0-9 and -"
                  : T && !T->user ? "that name belongs to a system world"
                  : !T && K.n_worlds >= MAX_WORLDS ? "no room for another world" : NULL;
  if (why) { free(name); return fail(ctx, "%s", why); }
  handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 1, 0), H_FS, R_READ);
  if (!h) { free(name); return JS_EXCEPTION; }
  if (!h->file) { free(name); return fail(ctx, "an app is started from a file handle, not a directory"); }
  int id = vm_new_promise(W, p);
  if (id < 0) { free(name); return JS_EXCEPTION; }
  fs_job_t *j = calloc(1, sizeof *j);
  j->op = FS_LOAD;
  j->done = kernel_spawn_loaded;
  snprintf(j->path, sizeof j->path, "%s", h->path);
  snprintf(j->name, sizeof j->name, "%s", name);
  free(name);
  fs_defer(W, j, id);
  return *p;
}
static void run_stop(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *T = world_by_id(d->w);
  if (T) kernel_stop_world(T, d->json);
  free(d->json);
}
static JSValue op_sys_stop(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!world_claims(W, "sys.spawn")) return fail(ctx, "%s has no claim on sys.spawn", W->name);
  char *name = sarg(ctx, argv, argc, 0);
  world_t *T = name ? world_by_name(name) : NULL;
  free(name);
  if (!T || !T->user) return fail(ctx, "only an app from storage can be stopped this way");
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_stop; d->w = T->id; d->json = xstrdup(W->name);
  defer(d);
  return JS_TRUE;
}
static JSValue op_sys_restart(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) { return op_sys_admin(ctx, W, argc, argv, true); }

// One private persistent JSON record per world. Writes are effects: a segment that faults saves
// nothing. store.status() reports the outcome on the next turn, including an NVS/filesystem failure.
static JSValue op_store_load(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)argc; (void)argv;
  size_t n = 0;
  char *j = strlen(W->name) <= 15 ? port_store_get("w", W->name, &n) : NULL;
  if (!j) return JS_NULL;
  if (n > W->store_limit) {
    snprintf(W->vm->store_error, sizeof W->vm->store_error, "saved record exceeds the world's store quota");
    free(j); return JS_NULL;
  }
  charge_json(n);
  JSValue r = JS_NewStringLen(ctx, j, n);
  free(j); return r;
}
static void run_store_save(deferred_t *d, vtime_t at) {
  (void)at;
  world_t *W = world_by_id(d->w);
  if (W && W->vm && W->epoch == d->epoch) {
    bool empty = !strcmp(d->json, "{}");
    int rc = port_store_set("w", W->name, d->json, empty ? 0 : strlen(d->json));
    W->vm->store_pending = false;
    snprintf(W->vm->store_error, sizeof W->vm->store_error, "%s", rc ? "persistent storage write failed" : "");
    if (rc) klog("%s: persistent storage write failed", W->name);
  }
  free(d->json);
}
static JSValue op_store_save(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (strlen(W->name) > 15) return fail(ctx, "a persistent world's name is at most 15 characters");
  char *json = sarg(ctx, argv, argc, 0);
  if (!json) return fail(ctx, "store.save needs a JSON record");
  size_t n = strlen(json);
  if (n > W->store_limit) { free(json); return fail(ctx, "store quota exceeded (%zu bytes)", W->store_limit); }
  charge_json(n);
  W->vm->store_error[0] = 0;
  W->vm->store_pending = true;
  for (deferred_t *d = K.defer_head; d; d = d->next)
    if (d->run == run_store_save && d->w == W->id) { free(d->json); d->json = json; return JS_UNDEFINED; }
  deferred_t *d = calloc(1, sizeof *d);
  if (!d) { free(json); W->vm->store_pending = false; return JS_ThrowOutOfMemory(ctx); }
  d->run = run_store_save; d->w = W->id; d->epoch = W->epoch; d->json = json;
  defer(d); return JS_UNDEFINED;
}
static JSValue op_store_status(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  (void)argc; (void)argv;
  JSValue r = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, r, "pending", JS_NewBool(ctx, W->vm->store_pending));
  JS_SetPropertyStr(ctx, r, "error", JS_NewString(ctx, W->vm->store_error));
  return r;
}

static int agent_ticket(JSContext *ctx, int argc, JSValueConst *argv) {
  double n = 0;
  if (!argc || !JS_IsNumber(argv[0]) || JS_ToFloat64(ctx, &n, argv[0]) || !isfinite(n) || n < 1 || n > INT_MAX || n != (int)n) {
    fail(ctx, "agent ticket must be a positive integer"); return 0;
  }
  return (int)n;
}
static JSValue op_agent_status(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  if (!world_claims(W, "net.agent")) return fail(ctx, "%s has no claim on net.agent", W->name);
  return json_value(ctx, agent_status_json());
}
static JSValue op_agent_start(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  char err[160];
  size_t n = 0;
  const char *body = argc && JS_IsString(argv[0]) ? JS_ToCStringLen(ctx, &n, argv[0]) : NULL;
  int ticket = agent_start(W, body, n, err, sizeof err);
  if (body) JS_FreeCString(ctx, body);
  return ticket < 0 ? fail(ctx, "%s", err) : JS_NewInt32(ctx, ticket);
}
static JSValue op_agent_poll(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  int ticket = agent_ticket(ctx, argc, argv);
  if (!ticket) return JS_EXCEPTION;
  char err[160];
  agent_net_result_t result;
  int rc = agent_poll(W, ticket, &result, err, sizeof err);
  if (rc < 0) return fail(ctx, "%s", err);
  if (!rc) return JS_NULL;
  JSValue r = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, r, "status", JS_NewInt32(ctx, result.status));
  JS_SetPropertyStr(ctx, r, "body", JS_NewString(ctx, result.body ? result.body : ""));
  JS_SetPropertyStr(ctx, r, "error", JS_NewString(ctx, result.error));
  free(result.body);
  return r;
}
static JSValue op_agent_cancel(JSContext *ctx, world_t *W, int argc, JSValueConst *argv) {
  int ticket = agent_ticket(ctx, argc, argv);
  if (!ticket) return JS_EXCEPTION;
  char err[160];
  int rc = agent_cancel(W, ticket, err, sizeof err);
  return rc < 0 ? fail(ctx, "%s", err) : JS_NewBool(ctx, rc);
}

static const vm_op_t SYS_OPS[] = {
  { "sys.worlds", op_sys_worlds }, { "sys.handles", op_sys_handles }, { "sys.stats", op_sys_stats }, { "sys.log", op_sys_log }, { "sys.spawn", op_sys_spawn }, { "sys.stop", op_sys_stop },
  { "net.info", op_net_info }, { "net.scan", op_net_scan }, { "net.scanresult", op_net_scan_result }, { "net.join", op_net_join },
  { "sys.fault", op_sys_fault }, { "sys.restart", op_sys_restart },
  { "store.load", op_store_load }, { "store.save", op_store_save }, { "store.status", op_store_status },
  { "agent.status", op_agent_status }, { "agent.start", op_agent_start }, { "agent.poll", op_agent_poll }, { "agent.cancel", op_agent_cancel },
};

static op_fn find_op(const char *op) {
  for (size_t i = 0; i < VM_N_OPS; i++) if (!strcmp(op, VM_OPS[i].name)) return VM_OPS[i].fn;
  for (size_t i = 0; i < sizeof SYS_OPS / sizeof SYS_OPS[0]; i++) if (!strcmp(op, SYS_OPS[i].name)) return SYS_OPS[i].fn;
  return NULL;
}

JSValue host_k(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__k needs an operation");
  const char *op = JS_ToCString(ctx, argv[0]);
  if (!op) return JS_EXCEPTION;
  op_fn fn = find_op(op);
  if (fn) {
    JS_FreeCString(ctx, op);
    K.seg_cost += 1;   // a host call costs about a microsecond
    return fn(ctx, W, argc - 1, argv + 1);
  }
  JSValue r = fail(ctx, "no such kernel operation: %s", op);
  JS_FreeCString(ctx, op);
  return r;
}


// ---- async operations: each returns a promise the kernel settles later -----------------------------------------
int vm_new_promise(world_t *W, JSValue *out) {
  JSValue f[2];
  JSValue p = JS_NewPromiseCapability(W->vm->ctx, f);
  if (JS_IsException(p)) return -1;
  if (W->vm->n_pend == W->vm->cap_pend) { W->vm->cap_pend = W->vm->cap_pend ? W->vm->cap_pend * 2 : 16; W->vm->pend = realloc(W->vm->pend, sizeof(pending_t) * W->vm->cap_pend); }
  int id = ++K.next_promise;
  W->vm->pend[W->vm->n_pend++] = (pending_t){ id, f[0], f[1] };
  *out = p;
  return id;
}

JSValue host_ka(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__ka needs an operation");
  const char *op = JS_ToCString(ctx, argv[0]);
  if (!op) return JS_EXCEPTION;
  argc--; argv++;
  K.seg_cost += 1;
  JSValue p = JS_UNDEFINED;
  JSValue r = JS_UNDEFINED;
  int id;
  if (!strcmp(op, "sleep")) {
    double ms = darg(ctx, argv, argc, 0, 0);
    if ((id = vm_new_promise(W, &p)) < 0) goto ex;
    defer_settle(W, id, 1, NULL, (vtime_t)(ms * 1000));
    r = p;
  } else if (!strcmp(op, "ask")) {
    char *to = sarg(ctx, argv, argc, 0), *type = sarg(ctx, argv, argc, 1), *json = sarg(ctx, argv, argc, 2);
    int hs[MAX_MSG_HANDLES], nh = argc > 3 ? int_list(ctx, argv[3], hs, MAX_MSG_HANDLES) : 0;
    double timeout = darg(ctx, argv, argc, 4, 2000);
    world_t *T = to ? world_by_name(to) : NULL;
    if (!T) r = fail(ctx, "there is no world called \"%s\"", to ? to : "");
    else if (T == W) r = fail(ctx, "a world cannot ask itself (it would wait for its own turn to end)");
    else if (!check_grants(ctx, W, hs, nh)) r = JS_EXCEPTION;
    else if ((id = vm_new_promise(W, &p)) < 0) r = JS_EXCEPTION;
    else { charge_json(json ? strlen(json) : 0); kernel_ask(W, T, type, json, hs, nh, id, (vtime_t)(timeout * 1000)); r = p; }
    free(to); free(type); free(json);
  } else if (!strcmp(op, "i2c")) {
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_I2C, R_WRITE);
    int wr[32], nwr = h && argc > 1 ? int_list(ctx, argv[1], wr, 32) : 0, nrd = iarg(ctx, argv, argc, 2, 0);
    if (!h) r = JS_EXCEPTION;
    else {
      uint8_t b[32];
      for (int i = 0; i < nwr; i++) b[i] = (uint8_t)wr[i];
      if ((id = vm_new_promise(W, &p)) < 0) goto ex;
      hw_i2c(W, h, b, nwr, nrd, (vtime_t)(darg(ctx, argv, argc, 3, 0) * 1000), id);
      r = p;
    }
  } else if (!strcmp(op, "spi.cmd")) {
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_SPI, R_WRITE);
    int dv[64], n = h && argc > 2 ? int_list(ctx, argv[2], dv, 64) : 0;
    if (!h) r = JS_EXCEPTION;
    else {
      uint8_t b[64];
      for (int i = 0; i < n; i++) b[i] = (uint8_t)dv[i];
      if ((id = vm_new_promise(W, &p)) < 0) goto ex;
      hw_spi_cmd(W, h, iarg(ctx, argv, argc, 1, 0), b, n, id);
      r = p;
    }
  } else if (!strcmp(op, "spi.pixels")) {
    handle_t *h = use(ctx, W, iarg(ctx, argv, argc, 0, 0), H_SPI, R_WRITE);
    handle_t *fb = h ? use(ctx, W, iarg(ctx, argv, argc, 1, 0), H_DMA, R_READ) : NULL;
    if (!h || !fb) r = JS_EXCEPTION;
    else {
      if ((id = vm_new_promise(W, &p)) < 0) goto ex;
      hw_spi_pixels(W, h, fb, iarg(ctx, argv, argc, 2, 0), iarg(ctx, argv, argc, 3, 0), iarg(ctx, argv, argc, 4, 0), iarg(ctx, argv, argc, 5, 0), id);
      r = p;
    }
  } else if (!strcmp(op, "fs")) {
    r = ka_fs(ctx, W, argc, argv, &p);
    if (!JS_IsException(r)) r = p;
  } else if (!strcmp(op, "sys.spawn")) {
    r = ka_spawn(ctx, W, argc, argv, &p);
  } else r = fail(ctx, "no such kernel operation: %s", op);
  JS_FreeCString(ctx, op);
  return r;
ex:
  JS_FreeCString(ctx, op);
  return JS_EXCEPTION;
}


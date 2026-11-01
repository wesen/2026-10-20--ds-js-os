// Native worlds as WebAssembly modules, run by WAMR's fast interpreter (third_party/wamr), on the host and on the P4.
// The isolation is in software, so it is the same on a PC and on a chip without an MMU:
//   - memory: the module addresses only its own linear memory; the interpreter checks every load and store against
//     its size, and the memory may grow only up to the manifest's mem_kb;
//   - calls: the module reaches nothing but its imports, and it may import only these (anything else is refused when
//     it loads, before any of its code runs):
//       nw.call, nw.error             every system call (nat_syscall, numbered as on the wire), and why one failed
//       wasi_snapshot_preview1.fd_*   what a C library's stdio links to; each fails with EBADF, so printf goes nowhere
//       wasi_snapshot_preview1.proc_exit   exit() and abort(): the world crashes
//     WAMR checks each pointer and length the module passes to nw.call against its memory before the call is made;
//   - time: the interpreter counts the instructions the module executes and stops it when the turn budget, converted
//     with PROFILE.wasm_ns_per_op, is spent.
// The module is built with sdk/nw_wasm.c, which provides the nw_* functions over the imports and exports what the
// kernel calls: nw_wasm_init, nw_wasm_buffer (room for an event's strings, which the kernel copies in) and
// nw_wasm_event. A C runtime's _initialize (constructors) runs before nw_wasm_init.
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

#if NUCLEUS_WASM
#include "wasm_export.h"

#define STACK_BYTES (16 * 1024)   // the interpreter's frames and operands for one instance (WAMR's own stack)
#define PAGE (64 * 1024)          // a WebAssembly memory page

typedef struct {
  uint8_t *bytes;                 // a copy of the file: the loaded module refers to it until it is unloaded
  wasm_module_t mod;
  wasm_module_inst_t inst;
  wasm_exec_env_t env;
  wasm_function_inst_t initialize, init, buffer, event;
  int exit_status;                // set by proc_exit
  bool exited;
} wasm_t;

static world_t *running(wasm_exec_env_t env) { return wasm_runtime_get_custom_data(wasm_runtime_get_module_inst(env)); }

// ---- the imports ----------------------------------------------------------------------------------------------
// nw.call(op, a, b, c, s0, n0, s1, n1, s2, n2, out, out_n): the wire's CALL frame as arguments (sdk/nw_wire.h).
// The signature's "*~" pairs make WAMR check that each [pointer, pointer + length) lies in the module's memory and
// pass it here as a host pointer; a pair that does not is an exception in the module, and this is not called.
static int64_t imp_call(wasm_exec_env_t env, int32_t op, int32_t a, int32_t b, int64_t c,
                        const char *s0, uint32_t n0, const char *s1, uint32_t n1, const char *s2, uint32_t n2,
                        char *out, uint32_t out_n) {
  world_t *W = running(env);
  if (n0 > NW_STR_MAX || n1 > NW_STR_MAX || n2 > NW_STR_MAX) {
    snprintf(W->nat->err, sizeof W->nat->err, "a string is longer than %d bytes", NW_STR_MAX);
    return -1;
  }
  nw_call_t k = { .op = op, .i = { a, b, (int32_t)c }, .v = c, .s = { s0, s1, s2 }, .n = { n0, n1, n2 } };
  static char text[NW_OUT_MAX];   // as the process backend does: the call writes here, the module gets what fits
  text[0] = 0;
  int64_t r = nat_syscall(W, &k, text, sizeof text);
  if (r >= 0 && out_n) {
    size_t t = strlen(text), m = t < out_n - 1 ? t : out_n - 1;
    memcpy(out, text, m);
    out[m] = 0;
  }
  return r;
}

// nw.error(buf, n): why the world's last system call failed
static int32_t imp_error(wasm_exec_env_t env, char *buf, uint32_t n) {
  world_t *W = running(env);
  if (!n) return 0;
  size_t t = strlen(W->nat->err), m = t < n - 1 ? t : n - 1;
  memcpy(buf, W->nat->err, m);
  buf[m] = 0;
  return (int32_t)m;
}

// What a C library links to for stdio. There are no files: each fails as a closed descriptor would.
#define EBADF_WASI 8
static int32_t wasi_fd1(wasm_exec_env_t env, int32_t fd) { return EBADF_WASI; }
static int32_t wasi_fd2(wasm_exec_env_t env, int32_t fd, int32_t a) { return EBADF_WASI; }
static int32_t wasi_fd4(wasm_exec_env_t env, int32_t fd, int32_t a, int32_t b, int32_t c) { return EBADF_WASI; }
static int32_t wasi_seek(wasm_exec_env_t env, int32_t fd, int64_t off, int32_t whence, int32_t to) { return EBADF_WASI; }
static void wasi_exit(wasm_exec_env_t env, int32_t status) {
  wasm_module_inst_t inst = wasm_runtime_get_module_inst(env);
  wasm_t *m = running(env)->nat->inst;
  m->exited = true; m->exit_status = status;
  wasm_runtime_set_exception(inst, "proc_exit");   // unwinds the module; wasm_event reports the status
}

static NativeSymbol NW_IMPORTS[] = {
  { "call", imp_call, "(iiiI*~*~*~*~)I", NULL },
  { "error", imp_error, "(*~)i", NULL },
};
static NativeSymbol WASI_IMPORTS[] = {
  { "fd_close", wasi_fd1, "(i)i", NULL },
  { "fd_fdstat_get", wasi_fd2, "(ii)i", NULL },
  { "fd_write", wasi_fd4, "(iiii)i", NULL },
  { "fd_read", wasi_fd4, "(iiii)i", NULL },
  { "fd_seek", wasi_seek, "(iIii)i", NULL },
  { "proc_exit", wasi_exit, "(i)", NULL },
};

static bool runtime_ready(char *why, size_t n) {
  static bool ready;
  if (ready) return true;
  if (!wasm_runtime_init()) { snprintf(why, n, "the WebAssembly runtime could not start"); return false; }
  wasm_runtime_set_log_level(WASM_LOG_LEVEL_FATAL);   // its errors come back to us as text; nothing on stdout
  if (!wasm_runtime_register_natives("nw", NW_IMPORTS, sizeof NW_IMPORTS / sizeof *NW_IMPORTS) ||
      !wasm_runtime_register_natives("wasi_snapshot_preview1", WASI_IMPORTS, sizeof WASI_IMPORTS / sizeof *WASI_IMPORTS)) {
    snprintf(why, n, "the WebAssembly imports could not be registered");
    return false;
  }
  ready = true;
  return true;
}

// ---- the backend ------------------------------------------------------------------------------------------------
static void wasm_unload(world_t *W) {
  wasm_t *m = W->nat->inst;
  if (!m) return;
  if (m->env) wasm_runtime_destroy_exec_env(m->env);
  if (m->inst) wasm_runtime_deinstantiate(m->inst);
  if (m->mod) wasm_runtime_unload(m->mod);
  free(m->bytes);
  free(m);
  W->nat->inst = NULL;
}

static const char *kind_name(wasm_import_export_kind_t k) {
  return k == WASM_IMPORT_EXPORT_KIND_FUNC ? "function" : k == WASM_IMPORT_EXPORT_KIND_TABLE ? "table"
       : k == WASM_IMPORT_EXPORT_KIND_MEMORY ? "memory" : "global";
}

static void mem_used(world_t *W, wasm_t *m) {
  wasm_memory_inst_t mem = wasm_runtime_get_default_memory(m->inst);
  uint64_t pages = mem ? wasm_memory_get_cur_page_count(mem) : 0;
  W->mem_used = (size_t)(pages * (mem ? wasm_memory_get_bytes_per_page(mem) : PAGE)) + STACK_BYTES;
}

static int wasm_load(world_t *W, char *why, size_t n) {
  if (W->source_len < 8 || memcmp(W->source, "\0asm", 4)) { snprintf(why, n, "%s is not a WebAssembly module (no \\0asm header)", W->file); return -1; }
  if (!runtime_ready(why, n)) return -1;
  wasm_t *m = calloc(1, sizeof *m);
  if (!m || !(m->bytes = malloc(W->source_len))) { free(m); snprintf(why, n, "out of memory"); return -1; }
  W->nat->inst = m;
  memcpy(m->bytes, W->source, W->source_len);
  char err[128] = "";
  m->mod = wasm_runtime_load(m->bytes, (uint32_t)W->source_len, err, sizeof err);
  if (!m->mod) { snprintf(why, n, "%s is not a valid WebAssembly module: %s", W->file, err); goto fail; }
  // Everything it imports must be ours, or it does not run at all
  for (int32_t i = 0, k = wasm_runtime_get_import_count(m->mod); i < k; i++) {
    wasm_import_t im;
    wasm_runtime_get_import_type(m->mod, i, &im);
    if (im.kind != WASM_IMPORT_EXPORT_KIND_FUNC || !im.linked) {
      snprintf(why, n, "it imports the %s %s.%s, which picocalc-os does not provide", kind_name(im.kind), im.module_name, im.name);
      goto fail;
    }
  }
  uint32_t max_pages = (uint32_t)(W->mem_limit / PAGE);
  InstantiationArgs args = { .default_stack_size = STACK_BYTES, .host_managed_heap_size = 0, .max_memory_pages = max_pages ? max_pages : 1 };
  m->inst = wasm_runtime_instantiate_ex(m->mod, &args, err, sizeof err);
  if (!m->inst) { snprintf(why, n, "it could not be instantiated: %s", err); goto fail; }
  wasm_memory_inst_t mem = wasm_runtime_get_default_memory(m->inst);
  if (mem && wasm_memory_get_cur_page_count(mem) * wasm_memory_get_bytes_per_page(mem) > W->mem_limit) {
    snprintf(why, n, "it starts with %llu KB of memory, more than the %zu KB its manifest entry gives it",
             (unsigned long long)(wasm_memory_get_cur_page_count(mem) * wasm_memory_get_bytes_per_page(mem) / 1024), W->mem_limit / 1024);
    goto fail;
  }
  wasm_runtime_set_custom_data(m->inst, W);
  m->env = wasm_runtime_create_exec_env(m->inst, STACK_BYTES);
  if (!m->env) { snprintf(why, n, "out of memory"); goto fail; }
  m->initialize = wasm_runtime_lookup_function(m->inst, "_initialize");
  m->init = wasm_runtime_lookup_function(m->inst, "nw_wasm_init");
  m->buffer = wasm_runtime_lookup_function(m->inst, "nw_wasm_buffer");
  m->event = wasm_runtime_lookup_function(m->inst, "nw_wasm_event");
  if (!m->init || !m->buffer || !m->event) {
    snprintf(why, n, "it does not export %s (link it with sdk/nw_wasm.c)", !m->init ? "nw_wasm_init" : !m->buffer ? "nw_wasm_buffer" : "nw_wasm_event");
    goto fail;
  }
  mem_used(W, m);
  return 0;
fail:
  wasm_unload(W);
  return -1;
}

static int wasm_event(world_t *W, const nw_event_t *e) {
  wasm_t *m = W->nat->inst;
  double limit_d = (double)W->nat->budget_us * 1000.0 / PROFILE.wasm_ns_per_op;
  int limit = limit_d > INT_MAX ? INT_MAX : limit_d < 1 ? 1 : (int)limit_d;
  wasm_runtime_set_instruction_count_limit(m->env, limit);   // what is left carries over from one call to the next
  bool ok;
  uint32_t argv[7];
  if (e->kind == NW_INIT) {
    ok = (!m->initialize || wasm_runtime_call_wasm(m->env, m->initialize, 0, argv)) && wasm_runtime_call_wasm(m->env, m->init, 0, argv);
    argv[0] = NW_DONE;
  } else {
    // the event's strings, each with a NUL after it, in room the module gives us
    size_t total = e->type_len + e->json_len + e->from_len + 3;
    argv[0] = (uint32_t)total;
    ok = wasm_runtime_call_wasm(m->env, m->buffer, 1, argv);
    if (ok) {
      uint64_t at = argv[0];
      if (!at || !wasm_runtime_validate_app_addr(m->inst, at, total)) {
        W->oom = true;   // its allocator had no room: the world has spent its memory
        K.seg_cost += (vtime_t)((limit - wasm_runtime_get_instruction_count_limit(m->env)) * PROFILE.wasm_ns_per_op / 1000.0);
        return -1;
      }
      char *p = wasm_runtime_addr_app_to_native(m->inst, at);
      memcpy(p, e->type, e->type_len); p += e->type_len; *p++ = 0;
      memcpy(p, e->json, e->json_len); p += e->json_len; *p++ = 0;
      memcpy(p, e->from, e->from_len); p += e->from_len; *p = 0;
      uint32_t args[7] = { (uint32_t)e->kind, (uint32_t)(e->kind == NW_SETTLE ? e->ok : e->ask), (uint32_t)e->timer,
                           (uint32_t)e->token, (uint32_t)e->type_len, (uint32_t)e->json_len, (uint32_t)e->from_len };
      memcpy(argv, args, sizeof args);
      ok = wasm_runtime_call_wasm(m->env, m->event, 7, argv);
    }
  }
  int left = wasm_runtime_get_instruction_count_limit(m->env);
  K.seg_cost += (vtime_t)((double)(limit - (left > 0 ? left : 0)) * PROFILE.wasm_ns_per_op / 1000.0);   // ignored on the real clock
  if (!ok) {
    const char *x = wasm_runtime_get_exception(m->inst);
    if (x && !strncmp(x, "Exception: ", 11)) x += 11;
    if (m->exited) snprintf(W->last_error, sizeof W->last_error, "it exited with status %d", m->exit_status);
    else if (x && strstr(x, "instruction limit exceeded")) W->overrun = true;
    else snprintf(W->last_error, sizeof W->last_error, "it trapped: %s", x ? x : "an exception");
    wasm_runtime_clear_exception(m->inst);
    return -1;
  }
  mem_used(W, m);
  int r = (int)argv[0];
  if (r != NW_DONE && r != NW_LATER) { snprintf(W->last_error, sizeof W->last_error, "it broke the native protocol (an end of %d)", r); return -1; }
  return r;
}

static const native_backend_t WASM = { "wasm", wasm_load, wasm_event, wasm_unload };
const native_backend_t *wasm_backend(void) { return &WASM; }

#else
const native_backend_t *wasm_backend(void) { return NULL; }   // built without WAMR
#endif

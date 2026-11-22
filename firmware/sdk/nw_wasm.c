// The runtime of a native world compiled to WebAssembly. picocalc-os runs the module in WAMR's interpreter
// (nucleus/native_wasm.c), which confines it to its own linear memory and lets it import two functions from "nw":
// call, every system call with the arguments of the wire's CALL frame (nw_wire.h), and error, why the last one
// failed. The kernel calls three exports: nw_wasm_init, nw_wasm_buffer (room in this module's memory for an event's
// strings, which the kernel copies in) and nw_wasm_event. Build it into the module, as a reactor (no main):
//   clang --target=wasm32-wasi -mexec-model=reactor -Isdk -o mod.wasm mod.c sdk/nw_wasm.c   (see the Makefile)
#include <stdlib.h>
#include <string.h>
#include "nw.h"
#include "nw_wire.h"

#define IMPORT(name) __attribute__((import_module("nw"), import_name(name)))
#define EXPORT(name) __attribute__((export_name(name)))

IMPORT("call") int64_t nw_wasm_call(int32_t op, int32_t a, int32_t b, int64_t c, const char *s0, size_t n0,
                                    const char *s1, size_t n1, const char *s2, size_t n2, char *out, size_t out_n);
IMPORT("error") int32_t nw_wasm_error(char *buf, size_t n);

static char last_err[256];

static int64_t call(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
                    const char *s2, size_t n2, char *out, int out_n) {
  int64_t r = nw_wasm_call(op, a, b, c, s0, n0, s1, n1, s2, n2, out, out_n > 0 ? (size_t)out_n : 0);
  if (r < 0) nw_wasm_error(last_err, sizeof last_err);
  return r;
}

#include "nw_calls.inc"

// The current event's strings: type, json and from, each followed by a NUL. The kernel asks for room before each
// event and writes them here; they stay put while the handler runs (no system call writes to this buffer).
static char *ev;
static size_t ev_cap;

EXPORT("nw_wasm_buffer") char *nw_wasm_buffer(size_t n) {
  if (n > ev_cap) {
    free(ev);
    ev = malloc(n);
    ev_cap = ev ? n : 0;
  }
  return ev;   // NULL: no memory left; the kernel then stops the world as out of memory
}

EXPORT("nw_wasm_init") void nw_wasm_init(void) { nw_init(); }

EXPORT("nw_wasm_event") int nw_wasm_event(int kind, int second, int timer, int token, size_t n0, size_t n1, size_t n2) {
  nw_event e = { 0 };
  e.kind = kind;
  e.type = ev; e.json = ev + n0 + 1; e.json_len = (int)n1; e.from = ev + n0 + 1 + n1 + 1;
  e.ask = kind == NW_MESSAGE ? second : 0;
  e.ok = kind == NW_SETTLE ? second : 0;
  e.timer = timer;
  e.token = token;
  return nw_on_event(&e) == NW_LATER ? NW_LATER : NW_DONE;
}

// Ubuntu 24.04's libc++ for wasm32 is built with exceptions and its libc++abi without them, so operator new refers
// to an exception runtime that is not there. A module is built with -fno-exceptions and could not catch
// std::bad_alloc anyway: running out of memory in operator new traps, and the world crashes. Weak, so a toolchain
// that does have these keeps its own.
__attribute__((weak)) void *__cxa_allocate_exception(size_t n) { __builtin_trap(); }
__attribute__((weak)) void __cxa_throw(void *e, void *type, void (*dtor)(void *)) { __builtin_trap(); }

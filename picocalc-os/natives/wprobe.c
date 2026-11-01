// wprobe: a WebAssembly world that tries to leave its sandbox, for tests/test_native_worlds.py (the counterpart of
// probe.c, which tries it as a process). Its name picks the attempt (wprobe_oob, wprobe_badptr, ...); it logs what it
// is about to do, then does it. Each attempt must stop the module with a trap, an exit or the budget, except alloc
// and stdio, which must fail inside it while the world carries on.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nw.h"

// The raw import behind every nw_* call, to hand the kernel pointers that nw.h's functions never would
__attribute__((import_module("nw"), import_name("call")))
int64_t nw_wasm_call(int32_t op, int32_t a, int32_t b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
                     const char *s2, size_t n2, char *out, size_t out_n);

void nw_init(void) {}

static volatile int depth_sink, forever = 1;
static int recurse(int n) { volatile char pad[256]; pad[0] = (char)n; return forever ? recurse(n + 1) + pad[0] : 0; }

static void attempt(const char *what) {
  char line[96];
  snprintf(line, sizeof line, "TEST probe %s", what);
  nw_log(line);
  if (!strcmp(what, "oob")) {   // a load past the end of linear memory
    depth_sink = *(volatile int *)(uintptr_t)0xfffffff0u;
  } else if (!strcmp(what, "badptr")) {   // a system call given a string outside its memory
    nw_wasm_call(1, 0, 0, 0, (const char *)(uintptr_t)0xffff0000u, 64, NULL, 0, NULL, 0, NULL, 0);
  } else if (!strcmp(what, "badlen")) {   // a string that starts inside its memory and runs past the end
    nw_wasm_call(1, 0, 0, 0, "x", 0x7fffffff, NULL, 0, NULL, 0, NULL, 0);
  } else if (!strcmp(what, "badout")) {   // a result buffer outside its memory
    nw_wasm_call(3, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, (char *)(uintptr_t)0xfffff000u, 4096);
  } else if (!strcmp(what, "stack")) {   // unbounded recursion: the shadow stack comes first, so it runs off address 0
    depth_sink = recurse(0);
  } else if (!strcmp(what, "trap")) {
    __builtin_trap();
  } else if (!strcmp(what, "exit")) {
    exit(3);
  } else if (!strcmp(what, "spin")) {
    for (volatile unsigned i = 0;; i++) {}
  } else if (!strcmp(what, "alloc")) {   // more than the manifest's mem_kb: malloc must fail, not grow the memory
    void *volatile p = malloc((size_t)64 << 20);   // volatile: clang would drop an unused malloc and call it a success
    snprintf(line, sizeof line, "TEST alloc %s", p ? "succeeded" : "failed");
    nw_log(line);
    free(p);
    return;
  } else if (!strcmp(what, "stdio")) {   // printf and a write to standard error fail quietly
    int r = printf("into nowhere\n");
    fflush(stdout);
    snprintf(line, sizeof line, "TEST stdio fputs=%d", fputs("x", stderr));
    nw_log(line);
    (void)r;
    return;
  }
  nw_log("TEST probe survived");
}

int nw_on_event(const nw_event *e) {
  if (e->kind != NW_START) return NW_DONE;
  char me[32];
  nw_self(me, sizeof me);
  attempt(strncmp(me, "wprobe_", 7) ? me : me + 7);
  return NW_DONE;
}

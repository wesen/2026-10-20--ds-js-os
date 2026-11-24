// The heap of a compile runtime (typed_p4.c runs the Typed compiler in a fresh QuickJS runtime per compile), and the
// record of where one compile's time went, printed after it as one TYPEDCOMPILE line (PICOCALC-COMPILER-DEVICE-COST,
// PICOCALC-COMPILE-CACHE). typed_compile_heap.c has the allocator and the printing.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "p4.h"
#include "quickjs.h"

typedef struct {
  size_t live, peak, limit;
  vtime_t deadline;
  unsigned over_limit, no_psram;   // refused allocations: past the heap cap, or PSRAM had no block
  // The calls this compile made to the port's heap (QuickJS's arenas and large blocks) and the CPU cycles inside them.
  uint32_t mallocs, frees, reallocs;
  uint64_t heap_cycles;
} compile_heap;

// Each compiler source a compile evaluated (from the bytecode cache or parsed, with the time to load the bytecode and
// to run the source's top level), the call to the linker's entry (front end, back end and link; a pass group the back
// end loads is an evaluation inside it), the runtime's teardown, and the calls to the port's heap with the time spent
// in them.
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

// JS_NewRuntime2(&compiler_allocator, heap): the compile's heap, capped at heap->limit, with QuickJS's malloc_size kept
// (so the cycle collector runs).
extern const JSMallocFunctions compiler_allocator;
// JS_SetInterruptHandler(rt, compile_interrupt, heap): stops the compile at heap->deadline.
int compile_interrupt(JSRuntime *rt, void *opaque);
// Why a failed compile had no memory: the heap cap, PSRAM, or neither (a compile error, the deadline).
void compile_heap_print_refusals(const char *app, const compile_heap *heap);
// The TYPEDCOMPILE line.
void compile_state_print(const char *app, const compile_state *state);

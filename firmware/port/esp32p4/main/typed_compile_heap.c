// The heap of a compile runtime and the TYPEDCOMPILE record (typed_compile_heap.h).
#include "typed_compile_heap.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "esp_heap_caps.h"
#include "esp_cpu.h"
#include "sdkconfig.h"

// QuickJS keeps small objects in 4 KB arenas that it takes from the embedder, and returns an arena the moment its last
// object is freed. A size class whose use swings across an arena boundary therefore takes and returns the same 4 KB
// again and again: 2,100 to 5,100 arenas in one boot compile on the host, a number that moves with whatever else the
// realm holds (PICOCALC-COMPILER-DEVICE-COST). On the P4 each is a TLSF allocation and free in PSRAM. A compile parks
// up to ARENA_PARKED freed arena-sized blocks and hands them out again; a parked block stays counted as live (so the
// peak counts what the compile holds) and the runtime's teardown frees them.
#define ARENA_MIN 3584
#define ARENA_BLOCK 4096

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
  bool arena = size >= ARENA_MIN && size <= ARENA_BLOCK;
  if (arena && heap->parked_count) {
    heap->reused++;
    return heap->parked[--heap->parked_count];
  }
  if (arena) size = ARENA_BLOCK;  // every arena-sized block can serve every arena-sized request
  if (heap->live >= heap->limit || size > heap->limit - heap->live) { heap->over_limit++; return NULL; }
  if (!psram_spare(heap, size)) return NULL;
  uint32_t begun = esp_cpu_get_cycle_count();
  void *ptr = port_heap_malloc(size);
  if (ptr) account(state, 0, port_heap_usable(ptr));
  else heap->no_psram++;
  heap->mallocs++;
  heap->heap_cycles += (uint32_t)(esp_cpu_get_cycle_count() - begun);
  return ptr;
}

static void compile_free(JSMallocState *state, void *ptr) {
  if (!ptr) return;
  compile_heap *heap = state->opaque;
  uint32_t begun = esp_cpu_get_cycle_count();
  size_t usable = port_heap_usable(ptr);
  if (usable >= ARENA_BLOCK && usable < ARENA_BLOCK + 64 && heap->parked_count < ARENA_PARKED) {
    heap->parked[heap->parked_count++] = ptr;  // stays counted as live
    heap->heap_cycles += (uint32_t)(esp_cpu_get_cycle_count() - begun);
    return;
  }
  account(state, usable, 0);
  port_heap_free(ptr);
  heap->frees++;
  heap->heap_cycles += (uint32_t)(esp_cpu_get_cycle_count() - begun);
}

static void *compile_realloc(JSMallocState *state, void *ptr, size_t size) {
  if (!ptr) return compile_malloc(state, size);
  if (!size) { compile_free(state, ptr); return NULL; }
  compile_heap *heap = state->opaque;
  uint32_t begun = esp_cpu_get_cycle_count();
  size_t old = port_heap_usable(ptr);
  size_t retained = heap->live - old;
  if (retained >= heap->limit || size > heap->limit - retained) { heap->over_limit++; return NULL; }
  if (size > old && !psram_spare(heap, size)) return NULL;
  void *next = port_heap_realloc(ptr, size);
  if (next) account(state, old, port_heap_usable(next));
  else heap->no_psram++;
  heap->reallocs++;
  heap->heap_cycles += (uint32_t)(esp_cpu_get_cycle_count() - begun);
  return next;
}

const JSMallocFunctions compiler_allocator = {
  compile_malloc, compile_free, compile_realloc, port_heap_usable,
};

int compile_interrupt(JSRuntime *rt, void *opaque) {
  compile_heap *heap = opaque;
  return port_clock() >= heap->deadline;
}

void compile_heap_release(compile_heap *heap) {
  while (heap->parked_count) {   // the parked arenas: freed after the runtime, counted until now
    void *block = heap->parked[--heap->parked_count];
    heap->live -= port_heap_usable(block);
    port_heap_free(block);
  }
}

void compile_heap_print_refusals(const char *app, const compile_heap *heap) {
  printf("%s compile refused_over_limit=%u refused_no_psram=%u heap_limit=%zu psram_free=%zu psram_largest=%zu\n", app,
         heap->over_limit, heap->no_psram, heap->limit, heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
         heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM));
}

void compile_state_print(const char *app, const compile_state *state) {
  // One write for the whole line. Printed piece by piece (and a stdout buffer flushes a long line in pieces anyway),
  // another task's console reply landed inside it: a health check's `painter` record, which the board harness then
  // could not find. A write to the console is one locked transfer.
  enum { LINE = 320 + 160 * (int)(sizeof state->eval / sizeof *state->eval) };
  char *line = malloc(LINE);
  if (!line) return;
  const compile_heap *heap = &state->heap;
  int n = snprintf(line, LINE, "TYPEDCOMPILE {\"app\":\"%s\",\"beforeUs\":%lld,\"setupUs\":%lld,\"callUs\":%lld,"
                   "\"freeUs\":%lld,\"heap\":{\"mallocs\":%lu,\"frees\":%lu,\"reallocs\":%lu,\"reused\":%lu,\"us\":%llu},"
                   "\"evals\":[",
                   app, (long long)state->before_us, (long long)state->setup_us, (long long)state->call_us,
                   (long long)state->free_us, (unsigned long)heap->mallocs, (unsigned long)heap->frees,
                   (unsigned long)heap->reallocs, (unsigned long)heap->reused,
                   (unsigned long long)(heap->heap_cycles / CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ));
  for (int i = 0; i < state->evals && n > 0 && n < LINE; i++) {
    const compile_eval *e = &state->eval[i];
    n += snprintf(line + n, LINE - n,
                  "%s{\"path\":\"%s\",\"bytecode\":\"%s\",\"inCall\":%s,\"loadUs\":%lld,\"runUs\":%lld,\"liveBytes\":%zu}",
                  i ? "," : "", e->path, e->parsed ? "parsed" : "cached", e->in_call ? "true" : "false",
                  (long long)e->load_us, (long long)e->run_us, e->live);
  }
  if (n > 0 && n + 3 < LINE) {
    memcpy(line + n, "]}\n", 3);
    fflush(stdout);
    write(fileno(stdout), line, n + 3);
  }
  free(line);
}

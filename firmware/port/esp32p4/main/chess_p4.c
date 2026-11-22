#include <stdio.h>
#include <stdlib.h>

#include "p4.h"

char *p4_chess_compile(size_t *length) {
  // With the 3D painter, "default" compiles Chess in 4.66 s on the P4, "balanced" in 3.76 s
  // (PICOCALC-COMPILE-BUDGET Step 6); loop versioning saves the engine only 0.45%.
  static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000,
                                           .policy = "balanced"};
  vtime_t started = port_clock();
  size_t source_length = 0, reactor_length = 0;
  char *source = p4_bundle_read("chess/chess.typed", &source_length, NULL, 0);
  char *reactor = p4_bundle_read("chess/reactor.bin", &reactor_length, NULL, 0);
  char *module = NULL;
#if PICOCALC_RV32_CHESS
  const int engine = ENG_NATIVE;
  const char *entry = "compileTypedWorldRv32";
#else
  const int engine = ENG_WASM;
  const char *entry = "compileTypedWorld";
#endif
  if (source && reactor) {
    module = p4_typed_compile("chess", "bundle", source, source_length, "typed/world.js",
                             entry, engine, reactor, reactor_length, length, started, &limits);
  } else {
    puts("chess compile: source or reactor unavailable");
  }
  free(reactor);
  free(source);
  return module;
}

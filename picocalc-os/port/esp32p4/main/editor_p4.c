#include <stdio.h>
#include <stdlib.h>

#include "p4.h"

char *p4_editor_compile(size_t *length) {
  static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000};
  vtime_t started = port_clock();
  size_t source_length = 0, reactor_length = 0;
  char *source = p4_bundle_read("editor/editor.typed", &source_length, NULL, 0);
  char *reactor = p4_bundle_read("editor/reactor.bin", &reactor_length, NULL, 0);
  char *module = NULL;
#if PICOCALC_RV32_EDITOR
  const int engine = ENG_NATIVE;
  const char *entry = "compileTypedWorldRv32";
#else
  const int engine = ENG_WASM;
  const char *entry = "compileTypedWorld";
#endif
  if (source && reactor) {
    module = p4_typed_compile("editor", "bundle", source, source_length, "typed/world.js",
                             entry, engine, reactor, reactor_length, length, started, &limits);
  } else {
    puts("editor compile: source or reactor unavailable");
  }
  free(reactor);
  free(source);
  return module;
}

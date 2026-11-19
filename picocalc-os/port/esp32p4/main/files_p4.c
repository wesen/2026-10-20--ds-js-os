#include <stdio.h>
#include <stdlib.h>

#include "p4.h"

char *p4_files_compile(size_t *length) {
  vtime_t started = port_clock();
  size_t source_length = 0, reactor_length = 0;
  char *source = p4_bundle_read("files/files.typed", &source_length, NULL, 0);
  char *reactor = p4_bundle_read("files/reactor.bin", &reactor_length, NULL, 0);
  char *module = NULL;
#if PICOCALC_RV32_FILES
  const int engine = ENG_NATIVE;
  const char *entry = "compileFilesRv32";
#else
  const int engine = ENG_WASM;
  const char *entry = "compileFiles";
#endif
  if (source && reactor) {
    module = p4_typed_compile("files", "bundle", source, source_length, "files/compile.js",
                              entry, engine, reactor, reactor_length, length, started);
  } else {
    puts("files compile: source or reactor unavailable");
  }
  free(reactor);
  free(source);
  return module;
}

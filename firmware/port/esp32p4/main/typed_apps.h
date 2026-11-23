// The Typed apps of this firmware: one row per app.json (apps/typed/NAME/app.json), generated into the build
// directory's typed_apps.c by typed_apps.py. typed_p4.c compiles every app from its row.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
  const char *name;            // "hand"
  const char *source;          // its assembled source in the bundle
} p4_typed_variant;

typedef struct {
  const char *name;            // the app ("chess"), or an app's delivered unit ("chess/painter")
  bool world;                  // a boot world: the kernel reads NAME/compiled.bin, and this compiles it
  const char *source;          // the assembled source in the bundle (NULL when the app has variants)
  const char *link;            // the linker's bundle path, evaluated after the compiler
  const char *entry;           // the linker's global function: entry(source, reactor, options) -> image
  const char *const *compiler; // compiler modules beyond typed/wasm.js and typed/rv32.js, NULL-terminated
  const char *reactor;         // the reactor or slot ELF in the bundle
  const char *policy;          // a named RV32 policy (typed-rv32.js POLICIES), or NULL for the default
  size_t heap_bytes;           // the compiler's heap cap
  int64_t deadline_us;         // the compile is interrupted after this long
  const p4_typed_variant *variants;
  int n_variants;
  const char *edit_file;       // editable: a file under the store that replaces one source
  const char *edit_head;       // the assembled sources before the editable one
  const char *edit_tail;       // the assembled sources after it
  size_t edit_limit;
} p4_typed_app;

extern const p4_typed_app p4_typed_apps[];
extern const size_t p4_typed_app_count;

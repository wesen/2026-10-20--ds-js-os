// wimport: a WebAssembly module that imports a function picocalc-os does not provide (as a module would that wants
// to open files through WASI), for tests/test_native_worlds.py. The kernel must refuse it before any of its code runs.
#include "nw.h"

__attribute__((import_module("wasi_snapshot_preview1"), import_name("path_open")))
int path_open(int fd, int flags, const char *path, int path_len, int oflags, long long rights, long long inherit,
              int fdflags, int *opened);

void nw_init(void) { nw_log("TEST wimport ran"); }

int nw_on_event(const nw_event *e) {
  int fd;
  if (e->kind == NW_START) path_open(3, 0, "/etc/hostname", 13, 0, 0, 0, 0, &fd);
  return NW_DONE;
}

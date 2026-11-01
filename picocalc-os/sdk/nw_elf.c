// The runtime of a native world built as machine code for a board (an ELF module; on the ESP32-P4 the backend is
// port/esp32p4/optional/native_elf). The kernel and the module call each other through two tables (nw_elf.h); this
// file fills in the module's and provides the nw_* functions over the kernel's. Build the module as a position-
// independent shared object with no C runtime (port/esp32p4/main/CMakeLists.txt does, for the P4):
//   riscv32-esp-elf-gcc -march=rv32imafc_zicsr_zifencei -mabi=ilp32f -Os -fPIC -shared -nostartfiles -nostdlib
//       -e app_main -Wl,-z,max-page-size=16 -Isdk -o mod.elf mod.c sdk/nw_elf.c
// The C library functions a module may call are the board's own, resolved when it loads; the backend lists them.
// Nothing runs static constructors, so a module is C (or C++ without global objects).
#include <string.h>
#include "nw.h"
#include "nw_wire.h"
#include "nw_elf.h"

static const nw_elf_kernel *kernel;
static char last_err[256];

static int64_t call(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
                    const char *s2, size_t n2, char *out, int out_n) {
  int64_t r = kernel->call(op, a, b, c, s0, n0, s1, n1, s2, n2, out, out_n > 0 ? (size_t)out_n : 0);
  if (r < 0) kernel->error(last_err, sizeof last_err);
  return r;
}

#include "nw_calls.inc"

static void init(void) { nw_init(); }

static int event(int kind, int second, int timer, int token, const char *type, const char *json, int json_len, const char *from) {
  nw_event e = { 0 };
  e.kind = kind;
  e.type = type; e.json = json; e.json_len = json_len; e.from = from;
  e.ask = kind == NW_MESSAGE ? second : 0;
  e.ok = kind == NW_SETTLE ? second : 0;
  e.timer = timer;
  e.token = token;
  return nw_on_event(&e) == NW_LATER ? NW_LATER : NW_DONE;
}

// The entry, called once by the loader after relocation (nw_elf.h).
int app_main(int argc, char *argv[]) {
  if (argc < 2) return -1;
  kernel = (const nw_elf_kernel *)(void *)argv[0];
  nw_elf_module *m = (nw_elf_module *)(void *)argv[1];
  m->init = init;
  m->event = event;
  m->abi = NW_ELF_ABI;
  return 0;
}

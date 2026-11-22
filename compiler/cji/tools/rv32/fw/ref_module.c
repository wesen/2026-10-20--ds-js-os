/* CJI-4: a native world written in C and built the way picocalc-os builds its natives (clang and
 * ld.lld in place of riscv32-esp-elf-gcc; tools/rv32/nw-test.sh), with sdk/nw_elf.c as its entry: a
 * module from another producer, to check bench/emu/emu.c's loader and the fake kernel's tables against
 * the board's own module side. Expected output: tools/rv32/fw/ref_module.out. */
#include "nw.h"
static int count;
void nw_init(void) { nw_kind("service"); nw_log("hello"); }
int nw_on_event(const nw_event *e) { count++; if (e->kind == NW_MESSAGE && e->ask) nw_reply("{\"n\":1}"); return NW_DONE; }

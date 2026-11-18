/* Chapter 29: slas-rv32 is slas built on the host with SLJIT's RISC-V 32-bit backend. The code it
   generates never runs here: it goes into an object. SLJIT keeps code addresses in 32-bit words on
   that target, so its "executable" buffer must lie below 4 GB (runtime/rv32.c allocates it). */
#include <stddef.h>
void *rv32_low_exec(unsigned long size);
#define SLJIT_MALLOC_EXEC(size, data) rv32_low_exec(size)
#define SLJIT_FREE_EXEC(ptr, data) ((void)(ptr))

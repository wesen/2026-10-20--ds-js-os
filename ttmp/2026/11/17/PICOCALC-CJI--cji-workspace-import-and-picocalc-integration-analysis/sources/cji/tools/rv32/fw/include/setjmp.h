/* CJI-4: setjmp and longjmp for the rv32 test firmware (hostcalls.S): the glue (runtime/cji_elf.c)
   comes back through them from a fatal error in a world. On the board they are newlib's. */
#pragma once
typedef unsigned long jmp_buf[14];   /* ra, sp, s0..s11 */
int setjmp(jmp_buf b);
_Noreturn void longjmp(jmp_buf b, int v);

/* Chapter 29: the library calls of the rv32 test firmware that the machine answers (bench/emu/emu.c,
   hostcall): a7 is the call's number, the arguments and results are where the calling convention
   puts them. On the board these are the firmware's own: newlib, libgcc's soft-float helpers. */
	.text
.macro HC name num
	.globl \name
	.type \name, @function
\name:
	li a7, \num
	ecall
	ret
.endm
/* (CJI-4: the soft-float and 64-bit integer helpers, and floor, ceil, trunc, round and fabs, are weak: a firmware linked
   with tools/rv32/fw/softfloat.o runs them as code instead, as the board does) */
.macro HCW name num
	.weak \name
	.type \name, @function
\name:
	li a7, \num
	ecall
	ret
.endm
	HC _hc_exit, 1
	HC _hc_write, 2
	HC _hc_vsnprintf, 3
	HC strtod, 4
	HC clock_gettime, 5
	HC localtime_r, 6
	HC malloc, 7
	HC free, 8
	HC realloc, 9
	HC _hc_steps, 10
	HC _hc_watch, 11
	HC _hc_watched, 12
	HC _hc_load, 13
	HC _hc_save, 14
	HC _hc_mem, 15
	HC sin, 20
	HC cos, 21
	HC tan, 22
	HC asin, 23
	HC acos, 24
	HC atan, 25
	HC sinh, 26
	HC cosh, 27
	HC tanh, 28
	HC asinh, 29
	HC acosh, 30
	HC atanh, 31
	HC exp, 32
	HC log, 33
	HC log10, 34
	HC log2, 35
	HCW floor, 36
	HC sqrt, 37
	HCW ceil, 38
	HCW trunc, 39
	HC atan2, 40
	HC fmod, 41
	HC pow, 42
	HC hypot, 43
	HC nextafter, 44
	HCW round, 45
	HC cbrt, 46
	HCW fabs, 47
	HCW __adddf3, 50
	HCW __subdf3, 51
	HCW __muldf3, 52
	HCW __divdf3, 53
	HCW __negdf2, 54
	HCW __eqdf2, 55
	HCW __nedf2, 55
	HCW __ltdf2, 56
	HCW __ledf2, 56
	HCW __gtdf2, 57
	HCW __gedf2, 57
	HCW __unorddf2, 58
	HCW __floatsidf, 59
	HCW __floatunsidf, 60
	HCW __floatdidf, 61
	HCW __floatundidf, 62
	HCW __fixdfsi, 63
	HCW __fixunsdfsi, 64
	HCW __fixdfdi, 65
	HCW __fixunsdfdi, 66
	HCW __extendsfdf2, 67
	HCW __truncdfsf2, 68
	HCW __unordsf2, 69
	HCW __divdi3, 70
	HCW __udivdi3, 71
	HCW __moddi3, 72
	HCW __umoddi3, 73
	HCW __muldi3, 74
	HCW __ashldi3, 75
	HCW __lshrdi3, 76
	HCW __ashrdi3, 77

/* CJI-4: setjmp and longjmp (the C library has none): ra, sp and s0..s11 */
	.globl setjmp
	.type setjmp, @function
setjmp:
	sw ra, 0(a0)
	sw sp, 4(a0)
	sw s0, 8(a0)
	sw s1, 12(a0)
	sw s2, 16(a0)
	sw s3, 20(a0)
	sw s4, 24(a0)
	sw s5, 28(a0)
	sw s6, 32(a0)
	sw s7, 36(a0)
	sw s8, 40(a0)
	sw s9, 44(a0)
	sw s10, 48(a0)
	sw s11, 52(a0)
	li a0, 0
	ret
	.globl longjmp
	.type longjmp, @function
longjmp:
	lw ra, 0(a0)
	lw sp, 4(a0)
	lw s0, 8(a0)
	lw s1, 12(a0)
	lw s2, 16(a0)
	lw s3, 20(a0)
	lw s4, 24(a0)
	lw s5, 28(a0)
	lw s6, 32(a0)
	lw s7, 36(a0)
	lw s8, 40(a0)
	lw s9, 44(a0)
	lw s10, 48(a0)
	lw s11, 52(a0)
	mv a0, a1
	bnez a0, 1f
	li a0, 1
1:	ret

	.globl _start
	.type _start, @function
_start:                 /* the machine sets sp, a0 = argc, a1 = argv */
	call main
	li a7, 1
	ecall

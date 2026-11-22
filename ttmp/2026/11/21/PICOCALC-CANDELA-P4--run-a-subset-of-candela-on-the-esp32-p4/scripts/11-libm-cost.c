/* 11-libm-cost.c: instructions per call of the single-precision libm functions Candela's kernel uses,
 * in newlib as linked for rv32imafc/ilp32f (the ESP32-P4 firmware's multilib). Built by
 * 10-numeric-bench.sh with -DFN=k; -DFN=0 is the baseline (the loop and the inputs only).
 * Arguments cover the ranges the kernel passes: cosHemi's cos(2 pi u), Perez's exp of negative
 * arguments, hash13's sin of a large dot product, acos of a cosine, atan2 of a direction. */
#include <stdint.h>
#ifndef FN
#define FN 0
#endif
#define N 4000
static float in1[N], in2[N], out[N];
static uint32_t seed = 777u;
static float u01(void) { seed = seed * 1664525u + 1013904223u; return (seed >> 8) * (1.0f / 16777216.0f); }
int main(void);
__attribute__((naked, section(".text.start"))) void _start(void) { asm volatile("call main\n li a7, 93\n ecall\n"); }
int main(void) {
	for (int i = 0; i < N; i++) { in1[i] = u01(); in2[i] = u01(); }
	for (int i = 0; i < N; i++) {
		float a = in1[i], b = in2[i], r = 0;
		(void)b;
#if FN == 0
		r = a + b;                                         /* baseline: inputs live, one addition */
#elif FN == 1
		r = __builtin_expf(-8.0f * a);                     /* Perez: exp(B / cos theta), exp(D gamma) */
#elif FN == 2
		r = __builtin_logf(0.001f + a);                    /* free-flight sampling: -log(1 - u) */
#elif FN == 3
		r = __builtin_powf(0.001f + a, 0.4166667f + b);    /* sheen, layer tint, sRGB */
#elif FN == 4
		r = __builtin_cosf(6.2831853f * a);                /* cosHemi, uniform cone: cos(2 pi u) */
#elif FN == 5
		r = __builtin_sinf(6.2831853f * a);
#elif FN == 6
		r = __builtin_sinf(4000.0f * a + 300.0f * b);      /* hash13: sin(dot(p, (12.99, 78.23, 37.72))) */
#elif FN == 7
		r = __builtin_acosf(2.0f * a - 1.0f);              /* sky: angle between view and sun */
#elif FN == 8
		r = __builtin_atan2f(2.0f * a - 1.0f, 2.0f * b - 1.0f);   /* sphere uv */
#elif FN == 9
		r = __builtin_floorf(64.0f * a - 32.0f);           /* fract, checker, noise lattice */
#elif FN == 10
		r = __builtin_sqrtf(a);                            /* an RV32F instruction with -fno-math-errno */
#elif FN == 11
		r = __builtin_tanf(1.4f * a - 0.7f);               /* equi-angular sampling */
#endif
		out[i] = r;
	}
	register long a0 asm("a0") = 1, a1 asm("a1") = (long)out, a2 asm("a2") = sizeof out, a7 asm("a7") = 64;
	asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
	return 0;
}

/* 09-numeric-bench.c: the same Candela kernel math in several numeric models, for instruction counts on
 * RV32 (06-rv32imfc-count) and accuracy on the host. Built and run by 10-numeric-bench.sh.
 *
 * Kernels (from src/kernel.js):
 *   SPHERE  hitObj's object-space ray/sphere test: three dot products, a discriminant, sqrt, divisions
 *   GGX     evalLobe's microfacet term for a reflect-only coat: normalize(wo + wi), ggxD, two
 *           ggxLambda (each a sqrt and a division), D * G / (4 cos)
 *   NORM    safeNorm: length and a reciprocal
 * Arms (-DARM=...):
 *   0 REF      double precision (host only): the reference for accuracy
 *   1 F32      single-precision floats; with -march=rv32imafc these are RV32F instructions (what an
 *              f32 type in Typed, or a C kernel, executes)
 *   2 SOFT     the same source for rv32imc: libgcc's soft-float routines (f32 with no FPU)
 *   3 Q16      Q16.16 fixed point with 64-bit products and quotients (C's int64_t on RV32)
 *   4 Q16T     Q16.16 restricted to 32-bit operations, as Typed's i32 can express it today: products of
 *              pre-shifted operands, 32-bit division of pre-shifted operands, a Newton square root
 *   5 VM       an interpreter in C for a three-address register bytecode with vec3 and scalar f32
 *              registers, one instruction per Candela fx node (the "interpret the IR in firmware" option)
 * Inputs are generated and converted to the arm's representation before the measured loop; results are
 * written as raw 32-bit words (64-bit for REF), so no conversion is counted. -DBASELINE skips the kernel. */
#include <stdint.h>
#ifndef ARM
#define ARM 1
#endif
#ifndef KERN
#define KERN 1
#endif
#ifndef N
#define N 2000
#endif
#define SPHERE 1
#define GGX 2
#define NORM 3

static uint32_t seed = 12345u;
static double u01(void) { seed = seed * 1664525u + 1013904223u; return (seed >> 8) * (1.0 / 16777216.0); }
/* unit vectors from the LCG with polynomial cos/sin (identical on every target) */
static double cosp(double x) { double y = x * x, r = 1, t = 1; for (int k = 1; k < 14; k++) { t *= -y / ((2 * k - 1) * (2 * k)); r += t; } return r; }
static double sqrtd(double x) { if (x <= 0) return 0; double g = x > 1 ? x : 1; for (int k = 0; k < 60; k++) g = 0.5 * (g + x / g); return g; }
static void unit(double *w, int upper) {
	double z = upper ? 0.05 + 0.95 * u01() : 2 * u01() - 1, ph = 6.283185307179586 * u01() - 3.141592653589793, r = sqrtd(1 - z * z);
	w[0] = r * cosp(ph); w[1] = r * cosp(ph - 1.5707963267948966); w[2] = z;
}
static double din[N][11];   /* o[3] d[3] r wo[3] alpha; NORM normalizes o */
static void gen(void) {
	for (int i = 0; i < N; i++) {
		double *p = din[i];
		for (int k = 0; k < 3; k++) p[k] = 16 * u01() - 8;           /* origin: a camera metres from a sphere */
		p[6] = 0.3 + 1.7 * u01();                                     /* radius */
		double j[3]; unit(j, 0);                                      /* aim near the sphere: about half hit */
		double t[3] = {-p[0] + 1.6 * p[6] * j[0], -p[1] + 1.6 * p[6] * j[1], -p[2] + 1.6 * p[6] * j[2]};
		double l = sqrtd(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]); for (int k = 0; k < 3; k++) p[3 + k] = t[k] / l;
		unit(p + 7, 1); double a = u01(); p[10] = 0.05 + 0.95 * a * a;  /* wo; alpha = roughness^2 */
	}
}
static double wiv[N][3];                                              /* wi, generated after all rows */
static void gen_wi(void) { for (int i = 0; i < N; i++) unit(wiv[i], 1); }

#if ARM == 0 || ARM == 1 || ARM == 2 || ARM == 5
#if ARM == 0
typedef double f;
#define SQ(x) sqrtd(x)
#define C(x) x
#else
typedef float f;
#define SQ(x) __builtin_sqrtf(x)
#define C(x) x##f
#endif
static f I[N][14];
static void convert(void) { for (int i = 0; i < N; i++) { for (int k = 0; k < 11; k++) I[i][k] = (f)din[i][k]; for (int k = 0; k < 3; k++) I[i][11 + k] = (f)wiv[i][k]; } }
#endif

#if ARM == 0 || ARM == 1 || ARM == 2
static f sphere(const f *o, const f *d, f r) {
	f a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
	f disc = b * b - a * c; if (disc < 0) return C(1e30);
	f s = SQ(disc), t = (-b - s) / a; if (t < C(0.0002)) t = (-b + s) / a; if (t < C(0.0002)) return C(1e30); return t;
}
static f lambda(const f *w, f al) { f t = al * al * (w[0] * w[0] + w[1] * w[1]) / (w[2] * w[2]); return (C(-1.0) + SQ(C(1.0) + t)) * C(0.5); }
static f ggx(const f *wo, const f *wi, f al) {
	f h[3] = {wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]}; f l = SQ(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]);
	h[0] /= l; h[1] /= l; h[2] /= l;
	f x = h[0] / al, y = h[1] / al, k = x * x + y * y + h[2] * h[2];
	f D = C(1.0) / (C(3.14159265) * al * al * k * k);
	f G = C(1.0) / (C(1.0) + lambda(wo, al) + lambda(wi, al));
	return D * G / (C(4.0) * wo[2]);
}
static f norm3(const f *v) { f l = SQ(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); f k = l > C(1e-20) ? C(1.0) / l : C(0.0); return v[0] * k + C(2.0) * v[1] * k + C(4.0) * v[2] * k; }
static f run1(int i) {
	const f *p = I[i];
#if KERN == SPHERE
	return sphere(p, p + 3, p[6]);
#elif KERN == GGX
	return ggx(p + 7, p + 11, p[10]);
#else
	return norm3(p);
#endif
}
#elif ARM == 3 || ARM == 4
typedef int32_t q;
typedef q f;
#define ONE 65536
static q I[N][14];
static q toq(double x) { double s = x * ONE; return s >= 2147483647.0 ? 2147483647 : s <= -2147483648.0 ? (q)0x80000000 : (q)s; }
static void convert(void) { for (int i = 0; i < N; i++) { for (int k = 0; k < 11; k++) I[i][k] = toq(din[i][k]); for (int k = 0; k < 3; k++) I[i][11 + k] = toq(wiv[i][k]); } }
#if ARM == 3
static q qmul(q a, q b) { return (q)(((int64_t)a * b) >> 16); }
static q qdiv(q a, q b) { if (!b) return a < 0 ? (q)0x80000001 : 0x7fffffff; int64_t r = ((int64_t)a << 16) / b; return r > 0x7fffffff ? 0x7fffffff : r < -0x7fffffff ? -0x7fffffff : (q)r; }
static q qsqrt(q x) {            /* digit-by-digit square root of the 64-bit radicand x << 16 */
	if (x <= 0) return 0;
	uint64_t r = (uint64_t)x << 16, res = 0, bit = (uint64_t)1 << 46;
	while (bit > r) bit >>= 2;
	while (bit) { if (r >= res + bit) { r -= res + bit; res = (res >> 1) + bit; } else res >>= 1; bit >>= 2; }
	return (q)res;
}
#else
static q qmul(q a, q b) { return (a >> 8) * (b >> 8); }
static q qdiv(q a, q b) {
	if (!b) return a < 0 ? (q)0x80000001 : 0x7fffffff;
	int s = 16; q aa = a; while (s > 0 && (aa > 0x7fff || aa < -0x7fff)) { aa >>= 1; s--; }   /* keep aa << s in range */
	q bb = b >> (16 - s); if (!bb) bb = b < 0 ? -1 : 1;
	return (aa << s) / bb;
}
static q qsqrt(q x) {
	if (x <= 0) return 0;
	q g = ONE; while (g < 0x40000000 && qmul(g, g) < x) g <<= 1;   /* g*g >= x */
	for (int k = 0; k < 6; k++) g = (g + qdiv(x, g)) >> 1;
	return g;
}
#endif
static q sphere(const q *o, const q *d, q r) {
	q a = qmul(d[0], d[0]) + qmul(d[1], d[1]) + qmul(d[2], d[2]);
	q b = qmul(o[0], d[0]) + qmul(o[1], d[1]) + qmul(o[2], d[2]);
	q c = qmul(o[0], o[0]) + qmul(o[1], o[1]) + qmul(o[2], o[2]) - qmul(r, r);
	q disc = qmul(b, b) - qmul(a, c); if (disc < 0) return 0x7fffffff;
	q s = qsqrt(disc), t = qdiv(-b - s, a); if (t < 13) t = qdiv(-b + s, a); if (t < 13) return 0x7fffffff; return t;
}
static q lambda(const q *w, q al) { q t = qdiv(qmul(qmul(al, al), qmul(w[0], w[0]) + qmul(w[1], w[1])), qmul(w[2], w[2])); return (qsqrt(ONE + t) - ONE) >> 1; }
static q ggx(const q *wo, const q *wi, q al) {
	q h[3] = {wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]}; q l = qsqrt(qmul(h[0], h[0]) + qmul(h[1], h[1]) + qmul(h[2], h[2]));
	for (int k = 0; k < 3; k++) h[k] = qdiv(h[k], l);
	q x = qdiv(h[0], al), y = qdiv(h[1], al), k = qmul(x, x) + qmul(y, y) + qmul(h[2], h[2]);
	q D = qdiv(ONE, qmul(qmul(qmul(205887, al), al), qmul(k, k)));   /* 205887 = pi in Q16.16 */
	q G = qdiv(ONE, ONE + lambda(wo, al) + lambda(wi, al));
	return qdiv(qmul(D, G), 4 * wo[2]);
}
static q norm3(const q *v) { q l = qsqrt(qmul(v[0], v[0]) + qmul(v[1], v[1]) + qmul(v[2], v[2])); if (!l) return 0; return qdiv(v[0], l) + 2 * qdiv(v[1], l) + 4 * qdiv(v[2], l); }
static q run1(int i) {
	const q *p = I[i];
#if KERN == SPHERE
	return sphere(p, p + 3, p[6]);
#elif KERN == GGX
	return ggx(p + 7, p + 11, p[10]);
#else
	return norm3(p);
#endif
}
#endif

#if ARM == 5
enum { HALT, LD3, LD1, K1, COMP, ADD3, NORM3, DOT3, ADD, SUB, MUL, DIV, SQRT, NEG, LTSEL, RETLT, VSUM, EXPORT };
typedef struct { uint8_t op, d, a, b; } ins;
static f s[32], v3[16][3], kon[8];
static const f *arg;
static f vm(const ins *p) {
	for (;; p++) switch (p->op) {
	case LD3: v3[p->d][0] = arg[p->a]; v3[p->d][1] = arg[p->a + 1]; v3[p->d][2] = arg[p->a + 2]; break;
	case LD1: s[p->d] = arg[p->a]; break;
	case K1: s[p->d] = kon[p->a]; break;
	case COMP: s[p->d] = v3[p->a][p->b]; break;
	case ADD3: for (int k = 0; k < 3; k++) v3[p->d][k] = v3[p->a][k] + v3[p->b][k]; break;
	case NORM3: { f l = __builtin_sqrtf(v3[p->a][0] * v3[p->a][0] + v3[p->a][1] * v3[p->a][1] + v3[p->a][2] * v3[p->a][2]); f k1 = l > 1e-20f ? 1.0f / l : 0.0f; for (int k = 0; k < 3; k++) v3[p->d][k] = v3[p->a][k] * k1; break; }
	case DOT3: s[p->d] = v3[p->a][0] * v3[p->b][0] + v3[p->a][1] * v3[p->b][1] + v3[p->a][2] * v3[p->b][2]; break;
	case ADD: s[p->d] = s[p->a] + s[p->b]; break;
	case SUB: s[p->d] = s[p->a] - s[p->b]; break;
	case MUL: s[p->d] = s[p->a] * s[p->b]; break;
	case DIV: s[p->d] = s[p->a] / s[p->b]; break;
	case SQRT: s[p->d] = __builtin_sqrtf(s[p->a]); break;
	case NEG: s[p->d] = -s[p->a]; break;
	case LTSEL: s[p->d] = s[p->a] < kon[0] ? s[p->b] : s[p->a]; break;   /* t < eps ? alternative : t */
	case RETLT: if (s[p->a] < kon[p->b]) return 1e30f; break;             /* a miss */
	case VSUM: s[p->d] = v3[p->a][0] + 2.0f * v3[p->a][1] + 4.0f * v3[p->a][2]; break;
	case EXPORT: return s[p->d];
	default: return 0;
	}
}
/* each kernel's fx DAG, one instruction per node, as a lowering of Candela's Gen could emit it;
   constants: kon[0] = EPS, kon[1] = pi, kon[2] = 1, kon[3] = 0.5, kon[4] = 4, kon[5] = 0 */
static const ins P_SPHERE[] = {
	{LD3, 0, 0, 0}, {LD3, 1, 3, 0}, {LD1, 0, 6, 0}, {DOT3, 1, 1, 1}, {DOT3, 2, 0, 1}, {DOT3, 3, 0, 0}, {MUL, 4, 0, 0}, {SUB, 3, 3, 4},
	{MUL, 5, 2, 2}, {MUL, 6, 1, 3}, {SUB, 7, 5, 6}, {RETLT, 0, 7, 5}, {SQRT, 8, 7, 0}, {NEG, 9, 2, 0}, {SUB, 10, 9, 8}, {DIV, 10, 10, 1},
	{ADD, 11, 9, 8}, {DIV, 11, 11, 1}, {LTSEL, 12, 10, 11}, {RETLT, 0, 12, 0}, {EXPORT, 12, 0, 0}};
static const ins P_GGX[] = {
	{LD3, 0, 7, 0}, {LD3, 1, 11, 0}, {LD1, 0, 10, 0}, {ADD3, 2, 0, 1}, {NORM3, 2, 2, 0}, {COMP, 1, 2, 2}, {MUL, 2, 1, 1}, {K1, 6, 2, 0},
	{SUB, 3, 6, 2}, {MUL, 4, 0, 0}, {DIV, 5, 3, 4}, {ADD, 5, 5, 2}, {MUL, 5, 5, 5}, {MUL, 7, 4, 5}, {K1, 9, 1, 0}, {MUL, 7, 7, 9},
	{DIV, 7, 6, 7},                                                                                                           /* D */
	{COMP, 10, 0, 2}, {MUL, 11, 10, 10}, {SUB, 12, 6, 11}, {MUL, 12, 12, 4}, {DIV, 12, 12, 11}, {ADD, 12, 6, 12}, {SQRT, 12, 12, 0},
	{SUB, 12, 12, 6}, {K1, 13, 3, 0}, {MUL, 12, 12, 13},                                                                      /* lambda(wo) */
	{COMP, 14, 1, 2}, {MUL, 15, 14, 14}, {SUB, 16, 6, 15}, {MUL, 16, 16, 4}, {DIV, 16, 16, 15}, {ADD, 16, 6, 16}, {SQRT, 16, 16, 0},
	{SUB, 16, 16, 6}, {MUL, 16, 16, 13},                                                                                      /* lambda(wi) */
	{ADD, 17, 6, 12}, {ADD, 17, 17, 16}, {DIV, 17, 6, 17}, {MUL, 18, 7, 17}, {K1, 19, 4, 0}, {MUL, 20, 19, 10}, {DIV, 18, 18, 20},
	{EXPORT, 18, 0, 0}};
static const ins P_NORM[] = {{LD3, 0, 0, 0}, {NORM3, 1, 0, 0}, {VSUM, 0, 1, 0}, {EXPORT, 0, 0, 0}};
static f run1(int i) {
	arg = I[i]; kon[0] = 0.0002f; kon[1] = 3.14159265f; kon[2] = 1.0f; kon[3] = 0.5f; kon[4] = 4.0f; kon[5] = 0.0f;
#if KERN == SPHERE
	return vm(P_SPHERE);
#elif KERN == GGX
	return vm(P_GGX);
#else
	return vm(P_NORM);
#endif
}
#endif

static f out[N];
#ifdef __riscv
static void emit(const void *p, unsigned n) {
	register long a0 asm("a0") = 1, a1 asm("a1") = (long)p, a2 asm("a2") = n, a7 asm("a7") = 64;
	asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}
int main(void);
__attribute__((naked, section(".text.start"))) void _start(void) { asm volatile("call main\n li a7, 93\n ecall\n"); }
#else
#include <stdio.h>
static void emit(const void *p, unsigned n) { fwrite(p, 1, n, stdout); }
#endif
int main(void) {
	gen(); gen_wi(); convert();
#ifndef BASELINE
	for (int i = 0; i < N; i++) out[i] = run1(i);
#else
	for (int i = 0; i < N; i++) out[i] = I[i][0];   /* keep the inputs live, so only the kernel is subtracted */
#endif
	emit(out, sizeof out);
	return 0;
}

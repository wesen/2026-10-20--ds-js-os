/* rv32emu: RV32F on binary32 bit patterns, the same algorithm as pkg/tracerv32/fpu.go (uint64 significands with a
 * sticky bit) and the semantics of the reference interpreter and the ESP32-P4 (bench/reference/rv32): the canonical
 * NaN for every NaN result, tininess after rounding, saturating conversions that raise NV alone. Every operation
 * ORs the flags it raises into fcsr. */
#include "machine.h"

uint32_t f[32], fcsr;

enum { NX = 1, UF = 2, OF = 4, DZ = 8, NV = 16 };
#define NAN32 0x7fc00000u
#define SIGN 0x80000000u
#define INF 0x7f800000u

static int is_nan(uint32_t b) { return (b & 0x7fffffff) > INF; }
static int is_snan(uint32_t b) { return is_nan(b) && !(b & 0x400000); }
static int is_inf(uint32_t b) { return (b & 0x7fffffff) == INF; }
static int is_zero(uint32_t b) { return (b & 0x7fffffff) == 0; }
static int len64(uint64_t v) { return v ? 64 - __builtin_clzll(v) : 0; }
static uint32_t signed0(int neg) { return neg ? SIGN : 0; }
static uint32_t invalid(void) { fcsr |= NV; return NAN32; }
static uint32_t nan_of(uint32_t a, uint32_t b, uint32_t c)
{
	if (is_snan(a) || is_snan(b) || is_snan(c)) fcsr |= NV;
	return NAN32;
}
static void unpack(uint32_t b, uint64_t *sig, int *exp)
{
	uint32_t e = (b >> 23) & 255;
	*sig = e ? (b & 0x7fffff) | 0x800000 : b & 0x7fffff;
	*exp = e ? (int)e - 150 : -149;
}

/* sig >> shift rounded with rm for a value of the given sign; *inexact when bits were lost */
static uint64_t shift_round(uint32_t sign, uint64_t sig, int shift, uint32_t rm, int *inexact)
{
	uint64_t q = 0, r;
	int above = 0, half = 0, up = 0;
	*inexact = 0;
	if (shift <= 0) return sig << -shift;
	if (shift >= 64) {
		r = sig;
		if (shift == 64) above = sig > 1ull << 63, half = sig == 1ull << 63;
	} else {
		uint64_t h = 1ull << (shift - 1);
		q = sig >> shift, r = sig & ((1ull << shift) - 1);
		above = r > h, half = r == h;
	}
	if (!r) return q;
	*inexact = 1;
	switch (rm) {
	case 0: up = above || (half && (q & 1)); break;
	case 2: up = sign == 1; break;
	case 3: up = sign == 0; break;
	case 4: up = above || half; break;
	}
	return q + (uint64_t)up;
}

/* the binary32 nearest to (-1)^sign * sig * 2^exp under rm */
static uint32_t round_pack(uint32_t sign, uint64_t sig, int exp, uint32_t rm)
{
	int top = exp + len64(sig) - 1, lsb = top - 23, tiny = 0, inexact;
	uint64_t q;
	if (top < -126) {
		tiny = top < -127 || shift_round(sign, sig, lsb - exp, rm, &inexact) < 1u << 24;
		lsb = -149;
	}
	q = shift_round(sign, sig, lsb - exp, rm, &inexact);
	if (inexact) fcsr |= NX | (tiny ? UF : 0);
	if (q == 1u << 24) q >>= 1, lsb++;
	if (q < 0x800000) return sign << 31 | (uint32_t)q;
	if (lsb + 150 >= 255) {
		fcsr |= OF | NX;
		if (rm == 0 || rm == 4 || (rm == 2 && sign) || (rm == 3 && !sign)) return sign << 31 | INF;
		return sign << 31 | 0x7f7fffff;
	}
	return sign << 31 | (uint32_t)(lsb + 150) << 23 | (uint32_t)(q - 0x800000);
}

static void normal(uint64_t *sig, int *exp)
{
	int s = 63 - len64(*sig);
	*sig <<= s;
	*exp -= s;
}

/* (-1)^sa * a * 2^ea + (-1)^sb * b * 2^eb for nonzero a, b of at most 48 significant bits */
static uint32_t sum(uint32_t sa, uint64_t a, int ea, uint32_t sb, uint64_t b, int eb, uint32_t rm)
{
	int d;
	normal(&a, &ea);
	normal(&b, &eb);
	if (ea < eb || (ea == eb && a < b)) {
		uint32_t ts = sa; uint64_t t = a; int te = ea;
		sa = sb, a = b, ea = eb, sb = ts, b = t, eb = te;
	}
	d = ea - eb;
	if (d >= 64) b = 1;
	else if (d > 0) b = b >> d | ((b & ((1ull << d) - 1)) != 0);
	if (sa == sb) return round_pack(sa, a + b, ea, rm);
	if (a == b) return signed0(rm == 2);
	return round_pack(sa, a - b, ea, rm);
}

static uint32_t f32_add(uint32_t a, uint32_t b, uint32_t rm)
{
	uint64_t sa, sb;
	int ea, eb;
	if (is_nan(a) || is_nan(b)) return nan_of(a, b, 0);
	if (is_inf(a)) return is_inf(b) && ((a ^ b) & SIGN) ? invalid() : a;
	if (is_inf(b)) return b;
	if (is_zero(a) && is_zero(b)) return (a & b & SIGN) ? SIGN : ((a | b) & SIGN) ? signed0(rm == 2) : 0;
	if (is_zero(a)) return b;
	if (is_zero(b)) return a;
	unpack(a, &sa, &ea);
	unpack(b, &sb, &eb);
	return sum(a >> 31, sa, ea, b >> 31, sb, eb, rm);
}

static uint32_t f32_mul(uint32_t a, uint32_t b, uint32_t rm)
{
	uint32_t sign = (a ^ b) >> 31;
	uint64_t sa, sb;
	int ea, eb;
	if (is_nan(a) || is_nan(b)) return nan_of(a, b, 0);
	if (is_inf(a) || is_inf(b)) return is_zero(a) || is_zero(b) ? invalid() : sign << 31 | INF;
	if (is_zero(a) || is_zero(b)) return sign << 31;
	unpack(a, &sa, &ea);
	unpack(b, &sb, &eb);
	return round_pack(sign, sa * sb, ea + eb, rm);
}

static uint32_t f32_div(uint32_t a, uint32_t b, uint32_t rm)
{
	uint32_t sign = (a ^ b) >> 31;
	uint64_t sa, sb, q;
	int ea, eb;
	if (is_nan(a) || is_nan(b)) return nan_of(a, b, 0);
	if (is_inf(a)) return is_inf(b) ? invalid() : sign << 31 | INF;
	if (is_inf(b)) return sign << 31;
	if (is_zero(b)) {
		if (is_zero(a)) return invalid();
		fcsr |= DZ;
		return sign << 31 | INF;
	}
	if (is_zero(a)) return sign << 31;
	unpack(a, &sa, &ea);
	unpack(b, &sb, &eb);
	normal(&sa, &ea);
	q = sa / sb;
	if (sa % sb) q |= 1;
	return round_pack(sign, q, ea - eb, rm);
}

static uint32_t f32_sqrt(uint32_t a, uint32_t rm)
{
	uint64_t s, r;
	int e;
	if (is_nan(a)) return nan_of(a, 0, 0);
	if (is_zero(a)) return a;
	if (a & SIGN) return invalid();
	if (is_inf(a)) return a;
	unpack(a, &s, &e);
	normal(&s, &e);
	if (e & 1) s >>= 1, e++;
	r = (uint64_t)sqrt((double)s);
	while (r * r > s) r--;
	while ((r + 1) * (r + 1) <= s) r++;
	if (r * r != s) r = r << 1 | 1, e -= 2;
	return round_pack(0, r, e / 2, rm);
}

/* (-1)^negp * a * b + (-1)^negc * c, rounded once */
static uint32_t f32_fma(uint32_t a, uint32_t b, uint32_t c, uint32_t negp, uint32_t negc, uint32_t rm)
{
	uint32_t signp;
	uint64_t sa, sb, sc;
	int ea, eb, ec;
	if (is_nan(a) || is_nan(b)) return nan_of(a, b, c);
	if ((is_inf(a) && is_zero(b)) || (is_zero(a) && is_inf(b))) return invalid();
	if (is_nan(c)) return nan_of(c, 0, 0);
	signp = ((a ^ b) >> 31) ^ negp;
	c ^= negc << 31;
	if (is_inf(a) || is_inf(b)) return is_inf(c) && c >> 31 != signp ? invalid() : signp << 31 | INF;
	if (is_inf(c)) return c;
	if (is_zero(a) || is_zero(b)) {
		if (!is_zero(c)) return c;
		return signp == c >> 31 ? signp << 31 : signed0(rm == 2);
	}
	unpack(a, &sa, &ea);
	unpack(b, &sb, &eb);
	if (is_zero(c)) return round_pack(signp, sa * sb, ea + eb, rm);
	unpack(c, &sc, &ec);
	return sum(signp, sa * sb, ea + eb, c >> 31, sc, ec, rm);
}

static int64_t order(uint32_t b) { return b & SIGN ? -(int64_t)(b & 0x7fffffff) - 1 : (int64_t)b; }
static uint32_t fminmax(uint32_t a, uint32_t b, int max)
{
	if (is_snan(a) || is_snan(b)) fcsr |= NV;
	if (is_nan(a)) return is_nan(b) ? NAN32 : b;
	if (is_nan(b)) return a;
	return (order(a) < order(b)) == max ? b : a;
}

static uint32_t fcompare(uint32_t a, uint32_t b, uint32_t f3)   /* fle (0), flt (1), feq (2) */
{
	float p, q;
	if (is_nan(a) || is_nan(b)) {
		if (f3 != 2 || is_snan(a) || is_snan(b)) fcsr |= NV;
		return 0;
	}
	memcpy(&p, &a, 4);
	memcpy(&q, &b, 4);
	return f3 == 2 ? p == q : f3 == 1 ? p < q : p <= q;
}

static uint32_t fclass(uint32_t a)
{
	uint32_t neg = a >> 31, e = (a >> 23) & 255, m = a & 0x7fffff;
	if (e == 255) return m ? (m & 0x400000 ? 1u << 9 : 1u << 8) : neg ? 1 : 1u << 7;
	if (e == 0) return m ? (neg ? 1u << 2 : 1u << 5) : neg ? 1u << 3 : 1u << 4;
	return neg ? 1u << 1 : 1u << 6;
}

static uint32_t to_int(uint32_t a, uint32_t rm, int unsigned_)
{
	int neg = a >> 31 && !is_nan(a), e, inexact;
	uint64_t s, q;
	int64_t v;
	if (is_nan(a) || is_inf(a)) goto saturate;
	if (is_zero(a)) return 0;
	unpack(a, &s, &e);
	if (e > 8) goto saturate;
	q = shift_round(a >> 31, s, -e, rm, &inexact);
	v = neg ? -(int64_t)q : (int64_t)q;
	if (unsigned_ ? v < 0 || v > 0xffffffffll : v < INT32_MIN || v > INT32_MAX) goto saturate;
	if (inexact) fcsr |= NX;
	return (uint32_t)v;
saturate:
	fcsr |= NV;
	return unsigned_ ? (neg ? 0 : 0xffffffffu) : (neg ? 0x80000000u : 0x7fffffffu);
}

static uint32_t from_int(uint32_t v, uint32_t rm, int unsigned_)
{
	if (!v) return 0;
	if (unsigned_) return round_pack(0, v, 0, rm);
	if ((int32_t)v < 0) return round_pack(1, (uint64_t)-(int64_t)(int32_t)v, 0, rm);
	return round_pack(0, v, 0, rm);
}

/* the rounding mode of an instruction: its rm field, or frm for 7; 5, 6 and an invalid frm are illegal */
static uint32_t rounding(uint32_t i, uint32_t rm)
{
	uint32_t mode = rm == 7 ? fcsr >> 5 : rm;
	if (mode > 4) die("F instruction %#x with rounding mode %u at %#x", i, mode, pc);
	return mode;
}

/* fmadd, fmsub, fnmsub, fnmadd (opcodes 0x43, 0x47, 0x4b, 0x4f) */
void fp_fused(uint32_t i)
{
	uint32_t op = i & 0x7f, rd = (i >> 7) & 31, rs1 = (i >> 15) & 31, rs2 = (i >> 20) & 31;
	if ((i >> 25) & 3) die("F instruction %#x at %#x", i, pc);
	uint32_t rm = rounding(i, (i >> 12) & 7);
	f[rd] = f32_fma(f[rs1], f[rs2], f[i >> 27], op >= 0x4b, op == 0x47 || op == 0x4f, rm);
}

/* OP-FP (opcode 0x53); returns 1 and the value through *v when the result goes to x[rd], 0 when it went to f[rd] */
int fp_op(uint32_t i, uint32_t a, uint32_t *v)
{
	uint32_t rd = (i >> 7) & 31, f3 = (i >> 12) & 7, rs1 = (i >> 15) & 31, rs2 = (i >> 20) & 31, f7 = i >> 25;
	uint32_t p = f[rs1], q = f[rs2];
	switch (f7) {
	case 0x00: f[rd] = f32_add(p, q, rounding(i, f3)); return 0;
	case 0x04: f[rd] = f32_add(p, q ^ SIGN, rounding(i, f3)); return 0;
	case 0x08: f[rd] = f32_mul(p, q, rounding(i, f3)); return 0;
	case 0x0c: f[rd] = f32_div(p, q, rounding(i, f3)); return 0;
	case 0x2c: if (rs2) break; f[rd] = f32_sqrt(p, rounding(i, f3)); return 0;
	case 0x10: if (f3 > 2) break; f[rd] = (p & 0x7fffffff) | ((f3 == 0 ? q : f3 == 1 ? ~q : p ^ q) & SIGN); return 0;
	case 0x14: if (f3 > 1) break; f[rd] = fminmax(p, q, f3 == 1); return 0;
	case 0x60: if (rs2 > 1) break; *v = to_int(p, rounding(i, f3), rs2 == 1); return 1;
	case 0x68: if (rs2 > 1) break; f[rd] = from_int(a, rounding(i, f3), rs2 == 1); return 0;
	case 0x70: if (rs2 || f3 > 1) break; *v = f3 ? fclass(p) : p; return 1;
	case 0x50: if (f3 > 2) break; *v = fcompare(p, q, f3); return 1;
	case 0x78: if (rs2 || f3) break; f[rd] = a; return 0;
	}
	die("F instruction %#x at %#x", i, pc);
}

/* csrrw, csrrs, csrrc and their immediate forms on fflags (1), frm (2) and fcsr (3); returns the old value */
uint32_t fp_csr(uint32_t i, uint32_t a)
{
	uint32_t csr = i >> 20, f3 = (i >> 12) & 7, rs1 = (i >> 15) & 31;
	uint32_t old = csr == 1 ? fcsr & 31 : csr == 2 ? fcsr >> 5 : fcsr, source = f3 & 4 ? rs1 : a;
	if ((f3 & 3) == 1 || rs1) {
		uint32_t value = (f3 & 3) == 1 ? source : (f3 & 3) == 2 ? old | source : old & ~source;
		fcsr = csr == 1 ? (fcsr & 0xe0) | (value & 31) : csr == 2 ? (fcsr & 31) | (value & 7) << 5 : value & 0xff;
	}
	return old;
}

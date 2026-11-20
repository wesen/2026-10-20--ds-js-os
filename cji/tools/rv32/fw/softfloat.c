/* CJI-4 (compiling on the board): the soft-float and 64-bit integer helpers in C, as real RV32 code.
 *
 * The ESP32-P4 has single-precision floating point (F) but not double (D), so on the board every double operation of
 * the runtime and of compiled code is a call to libgcc's helpers (__adddf3 and the rest). The rv32 test firmwares
 * answer those helpers by host call (tools/rv32/fw/hostcalls.S): one instruction each, so the emulator's instruction
 * counts leave their real cost out. A firmware linked with this file runs them as code instead (hostcalls.S's stubs
 * for them are weak), and the counts include them.
 *
 * Doubles are rounded to nearest, ties to even, as libgcc's are; the algorithms are those of Berkeley SoftFloat 3
 * (add, subtract, multiply, round and pack), with a bit-by-bit long division. NaNs follow the host's (x86-64's)
 * rules, so that the emulator gives what the host build gives: an invalid operation makes the default NaN
 * 0xfff8000000000000, and a NaN operand is returned quieted, the first one if both are NaNs; conversions out of range
 * give what the host's conversions give (INT_MIN and the like). (On the board, libgcc's NaN is RISC-V's canonical
 * 0x7ff8000000000000: a program that looked at a NaN's bits could tell.)
 *
 * Checked bit for bit against the host's hardware: ttmp/CJI-4-worlds-on-the-board/scripts/softfloat-test.sh. */
#include <stdint.h>

#ifdef SF_PREFIX   /* (the host test: the same code under other names) */
#define SF(name) sf_##name
#else
#define SF(name) name
#endif

typedef union { double d; uint64_t u; } d64;
typedef union { float f; uint32_t u; } f32;
#define DEFAULT_NAN 0xfff8000000000000ull
#define QUIET 0x0008000000000000ull

static int clz32(uint32_t x)
{
	int n = 0;
	if (!x) return 32;
	if (!(x & 0xffff0000u)) { n += 16; x <<= 16; }
	if (!(x & 0xff000000u)) { n += 8; x <<= 8; }
	if (!(x & 0xf0000000u)) { n += 4; x <<= 4; }
	if (!(x & 0xc0000000u)) { n += 2; x <<= 2; }
	if (!(x & 0x80000000u)) n += 1;
	return n;
}
static int clz64(uint64_t x) { uint32_t hi = (uint32_t)(x >> 32); return hi ? clz32(hi) : 32 + clz32((uint32_t)x); }
static uint64_t jam(uint64_t a, uint32_t dist)   /* shift right, any bit shifted out sets bit 0 */
{
	return !dist ? a : dist < 63 ? a >> dist | ((a << (-dist & 63)) != 0) : (a != 0);
}
static uint64_t pack(int sign, int32_t exp, uint64_t sig) { return ((uint64_t)sign << 63) + ((uint64_t)exp << 52) + sig; }
static int is_nan(uint64_t a) { return (a & 0x7fffffffffffffffull) > 0x7ff0000000000000ull; }
static uint64_t nan2(uint64_t a, uint64_t b) { return is_nan(a) ? a | QUIET : b | QUIET; }

/* sig: the significand with its leading 1 at bit 62 (or less, for a subnormal); exp: the biased exponent less one */
static uint64_t round_pack(int sign, int32_t exp, uint64_t sig)
{
	uint32_t bits = (uint32_t)sig & 0x3ff;
	if ((uint32_t)exp >= 0x7fd) {
		if (exp < 0) {
			sig = jam(sig, (uint32_t)-exp);
			exp = 0;
			bits = (uint32_t)sig & 0x3ff;
		} else if (exp > 0x7fd || sig + 0x200 >= 0x8000000000000000ull)
			return pack(sign, 0x7ff, 0);
	}
	sig = (sig + 0x200) >> 10;
	sig &= ~(uint64_t)(bits == 0x200);   /* a tie: to even */
	if (!sig)
		exp = 0;
	return pack(sign, exp, sig);
}
static uint64_t norm_round_pack(int sign, int32_t exp, uint64_t sig)
{
	int shift = clz64(sig) - 1;
	exp -= shift;
	if (shift >= 10 && (uint32_t)exp < 0x7fd)
		return pack(sign, sig ? exp : 0, sig << (shift - 10));
	return round_pack(sign, exp, sig << shift);
}

static uint64_t add_mags(uint64_t a, uint64_t b, int sign)
{
	int32_t ea = (int32_t)(a >> 52 & 0x7ff), eb = (int32_t)(b >> 52 & 0x7ff), d = ea - eb, ez;
	uint64_t sa = a & 0x000fffffffffffffull, sb = b & 0x000fffffffffffffull, sz;
	if (!d) {
		if (!ea)
			return pack(sign, 0, sa + sb);
		if (ea == 0x7ff)
			return a;
		ez = ea;
		sz = (0x0020000000000000ull + sa + sb) << 9;
		return round_pack(sign, ez, sz);
	}
	sa <<= 9;
	sb <<= 9;
	if (d < 0) {
		if (eb == 0x7ff)
			return pack(sign, 0x7ff, 0);
		ez = eb;
		sa = ea ? sa + 0x2000000000000000ull : sa << 1;
		sa = jam(sa, (uint32_t)-d);
	} else {
		if (ea == 0x7ff)
			return a;
		ez = ea;
		sb = eb ? sb + 0x2000000000000000ull : sb << 1;
		sb = jam(sb, (uint32_t)d);
	}
	sz = 0x2000000000000000ull + sa + sb;
	if (sz < 0x4000000000000000ull) {
		--ez;
		sz <<= 1;
	}
	return round_pack(sign, ez, sz);
}
static uint64_t sub_mags(uint64_t a, uint64_t b, int sign)
{
	int32_t ea = (int32_t)(a >> 52 & 0x7ff), eb = (int32_t)(b >> 52 & 0x7ff), d = ea - eb, ez;
	uint64_t sa = a & 0x000fffffffffffffull, sb = b & 0x000fffffffffffffull, sz;
	if (!d) {
		int64_t diff;
		int shift;
		if (ea == 0x7ff)
			return DEFAULT_NAN;   /* infinity minus infinity */
		diff = (int64_t)(sa - sb);
		if (!diff)
			return 0;   /* x - x is +0 when rounding to nearest */
		if (ea)
			--ea;
		if (diff < 0) {
			sign = !sign;
			diff = -diff;
		}
		shift = clz64((uint64_t)diff) - 11;
		ez = ea - shift;
		if (ez < 0) {
			shift = ea;
			ez = 0;
		}
		return pack(sign, ez, (uint64_t)diff << shift);
	}
	sa <<= 10;
	sb <<= 10;
	if (d < 0) {
		sign = !sign;
		if (eb == 0x7ff)
			return pack(sign, 0x7ff, 0);
		sa += ea ? 0x4000000000000000ull : sa;
		sa = jam(sa, (uint32_t)-d);
		sb |= 0x4000000000000000ull;
		ez = eb;
		sz = sb - sa;
	} else {
		if (ea == 0x7ff)
			return a;
		sb += eb ? 0x4000000000000000ull : sb;
		sb = jam(sb, (uint32_t)d);
		sa |= 0x4000000000000000ull;
		ez = ea;
		sz = sa - sb;
	}
	return norm_round_pack(sign, ez - 1, sz);
}
static uint64_t f64_add(uint64_t a, uint64_t b)
{
	int sa = (int)(a >> 63), sb = (int)(b >> 63);
	if (is_nan(a) || is_nan(b))
		return nan2(a, b);
	return sa == sb ? add_mags(a, b, sa) : sub_mags(a, b, sa);
}
static uint64_t f64_mul(uint64_t a, uint64_t b)
{
	int sign = (int)((a ^ b) >> 63);
	int32_t ea = (int32_t)(a >> 52 & 0x7ff), eb = (int32_t)(b >> 52 & 0x7ff), ez;
	uint64_t sa = a & 0x000fffffffffffffull, sb = b & 0x000fffffffffffffull, sz, hi, lo, a0, a1, b0, b1, mid1, mid2;
	if (is_nan(a) || is_nan(b))
		return nan2(a, b);
	if (ea == 0x7ff)
		return !(eb | sb) ? DEFAULT_NAN : pack(sign, 0x7ff, 0);
	if (eb == 0x7ff)
		return !(ea | sa) ? DEFAULT_NAN : pack(sign, 0x7ff, 0);
	if (!ea) {
		int shift;
		if (!sa)
			return pack(sign, 0, 0);
		shift = clz64(sa) - 11;
		ea = 1 - shift;
		sa <<= shift;
	}
	if (!eb) {
		int shift;
		if (!sb)
			return pack(sign, 0, 0);
		shift = clz64(sb) - 11;
		eb = 1 - shift;
		sb <<= shift;
	}
	ez = ea + eb - 0x3ff;
	sa = (sa | 0x0010000000000000ull) << 10;
	sb = (sb | 0x0010000000000000ull) << 11;
	/* the 128-bit product, from 32-bit halves */
	a0 = (uint32_t)sa; a1 = sa >> 32; b0 = (uint32_t)sb; b1 = sb >> 32;
	lo = a0 * b0;
	mid1 = a1 * b0;
	mid2 = a0 * b1;
	hi = a1 * b1;
	mid1 += mid2;
	hi += (uint64_t)(mid1 < mid2) << 32;
	hi += mid1 >> 32;
	mid1 <<= 32;
	lo += mid1;
	hi += lo < mid1;
	sz = hi | (lo != 0);
	if (sz < 0x4000000000000000ull) {
		--ez;
		sz <<= 1;
	}
	return round_pack(sign, ez, sz);
}
static uint64_t f64_div(uint64_t a, uint64_t b)
{
	int sign = (int)((a ^ b) >> 63);
	int32_t ea = (int32_t)(a >> 52 & 0x7ff), eb = (int32_t)(b >> 52 & 0x7ff), ez;
	uint64_t sa = a & 0x000fffffffffffffull, sb = b & 0x000fffffffffffffull, q = 0, r;
	if (is_nan(a) || is_nan(b))
		return nan2(a, b);
	if (ea == 0x7ff)
		return eb == 0x7ff ? DEFAULT_NAN : pack(sign, 0x7ff, 0);
	if (eb == 0x7ff)
		return pack(sign, 0, 0);
	if (!eb) {
		int shift;
		if (!sb)
			return !(ea | sa) ? DEFAULT_NAN : pack(sign, 0x7ff, 0);
		shift = clz64(sb) - 11;
		eb = 1 - shift;
		sb <<= shift;
	}
	if (!ea) {
		int shift;
		if (!sa)
			return pack(sign, 0, 0);
		shift = clz64(sa) - 11;
		ea = 1 - shift;
		sa <<= shift;
	}
	ez = ea - eb + 0x3fe;
	sa |= 0x0010000000000000ull;
	sb |= 0x0010000000000000ull;
	if (sa < sb) {
		--ez;
		sa <<= 1;
	}
	/* q = floor(sa * 2^62 / sb), one bit at a time: it has its leading 1 at bit 62 */
	r = sa;
	for (int i = 0; i < 63; i++) {
		q <<= 1;
		if (r >= sb) {
			r -= sb;
			q |= 1;
		}
		r <<= 1;
	}
	return round_pack(sign, ez, q | (r != 0));
}
/* -1, 0, 1, or 2 when unordered */
static int f64_cmp(uint64_t a, uint64_t b)
{
	int sa = (int)(a >> 63), sb = (int)(b >> 63);
	if (is_nan(a) || is_nan(b))
		return 2;
	if (!((a | b) << 1))
		return 0;   /* +0 and -0 */
	if (sa != sb)
		return sa ? -1 : 1;
	if (a == b)
		return 0;
	return (a < b) ^ sa ? -1 : 1;
}

double SF(__adddf3)(double x, double y) { d64 a = { x }, b = { y }, z; z.u = f64_add(a.u, b.u); return z.d; }
double SF(__subdf3)(double x, double y) { d64 a = { x }, b = { y }, z; z.u = is_nan(b.u) ? f64_add(a.u, b.u) : f64_add(a.u, b.u ^ 0x8000000000000000ull); return z.d; }
double SF(__muldf3)(double x, double y) { d64 a = { x }, b = { y }, z; z.u = f64_mul(a.u, b.u); return z.d; }
double SF(__divdf3)(double x, double y) { d64 a = { x }, b = { y }, z; z.u = f64_div(a.u, b.u); return z.d; }
double SF(__negdf2)(double x) { d64 a = { x }; a.u ^= 0x8000000000000000ull; return a.d; }
int SF(__eqdf2)(double x, double y) { d64 a = { x }, b = { y }; return f64_cmp(a.u, b.u) != 0; }
int SF(__nedf2)(double x, double y) { d64 a = { x }, b = { y }; return f64_cmp(a.u, b.u) != 0; }
int SF(__ltdf2)(double x, double y) { d64 a = { x }, b = { y }; int c = f64_cmp(a.u, b.u); return c == 2 ? 1 : c; }
int SF(__ledf2)(double x, double y) { d64 a = { x }, b = { y }; int c = f64_cmp(a.u, b.u); return c == 2 ? 1 : c; }
int SF(__gtdf2)(double x, double y) { d64 a = { x }, b = { y }; int c = f64_cmp(a.u, b.u); return c == 2 ? -1 : c; }
int SF(__gedf2)(double x, double y) { d64 a = { x }, b = { y }; int c = f64_cmp(a.u, b.u); return c == 2 ? -1 : c; }
int SF(__unorddf2)(double x, double y) { d64 a = { x }, b = { y }; return is_nan(a.u) || is_nan(b.u); }

static uint64_t from_u64(int sign, uint64_t m)   /* sign and magnitude to a double, rounded */
{
	if (!m)
		return (uint64_t)sign << 63;
	if (m >> 63)
		return round_pack(sign, 0x43d, m >> 1 | (m & 1));
	return norm_round_pack(sign, 0x43c, m);
}
double SF(__floatsidf)(int32_t i) { d64 z; z.u = from_u64(i < 0, i < 0 ? (uint64_t)-(int64_t)i : (uint64_t)i); return z.d; }
double SF(__floatunsidf)(uint32_t i) { d64 z; z.u = from_u64(0, i); return z.d; }
double SF(__floatdidf)(int64_t i) { d64 z; z.u = from_u64(i < 0, i < 0 ? -(uint64_t)i : (uint64_t)i); return z.d; }
double SF(__floatundidf)(uint64_t i) { d64 z; z.u = from_u64(0, i); return z.d; }

/* toward zero; ok is cleared when the value does not fit in `bits` bits, signed, or is NaN */
static int64_t f64_trunc(uint64_t a, int bits, int *ok)
{
	int sign = (int)(a >> 63);
	int32_t e = (int32_t)(a >> 52 & 0x7ff) - 0x3ff;
	uint64_t m = (a & 0x000fffffffffffffull) | 0x0010000000000000ull, v;
	*ok = 1;
	if (is_nan(a)) {
		*ok = 0;
		return 0;
	}
	if (e < 0)
		return 0;
	if (e >= bits - 1) {
		/* only -2^(bits-1) fits */
		if (sign && e == bits - 1 && !(a & 0x000fffffffffffffull))
			return bits == 64 ? INT64_MIN : -((int64_t)1 << (bits - 1));
		*ok = 0;
		return 0;
	}
	v = e >= 52 ? m << (e - 52) : m >> (52 - e);
	return sign ? -(int64_t)v : (int64_t)v;
}
int32_t SF(__fixdfsi)(double x) { d64 a = { x }; int ok; int64_t v = f64_trunc(a.u, 32, &ok); return ok ? (int32_t)v : INT32_MIN; }
int64_t SF(__fixdfdi)(double x) { d64 a = { x }; int ok; int64_t v = f64_trunc(a.u, 64, &ok); return ok ? v : INT64_MIN; }
/* (as the host's (uint32_t)d does: through a 64-bit conversion) */
uint32_t SF(__fixunsdfsi)(double x) { return (uint32_t)SF(__fixdfdi)(x); }
uint64_t SF(__fixunsdfdi)(double x)   /* (as the host's (uint64_t)d: below 2^63 directly, else less 2^63) */
{
	d64 a = { x };
	if (is_nan(a.u))
		return 0;
	if (f64_cmp(a.u, 0x43e0000000000000ull) < 0)
		return (uint64_t)SF(__fixdfdi)(x);
	return (uint64_t)SF(__fixdfdi)(SF(__subdf3)(x, 9223372036854775808.0)) ^ 0x8000000000000000ull;
}

double SF(__extendsfdf2)(float x)
{
	f32 a = { x };
	d64 z;
	int sign = (int)(a.u >> 31);
	int32_t e = (int32_t)(a.u >> 23 & 0xff);
	uint64_t m = a.u & 0x7fffff;
	if (e == 0xff)
		z.u = pack(sign, 0x7ff, m ? (m << 29) | QUIET : 0);
	else if (!e) {
		if (!m)
			z.u = (uint64_t)sign << 63;
		else {
			int shift = clz32((uint32_t)m) - 8;
			z.u = pack(sign, 0x381 - shift, (m << shift & 0x7fffff) << 29);
		}
	} else
		z.u = pack(sign, e + 0x380, m << 29);
	return z.d;
}
float SF(__truncdfsf2)(double x)
{
	d64 a = { x };
	f32 z;
	int sign = (int)(a.u >> 63);
	int32_t e = (int32_t)(a.u >> 52 & 0x7ff);
	uint64_t m = a.u & 0x000fffffffffffffull;
	uint32_t sig, bits;
	if (e == 0x7ff) {
		z.u = (uint32_t)sign << 31 | 0x7f800000u | (m ? 0x400000u | (uint32_t)(m >> 29) : 0);
		return z.f;
	}
	/* 30 bits of significand (its leading 1 at bit 30) and the rest jammed, as SoftFloat's f64_to_f32 */
	sig = (uint32_t)jam(m, 22);
	if (!(e | sig)) {
		z.u = (uint32_t)sign << 31;
		return z.f;
	}
	sig |= 0x40000000u;
	e -= 0x381;
	/* round and pack, single */
	bits = sig & 0x7f;
	if ((uint32_t)e >= 0xfd) {
		if (e < 0) {
			uint32_t d = (uint32_t)-e;
			sig = d < 31 ? sig >> d | ((uint32_t)(sig << (-d & 31)) != 0) : sig != 0;
			e = 0;
			bits = sig & 0x7f;
		} else if (e > 0xfd || sig + 0x40 >= 0x80000000u) {
			z.u = (uint32_t)sign << 31 | 0x7f800000u;
			return z.f;
		}
	}
	sig = (sig + 0x40) >> 7;
	sig &= ~(uint32_t)(bits == 0x40);
	if (!sig)
		e = 0;
	z.u = ((uint32_t)sign << 31) + ((uint32_t)e << 23) + sig;
	return z.f;
}
int SF(__unordsf2)(float x, float y) { f32 a = { x }, b = { y }; return (a.u & 0x7fffffffu) > 0x7f800000u || (b.u & 0x7fffffffu) > 0x7f800000u; }

/* ---- libm's rounding functions and fabs: bit operations, exact. The runtime calls them as often as the arithmetic
   (floor and trunc: 0.6 million times in a small world's compile), so they are code here too; the rest of libm (sin,
   pow, fmod...) stays host calls, and the figures say how many. ---- */
static double nan_or(d64 a) { if (is_nan(a.u)) a.u |= QUIET; return a.d; }
double SF(trunc)(double x)
{
	d64 a = { x };
	int e = (int)(a.u >> 52 & 0x7ff) - 1023;
	if (e >= 52)
		return nan_or(a);
	a.u &= e < 0 ? 0x8000000000000000ull : ~(0x000fffffffffffffull >> e);
	return a.d;
}
static double floor_ceil(double x, int up)   /* (floor: toward -inf; ceil: toward +inf) */
{
	d64 a = { x };
	int e = (int)(a.u >> 52 & 0x7ff) - 1023, neg = (int)(a.u >> 63);
	uint64_t m;
	if (e >= 52)
		return nan_or(a);
	if (e < 0) {
		if (a.u << 1)   /* (not a zero: 0 or 1 by the sign, -1 or -0) */
			a.u = neg ? (up ? 0x8000000000000000ull : 0xbff0000000000000ull) : (up ? 0x3ff0000000000000ull : 0);
		return a.d;
	}
	m = 0x000fffffffffffffull >> e;
	if (!(a.u & m))
		return a.d;
	if (neg != up)   /* (away from zero by one: the fraction's bits carry into the integer's) */
		a.u += m;
	a.u &= ~m;
	return a.d;
}
double SF(floor)(double x) { return floor_ceil(x, 0); }
double SF(ceil)(double x) { return floor_ceil(x, 1); }
double SF(round)(double x)   /* (halfway cases away from zero) */
{
	d64 a = { x };
	int e = (int)(a.u >> 52 & 0x7ff) - 1023;
	uint64_t m;
	if (e >= 52)
		return nan_or(a);
	if (e < 0) {
		a.u = (a.u & 0x8000000000000000ull) | (e == -1 ? 0x3ff0000000000000ull : 0);
		return a.d;
	}
	m = 0x000fffffffffffffull >> e;
	if (!(a.u & m))
		return a.d;
	a.u += (m >> 1) + 1;
	a.u &= ~m;
	return a.d;
}
double SF(fabs)(double x) { d64 a = { x }; a.u &= 0x7fffffffffffffffull; return a.d; }

/* ---- 64-bit integers: what the RV32 core has no instruction for ---- */
static uint64_t udivmod(uint64_t n, uint64_t d, uint64_t *rem)
{
	uint64_t q = 0, r = 0;
	if (!d) {   /* (as the test firmware's host calls answer it: 0) */
		*rem = 0;
		return 0;
	}
	if (!(n >> 32) && !(d >> 32)) {   /* both 32-bit: the hardware divides */
		*rem = (uint32_t)n % (uint32_t)d;
		return (uint32_t)n / (uint32_t)d;
	}
	for (int i = 63; i >= 0; i--) {
		r = r << 1 | (n >> i & 1);
		if (r >= d) {
			r -= d;
			q |= (uint64_t)1 << i;
		}
	}
	*rem = r;
	return q;
}
uint64_t SF(__udivdi3)(uint64_t a, uint64_t b) { uint64_t r; return udivmod(a, b, &r); }
uint64_t SF(__umoddi3)(uint64_t a, uint64_t b) { uint64_t r; udivmod(a, b, &r); return r; }
int64_t SF(__divdi3)(int64_t a, int64_t b)
{
	uint64_t r, q = udivmod(a < 0 ? -(uint64_t)a : (uint64_t)a, b < 0 ? -(uint64_t)b : (uint64_t)b, &r);
	return (a < 0) != (b < 0) ? -(int64_t)q : (int64_t)q;
}
int64_t SF(__moddi3)(int64_t a, int64_t b)
{
	uint64_t r;
	udivmod(a < 0 ? -(uint64_t)a : (uint64_t)a, b < 0 ? -(uint64_t)b : (uint64_t)b, &r);
	return a < 0 ? -(int64_t)r : (int64_t)r;
}
int64_t SF(__muldi3)(int64_t a, int64_t b)
{
	uint64_t x = (uint64_t)a, y = (uint64_t)b;
	uint32_t x0 = (uint32_t)x, x1 = (uint32_t)(x >> 32), y0 = (uint32_t)y, y1 = (uint32_t)(y >> 32);
	uint64_t lo = (uint64_t)x0 * y0;
	uint32_t hi = (uint32_t)(lo >> 32) + x0 * y1 + x1 * y0;
	return (int64_t)((uint64_t)hi << 32 | (uint32_t)lo);
}
int64_t SF(__ashldi3)(int64_t a, int32_t s) { return (int64_t)((uint64_t)a << (s & 63)); }
int64_t SF(__lshrdi3)(int64_t a, int32_t s) { return (int64_t)((uint64_t)a >> (s & 63)); }
int64_t SF(__ashrdi3)(int64_t a, int32_t s) { return a >> (s & 63); }

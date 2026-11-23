package tracerv32

import (
	"math"
	"math/bits"
)

// RV32F on binary32 bit patterns, with the semantics of the reference
// (bench/host/rv32-interp.js) and of the ESP32-P4 that the conformance vectors
// were captured on: the canonical NaN for every NaN result, tininess after
// rounding, saturating conversions that raise NV alone. Every function returns
// the result and the fflags it raises.
//
// The reference computes exact values with BigInt and rounds once. Here an
// inexact intermediate keeps its lost bits as a sticky 1 in the lowest bit of a
// 64-bit significand whose rounding point lies at least 30 bits higher, which
// rounds identically.

// The fflags bits and the canonical NaN.
const (
	FlagNX = 1  // inexact
	FlagUF = 2  // underflow
	FlagOF = 4  // overflow
	FlagDZ = 8  // divide by zero
	FlagNV = 16 // invalid
	NaN32  = 0x7fc00000
	sign32 = 0x80000000
	inf32  = 0x7f800000
)

func isNaN32(b uint32) bool  { return b&0x7fffffff > inf32 }
func isSNaN32(b uint32) bool { return isNaN32(b) && b&0x400000 == 0 }
func isInf32(b uint32) bool  { return b&0x7fffffff == inf32 }
func isZero32(b uint32) bool { return b&0x7fffffff == 0 }

// unpack returns a finite value as sig * 2^exp.
func unpack(b uint32) (uint64, int) {
	if e := (b >> 23) & 255; e != 0 {
		return uint64(b&0x7fffff | 0x800000), int(e) - 150
	}
	return uint64(b & 0x7fffff), -149
}

func nanOf(ops ...uint32) (uint32, uint32) {
	for _, b := range ops {
		if isSNaN32(b) {
			return NaN32, FlagNV
		}
	}
	return NaN32, 0
}

func signed0(neg bool) uint32 {
	if neg {
		return sign32
	}
	return 0
}

// shiftRound returns sig >> shift rounded with rm for a value of the given
// sign, and whether bits were lost.
func shiftRound(sign uint32, sig uint64, shift int, rm uint32) (uint64, bool) {
	if shift <= 0 {
		return sig << uint(-shift), false
	}
	var q, r uint64
	above, half := false, false // r > half, r == half
	if shift >= 64 {
		r = sig
		if shift == 64 {
			above, half = sig > 1<<63, sig == 1<<63
		}
	} else {
		q, r = sig>>uint(shift), sig&(1<<uint(shift)-1)
		h := uint64(1) << uint(shift-1)
		above, half = r > h, r == h
	}
	if r == 0 {
		return q, false
	}
	up := false
	switch rm {
	case 0:
		up = above || (half && q&1 == 1)
	case 2:
		up = sign == 1
	case 3:
		up = sign == 0
	case 4:
		up = above || half
	}
	if up {
		q++
	}
	return q, true
}

// round returns the binary32 nearest to (-1)^sign * sig * 2^exp under rm.
func round(sign uint32, sig uint64, exp int, rm uint32) (uint32, uint32) {
	top := exp + bits.Len64(sig) - 1
	lsb, tiny := top-23, false
	if top < -126 {
		if top < -127 {
			tiny = true
		} else {
			q, _ := shiftRound(sign, sig, lsb-exp, rm)
			tiny = q < 1<<24
		}
		lsb = -149
	}
	q, inexact := shiftRound(sign, sig, lsb-exp, rm)
	var flags uint32
	if inexact {
		flags = FlagNX
		if tiny {
			flags |= FlagUF
		}
	}
	if q == 1<<24 {
		q >>= 1
		lsb++
	}
	if q < 0x800000 {
		return sign<<31 | uint32(q), flags
	}
	if lsb+150 >= 255 {
		if rm == 0 || rm == 4 || (rm == 2 && sign == 1) || (rm == 3 && sign == 0) {
			return sign<<31 | inf32, flags | FlagOF | FlagNX
		}
		return sign<<31 | 0x7f7fffff, flags | FlagOF | FlagNX
	}
	return sign<<31 | uint32(lsb+150)<<23 | uint32(q-0x800000), flags
}

// normal shifts sig so that its top bit is bit 62.
func normal(sig uint64, exp int) (uint64, int) {
	s := 63 - bits.Len64(sig)
	return sig << uint(s), exp - s
}

// sum rounds (-1)^sa * a * 2^ea + (-1)^sb * b * 2^eb; a and b are nonzero and
// have at most 48 significant bits. An exact zero is +0, or -0 rounding down.
func sum(sa uint32, a uint64, ea int, sb uint32, b uint64, eb int, rm uint32) (uint32, uint32) {
	a, ea = normal(a, ea)
	b, eb = normal(b, eb)
	if ea < eb || (ea == eb && a < b) {
		sa, a, ea, sb, b, eb = sb, b, eb, sa, a, ea
	}
	if d := ea - eb; d >= 64 {
		b = 1
	} else if d > 0 {
		lost := b&(1<<uint(d)-1) != 0
		b >>= uint(d)
		if lost {
			b |= 1
		}
	}
	if sa == sb {
		return round(sa, a+b, ea, rm)
	}
	if a == b {
		return signed0(rm == 2), 0
	}
	return round(sa, a-b, ea, rm)
}

func fadd(a, b, rm uint32) (uint32, uint32) {
	switch {
	case isNaN32(a) || isNaN32(b):
		return nanOf(a, b)
	case isInf32(a):
		if isInf32(b) && (a^b)&sign32 != 0 {
			return NaN32, FlagNV
		}
		return a, 0
	case isInf32(b):
		return b, 0
	case isZero32(a) && isZero32(b):
		if a&b&sign32 != 0 {
			return sign32, 0
		}
		if (a|b)&sign32 != 0 {
			return signed0(rm == 2), 0
		}
		return 0, 0
	case isZero32(a):
		return b, 0
	case isZero32(b):
		return a, 0
	}
	sa, ea := unpack(a)
	sb, eb := unpack(b)
	return sum(a>>31, sa, ea, b>>31, sb, eb, rm)
}

func fmul(a, b, rm uint32) (uint32, uint32) {
	if isNaN32(a) || isNaN32(b) {
		return nanOf(a, b)
	}
	sign := (a ^ b) >> 31
	if isInf32(a) || isInf32(b) {
		if isZero32(a) || isZero32(b) {
			return NaN32, FlagNV
		}
		return sign<<31 | inf32, 0
	}
	if isZero32(a) || isZero32(b) {
		return sign << 31, 0
	}
	sa, ea := unpack(a)
	sb, eb := unpack(b)
	return round(sign, sa*sb, ea+eb, rm)
}

func fdiv(a, b, rm uint32) (uint32, uint32) {
	if isNaN32(a) || isNaN32(b) {
		return nanOf(a, b)
	}
	sign := (a ^ b) >> 31
	switch {
	case isInf32(a):
		if isInf32(b) {
			return NaN32, FlagNV
		}
		return sign<<31 | inf32, 0
	case isInf32(b):
		return sign << 31, 0
	case isZero32(b):
		if isZero32(a) {
			return NaN32, FlagNV
		}
		return sign<<31 | inf32, FlagDZ
	case isZero32(a):
		return sign << 31, 0
	}
	sa, ea := unpack(a)
	sb, eb := unpack(b)
	n, en := normal(sa, ea)
	q, r := n/sb, n%sb
	if r != 0 {
		q |= 1
	}
	return round(sign, q, en-eb, rm)
}

func fsqrt(a, rm uint32) (uint32, uint32) {
	switch {
	case isNaN32(a):
		return nanOf(a)
	case isZero32(a):
		return a, 0
	case a&sign32 != 0:
		return NaN32, FlagNV
	case isInf32(a):
		return a, 0
	}
	s, e := unpack(a)
	s, e = normal(s, e) // top bit 62
	if e&1 != 0 {
		s >>= 1 // exact: the low bits of a normalized 24-bit significand are zero
		e++
	}
	r := uint64(math.Sqrt(float64(s)))
	for r*r > s {
		r--
	}
	for (r+1)*(r+1) <= s {
		r++
	}
	if r*r != s {
		r = r<<1 | 1 // keep a sticky bit below the root's 31 bits
		e -= 2
	}
	return round(0, r, e/2, rm)
}

// fma rounds (-1)^negP * a * b + (-1)^negC * c once.
func fma(a, b, c, negP, negC, rm uint32) (uint32, uint32) {
	if isNaN32(a) || isNaN32(b) {
		return nanOf(a, b, c)
	}
	if (isInf32(a) && isZero32(b)) || (isZero32(a) && isInf32(b)) {
		return NaN32, FlagNV
	}
	if isNaN32(c) {
		return nanOf(c)
	}
	signP := (a^b)>>31 ^ negP
	c ^= negC << 31
	if isInf32(a) || isInf32(b) {
		if isInf32(c) && c>>31 != signP {
			return NaN32, FlagNV
		}
		return signP<<31 | inf32, 0
	}
	if isInf32(c) {
		return c, 0
	}
	if isZero32(a) || isZero32(b) {
		if !isZero32(c) {
			return c, 0
		}
		if signP == c>>31 {
			return signP << 31, 0
		}
		return signed0(rm == 2), 0
	}
	sa, ea := unpack(a)
	sb, eb := unpack(b)
	if isZero32(c) {
		return round(signP, sa*sb, ea+eb, rm)
	}
	sc, ec := unpack(c)
	return sum(signP, sa*sb, ea+eb, c>>31, sc, ec, rm)
}

// order maps non-NaN patterns to integers in numeric order, with -0 < +0.
func order(b uint32) int64 {
	if b&sign32 != 0 {
		return -int64(b&0x7fffffff) - 1
	}
	return int64(b)
}

func fminmax(a, b uint32, max bool) (uint32, uint32) {
	var flags uint32
	if isSNaN32(a) || isSNaN32(b) {
		flags = FlagNV
	}
	switch {
	case isNaN32(a) && isNaN32(b):
		return NaN32, flags
	case isNaN32(a):
		return b, flags
	case isNaN32(b):
		return a, flags
	}
	if (order(a) < order(b)) == max {
		return b, flags
	}
	return a, flags
}

// fcompare is fle (f3 0), flt (1) and feq (2).
func fcompare(a, b, f3 uint32) (int32, uint32) {
	if isNaN32(a) || isNaN32(b) {
		if f3 != 2 || isSNaN32(a) || isSNaN32(b) {
			return 0, FlagNV
		}
		return 0, 0
	}
	x, y := math.Float32frombits(a), math.Float32frombits(b)
	switch f3 {
	case 2:
		return bool32(x == y), 0
	case 1:
		return bool32(x < y), 0
	}
	return bool32(x <= y), 0
}

func fclass(a uint32) int32 {
	neg, e, m := a>>31 == 1, (a>>23)&255, a&0x7fffff
	switch {
	case e == 255 && m != 0:
		if m&0x400000 != 0 {
			return 1 << 9
		}
		return 1 << 8
	case e == 255:
		if neg {
			return 1
		}
		return 1 << 7
	case e == 0 && m != 0:
		if neg {
			return 1 << 2
		}
		return 1 << 5
	case e == 0:
		if neg {
			return 1 << 3
		}
		return 1 << 4
	case neg:
		return 1 << 1
	}
	return 1 << 6
}

// toInt is fcvt.w.s and fcvt.wu.s.
func toInt(a, rm uint32, unsigned bool) (int32, uint32) {
	neg := a>>31 == 1 && !isNaN32(a)
	saturated := func() (int32, uint32) {
		switch {
		case unsigned && neg:
			return 0, FlagNV
		case unsigned:
			return -1, FlagNV
		case neg:
			return math.MinInt32, FlagNV
		}
		return math.MaxInt32, FlagNV
	}
	if isNaN32(a) || isInf32(a) {
		return saturated()
	}
	if isZero32(a) {
		return 0, 0
	}
	s, e := unpack(a)
	if e > 8 { // |a| >= 2^32
		return saturated()
	}
	q, inexact := shiftRound(a>>31, s, -e, rm)
	v := int64(q)
	if neg {
		v = -v
	}
	if (unsigned && (v < 0 || v > math.MaxUint32)) || (!unsigned && (v < math.MinInt32 || v > math.MaxInt32)) {
		return saturated()
	}
	if inexact {
		return int32(uint32(v)), FlagNX
	}
	return int32(uint32(v)), 0
}

// fromInt is fcvt.s.w and fcvt.s.wu.
func fromInt(v int32, rm uint32, unsigned bool) (uint32, uint32) {
	switch {
	case v == 0:
		return 0, 0
	case unsigned:
		return round(0, uint64(uint32(v)), 0, rm)
	case v < 0:
		return round(1, uint64(-int64(v)), 0, rm)
	}
	return round(0, uint64(v), 0, rm)
}

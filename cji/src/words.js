// CJI-3: a double's 64 bits as the decimal text SLIR prints for an immediate, in the subset (no
// BigInt, no DataView), so that cji can compile select_instructions. The double is taken apart
// arithmetically (sign, exponent, the 52 bits of its fraction), its word is held as two 32-bit
// halves, and the signed 64-bit value is printed by long division in 16-bit limbs, all exact in
// doubles. A NaN is the one NaN, 0x7ff8000000000000, as the runtime's from_double makes it.

import { ANY_UNDEFINED, ANY_HOLE, ANY_NULL, HOLE } from './dynamic.js';

// A constant of type Any (an AnyLit) as its word: dynamic.js's encodeConstant, with a number's
// word as text
export function constantWord(v) {
  if (v === undefined) return ANY_UNDEFINED;
  if (v === HOLE) return ANY_HOLE;
  if (v === null) return ANY_NULL;
  return $nat_double_bits(v, 131072);
}

// The decimal of the signed 64-bit word that is d's bits plus high * 2^32 (mod 2^64): high 0 for a
// Number's immediate (chapter 10), 2^17 for a number as a dynamic value (chapter 9's offset 2^49).
// Chapter 31's native primitive: rt_double_bits in the runtime is the same in C.
export function $nat_double_bits(d /*: Number */, high /*: Int */) /*: String */ {
  let hi = 0, lo = 0;
  if (d !== d) hi = 0x7ff80000;
  else {
    const neg = d < 0 || (d === 0 && 1 / d < 0);
    const a = neg ? -d : d;
    let exp = 0, frac = 0;   // the biased exponent, and the fraction's 52 bits as an integer
    if (a === Infinity) exp = 2047;
    else if (a !== 0) {
      let e = Math.floor(Math.log2(a));
      while (2 ** e > a) e--;
      while (2 ** (e + 1) <= a) e++;
      if (e < -1022) frac = a / 2 ** -1074;   // a subnormal: a multiple of 2^-1074
      else { exp = e + 1023; frac = (a / 2 ** e - 1) * 2 ** 52; }
    }
    const fracHi = Math.floor(frac / 4294967296);
    lo = frac - fracHi * 4294967296;
    hi = (neg ? 2147483648 : 0) + exp * 1048576 + fracHi;
  }
  hi = (hi + high) % 4294967296;
  let minus = false;
  if (hi >= 2147483648) {   // negative: print its magnitude, 2^64 minus the word
    minus = true;
    lo = lo === 0 ? 0 : 4294967296 - lo;
    hi = 4294967296 - hi - (lo === 0 ? 0 : 1);
    if (hi === 4294967296) hi = 0;
  }
  // four 16-bit limbs, most significant first, divided by 10^7 until nothing is left
  const limbs = [Math.floor(hi / 65536), hi % 65536, Math.floor(lo / 65536), lo % 65536];
  let text = '';
  for (;;) {
    let rem = 0, zero = true;
    for (let k = 0; k < 4; k++) {
      const cur = rem * 65536 + limbs[k];
      const q = Math.floor(cur / 10000000);
      limbs[k] = q;
      rem = cur - q * 10000000;
      if (q !== 0) zero = false;
    }
    const part = String(rem);
    if (zero) { text = part + text; break; }
    text = part.padStart(7, '0') + text;
  }
  return minus ? '-' + text : text;
}

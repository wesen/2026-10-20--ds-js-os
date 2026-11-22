/* Promoted from PICOCALC-RAY-PARITY scripts/04-libgcc-helpers.c (PICOCALC-REPO-LAYOUT Phase A); run from the repository root. */
// libgcc helpers that the shared typed-world reactor needs since sdk/typed/world.c began
// encoding Chess PSIX frames (2026-11-20). The cji rv32emu firmware modules do not export
// them, so the historical Editor replays failed at load time. These are exact
// implementations written on 32-bit halves: a 64-bit variable shift or division in this
// file would itself compile to a libgcc call (__ashldi3, __udivdi3) that rv32emu lacks.
#include <stdint.h>

typedef struct { uint32_t lo, hi; } u64;   // little-endian: lo in a0, hi in a1

static u64 make(uint32_t lo, uint32_t hi) { u64 v = {lo, hi}; return v; }

// ilp32f has no double registers: a double travels in a0/a1 exactly like this pair.
u64 __floatsidf(int32_t value) {
    if (value == 0) return make(0, 0);
    uint32_t sign = value < 0 ? 0x80000000u : 0;
    uint32_t m = value < 0 ? 0u - (uint32_t)value : (uint32_t)value;
    int msb = 31;
    while (!(m & (1u << msb))) msb--;
    // Drop the implicit leading one; the remaining msb bits are the top of the 52-bit
    // fraction. A 32-bit magnitude fits exactly, so there is no rounding.
    uint32_t rest = msb ? m & ((1u << msb) - 1) : 0;
    // fraction = rest << (52 - msb), split into the 20 high bits and 32 low bits.
    int shift = 52 - msb;               // 21..52
    uint32_t frac_hi, frac_lo;
    if (shift >= 32) { frac_hi = rest << (shift - 32); frac_lo = 0; }
    else { frac_hi = rest >> (32 - shift); frac_lo = rest << shift; }
    return make(frac_lo, sign | ((uint32_t)(1023 + msb) << 20) | (frac_hi & 0xfffff));
}

static int ge(u64 a, u64 b) { return a.hi > b.hi || (a.hi == b.hi && a.lo >= b.lo); }
static u64 sub(u64 a, u64 b) { return make(a.lo - b.lo, a.hi - b.hi - (a.lo < b.lo)); }
static u64 neg(u64 a) { return sub(make(0, 0), a); }

static u64 udiv(u64 n, u64 d) {
    u64 q = make(0, 0), r = make(0, 0);
    for (int bit = 63; bit >= 0; bit--) {
        r = make(r.lo << 1, (r.hi << 1) | (r.lo >> 31));
        uint32_t nb = bit >= 32 ? (n.hi >> (bit - 32)) & 1 : (n.lo >> bit) & 1;
        r.lo |= nb;
        if (ge(r, d)) {
            r = sub(r, d);
            if (bit >= 32) q.hi |= 1u << (bit - 32); else q.lo |= 1u << bit;
        }
    }
    return q;
}

u64 __divdi3(u64 a, u64 b) {
    int na = (int32_t)a.hi < 0, nb = (int32_t)b.hi < 0;
    u64 q = udiv(na ? neg(a) : a, nb ? neg(b) : b);
    return na != nb ? neg(q) : q;
}

// Also absent from the rv32emu C library; world.c compares PSIX field names.
int strcmp(const char *a, const char *b) {
    while (*a && *a == *b) { a++; b++; }
    return (unsigned char)*a - (unsigned char)*b;
}

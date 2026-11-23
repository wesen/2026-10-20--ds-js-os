// Division by a constant without a divide.
// Signed division by a constant d in [3, 2^31) that is not a power of two: q = mulh(n, M)
// (+ n when M is negative), shifted right arithmetically by s, plus one when n < 0.
// Hacker's Delight, Figure 10-1, with exact doubles (every value stays below 2^34).
export function divisionMagic(d) {
    const two31 = 2147483648, anc = two31 - 1 - two31 % d;
    let p = 31, q1 = Math.floor(two31 / anc), r1 = two31 - q1 * anc;
    let q2 = Math.floor(two31 / d), r2 = two31 - q2 * d, delta;
    do {
        p++;
        q1 *= 2; r1 *= 2;
        if (r1 >= anc) { q1++; r1 -= anc; }
        q2 *= 2; r2 *= 2;
        if (r2 >= d) { q2++; r2 -= d; }
        delta = d - r2;
    } while (q1 < delta || (q1 === delta && r1 === 0));
    return {magic: (q2 + 1) | 0, shift: p - 32};
}

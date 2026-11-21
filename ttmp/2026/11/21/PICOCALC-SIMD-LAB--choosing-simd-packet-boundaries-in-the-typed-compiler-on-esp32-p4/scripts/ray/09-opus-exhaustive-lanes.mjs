'use strict';
// Limitation: this is an idealized scalar model of a single 16-bit lane; it ignores SIMD lane packing, flags, pipeline timing and any vendor-specific saturation quirks.
// Limitation: only the listed R values are swept (exhaustively over s); other R values, other instruction orderings and non-saturating hardware variants are not covered.
const RS = [0, 1, 31, 1024, 32765, 32766, 32767];
const toS16 = (x) => (x & 0x8000 ? (x & 0xffff) - 0x10000 : x & 0xffff);
const sat16 = (x) => Math.max(-32768, Math.min(32767, x));
const toU16 = (x) => x & 0xffff;
const results = [];
for (const R of RS) {
  const m = { R, checked: 0, falseAdmissions: 0, falseRejections: 0, wrongAcceptedValues: 0, bad: 0, firstMismatch: null };
  for (let s = 0; s <= 0xffff; s++) {
    m.checked++;
    const refHit = s <= R;
    const refVal = refHit ? R - s : null;
    const u = toU16(sat16(R - toS16(s)));
    const hwHit = u <= R;
    const hwVal = hwHit ? u : null;
    let kind = null;
    if (hwHit && !refHit) { m.falseAdmissions++; kind = 'falseAdmission'; }
    else if (!hwHit && refHit) { m.falseRejections++; kind = 'falseRejection'; }
    else if (hwHit && refHit && hwVal !== refVal) { m.wrongAcceptedValues++; kind = 'wrongAcceptedValue'; }
    if (kind && !m.firstMismatch) m.firstMismatch = { s, kind, refHit, refVal, hwHit, hwVal, u };
  }
  m.bad = m.falseAdmissions + m.falseRejections + m.wrongAcceptedValues;
  results.push(m);
}
for (const m of results) {
  if (m.R <= 32766 && m.bad !== 0) throw new Error(`R=${m.R}: expected no bad results, got ${m.bad}`);
  if (m.R === 32767 && m.bad === 0) throw new Error('R=32767: expected bad results, got none');
}
console.log(JSON.stringify(results, null, 2));

// Differential programs for rv32.run against the reference interpreter, run in one goja VM.
// Defines globalThis.differential = {generate(seed), compare(ref, native, testCase), category(outcome)}.
// Programs are generated from a seed, so a failing case reproduces from its seed alone. They
// are shaped like typed-rv32.js output (a prologue saving ra, a body, an epilogue, one internal
// function, import call sites) and then perturbed: arbitrary words, writes to x0, sp and
// callee-saved registers, out-of-range addresses, loops that hit small step limits, missing
// handlers, throwing handlers and malformed imports.
(function (root) {
  'use strict';
  function rng(seed) { // mulberry32
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const U = w => w >>> 0;
  const rType = (f7, rs2, rs1, f3, rd, op) => U(f7 << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | rd << 7 | op);
  const iType = (imm, rs1, f3, rd, op) => U((imm & 0xfff) << 20 | rs1 << 15 | f3 << 12 | rd << 7 | op);
  const sType = (imm, rs2, rs1, f3) => { const u = imm & 0xfff; return U((u >>> 5) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | (u & 31) << 7 | 0x23); };
  const bType = (off, rs2, rs1, f3) => U(((off >>> 12) & 1) << 31 | ((off >>> 5) & 63) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 |
    ((off >>> 1) & 15) << 8 | ((off >>> 11) & 1) << 7 | 0x63);
  const jType = (off, rd) => U(((off >>> 20) & 1) << 31 | ((off >>> 1) & 0x3ff) << 21 | ((off >>> 11) & 1) << 20 | ((off >>> 12) & 0xff) << 12 | rd << 7 | 0x6f);
  const EBREAK = 0x00100073, RET = 0x00008067, SP = 2, RA = 1, BASE = 31;
  const POOL = [10, 11, 12, 13, 14, 15, 5, 6, 7, 28, 29];

  function generate(seed) {
    const r = rng(seed);
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const pick = xs => xs[Math.floor(r() * xs.length)];
    const chance = p => r() < p;
    const words = [], relocations = [], calls = [];
    let looping = false;
    words.push(iType(-16, SP, 0, SP, 0x13), sType(12, RA, SP, 2), iType(int(0, 64), 0, 0, BASE, 0x13));
    const body = int(4, 40);
    for (let i = 0; i < body; i++) {
      const k = r();
      const rd = chance(0.04) ? pick([0, 8, 9, 2, 3]) : pick(POOL);
      const rs1 = pick(POOL), rs2 = pick(POOL);
      if (k < 0.25) {
        const f3 = int(0, 7);
        const imm = f3 === 1 || f3 === 5 ? int(0, 31) | (chance(0.5) ? pick([0x400, 0x7e0, 0x020]) : 0) : int(-2048, 2047);
        words.push(iType(imm, rs1, f3, rd, 0x13));
      } else if (k < 0.45) {
        words.push(rType(pick([0, 0, 0x20, 1, 1, int(0, 127)]), rs2, rs1, int(0, 7), rd, 0x33));
      } else if (k < 0.5) {
        words.push(U(int(0, 0xfffff) << 12 | rd << 7 | 0x37));
      } else if (k < 0.62) {
        const base = chance(0.85) ? BASE : pick([SP, ...POOL]);
        words.push(iType(int(-8, 300), base, pick([0, 1, 2, 4, 5, 2, 2, 3, 6]), rd, 0x03));
      } else if (k < 0.72) {
        const base = chance(0.85) ? BASE : pick([SP, ...POOL]);
        words.push(sType(int(-8, 300), rs2, base, pick([0, 1, 2, 2, 3])));
      } else if (k < 0.82) {
        words.push(bType(4 * (int(1, 4) + 1), rs2, rs1, pick([0, 1, 4, 5, 6, 7, 2])));
      } else if (k < 0.85) {
        looping = true;
        words.push(bType(-4 * int(1, Math.min(4, words.length)), rs2, rs1, pick([0, 1, 4, 5, 6, 7])));
      } else if (k < 0.87) {
        words.push(EBREAK);
      } else if (k < 0.875) {
        looping = true;
        words.push(U(int(0, 0xffffffff)));
      } else if (k < 0.882) {
        // a jump out of the program, or a branch to a misaligned address
        words.push(chance(0.5) ? jType(4 * int(100, 2000), 0) : bType(pick([2, 6, -2]), rs2, rs1, pick([0, 1, 5, 7])));
      } else if (k < 0.89) {
        words.push(iType(pick([-8, -4, 8]), SP, 0, SP, 0x13)); // misalign sp before a call or an import
      } else if (k < 0.92) {
        words.push(jType(4 * int(1, 3), pick([0, 0, 0, 5])));
      } else if (k < 0.96) {
        calls.push(words.length);
        words.push(0);
      } else {
        relocations.push({offset: 4 * words.length, index: int(0, 3)});
        words.push(chance(0.5) ? EBREAK : U(int(0, 0xffffffff)));
      }
    }
    const epilogue = chance(0.97) ? RET : pick([0x000080e7, U(int(0, 0xffffffff))]);
    if (epilogue !== RET) looping = true;
    words.push(iType(12, SP, 2, RA, 0x03), iType(16, SP, 0, SP, 0x13), epilogue);
    const f = words.length;
    for (let i = int(0, 6); i > 0; i--) words.push(iType(int(-100, 100), pick(POOL), 0, chance(0.1) ? pick([8, 9, 18, 2, 1]) : pick(POOL), 0x13));
    words.push(RET);
    for (const at of calls) words[at] = jType(4 * (f - at), RA);
    const image = new Uint8Array(4 * words.length);
    const view = new DataView(image.buffer);
    words.forEach((w, i) => view.setUint32(4 * i, w, true));
    const entries = Object.create(null);
    entries.main = 0;
    entries.f = 4 * f;
    if (chance(0.05)) relocations.push({offset: relocations.length ? relocations[0].offset : 8, index: 1}); // a duplicate offset: the later one wins
    const memory = new Uint8Array(int(0, 200)).map(() => int(0, 255));
    const args = Array.from({length: int(0, 12)}, () => pick([int(-5, 5), int(-2147483648, 2147483647), 0x7fffffff, -2147483648]));
    const options = {};
    if (chance(0.3)) options.stackBytes = pick([0, 16, 64, 256]);
    // Generated programs can loop (backward branches, arbitrary words), and the reference in goja
    // would take minutes to reach its default limit of 50e6, so most cases set a small one. The
    // default limit is used only where every executed path is straight-line or forward.
    if (looping || chance(0.9)) options.limit = pick([1, 10, 100, 1000, 5000]);
    if (chance(0.2)) options.counts = false;
    if (relocations.length) {
      options.imports = [{name: 'sum', params: ['i32', 'i32']}, {name: 'neg', params: ['i32']}, {name: 'boom', params: []}];
      if (chance(0.85)) options.handlers = {sum: (a, b) => a + b, neg: a => -a, boom: () => { throw new Error('boom'); }};
      if (chance(0.1)) options.imports[1] = {name: 'neg'}; // no params: a TypeError at fn.params.length
    }
    const entry = chance(0.95) ? 'main' : pick(['f', 'missing']);
    return {seed, program: {image, entries, relocations}, entry, args, memory, options};
  }

  function attempt(interp, c) {
    try {
      return {threw: false, value: interp.run(c.program, c.entry, c.args, c.memory, c.options)};
    } catch (e) {
      return {threw: true, message: String(e && e.message !== undefined ? e.message : e), fault: e instanceof interp.Rv32Fault,
        type: e && e.constructor ? e.constructor.name : typeof e};
    }
  }

  function sameArray(x, y) {
    if (x === null || y === null) return x === y;
    if (x.constructor.name !== y.constructor.name || x.length !== y.length || x.buffer.byteLength !== y.buffer.byteLength) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  // compare returns the differences between the two interpreters' outcomes on one case.
  function compare(ref, native, c) {
    const a = attempt(ref, c), b = attempt(native, c), problems = [];
    if (a.threw !== b.threw) problems.push('threw: reference ' + a.threw + ' (' + (a.message || '') + '), native ' + b.threw + ' (' + (b.message || '') + ')');
    else if (a.threw) {
      for (const k of ['message', 'fault', 'type']) if (a[k] !== b[k]) problems.push(k + ': ' + a[k] + ' vs ' + b[k]);
    } else {
      const x = a.value, y = b.value;
      if (Object.keys(x).join() !== Object.keys(y).join()) problems.push('keys: ' + Object.keys(x) + ' vs ' + Object.keys(y));
      for (const k of ['trap', 'result', 'at', 'steps']) if (x[k] !== y[k]) problems.push(k + ': ' + x[k] + ' vs ' + y[k]);
      for (const k of ['counts', 'bytes', 'registers']) if (!sameArray(x[k], y[k])) problems.push(k + ' differ');
    }
    return {problems, outcome: a};
  }

  // category names an outcome without its addresses and numbers, for coverage counting.
  function category(o) {
    if (!o.threw) return o.value.trap ? 'trap' : 'return';
    return (o.fault ? 'fault: ' : o.type + ': ') + o.message.replace(/ at 0x[0-9a-f]+$/, '').replace(/0x[0-9a-f]+/g, '0xH').replace(/\bx\d+\b/g, 'xN').replace(/\b-?\d+\b/g, 'N');
  }

  root.differential = {generate, compare, category};
})(globalThis);

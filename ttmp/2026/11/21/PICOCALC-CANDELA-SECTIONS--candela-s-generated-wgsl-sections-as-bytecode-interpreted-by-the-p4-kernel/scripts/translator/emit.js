// emit.js: IR clean-up (fusions, dead-code removal), register allocation and encoding to bytecode version 1.
// Pure JavaScript, QuickJS-compatible.
import * as ISA from './isa.js';
import { SectionError } from './parse.js';

const IMPURE_K = new Set([ISA.KFUNC.rnd, ISA.KFUNC.rnd2, ISA.KFUNC.cosHemiN]);
const CONTROL = new Set(['RET', 'JMP', 'BRZ', 'BRNZ', 'IFLT', 'CHOOSE', 'CHOOSE0', 'SWITCH', 'LABEL']);

// operand roles of an IR instruction: for each argument 'd' (defines), 's' (uses), 'x' (both), 'n' (neither)
export function roles(ins) {
  const o = ISA.OP[ins.op];
  if (ins.op === 'LABEL') return [];
  if (o.sig) return o.sig.map(k => (k[0] === 'd' ? 'd' : k[0] === 's' || k === 'h' ? 's' : k[0] === 'x' ? 'x' : 'n'));
  switch (o.special) {
    case 'switch': return ins.a.map((_, i) => (i === 0 ? 's' : 'n'));
    case 'gather': return ['d', 's', 'n'];
    case 'hld': return ['d', 'n'];
    case 'hbool': return ['d', 's', 'n'];
    case 'gld': return ['d'];
    case 'lobe': return ins.a.map((_, i) => (i === 0 ? 'd' : i === 1 ? 'n' : 's'));
    case 'call': return ISA.KFUNCS[ins.H].sig.map(k => (k[0] === 'd' ? 'd' : k[0] === 's' || k === 'h' ? 's' : 'n'));
  }
  throw new Error('roles: ' + ins.op);
}
const isPure = ins => !CONTROL.has(ins.op) && !(ins.op === 'CALL' && IMPURE_K.has(ins.H));

// ---- aliases (lower.js alias): rewrite every operand that names an aliased temporary ----
export function resolveAliases(code) {
  const res = x => { let r = x.r, o = x.o; while (r.alias) { o += r.alias.o; r = r.alias.r; } return { r, o }; };
  for (const ins of code) ins.a = ins.a.map(x => (x && x.r && x.r.alias ? res(x) : x));
  return code;
}

// ---- dead-code removal: pure instructions whose destinations are never read ----
// One backward pass: removing an instruction releases its sources, whose producers come earlier.
export function dce(code) {
  const rl = code.map(roles), uses = new Map();
  code.forEach((ins, k) => rl[k].forEach((r, i) => { if ((r === 's' || r === 'x') && ins.a[i].r) uses.set(ins.a[i].r, (uses.get(ins.a[i].r) || 0) + 1); }));
  const keep = new Array(code.length).fill(true);
  for (let k = code.length - 1; k >= 0; k--) {
    const ins = code[k];
    if (!isPure(ins)) continue;
    let dead = true;
    for (let i = 0; i < ins.a.length && dead; i++) if (rl[k][i] === 'd') { const x = ins.a[i]; if (!x.r || uses.get(x.r) > 0 || x.r.kind === 'ret' || x.r.kind === 'arg') dead = false; }
    if (!dead) continue;
    keep[k] = false;
    rl[k].forEach((r, i) => { if ((r === 's' || r === 'x') && ins.a[i].r) uses.set(ins.a[i].r, uses.get(ins.a[i].r) - 1); });
  }
  let w = 0;
  for (let k = 0; k < code.length; k++) if (keep[k]) code[w++] = code[k];
  code.length = w;
  return code;
}

// ---- fusions (design Section 5.5) ----
function useCounts(code) {
  const n = new Map();
  for (const ins of code) roles(ins).forEach((k, i) => { if ((k === 's' || k === 'x') && ins.a[i].r) n.set(ins.a[i].r, (n.get(ins.a[i].r) || 0) + 1); });
  return n;
}
const F1 = (() => { const f = new Float32Array(1), u = new Uint32Array(f.buffer); return v => { f[0] = v; return u[0]; }; })();
const constIs = (x, v) => x.r && x.r.kind === 'const' && x.r.words[x.o] === F1(v);
// the instruction defining operand x (as a whole temporary) between `from` and `to`, with no label or redefinition in between
function producer(code, x, to, uses) {
  if (!x.r || x.r.kind !== 'tmp' || x.o !== 0 || uses.get(x.r) !== 1) return -1;
  for (let i = to - 1; i >= 0; i--) {
    const ins = code[i];
    if (ins.op === 'LABEL' || CONTROL.has(ins.op)) return -1;
    if (ins.a[0] && ins.a[0].r === x.r && roles(ins)[0] === 'd') return ins.a[0].o === 0 ? i : -1;
  }
  return -1;
}
// no instruction in (i, j) writes any register read by code[i] (so code[i] can move down to j)
function stable(code, i, j) {
  const srcs = code[i].a.filter((x, k) => x && x.r && roles(code[i])[k] !== 'd').map(x => x.r);
  for (let k = i + 1; k < j; k++) {
    const ins = code[k];
    if (ins.op === 'LABEL' || CONTROL.has(ins.op)) return false;
    const rl = roles(ins);
    if (ins.a.some((x, q) => (rl[q] === 'd' || rl[q] === 'x') && x.r && srcs.includes(x.r))) return false;
  }
  return true;
}
// Use counts stay valid across fusions within a pass: a fusion removes producers whose results had exactly one use
// (the consumer, which the fused instruction replaces) and moves their sources into the fused instruction.
function fuseAt(code, j, uses, stats) {
  const ins = code[j];
  // fresnelDielectric(clamp(dot(a, b), 0, 1), eta) -> FRESDOT
  if (ins.op === 'CALL' && ins.H === ISA.KFUNC.fresnelDielectric) {
    const ic = producer(code, ins.a[1], j, uses);
    if (ic >= 0 && code[ic].op === 'CLAMP' && constIs(code[ic].a[2], 0) && constIs(code[ic].a[3], 1)) {
      const id = producer(code, code[ic].a[1], ic, uses);
      if (id >= 0 && code[id].op === 'DOT3' && stable(code, id, j) && stable(code, ic, j)) {
        code[j] = { op: 'FRESDOT', H: 0, a: [ins.a[0], code[id].a[1], code[id].a[2], ins.a[2]] };
        code.splice(ic, 1); code.splice(id, 1);
        stats.FRESDOT = (stats.FRESDOT || 0) + 1; return 2;
      }
    }
  }
  // step(duty, fract(x * n)) -> STRIPES
  if (ins.op === 'STEP') {
    const ifr = producer(code, ins.a[2], j, uses);
    if (ifr >= 0 && code[ifr].op === 'FRACT') {
      const im = producer(code, code[ifr].a[1], ifr, uses);
      if (im >= 0 && code[im].op === 'MUL' && stable(code, im, j)) {
        code[j] = { op: 'STRIPES', H: 0, a: [ins.a[0], code[im].a[1], code[im].a[2], ins.a[1]] };
        code.splice(ifr, 1); code.splice(im, 1);
        stats.STRIPES = (stats.STRIPES || 0) + 1; return 2;
      }
    }
  }
  // fmodp(floor(p * n).x + floor(p * n).y, 2.0) -> CHECKER
  if (ins.op === 'FMODP' && constIs(ins.a[2], 2)) {
    const iadd = producer(code, ins.a[1], j, uses);
    if (iadd >= 0 && code[iadd].op === 'ADD') {
      const [, p, q] = code[iadd].a;
      if (p.r && p.r === q.r && p.o === 0 && q.o === 1 && p.r.kind === 'tmp' && uses.get(p.r) === 2) {
        let ifl = -1;
        for (let i = iadd - 1; i >= 0; i--) { const x = code[i]; if (x.op === 'LABEL' || CONTROL.has(x.op)) break; if (x.a[0] && x.a[0].r === p.r) { ifl = i; break; } }
        const fl = ifl >= 0 ? code[ifl] : null;
        const flW = fl && (fl.op === 'VFLOOR' ? (fl.H & 7) : fl.op === 'FLOOR3' ? 3 : 0);
        if (flW >= 2 && !(fl.op === 'VFLOOR' && (fl.H & 8))) {
          const im = producer(code, fl.a[1], ifl, uses);
          const m = im >= 0 ? code[im] : null;
          const mW = m && (m.op === 'VMUL' && !(m.H & 24) ? (m.H & 7) : m.op === 'MUL3' ? 3 : 0);
          if (m && mW === flW && stable(code, im, j)) {
            code[j] = { op: 'CHECKER', H: flW, a: [ins.a[0], m.a[1], m.a[2]] };
            code.splice(iadd, 1); code.splice(ifl, 1); code.splice(im, 1);
            stats.CHECKER = (stats.CHECKER || 0) + 1; return 3;
          }
        }
      }
    }
  }
  // a * b + c (either order) -> MAD; v * s + c -> MAD3S
  if (ins.op === 'ADD' || ins.op === 'ADD3') {
    for (const side of [1, 2]) {
      const im = producer(code, ins.a[side], j, uses);
      if (im < 0) continue;
      const m = code[im], other = ins.a[3 - side];
      if (other.r && other.r === m.a[0].r) continue;
      if (ins.op === 'ADD' && m.op === 'MUL' && stable(code, im, j)) {
        code[j] = { op: 'MAD', H: 0, a: [ins.a[0], m.a[1], m.a[2], other] };
        code.splice(im, 1); stats.MAD = (stats.MAD || 0) + 1; return 1;
      }
      if (ins.op === 'ADD3' && m.op === 'MUL3S' && stable(code, im, j)) {
        code[j] = { op: 'MAD3S', H: 0, a: [ins.a[0], m.a[1], m.a[2], other] };
        code.splice(im, 1); stats.MAD3S = (stats.MAD3S || 0) + 1; return 1;
      }
    }
  }
  return -1;
}
export function fuse(code, stats) {
  for (let pass = 0; pass < 4; pass++) {
    const uses = useCounts(code);
    let changed = false;
    for (let j = 0; j < code.length; j++) {
      const removed = fuseAt(code, j, uses, stats);
      if (removed >= 0) { changed = true; j -= removed; }
    }
    if (!changed) break;
  }
  return code;
}

// ---- jump threading: a JMP to a RET is a RET; a JMP to the next instruction disappears ----
export function thread(code) {
  const at = new Map(); code.forEach((ins, i) => { if (ins.op === 'LABEL') at.set(ins.label, i); });
  const target = l => { let i = at.get(l); while (i < code.length && code[i].op === 'LABEL') i++; return i; };
  for (let i = code.length - 1; i >= 0; i--) {
    const ins = code[i];
    if (ins.op !== 'JMP') continue;
    const j = target(ins.a[0].label);
    if (j < code.length && code[j].op === 'RET') { code[i] = { op: 'RET', H: 0, a: [] }; continue; }
    let k = i + 1; while (k < code.length && code[k].op === 'LABEL') k++;
    if (k === j) code.splice(i, 1);
  }
  return code;
}

// ---- register allocation (design Section 4.4): first fit over linear-order live intervals ----
export function allocate(code, argR, retR, base) {
  const iv = new Map();
  const touch = (r, i) => { if (!r || r.kind === 'const' || r.kind === 'import') return; const e = iv.get(r); if (!e) iv.set(r, [i, i]); else { if (i < e[0]) e[0] = i; if (i > e[1]) e[1] = i; } };
  touch(argR, -1);
  code.forEach((ins, i) => { for (const x of ins.a) if (x && x.r) touch(x.r, i); });
  if (retR) { touch(retR, code.length); iv.get(retR)[1] = code.length; }
  const order = [...iv.entries()].sort((a, b) => a[1][0] - b[1][0] || b[0].w - a[0].w);
  const freeAt = [];   // per word: the last instruction index of its current occupant
  let size = 0;
  for (const [r, [s, e]] of order) {
    let at = 0;
    for (;;) {
      let ok = true;
      for (let k = 0; k < r.w; k++) if (freeAt[at + k] !== undefined && freeAt[at + k] >= s) { ok = false; at = at + k + 1; break; }
      if (ok) break;
    }
    for (let k = 0; k < r.w; k++) freeAt[at + k] = e;
    r.base = base + at;
    size = Math.max(size, at + r.w);
  }
  return size;
}

// ---- the constant region: imports first, then constants packed into existing runs where possible ----
export function placeConstants(prog) {
  const words = [];
  const imports = [];
  for (const r of prog.importList) { r.base = words.length; imports.push({ reg: r.base, row: r.row }); words.push(0, 0, 0, 0); }
  const firstConst = words.length;
  for (const r of prog.constList) {
    if (!r.used) continue;
    const w = r.words, n = w.length;
    let at = -1;
    for (let i = firstConst; i + n <= words.length && at < 0; i++) { let ok = true; for (let k = 0; k < n; k++) if (words[i + k] !== w[k]) { ok = false; break; } if (ok) at = i; }
    if (at < 0) { at = words.length; for (const x of w) words.push(x); }
    r.base = at;
  }
  return { words, imports };
}

// ---- encoding ----
export function encodeEntry(code, startPc) {
  // first pass: label addresses
  const addr = new Map();
  let pc = startPc;
  for (const ins of code) { if (ins.op === 'LABEL') { addr.set(ins.label, pc); continue; } pc += 1 + ins.a.length; }
  const out = [];
  for (const ins of code) {
    if (ins.op === 'LABEL') continue;
    const o = ISA.OP[ins.op];
    if (!o) throw new Error('encode: unknown op ' + ins.op);
    if (ins.H < 0 || ins.H > 255) throw new Error('encode: H out of range for ' + ins.op);
    out.push(o.code | (ins.H << 8));
    for (const x of ins.a) {
      if (x.label !== undefined) out.push(addr.get(x.label));
      else if (x.imm !== undefined) out.push(x.imm & 0xffff);
      else if (x.hitIn) out.push(ISA.HIT_IN);
      else if (x.r) { const v = x.r.base + x.o; if (!(v >= 0 && v < ISA.MAX_REGS)) throw new SectionError('E-SECT-LIMIT', 'limit:registers', `register ${v} beyond the ${ISA.MAX_REGS}-word register file`); out.push(v); }
      else throw new Error('encode: bad operand in ' + ins.op);
    }
  }
  return out;
}

const u16 = (b, at, v) => { b[at] = v & 255; b[at + 1] = (v >>> 8) & 255; };
const u32 = (b, at, v) => { b[at] = v & 255; b[at + 1] = (v >>> 8) & 255; b[at + 2] = (v >>> 16) & 255; b[at + 3] = (v >>> 24) & 255; };
export function assemble({ flags, nregs, constWords, imports, kmask, entries, code }) {
  const HDR = 20 + 12 * entries.length;
  const len = HDR + 4 * constWords.length + 4 * imports.length + 2 * code.length;
  const b = new Uint8Array(len);
  u32(b, 0, ISA.MAGIC); u16(b, 4, ISA.VERSION); u16(b, 6, flags); u16(b, 8, nregs); u16(b, 10, constWords.length);
  u16(b, 12, imports.length); u16(b, 14, code.length); u32(b, 16, kmask);
  entries.forEach((e, i) => { const at = 20 + 12 * i; [e.pc, e.end, e.lo, e.hi, e.arg, e.ret].forEach((v, k) => u16(b, at + 2 * k, v)); });
  let at = HDR;
  for (const w of constWords) { u32(b, at, w); at += 4; }
  for (const im of imports) { u16(b, at, im.reg); u16(b, at + 2, im.row); at += 4; }
  for (const h of code) { u16(b, at, h); at += 2; }
  return b;
}

// lower-state.js: what lowering one entry works with (lower.js has the overview): value kinds and widths, f32
// constant arithmetic, the per-entry state (registers, constants, code, kernel inlining) and IR helpers.
import { SectionError, sameExpr, mentions } from './parse.js';
import * as ISA from './isa.js';

const VECW = { vec2f: 2, vec3f: 3, vec4f: 4 };
const WIDTH = { f32: 1, i32: 1, bool: 1, aint: 1, vec2f: 2, vec3f: 3, vec4f: 4, Hit: ISA.HIT_WORDS, Lobe: ISA.LOBE_WORDS };
const VTYPE = { 1: 'f32', 2: 'vec2f', 3: 'vec3f', 4: 'vec4f' };
const isVec = t => t in VECW;
const isFloaty = t => t === 'f32' || isVec(t);
const fr = Math.fround;
const KNOWN_TYPES = new Set(['f32', 'i32', 'bool', 'vec2f', 'vec3f', 'vec4f', 'Hit', 'Lobe']);

// light kernel functions inlined from their WGSL text (kernel.js PRELUDE/compile.js at the pin; the host test
// checks that these copies equal the pinned kernel's text)
export const INLINE_KERNEL_WGSL = {
  metalAt: 'fn metalAt(v: vec3f) -> vec3f {\n  if (SPECTRAL_ON) {\n    let t: f32 = clamp((gLam - 450.0) / 200.0, 0.0, 1.0);\n    let s: f32 = select(mix(v.z, v.y, t * 2.0), mix(v.y, v.x, t * 2.0 - 1.0), t > 0.5);\n    return vec3f(s, s, s);\n  }\n  return v;\n}\n',
  lum: 'fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }',
  sq: 'fn sq(x: f32) -> f32 { return x * x; }',
};

export class VReg {
  constructor(id, w, kind) { this.id = id; this.w = w; this.kind = kind; }
}

const err = (code, construct, msg, at) => { throw new SectionError(code, construct, msg, at); };

// ---------- f32 constant arithmetic ----------
const F = {
  ADD: (a, b) => fr(a + b), SUB: (a, b) => fr(a - b), MUL: (a, b) => fr(a * b), DIV: (a, b) => fr(a / b),
  MIN: (a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b)), MAX: (a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b)),
  POW: (a, b) => fr(Math.pow(a, b)), ATAN2: (a, b) => fr(Math.atan2(a, b)), STEP: (a, b) => (b >= a ? 1 : 0),
  FMODP: (a, b) => fr(a - fr(b * Math.floor(fr(a / b)))),
  NEG: a => -a, ABS: a => Math.abs(a), FLOOR: a => Math.floor(a), CEIL: a => Math.ceil(a), FRACT: a => fr(a - Math.floor(a)),
  SQRT: a => fr(Math.sqrt(a)), SIN: a => fr(Math.sin(a)), COS: a => fr(Math.cos(a)), TAN: a => fr(Math.tan(a)),
  ASIN: a => fr(Math.asin(a)), ACOS: a => fr(Math.acos(a)), ATAN: a => fr(Math.atan(a)), EXP: a => fr(Math.exp(a)),
  EXP2: a => fr(Math.pow(2, a)), LOG: a => fr(Math.log(a)), LOG2: a => fr(Math.log2(a)),
  SIGN: a => (a > 0 ? 1 : a < 0 ? -1 : 0),
  CLAMP: (x, lo, hi) => F.MIN(F.MAX(x, lo), hi), MIX: (a, b, t) => fr(a + fr(fr(b - a) * t)),
  SMOOTH: (e0, e1, x) => { const t = F.CLAMP(fr(fr(x - e0) / fr(e1 - e0)), 0, 1); return fr(fr(t * t) * fr(3 - fr(2 * t))); },
};

const WGSL_ELEM = {   // WGSL built-in name -> [ISA elementwise op, arity]
  min: ['MIN', 2], max: ['MAX', 2], pow: ['POW', 2], atan2: ['ATAN2', 2], step: ['STEP', 2],
  abs: ['ABS', 1], floor: ['FLOOR', 1], ceil: ['CEIL', 1], fract: ['FRACT', 1], sqrt: ['SQRT', 1], sin: ['SIN', 1], cos: ['COS', 1],
  tan: ['TAN', 1], asin: ['ASIN', 1], acos: ['ACOS', 1], atan: ['ATAN', 1], exp: ['EXP', 1], exp2: ['EXP2', 1], log: ['LOG', 1],
  log2: ['LOG2', 1], sign: ['SIGN', 1], clamp: ['CLAMP', 3], mix: ['MIX', 3], smoothstep: ['SMOOTH', 3],
  fmodp: ['FMODP', 2], fmodp2: ['FMODP', 2], fmodp3: ['FMODP', 2], fmodp4: ['FMODP', 2],
};
const GENERATED = /^(mat|sdf|hf|dens|bumpH|bumpN)_\d+$/;

// ---------- one entry's lowering state ----------
export class EntryLowering {
  constructor(prog, entry) {
    this.prog = prog;            // { fns: Map(name -> ast), spectral, consts, imports }
    this.entry = entry;          // ISA.ENTRIES item
    this.code = [];
    this.nlabel = 0;
    this.kfuncs = new Set();
    this.defs = new Map();       // vreg -> number of instructions defining it
  }
  vreg(w, kind = 'tmp') { return this.prog.newVReg(w, kind); }
  label() { return { label: this.nlabel++ }; }
  place(l) { this.code.push({ op: 'LABEL', label: l.label, H: 0, a: [] }); }
  emit(op, args, H = 0) {
    const ins = { op, H, a: args };
    // common subexpressions: a pure instruction with immutable operands, identical to one that dominates this point
    const key = this.cseKey(ins);
    if (key) {
      for (let sc = this.scope; sc; sc = sc.up) {
        const hit = sc.cse && sc.cse.get(key);
        if (hit && hit.ins.a[0].r === hit.r && hit.ins.a[0].o === 0) { args[0].r.alias = { r: hit.r, o: 0 }; return hit.ins; }
      }
    }
    this.code.push(ins);
    if (args[0] && args[0].r && defArg0(ins)) this.defs.set(args[0].r, (this.defs.get(args[0].r) || 0) + 1);
    if (key && this.scope) this.scope.cse.set(key, { ins, r: args[0].r });
    return ins;
  }
  cseKey(ins) {
    const o = ISA.OP[ins.op];
    if (!o || !CSE_OPS.has(ins.op) && !(ins.op === 'CALL' && CSE_K.has(ins.H))) return null;
    const d = ins.a[0];
    if (!d || !d.r || d.o !== 0 || d.r.kind !== 'tmp' || d.r.alias) return null;
    const parts = [ins.op, ins.H];
    for (let i = 1; i < ins.a.length; i++) {
      const x = ins.a[i];
      if (x.imm !== undefined) parts.push('#' + x.imm);
      else if (x.hitIn) parts.push('h');
      else if (x.r) { if (!this.immutable(x, ins, i)) return null; let r = x.r, off = x.o; while (r.alias) { off += r.alias.o; r = r.alias.r; } parts.push(r.id + ':' + off); }
      else return null;
    }
    return parts.join(' ');
  }
  immutable(x, ins, i) {
    let r = x.r, off = x.o; while (r.alias) { off += r.alias.o; r = r.alias.r; }
    if (r.kind === 'const' || r.kind === 'import' || r.kind === 'tmp') return true;
    if (r.kind === 'arg' && r.mutable) { const w = operandWidth(ins, i); for (let k = off; k < off + w; k++) if (r.mutable.has(k)) return false; return true; }
    return r.kind === 'arg';
  }

  // ---- values ----
  operand(v) {
    if (v.c) return this.prog.constOperand(v);
    if (v.hitIn) return { hitIn: true };
    return { r: v.r, o: v.o };
  }
  newval(t) { const w = WIDTH[t]; return { t, r: this.vreg(w), o: 0 }; }
  coerce(v, t, at) {
    if (v.t === t) return v;
    if (v.t === 'aint' && (t === 'f32' || t === 'i32')) return { t, c: [t === 'f32' ? fr(v.c[0]) : v.c[0] | 0] };
    err('E-SECT-TYPE', 'type:' + v.t + '->' + t, `a ${v.t} value where ${t} is needed`, at);
  }
  // scalar float binary/unary/ternary via ISA op name with folding
  elem(name, args, at) {
    const t0 = args.map(a => a.t);
    // resolve abstract ints to f32 next to floats
    args = args.map(a => (a.t === 'aint' ? this.coerce(a, 'f32', at) : a));
    const w = Math.max(...args.map(a => WIDTH[a.t]));
    for (const a of args) if (!isFloaty(a.t)) err('E-SECT-TYPE', 'type:' + name.toLowerCase() + '-' + a.t, `${name.toLowerCase()} on ${a.t} (operand types ${t0.join(', ')})`, at);
    for (const a of args) if (WIDTH[a.t] !== 1 && WIDTH[a.t] !== w) err('E-SECT-TYPE', 'type:' + name.toLowerCase() + '-mixed', `${name.toLowerCase()} on ${t0.join(' and ')}`, at);
    const t = VTYPE[w];
    if (args.every(a => a.c)) {
      const f = F[name], out = [];
      for (let i = 0; i < w; i++) out.push(f(...args.map(a => (a.c.length === 1 ? a.c[0] : a.c[i]))));
      return { t, c: out };
    }
    const simp = this.simplify(name, args, t);
    if (simp) return simp;
    const d = this.newval(t);
    const bc = args.map(a => WIDTH[a.t] === 1 && w > 1);
    const ops = args.map(a => this.operand(a));
    if (w === 1) this.emit(name, [d, ...ops]);
    else if (w === 3 && ISA.ELEM3.includes(name) && !bc.some(Boolean)) this.emit(name + '3', [d, ...ops]);
    else if (w === 3 && ['ADD', 'SUB', 'MUL', 'DIV'].includes(name) && bc[1] && !bc[0]) this.emit(name + '3S', [d, ...ops]);
    else if (w === 3 && ['ADD', 'SUB', 'MUL', 'DIV'].includes(name) && bc[0] && !bc[1]) this.emit('S' + name + '3', [d, ...ops]);
    else if (w === 3 && name === 'MIX' && !bc[0] && !bc[1] && bc[2]) this.emit('MIX3S', [d, ...ops]);
    else this.emit('V' + name, [d, ...ops], ISA.genH(w, bc[0], bc[1], bc[2]));
    return d;
  }
  // exact identities: x * 1, x / 1, 1 * x, pow(1, y), x - (+0) (also for -0 and NaN; x + 0 is not one, since -0 + 0 = +0)
  simplify(name, args, t) {
    const isOne = a => a.c && a.c.every(x => x === 1);
    const isPlusZero = a => a.c && a.c.every(x => x === 0 && 1 / x > 0);
    if (name === 'SUB' && isPlusZero(args[1]) && WIDTH[args[0].t] === WIDTH[t]) return args[0];
    if (name === 'MUL' && isOne(args[1]) && WIDTH[args[0].t] === WIDTH[t]) return args[0];
    if (name === 'MUL' && isOne(args[0]) && WIDTH[args[1].t] === WIDTH[t]) return args[1];
    if (name === 'DIV' && isOne(args[1]) && WIDTH[args[0].t] === WIDTH[t]) return args[0];
    if (name === 'POW' && isOne(args[0])) return { t, c: Array(WIDTH[t]).fill(1) };
    return null;
  }
  intop(name, a, b, at, rt = 'i32') {
    a = a.t === 'aint' ? this.coerce(a, 'i32', at) : a; b = b.t === 'aint' ? this.coerce(b, 'i32', at) : b;
    if ((a.t !== 'i32' && a.t !== 'bool') || a.t !== b.t) err('E-SECT-TYPE', 'type:' + name.toLowerCase() + '-' + a.t + '-' + b.t, `${name} on ${a.t} and ${b.t}`, at);
    if (a.c && b.c) {
      const x = a.c[0], y = b.c[0];
      const f = { IADD: x + y, ISUB: x - y, IMUL: Math.imul(x, y), IOR: x | y, IAND: x & y, IXOR: x ^ y, IEQ: +(x === y), INE: +(x !== y), ILT: +(x < y), ILE: +(x <= y), IGT: +(x > y), IGE: +(x >= y), AND: +(x && y), OR: +(x || y) }[name];
      return { t: rt, c: [f | 0] };
    }
    const d = this.newval(rt);
    this.emit(name, [d, this.operand(a), this.operand(b)]);
    return d;
  }
  fcmp(name, a, b, at) {
    a = a.t === 'aint' ? this.coerce(a, 'f32', at) : a; b = b.t === 'aint' ? this.coerce(b, 'f32', at) : b;
    if (a.t !== 'f32' || b.t !== 'f32') err('E-SECT-TYPE', 'type:compare-' + a.t + '-' + b.t, `comparison of ${a.t} and ${b.t}`, at);
    if (a.c && b.c) { const x = a.c[0], y = b.c[0]; return { t: 'bool', c: [+({ FLT: x < y, FLE: x <= y, FGT: x > y, FGE: x >= y, FEQ: x === y, FNE: x !== y }[name])] }; }
    const d = this.newval('bool');
    this.emit(name, [d, this.operand(a), this.operand(b)]);
    return d;
  }
  // a value as a register value of exactly its own width (materialising constants as pool operands is done by operand())
  mov(dst, v) {   // dst: { r, o } register value, v: value of the same width
    const w = WIDTH[v.t];
    if (!v.c && !v.hitIn && v.r === dst.r && v.o === dst.o) return;
    if (w <= 4) this.emit('MOV' + w, [{ r: dst.r, o: dst.o }, this.operand(v)]);
    else this.emit('MOVN', [{ r: dst.r, o: dst.o }, this.operand(v)], w);
  }
  // put v into dst; if v was produced by the last instruction into a fresh temporary of the same width, retarget it
  into(dst, v) {
    if (this.retarget(dst, v)) return;
    this.mov(dst, v);
  }
  // Only an anonymous temporary may be retargeted: a value bound to a name or held in the load cache is read again
  // later, and those reads would find its old register empty.
  retarget(dst, v) {
    if (v.c || v.hitIn || v.o !== 0 || v.r.kind !== 'tmp' || v.r.shared) return false;
    const last = this.code[this.code.length - 1];
    if (!last || last.op === 'LABEL' || !last.a.length) return false;
    const d0 = last.a[0];
    if (!d0 || d0.r !== v.r || d0.o !== 0 || v.r.w !== WIDTH[v.t]) return false;
    if (this.defsOf(v.r) !== 1) return false;
    // the instruction must not read dst's words (it would read its own output); operands are other vregs or consts
    for (const x of last.a.slice(1)) if (x && x.r === dst.r) return false;
    last.a[0] = { r: dst.r, o: dst.o };
    this.defs.set(v.r, 0);
    this.defs.set(dst.r, (this.defs.get(dst.r) || 0) + 1);
    v.r.dead = true;
    return true;
  }
  defsOf(r) { return this.defs.get(r) || 0; }
}

// does the instruction's first argument define a register?
export function defArg0(ins) {
  const o = ISA.OP[ins.op];
  if (!o) return false;
  if (o.sig) return /^[dx]/.test(o.sig[0]);
  return ['call', 'gather', 'hld', 'hbool', 'lobe'].includes(o.special) || (o.special === 'gld');
}


const CSE_OPS = new Set([...Object.keys(ISA.ELEM), ...ISA.ELEM3.map(k => k + '3'), ...Object.keys(ISA.ELEM).map(k => 'V' + k),
  'ADD3S', 'SUB3S', 'MUL3S', 'DIV3S', 'SSUB3', 'SDIV3', 'SMUL3', 'SADD3', 'MIX3S', 'DOT3', 'CROSS', 'LEN3', 'NORM3', 'SAFENORM3',
  'VDOT', 'VLEN', 'VNORM', 'VSAFENORM', 'FLT', 'FLE', 'FGT', 'FGE', 'FEQ', 'FNE', 'SEL', 'SEL3', 'VSEL', 'SPLAT3', 'GATHER', 'GLD',
  'IADD', 'ISUB', 'IMUL', 'IOR', 'IAND', 'IXOR', 'IEQ', 'INE', 'ILT', 'ILE', 'IGT', 'IGE', 'AND', 'OR', 'NOT', 'INEG', 'ITOF', 'FTOI', 'HBOOL']);
const CSE_K = new Set(['fresnelDielectric', 'noise3', 'fbm3', 'voronoi3', 'tangentWorld', 'sellmeier', 'hash13', 'voronoiVec3'].map(n => ISA.KFUNC[n]));
for (const k of CSE_K) if (ISA.KFUNCS[k].effects) throw new Error('lower.js: a call with side effects cannot be merged');
// the width of operand i of an IR instruction (for the mutability test)
function operandWidth(ins, i) {
  const o = ISA.OP[ins.op];
  const spec = o.sig ? o.sig[i] : o.special === 'call' ? ISA.KFUNCS[ins.H].sig[i] : 's4';
  if (!spec) return 4;
  const k = spec.slice(1);
  if (/^\d$/.test(k)) return +k;
  if (k === 'L') return ISA.LOBE_WORDS; if (k === 'H') return ISA.HIT_WORDS;
  return ins.H & 7 || 4;
}
function sameConst(x, y) { return x && y && x.c && y.c && x.t === y.t && x.c.length === y.c.length && x.c.every((v, k) => Object.is(v, y.c[k])); }
// the Lobe fields after lobeNone(), as constants (isa.js LOBE_NONE)
function lobeNoneFields() {
  const m = new Map();
  for (const f of ISA.LOBE_ORDER) {
    const [off, w, t] = ISA.LOBE_FIELDS[f];
    const c = [];
    for (let k = 0; k < w; k++) { const x = ISA.LOBE_NONE[off + k]; c.push(Array.isArray(x) ? x[1] : fr(x)); }
    m.set(f, { t, c });
  }
  return m;
}
// names assigned anywhere in a statement list (by root identifier)
export function assignedNames(stmts, out = new Set()) {
  for (const s of stmts) {
    if (!s) continue;
    if (s.k === 'assign') { let t = s.target; while (t.k === 'member') t = t.obj; if (t.k === 'id') out.add(t.name); }
    if (s.k === 'if') { assignedNames(s.then, out); if (s.else) assignedNames(s.else, out); }
    if (s.k === 'block') assignedNames(s.body, out);
  }
  return out;
}
// is `name` mentioned anywhere in the function body other than in declaration `decl`'s initialiser?
function mentionsAfterDecl(top, decl, name) {
  const walk = (stmts) => stmts.some(s => (s === decl ? false : mentions(s, name)));
  return walk(top);
}
function mentionsVReg(code, r, except) {
  for (let i = 0; i < code.length; i++) { if (i === except) continue; const ins = code[i]; if (ins.op === 'LABEL') continue; if (ins.a.some(x => x && x.r === r)) return true; }
  return false;
}
export function endsInTerminator(code) {
  const last = code[code.length - 1];
  return last && (last.op === 'RET' || last.op === 'JMP');
}
export { WIDTH, VECW, VTYPE, isVec, isFloaty, fr, err, F, WGSL_ELEM, GENERATED, KNOWN_TYPES, sameConst, lobeNoneFields,
  mentionsAfterDecl };

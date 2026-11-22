// lower.js: lower the parsed sections to IR, one entry (dispatch function) at a time (design Section 4.2).
// Pure JavaScript, QuickJS-compatible.
//
// Values during lowering:
//   { t, c: [..] }                 a constant (f32 values already rounded to single precision; i32/bool/aint as integers)
//   { t, r: VReg, o }              a value in registers: word o of virtual register r (vectors are consecutive words)
//   { t: 'Hit', hitIn: true }      the material entry's input Hit (fields are loaded with HLD)
// IR instruction: { op, H, a: [args] } where each arg follows the opcode's operand spec (isa.js): a register operand
// { r, o }, a label { label }, an immediate { imm }, or the input Hit { hitIn: true }.
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
  // exact identities: x * 1, x / 1, 1 * x, pow(1, y)
  simplify(name, args, t) {
    const isOne = a => a.c && a.c.every(x => x === 1);
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

// ---------- the lowering of statements and expressions ----------
export class Lowerer extends EntryLowering {
  constructor(prog, entry) { super(prog, entry); this.scope = null; this.fnStack = []; }

  pushScope() { this.scope = { vars: new Map(), hld: new Map(), cse: new Map(), up: this.scope }; }
  popScope() { this.scope = this.scope.up; }
  lookup(name) { for (let s = this.scope; s; s = s.up) { if (s.vars.has(name)) return s.vars.get(name); if (s.fnBoundary) break; } return null; }
  bind(name, b) { if (b.kind === 'let' && b.val && b.val.r) b.val.r.shared = true; this.scope.vars.set(name, b); }

  // Inline function `ast` with argument values; ret(value) handles a return. Returns the function's value.
  inline(ast, argVals, opts = {}) {
    if (this.fnStack.includes(ast.name)) err('E-SECT-UNSUPPORTED', 'call:recursive', `recursive call of ${ast.name}`, ast.at);
    if (this.fnStack.length > 16) err('E-SECT-LIMIT', 'limit:inline-depth', `calls nested deeper than 16 (${this.fnStack.join(' > ')})`, ast.at);
    this.fnStack.push(ast.name);
    const saved = this.scope;
    this.scope = { vars: new Map(), hld: new Map(), cse: new Map(), up: saved, fnBoundary: true };   // names stop at the boundary, caches do not
    ast.params.forEach((p, i) => {
      const t = this.typeName(p.type);
      const v = argVals[i];
      if (!v) err('E-SECT-SYNTAX', 'call:arity', `${ast.name} called with ${argVals.length} arguments`, ast.at);
      this.bind(p.name, { kind: 'let', val: t === 'Hit' && v.hitIn ? v : this.coerce(v, t, p.type.at), name: p.name });
    });
    const retT = ast.ret ? this.typeName(ast.ret) : null;
    const fnCtx = { name: ast.name, retT, exit: null, result: null, retDest: opts.retDest || null, top: ast.body, assigned: assignedNames(ast.body), params: new Set(ast.params.map(p => p.name)) };
    // a Lobe/Hit variable that the function returns at its end can live in the caller's destination
    const last = ast.body[ast.body.length - 1];
    if (opts.retDest && last && last.k === 'return' && last.value && last.value.k === 'id') fnCtx.retVarName = last.value.name;
    const prevFn = this.fn; this.fn = fnCtx;
    const prevRest = this.rest; this.rest = [];
    const onReturn = opts.onReturn;
    let value = null;
    this.lowerBlock(ast.body, (v, at, isLast) => {
      if (onReturn) { onReturn(v, at); return; }
      if (isLast && !fnCtx.exit) { value = v; return; }
      // an early return: write the result variable and jump to the end
      if (!fnCtx.result) fnCtx.result = { t: v.t, r: this.vreg(WIDTH[v.t], 'var'), o: 0 };
      if (!fnCtx.exit) fnCtx.exit = this.label();
      this.into(fnCtx.result, v);
      this.emit('JMP', [fnCtx.exit]);
    }, true);
    if (fnCtx.exit) {
      if (value) { this.into(fnCtx.result, value); }
      this.place(fnCtx.exit);
      value = fnCtx.result;
    }
    this.fn = prevFn; this.rest = prevRest;
    this.scope = saved;
    this.fnStack.pop();
    if (!onReturn && retT && !value) err('E-SECT-SYNTAX', 'return:missing', `${ast.name} does not return a value on every path`, ast.at);
    return value;
  }

  typeName(ty) {
    if (!KNOWN_TYPES.has(ty.name)) err('E-SECT-UNSUPPORTED', 'type:' + ty.name, `type '${ty.name}' is not in the section subset`, ty.at);
    return ty.name;
  }

  // statements; ret(value, at, isLastOfFunction) handles return statements
  lowerBlock(stmts, ret, isFnBody = false) {
    this.pushScope();
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      this.rest.push(stmts.slice(i + 1));
      try {
        // the dispatch chain `if (X == 0) { return f0(...); } if (X == 1) { ... } ...`
        const n = this.dispatchChain(stmts, i);
        if (n) { i = this.lowerSwitch(stmts, i, n, ret); continue; }
        // a run of Lobe field assignments
        const run = this.lobeRun(stmts, i);
        if (run) { this.lowerLobeRun(stmts.slice(i, i + run)); i += run - 1; continue; }
        this.lowerStmt(s, ret, isFnBody && i === stmts.length - 1);
      } finally { this.rest.pop(); }
    }
    this.popScope();
  }
  restMentions(name) { return this.rest.some(r => mentions(r, name)); }

  lowerStmt(s, ret, isLast) {
    switch (s.k) {
      case 'empty': return;
      case 'block': return this.lowerBlock(s.body, ret);
      case 'let': {
        const t = this.typeName(s.type);
        const v = this.coerceDecl(this.expr(s.init), t, s);
        this.bind(s.name, { kind: 'let', val: v, name: s.name });
        return;
      }
      case 'var': return this.lowerVar(s);
      case 'assign': return this.lowerAssign(s);
      case 'if': return this.lowerIf(s, ret);
      case 'return': {
        if (!this.fn.retT) { if (s.value) err('E-SECT-TYPE', 'return:value-in-void', 'a value returned from a function without a result type', s.at); return ret(null, s.at, isLast); }
        let rv;
        if (this.fn.retDest && s.value.k === 'call' && GENERATED.test(s.value.callee) && this.prog.fns.get(s.value.callee))
          rv = this.inline(this.prog.fns.get(s.value.callee), s.value.args.map(a => this.expr(a)), { retDest: this.fn.retDest });
        else rv = this.expr(s.value);
        const v = this.coerceDecl(rv, this.fn.retT, s);
        return ret(v, s.at, isLast);
      }
      case 'expr': this.expr(s.e); return;
    }
    err('E-SECT-UNSUPPORTED', 'statement:' + s.k, `statement ${s.k}`, s.at);
  }
  coerceDecl(v, t, s) {
    if (v.t === t) return v;
    if (v.t === 'aint') return this.coerce(v, t, s.at);
    err('E-SECT-TYPE', 'type:decl-' + v.t + '-as-' + t, `${s.name ? s.name + ': ' : ''}${t} initialised with a ${v.t}`, s.at);
  }

  lowerVar(s) {
    const t = this.typeName(s.type);
    const assigned = this.fn.assigned.has(s.name);
    if (!assigned) {
      // never assigned: a let (lobeNone() would make a Lobe constant: materialise it, it is written field by field)
      if (t !== 'Lobe' && t !== 'Hit') {
        const v = s.init ? this.coerceDecl(this.expr(s.init), t, s) : { t, c: Array(WIDTH[t]).fill(0) };
        this.bind(s.name, { kind: 'let', val: v, name: s.name });
        return;
      }
    }
    // a Lobe that this function returns at its end lives in the caller's destination
    let r;
    if (this.fn.retDest && this.fn.retVarName === s.name && this.fn.retDest.r.w === WIDTH[t] && this.isTopLevel(s)) r = this.fn.retDest.r;
    if (t === 'Lobe') {
      if (s.init && !(s.init.k === 'call' && s.init.callee === 'lobeNone' && s.init.args.length === 0)) {
        if (!r) r = this.vreg(WIDTH[t], 'var');
        this.into({ r, o: 0 }, this.coerceDecl(this.expr(s.init), t, s));
      } else {
        if (!r) r = this.vreg(WIDTH[t], 'var');
        this.emit('LNONE', [{ r, o: 0 }]);    // `var L: Lobe;` is zero in WGSL, but Candela always writes lobeNone()
        if (!s.init) err('E-SECT-UNSUPPORTED', 'declaration:uninitialised-Lobe', 'var L: Lobe; without lobeNone() is not in the section subset', s.at);
        this.bind(s.name, { kind: 'var', t, r, name: s.name, lk: lobeNoneFields() });
        return;
      }
      this.bind(s.name, { kind: 'var', t, r, name: s.name, lk: new Map() });
      return;
    }
    const init = s.init ? this.coerceDecl(this.expr(s.init), t, s) : { t, c: Array(WIDTH[t]).fill(0) };
    // `var u: f32 = uIn;` where uIn is a parameter held in a register and never mentioned again: reuse its register
    if (s.init && s.init.k === 'id' && this.fn.params.has(s.init.name) && !init.c && !init.hitIn && init.r.kind !== 'const' && init.r.kind !== 'import'
        && !mentionsAfterDecl(this.fn.top, s, s.init.name) && WIDTH[init.t] === WIDTH[t] && (init.r.kind === 'arg' || init.r.kind === 'tmp' || init.r.kind === 'var')) {
      if (init.r.kind === 'tmp') init.r.kind = 'var';
      if (init.r.kind === 'arg') { init.r.mutable = init.r.mutable || new Set(); for (let k = 0; k < WIDTH[t]; k++) init.r.mutable.add(init.o + k); }
      this.bind(s.name, { kind: 'var', t, r: init.r, name: s.name, o: init.o });
      return;
    }
    r = r || this.vreg(WIDTH[t], 'var');
    this.into({ r, o: 0 }, init);
    this.bind(s.name, { kind: 'var', t, r, name: s.name, cv: init.c ? init : null });
  }
  isTopLevel(s) { return this.fn.top.includes(s); }

  lowerAssign(s) {
    const tg = s.target;
    if (tg.k === 'id') {
      const b = this.lookup(tg.name);
      if (!b) err('E-SECT-SYNTAX', 'name:unknown', `unknown name '${tg.name}'`, tg.at);
      if (b.kind !== 'var') err('E-SECT-TYPE', 'assign:let', `assignment to let '${tg.name}'`, tg.at);
      const v = this.coerceDecl(this.expr(s.value), b.t, { name: tg.name, at: s.at });
      this.into({ r: b.r, o: b.o || 0 }, v);
      b.cv = v.c ? v : null;
      return;
    }
    if (tg.k === 'member' && tg.obj.k === 'id') {
      const b = this.lookup(tg.obj.name);
      if (b && b.kind === 'var' && b.t === 'Lobe') { this.lowerLobeRun([s]); return; }
      if (b && b.kind === 'var' && isVec(b.t) && /^[xyzw]$/.test(tg.name)) {
        const idx = 'xyzw'.indexOf(tg.name);
        if (idx >= VECW[b.t]) err('E-SECT-TYPE', 'swizzle:range', `.${tg.name} of ${b.t}`, tg.at);
        const v = this.coerceDecl(this.expr(s.value), 'f32', { name: tg.obj.name + '.' + tg.name, at: s.at });
        this.into({ r: b.r, o: (b.o || 0) + idx }, v);
        b.cv = null;
        return;
      }
      if (b && b.kind === 'var' && isVec(b.t)) err('E-SECT-UNSUPPORTED', 'assign:swizzle', `assignment to the swizzle .${tg.name}`, tg.at);
    }
    err('E-SECT-UNSUPPORTED', 'assign:target', 'assignment target other than a variable, a Lobe field or a vector component', s.at);
  }

  // ---- if: genSurface's stochastic selection, general compare-and-branch, constant conditions ----
  lowerIf(s, ret) {
    const ch = this.choosePattern(s);
    if (ch) {
      const v = this.expr(ch.x);
      const vf = this.coerce(v, 'f32', s.at);
      const lElse = this.label(), lEnd = this.label();
      const needU = mentions(ch.then, ch.u.name) || mentions(ch.else, ch.u.name) || this.restMentions(ch.u.name);
      if (needU) this.emit('CHOOSE', [{ r: ch.ub.r, o: ch.ub.o || 0 }, this.operand(vf), lElse]);
      else this.emit('CHOOSE0', [this.operand({ t: 'f32', r: ch.ub.r, o: ch.ub.o || 0 }), this.operand(vf), lElse]);
      this.branches(ch.then, ch.else, ret, () => { if (!endsInTerminator(this.code)) this.emit('JMP', [lEnd]); this.place(lElse); });
      this.place(lEnd);
      return;
    }
    // a condition that folds to a constant keeps only the branch taken
    const c = this.expr(s.cond);
    if (c.t !== 'bool') err('E-SECT-TYPE', 'type:if-' + c.t, `if condition of type ${c.t}`, s.at);
    if (c.c) {
      if (c.c[0]) this.lowerBlock(s.then, ret); else if (s.else) this.lowerBlock(s.else, ret);
      return;
    }
    const lElse = this.label(), lEnd = this.label();
    const last = this.code[this.code.length - 1];
    // fuse `FLT b, x, y` + branch into IFLT when b has no other use
    if (s.cond.k === 'bin' && s.cond.op === '<' && last && last.op === 'FLT' && last.a[0].r === c.r && this.defsOf(c.r) === 1) {
      this.code.pop();
      this.emit('IFLT', [last.a[1], last.a[2], lElse]);
    } else this.emit('BRZ', [this.operand(c), lElse]);
    if (s.else) {
      this.branches(s.then, s.else, ret, () => { if (!endsInTerminator(this.code)) this.emit('JMP', [lEnd]); this.place(lElse); });
      this.place(lEnd);
    } else {
      this.branches(s.then, [], ret, () => {});
      this.place(lElse);
    }
  }
  // lower two exclusive branches; a variable's tracked constant survives the join only if both branches agree
  branches(thenS, elseS, ret, between) {
    const names = [...assignedNames(thenS), ...assignedNames(elseS)];
    const binds = [...new Set(names)].map(n => this.lookup(n)).filter(b => b && b.kind === 'var');
    const before = binds.map(b => b.cv), beforeL = binds.map(b => (b.lk ? new Map(b.lk) : null));
    this.lowerBlock(thenS, ret);
    const afterThen = binds.map(b => b.cv), afterThenL = binds.map(b => (b.lk ? new Map(b.lk) : null));
    binds.forEach((b, i) => { b.cv = before[i]; if (b.lk) b.lk = new Map(beforeL[i]); });
    between();
    this.lowerBlock(elseS, ret);
    binds.forEach((b, i) => {
      const x = afterThen[i], y = b.cv;
      b.cv = x && y && sameConst(x, y) ? x : null;
      if (b.lk) { const m = new Map(); for (const [f, v] of afterThenL[i]) if (b.lk.has(f) && sameConst(b.lk.get(f), v)) m.set(f, v); b.lk = m; }
    });
  }
  // if (u < X) { u = u / max(X, 1e-6); ... } else { u = (u - X) / max(1.0 - X, 1e-6); ... }
  // or     if (u < 0.5) { u = u * 2.0; ... } else { u = (u - 0.5) * 2.0; ... }
  choosePattern(s) {
    const c = s.cond;
    if (!s.else || s.else.length < 1 || s.then.length < 1) return null;
    if (c.k !== 'bin' || c.op !== '<' || c.a.k !== 'id') return null;
    const u = c.a, X = c.b, ub = this.lookup(u.name);
    if (!ub || ub.kind !== 'var' || ub.t !== 'f32') return null;
    const t0 = s.then[0], e0 = s.else[0];
    const isAssignU = st => st.k === 'assign' && st.target.k === 'id' && st.target.name === u.name;
    if (!isAssignU(t0) || !isAssignU(e0)) return null;
    const num = (n, v) => n.k === 'num' && +n.v === v;
    const id = n => n.k === 'id' && n.name === u.name;
    const T = t0.value, E = e0.value;
    const mixForm = T.k === 'bin' && T.op === '/' && id(T.a) && T.b.k === 'call' && T.b.callee === 'max' && T.b.args.length === 2 && sameExpr(T.b.args[0], X) && num(T.b.args[1], 1e-6)
      && E.k === 'bin' && E.op === '/' && E.a.k === 'bin' && E.a.op === '-' && id(E.a.a) && sameExpr(E.a.b, X)
      && E.b.k === 'call' && E.b.callee === 'max' && E.b.args.length === 2 && E.b.args[0].k === 'bin' && E.b.args[0].op === '-' && num(E.b.args[0].a, 1) && sameExpr(E.b.args[0].b, X) && num(E.b.args[1], 1e-6);
    const addForm = num(X, 0.5) && T.k === 'bin' && T.op === '*' && id(T.a) && num(T.b, 2)
      && E.k === 'bin' && E.op === '*' && E.a.k === 'bin' && E.a.op === '-' && id(E.a.a) && num(E.a.b, 0.5) && num(E.b, 2);
    if (!mixForm && !addForm) return null;
    return { u, ub, x: X, then: s.then.slice(1), else: s.else.slice(1) };
  }

  // ---- dispatch chains: if (X == 0) { return f(...); } if (X == 1) { return g(...); } ... ----
  dispatchChain(stmts, i) {
    const caseOf = st => st && st.k === 'if' && !st.else && st.cond.k === 'bin' && st.cond.op === '==' && st.cond.b.k === 'num' && !st.cond.b.float
      && st.then.length === 1 && st.then[0].k === 'return';
    if (!caseOf(stmts[i])) return 0;
    let n = 1;
    while (caseOf(stmts[i + n]) && sameExpr(stmts[i + n].cond.a, stmts[i].cond.a)) n++;
    return n >= 1 ? n : 0;
  }
  lowerSwitch(stmts, i, n, ret) {
    const x = this.coerce(this.expr(stmts[i].cond.a), 'i32', stmts[i].at);
    const cases = stmts.slice(i, i + n).map(st => ({ v: +st.cond.b.v, st }));
    const max = Math.max(...cases.map(c => c.v));
    const dense = cases.every(c => c.v >= 0) && max < 256;
    if (x.c) {   // constant selector: only the matching case (or the default) remains
      const hit = cases.find(c => c.v === x.c[0]);
      if (hit) { this.lowerStmt(hit.st.then[0], ret, false); this.unreachableRest = true; return stmts.length - 1; }
      return i + n - 1;
    }
    if (!dense) return this.lowerChainAsIfs(stmts, i, n, ret);
    const labels = cases.map(() => this.label()), lDef = this.label();
    const table = []; for (let k = 0; k <= max; k++) { const j = cases.findIndex(c => c.v === k); table.push(j >= 0 ? labels[j] : lDef); }
    this.emit('SWITCH', [this.operand(x), { imm: table.length }, ...table, lDef]);
    cases.forEach((c, j) => {
      this.place(labels[j]);
      this.pushScope();
      this.lowerStmt(c.st.then[0], ret, false);
      this.popScope();
      if (!endsInTerminator(this.code)) err('E-SECT-UNSUPPORTED', 'dispatch:fallthrough', 'a dispatch case that does not return', c.st.at);
    });
    this.place(lDef);
    return i + n - 1;
  }
  lowerChainAsIfs(stmts, i, n, ret) { for (let k = 0; k < n; k++) this.lowerIf(stmts[i + k], ret); return i + n - 1; }

  // ---- Lobe field runs (design Section 5.5, LOBE) ----
  lobeRun(stmts, i) {
    const isLobeField = st => st && st.k === 'assign' && st.target.k === 'member' && st.target.obj.k === 'id' && (() => { const b = this.lookup(st.target.obj.name); return b && b.kind === 'var' && b.t === 'Lobe'; })();
    if (!isLobeField(stmts[i])) return 0;
    const base = stmts[i].target.obj.name;
    let n = 1;
    while (isLobeField(stmts[i + n]) && stmts[i + n].target.obj.name === base) n++;
    return n;
  }
  lowerLobeRun(run) {
    const b = this.lookup(run[0].target.obj.name);
    const L = b.r;
    const pending = new Map();   // field -> operand value (moved by LOBE)
    const known = new Map();     // field -> value assigned in this run
    const flush = () => {
      if (!pending.size) return;
      const fields = ISA.LOBE_ORDER.filter(f => pending.has(f));
      if (fields.length === 1) {
        const f = fields[0], [off] = ISA.LOBE_FIELDS[f];
        this.mov({ r: L, o: off }, pending.get(f));
      } else {
        let mask = 0;
        for (const f of fields) mask |= 1 << ISA.LOBE_ORDER.indexOf(f);
        this.emit('LOBE', [{ r: L, o: 0 }, { imm: mask }, ...fields.map(f => this.operand(pending.get(f)))]);
      }
      pending.clear();
    };
    const readsField = (f) => { const [off, w] = ISA.LOBE_FIELDS[f]; for (const v of pending.values()) if (!v.c && v.r === L && v.o < off + w && v.o + WIDTH[v.t] > off) return true; return false; };
    this.lobeOverride = { r: L, known };
    try {
      for (const st of run) {
        const f = st.target.name;
        if (!ISA.LOBE_FIELDS[f]) err('E-SECT-TYPE', 'field:Lobe.' + f, `Lobe has no field '${f}'`, st.target.at);
        const [off, , ft] = ISA.LOBE_FIELDS[f];
        const v = this.coerceDecl(this.expr(st.value), ft, { name: 'L.' + f, at: st.at });
        // a field written with the value it already holds (a lobeNone() default, or itself) needs no move
        const same = (v.c && b.lk && b.lk.has(f) && sameConst(b.lk.get(f), v)) || (!v.c && !v.hitIn && v.r === L && v.o === off);
        if (same) { known.set(f, v); continue; }
        if (readsField(f)) flush();
        pending.delete(f);
        if (b.lk) { if (v.c) b.lk.set(f, v); else b.lk.delete(f); }
        if (!v.c && this.retarget({ r: L, o: off }, v)) { known.set(f, { t: ft, r: L, o: off }); continue; }
        pending.set(f, v);
        known.set(f, v);
      }
    } finally { this.lobeOverride = null; }
    flush();
  }

  // ---- expressions ----
  expr(e) {
    switch (e.k) {
      case 'num': {
        if (e.float) { const x = fr(+e.v); return { t: 'f32', c: [x] }; }
        const x = +e.v;
        if (!Number.isInteger(x) || Math.abs(x) > 0x7fffffff) err('E-SECT-UNSUPPORTED', 'literal:int-range', `integer literal ${e.v}`, e.at);
        return { t: 'aint', c: [x] };
      }
      case 'bool': return { t: 'bool', c: [e.v ? 1 : 0] };
      case 'id': return this.ident(e);
      case 'member': return this.member(e);
      case 'un': return this.unary(e);
      case 'bin': return this.binary(e);
      case 'call': return this.call(e);
    }
    err('E-SECT-UNSUPPORTED', 'expression:' + e.k, `expression ${e.k}`, e.at);
  }
  ident(e) {
    const b = this.lookup(e.name);
    if (b) return b.kind === 'let' ? b.val : b.cv ? b.cv : { t: b.t, r: b.r, o: b.o || 0 };
    if (e.name === 'SPECTRAL_ON') return { t: 'bool', c: [this.prog.spectral ? 1 : 0] };
    if (e.name === 'gTime' || e.name === 'gLam') {
      const d = this.newval('f32');
      this.emit('GLD', [d], e.name === 'gTime' ? 0 : 1);
      return d;
    }
    if (['PI', 'TAU', 'INV_PI', 'BIG', 'EPS'].includes(e.name)) return { t: 'f32', c: [fr({ PI: 3.14159265358979, TAU: 6.28318530717959, INV_PI: 0.318309886183791, BIG: 1e30, EPS: 0.0002 }[e.name])] };
    err('E-SECT-UNSUPPORTED', 'name:' + e.name, `name '${e.name}' is not a local, a parameter or a kernel global the interpreter has`, e.at);
  }
  member(e) {
    // a Lobe field read inside a run of field assignments resolves to the value assigned earlier in the run
    if (this.lobeOverride && e.obj.k === 'id') {
      const b = this.lookup(e.obj.name);
      if (b && b.r === this.lobeOverride.r && this.lobeOverride.known.has(e.name)) return this.lobeOverride.known.get(e.name);
    }
    if (e.obj.k === 'id') {
      const b = this.lookup(e.obj.name);
      if (b && b.kind === 'var' && b.t === 'Lobe' && b.lk && b.lk.has(e.name)) return b.lk.get(e.name);
    }
    const o = this.expr(e.obj);
    if (o.hitIn) return this.hitField(e);
    if (o.t === 'Hit' || o.t === 'Lobe') {
      const F = o.t === 'Hit' ? ISA.HIT_FIELDS : ISA.LOBE_FIELDS;
      const fd = F[e.name];
      if (!fd) err('E-SECT-TYPE', 'field:' + o.t + '.' + e.name, `${o.t} has no field '${e.name}'`, e.at);
      const [off, , ft] = fd;
      if (ft === 'bool') {   // a bool member is one byte padded to a word: extract it
        const d = this.newval('bool');
        this.emit('HBOOL', [d, { r: o.r, o: o.o }, { imm: off }]);
        return d;
      }
      return { t: ft, r: o.r, o: o.o + off };
    }
    if (isVec(o.t)) return this.swizzle(o, e.name, e.at);
    err('E-SECT-TYPE', 'member:' + o.t, `.${e.name} on ${o.t}`, e.at);
  }
  hitField(e) {
    const fd = ISA.HIT_FIELDS[e.name];
    if (!fd) err('E-SECT-TYPE', 'field:Hit.' + e.name, `Hit has no field '${e.name}'`, e.at);
    const [off, w, ft] = fd;
    if (ft === 'bool') err('E-SECT-UNSUPPORTED', 'field:Hit.' + e.name + '-input', `the input hit's bool field ${e.name}`, e.at);
    // one load per field per scope (scoped, so a load inside a branch is not reused after it)
    for (let s = this.scope; s; s = s.up) if (s.hld.has(e.name)) return s.hld.get(e.name);
    // a load is visible in the scope of the whole function body: place it at the scope where the hit is bound
    const d = this.newval(ft);
    this.emit('HLD', [d, { imm: off }], w);
    d.r.shared = true;
    this.scope.hld.set(e.name, d);
    return d;
  }
  swizzle(o, sw, at) {
    const n = VECW[o.t];
    if (!/^[xyzw]{1,4}$/.test(sw) && !/^[rgba]{1,4}$/.test(sw)) err('E-SECT-TYPE', 'member:' + o.t, `.${sw} on ${o.t}`, at);
    const idx = [...sw].map(ch => ('xyzw'.indexOf(ch) >= 0 ? 'xyzw' : 'rgba').indexOf(ch));
    if (idx.some(k => k >= n)) err('E-SECT-TYPE', 'swizzle:range', `.${sw} on ${o.t}`, at);
    const t = VTYPE[idx.length];
    if (o.c) return { t, c: idx.map(k => o.c[k]) };
    if (idx.every((k, j) => k === idx[0] + j)) return { t, r: o.r, o: o.o + idx[0] };
    const d = this.newval(t);
    let pat = 0; idx.forEach((k, j) => { pat |= k << (2 * j); });
    this.emit('GATHER', [d, { r: o.r, o: o.o }, { imm: pat }], idx.length);
    return d;
  }
  unary(e) {
    const a = this.expr(e.a);
    if (e.op === '-') {
      if (a.t === 'aint') return { t: 'aint', c: [-a.c[0]] };
      if (a.t === 'i32') { if (a.c) return { t: 'i32', c: [-a.c[0] | 0] }; const d = this.newval('i32'); this.emit('INEG', [d, this.operand(a)]); return d; }
      return this.elem('NEG', [a], e.at);
    }
    if (e.op === '!') {
      if (a.t !== 'bool') err('E-SECT-TYPE', 'type:not-' + a.t, `! on ${a.t}`, e.at);
      if (a.c) return { t: 'bool', c: [a.c[0] ? 0 : 1] };
      const d = this.newval('bool'); this.emit('NOT', [d, this.operand(a)]); return d;
    }
    err('E-SECT-UNSUPPORTED', 'operator:' + e.op, `unary ${e.op}`, e.at);
  }
  binary(e) {
    // (envL(d) + sunL(d)), as genCustomKernel emits it, is one kernel call
    if (e.op === '+' && e.a.k === 'call' && e.a.callee === 'envL' && e.b.k === 'call' && e.b.callee === 'sunL' && e.a.args.length === 1 && e.b.args.length === 1 && sameExpr(e.a.args[0], e.b.args[0]))
      return this.kcall('envSun', [this.vec(this.expr(e.a.args[0]), 'vec3f', e.at)], e.at);
    const a = this.expr(e.a), b = this.expr(e.b);
    const intish = t => t === 'i32' || t === 'aint';
    switch (e.op) {
      case '+': case '-': case '*': case '/': {
        if (intish(a.t) && intish(b.t)) {
          if (a.t === 'aint' && b.t === 'aint') { const x = a.c[0], y = b.c[0]; const r = e.op === '+' ? x + y : e.op === '-' ? x - y : e.op === '*' ? x * y : Math.trunc(x / y); return { t: 'aint', c: [r] }; }
          if (e.op === '/') err('E-SECT-UNSUPPORTED', 'operator:int-div', 'integer division', e.at);
          return this.intop({ '+': 'IADD', '-': 'ISUB', '*': 'IMUL' }[e.op], a, b, e.at);
        }
        return this.elem({ '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV' }[e.op], [a, b], e.at);
      }
      case '<': case '<=': case '>': case '>=': case '==': case '!=': {
        if (intish(a.t) && intish(b.t) && !(a.t === 'aint' && b.t === 'aint')) return this.intop({ '<': 'ILT', '<=': 'ILE', '>': 'IGT', '>=': 'IGE', '==': 'IEQ', '!=': 'INE' }[e.op], a, b, e.at, 'bool');
        if (a.t === 'bool' && b.t === 'bool' && (e.op === '==' || e.op === '!=')) return this.intop(e.op === '==' ? 'IEQ' : 'INE', a, b, e.at, 'bool');
        return this.fcmp({ '<': 'FLT', '<=': 'FLE', '>': 'FGT', '>=': 'FGE', '==': 'FEQ', '!=': 'FNE' }[e.op], a, b, e.at);
      }
      case '&&': case '||': {
        if (a.t !== 'bool' || b.t !== 'bool') err('E-SECT-TYPE', 'type:logic-' + a.t, `${e.op} on ${a.t} and ${b.t}`, e.at);
        if (a.c && !b.c && a.c[0] === (e.op === '&&' ? 1 : 0)) return b;
        if (b.c && !a.c && b.c[0] === (e.op === '&&' ? 1 : 0)) return a;
        return this.intop(e.op === '&&' ? 'AND' : 'OR', a, b, e.at, 'bool');
      }
      case '|': case '&': case '^': {
        if (!intish(a.t) || !intish(b.t)) err('E-SECT-TYPE', 'type:bits-' + a.t, `${e.op} on ${a.t} and ${b.t}`, e.at);
        return this.intop({ '|': 'IOR', '&': 'IAND', '^': 'IXOR' }[e.op], a, b, e.at);
      }
    }
    err('E-SECT-UNSUPPORTED', 'operator:' + e.op, `operator ${e.op}`, e.at);
  }

  // a value of a given vector/scalar type (abstract ints become f32)
  vec(v, t, at) { if (v.t === 'aint') v = this.coerce(v, 'f32', at); if (v.t !== t) err('E-SECT-TYPE', 'type:arg-' + v.t + '-as-' + t, `${v.t} where ${t} is needed`, at); return v; }
  immInt(v, at, what) { if (!v.c || (v.t !== 'aint' && v.t !== 'i32')) err('E-SECT-UNSUPPORTED', 'call:fbm3-nonconst-' + what, `fbm3's ${what} must be an integer literal`, at); return v.c[0]; }

  call(e) {
    const name = e.callee, at = e.at;
    const args = () => e.args.map(a => this.expr(a));
    // constructors
    if (VECW[name] || name === 'f32' || name === 'i32' || name === 'bool') return this.construct(name, args(), at);
    if (name === 'U') {
      const a = e.args.map(x => this.expr(x));
      if (a.length !== 1 || !a[0].c || (a[0].t !== 'aint' && a[0].t !== 'i32')) err('E-SECT-UNSUPPORTED', 'call:U-nonconst', 'U(row) with a row that is not an integer literal', at);
      return this.prog.importRow(a[0].c[0], at);
    }
    // generated functions and light kernel functions: inlined
    if (GENERATED.test(name) || INLINE_KERNEL_WGSL[name]) {
      const ast = GENERATED.test(name) ? this.prog.fns.get(name) : this.prog.kernelFn(name);
      if (!ast) err('E-SECT-CALL', 'call:' + name, `call to '${name}', which the sections do not define`, at);
      return this.inline(ast, args());
    }
    if (name === 'lobeNone') { const d = this.newval('Lobe'); this.emit('LNONE', [d]); return d; }
    if (name === 'select') {
      const [f, t, c] = args();
      if (!c || c.t !== 'bool') err('E-SECT-TYPE', 'type:select-cond', 'select condition is not a bool', at);
      if (c.c) return c.c[0] ? t : f;
      let ff = f, tt = t;
      if (ff.t === 'aint') ff = this.coerce(ff, tt.t === 'i32' ? 'i32' : 'f32', at);
      if (tt.t === 'aint') tt = this.coerce(tt, ff.t === 'i32' ? 'i32' : 'f32', at);
      if (ff.t !== tt.t) err('E-SECT-TYPE', 'type:select-mixed', `select of ${ff.t} and ${tt.t}`, at);
      const w = WIDTH[ff.t], d = this.newval(ff.t);
      if (w === 1) this.emit('SEL', [d, this.operand(c), this.operand(tt), this.operand(ff)]);
      else if (w === 3) this.emit('SEL3', [d, this.operand(c), this.operand(tt), this.operand(ff)]);
      else if (w <= 4) this.emit('VSEL', [d, this.operand(c), this.operand(tt), this.operand(ff)], ISA.genH(w));
      else err('E-SECT-UNSUPPORTED', 'call:select-' + ff.t, `select of ${ff.t}`, at);
      return d;
    }
    if (WGSL_ELEM[name]) {
      const [op, n] = WGSL_ELEM[name];
      const a = args();
      if (a.length !== n) err('E-SECT-SYNTAX', 'call:arity-' + name, `${name} takes ${n} arguments`, at);
      // WGSL: mix(vec, vec, f32) and smoothstep/step/clamp broadcast only as written; elem() checks widths
      return this.elem(op, a, at);
    }
    switch (name) {
      case 'dot': {
        const [a, b] = args().map(x => (x.t === 'aint' ? this.coerce(x, 'f32', at) : x));
        if (!isVec(a.t) || a.t !== b.t) err('E-SECT-TYPE', 'type:dot', `dot of ${a.t} and ${b.t}`, at);
        const w = VECW[a.t];
        if (a.c && b.c) { let s = 0; for (let i = 0; i < w; i++) s = fr(s + fr(a.c[i] * b.c[i])); return { t: 'f32', c: [s] }; }
        const d = this.newval('f32');
        if (w === 3) this.emit('DOT3', [d, this.operand(a), this.operand(b)]); else this.emit('VDOT', [d, this.operand(a), this.operand(b)], ISA.genH(w));
        return d;
      }
      case 'cross': {
        const [a, b] = args();
        if (a.t !== 'vec3f' || b.t !== 'vec3f') err('E-SECT-TYPE', 'type:cross', `cross of ${a.t} and ${b.t}`, at);
        const d = this.newval('vec3f'); this.emit('CROSS', [d, this.operand(a), this.operand(b)]); return d;
      }
      case 'length': return this.lengthOf(args()[0], at);
      case 'normalize': case 'safeNorm': case 'safeNorm2': case 'safeNorm4': {
        const [a] = args();
        if (!isVec(a.t)) err('E-SECT-TYPE', 'type:' + name, `${name} of ${a.t}`, at);
        const want = { safeNorm: 'vec3f', safeNorm2: 'vec2f', safeNorm4: 'vec4f' }[name];
        if (want && a.t !== want) err('E-SECT-TYPE', 'type:' + name, `${name} of ${a.t}`, at);
        const d = this.newval(a.t), safe = name !== 'normalize';
        if (a.t === 'vec3f') this.emit(safe ? 'SAFENORM3' : 'NORM3', [d, this.operand(a)]);
        else this.emit(safe ? 'VSAFENORM' : 'VNORM', [d, this.operand(a)], ISA.genH(VECW[a.t]));
        return d;
      }
      case 'distance': { const [a, b] = args(); return this.lengthOf(this.elem('SUB', [a, b], at), at); }
      case 'reflect': {
        const [i, n] = args();
        if (i.t !== 'vec3f' || n.t !== 'vec3f') err('E-SECT-TYPE', 'type:reflect', `reflect of ${i.t}`, at);
        // i - n * (2.0 * dot(n, i)), as the prototype prologue computes it
        const dn = this.newval('f32'); this.emit('DOT3', [dn, this.operand(n), this.operand(i)]);
        const k = this.elem('MUL', [{ t: 'f32', c: [2] }, dn], at);
        return this.elem('SUB', [i, this.elem('MUL', [n, k], at)], at);
      }
      // kernel functions
      case 'fresnelDielectric': { const [c, eta] = args(); return this.kcall(name, [this.vec(c, 'f32', at), this.vec(eta, 'f32', at)], at); }
      case 'noise3': case 'hash13': { const [p] = args(); return this.kcall(name, [this.vec(p, 'vec3f', at)], at); }
      case 'voronoi3': case 'voronoiVec3': { const [p] = args(); return this.kcall(name, [this.vec(p, 'vec3f', at)], at); }
      case 'fbm3': {
        const a = args();
        if (a.length !== 5) err('E-SECT-SYNTAX', 'call:arity-fbm3', 'fbm3 takes 5 arguments', at);
        const oct = this.immInt(a[1], at, 'octave count'), mode = this.immInt(a[4], at, 'mode');
        if (oct < 0 || oct > 16 || mode < 0 || mode > 2) err('E-SECT-LIMIT', 'call:fbm3-range', `fbm3 with ${oct} octaves, mode ${mode} (at most 16 octaves, mode 0-2)`, at);
        return this.kcall(name, [this.vec(a[0], 'vec3f', at), this.vec(a[2], 'f32', at), this.vec(a[3], 'f32', at), { imm: oct }, { imm: mode }], at);
      }
      case 'tangentWorld': {
        const [h, tl, rot, N] = args();
        if (h.t !== 'Hit') err('E-SECT-TYPE', 'type:tangentWorld', 'tangentWorld needs a Hit', at);
        return this.kcall(name, [h, this.vec(tl, 'vec3f', at), this.vec(rot, 'f32', at), this.vec(N, 'vec3f', at)], at);
      }
      case 'sellmeier': { const [l, B, C] = args(); return this.kcall(name, [this.vec(l, 'f32', at), this.vec(B, 'vec3f', at), this.vec(C, 'vec3f', at)], at); }
      case 'traceScene': { const [o, d, tm] = args(); return this.kcall(name, [this.vec(o, 'vec3f', at), this.vec(d, 'vec3f', at), this.vec(tm, 'f32', at)], at); }
      case 'occluded': { const [o, d, tm] = args(); return this.kcall(name, [this.vec(o, 'vec3f', at), this.vec(d, 'vec3f', at), this.vec(tm, 'f32', at)], at); }
      case 'hitAlbedo': case 'hitEmission': {
        const [h, wo] = args();
        if (h.t !== 'Hit') err('E-SECT-TYPE', 'type:' + name, `${name} needs a Hit`, at);
        return this.kcall(name, [h, this.vec(wo, 'vec3f', at)], at);
      }
      case 'rnd': return this.kcall('rnd', [], at);
      case 'rnd2': return this.kcall('rnd2', [], at);
      case 'toWorld': {
        // toWorld(frameOf(N), cosHemi(rnd2())), genCustomKernel's cosine-hemisphere sample
        const [fo, ch] = e.args;
        if (fo && ch && fo.k === 'call' && fo.callee === 'frameOf' && ch.k === 'call' && ch.callee === 'cosHemi' && ch.args.length === 1 && ch.args[0].k === 'call' && ch.args[0].callee === 'rnd2' && ch.args[0].args.length === 0)
          return this.kcall('cosHemiN', [this.vec(this.expr(fo.args[0]), 'vec3f', at)], at);
        break;
      }
      case 'length2': break;
    }
    err('E-SECT-CALL', 'call:' + name, `call to '${name}', which is neither a WGSL built-in nor a kernel function the interpreter has`, at);
  }
  lengthOf(a, at) {
    if (a.t === 'f32' || a.t === 'aint') return this.elem('ABS', [a], at);
    if (!isVec(a.t)) err('E-SECT-TYPE', 'type:length', `length of ${a.t}`, at);
    if (a.c) { let s2 = 0; for (const x of a.c) s2 = fr(s2 + fr(x * x)); return { t: 'f32', c: [fr(Math.sqrt(s2))] }; }
    const d = this.newval('f32');
    if (a.t === 'vec3f') this.emit('LEN3', [d, this.operand(a)]); else this.emit('VLEN', [d, this.operand(a)], ISA.genH(VECW[a.t]));
    return d;
  }
  kcall(name, args, at) {
    const k = ISA.KFUNC[name];
    const f = ISA.KFUNCS[k];
    if (f.custom && this.entry.name !== 'customKernel') err('E-SECT-CALL', 'call:' + name + '-outside-custom', `${name} is only available in a custom integrator`, at);
    this.kfuncs.add(name);
    const dspec = f.sig[0];
    const t = { d1: name === 'occluded' ? 'bool' : 'f32', d2: 'vec2f', d3: 'vec3f', d4: 'vec4f', dH: 'Hit' }[dspec];
    const d = this.newval(t);
    const ops = args.map(a => (a.imm !== undefined ? a : a.hitIn ? { hitIn: true } : this.operand(a)));
    this.emit('CALL', [d, ...ops], k);
    return d;
  }
  construct(T, a, at) {
    if (T === 'f32') { const v = a[0]; if (v.t === 'aint') return this.coerce(v, 'f32', at); if (v.t === 'f32') return v; if (v.t === 'i32') { if (v.c) return { t: 'f32', c: [fr(v.c[0])] }; const d = this.newval('f32'); this.emit('ITOF', [d, this.operand(v)]); return d; } err('E-SECT-TYPE', 'type:f32-of-' + v.t, `f32(${v.t})`, at); }
    if (T === 'i32') { const v = a[0]; if (v.t === 'aint' || v.t === 'i32') return this.coerce(v, 'i32', at); if (v.t === 'f32') { if (v.c) return { t: 'i32', c: [Math.trunc(v.c[0]) | 0] }; const d = this.newval('i32'); this.emit('FTOI', [d, this.operand(v)]); return d; } err('E-SECT-TYPE', 'type:i32-of-' + v.t, `i32(${v.t})`, at); }
    if (T === 'bool') err('E-SECT-UNSUPPORTED', 'call:bool', 'bool(...) conversion', at);
    const n = VECW[T];
    a = a.map(v => (v.t === 'aint' ? this.coerce(v, 'f32', at) : v));
    for (const v of a) if (!isFloaty(v.t)) err('E-SECT-TYPE', 'type:' + T + '-of-' + v.t, `${T} from ${v.t}`, at);
    if (a.length === 1 && a[0].t === 'f32') {   // splat
      const v = a[0];
      if (v.c) return { t: T, c: Array(n).fill(v.c[0]) };
      const d = this.newval(T);
      if (n === 3) this.emit('SPLAT3', [d, this.operand(v)]);
      else for (let i = 0; i < n; i++) this.emit('MOV1', [{ r: d.r, o: i }, this.operand(v)]);
      return d;
    }
    if (a.length === 1 && a[0].t === T) return a[0];
    const total = a.reduce((s, v) => s + WIDTH[v.t], 0);
    if (total !== n) err('E-SECT-TYPE', 'type:' + T + '-arity', `${T} from ${total} components`, at);
    if (a.every(v => v.c)) return { t: T, c: a.flatMap(v => v.c) };
    // components that are already consecutive words of one register
    if (a.every(v => !v.c && v.r === a[0].r) && a.every((v, j) => v.o === a[0].o + a.slice(0, j).reduce((s, x) => s + WIDTH[x.t], 0))) return { t: T, r: a[0].r, o: a[0].o };
    const d = this.newval(T);
    let o = 0;
    for (const v of a) { if (!this.alias({ r: d.r, o }, v)) this.mov({ r: d.r, o }, v); o += WIDTH[v.t]; }
    return d;
  }
  // Make a fresh single-definition temporary v live at dst (a word range of a constructor result, which is written
  // once per word): its defining instruction writes dst, and every operand naming v is resolved to dst later.
  alias(dst, v) {
    if (v.c || v.hitIn || v.o !== 0 || v.r.kind !== 'tmp' || v.r.alias || v.r === dst.r || v.r.w !== WIDTH[v.t] || this.defsOf(v.r) !== 1) return false;
    v.r.alias = { r: dst.r, o: dst.o };
    return true;
  }
}

const CSE_OPS = new Set([...Object.keys(ISA.ELEM), ...ISA.ELEM3.map(k => k + '3'), ...Object.keys(ISA.ELEM).map(k => 'V' + k),
  'ADD3S', 'SUB3S', 'MUL3S', 'DIV3S', 'SSUB3', 'SDIV3', 'SMUL3', 'SADD3', 'MIX3S', 'DOT3', 'CROSS', 'LEN3', 'NORM3', 'SAFENORM3',
  'VDOT', 'VLEN', 'VNORM', 'VSAFENORM', 'FLT', 'FLE', 'FGT', 'FGE', 'FEQ', 'FNE', 'SEL', 'SEL3', 'VSEL', 'SPLAT3', 'GATHER', 'GLD',
  'IADD', 'ISUB', 'IMUL', 'IOR', 'IAND', 'IXOR', 'IEQ', 'INE', 'ILT', 'ILE', 'IGT', 'IGE', 'AND', 'OR', 'NOT', 'INEG', 'ITOF', 'FTOI', 'HBOOL']);
const CSE_K = new Set(['fresnelDielectric', 'noise3', 'fbm3', 'voronoi3', 'tangentWorld', 'sellmeier', 'hash13', 'voronoiVec3'].map(n => ISA.KFUNC[n]));
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
export { WIDTH, VECW, isVec };

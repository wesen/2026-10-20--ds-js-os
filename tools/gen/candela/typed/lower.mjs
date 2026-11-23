// lower.mjs: one WGSL function lowered to one Typed function, scalarized (PICOCALC-CANDELA-TYPED).
//
// Typed has f32, i32 and bool scalars, records reached through references, buffers and no vectors, so:
//   - a vector is its components: a vec3f local `p` is the three f32 locals p__x, p__y, p__z, a vector parameter three
//     parameters, a vector result the first component as the result and the others in the kernel record's r1..r3
//     (read by the caller right after the call);
//   - a struct is a record; each struct local or temporary of a function owns one record in the function's static
//     frame (WGSL has no recursion, so one frame per function is enough), a struct parameter is the caller's record
//     (WGSL parameters are immutable), and a struct result is written into a record the caller passes (q_ret);
//   - parameters beyond ilp32f's eight per register class go through the callee's frame;
//   - `continue`, which Typed lacks, is folded into the following statements or becomes a one-shot inner loop;
//   - the math built-ins are those of the C++ kernel's CPU arm (cdl_math.h with CDL_FAST_FLOOR, CDL_FAST_TRIG,
//     CDL_FAST_EXP), in Typed helpers, or compiler/typed/lib/math.typed where libm is called.
// Evaluation order is WGSL's: operands left to right; every call with an effect on module state, every read of a
// module variable and every call that returns a vector or a struct is bound to a local at the point it is evaluated.
import { VECTORS, COMPONENTS, isVec, isScalar, vecOf, RESERVED, flit, ilit, isAtom, sc, TYPED, DEFAULT, LowerError } from './values.mjs';
import { CallMethods } from './lower-calls.mjs';
import { StatementMethods } from './lower-statements.mjs';

export { LowerError };
const CMP = { '==': '===', '!=': '!==', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };

export class FunctionLowerer {
  // prog: the Program (program.mjs); fn: { name, ast, module, sig }
  constructor(prog, fn) {
    this.prog = prog; this.fn = fn; this.ast = fn.ast; this.sig = fn.sig;
    this.used = new Set(['q_k', 'q_fr', 'q_ret']);
    this.scopes = [new Map()];
    this.out = [[]];
    this.prologue = new Map();     // local -> line, in first-use order
    this.frame = [];               // [field, type] of this function's frame record
    this.frameNames = new Set();
    this.loops = [];               // { oneShot, brk }
    this.n = 0;
  }
  fail(msg, node) { throw new LowerError(`${this.fn.name}${node && node.at ? ' (' + node.at + ')' : ''}: ${msg}`); }

  // ---- output ----
  emit(line) { this.out[this.out.length - 1].push(line); }
  capture(f) { this.out.push([]); const v = f(); const lines = this.out.pop(); return { lines, v }; }
  block(lines) { for (const l of lines) this.emit('    ' + l); }
  fresh(base) {
    base = base.replace(/\W/g, '_');
    if (RESERVED.has(base)) base += '_';
    let name = base, k = 1;
    while (this.used.has(name) || RESERVED.has(name)) name = `${base}_${k++}`;
    this.used.add(name);
    return name;
  }
  temp() { return this.fresh('q_t' + this.n++); }
  needK(node) { if (!this.sig.needsK) this.fail('internal: needs the kernel record but its signature has none', node); }
  framePtr(node) {
    this.needK(node);
    if (!this.prologue.has('q_fr')) this.prologue.set('q_fr', `const q_fr = q_k.f_${this.fn.name};`);
    return 'q_fr';
  }
  frameField(base, type, kind = 'local') {
    let name = base.replace(/\W/g, '_'), k = 1;
    if (RESERVED.has(name)) name += '_';
    while (this.frameNames.has(name)) name = `${base}_${k++}`;
    this.frameNames.add(name);
    this.frame.push([name, type, kind]);
    return name;
  }
  buffer(field) {        // a buffer of the kernel record, bound once in the prologue
    this.needK();
    const local = 'q_' + field;
    if (!this.prologue.has(local)) { this.prologue.set(local, `const ${local} = q_k.${field};`); this.used.add(local); }
    return local;
  }
  // a fresh struct record of this function's frame, bound to a local
  slot(struct, base) {
    const fr = this.framePtr();
    const field = this.frameField(base, struct);
    const local = this.fresh(base);
    this.emit(`const ${local} = ${fr}.${field};`);
    return local;
  }

  // ---- scopes ----
  bind(name, b) { this.scopes[this.scopes.length - 1].set(name, b); return b; }
  lookup(name, node) {
    for (let i = this.scopes.length - 1; i >= 0; i--) if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    const g = this.prog.lookupModule(name, this.fn.module);
    if (g) return g;
    this.fail('unknown name ' + name, node);
  }
  scoped(f) { this.scopes.push(new Map()); try { return f(); } finally { this.scopes.pop(); } }

  // ---- values ----
  coerce(v, t, node) {
    if (v.t === t) return v;
    if (v.t === 'aint') {
      if (t === 'f32') return sc('f32', flit(v.v));
      if (t === 'i32') return sc('i32', ilit(v.v));
      if (t === 'u32') { if (v.v < 0) this.fail('negative u32 literal', node); return sc('u32', ilit(v.v)); }
    }
    if (isVec(t) && isScalar(v.t)) this.fail(`a scalar where ${t} is expected`, node);
    this.fail(`expected ${t}, got ${v.t}`, node);
  }
  concrete(v) { return v.t === 'aint' ? this.coerce(v, 'i32') : v; }
  atom(v) {
    if (v.t === 'aint') return v;
    if (isVec(v.t)) return { t: v.t, c: v.c.map(c => this.atom(c)) };
    if (v.ref !== undefined) return v;
    if (isAtom(v.e)) return v;
    const name = this.temp();
    this.emit(`const ${name}: ${TYPED[v.t]} = ${v.e};`);
    return { ...v, e: name };
  }
  bindTemp(v) {           // always a fresh local (for values read after a later write)
    if (v.t === 'aint') return v;
    if (isVec(v.t)) return { t: v.t, c: v.c.map(c => this.bindTemp(c)) };
    const name = this.temp();
    this.emit(`const ${name}: ${TYPED[v.t]} = ${v.e};`);
    return { ...v, e: name };
  }
  comps(v, n, node) {      // a vector's components, or a scalar broadcast to n
    if (isVec(v.t)) { if (v.c.length !== n) this.fail('vector sizes differ', node); return v.c; }
    const a = this.atom(v);
    return Array(n).fill(a);
  }

  // ---- expressions ----
  ex(node) {
    switch (node.k) {
      case 'num': {
        if (node.suffix === 'u') return sc('u32', ilit(+node.v));
        if (node.float) return sc('f32', flit(parseFloat(node.v)));
        return { t: 'aint', v: +node.v };
      }
      case 'bool': return sc('bool', String(node.v));
      case 'id': return this.read(this.lookup(node.name, node), node);
      case 'member': return this.member(this.ex(node.obj), node.name, node);
      case 'index': return this.index(node);
      case 'un': return this.unary(node);
      case 'bin': return this.binary(node);
      case 'call': return this.call(node);
      case 'bitcast': {
        const a = this.concrete(this.ex(node.a));
        if (node.to === 'u32' || node.to === 'i32') { if (a.t !== 'f32') this.fail('bitcast to an integer needs an f32', node); return sc(node.to, `Math.bitsOf(${a.e})`); }
        if (node.to === 'f32') { if (a.t !== 'u32' && a.t !== 'i32') this.fail('bitcast to f32 needs an integer', node); return sc('f32', `Math.fromBits(${a.e})`); }
        this.fail('bitcast to ' + node.to, node);
      }
    }
    this.fail('expression ' + node.k, node);
  }
  read(b, node) {
    switch (b.k) {
      case 'scalar': return sc(b.t, b.name);
      case 'vec': return { t: b.t, c: b.comps.map(c => sc(VECTORS[b.t][0], c)) };
      case 'struct': return { t: b.t, ref: b.ref, binding: b };
      case 'const': return b.value;
      case 'spectral': return b.value !== undefined ? sc('bool', String(b.value)) : (this.needK(node), sc('bool', 'q_k.' + (b.field || 'spectral')));
      case 'global': {
        this.needK(node);
        if (isVec(b.t)) return this.bindTemp({ t: b.t, c: b.fields.map(f => sc(VECTORS[b.t][0], 'q_k.' + f)) });
        return this.bindTemp(sc(b.t, 'q_k.' + b.field));
      }
      case 'array': this.fail('an array used as a value', node);
    }
    this.fail('cannot read ' + b.k, node);
  }
  member(v, name, node) {
    if (isVec(v.t)) {
      const [elem, n] = VECTORS[v.t];
      const ix = [...name].map(ch => { const i = COMPONENTS.indexOf(ch); if (i < 0 || i >= n) this.fail('swizzle .' + name, node); return i; });
      if (ix.length === 1) return v.c[ix[0]];
      const dup = new Set(ix).size !== ix.length;
      const c = dup ? v.c.map(x => this.atom(x)) : v.c;
      return { t: vecOf(elem, ix.length), c: ix.map(i => c[i]) };
    }
    if (v.ref !== undefined) {
      const s = this.prog.structs.get(v.t);
      const m = s.members.find(m => m.name === name);
      if (!m) this.fail(`${v.t} has no member ${name}`, node);
      if (isVec(m.type)) return { t: m.type, c: m.fields.map(f => sc(VECTORS[m.type][0], `${v.ref}.${f}`)) };
      return sc(m.type, `${v.ref}.${m.fields[0]}`);
    }
    this.fail(`member .${name} of ${v.t}`, node);
  }
  index(node) {
    if (node.obj.k !== 'id') this.fail('indexing a computed value', node);
    const b = this.lookup(node.obj.name, node);
    if (b.k !== 'array') this.fail('indexing a non-array', node);
    const i = this.coerce(this.concrete(this.ex(node.idx)), 'i32', node);
    const buf = b.buf ?? this.buffer(b.field);
    const load = `${buf}.getF32(${i.e})`;
    return b.elem === 'f32' ? sc('f32', load) : sc(b.elem, `Math.bitsOf(${load})`);
  }
  unary(node) {
    const a = this.ex(node.a);
    if (node.op === '-') {
      if (a.t === 'aint') return { t: 'aint', v: -a.v };
      if (isVec(a.t)) return { t: a.t, c: a.c.map(c => sc(c.t, `(-${c.e})`)) };
      if (a.t === 'bool') this.fail('negating a bool', node);
      if (a.t === 'f32' && /^[\d.]+(e-?\d+)?$/.test(a.e)) return sc('f32', `(-${a.e})`);
      return sc(a.t, `(-${a.e})`);
    }
    if (node.op === '!') { if (a.t !== 'bool') this.fail('! on ' + a.t, node); return sc('bool', `(!${a.e})`); }
    if (node.op === '~') { const c = this.concrete(a); if (c.t !== 'i32' && c.t !== 'u32') this.fail('~ on ' + c.t, node); return sc(c.t, `(~${c.e})`); }
    this.fail('unary ' + node.op, node);
  }
  binary(node) {
    const op = node.op;
    if (op === '&&' || op === '||') return this.logical(node);
    let a = this.ex(node.a), b = this.ex(node.b);
    if (op === '<<' || op === '>>') {
      a = this.concrete(a); b = this.concrete(b);
      if (b.t !== 'u32' && b.t !== 'i32') this.fail('shift count ' + b.t, node);
      if (a.t !== 'i32' && a.t !== 'u32') this.fail('shift of ' + a.t, node);
      const r = sc(a.t, `(${a.e} ${op === '<<' ? '<<' : (a.t === 'u32' ? '>>>' : '>>')} ${b.e})`);
      if (a.t === 'u32' && op === '>>' && /^\d+$/.test(b.e) && +b.e >= 1) r.small = true;
      return r;
    }
    if (isVec(a.t) || isVec(b.t)) {
      const t = isVec(a.t) ? a.t : b.t, [elem, n] = VECTORS[t];
      if (isVec(a.t) && isVec(b.t) && a.t !== b.t) this.fail(`${a.t} ${op} ${b.t}`, node);
      if (!['+', '-', '*', '/'].includes(op)) this.fail(`vector operator ${op}`, node);
      const ac = this.comps(isVec(a.t) ? a : this.coerce(a, elem, node), n, node);
      const bc = this.comps(isVec(b.t) ? b : this.coerce(b, elem, node), n, node);
      return { t, c: ac.map((x, i) => this.scalarOp(op, x, bc[i], node)) };
    }
    if (a.t === 'aint' && b.t === 'aint' && ['+', '-', '*'].includes(op))
      return { t: 'aint', v: op === '+' ? a.v + b.v : op === '-' ? a.v - b.v : a.v * b.v };
    if (a.t === 'aint') a = this.coerce(a, b.t === 'aint' ? 'i32' : b.t, node);
    if (b.t === 'aint') b = this.coerce(b, a.t, node);
    return this.scalarOp(op, a, b, node);
  }
  scalarOp(op, a, b, node) {
    if (a.t !== b.t) this.fail(`${a.t} ${op} ${b.t}`, node);
    const t = a.t;
    if (op in CMP) {
      if (t === 'u32' && op !== '==' && op !== '!=') this.fail('unsigned comparison', node);
      return sc('bool', `(${a.e} ${CMP[op]} ${b.e})`);
    }
    if (t === 'bool') this.fail(`operator ${op} on bool`, node);
    if (['&', '|', '^'].includes(op)) { if (t === 'f32') this.fail(`${op} on f32`, node); return sc(t, `(${a.e} ${op} ${b.e})`); }
    if (op === '%' && t === 'f32') this.fail('% on f32', node);
    if ((op === '/' || op === '%') && t === 'u32') this.fail('unsigned division', node);
    if (!['+', '-', '*', '/', '%'].includes(op)) this.fail('operator ' + op, node);
    return sc(t, `(${a.e} ${op} ${b.e})`);
  }
  // && and || evaluate their right operand only when needed; when it needs statements, they go into a branch.
  logical(node) {
    const a = this.coerce(this.ex(node.a), 'bool', node.a);
    const r = this.capture(() => this.coerce(this.ex(node.b), 'bool', node.b));
    if (!r.lines.length) return sc('bool', `(${a.e} ${node.op} ${r.v.e})`);
    const t = this.temp();
    this.emit(`let ${t}: bool = ${a.e};`);
    this.emit(`if (${node.op === '&&' ? t : '!' + t}) {`);
    this.block(r.lines);
    this.emit(`    ${t} = ${r.v.e};`);
    this.emit('}');
    return sc('bool', t);
  }

  // select(f, t, c): eager when an argument has an effect on module state (as the C++ kernel keeps the random
  // stream), otherwise lazy: the chosen argument only.
  select(node) {
    const [nf, nt, nc] = node.args;
    if (this.prog.hasEffects(nf, this.fn.module) || this.prog.hasEffects(nt, this.fn.module)) {
      let f = this.ex(nf), t = this.ex(nt);
      const c = this.atom(this.coerce(this.ex(nc), 'bool', nc));
      [f, t] = this.unifyPair(f, t, node);
      f = this.atom(f); t = this.atom(t);
      return this.choose(c, () => t, () => f, f.t, node);
    }
    const c = this.atom(this.coerce(this.ex(nc), 'bool', nc));
    const ct = this.capture(() => this.ex(nt)), cf = this.capture(() => this.ex(nf));
    let [vf, vt] = this.unifyPair(cf.v, ct.v, node);
    const type = vf.t;
    const simple = v => isVec(v.t) ? v.c.every(x => isAtom(x.e)) : (v.t === 'aint' || isAtom(v.e));
    if (!ct.lines.length && !cf.lines.length && simple(vf) && simple(vt)) return this.choose(c, () => vt, () => vf, type, node);
    // lazy: each argument computed in its branch
    const names = isVec(type) ? Array.from({ length: VECTORS[type][1] }, () => this.temp()) : [this.temp()];
    const elem = isVec(type) ? VECTORS[type][0] : type;
    for (const n of names) this.emit(`let ${n}: ${TYPED[elem]} = ${DEFAULT[elem]};`);
    const assign = (lines, v) => {
      this.block(lines);
      const cs = isVec(type) ? v.c : [v];
      cs.forEach((x, i) => this.emit(`    ${names[i]} = ${this.coerce(x, elem, node).e};`));
    };
    this.emit(`if (${c.e}) {`); assign(ct.lines, vt); this.emit('} else {'); assign(cf.lines, vf); this.emit('}');
    return isVec(type) ? { t: type, c: names.map(n => sc(elem, n)) } : sc(type, names[0]);
  }
  unifyPair(f, t, node) {
    if (f.t === 'aint' && t.t === 'aint') return [this.coerce(f, 'i32'), this.coerce(t, 'i32')];
    if (f.t === 'aint') return [this.coerce(f, isVec(t.t) ? VECTORS[t.t][0] : t.t, node), t];
    if (t.t === 'aint') return [f, this.coerce(t, isVec(f.t) ? VECTORS[f.t][0] : f.t, node)];
    if (f.t !== t.t) this.fail(`select of ${f.t} and ${t.t}`, node);
    return [f, t];
  }
  choose(c, getT, getF, type, node) {      // both values computed and atomic: pick by c
    const t = getT(), f = getF();
    const one = (tv, fv) => {
      const name = this.temp();
      this.emit(`let ${name}: ${TYPED[fv.t]} = ${fv.e};`);
      this.emit(`if (${c.e}) { ${name} = ${tv.e}; }`);
      return sc(fv.t, name);
    };
    if (isVec(type)) return { t: type, c: f.c.map((fc, i) => one(t.c[i], fc)) };
    if (type === 'aint') return one(this.coerce(t, 'i32'), this.coerce(f, 'i32'));
    return one(t, f);
  }

  call(node) {
    const n = node.callee, A = node.args;
    if (n === 'select') { if (A.length !== 3) this.fail('select needs 3 arguments', node); return this.select(node); }
    if (n in VECTORS) return this.construct(n, A, node);
    if (n === 'f32' || n === 'i32' || n === 'u32') return this.convert(n, A, node);
    if (this.prog.accessors[n]) return this.accessor(n, A, node);
    const user = this.prog.resolveFn(n, this.fn.module);
    if (user) return this.userCall(user, A, node);
    return this.builtin(n, A, node);
  }
  construct(t, A, node) {
    const [elem, n] = VECTORS[t];
    if (A.length === 0) return { t, c: Array(n).fill(sc(elem, DEFAULT[elem])) };
    const vals = A.map(a => this.ex(a));
    if (vals.length === 1 && !isVec(vals[0].t)) {
      const s = this.atom(this.coerce(vals[0], elem, node));
      return { t, c: Array(n).fill(s) };
    }
    const c = [];
    for (const v of vals) {
      if (isVec(v.t)) { if (VECTORS[v.t][0] !== elem) this.fail(`${t} from ${v.t}`, node); c.push(...v.c); }
      else c.push(this.coerce(v, elem, node));
    }
    if (c.length !== n) this.fail(`${t} from ${c.length} components`, node);
    return { t, c };
  }
  convert(to, A, node) {
    if (A.length !== 1) this.fail(to + '() takes one argument', node);
    const v = this.ex(A[0]);
    if (isVec(v.t)) this.fail(`${to}(${v.t})`, node);
    if (v.t === 'aint') return this.coerce(v, to, node);
    if (v.t === to) return v;
    if (to === 'f32') {
      if (v.t === 'i32') return sc('f32', `f32(${v.e})`);
      if (v.t === 'u32' && v.small) return sc('f32', `f32(${v.e})`);
      this.fail(`f32(${v.t}) (only u32 values below 2^31 convert)`, node);
    }
    if (to === 'i32') { if (v.t === 'f32') return sc('i32', `i32(${v.e})`); if (v.t === 'u32') return sc('i32', v.e); }
    if (to === 'u32') { if (v.t === 'f32') return sc('u32', `i32(${v.e})`); if (v.t === 'i32') return sc('u32', v.e); }
    this.fail(`${to}(${v.t})`, node);
  }
  accessor(n, A, node) {
    if (A.length !== 1) this.fail(n + '() takes one argument', node);
    const buf = this.buffer(this.prog.accessors[n]);
    const i = this.coerce(this.concrete(this.ex(A[0])), 'i32', node);
    if (/^\d+$/.test(i.e)) return { t: 'vec4f', c: [0, 1, 2, 3].map(k => sc('f32', `${buf}.getF32(${4 * +i.e + k})`)) };
    const a = this.atom(sc('i32', `(${i.e} * 4)`));
    return { t: 'vec4f', c: [0, 1, 2, 3].map(k => sc('f32', `${buf}.getF32(${k ? `(${a.e} + ${k})` : a.e})`)) };
  }
}
// The calls (built-in and generated) and the statements: lower-calls.mjs and lower-statements.mjs.
for (const M of [CallMethods, StatementMethods])
  for (const k of Object.getOwnPropertyNames(M.prototype)) if (k !== 'constructor') FunctionLowerer.prototype[k] = M.prototype[k];

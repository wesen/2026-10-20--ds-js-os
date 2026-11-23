// lower-calls.mjs: FunctionLowerer's calls (lower.mjs): WGSL's built-in functions in the C++ kernel's CPU-arm forms,
// and calls of generated functions with their register and frame arguments, vector results and struct results.
import { VECTORS, isVec, sc, TYPED, DEFAULT } from './values.mjs';

const MATHLIB = { tan: 'tanf', asin: 'asinf', acos: 'acosf', atan: 'atanf', atan2: 'atan2f', exp2: 'exp2f', log: 'logf', log2: 'log2f', pow: 'powf' };
const HELPER1 = { floor: 'q_floor', fract: 'q_fract', sin: 'q_sin', cos: 'q_cos', exp: 'q_exp', sign: 'q_sign' };

export class CallMethods {
  builtin(n, A, node) {
    const vals = () => A.map(a => this.ex(a));
    const f1 = (name, v) => sc('f32', `${name}(${v.e})`);
    const map1 = (v, f) => isVec(v.t) ? { t: v.t, c: v.c.map(f) } : f(v);
    const fl = v => v.t === 'aint' ? this.coerce(v, 'f32', node) : v;
    switch (n) {
      case 'abs': {
        const v = this.concrete(this.ex(A[0]));
        return map1(v, c => c.t === 'f32' ? sc('f32', `Math.abs(${c.e})`) : (c.t === 'i32' ? sc('i32', `q_absi(${c.e})`) : this.fail('abs of ' + c.t, node)));
      }
      case 'sqrt': return map1(fl(this.ex(A[0])), c => sc('f32', `Math.sqrt(${c.e})`));
      case 'ceil': return map1(fl(this.ex(A[0])), c => sc('f32', `Math.ceil(${c.e})`));
      case 'floor': case 'fract': case 'sin': case 'cos': case 'exp': case 'sign':
        return map1(fl(this.ex(A[0])), c => f1(HELPER1[n], c));
      case 'tan': case 'asin': case 'acos': case 'atan': case 'exp2': case 'log': case 'log2':
        return map1(fl(this.ex(A[0])), c => f1(MATHLIB[n], c));
      case 'pow': case 'atan2': case 'step': {
        let [a, b] = vals(); [a, b] = this.unifyPair(fl(a), fl(b), node);
        const name = n === 'step' ? 'q_step' : MATHLIB[n];
        if (isVec(a.t)) return { t: a.t, c: a.c.map((x, i) => sc('f32', `${name}(${x.e}, ${b.c[i].e})`)) };
        return sc('f32', `${name}(${a.e}, ${b.e})`);
      }
      case 'min': case 'max': {
        let [a, b] = vals(); [a, b] = this.unifyPair(a, b, node);
        const one = (x, y) => { if (x.t === 'u32' || x.t === 'bool') this.fail(`${n} of ${x.t}`, node); return sc(x.t, `Math.${n}(${x.e}, ${y.e})`); };
        if (isVec(a.t)) return { t: a.t, c: a.c.map((x, i) => one(x, b.c[i])) };
        return one(a, b);
      }
      case 'clamp': {
        let [x, lo, hi] = vals();
        const t = [x, lo, hi].find(v => v.t !== 'aint')?.t ?? 'i32';
        const elem = isVec(t) ? VECTORS[t][0] : t;
        const k = v => isVec(v.t) ? v : this.coerce(v, elem, node);
        x = k(x); lo = k(lo); hi = k(hi);
        if (elem === 'u32' || elem === 'bool') this.fail('clamp of ' + elem, node);
        if (isVec(t)) {
          const nn = VECTORS[t][1], lc = this.comps(lo, nn, node), hc = this.comps(hi, nn, node);
          return { t, c: x.c.map((c, i) => sc(elem, `Math.min(Math.max(${c.e}, ${lc[i].e}), ${hc[i].e})`)) };
        }
        return sc(elem, `Math.min(Math.max(${x.e}, ${lo.e}), ${hi.e})`);
      }
      case 'mix': {
        let [a, b, t] = vals();
        if (isVec(a.t) || isVec(b.t)) {
          const vt = isVec(a.t) ? a.t : b.t, nn = VECTORS[vt][1];
          const ac = this.comps(a, nn, node).map(c => this.atom(fl(c))), bc = this.comps(b, nn, node).map(fl);
          const tc = isVec(t.t) ? t.c : this.comps(fl(t), nn, node);
          return { t: vt, c: ac.map((x, i) => sc('f32', `(${x.e} + ((${bc[i].e} - ${x.e}) * ${tc[i].e}))`)) };
        }
        a = this.atom(fl(a)); b = fl(b); t = fl(t);
        return sc('f32', `(${a.e} + ((${b.e} - ${a.e}) * ${t.e}))`);
      }
      case 'smoothstep': {
        let [e0, e1, x] = vals();
        if (isVec(x.t)) {
          const nn = VECTORS[x.t][1], c0 = this.comps(fl(e0), nn, node), c1 = this.comps(fl(e1), nn, node);
          return { t: x.t, c: x.c.map((c, i) => sc('f32', `q_smoothstep(${c0[i].e}, ${c1[i].e}, ${c.e})`)) };
        }
        return sc('f32', `q_smoothstep(${fl(e0).e}, ${fl(e1).e}, ${fl(x).e})`);
      }
      case 'dot': {
        const [a, b] = vals();
        return sc('f32', this.dot(a.c, b.c));
      }
      case 'length': { const a = this.atom(this.ex(A[0])); return sc('f32', `Math.sqrt(${this.dot(a.c, a.c)})`); }
      case 'distance': {
        const [a, b] = vals(); const d = this.atom({ t: a.t, c: a.c.map((x, i) => sc('f32', `(${x.e} - ${b.c[i].e})`)) });
        return sc('f32', `Math.sqrt(${this.dot(d.c, d.c)})`);
      }
      case 'normalize': {
        const a = this.atom(this.ex(A[0]));
        const l = this.atom(sc('f32', `Math.sqrt(${this.dot(a.c, a.c)})`));
        return { t: a.t, c: a.c.map(x => sc('f32', `(${x.e} / ${l.e})`)) };
      }
      case 'cross': {
        const [a0, b0] = vals(); const a = this.atom(a0).c, b = this.atom(b0).c;
        const m = (i, j) => `(${a[i].e} * ${b[j].e})`;
        return { t: 'vec3f', c: [sc('f32', `(${m(1, 2)} - ${m(2, 1)})`), sc('f32', `(${m(2, 0)} - ${m(0, 2)})`), sc('f32', `(${m(0, 1)} - ${m(1, 0)})`)] };
      }
      case 'reflect': {    // i - n * (2 * dot(n, i))
        const [i0, n0] = vals(); const i = this.atom(i0), nn = this.atom(n0);
        const d = this.atom(sc('f32', `(2.0 * ${this.dot(nn.c, i.c)})`));
        return { t: i.t, c: i.c.map((x, k) => sc('f32', `(${x.e} - (${nn.c[k].e} * ${d.e}))`)) };
      }
      case 'refract': {    // d = dot(n, i); k = 1 - eta^2 (1 - d^2); k < 0 ? 0 : i eta - n (eta d + sqrt k)
        const [i0, n0, e0] = vals(); const i = this.atom(i0), nn = this.atom(n0), eta = this.atom(fl(e0));
        const d = this.atom(sc('f32', this.dot(nn.c, i.c)));
        const kk = this.atom(sc('f32', `(1.0 - ((${eta.e} * ${eta.e}) * (1.0 - (${d.e} * ${d.e}))))`));
        const names = i.c.map(() => this.temp());
        for (const nm of names) this.emit(`let ${nm}: f32 = 0.0;`);
        this.emit(`if (!(${kk.e} < 0.0)) {`);
        const s = this.atom(sc('f32', `((${eta.e} * ${d.e}) + Math.sqrt(${kk.e}))`));
        names.forEach((nm, k) => this.emit(`    ${nm} = ((${i.c[k].e} * ${eta.e}) - (${nn.c[k].e} * ${s.e}));`));
        this.emit('}');
        return { t: i.t, c: names.map(nm => sc('f32', nm)) };
      }
    }
    this.fail('unknown function ' + n, node);
  }
  dot(a, b) {
    let s = `(${a[0].e} * ${b[0].e})`;
    for (let i = 1; i < a.length; i++) s = `(${s} + (${a[i].e} * ${b[i].e}))`;
    return s;
  }

  // ---- calls of generated functions ----
  // Arguments in order; register arguments may stay expressions, frame arguments are stored after all are evaluated.
  args(callee, A, node) {
    const sig = callee.sig;
    if (A.length !== sig.params.length) this.fail(`${callee.name} takes ${sig.params.length} arguments`, node);
    const regs = [], stores = [];
    const vals = A.map((a, i) => {
      const p = sig.params[i];
      let v = this.ex(a);
      if (isVec(p.type)) { if (v.t !== p.type) this.fail(`argument ${i + 1} of ${callee.name}: ${v.t} for ${p.type}`, node); }
      else if (this.prog.structs.has(p.type)) { if (v.t !== p.type || v.ref === undefined) this.fail(`argument ${i + 1} of ${callee.name}: ${v.t} for ${p.type}`, node); }
      else v = this.coerce(v, p.type, node);
      return v;
    });
    // anything with statements (calls) was bound already; atomise frame arguments so their order is fixed
    vals.forEach((v, i) => {
      const p = sig.params[i];
      const parts = isVec(p.type) ? v.c : [v.ref !== undefined ? { e: v.ref } : v];
      if (p.frame) parts.forEach((x, j) => stores.push([p.fields[j], this.atom(x).e ?? x.e]));
      else regs.push(...parts.map(x => x.e));
    });
    if (stores.length) {
      this.needK(node);
      const cf = this.temp();
      this.emit(`const ${cf} = q_k.f_${callee.name};`);
      for (const [f, e] of stores) this.emit(`${cf}.${f} = ${e};`);
    }
    return { regs, vals, stored: stores.length > 0 };
  }
  userCall(callee, A, node, dest) {
    const sig = callee.sig;
    const { regs, vals, stored } = this.args(callee, A, node);
    const head = [];
    if (sig.needsK) { this.needK(node); head.push('q_k'); }
    if (sig.ret && this.prog.structs.has(sig.ret)) {
      // a struct result: into dest, unless an argument is that record (then a temporary, and the caller copies)
      let target = dest;
      if (target && vals.some(v => v.ref === target)) target = null;
      if (!target) target = this.slot(sig.ret, 'q_s' + this.n++);
      this.emit(`${callee.name}(${[...head, target, ...regs].join(', ')});`);
      return { t: sig.ret, ref: target };
    }
    const text = `${callee.name}(${[...head, ...regs].join(', ')})`;
    if (!sig.ret) { this.emit(text + ';'); return null; }
    if (isVec(sig.ret)) {
      const [elem, n] = VECTORS[sig.ret];
      const x = this.temp();
      this.emit(`const ${x}: ${TYPED[elem]} = ${text};`);
      const c = [sc(elem, x)];
      for (let i = 1; i < n; i++) { const nm = this.temp(); this.emit(`const ${nm}: ${TYPED[elem]} = q_k.${elem === 'f32' ? 'r' : 'ri'}${i};`); c.push(sc(elem, nm)); }
      return { t: sig.ret, c };
    }
    const v = sc(sig.ret, text);
    // a call whose arguments went through the callee's frame runs right after they were stored
    return sig.touchesState || stored ? this.bindTemp(v) : v;
  }
  structValue(node, dest) {   // a struct-valued expression, written into dest when it is a call
    if (node.k === 'call') {
      const user = this.prog.resolveFn(node.callee, this.fn.module);
      if (user) return this.userCall(user, node.args, node, dest);
    }
    const v = this.ex(node);
    if (v.ref === undefined) this.fail('expected a struct value', node);
    return v;
  }
  copyStruct(dst, src, t) {
    if (dst === src) return;
    for (const f of this.prog.structs.get(t).flat) this.emit(`${dst}.${f[0]} = ${src}.${f[0]};`);
  }
}

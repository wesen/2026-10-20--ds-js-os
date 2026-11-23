// lower-expressions.js: the lowering of expressions (identifiers, members, swizzles, operators, calls, constructors);
// Lowerer (lower.js) adds statements on top.
import { sameExpr } from './parse.js';
import * as ISA from './isa.js';
import { EntryLowering, WIDTH, VECW, VTYPE, isVec, isFloaty, fr, err, F, WGSL_ELEM, GENERATED, INLINE_KERNEL_WGSL } from './lower-state.js';

export class ExpressionLowering extends EntryLowering {
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
        // both operands were evaluated above: right only if evaluating the right operand has no side effect, since
        // WGSL short-circuits && and || (the census finds no such operand)
        if (this.prog.hasEffects(e.b)) err('E-SECT-UNSUPPORTED', 'short-circuit:side-effect', `the right operand of ${e.op} calls a function with side effects`, e.at);
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
    if (!this.prog.kernelApi.has(name)) err('E-SECT-CALL', 'call:' + name + '-not-in-kernel-api', `${name} is not in the kernel's section API`, at);
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

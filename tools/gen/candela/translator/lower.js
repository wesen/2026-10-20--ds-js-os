// lower.js: lower the parsed sections to IR, one entry (dispatch function) at a time (design Section 4.2).
// Pure JavaScript, QuickJS-compatible.
//
// Values during lowering:
//   { t, c: [..] }                 a constant (f32 values already rounded to single precision; i32/bool/aint as integers)
//   { t, r: VReg, o }              a value in registers: word o of virtual register r (vectors are consecutive words)
//   { t: 'Hit', hitIn: true }      the material entry's input Hit (fields are loaded with HLD)
// IR instruction: { op, H, a: [args] } where each arg follows the opcode's operand spec (isa.js): a register operand
// { r, o }, a label { label }, an immediate { imm }, or the input Hit { hitIn: true }.
import { sameExpr, mentions } from './parse.js';
import * as ISA from './isa.js';
import { ExpressionLowering } from './lower-expressions.js';
import { WIDTH, VECW, isVec, err, GENERATED, KNOWN_TYPES, sameConst, lobeNoneFields, mentionsAfterDecl, assignedNames,
  endsInTerminator } from './lower-state.js';

// ---------- the lowering of statements (expressions: lower-expressions.js; the entry's state: lower-state.js) ----------
export class Lowerer extends ExpressionLowering {
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

}

export { INLINE_KERNEL_WGSL, VReg, WIDTH, VECW, isVec, endsInTerminator, defArg0, assignedNames } from './lower-state.js';

// lower-statements.mjs: FunctionLowerer's statements (lower.mjs): declarations, assignments, if, loops with
// `continue` folded away (Typed has none), returns, and the function itself.
import { VECTORS, COMPONENTS, isVec, sc, TYPED, DEFAULT, isAtom } from './values.mjs';

// Does a statement list contain a `continue` of the enclosing loop (not of a nested loop)?
function hasContinue(node) {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasContinue);
  if (node.k === 'continue') return true;
  if (node.k === 'if') return hasContinue(node.then) || hasContinue(node.else);
  if (node.k === 'block') return hasContinue(node.body);
  return false;
}
function fallsThrough(list) {
  if (!list || !list.length) return true;
  const s = list[list.length - 1];
  if (s.k === 'continue' || s.k === 'break' || s.k === 'return') return false;
  if (s.k === 'if') return fallsThrough(s.then) || fallsThrough(s.else);
  if (s.k === 'block') return fallsThrough(s.body);
  return true;
}
// `list` followed by the (already folded) statements `rest`, without `continue`; null when that would duplicate code.
function fold(list, rest) {
  if (!list.length) return rest;
  const [s, ...tail] = list;
  if (s.k === 'continue') return [];
  if (s.k === 'break' || s.k === 'return') return [s];
  if (!hasContinue(s)) { const t = fold(tail, rest); return t && [s, ...t]; }
  if (s.k === 'block') return null;
  const cont = fold(tail, rest);
  if (!cont) return null;
  const ftThen = fallsThrough(s.then), ftElse = fallsThrough(s.else || []);
  if (ftThen && ftElse && cont.length) return null;
  const then = fold(s.then, ftThen ? cont : []), els = fold(s.else || [], ftElse ? cont : []);
  if (!then || !els) return null;
  return [{ ...s, then, else: els.length ? els : null }];
}

export class StatementMethods {
  // ---- statements ----
  stmts(list) { for (const s of list) { this.stmt(s); if (s.k === 'return' || s.k === 'break' || s.k === 'continue') break; } }
  stmt(s) {
    switch (s.k) {
      case 'let': case 'var': return this.declare(s);
      case 'assign': return this.assign(s);
      case 'expr': {
        const user = this.prog.resolveFn(s.e.callee, this.fn.module);
        if (!user) this.fail('call statement of ' + s.e.callee, s);
        const v = this.userCall(user, s.e.args, s.e);
        if (v && v.e !== undefined && !isAtom(v.e)) this.emit(`${v.e};`);
        return;
      }
      case 'block': return this.scoped(() => { this.emit('{'); const c = this.capture(() => this.stmts(s.body)); this.block(c.lines); this.emit('}'); });
      case 'if': return this.ifStmt(s);
      case 'for': return this.forStmt(s);
      case 'loop': return this.loopStmt(s.body, null, s);
      case 'break': {
        const L = this.loops[this.loops.length - 1];
        if (!L) this.fail('break outside a loop', s);
        if (L.oneShot) this.emit(`${L.brk} = true;`);
        this.emit('break;');
        return;
      }
      case 'continue': {
        const L = this.loops[this.loops.length - 1];
        if (!L || !L.oneShot) this.fail('internal: continue left after folding', s);
        this.emit('break;');
        return;
      }
      case 'return': return this.ret(s);
    }
    this.fail('statement ' + s.k, s);
  }
  declare(s) {
    const t = s.type;
    if (typeof t === 'object') {          // a local array: a buffer in the frame
      if (s.init) this.fail('an initialised local array', s);
      const fr = this.framePtr(s);
      const field = this.frameField(s.name, 'buffer');
      this.frameBuffers ??= new Map();
      this.frameBuffers.set(field, 2 * t.n);
      const local = this.fresh(s.name);
      this.emit(`const ${local} = ${fr}.${field};`);
      if (t.array !== 'f32' && t.array !== 'i32' && t.array !== 'u32') this.fail('array of ' + t.array, s);
      this.bind(s.name, { k: 'array', elem: t.array, n: t.n, buf: local });
      return;
    }
    if (this.prog.structs.has(t)) return this.declareStruct(s);
    if (isVec(t)) {
      const [elem, n] = VECTORS[t];
      const v = s.init ? this.ex(s.init) : { t, c: Array(n).fill(sc(elem, DEFAULT[elem])) };
      if (v.t !== t) this.fail(`${t} initialised with ${v.t}`, s);
      const names = COMPONENTS.slice(0, n).split('').map(c => this.fresh(`${s.name}__${c}`));
      names.forEach((nm, i) => this.emit(`${s.k === 'var' ? 'let' : 'const'} ${nm}: ${TYPED[elem]} = ${this.coerce(v.c[i], elem, s).e};`));
      this.bind(s.name, { k: 'vec', t, comps: names, mut: s.k === 'var' });
      return;
    }
    if (!(t in TYPED)) this.fail('declaration of type ' + t, s);
    const v = s.init ? this.coerce(this.concrete2(this.ex(s.init), t), t, s) : sc(t, DEFAULT[t]);
    const nm = this.fresh(s.name);
    this.emit(`${s.k === 'var' ? 'let' : 'const'} ${nm}: ${TYPED[t]} = ${v.e};`);
    this.bind(s.name, { k: 'scalar', t, name: nm, mut: s.k === 'var' });
  }
  concrete2(v, t) { return v.t === 'aint' ? this.coerce(v, t) : v; }
  declareStruct(s) {
    const t = s.type;
    if (this.nrvo === s.name) {            // the returned local is the caller's record
      if (s.init) { const v = this.structValue(s.init, 'q_ret'); this.copyStruct('q_ret', v.ref, t); }
      this.bind(s.name, { k: 'struct', t, ref: 'q_ret', mut: true });
      return;
    }
    if (s.k === 'let' && s.init && s.init.k === 'id') {
      const b = this.lookup(s.init.name, s.init);
      if (b.k === 'struct' && !b.mut) { this.bind(s.name, b); return; }    // an immutable alias
    }
    const ref = this.slot(t, s.name);
    if (s.init) { const v = this.structValue(s.init, ref); this.copyStruct(ref, v.ref, t); }
    this.bind(s.name, { k: 'struct', t, ref, mut: s.k === 'var' });
  }
  // the place an assignment writes: { kind, ... } from target expressions name, name.c, name.member(.c)
  place(target) {
    if (target.k === 'id') return { b: this.lookup(target.name, target), path: [] };
    if (target.k === 'member') { const p = this.place(target.obj); p.path.push(target.name); return p; }
    if (target.k === 'index') return { b: this.lookup(target.obj.name, target.obj), index: target.idx, path: [] };
    this.fail('assignment target ' + target.k, target);
  }
  assign(s) {
    let value = s.value;
    if (s.op !== '=') value = { k: 'bin', op: s.op.slice(0, -1), a: s.target, b: s.value, at: s.at };
    const { b, path, index } = this.place(s.target);
    if (index) {
      const v = this.coerce(this.concrete2(this.ex(value), b.elem), b.elem, s);
      const i = this.coerce(this.concrete(this.ex(index)), 'i32', s);
      const buf = b.buf ?? this.buffer(b.field);
      this.emit(`${buf}.setF32(${i.e}, ${b.elem === 'f32' ? v.e : `Math.fromBits(${v.e})`});`);
      return;
    }
    if (b.k === 'struct') {
      if (!b.mut) this.fail('assignment to an immutable struct', s);
      if (!path.length) { const v = this.structValue(value, b.ref); this.copyStruct(b.ref, v.ref, b.t); return; }
      const m = this.prog.structs.get(b.t).members.find(m => m.name === path[0]);
      if (!m) this.fail(`${b.t} has no member ${path[0]}`, s);
      if (path.length === 1) return this.store(m.type, m.fields.map(f => `${b.ref}.${f}`), value, s);
      if (path.length === 2 && isVec(m.type)) return this.store(VECTORS[m.type][0], [`${b.ref}.${m.fields[COMPONENTS.indexOf(path[1])]}`], value, s);
      this.fail('assignment to ' + path.join('.'), s);
    }
    if (b.k === 'vec') {
      if (!b.mut) this.fail('assignment to an immutable vector', s);
      if (!path.length) return this.store(b.t, b.comps, value, s);
      if (path.length === 1 && path[0].length === 1) return this.store(VECTORS[b.t][0], [b.comps[COMPONENTS.indexOf(path[0])]], value, s);
      this.fail('assignment to a swizzle', s);
    }
    if (b.k === 'scalar') { if (!b.mut || path.length) this.fail('assignment to ' + s.target.name, s); return this.store(b.t, [b.name], value, s); }
    if (b.k === 'global') {
      this.needK(s);
      if (isVec(b.t)) {
        if (!path.length) return this.store(b.t, b.fields.map(f => 'q_k.' + f), value, s);
        if (path.length === 1 && path[0].length === 1) return this.store(VECTORS[b.t][0], ['q_k.' + b.fields[COMPONENTS.indexOf(path[0])]], value, s);
      }
      if (!path.length) return this.store(b.t, ['q_k.' + b.field], value, s);
    }
    this.fail('assignment to ' + b.k, s);
  }
  // write a value into places (one per component); a component read after an earlier one is written is bound first
  store(t, places, value, s) {
    let v = this.ex(value);
    if (isVec(t)) { if (v.t !== t) this.fail(`${t} assigned ${v.t}`, s); }
    else v = this.coerce(this.concrete2(v, t), t, s);
    let cs = isVec(t) ? v.c : [v];
    if (places.length > 1) {
      const mentions = (e, p) => new RegExp(`(^|[^\\w.])${p.replace('.', '\\.')}(?![\\w])`).test(e);
      if (cs.some((c, i) => places.slice(0, i).some(p => mentions(c.e, p)))) cs = cs.map(c => this.atom(c));
    }
    places.forEach((p, i) => this.emit(`${p} = ${cs[i].e};`));
  }
  cond(node) { return this.coerce(this.ex(node), 'bool', node); }
  ifStmt(s) {
    const c = this.cond(s.cond);
    const then = this.capture(() => this.scoped(() => this.stmts(s.then)));
    const els = s.else && this.capture(() => this.scoped(() => this.stmts(s.else)));
    this.emit(`if (${c.e}) {`); this.block(then.lines);
    if (els && els.lines.length) { this.emit('} else {'); this.block(els.lines); }
    this.emit('}');
  }
  forStmt(s) {
    this.scoped(() => {
      let head = null;
      if (s.init) {
        if (s.init.k === 'var' && s.init.type in TYPED) {
          const pre = this.capture(() => this.coerce(this.concrete2(this.ex(s.init.init), s.init.type), s.init.type, s));
          for (const l of pre.lines) this.emit(l);
          const nm = this.fresh(s.init.name);
          this.bind(s.init.name, { k: 'scalar', t: s.init.type, name: nm, mut: true });
          head = `let ${nm}: ${TYPED[s.init.type]} = ${pre.v.e}`;
        } else this.stmt(s.init);
      }
      // a step that is one scalar assignment without statements goes into the for header
      let step = null;
      if (s.step) {
        const c = this.capture(() => this.stmt(s.step));
        if (c.lines.length === 1 && /^[\w]+ = [^;]*;$/.test(c.lines[0])) step = c.lines[0].slice(0, -1);
        else step = c.lines;
      }
      this.loopStmt(s.body, { head, cond: s.cond, step }, s);
    });
  }
  // a loop: `for (head; cond; step)` when it can, `while (true)` otherwise; continue folded or a one-shot inner loop
  loopStmt(body, f, node) {
    let folded = hasContinue(body) ? fold(body, []) : body;
    const oneShot = !folded;
    if (oneShot) folded = body;
    const cond = f && f.cond ? this.capture(() => this.cond(f.cond)) : null;
    const inHeader = cond && !cond.lines.length;
    const stepLines = f && Array.isArray(f.step) ? f.step : null;
    const header = f && (f.head || inHeader || (f.step && !stepLines));
    const L = { oneShot, brk: oneShot ? this.temp() : null };
    const bodyLines = this.capture(() => this.scoped(() => {
      if (cond && !inHeader) { for (const l of cond.lines) this.emit(l); this.emit(`if (!${cond.v.e}) { break; }`); }
      this.loops.push(L);
      const inner = this.capture(() => this.stmts(folded)).lines;
      this.loops.pop();
      if (oneShot) {
        this.emit(`let ${L.brk}: bool = false;`);
        this.emit('while (true) {'); this.block(inner); this.emit('    break;'); this.emit('}');
        this.emit(`if (${L.brk}) { break; }`);
      } else for (const l of inner) this.emit(l);
      if (stepLines) for (const l of stepLines) this.emit(l);
    })).lines;
    if (header) {
      if (!f.head) this.fail('internal: for without a declaration in its header', node);
      this.emit(`for (${f.head}; ${inHeader ? cond.v.e : 'true'}; ${f.step && !stepLines ? f.step : f.head.replace(/^let (\w+).*$/, '$1 = $1')}) {`);
    } else {
      if (f && f.head) this.emit(f.head + ';');
      this.emit('while (true) {');
    }
    this.block(bodyLines);
    this.emit('}');
  }
  ret(s) {
    const r = this.sig.ret;
    if (!r) { this.emit('return 0;'); return; }
    if (this.prog.structs.has(r)) {
      if (this.nrvo && s.value.k === 'id' && s.value.name === this.nrvo) { this.emit('return 0;'); return; }
      const v = this.structValue(s.value, this.nrvo ? null : 'q_ret');
      this.copyStruct('q_ret', v.ref, r);
      this.emit('return 0;');
      return;
    }
    let v = this.ex(s.value);
    if (isVec(r)) {
      if (v.t !== r) this.fail(`returns ${v.t}, declared ${r}`, s);
      const [elem] = VECTORS[r];
      const cs = v.c.map(c => this.atom(c));
      this.needK(s);
      cs.slice(1).forEach((c, i) => this.emit(`q_k.${elem === 'f32' ? 'r' : 'ri'}${i + 1} = ${c.e};`));
      this.emit(`return ${cs[0].e};`);
      return;
    }
    v = this.coerce(this.concrete2(v, r), r, s);
    this.emit(`return ${v.e};`);
  }

  // ---- the function ----
  lower() {
    const sig = this.sig, ast = this.ast;
    // the returned local of a struct function, when every return names the same local declared in it
    if (sig.ret && this.prog.structs.has(sig.ret)) {
      const rets = [], decls = new Map();
      const scan = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(scan);
        if (n.k === 'return') rets.push(n); if ((n.k === 'var' || n.k === 'let') && n.type === sig.ret) decls.set(n.name, (decls.get(n.name) || 0) + 1);
        for (const k of ['body', 'then', 'else', 'init', 'step']) if (n[k] && typeof n[k] === 'object') scan(n[k]); };
      scan(ast.body);
      const names = new Set(rets.map(r => r.value && r.value.k === 'id' ? r.value.name : null));
      if (names.size === 1 && !names.has(null)) { const nm = [...names][0]; if (decls.get(nm) === 1 && !ast.params.some(p => p.name === nm)) this.nrvo = nm; }
    }
    const params = [];
    if (sig.needsK) params.push('q_k: K');
    if (sig.ret && this.prog.structs.has(sig.ret)) params.push(`q_ret: ${sig.ret}`);
    const loads = [];
    for (const p of sig.params) {
      if (this.prog.structs.has(p.type)) {
        const nm = p.frame ? this.fresh(p.name) : this.fresh(p.name);
        if (p.frame) loads.push(() => this.emit(`const ${nm} = ${this.framePtr()}.${p.fields[0]};`));
        else params.push(`${nm}: ${p.type}`);
        this.bind(p.name, { k: 'struct', t: p.type, ref: nm, mut: false });
      } else if (isVec(p.type)) {
        const [elem, n] = VECTORS[p.type];
        const names = COMPONENTS.slice(0, n).split('').map(c => this.fresh(`${p.name}__${c}`));
        names.forEach((nm, i) => { if (p.frame) loads.push(() => this.emit(`const ${nm}: ${TYPED[elem]} = ${this.framePtr()}.${p.fields[i]};`)); else params.push(`${nm}: ${TYPED[elem]}`); });
        this.bind(p.name, { k: 'vec', t: p.type, comps: names, mut: false });
      } else {
        const nm = this.fresh(p.name);
        if (p.frame) loads.push(() => this.emit(`const ${nm}: ${TYPED[p.type]} = ${this.framePtr()}.${p.fields[0]};`));
        else params.push(`${nm}: ${TYPED[p.type]}`);
        this.bind(p.name, { k: 'scalar', t: p.type, name: nm, mut: false });
      }
    }
    for (const p of sig.params) if (p.frame) for (let i = 0; i < p.fields.length; i++) this.frameField(p.fields[i], isVec(p.type) ? VECTORS[p.type][0] : (this.prog.structs.has(p.type) ? p.type : TYPED[p.type]), 'param');
    for (const l of loads) l();
    // the body; the last top-level statement must be the one top-level return
    let body = ast.body;
    const cut = body.findIndex(s => s.k === 'return');
    if (cut >= 0) body = body.slice(0, cut + 1);
    this.stmts(body);
    const top = this.out[0];
    const last = body[body.length - 1];
    if (!last || last.k !== 'return') {
      const r = sig.ret;
      top.push(`return ${!r || this.prog.structs.has(r) ? '0' : (isVec(r) ? DEFAULT[VECTORS[r][0]] : DEFAULT[r])};`);
    }
    const result = !sig.ret || this.prog.structs.has(sig.ret) ? 'i32' : (isVec(sig.ret) ? TYPED[VECTORS[sig.ret][0]] : TYPED[sig.ret]);
    const lines = [...this.prologue.values(), ...top];
    return { text: `function ${this.fn.name}(${params.join(', ')}): ${result} {\n${lines.map(l => '    ' + l).join('\n')}\n}`, frame: this.frame, frameBuffers: this.frameBuffers };
  }
}

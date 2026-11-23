// lower-statements.mjs: FunctionLowerer's statements (lower.mjs): declarations, assignments, if, loops (with Typed's
// own continue), returns, and the function itself.
import { VECTORS, COMPONENTS, isVec, sc, TYPED, DEFAULT, zeroOf } from './values.mjs';

const ARRAYS = { f32: 'Float32Array', i32: 'Int32Array', u32: 'Uint32Array' };

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
        this.emit(this.callText(user, s.e.args, s.e) + ';');     // Typed drops the results
        return;
      }
      case 'block': return this.scoped(() => { this.emit('{'); const c = this.capture(() => this.stmts(s.body)); this.block(c.lines); this.emit('}'); });
      case 'if': return this.ifStmt(s);
      case 'for': return this.forStmt(s);
      case 'loop': return this.loopStmt(s.body, null, s);
      case 'break': if (!this.loops) this.fail('break outside a loop', s); this.emit('break;'); return;
      case 'continue': if (!this.loops) this.fail('continue outside a loop', s); this.emit('continue;'); return;
      case 'return': return this.ret(s);
    }
    this.fail('statement ' + s.k, s);
  }
  declare(s) {
    const t = s.type;
    if (typeof t === 'object') {          // a local array: a Typed local array, zeroed like WGSL's var
      if (s.init) this.fail('an initialised local array', s);
      if (!ARRAYS[t.array]) this.fail('array of ' + t.array, s);
      const name = this.fresh(s.name);
      this.emit(`const ${name} = new ${ARRAYS[t.array]}(${t.n});`);
      this.bind(s.name, { k: 'array', elem: t.array, n: t.n, name });
      return;
    }
    const kw = s.k === 'var' ? 'let' : 'const';
    if (this.isAgg(t)) {
      // an immutable copy of an immutable aggregate is the same value
      if (s.k === 'let' && s.init && s.init.k === 'id') {
        const b = this.lookup(s.init.name, s.init);
        if (b.k === 'agg' && !b.mut && b.t === t) { this.bind(s.name, b); return; }
      }
      const rec = this.prog.rec(t);
      const direct = this.directCall(s.init, t);
      let text = direct;
      if (!text) {
        const v = s.init ? this.ex(s.init) : null;
        if (v && v.t !== t) this.fail(`${t} initialised with ${v.t}`, s);
        text = v ? this.ctor(v, s) : zeroOf(this.prog, t);
      }
      const name = this.fresh(s.name);
      this.emit(`${kw} ${name}: ${rec} = ${text};`);
      this.bind(s.name, { k: 'agg', t, name, mut: s.k === 'var' });
      return;
    }
    if (!(t in TYPED)) this.fail('declaration of type ' + t, s);
    const v = s.init ? this.coerce(this.concrete2(this.ex(s.init), t), t, s) : sc(t, DEFAULT[t]);
    const nm = this.fresh(s.name);
    this.emit(`${kw} ${nm}: ${TYPED[t]} = ${v.e};`);
    this.bind(s.name, { k: 'scalar', t, name: nm, mut: s.k === 'var' });
  }
  concrete2(v, t) { return v.t === 'aint' ? this.coerce(v, t) : v; }
  // the place an assignment writes: a binding and a member path, or an indexed array
  place(target) {
    if (target.k === 'id') return { b: this.lookup(target.name, target), path: [] };
    if (target.k === 'member') { const p = this.place(target.obj); p.path.push(target.name); return p; }
    if (target.k === 'index') return { b: this.lookup(target.obj.name, target.obj), index: target.idx, path: [] };
    this.fail('assignment target ' + target.k, target);
  }
  // the leaf indices of a member path in an aggregate of type t, and the type it selects
  leafPath(t, path, s) {
    let idx = this.prog.leaves(t).map((_, i) => i), cur = t;
    for (const name of path) {
      if (this.prog.structs.has(cur)) {
        const m = this.prog.structs.get(cur).members.find(m => m.name === name);
        if (!m) this.fail(`${cur} has no member ${name}`, s);
        idx = idx.slice(m.off, m.off + m.n); cur = m.type;
      } else if (isVec(cur) && name.length === 1) {
        const i = COMPONENTS.indexOf(name);
        if (i < 0 || i >= idx.length) this.fail('component .' + name, s);
        idx = [idx[i]]; cur = VECTORS[cur][0];
      } else this.fail('assignment to .' + name + ' of ' + cur, s);
    }
    return { idx, type: cur };
  }
  assign(s) {
    let value = s.value;
    if (s.op !== '=') value = { k: 'bin', op: s.op.slice(0, -1), a: s.target, b: s.value, at: s.at };
    const { b, path, index } = this.place(s.target);
    if (index) {
      if (b.k !== 'array') this.fail('indexing a non-array', s);
      const v = this.coerce(this.concrete2(this.ex(value), b.elem), b.elem, s);
      const i = this.concrete(this.ex(index));
      if (i.t !== 'i32' && i.t !== 'u32') this.fail('index of type ' + i.t, s);
      if (b.name) this.emit(`${b.name}[${i.e}] = ${v.e};`);
      else this.emit(`${this.buffer(b.field)}.setF32(${i.e}, ${v.e});`);
      return;
    }
    if (b.k === 'agg') {
      if (!b.mut) this.fail('assignment to an immutable aggregate', s);
      if (!path.length) {
        const direct = this.directCall(value, b.t);
        if (direct) { this.emit(`${b.name} = ${direct};`); return; }
        const v = this.ex(value);
        if (v.t !== b.t) this.fail(`${b.t} assigned ${v.t}`, s);
        this.emit(`${b.name} = ${this.ctor(v, s)};`);
        return;
      }
      const { idx, type } = this.leafPath(b.t, path, s);
      const lv = this.prog.leaves(b.t);
      return this.store(type, idx.map(i => `${b.name}.${lv[i][0]}`), value, s);
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
  // write a value into places (one per leaf); a leaf read after an earlier one is written is bound first
  store(t, places, value, s) {
    let v = this.ex(value);
    if (this.isAgg(t)) { if (v.t !== t) this.fail(`${t} assigned ${v.t}`, s); }
    else v = this.coerce(this.concrete2(v, t), t, s);
    const lv = this.isAgg(t) ? this.prog.leaves(t) : [[null, t]];
    let cs = (v.c ?? [v]).map((c, i) => this.coerce(c, lv[i][1], s));
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
  // a loop: `for (head; cond; step)` when it can, `while (true)` otherwise
  loopStmt(body, f, node) {
    const cond = f && f.cond ? this.capture(() => this.cond(f.cond)) : null;
    const inHeader = cond && !cond.lines.length;
    const stepLines = f && Array.isArray(f.step) ? f.step : null;
    const header = f && (f.head || inHeader || (f.step && !stepLines));
    if (stepLines && hasContinue(body)) this.fail('a for loop whose step needs statements and whose body continues', node);
    const bodyLines = this.capture(() => this.scoped(() => {
      if (cond && !inHeader) { for (const l of cond.lines) this.emit(l); this.emit(`if (!${cond.v.e}) { break; }`); }
      this.loops++;
      this.stmts(body);
      this.loops--;
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
    if (this.isAgg(r)) {
      const direct = this.directCall(s.value, r);
      if (direct) { this.emit(`return ${direct};`); return; }
      const v = this.ex(s.value);
      if (v.t !== r) this.fail(`returns ${v.t}, declared ${r}`, s);
      this.emit(`return ${this.ctor(v, s)};`);
      return;
    }
    const v = this.coerce(this.concrete2(this.ex(s.value), r), r, s);
    this.emit(`return ${v.e};`);
  }

  // ---- the function ----
  lower() {
    const sig = this.sig, ast = this.ast, P = this.prog;
    const params = P.typedParams(sig);
    for (const [n] of params) this.used.add(n);
    let at = sig.needsK ? 1 : 0;
    for (const p of sig.params) {
      if (p.leaves) {
        const leafNames = P.leaves(p.type).map(() => null);
        for (const i of p.leaves) leafNames[i] = params[at++][0];
        this.bind(p.name, { k: 'agg', t: p.type, leafNames, mut: false });
      } else this.bind(p.name, { k: 'scalar', t: p.type, name: params[at++][0], mut: false });
    }
    // the body; the last top-level statement must be the one top-level return
    let body = ast.body;
    const cut = body.findIndex(s => s.k === 'return');
    if (cut >= 0) body = body.slice(0, cut + 1);
    this.stmts(body);
    const top = this.out[0];
    const last = body[body.length - 1];
    if (!last || last.k !== 'return') top.push(`return ${zeroOf(P, sig.ret)};`);
    const lines = [...this.prologue.values(), ...top];
    return `function ${this.fn.name}(${params.map(([n, t]) => `${n}: ${t}`).join(', ')}): ${P.resultType(sig)} {\n${lines.map(l => '    ' + l).join('\n')}\n}`;
  }
}

// Does a statement list contain a `continue` of the enclosing loop (not of a nested loop)?
function hasContinue(node) {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasContinue);
  if (node.k === 'continue') return true;
  if (node.k === 'if') return hasContinue(node.then) || hasContinue(node.else);
  if (node.k === 'block') return hasContinue(node.body);
  return false;
}

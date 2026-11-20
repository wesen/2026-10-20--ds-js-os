// The analysis behind convert_assignments and convert_to_closures (chapter 8).
//
// After shrink, the program is one function, main, with every other function nested in it
// (function declarations and arrow functions, each with a unique name). For each function
// this finds:
//
//   free(F)    the variables F uses but does not declare: those of the functions around it.
//              A function's use of its own name is not free: inside F, F is its own closure.
//   closed(F)  for a top-level function declaration: whether it needs no closure. It is
//              closed when every free variable it has is itself the name of a closed
//              top-level function: such a function can be called directly, and since main runs
//              once, it is created once and can have one static closure. That is circular,
//              so it is found as a fixed point: start with every top-level function closed,
//              and drop any that uses something else, until none changes. (Arrow functions
//              and nested declarations are created anew each time their code runs, so each
//              gets a closure even with no free variables; JavaScript gives each a new
//              identity too.)
//   boxed(x)   whether variable x must live in a box (a one-element array) so that every
//              closure that captures it sees the same variable. x needs a box when it is
//              captured and either assigned somewhere, or captured before its declaration has
//              run: a function declaration is created at the start of its block, so it can
//              capture a variable declared further down, and an arrow function can capture the
//              variable its own declaration is initialising (const f = (n) => ... f(n - 1)).

import { functionType } from './types.js';
import { CompileError } from './utils.js';

export function analyze(main) {
  const funcs = new Map();      // name -> { name, node, parent, declared, refs, children, createdAt }
  const declOf = new Map();     // variable -> the function that declares it
  const initAt = new Map();     // variable -> when its declaration finishes, in execution order
  const typeOf = new Map();     // variable -> its type
  const assigned = new Set();
  const forInit = new Set();    // declared in a for loop's head (chapter 10)
  let pos = 0;

  function declare(x, F, type, at) {
    F.declared.add(x);
    declOf.set(x, F.name);
    typeOf.set(x, type);
    initAt.set(x, at);
  }

  function visitFunction(name, node, params, body, parent) {
    const F = { name, node, parent, declared: new Set(), refs: new Set(), children: [], createdAt: pos };
    funcs.set(name, F);
    if (parent) funcs.get(parent).children.push(name);
    for (const q of params) declare(q.name, F, q.type, -1);
    block(body, F);
    return F;
  }

  function block(stmts, F) {
    // function declarations are created at the start of their block, in order
    const defs = stmts.filter((s) => s.kind === 'FunDef');
    const at = new Map();
    for (const d of defs) {
      at.set(d.name, pos);
      declare(d.name, F, functionType(d.params.map((q) => q.type), d.retType), pos++);
    }
    for (const d of defs) {
      const saved = pos;
      pos = at.get(d.name);
      visitFunction(d.name, d, d.params, d.body, F.name).createdAt = at.get(d.name);
      pos = Math.max(saved, pos);
    }
    for (const s of stmts) if (s.kind !== 'FunDef') stmt(s, F);
  }

  function stmt(s, F) {
    switch (s.kind) {
      case 'Print': exp(s.arg, F); return;
      case 'Const': case 'Let':
        exp(s.init, F);
        declare(s.name, F, s.type, pos++);
        if (s.forInit) forInit.add(s.name);
        return;
      case 'ExprStmt': exp(s.exp, F); return;
      case 'Return': exp(s.arg, F); return;
      case 'Block': block(s.body, F); return;
      case 'IfStmt': exp(s.cond, F); stmt(s.thn, F); stmt(s.els, F); return;
      case 'While': exp(s.cond, F); stmt(s.body, F); if (s.update) stmt(s.update, F); return;
      case 'Break': case 'Continue': return;
      case 'Throw': exp(s.arg, F); return;   // chapter 14
      case 'Try': stmt(s.body, F); if (s.handler) stmt(s.handler, F); if (s.finalizer) stmt(s.finalizer, F); return;
      default: throw new Error(`analyze: unexpected ${s.kind}`);
    }
  }

  function exp(e, F) {
    pos++;
    switch (e.kind) {
      case 'Var': F.refs.add(e.name); return;
      case 'Set': F.refs.add(e.name); assigned.add(e.name); exp(e.exp, F); return;
      case 'Prim': e.args.forEach((a) => exp(a, F)); return;
      case 'If': exp(e.cond, F); exp(e.thn, F); exp(e.els, F); return;
      case 'ArrayLit': e.elems.forEach((a) => exp(a, F)); return;
      case 'Index': exp(e.arr, F); exp(e.idx, F); return;
      case 'SetIndex': exp(e.arr, F); exp(e.idx, F); exp(e.exp, F); return;
      case 'Call': exp(e.fn, F); e.args.forEach((a) => exp(a, F)); return;
      case 'Lambda': visitFunction(e.name, e, e.params, e.body, F.name); return;
      case 'Begin': e.stmts.forEach((s) => stmt(s, F)); exp(e.exp, F); return;   // chapter 9: from shrink's any&& and any||
      default: return;
    }
  }

  visitFunction(main.name, main, main.params, main.body, null);

  // free(F), bottom up
  const raw = new Map();
  const freeOf = (name) => {
    if (raw.has(name)) return raw.get(name);
    const F = funcs.get(name);
    const s = new Set(F.refs);
    for (const c of F.children) for (const x of freeOf(c)) s.add(x);
    for (const x of F.declared) s.delete(x);
    s.delete(name);
    raw.set(name, s);
    return s;
  };
  for (const name of funcs.keys()) freeOf(name);

  // closed(F), the fixed point, over the top-level declarations
  const isFunDef = (x) => funcs.get(x)?.node.kind === 'FunDef';
  const closed = new Set([...funcs.values()].filter((F) => F.parent === main.name && F.node.kind === 'FunDef').map((F) => F.name));
  for (let changed = true; changed; ) {
    changed = false;
    for (const name of closed) {
      if ([...raw.get(name)].some((x) => !closed.has(x))) {
        closed.delete(name);
        changed = true;
      }
    }
  }
  const free = (name) => [...raw.get(name)].filter((x) => !closed.has(x)).sort();

  // boxed(x)
  const boxed = new Set();
  for (const [name, F] of funcs) {
    if (name === main.name || closed.has(name)) continue;
    const parent = funcs.get(F.parent);
    for (const x of free(name)) {
      if (assigned.has(x)) boxed.add(x);
      // captured before its declaration finished: only F's creation in x's own function counts
      if (declOf.get(x) === parent.name && F.createdAt < initAt.get(x)) boxed.add(x);
    }
  }
  // (a variable can be captured by a function nested deeper than a child of its own function;
  // that child then has it among its free variables too, and decides)

  // A boxed function whose own nested functions use its name: they capture its box, so it
  // must have the box at hand, as a free variable of its own (rather than itself, its env).
  for (const [name, F] of funcs)
    if (boxed.has(name) && F.children.some((c) => raw.get(c).has(name))) raw.get(name).add(name);

  // Chapter 10: JavaScript gives each iteration of for (let i = ...) its own i, which a
  // closure would see; this compiler has one i for the whole loop, so a closure must not
  // capture it.
  for (const [name, F] of funcs) {
    if (name === main.name) continue;
    for (const x of raw.get(name))
      if (forInit.has(x)) throw new CompileError(`a function captures ${x.replace(/\.\d+$/, '')}, a for loop's own variable; declare a copy inside the loop body`);
  }

  return {
    funcs, typeOf, boxed,
    closed: (name) => closed.has(name),
    isFunDef,
    free,
  };
}

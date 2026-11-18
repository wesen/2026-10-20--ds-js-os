// check_bounds: make every array access check its index first.
//
// JavaScript gives undefined for a[i] when i is outside the array, and a[i] = v outside it
// makes the array longer. The subset has neither, so an index out of range stops the
// program. This pass writes the check out as code, before the access:
//
//   a[i]   =>   (const a.1 = a; const i.2 = i;
//                if (i.2 < 0 ? true : i.2 >= a.1.length) trap("index out of range");
//                a.1[i.2])
//
// (written informally; the parenthesised sequence is a Begin). After this pass every Index
// and SetIndex is known to be in range, and the later passes can compile it as a plain load
// or store. An array or index that is already a variable that is never assigned, or a
// literal index, is used directly instead of through a new temporary.

import { Program, Print, Const, Block, Prim, If, IfStmt, Let, Set as SetExp, ExprStmt, While, Var, Int, Bool,
  ArrayLit, Index, SetIndex, Begin, Trap, Call, Return } from './ast.js';
import { mapDefs } from './defs.js';
import { gensym } from './utils.js';

const stable = (e) => e.kind === 'Var' || e.kind === 'Int';

// Chapter 15: an array is an object that holds its length and a pointer to its storage,
// which may be replaced when the array grows; an element is read from the storage the
// array has now: a[i] is arr_storage(a)[i].
const storage = (a) => Prim('arr_storage', [a]);

function guarded(arr, idx, access, pre = []) {
  const stmts = [...pre];
  const name = (e, base) => {
    if (stable(e)) return e;
    const t = gensym(base);
    stmts.push(Const(t, e));
    return Var(t);
  };
  const a = name(arr, 'arr'), i = name(idx, 'idx');
  // A literal index needs only one of the two tests.
  const tooBig = Prim('>=', [i, Prim('length', [a])]);
  const outside = i.kind !== 'Int' ? If(Prim('<', [i, Int(0)]), Bool(true), tooBig)
    : i.value < 0 ? Bool(true) : tooBig;
  stmts.push(IfStmt(outside, Trap('index out of range'), Block([])));
  return Begin(stmts, access(a, i));
}

function exp(e) {
  switch (e.kind) {
    case 'Prim': return Prim(e.op, e.args.map(exp));
    case 'If': return If(exp(e.cond), exp(e.thn), exp(e.els));
    case 'Set': return SetExp(e.name, exp(e.exp));
    case 'ArrayLit': return { ...e, elems: e.elems.map(exp) };
    case 'Call': return { ...e, fn: exp(e.fn), args: e.args.map(exp) };
    case 'Begin': return { ...e, stmts: e.stmts.map(stmt), exp: exp(e.exp) };
    case 'Closure': return { ...e, fvs: e.fvs.map(exp) };
    // a box (chapter 8) has one element, read and written at index 0: no check needed
    case 'Index':
      if (e.unchecked) return { ...e, arr: exp(e.arr) };
      return guarded(exp(e.arr), exp(e.idx), (a, i) => Index(storage(a), i));
    case 'SetIndex': {
      const v = exp(e.exp);
      if (e.unchecked) return { ...e, arr: exp(e.arr), exp: v };
      // the value first: computing it may make the array grow (a[i] = f(), f pushing to a),
      // and then the check and the store must see the array as it is after
      const a = exp(e.arr), i = exp(e.idx);
      if (v.kind === 'Var' || v.kind === 'Int' || v.kind === 'Bool') return guarded(a, i, (x, j) => SetIndex(storage(x), j, v));
      const t = gensym('val'), ta = gensym('arr'), ti = gensym('idx');
      return guarded(Var(ta), Var(ti), (x, j) => SetIndex(storage(x), j, Var(t)), [Const(ta, a), Const(ti, i), Const(t, v)]);
    }
    default: return e;
  }
}

function stmt(s) {
  switch (s.kind) {
    case 'Print': return { ...s, arg: exp(s.arg) };
    case 'Const': return { ...s, init: exp(s.init) };
    case 'Let': return { ...s, init: exp(s.init) };
    case 'ExprStmt': return ExprStmt(exp(s.exp));
    case 'Block': return Block(s.body.map(stmt));
    case 'IfStmt': return IfStmt(exp(s.cond), stmt(s.thn), stmt(s.els));
    case 'While': return { ...s, cond: exp(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
    case 'Throw': return { ...s, arg: exp(s.arg) };   // chapter 14
    case 'Try': return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      case 'Break': case 'Continue': return s;
    case 'Return': return Return(exp(s.arg));
    default: throw new Error(`check_bounds: unexpected ${s.kind}`);
  }
}

export function checkBounds(p) {
  return mapDefs(p, (body) => body.map(stmt));
}

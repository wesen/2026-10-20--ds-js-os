// convert_assignments: put each variable that closures must share into a box.
//
// A closure copies the values of its free variables when it is created (convert_to_closures
// builds "flat" closures). That is right for a variable that never changes after the closure
// is made. It is wrong for one that does:
//
//   let count = 0;
//   const inc = () => { count += 1; return count; };
//
// inc and the code around it must see one count, not two copies. So count becomes a box, a
// one-element array that both hold a pointer to:
//
//   const count = [uninitialized];      (at the start of the block)
//   count[0] = 0;                       (where the declaration was)
//   ... count[0] = count[0] + 1 ...
//
// A box is made at the start of its variable's block, because a function declared in that
// block is created there and may already capture it. Until the declaration runs, the box
// holds a placeholder (the variable is in its temporal dead zone). free.js decides which
// variables need boxes. This pass also moves each block's function declarations to its
// start, where JavaScript creates them.

import { Const, Let, Block, IfStmt, While, Return, Print, ExprStmt, Prim, If, Var, Int, ArrayLit, Index, SetIndex,
  Uninit, FunDef } from './ast.js';
import { arrayOf, functionType } from './types.js';
import { analyze } from './free.js';
import { gensym } from './utils.js';
import { mapDefs } from './defs.js';

const unchecked = (e) => ({ ...e, unchecked: true });

export function convertAssignments(p) {
  const A = analyze(p.defs[0]);
  const box = (x) => A.boxed.has(x);
  const boxType = (x) => arrayOf(A.typeOf.get(x));

  function exp(e) {
    switch (e.kind) {
      case 'Var': return box(e.name) ? unchecked(Index(e, Int(0))) : e;
      case 'Set': return box(e.name) ? unchecked(SetIndex(Var(e.name), Int(0), exp(e.exp))) : { ...e, exp: exp(e.exp) };
      case 'Prim': return Prim(e.op, e.args.map(exp));
      case 'If': return If(exp(e.cond), exp(e.thn), exp(e.els));
      case 'ArrayLit': return { ...e, elems: e.elems.map(exp) };
      case 'Index': return { ...e, arr: exp(e.arr), idx: exp(e.idx) };
      case 'SetIndex': return { ...e, arr: exp(e.arr), idx: exp(e.idx), exp: exp(e.exp) };
      case 'Call': return { ...e, fn: exp(e.fn), args: e.args.map(exp) };
      case 'Lambda': return { ...e, ...func(e.params, e.body) };
      case 'Begin': return { ...e, stmts: e.stmts.map(stmt), exp: exp(e.exp) };
      default: return e;
    }
  }

  // A function's parameters and body. A boxed parameter arrives under a new name and is put
  // into a box under its own name first.
  function func(params, body) {
    const ps = params.map((q) => (box(q.name) ? { ...q, name: gensym(q.name) } : q));
    const boxes = params.filter((q, k) => box(q.name))
      .map((q) => Const(q.name, { ...ArrayLit([Var(ps[params.indexOf(q)].name)], boxType(q.name)), box: true }, boxType(q.name)));
    return { params: ps, body: [...boxes, ...block(body)] };
  }

  function block(stmts) {
    const boxes = stmts.filter((s) => ['Const', 'Let', 'FunDef'].includes(s.kind) && box(s.name))
      .map((s) => Const(s.name, { ...ArrayLit([Uninit(A.typeOf.get(s.name))], boxType(s.name)), box: true }, boxType(s.name)));
    const defs = stmts.filter((s) => s.kind === 'FunDef').map((d) => {
      const { params, body } = func(d.params, d.body);
      return { ...FunDef(d.name, params, d.retType, body), boxed: box(d.name) };
    });
    return [...boxes, ...defs, ...stmts.filter((s) => s.kind !== 'FunDef').map(stmt)];
  }

  function stmt(s) {
    switch (s.kind) {
      case 'Const':
      case 'Let':
        if (box(s.name)) return ExprStmt(unchecked(SetIndex(Var(s.name), Int(0), exp(s.init))));
        return (s.kind === 'Const' ? Const : Let)(s.name, exp(s.init), s.type);
      case 'Print': return { ...s, arg: exp(s.arg) };
      case 'ExprStmt': return ExprStmt(exp(s.exp));
      case 'Return': return Return(exp(s.arg));
      case 'Block': return Block(block(s.body));
      case 'IfStmt': return IfStmt(exp(s.cond), stmt(s.thn), stmt(s.els));
      case 'While': return { ...s, cond: exp(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
      case 'Throw': return { ...s, arg: exp(s.arg) };   // chapter 14
      case 'Try': return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      case 'Break': case 'Continue': return s;
      default: throw new Error(`convert_assignments: unexpected ${s.kind}`);
    }
  }

  return mapDefs(p, (body) => block(body));
}

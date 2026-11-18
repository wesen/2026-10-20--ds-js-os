// uncover_get: mark the reads of variables that are assigned somewhere.
//
// remove_complex_operands treats a variable as an atom: it leaves `x` in place and computes
// the other operands into temporaries before the operation. That is correct only if the
// value of x cannot change in between. In
//
//   let x = 1;
//   console.log(x + (x = 5));        // 6: JavaScript reads x (1) before it assigns 5
//
// the assignment is moved before the addition, and reading x afterwards gives 10. So a
// read of a variable that is assigned anywhere in the program becomes GetBang(x), which
// remove_complex_operands copies into a temporary at the point where it is read.
// Variables that are never assigned (every const, and most lets) stay atoms.

import {
  Program, Print, Const, Block, Prim, If, IfStmt, Let, Set as SetExp, ExprStmt, While, GetBang, ArrayLit, Index, SetIndex,
  Call, Return,
} from './ast.js';
import { mapDefs } from './defs.js';

function assigned(p) {
  const names = new Set();
  const exp = (e) => {
    switch (e.kind) {
      case 'Prim': e.args.forEach(exp); return;
      case 'If': exp(e.cond); exp(e.thn); exp(e.els); return;
      case 'Set': names.add(e.name); exp(e.exp); return;
      case 'ArrayLit': e.elems.forEach(exp); return;
      case 'Index': exp(e.arr); exp(e.idx); return;
      case 'SetIndex': exp(e.arr); exp(e.idx); exp(e.exp); return;
      case 'Call': exp(e.fn); e.args.forEach(exp); return;
      case 'Begin': e.stmts.forEach(stmt); exp(e.exp); return;
      case 'Closure': e.fvs.forEach(exp); return;
      default: return;
    }
  };
  const stmt = (s) => {
    switch (s.kind) {
      case 'Print': exp(s.arg); return;
      case 'Const': case 'Let': exp(s.init); return;
      case 'ExprStmt': exp(s.exp); return;
      case 'Block': s.body.forEach(stmt); return;
      case 'IfStmt': exp(s.cond); stmt(s.thn); stmt(s.els); return;
      case 'While': exp(s.cond); stmt(s.body); if (s.update) stmt(s.update); return;
      case 'Throw': exp(s.arg); return;   // chapter 14
      case 'Try': stmt(s.body); if (s.handler) stmt(s.handler); if (s.finalizer) stmt(s.finalizer); return;
      case 'Break': case 'Continue': return;
      case 'Return': exp(s.arg); return;
      default: throw new Error(`uncover_get: unexpected ${s.kind}`);
    }
  };
  for (const d of p.defs) {
    d.body.forEach(stmt);
    // a parameter that the body assigns is mutable too (it is declared by the call)
  }
  return names;
}

export function uncoverGet(p) {
  const mutable = assigned(p);
  const exp = (e) => {
    switch (e.kind) {
      case 'Var': return mutable.has(e.name) ? GetBang(e.name) : e;
      case 'Prim': return Prim(e.op, e.args.map(exp));
      case 'If': return If(exp(e.cond), exp(e.thn), exp(e.els));
      case 'Set': return SetExp(e.name, exp(e.exp));
      case 'ArrayLit': return { ...e, elems: e.elems.map(exp) };
      case 'Index': return { ...e, arr: exp(e.arr), idx: exp(e.idx) };
      case 'SetIndex': return { ...e, arr: exp(e.arr), idx: exp(e.idx), exp: exp(e.exp) };
      case 'Call': return { ...e, fn: exp(e.fn), args: e.args.map(exp) };
      case 'Begin': return { ...e, stmts: e.stmts.map(stmt), exp: exp(e.exp) };
      case 'Closure': return { ...e, fvs: e.fvs.map(exp) };
      default: return e;
    }
  };
  const stmt = (s) => {
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
      default: throw new Error(`uncover_get: unexpected ${s.kind}`);
    }
  };
  return mapDefs(p, (body) => body.map(stmt));
}

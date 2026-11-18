// reveal_functions: a name that refers to a function becomes FunRef(name, arity).
//
// After uniquify a function's name is unique, so any Var with that name is the function
// itself, used as a value or called. Making that explicit lets later passes tell a direct
// call, f(x), whose target is known when the program is compiled, from a call through a
// variable, g(x), whose target is known only when it runs. The two compile differently:
// a direct call jumps to a label, an indirect call to an address held in a register.

import { Prim, If, IfStmt, Let, Const, Print, Block, ExprStmt, While, Set as SetExp, ArrayLit, Index, SetIndex,
  Call, Return, FunRef } from './ast.js';
import { mapDefs } from './defs.js';

export function revealFunctions(p) {
  const arity = new Map(p.defs.map((d) => [d.name, d.params.length]));
  const exp = (e) => {
    switch (e.kind) {
      case 'Var': return arity.has(e.name) ? FunRef(e.name, arity.get(e.name)) : e;
      case 'Prim': return Prim(e.op, e.args.map(exp));
      case 'If': return If(exp(e.cond), exp(e.thn), exp(e.els));
      case 'Set': return SetExp(e.name, exp(e.exp));
      case 'ArrayLit': return { ...e, elems: e.elems.map(exp) };
      case 'Index': return Index(exp(e.arr), exp(e.idx));
      case 'SetIndex': return SetIndex(exp(e.arr), exp(e.idx), exp(e.exp));
      case 'Call': return Call(exp(e.fn), e.args.map(exp));
      default: return e;
    }
  };
  const stmt = (s) => {
    switch (s.kind) {
      case 'Print': return { ...s, arg: exp(s.arg) };
      case 'Const': return Const(s.name, exp(s.init));
      case 'Let': return Let(s.name, exp(s.init));
      case 'ExprStmt': return ExprStmt(exp(s.exp));
      case 'Block': return Block(s.body.map(stmt));
      case 'IfStmt': return IfStmt(exp(s.cond), stmt(s.thn), stmt(s.els));
      case 'While': return { ...s, cond: exp(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
      case 'Throw': return { ...s, arg: exp(s.arg) };   // chapter 14
      case 'Try': return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      case 'Break': case 'Continue': return s;
      case 'Return': return Return(exp(s.arg));
      default: throw new Error(`reveal_functions: unexpected ${s.kind}`);
    }
  };
  return mapDefs(p, (body) => body.map(stmt));
}

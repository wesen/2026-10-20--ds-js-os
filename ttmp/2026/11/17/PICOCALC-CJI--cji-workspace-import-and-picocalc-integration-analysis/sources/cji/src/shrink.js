// shrink: express && and || with ?:, and give every if an else.
//
// With booleans only, `a && b` is `a ? b : false` and `a || b` is `a ? true : b`: the right
// operand is evaluated only when the left one does not decide the answer, which is exactly
// JavaScript's short-circuit rule. After this pass the later passes have one conditional
// form for expressions and one for statements, and no special cases for && and ||.

import {
  Program, Print, Const, Block, Prim, If, IfStmt, Bool, Let, Set as SetExp, ExprStmt, While, Var, ArrayLit, Index, SetIndex,
  FunDef, Call, Return, ProgramDefs, Int, Lambda, Begin, AnyLit,
} from './ast.js';
import { gensym } from './utils.js';
//
// Chapter 9: with dynamic values, a && b and a || b give back an operand, not a boolean:
// 0 || 5 is 5. cast_insert marks those as any&& and any||, and they become
//   const t = a; truthy(t) ? b : t        and        const t = a; truthy(t) ? t : b
//
// Chapter 7: the program becomes a list of function definitions. The statements at the top
// level go into one more function, main, which returns 0 at the end.
//
// Chapter 8: the top-level function declarations go into main too, where they are what they
// have always been in JavaScript: functions nested in the program, able to use its
// variables. convert_to_closures lifts every function out again.
//
// Chapter 5: a compound assignment x += e becomes x = x + e. JavaScript reads x before it
// evaluates e, and so does x + e, so the order of evaluation is unchanged.

function exp(e) {
  switch (e.kind) {
    case 'Int':
    case 'Num':
    case 'Str':     // chapter 13
    case 'Shape':
    case 'Caught':  // chapter 14
    case 'Bool':
    case 'Var':
    case 'AnyLit':
      return e;
    case 'Begin':   // (CJI-3: cast_insert's, an object as a condition evaluated for what it does)
      return { ...e, stmts: e.stmts.map(stmt), exp: exp(e.exp) };
    case 'Prim': {
      const args = e.args.map(exp);
      if (e.op === '&&') return If(args[0], args[1], Bool(false));
      if (e.op === '||') return If(args[0], Bool(true), args[1]);
      if (e.op === 'any&&' || e.op === 'any||') {
        const t = gensym('t');
        const test = Prim('truthy', [Var(t)]);
        return Begin([Const(t, args[0], 'Any')], e.op === 'any&&' ? If(test, args[1], Var(t)) : If(test, Var(t), args[1]));
      }
      if (e.op === 'any??') {   // chapter 10: t == null holds for null and undefined only
        const t = gensym('t');
        return Begin([Const(t, args[0], 'Any')], If(Prim('any==', [Var(t), AnyLit(null)]), args[1], Var(t)));
      }
      return Prim(e.op, args);
    }
    case 'If':
      return If(exp(e.cond), exp(e.thn), exp(e.els));
    case 'Set':
      return SetExp(e.name, e.op ? Prim(e.op, [Var(e.name), exp(e.exp)]) : exp(e.exp));
    case 'ArrayLit':
      return { ...e, elems: e.elems.map(exp) };
    case 'Index':   // (keeps chapter 13's unchecked and fieldType)
      return { ...e, arr: exp(e.arr), idx: exp(e.idx) };
    case 'Call':
      return { ...e, fn: exp(e.fn), args: e.args.map(exp) };
    case 'Lambda':
      return { ...e, body: e.body.map(stmt) };
    case 'SetIndex':   // a[i] += e: the parser allows it only when a and i are names or numbers
      return { ...e, arr: exp(e.arr), idx: exp(e.idx), op: null, exp: e.op ? Prim(e.op, [Index(e.arr, e.idx), exp(e.exp)]) : exp(e.exp) };
    default:
      throw new Error(`shrink: unexpected ${e.kind}`);
  }
}

function stmt(s) {
  switch (s.kind) {
    case 'Print': return { ...s, arg: exp(s.arg) };
    case 'Const': return { ...s, init: exp(s.init) };
    case 'Block': return Block(s.body.map(stmt));
    case 'IfStmt': return IfStmt(exp(s.cond), stmt(s.thn), s.els ? stmt(s.els) : Block([]));
    case 'Let': return { ...s, init: exp(s.init) };
    case 'ExprStmt': return ExprStmt(exp(s.exp));
    case 'While': return { ...s, cond: exp(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
    case 'Throw': return { ...s, arg: exp(s.arg) };   // chapter 14
    case 'Try': return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      case 'Break': case 'Continue': return s;
    case 'Return': return Return(exp(s.arg));
    case 'FunDef': return FunDef(s.name, s.params, s.retType, s.body.map(stmt));
    default: throw new Error(`shrink: unexpected ${s.kind}`);
  }
}

export function shrink(p) {
  return ProgramDefs([FunDef('main', [], 'Int', [...p.body.map(stmt), Return(Int(0))])]);
}

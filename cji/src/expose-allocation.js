// expose_allocation: turn each array literal into the code that allocates it.
//
//   [e1, e2]   =>   (const tmp.1 = e1; const tmp.2 = e2;
//                    if (free_ptr + 24 < fromspace_end) {} else collect(24);
//                    const v.3 = allocate(2, Int[]);
//                    v.3[0] = tmp.1; v.3[1] = tmp.2;
//                    v.3)
//
// The elements are computed first, because computing them may allocate (they may be
// arrays themselves), and a collection between allocate and the stores would find an
// object whose elements are not written yet. Then the space is checked: an array of n
// elements takes 8(n + 1) bytes, one header word and one word per element. If there is
// not enough room, collect makes some. allocate takes the space and writes the header;
// the stores fill the elements in.
//
// After this pass nothing allocates except Allocate, and nothing collects except Collect.

import { Program, Print, Const, Block, Prim, If, IfStmt, Let, Set as SetExp, ExprStmt, While, Var, Int,
  ArrayLit, Index, SetIndex, Begin, GlobalValue, Allocate, Collect, Call, Return, FunRef } from './ast.js';
import { isPointerType, recordFields } from './types.js';
import { mapDefs } from './defs.js';
import { gensym, CompileError } from './utils.js';

function allocation(lit, mask) {
  const stmts = [];
  const elems = lit.elems.map((e) => {
    const t = gensym('elem');
    stmts.push(Const(t, exp(e)));
    return Var(t);
  });
  // Chapter 15: an array (not a box, a record or a closure) is an object of two words, its
  // length and its storage, followed by the storage, a plain object of its elements: one
  // allocation makes both
  const growable = mask === undefined && !lit.box;
  const bytes = 8 * (elems.length + 1) + (growable ? 24 : 0);
  const fits = Prim('<', [Prim('+', [GlobalValue('free_ptr'), Int(bytes)]), GlobalValue('fromspace_end')]);
  stmts.push(IfStmt(fits, Block([]), Block([Collect(bytes)])));
  const v = gensym('alloc');
  stmts.push(Const(v, { ...Allocate(elems.length, lit.type), mask, growable }));
  const target = growable ? Prim('arr_storage', [Var(v)]) : Var(v);
  // in range by construction; a record's fields go to their slots (chapter 13)
  elems.forEach((t, k) => stmts.push(ExprStmt({ ...SetIndex(target, Int(lit.slots ? lit.slots[k] : k), t), unchecked: true })));
  return Begin(stmts, Var(v));
}

function exp(e) {
  switch (e.kind) {
    case 'Prim': return Prim(e.op, e.args.map(exp));
    case 'If': return If(exp(e.cond), exp(e.thn), exp(e.els));
    case 'Set': return SetExp(e.name, exp(e.exp));
    case 'ArrayLit':
      if (e.record) {   // chapter 13: a record's header marks which fields are pointers, after the shape
        // (chapter 19: and its last word, for properties added at run time, a dynamic value)
        const fields = recordFields(e.type);
        if (fields.length + 2 > 30) throw new CompileError(`an object with ${fields.length} fields: at most 28 in this subset`);
        return allocation(e, fields.reduce((m, [, t], k) => m + (isPointerType(t) ? 2 ** (k + 1) : 0), 2 ** (fields.length + 1)));
      }
      return allocation(e);
    // Chapter 8: a closure is an object whose field 0 is a code address and whose other
    // fields are the free variables; its header's mask marks which of those are pointers.
    case 'Closure': {
      const mask = e.types.reduce((m, t, k) => m + (isPointerType(t) ? 2 ** (k + 1) : 0), 0);
      if (e.fvs.length + 1 > 30) throw new Error('a closure with more than 29 free variables');
      return allocation({ elems: [FunRef(e.fn, 0), ...e.fvs], type: e.closureType }, mask);
    }
    case 'SetIndex': return { ...e, arr: exp(e.arr), idx: exp(e.idx), exp: exp(e.exp) };
    case 'Call': return { ...e, fn: exp(e.fn), args: e.args.map(exp) };
    case 'Index': return { ...e, arr: exp(e.arr), idx: exp(e.idx) };
    case 'Begin': return Begin(e.stmts.map(stmt), exp(e.exp));
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
    case 'Trap': return s;
    default: throw new Error(`expose_allocation: unexpected ${s.kind}`);
  }
}

export function exposeAllocation(p) {
  return mapDefs(p, (body) => body.map(stmt));
}

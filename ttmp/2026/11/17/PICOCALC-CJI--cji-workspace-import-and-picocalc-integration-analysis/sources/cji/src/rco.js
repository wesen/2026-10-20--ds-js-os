// remove_complex_operands: make every operand of an operation an atom.
//
// An atom is an integer or a variable. A complex operand, such as the `2 * 3` in
// `1 + 2 * 3`, is computed into a fresh temporary first:
//
//   console.log(1 + 2 * 3);   =>   const tmp.1 = 2 * 3;
//                                  const tmp.2 = 1 + tmp.1;
//                                  console.log(tmp.2);
//
// The output language L_Var^mon is L_Var with that restriction ("mon" for monadic normal
// form). A declaration's initializer may still be one operation on atoms.
//
// Chapter 4: true and false are atoms too. A conditional `c ? a : b` is not an atom, but it
// may be an initializer or a condition, and its two branches are evaluated only if chosen,
// so the temporaries a branch needs must stay inside that branch. They go into a Begin:
//
//   const x = c ? 1 + 2 * y : 0;   =>   const x = c ? (const tmp.1 = 2 * y; 1 + tmp.1) : 0;
//
// (written informally; Begin has no JavaScript syntax). The condition's temporaries can go
// before the whole expression, because the condition is always evaluated first.

// Chapter 5: a read of an assigned variable (GetBang, from uncover_get) is not an atom and
// is copied into a temporary where it happens. An assignment used as a value,
//
//   y = (x = e) + 1;   =>   const tmp.1 = e;  x = tmp.1;  const tmp.2 = tmp.1 + 1;  y = tmp.2;
//
// becomes a statement, and its value is the temporary, not x: x may be assigned again before
// the value is used. A while loop's condition runs before every iteration, so its
// temporaries go into a Begin inside the condition rather than before the loop.

import { Program, Print, Const, Block, Var, Prim, If, IfStmt, Begin, Let, Assign, While, Index, Store, Call, Return } from './ast.js';
import { mapDefs } from './defs.js';
//
// Chapter 7: a call is complex. A function reference used as a value is complex too (it is
// an address that must be loaded); as the callee of a call it stays in place, because a
// direct call jumps to its label. A return keeps a call as its whole expression, so that
// explicate_control can recognise a tail call.
//
// Chapter 6: an element read a[i] is not an atom; an element assignment becomes a Store
// statement, its value the stored atom. The Begins that check_bounds and expose_allocation
// made contribute their statements to the statement being built, in order.
import { gensym } from './utils.js';
import { STRING_ARITY } from './strings.js';

// Returns an atom with the value of e; any work it needs goes into binds, in order.
function rcoAtom(e, binds) {
  switch (e.kind) {
    case 'Int':
    case 'Bool':
    case 'Var':
    case 'Uninit':
    case 'AnyLit':          // chapter 9: a constant of type Any is one word, an immediate
    case 'Num':             // chapter 10: a double, likewise
      return e;
    case 'Prim':
    case 'If':
    case 'GetBang':
    case 'EnvRef':
    case 'StaticClosure':
    case 'Index':
    case 'Allocate':
    case 'GlobalValue':
    case 'Call':
    case 'FunRef':
    case 'Str':             // chapter 13: a string's or a shape's address is loaded into a temporary
    case 'Shape':
    case 'Caught': {        // chapter 14: the value being caught, a global of the runtime
      const rhs = rcoExp(e, binds);   // the operands' temporaries come first
      const tmp = gensym('tmp');
      binds.push(Const(tmp, rhs));
      return Var(tmp);
    }
    case 'Set': {
      const rhs = rcoExp(e.exp, binds);
      const tmp = gensym('tmp');
      binds.push(Const(tmp, rhs), Assign(e.name, Var(tmp)));
      return Var(tmp);
    }
    case 'SetIndex': {
      const a = rcoAtom(e.arr, binds), i = rcoAtom(e.idx, binds), v = rcoAtom(e.exp, binds);
      binds.push(Store(a, i, v));
      return v;
    }
    case 'Begin':
      binds.push(...rcoStmts(e.stmts));
      return rcoAtom(e.exp, binds);
    default:
      throw new Error(`rcoAtom: unexpected ${e.kind}`);
  }
}

// Returns an expression whose operands are atoms.
function rcoExp(e, binds) {
  switch (e.kind) {
    case 'Int':
    case 'Bool':
    case 'Var':
      return e;
    case 'Prim':
      return Prim(e.op, e.args.map((a) => rcoAtom(a, binds)));
    case 'If':
      return If(rcoExp(e.cond, binds), rcoBranch(e.thn), rcoBranch(e.els));
    case 'GetBang':
      return Var(e.name);       // as a whole initializer it is read right here, in order
    case 'Set':
    case 'SetIndex':
      return rcoAtom(e, binds);
    case 'Index':
      return { ...e, arr: rcoAtom(e.arr, binds), idx: rcoAtom(e.idx, binds) };   // keeps a field's type (chapter 13)
    case 'Str':
    case 'Shape':
    case 'Caught':
    case 'Allocate':
    case 'GlobalValue':
    case 'FunRef':
    case 'StaticClosure':
    case 'Uninit':
    case 'AnyLit':
    case 'Num':
      return e;
    case 'EnvRef':
      return { ...e, env: rcoAtom(e.env, binds) };
    case 'Call': {
      const fn = e.fn.kind === 'FunRef' ? e.fn : rcoAtom(e.fn, binds);   // the callee first, as in JavaScript
      return { ...e, fn, args: e.args.map((a) => rcoAtom(a, binds)) };
    }
    case 'Begin':
      binds.push(...rcoStmts(e.stmts));
      return rcoExp(e.exp, binds);
    default:
      throw new Error(`rcoExp: unexpected ${e.kind}`);
  }
}

// A branch of ?: keeps its own temporaries.
function rcoBranch(e) {
  const binds = [];
  const out = rcoExp(e, binds);
  return binds.length ? Begin(binds, out) : out;
}

// The body of an if or else: a block, so that its temporaries stay in the branch.
const rcoBody = (s) => Block(rcoStmts(s.kind === 'Block' ? s.body : [s]));

// An expression evaluated only for what it does: x = e; and a[i] = e; need no temporary
// for their value.
function effect(e, binds) {
  switch (e.kind) {
    case 'Set':
      binds.push(Assign(e.name, rcoExp(e.exp, binds)));
      return;
    case 'SetIndex': {
      const a = rcoAtom(e.arr, binds), i = rcoAtom(e.idx, binds), v = rcoAtom(e.exp, binds);
      binds.push(Store(a, i, v));
      return;
    }
    case 'Begin':
      binds.push(...rcoStmts(e.stmts));
      effect(e.exp, binds);
      return;
    case 'If': {      // CJI-3: c ? a : b for its effects (x ?? (x = e), a || (a = e) as statements)
      const c = rcoExp(e.cond, binds);
      const branch = (x) => { const bs = []; effect(x, bs); return Block(bs); };
      binds.push(IfStmt(c, branch(e.thn), branch(e.els)));
      return;
    }
    case 'Call':      // called for what it does; its result goes into a temporary nobody reads
      binds.push(Const(gensym('ignored'), rcoExp(e, binds)));
      return;
    case 'Prim':      // chapter 13: o.f = v on a dynamic o, and the operators that may stop the program
      if (e.op === 'any_set' || e.op.startsWith('project_') || STRING_ARITY[e.op] !== undefined) {
        binds.push(Const(gensym('ignored'), rcoExp(e, binds)));
        return;
      }
      rcoExp(e, binds);
      return;
    default:
      rcoExp(e, binds);
  }
}

function rcoStmts(stmts) {
  const out = [];
  for (const s of stmts) {
    const binds = [];
    switch (s.kind) {
      case 'Print': {
        const a = rcoAtom(s.arg, binds);
        out.push(...binds, { ...s, arg: a });
        break;
      }
      case 'Break':
      case 'Continue':
        out.push(s);
        break;
      case 'IfStmt': {
        const c = rcoExp(s.cond, binds);
        out.push(...binds, IfStmt(c, rcoBody(s.thn), rcoBody(s.els)));
        break;
      }
      case 'Const':
      case 'Let': {
        const e = rcoExp(s.init, binds);
        out.push(...binds, (s.kind === 'Const' ? Const : Let)(s.name, e));
        break;
      }
      case 'ExprStmt':
        effect(s.exp, binds);
        out.push(...binds);
        break;
      case 'Trap':
      case 'Collect':
        out.push(s);
        break;
      case 'Return': {
        const e = rcoExp(s.arg, binds);
        out.push(...binds, Return(e));
        break;
      }
      case 'While':
        out.push({ ...s, cond: rcoBranch(s.cond), body: rcoBody(s.body), update: s.update && rcoBody(s.update) });
        break;
      case 'Block':
        out.push(Block(rcoStmts(s.body)));
        break;
      case 'Throw':   // chapter 14
      {
        const a = rcoAtom(s.arg, binds);
        out.push(...binds, { ...s, arg: a });
        break;
      }
      case 'Try':
        out.push({ ...s, body: rcoBody(s.body), handler: s.handler && rcoBody(s.handler), finalizer: s.finalizer && rcoBody(s.finalizer) });
        break;
      default:
        throw new Error(`rco: unexpected ${s.kind}`);
    }
  }
  return out;
}

export function removeComplexOperands(p) {
  return mapDefs(p, (body) => rcoStmts(body));
}

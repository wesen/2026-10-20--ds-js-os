// explicate_control: from nested statements and expressions to C_If, labelled blocks of
// straight-line statements that each end in a tail: return, goto, or a two-way branch on a
// comparison.
//
// The pass works backwards. Each function below takes the code that must run *after* the
// thing it translates (its continuation, a tail) and returns a tail that runs the thing
// and then the continuation:
//
//   explicateStmts(stmts, cont)      run stmts, then cont
//   explicateAssign(e, x, cont)      x = e, then cont
//   explicatePred(c, thn, els)       if c then thn else els
//
// When a continuation would be needed in two places (after both branches of an if), it is
// put in a block of its own once and both places jump to it: createBlock. That keeps the
// output linear in the size of the input; copying the continuation instead would double it
// at every if.
//
// Inside one function a tail is built as a chain of Seq(stmt, tail) nodes; at the end each
// chain becomes a CBlock(label, stmts, tail).
//
// Chapter 5: a while loop is a block that tests the condition and either runs the body,
// which ends by jumping back to the test, or continues after the loop. The test's label is
// made first, because the body's continuation jumps to it.

import { Assign, Return, Int, Bool, Prim, Var, CBlock, CProgram, Goto, IfGoto, CDef, CProgramDefs, TailCall,
  GlobalValue, SetGlobal, Uncaught } from './ast.js';
//
// Chapter 7: each function becomes its own set of blocks, each with its own start. A
// return ends the code that follows it (nothing after it in the same block can run), and a
// return of a call becomes a tail call: the callee returns straight to this function's
// caller.
import { CMP, NUM_CMP } from './grammar.js';
import { gensym } from './utils.js';
import { THROWS } from './strings.js';
//
// Chapter 14: exceptions. The runtime has two globals, exc_flag (1 while an exception is on
// its way) and exc_value (the value thrown). A throw sets both and goes to the current
// handler. A call, and a runtime operation that can throw, is followed by a test of
// exc_flag that goes to the current handler too. The current handler is the nearest
// enclosing catch or finally of the same function, or the function's exit, which returns
// to its caller with the flag still set (main's reports the exception and stops). So an
// exception travels through the calls by ordinary returns, each caller testing the flag.
//
// A finally runs on every way out of its try. Its code is made once for each: after the
// try (or the catch) ends normally, after an exception (which then goes on), and before
// each return, break or continue that leaves the try.

const Seq = (stmt, tail) => ({ kind: 'Seq', stmt, tail });

function explicateBody(body, finish, isMain) {
  const blocks = new Map();   // label -> tail (with Seq chains)
  const targets = new Map();  // a loop's label -> where break and continue go (chapter 10)
  // chapter 14: where an exception goes from here, and the finalizers between here and the
  // function's exit (innermost last), each with the handler that was current at its try
  const exit = isMain ? Seq(Uncaught(), Return(Int(1))) : Return(Int(0));
  let handler = null;         // set below, once createBlock exists
  let finallies = [];

  // A tail that jumps to `tail`, putting it in a new block unless it is a jump already.
  function createBlock(tail) {
    if (tail.kind === 'Goto') return tail;
    const label = gensym('block');
    blocks.set(label, tail);
    return Goto(label);
  }

  handler = createBlock(exit);

  // Runs f with `h` as the current handler (and `fs` as the finalizers in force).
  function within(h, fs, f) {
    const savedH = handler, savedF = finallies;
    handler = h;
    finallies = fs;
    try { return f(); } finally { handler = savedH; finallies = savedF; }
  }
  // After a call: an exception that came back goes to the handler.
  function check(cont) {
    const t = gensym('thrown');
    return Seq(Assign(t, GlobalValue('exc_flag')), IfGoto(Prim('!==', [Var(t), Int(0)]), label(handler), label(cont)));
  }
  const mayThrow = (e) => e.kind === 'Call' || (e.kind === 'Prim' && THROWS.has(e.op));
  // The finalizers from the innermost out to `depth`, then `tail`.
  function leaving(depth, tail) {
    for (let k = depth; k < finallies.length; k++) {
      const f = finallies[k];
      tail = within(f.outer, finallies.slice(0, k), () => explicateStmt(f.fin, tail));
    }
    return tail;
  }

  function explicateStmts(stmts, cont) {
    for (let k = stmts.length - 1; k >= 0; k--) cont = explicateStmt(stmts[k], cont);
    return cont;
  }

  function explicateStmt(s, cont) {
    switch (s.kind) {
      case 'Print':
      case 'Store':
      case 'Collect':
      case 'Trap':
        return Seq(s, cont);
      case 'Const':
      case 'Let':
        return explicateAssign(s.init, s.name, cont);
      case 'Assign':
        return explicateAssign(s.exp, s.name, cont);
      case 'Return': {
        const e = s.arg;
        // chapter 14: inside a try, a call's exception must come back here, and finalizers
        // run before the return
        const inside = finallies.length > 0 || handler.label !== exitLabel;
        if (e.kind === 'Call' && !inside) return TailCall(e.fn, e.args);
        if (['Int', 'Bool', 'Var'].includes(e.kind) && finallies.length === 0) return Return(e);
        const t = gensym('result');
        return explicateAssign(e, t, leaving(0, Return(Var(t))));
      }
      case 'Throw':   // chapter 14
        return Seq(SetGlobal('exc_value', s.arg), Seq(SetGlobal('exc_flag', Int(1)), handler));
      case 'Try': {
        const outer = handler, fs = finallies;
        let after = createBlock(cont), excExit = outer, inner = fs;
        if (s.finalizer) {
          // the normal way out: the finalizer, then what follows the try
          after = createBlock(within(outer, fs, () => explicateStmt(s.finalizer, after)));
          // after an exception: keep the value, run the finalizer, throw it again
          const kept = gensym('pending');
          excExit = createBlock(Seq(Assign(kept, GlobalValue('exc_value')), Seq(SetGlobal('exc_flag', Int(0)),
            within(outer, fs, () => explicateStmt(s.finalizer,
              Seq(SetGlobal('exc_value', Var(kept)), Seq(SetGlobal('exc_flag', Int(1)), outer)))))));
          inner = [...fs, { fin: s.finalizer, outer }];
        }
        let bodyHandler = excExit;
        if (s.handler) {
          const h = within(excExit, inner, () => explicateStmt(s.handler, after));
          bodyHandler = createBlock(Seq(SetGlobal('exc_flag', Int(0)), h));
        }
        return within(bodyHandler, inner, () => explicateStmt(s.body, after));
      }
      case 'While': {
        // chapter 10: break goes to what follows the loop, continue to the update (or the
        // test), so both need blocks of their own before the body is explicated
        const loop = gensym('loop');
        const exit = createBlock(cont);
        const target = { brk: exit, cont: null, depth: finallies.length };
        targets.set(s.label, target);   // before the update: do-while's update can break
        const next = s.update ? createBlock(explicateStmt(s.update, Goto(loop))) : Goto(loop);
        target.cont = next;
        const body = explicateStmt(s.body, next);
        blocks.set(loop, explicatePred(s.cond, body, exit));
        return Goto(loop);
      }
      case 'Break':      // (chapter 14: through the finalizers between here and the loop)
        return leaving(targets.get(s.label).depth, targets.get(s.label).brk);
      case 'Continue':
        return leaving(targets.get(s.label).depth, targets.get(s.label).cont);
      case 'Block':
        return explicateStmts(s.body, cont);
      case 'IfStmt': {
        const join = createBlock(cont);
        return explicatePred(s.cond, explicateStmt(s.thn, join), explicateStmt(s.els, join));
      }
      default:
        throw new Error(`explicate_control: unexpected ${s.kind}`);
    }
  }

  function explicateAssign(e, x, cont) {
    switch (e.kind) {
      case 'If': {
        const join = createBlock(cont);
        return explicatePred(e.cond, explicateAssign(e.thn, x, join), explicateAssign(e.els, x, join));
      }
      case 'Begin':
        return explicateStmts(e.stmts, explicateAssign(e.exp, x, cont));
      case 'Caught':   // chapter 14
        return Seq(Assign(x, GlobalValue('exc_value')), cont);
      default:
        return Seq(Assign(x, e), mayThrow(e) ? check(cont) : cont);
    }
  }

  // The condition decides which tail runs. Each kind of condition gets the cheapest code
  // that decides it: a constant needs no test at all, `!` swaps the branches, a comparison
  // becomes one branch instruction, and a ?: in a condition becomes two tests that jump
  // straight to the right place without materialising a boolean.
  function explicatePred(c, thn, els) {
    switch (c.kind) {
      case 'Bool':
        return c.value ? thn : els;
      case 'Var':
        return IfGoto(Prim('===', [c, Bool(true)]), label(thn), label(els));
      case 'Prim':
        if (c.op === '!') return explicatePred(c.args[0], els, thn);
        if (CMP.includes(c.op) || NUM_CMP.includes(c.op)) return IfGoto(c, label(thn), label(els));
        // chapter 9: a boolean the runtime computes (truthy, any<, typeof=...): as below
        return explicatePred({ kind: 'Computed', exp: c }, thn, els);
      case 'Computed':
        c = c.exp;
        break;
      case 'If': {
        const t = createBlock(thn), f = createBlock(els);
        return explicatePred(c.cond, explicatePred(c.thn, t, f), explicatePred(c.els, t, f));
      }
      case 'Begin':
        return explicateStmts(c.stmts, explicatePred(c.exp, thn, els));
      default:
        break;
    }
    // any other boolean expression (chapter 6: an element of a Bool[]): compute its value,
    // then test it
    const t = gensym('cond');
    return explicateAssign(c, t, IfGoto(Prim('===', [Var(t), Bool(true)]), label(thn), label(els)));
  }

  const label = (tail) => createBlock(tail).label;

  const exitLabel = handler.label;
  blocks.set('start', explicateStmts(body, finish));

  // Blocks no jump reaches (the branch a constant condition rules out) are dropped. The
  // others are listed in the order a depth-first walk from start meets them.
  const order = [];
  const seen = new Set();
  const visit = (l) => {
    if (seen.has(l)) return;
    seen.add(l);
    order.push(l);
    let t = blocks.get(l);
    while (t.kind === 'Seq') t = t.tail;
    if (t.kind === 'Goto') visit(t.label);
    if (t.kind === 'IfGoto') { visit(t.thn); visit(t.els); }
  };
  visit('start');

  return order.map((l) => {
    const stmts = [];
    let t = blocks.get(l);
    for (; t.kind === 'Seq'; t = t.tail) stmts.push(t.stmt);
    return CBlock(l, stmts, t);
  });
}

// The end of a function's body is unreachable (type_check made sure every path returns);
// main's end returns 0.
export function explicateControl(p) {
  return CProgramDefs(p.defs.map((d) => {
    const def = CDef(d.name, d.params.map((q) => q.name), explicateBody(d.body, Return(Int(0)), d.name === 'main'));
    def.paramTypes = d.params.map((q) => q.type);
    def.type = d.retType;
    return def;
  }));
}

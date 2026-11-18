// convert_to_closures: lift every function to the top level, and make function values
// closures.
//
// A closure is an object on the heap: the address of the function's code, then the values
// of its free variables (a free variable that convert_assignments boxed is captured as its
// box, so every closure shares it):
//
//   field 0: code    field 1: first free variable    field 2: second ...
//
// Every lifted function takes its closure as an extra first parameter, env, and reads its
// free variables from it. A function's free variables are numbered in sorted order:
//
//   const k = 10;                           function lambda.5(env.9, x.3) {
//   const f = (x) => x + k;          =>       return x.3 + env.9[1];
//                                           }
//                                           ... const f.2 = closure(lambda.5, k.1) ...
//
// Calls come in three kinds:
//   - a call of a closed top-level function (free.js) is a direct call that passes 0 for
//     env, since the function never reads it;
//   - a call of any other function declaration is still a known call: its code is known, so
//     it is called directly, with its closure as env;
//   - any other call loads the code address from field 0 of the closure and calls that.
// A closed top-level function used as a value is its one static closure, which slas makes,
// so that f === f holds however often f is mentioned.

import { FunDef, Const, Block, IfStmt, While, Return, Print, ExprStmt, Prim, If, Var, Int, Index, SetIndex,
  Call, FunRef, Closure, EnvRef, StaticClosure, Begin, ProgramDefs } from './ast.js';
import { functionType, functionParts } from './types.js';
import { analyze } from './free.js';
import { gensym } from './utils.js';

export function convertToClosures(p) {
  const main = p.defs[0];
  const A = analyze(main);
  const lifted = [];
  const typeOf = (x) => A.typeOf.get(x);
  const fnTypeOf = (node) => node.type ?? functionType(node.params.map((q) => q.type), node.retType);

  // The function declaration a callee certainly is: a declaration's own name, or its box.
  function knownFunDef(fn) {
    if (fn.kind === 'Var' && A.isFunDef(fn.name)) return fn.name;
    if (fn.kind === 'Index' && fn.unchecked && fn.arr.kind === 'Var' && A.isFunDef(fn.arr.name)) return fn.arr.name;
    return null;
  }

  // CJI-3: a closure holds at most 29 free variables (its object's header describes 30 fields).
  // One with more keeps 28 and, in field 29, a closure of the next ones, made the same way (it is
  // never called: only its fields are read). A free variable's place is its level and field.
  const PER = 28;
  const place = (fvs, k) => (fvs.length <= 29 ? [0, k + 1] : [Math.floor(k / PER), (k % PER) + 1]);

  function lift(node, name) {
    const env = gensym('env');
    const fvs = A.free(name);
    const fields = new Map(fvs.map((x, k) => [x, place(fvs, k)]));
    const ctx = { name, env, fields, closureType: fnTypeOf(node) };
    const params = [{ name: env, type: fnTypeOf(node) }, ...node.params];
    lifted.push(FunDef(name, params, node.retType, node.body.map((s) => stmt(s, ctx)).filter(Boolean)));
  }

  // The value of a function: its static closure, or a new closure of its free variables.
  function closureOf(node, name, ctx) {
    lift(node, name);
    if (A.closed(name)) return StaticClosure(name);   // a closed top-level declaration
    const fvs = A.free(name), closureType = fnTypeOf(node);
    if (fvs.length <= 29) return { ...Closure(name, fvs.map((x) => exp(Var(x), ctx)), fvs.map(typeOf)), closureType };
    const level = (from) => {   // (the closure of fvs[from..], 28 of them and the next level's)
      const chunk = fvs.slice(from, from + PER), vals = chunk.map((x) => exp(Var(x), ctx)), types = chunk.map(typeOf);
      if (from + PER < fvs.length) { vals.push(level(from + PER)); types.push(closureType); }
      return { ...Closure(name, vals, types), closureType };
    };
    return level(0);
  }

  // a free variable's read: through field 29 of each level above its own (CJI-3)
  function envRef(ctx, x) {
    const [lvl, k] = ctx.fields.get(x);
    let c = Var(ctx.env);
    for (let l = 0; l < lvl; l++) c = EnvRef(c, 29, ctx.closureType);
    return EnvRef(c, k, typeOf(x));
  }

  function exp(e, ctx) {
    switch (e.kind) {
      case 'Var': {
        const x = e.name;
        if (ctx.fields.has(x)) return envRef(ctx, x);   // (its own box: free.js)
        if (x === ctx.name) return A.closed(x) ? StaticClosure(x) : Var(ctx.env);   // itself
        if (A.isFunDef(x) && A.closed(x)) return StaticClosure(x);
        if (ctx.fields.has(x)) return envRef(ctx, x);
        return e;
      }
      case 'Lambda':
        return closureOf(e, e.name, ctx);
      case 'Call': {
        const args = e.args.map((a) => exp(a, ctx));
        const g = knownFunDef(e.fn);
        if (g && A.closed(g)) return { ...Call(FunRef(g, args.length + 1), [Int(0), ...args]), type: e.type };
        if (g) return { ...Call(FunRef(g, args.length + 1), [exp(e.fn, ctx), ...args]), type: e.type };
        const f = exp(e.fn, ctx);
        const unknown = (c) => ({ ...Call(EnvRef(c, 0, 'Code'), [c, ...args]), type: e.type });
        if (f.kind === 'Var') return unknown(f);                // already a variable: no copy
        const t = gensym('clos');
        return Begin([Const(t, f, e.fnType)], unknown(Var(t)));
      }
      case 'Set': return { ...e, exp: exp(e.exp, ctx) };
      case 'Prim': return Prim(e.op, e.args.map((a) => exp(a, ctx)));
      case 'If': return If(exp(e.cond, ctx), exp(e.thn, ctx), exp(e.els, ctx));
      case 'ArrayLit': return { ...e, elems: e.elems.map((a) => exp(a, ctx)) };
      case 'Index':
        // CJI-3: a boxed function's read of its own box, in its own body, when the box is not among
        // its free variables (no function nested in it uses its name): the box holds this very
        // closure, its env (the read would take the env's first word, its code, for the closure)
        if (e.unchecked && e.arr.kind === 'Var' && e.arr.name === ctx.name && A.boxed.has(ctx.name) && !ctx.fields.has(ctx.name)
          && e.idx.kind === 'Int' && e.idx.value === 0 && !A.closed(ctx.name)) return Var(ctx.env);
        return { ...e, arr: exp(e.arr, ctx), idx: exp(e.idx, ctx) };
      case 'SetIndex': return { ...e, arr: exp(e.arr, ctx), idx: exp(e.idx, ctx), exp: exp(e.exp, ctx) };
      case 'Begin': return { ...e, stmts: e.stmts.map((s) => stmt(s, ctx)), exp: exp(e.exp, ctx) };
      default: return e;
    }
  }

  function stmt(s, ctx) {
    switch (s.kind) {
      case 'FunDef': {
        const value = closureOf(s, s.name, ctx);
        if (A.closed(s.name)) return null;               // lifted; nothing to create
        if (s.boxed) return ExprStmt({ ...SetIndex(exp(Var(s.name), ctx), Int(0), value), unchecked: true });
        return Const(s.name, value, fnTypeOf(s));
      }
      case 'Const': case 'Let': return { ...s, init: exp(s.init, ctx) };
      case 'Print': return { ...s, arg: exp(s.arg, ctx) };
      case 'ExprStmt': return ExprStmt(exp(s.exp, ctx));
      case 'Return': return Return(exp(s.arg, ctx));
      case 'Block': return Block(s.body.map((t) => stmt(t, ctx)).filter(Boolean));
      case 'IfStmt': return IfStmt(exp(s.cond, ctx), stmt(s.thn, ctx), stmt(s.els, ctx));
      case 'While': return { ...s, cond: exp(s.cond, ctx), body: stmt(s.body, ctx), update: s.update && stmt(s.update, ctx) };
      case 'Throw': return { ...s, arg: exp(s.arg, ctx) };   // chapter 14
      case 'Try': return { ...s, body: stmt(s.body, ctx), handler: s.handler && stmt(s.handler, ctx), finalizer: s.finalizer && stmt(s.finalizer, ctx) };
      case 'Break': case 'Continue': return s;
      default: throw new Error(`convert_to_closures: unexpected ${s.kind}`);
    }
  }

  const mainBody = main.body.map((s) => stmt(s, { name: 'main', env: null, fields: new Map() })).filter(Boolean);
  return ProgramDefs([...lifted, FunDef('main', [], 'Int', mainBody)]);
}

export { functionParts };

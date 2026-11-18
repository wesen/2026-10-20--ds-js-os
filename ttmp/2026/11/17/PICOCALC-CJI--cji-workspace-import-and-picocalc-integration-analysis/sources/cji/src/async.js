// lower_async (chapter 16): async functions, await and promises, in terms of closures.
//
// Promises are a library written in the subset (PROMISE_SOURCE below): a promise is a
// record { $promise, state, value, reactions }, and the job queue is an array that
// $runJobs empties at the end of the program, as JavaScript's microtask queue is emptied
// after a script. The order of jobs follows the specification (ECMAScript 27.2): each
// reaction is one job, an await is one reaction, a resolution with a promise is one more
// job (NewPromiseResolveThenableJob), so the interleavings Node prints are reproduced.
//
// An async function becomes a state machine: a closure $step that the promises call back
// with each awaited value. Its body is cut at every await into numbered cases, run by a
// dispatch loop; the function's variables move out of the closure, into the function
// that makes it, so they keep their values between the cases (closure conversion boxes
// them, chapter 8). For example
//
//   async function f(x) { const y = await g(x); return x + y; }
//
// becomes, roughly,
//
//   function f(x) {
//     let y;
//     const p = $newPromise();
//     let state = 0;
//     const step = (v, err) => {
//       dispatch: while (true) {
//         try {
//           if (state === 0) { state = 1; $await(g(x), step); return; }
//           if (state === 1) { if (err) throw v; y = v; $resolve(p, x + y); return; }
//         } catch (e) { $reject(p, e); return; }
//       }
//     };
//     step(undefined, false);
//     return p;
//   }
//
// A loop or an if with an await inside becomes cases that jump to each other (state = k;
// continue dispatch). A try with an await inside becomes cases of a region: an exception
// in any of them goes to the region's catch case; a finally becomes a case that the ways
// out of its try reach with a completion (normal, throw, return or jump) in variables of
// its own, as Regenerator does.
//
// Statements without an await stay as they are, apart from their returns and the breaks
// and continues that leave an exploded loop.

import { parse } from './parse.js';
import { uniquify } from './uniquify.js';
import { gensym } from './utils.js';
import { CompileError } from './utils.js';
import { Int, Bool, Var, Prim, Call, Let, Const, Set as SetExp, ExprStmt, While, IfStmt, Block, Return, Break,
  Continue, Throw, Try, AnyLit, Lambda } from './ast.js';

export const PROMISE_SOURCE = `
let $jobs /*: Any[] */ = [];
let $head = 0;
function $enqueue(job /*: Any */) { const n = $jobs.length; $jobs.length = n + 1; $jobs[n] = job; }
function $runJobs() {
  while ($head < $jobs.length) { const job /*: Any */ = $jobs[$head]; $jobs[$head] = undefined; $head = $head + 1; job(); }
  $jobs.length = 0;
  $head = 0;
}
function $isPromise(x /*: Any */) /*: Bool */ { return typeof x === 'object' && x !== null && x.$promise === true; }
function $newPromise() /*: Any */ {
  const p /*: Any */ = { $promise: true, state: 0, value: undefined, reactions: [], locked: false };
  return p;
}
function $call1(f /*: Any */, x /*: Any */) /*: Any */ { return $arity(f) === 0 ? f() : f(x); }
function $settle(p /*: Any */, state /*: Int */, v /*: Any */) {
  const rs /*: Any */ = p.reactions;
  p.state = state; p.value = v; p.reactions = undefined;
  for (let i = 0; i < rs.length; i++) { const r /*: Any */ = rs[i]; $enqueue(() => $reactionJob(r, state, v)); }
}
function $reactionJob(r /*: Any */, state /*: Int */, v /*: Any */) {
  const h /*: Any */ = state === 1 ? r.onF : r.onR;
  if (typeof h !== 'function') {
    if (r.cap !== undefined) { if (state === 1) $resolve(r.cap, v); else $reject(r.cap, v); }
    return;
  }
  let result /*: Any */ = undefined;
  try { result = $call1(h, v); } catch (e) { if (r.cap !== undefined) $reject(r.cap, e); return; }
  if (r.cap !== undefined) $resolve(r.cap, result);
}
function $then(p /*: Any */, onF /*: Any */, onR /*: Any */, cap /*: Any */) {
  const r /*: Any */ = { onF: onF, onR: onR, cap: cap };
  if (p.state === 0) { const rs /*: Any */ = p.reactions; const n = rs.length; rs.length = n + 1; rs[n] = r; }
  else { const st = p.state; const v /*: Any */ = p.value; $enqueue(() => $reactionJob(r, st, v)); }
}
function $resolve(p /*: Any */, x /*: Any */) {
  if (p.state !== 0 || p.locked) return;
  if (x === p) { $settle(p, 2, new TypeError('Chaining cycle detected for promise')); return; }
  if ($isPromise(x)) {
    p.locked = true;
    $enqueue(() => $then(x, (v /*: Any */) => { p.locked = false; $resolve(p, v); }, (e /*: Any */) => { p.locked = false; $reject(p, e); }, undefined));
    return;
  }
  $settle(p, 1, x);
}
function $reject(p /*: Any */, e /*: Any */) { if (p.state !== 0 || p.locked) return; $settle(p, 2, e); }
function $promiseResolve(x /*: Any */) /*: Any */ { if ($isPromise(x)) return x; const p /*: Any */ = $newPromise(); $resolve(p, x); return p; }
function $promiseReject(e /*: Any */) /*: Any */ { const p /*: Any */ = $newPromise(); $reject(p, e); return p; }
function $await(x /*: Any */, step /*: Any */) {
  $then($promiseResolve(x), (v /*: Any */) => step(v, false), (e /*: Any */) => step(e, true), undefined);
}
function $thenMethod(p /*: Any */, onF /*: Any */, onR /*: Any */) /*: Any */ {
  const q /*: Any */ = $newPromise(); $then(p, onF, onR, q); return q;
}
function $finallyMethod(p /*: Any */, f /*: Any */) /*: Any */ {
  if (typeof f !== 'function') return $thenMethod(p, f, f);
  return $thenMethod(p,
    (v /*: Any */) => $thenMethod($promiseResolve(f()), () => v, undefined),
    (e /*: Any */) => $thenMethod($promiseResolve(f()), () => { throw e; }, undefined));
}
function $newPromiseWith(executor /*: Any */) /*: Any */ {
  const p /*: Any */ = $newPromise();
  const res /*: Any */ = (v /*: Any */) => $resolve(p, v);
  const rej /*: Any */ = (e /*: Any */) => $reject(p, e);
  try { if ($arity(executor) === 1) executor(res); else executor(res, rej); } catch (e) { $reject(p, e); }
  return p;
}
function $all(xs /*: Any */) /*: Any */ {
  const p /*: Any */ = $newPromise();
  const values /*: Any[] */ = [];
  values.length = xs.length;
  let remaining = 1;
  for (let i = 0; i < xs.length; i++) {
    const k = i;
    remaining = remaining + 1;
    $thenMethod($promiseResolve(xs[i]), (v /*: Any */) => { values[k] = v; remaining = remaining - 1; if (remaining === 0) $resolve(p, values); },
      (e /*: Any */) => $reject(p, e));
  }
  remaining = remaining - 1;
  if (remaining === 0) $resolve(p, values);
  return p;
}
`;

// ---- what needs the library -----------------------------------------------------------

// (no prototype: PROMISE_METHODS.toString must not be a method)
const PROMISE_METHODS = Object.assign(Object.create(null), { then: '$thenMethod', catch: '$thenMethod', finally: '$finallyMethod' });
const PROMISE_CALLS = Object.assign(Object.create(null), { 'Promise.resolve': '$promiseResolve', 'Promise.reject': '$promiseReject', 'Promise.all': '$all', Promise: '$newPromiseWith',
  'Promise.$drain': '$runJobs' });   // ($drain: the world runtime's, chapter 16)

const anyNode = (x, f) => x !== null && typeof x === 'object'
  && (Array.isArray(x) ? x.some((y) => anyNode(y, f)) : f(x) || Object.values(x).some((y) => anyNode(y, f)));
export const usesAsync = (p) => anyNode(p.body ?? p, (x) => x.async === true || x.kind === 'Await'
  || (x.kind === 'MethodCall' && PROMISE_METHODS[x.name] && x.args.length <= 2) || (x.kind === 'LibCall' && PROMISE_CALLS[x.name]));
// does this node contain an await of its own (not one inside a nested function)?
const hasAwait = (x) => x !== null && typeof x === 'object'
  && (Array.isArray(x) ? x.some(hasAwait) : x.kind === 'Await' || (x.kind !== 'Lambda' && x.kind !== 'FunDef' && Object.values(x).some(hasAwait)));

// ---- the pass -------------------------------------------------------------------------

// CJI-3 step 1: the library functions a lowered program calls. A unit compiled on its own (the world
// runtime, a program marked unit 'prelude') exports them, in this order, as its record 1; a world
// compiled against it (unit 'world') imports them instead of compiling its own library, so that the
// job queue ($jobs) is one.
const UNIT_EXPORTS = ['$thenMethod', '$finallyMethod', '$promiseResolve', '$promiseReject', '$all', '$newPromiseWith',
  '$runJobs', '$resolve', '$await', '$reject', '$newPromise'];

export function lowerAsync(p) {
  const unit = p.unit ?? null;
  if (!usesAsync(p)) return p;
  if (unit === 'world') return lowerAsyncImporting(p);
  // the library, renamed once; L.name is the unique name of the library's name. $arity, the
  // number of parameters of a function value, is an operator.
  const fix = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(fix);
    if (x.kind === 'Call' && x.fn.kind === 'Var' && x.fn.name === '$arity') return Prim('fn_arity', x.args.map(fix));
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = fix(v);
    return out;
  };
  const lib = uniquify(fix(parse(PROMISE_SOURCE)));
  const L = {};
  for (const s of lib.body) L[s.name.replace(/\.\d+$/, '')] = s.name;
  const call = (name, args) => Call(Var(L[name]), args);

  // then/catch/finally, Promise.*: calls of the library; async functions: state machines
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    if (x.kind === 'MethodCall' && PROMISE_METHODS[x.name] && x.args.length <= 2) {
      const [a, b] = x.args.map(walk), obj = walk(x.obj), u = AnyLit(undefined);
      if (x.name === 'then') return call('$thenMethod', [obj, a ?? u, b ?? u]);
      if (x.name === 'catch') return call('$thenMethod', [obj, u, a ?? u]);
      return call('$finallyMethod', [obj, a ?? u]);
    }
    if (x.kind === 'LibCall' && PROMISE_CALLS[x.name]) return call(PROMISE_CALLS[x.name], x.args.map(walk));
    if ((x.kind === 'FunDef' || x.kind === 'Lambda') && x.async) {
      const inner = { ...x, body: walk(x.body) };
      return machine(inner, call);
    }
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = walk(v);
    return out;
  };
  const body = walk(p.body);
  // (CJI-3: the world runtime compiled alone hands these to the worlds compiled against it)
  const exported = unit === 'prelude'
    ? uniquify(parse(`const $asyncExports /*: Any[] */ = []; $asyncExports.length = ${UNIT_EXPORTS.length};\n`
      + UNIT_EXPORTS.map((n, k) => `$asyncExports[${k}] = ${n};`).join('\n') + '\n$nat_export(1, $asyncExports);'), new Map(Object.values(L).concat(natNames(p)).map((n) => [n.replace(/\.\d+$/, ''), n]))).body
    : [];
  return { ...p, body: [...lib.body, ...exported, ...body, ExprStmt(call('$runJobs', []))] };
}
const natNames = (p) => p.body.filter((d) => d.kind === 'FunDef' && d.name.startsWith('$nat_')).map((d) => d.name);

// A world compiled against the world runtime's unit: the library's functions are its record 1.
function lowerAsyncImporting(p) {
  const nat = natNames(p).find((n) => n.startsWith('$nat_import'));
  if (!nat) throw new Error('lower_async: a world unit without $nat_import');
  const decls = uniquify(parse(UNIT_EXPORTS.map((n, k) => `const ${n} /*: Any */ = $nat_import(1, ${k});`).join('\n')),
    new Map([['$nat_import', nat]])).body;
  const L = {};
  for (const d of decls) L[d.name.replace(/\.\d+$/, '')] = d.name;
  const call = (name, args) => Call(Var(L[name]), args);
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    if (x.kind === 'MethodCall' && PROMISE_METHODS[x.name] && x.args.length <= 2) {
      const [a, b] = x.args.map(walk), obj = walk(x.obj), u = AnyLit(undefined);
      if (x.name === 'then') return call('$thenMethod', [obj, a ?? u, b ?? u]);
      if (x.name === 'catch') return call('$thenMethod', [obj, u, a ?? u]);
      return call('$finallyMethod', [obj, a ?? u]);
    }
    if (x.kind === 'LibCall' && PROMISE_CALLS[x.name]) return call(PROMISE_CALLS[x.name], x.args.map(walk));
    if ((x.kind === 'FunDef' || x.kind === 'Lambda') && x.async) return machine({ ...x, body: walk(x.body) }, call);
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = walk(v);
    return out;
  };
  return { ...p, body: [...decls, ...walk(p.body), ExprStmt(call('$runJobs', []))] };
}

// ---- one async function as a state machine --------------------------------------------

function machine(fn, call) {
  const P = gensym('promise'), STATE = gensym('state'), STEP = gensym('step'), V = gensym('v'), ERR = gensym('err');
  const EXC = gensym('exc'), DISPATCH = gensym('dispatch'), E = gensym('e');
  const hoisted = [];             // variables moved out of the closure
  const funDefs = [];             // function declarations, likewise
  const cases = [];               // { id, body, region }
  const regions = [];             // { id, parent, handler: stmts for an exception }
  let cur = null;
  const newCase = (region) => { const c = { id: cases.length, body: [], region }; cases.push(c); return c; };
  const emit = (...ss) => cur.body.push(...ss);
  const goto = (c) => [ExprStmt(SetExp(STATE, Int(c.id))), Continue(DISPATCH)];
  const temp = (base) => { const t = gensym(base); hoisted.push(t); return t; };

  // ctx: { region, loops: Map label -> { brk, cont, fin }, fin: the innermost exploded finally or null }
  function returnFrom(e, ctx) {
    if (ctx.fin) return [ExprStmt(SetExp(ctx.fin.how, Int(2))), ExprStmt(SetExp(ctx.fin.val, e)), ...goto(ctx.fin.entry)];
    return [ExprStmt(call('$resolve', [Var(P), e])), Return(AnyLit(undefined))];
  }
  function jumpTo(label, isBreak, ctx) {
    const t = ctx.loops.get(label);
    const target = isBreak ? t.brk : t.cont;
    if (t.fin === ctx.fin) return goto(target);
    if (ctx.fin && ctx.fin.outer === t.fin) {   // through one finally
      return [ExprStmt(SetExp(ctx.fin.how, Int(3))), ExprStmt(SetExp(ctx.fin.val, Int(target.id))), ...goto(ctx.fin.entry)];
    }
    throw new CompileError('a break or continue that leaves two try statements with finally and await is outside the subset');
  }

  // A statement without an await: its returns, and breaks and continues to exploded loops,
  // are rewritten; its declarations at this level move out (hoist = true).
  function rewrite(s, ctx, hoist) {
    const exp = (e) => e;   // expressions without an await are kept
    const st = (x, h) => rewrite(x, ctx, h);
    switch (s.kind) {
      case 'Return': return Block(returnFrom(s.arg, ctx));
      case 'Break': case 'Continue':
        if (ctx.loops.has(s.label)) return Block(jumpTo(s.label, s.kind === 'Break', ctx));
        return s;
      case 'Const': case 'Let':
        if (!hoist) return s;
        hoisted.push(s.name);
        return ExprStmt(SetExp(s.name, exp(s.init)));
      case 'FunDef':
        if (hoist) { funDefs.push(s); return Block([]); }
        return s;
      case 'Block': return Block(s.body.map((x) => st(x, false)));
      case 'IfStmt': return IfStmt(s.cond, st(s.thn, false), s.els && st(s.els, false));
      case 'While': return { ...s, body: st(s.body, false), update: s.update && st(s.update, false) };
      case 'Try': return { ...s, body: st(s.body, false), handler: s.handler && st(s.handler, false), finalizer: s.finalizer && st(s.finalizer, false) };
      default: return s;
    }
  }

  // An expression whose awaits become case boundaries: returns the expression that remains,
  // after emitting what comes before it. Operands computed before an await are kept in
  // temporaries, so they are computed before it, as JavaScript computes them.
  function lin(e, ctx) {
    if (!hasAwait(e)) return e;
    switch (e.kind) {
      case 'Await': {
        const a = lin(e.arg, ctx);
        const next = newCase(ctx.region);
        emit(ExprStmt(SetExp(STATE, Int(next.id))), ExprStmt(call('$await', [a, Var(STEP)])), Return(AnyLit(undefined)));
        cur = next;
        const t = temp('awaited');
        emit(IfStmt(Var(ERR), Throw(Var(V)), null), ExprStmt(SetExp(t, Var(V))));
        return Var(t);
      }
      case 'Prim':
        if (['&&', '||', '??'].includes(e.op) && hasAwait(e.args.slice(1))) {
          // chapter 22: a && await b as t = a; if (t) t = await b; (|| and ?? alike), so that
          // b, and its await, happen only when JavaScript evaluates them
          const t = temp(e.op === '&&' ? 'and' : e.op === '||' ? 'or' : 'nn');
          emit(ExprStmt(SetExp(t, lin(e.args[0], ctx))));
          const test = e.op === '&&' ? Var(t) : e.op === '||' ? Prim('!', [Var(t)]) : Prim('==', [Var(t), AnyLit(null)]);
          explode(IfStmt(test, ExprStmt(SetExp(t, e.args[1])), null), ctx, false);
          return Var(t);
        }
        return { ...e, args: ordered(e.args, ctx) };
      case 'Call': {
        const [fn, ...args] = ordered([e.fn, ...e.args], ctx);
        return { ...e, fn, args };
      }
      case 'MethodCall': {
        const [obj, ...args] = ordered([e.obj, ...e.args], ctx);
        return { ...e, obj, args };
      }
      case 'LibCall': return { ...e, args: ordered(e.args, ctx) };
      case 'Set': return { ...e, exp: lin(e.exp, ctx) };
      case 'Get': return { ...e, obj: lin(e.obj, ctx) };
      case 'SetProp': { const [obj, v] = ordered([e.obj, e.exp], ctx); return { ...e, obj, exp: v }; }
      case 'Index': { const [arr, idx] = ordered([e.arr, e.idx], ctx); return { ...e, arr, idx }; }
      case 'SetIndex': { const [arr, idx, v] = ordered([e.arr, e.idx, e.exp], ctx); return { ...e, arr, idx, exp: v }; }
      case 'ArrayLit': return { ...e, elems: ordered(e.elems, ctx) };
      case 'Record': {
        const vs = ordered(e.fields.map((f) => f.exp), ctx);
        return { ...e, fields: e.fields.map((f, k) => ({ ...f, exp: vs[k] })) };
      }
      case 'If':
        if (hasAwait([e.thn, e.els])) throw new CompileError('await inside a branch of ?: is outside the subset');
        return { ...e, cond: lin(e.cond, ctx) };
      default:
        throw new CompileError(`await inside ${e.kind} is outside the subset`);
    }
  }
  function ordered(xs, ctx) {
    const last = xs.map(hasAwait).lastIndexOf(true);
    return xs.map((x, k) => {
      const y = lin(x, ctx);
      if (k >= last || y.kind === 'Int' || y.kind === 'Num' || y.kind === 'Str' || y.kind === 'Bool' || y.kind === 'AnyLit'
        || y.kind === 'Lambda') return y;
      const t = temp('before');
      emit(ExprStmt(SetExp(t, y)));
      return Var(t);
    });
  }

  function explode(s, ctx, hoist = true) {
    if (!hasAwait(s)) { emit(rewrite(s, ctx, hoist)); return; }
    switch (s.kind) {
      case 'Block': for (const x of s.body) explode(x, ctx, true); return;
      case 'ExprStmt': emit(ExprStmt(lin(s.exp, ctx))); return;
      case 'Print': emit({ ...s, arg: lin(s.arg, ctx) }); return;
      case 'Const': case 'Let': hoisted.push(s.name); emit(ExprStmt(SetExp(s.name, lin(s.init, ctx)))); return;
      case 'Return': emit(...returnFrom(lin(s.arg, ctx), ctx)); return;
      case 'Throw': emit(Throw(lin(s.arg, ctx))); return;
      case 'IfStmt': {
        const c = lin(s.cond, ctx);
        const T = newCase(ctx.region), F = newCase(ctx.region), J = newCase(ctx.region);
        emit(IfStmt(c, Block(goto(T)), Block(goto(F))));
        cur = T; explode(s.thn, ctx); emit(...goto(J));
        cur = F; if (s.els) explode(s.els, ctx); emit(...goto(J));
        cur = J;
        return;
      }
      case 'While': {
        const H = newCase(ctx.region), U = s.update ? newCase(ctx.region) : H, X = newCase(ctx.region);
        emit(...goto(H));
        cur = H;
        const c = lin(s.cond, ctx);
        if (!(c.kind === 'Bool' && c.value)) emit(IfStmt(Prim('!', [c]), Block(goto(X)), null));
        const loops = new Map(ctx.loops).set(s.label, { brk: X, cont: U, fin: ctx.fin });
        explode(s.body, { ...ctx, loops });
        emit(...goto(U));
        if (s.update) { cur = U; explode(s.update, { ...ctx, loops }); emit(...goto(H)); }
        cur = X;
        return;
      }
      case 'Try': {
        const parent = ctx.region;
        const after = newCase(parent);
        let fin = null;
        if (s.finalizer) fin = { how: temp('how'), val: temp('pending'), entry: null, outer: ctx.fin };
        const finCase = s.finalizer ? newCase(parent) : null;
        if (fin) fin.entry = finCase;
        // the catch's region: an exception in the catch goes to the finally, if any
        const catchRegion = fin ? region(parent, [ExprStmt(SetExp(fin.how, Int(1))), ExprStmt(SetExp(fin.val, Var(E))), ...goto(finCase)]) : parent;
        const catchCase = s.handler ? newCase(catchRegion) : null;
        const tryRegion = region(parent, s.handler
          ? [ExprStmt(SetExp(EXC, Var(E))), ...goto(catchCase)]
          : [ExprStmt(SetExp(fin.how, Int(1))), ExprStmt(SetExp(fin.val, Var(E))), ...goto(finCase)]);
        const tryCase = newCase(tryRegion);
        const leave = fin ? [ExprStmt(SetExp(fin.how, Int(0))), ...goto(finCase)] : goto(after);
        emit(...goto(tryCase));
        cur = tryCase;
        explode(s.body, { ...ctx, region: tryRegion, fin: fin ?? ctx.fin });
        emit(...leave);
        if (s.handler) {
          cur = catchCase;
          // the handler starts with let e = <caught>: here, the exception kept in EXC
          const [first, ...rest] = s.handler.body;
          const binding = first && first.kind === 'Let' && first.init.kind === 'Caught' ? [Let(first.name, Var(EXC))] : [first];
          explode(Block([...binding.filter(Boolean), ...rest]), { ...ctx, region: catchRegion, fin: fin ?? ctx.fin });
          emit(...leave);
        }
        if (fin) {
          cur = finCase;
          explode(s.finalizer, ctx);
          emit(IfStmt(Prim('===', [Var(fin.how), Int(1)]), Throw(Var(fin.val)), null));
          emit(IfStmt(Prim('===', [Var(fin.how), Int(2)]), Block(returnFrom(Var(fin.val), ctx)), null));
          emit(IfStmt(Prim('===', [Var(fin.how), Int(3)]), Block([ExprStmt(SetExp(STATE, Var(fin.val))), Continue(DISPATCH)]), null));
          emit(...goto(after));
        }
        cur = after;
        return;
      }
      default:
        throw new CompileError(`await inside ${s.kind} is outside the subset`);
    }
  }
  function region(parent, handler) {
    const r = { id: regions.length, parent, handler };
    regions.push(r);
    return r;
  }

  // the body
  cur = newCase(null);
  const body = fn.body;
  for (const s of body) explode(s, { region: null, loops: new Map(), fin: null }, true);
  emit(...returnFrom(AnyLit(undefined), { fin: null }));

  // dispatch: each case by its number; an exception goes to the innermost region's handler
  const isIn = (r) => cases.filter((c) => c.region === r).map((c) => Prim('===', [Var(STATE), Int(c.id)]));
  const or = (xs) => xs.reduce((a, b) => ({ kind: 'If', cond: a, thn: Bool(true), els: b }));
  const handlers = [];
  for (const r of regions) {
    // a case of a region nested in r is handled by the nested region first; its handler
    // jumps to cases of r's own, so membership is by innermost region only
    const xs = isIn(r);
    if (xs.length) handlers.push(IfStmt(or(xs), Block(r.handler), null));
  }
  const reject = [ExprStmt(call('$reject', [Var(P), Var(E)])), Return(AnyLit(undefined))];
  const loopBody = Block([
    Try(Block([...cases.map((c) => IfStmt(Prim('===', [Var(STATE), Int(c.id)]), Block(c.body), null)), Return(AnyLit(undefined))]),
      Block([Let(E, { kind: 'Caught' }), ...handlers, ...reject]), null),
  ]);
  const step = Lambda([{ name: V, type: 'Any' }, { name: ERR, type: 'Any' }], 'Any',
    [While(Bool(true), loopBody, null, DISPATCH)], gensym('lambda'));
  const outer = [
    ...hoisted.map((h) => Let(h, { kind: 'Hoisted' })),
    Let(EXC, AnyLit(undefined)),
    ...funDefs,
    Const(P, call('$newPromise', [])),
    Let(STATE, Int(0)),
    Const(STEP, step),
    ExprStmt(Call(Var(STEP), [AnyLit(undefined), Bool(false)])),
    Return(Var(P)),
  ];
  const { async, inferRet, ...rest } = fn;
  return { ...rest, retType: 'Any', body: outer };
}

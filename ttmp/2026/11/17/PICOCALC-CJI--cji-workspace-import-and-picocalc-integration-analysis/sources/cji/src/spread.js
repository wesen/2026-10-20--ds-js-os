// lower_rest (chapter 17): rest parameters, and spread arguments in calls of them.
//
// A function with a rest parameter, function f(a, ...xs), takes the rest as one array
// parameter. Every call of it through its name packs the arguments after the fixed ones
// into an array, here at compile time:
//
//   f(1, 2, 3)        =>  f(1, [2, 3])
//   f(1, ...ys, 4)    =>  f(1, [].concat(Array.from(ys), [4]))
//
// So such a function must be called through its name (a function declaration, or a const
// holding an arrow): one passed around as a value would be called by code that does not
// know to pack, and is outside the subset. The parser has turned the other spreads into
// calls already: [a, ...xs] into concat, a.push(...xs) into pushArray, Math.max(...xs)
// into reduce.

import { CompileError, gensym } from './utils.js';
import { ArrayLit, MethodCall, LibCall, Var, Const, Let, While, Prim, Index, Int, ExprStmt, Set as SetExp, SetProp, Return, Call, Lambda, AnyLit } from './ast.js';

// chapter 22: how many rest arguments a rest function used as a value takes
export const VALUE_REST = 8;

// The world runtime's methods that take their arguments as one array: ui.col(a, b) is
// ui.col([a, b]), as the prelude's (...kids) would see it.
const VARIADIC_METHODS = { ui: new Set(['col', 'row', 'box']), '*': new Set(['needs', 'provides']) };
const variadicCall = (x) => x.kind === 'MethodCall' && (VARIADIC_METHODS['*'].has(x.name)
  || (x.obj.kind === 'Var' && x.obj.name.replace(/\.\d+$/, '') === 'ui' && VARIADIC_METHODS.ui.has(x.name)));
export const usesRest = (p) => anyNode(p.body, (x) => (x.kind === 'Spread') || variadicCall(x) || ((x.kind === 'FunDef' || x.kind === 'Lambda') && x.params.some((q) => q.rest)));
const anyNode = (x, f) => x !== null && typeof x === 'object'
  && (Array.isArray(x) ? x.some((y) => anyNode(y, f)) : f(x) || Object.values(x).some((y) => anyNode(y, f)));

function packed(args) {
  const segs = [];
  for (const x of args) {
    if (x.kind === 'Spread') segs.push(LibCall('Array.from', [x.arg]));
    else if (segs.length && segs.at(-1).kind === 'ArrayLit') segs.at(-1).elems.push(x);
    else segs.push(ArrayLit([x]));
  }
  if (segs.length === 0) return ArrayLit([]);
  const [first, ...rest] = segs[0].kind === 'ArrayLit' ? segs : [ArrayLit([]), ...segs];
  return rest.length ? MethodCall(first, 'concat', rest) : first;
}

export function lowerRest(p) {
  if (p.restLowered || !usesRest(p)) return p;
  const fixed = new Map();   // name of a function with a rest parameter -> its number of fixed parameters
  (function find(x) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(find); return; }
    const restOf = (f) => (f.params.length && f.params.at(-1).rest ? f.params.length - 1 : -1);
    if (x.kind === 'FunDef' && restOf(x) >= 0) fixed.set(x.name, restOf(x));
    if (x.kind === 'Const' && x.init.kind === 'Lambda' && restOf(x.init) >= 0) fixed.set(x.name, restOf(x.init));
    Object.values(x).forEach(find);
  })(p.body);

  // Chapter 22: such a function used as a value (calc's table: mean: () => calcMean) is a
  // function of its fixed parameters and up to VALUE_REST more, which packs those it is
  // given. The subset's calls do not say how many arguments they pass, so the packed array
  // ends at the first undefined one: f(1, undefined, 3) through the value packs only [1].
  const asValue = (name) => {
    const k = fixed.get(name);
    const ps = Array.from({ length: k + VALUE_REST }, (_, j) => ({ name: gensym(j < k ? 'p' : 'r'), type: 'Any', inferred: true }));
    const v = gensym('rest'), n = gensym('n');
    const body = [
      Const(v, ArrayLit(ps.slice(k).map((q) => Var(q.name)))),
      Let(n, Int(0)),
      While(Prim('&&', [Prim('<', [Var(n), Int(VALUE_REST)]), Prim('!', [Prim('is_undefined', [Index(Var(v), Var(n))])])]),
        ExprStmt(SetExp(n, Prim('+', [Var(n), Int(1)])))),
      ExprStmt(SetProp(Var(v), 'length', Var(n))),
      Return(Call(Var(name), [...ps.slice(0, k).map((q) => Var(q.name)), Var(v)])),
    ];
    return Lambda(ps, null, body, gensym('lambda'));
  };
  // Chapter 23: an anonymous function with a rest parameter, (...xs) => xs.length, is only
  // ever a value; it takes VALUE_REST parameters in place of its rest one and packs them
  // itself, as asValue's wrapper does.
  const packing = (x) => {
    const k = x.params.length - 1, rest = x.params[k].name;
    const rs = Array.from({ length: VALUE_REST }, () => ({ name: gensym('r'), type: 'Any', inferred: true }));
    const n = gensym('n');
    const prologue = [
      Let(rest, ArrayLit(rs.map((q) => Var(q.name)))),
      Let(n, Int(0)),
      While(Prim('&&', [Prim('<', [Var(n), Int(VALUE_REST)]), Prim('!', [Prim('is_undefined', [Index(Var(rest), Var(n))])])]),
        ExprStmt(SetExp(n, Prim('+', [Var(n), Int(1)])))),
      ExprStmt(SetProp(Var(rest), 'length', Var(n))),
    ];
    return { ...x, params: [...x.params.slice(0, k), ...rs], body: [...prologue, ...walk(x.body)] };
  };
  const walk = (x, callee = false, named = false) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map((y) => walk(y));
    if (x.kind === 'Var' && fixed.has(x.name) && !callee) return asValue(x.name);   // (chapter 22)
    if (x.kind === 'Call') {
      const fn = x.fn.kind === 'Var' ? x.fn : walk(x.fn);
      const args = x.args.map((a) => (a.kind === 'Spread' ? { ...a, arg: walk(a.arg) } : walk(a)));
      if (fn.kind === 'Var' && fixed.has(fn.name)) {
        const k = fixed.get(fn.name);
        if (args.slice(0, k).some((a) => a.kind === 'Spread'))
          throw new CompileError(`a spread argument before ${fn.name.replace(/\.\d+$/, '')}'s rest parameter is not in the subset`);
        // (chapter 23: fixed parameters the call leaves out are undefined; the rest comes after them)
        const fixedArgs = [...args.slice(0, k), ...Array.from({ length: Math.max(0, k - args.length) }, () => AnyLit(undefined))];
        return { ...x, fn, args: [...fixedArgs, packed(args.slice(k))] };
      }
      if (args.some((a) => a.kind === 'Spread')) throw new CompileError('a spread argument to a function without a rest parameter is not in the subset');
      return { ...x, fn: x.fn.kind === 'Var' ? walk(x.fn) : fn, args };
    }
    if (variadicCall(x)) return { ...x, obj: walk(x.obj), args: [packed(x.args.map((a) => (a.kind === 'Spread' ? { ...a, arg: walk(a.arg) } : walk(a))))] };
    if (x.kind === 'Const' && x.init.kind === 'Lambda' && fixed.has(x.name)) return { ...x, init: walk(x.init, false, true) };
    if (x.kind === 'Lambda' && !named && x.params.length && x.params.at(-1).rest) return packing(x);   // chapter 23
    if (x.kind === 'FunDef' || x.kind === 'Lambda') {
      const params = x.params.map(({ rest, ...q }) => (rest ? { ...q } : q));
      return { ...x, params, body: walk(x.body) };
    }
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = walk(v);
    return out;
  };
  // (chapter 23: marked, because ui.col([...]) still looks like a call to pack)
  return { ...p, body: walk(p.body), restLowered: true };
}

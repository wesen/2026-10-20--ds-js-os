// type_check: every expression has type Int or Bool, and operators get the types they need.
//
// JavaScript itself has no such rule: `1 + true` is 2 and `if (5)` takes its branch. The
// subset of chapters 4 to 8 keeps the two types apart, so that a value can be a plain
// machine word whose meaning the compiler always knows; chapter 9 brings JavaScript's
// conversions back with dynamic values. So this pass is part of the language's definition:
// a program it rejects is not in the subset, even though Node runs it.
//
// It runs after uniquify, where every name is unique, so the environment is one flat map
// and a name's type is fixed by its single declaration. Its output is its input with each
// console.log marked with the type it prints, because SLJIT code cannot tell 1 from true.

import { Program, Print, Const, Block, IfStmt, Let, ExprStmt, While, ArrayLit, FunDef, Return, Lambda, AnyLit } from './ast.js';
//
// Chapter 9: a third base type, Any, the type of a value whose type is known only when the
// program runs. A parameter or function result without a type comment is Any, and so are
// 1.5, undefined and null. Where Any meets an operator, the operator works as JavaScript's
// does, and where a typed value meets Any it must be one that can become dynamic
// (isDynamicType). This pass only decides; cast_insert, next, makes each conversion
// explicit, and for that every expression in the output carries its type in `ty`.
//
// Chapter 8: nested functions and arrow functions. An arrow function with an expression
// body may leave out its result type, which is then the body's type. Every declaration is
// annotated with its type, which closure conversion needs for the closures it builds.
//
// Chapter 7: a function's parameter and result types come from its type comments. A call
// needs a function, the right number of arguments, and arguments of the parameters' types.
// Every return must return the declared type, and the end of the body must be unreachable:
// JavaScript would return undefined there, which the subset does not have.
//
// Chapter 6: an array's type is its element type followed by [], as a string: 'Int[]',
// 'Bool[][]'. Every element of an array has the same type, so a[i] has a type the compiler
// knows, and the type of an array literal is written into the node for expose_allocation.
import { CompileError } from './utils.js';

const SIGNATURES = {
  neg: [['Int'], 'Int'],
  '+': [['Int', 'Int'], 'Int'],
  '-': [['Int', 'Int'], 'Int'],
  '*': [['Int', 'Int'], 'Int'],
  '<': [['Int', 'Int'], 'Bool'],
  '<=': [['Int', 'Int'], 'Bool'],
  '>': [['Int', 'Int'], 'Bool'],
  '>=': [['Int', 'Int'], 'Bool'],
  '!': [['Bool'], 'Bool'],
  '&&': [['Bool', 'Bool'], 'Bool'],
  '||': [['Bool', 'Bool'], 'Bool'],
};

import { MATH } from './math.js';
import { STRING_METHODS } from './strings.js';
// Chapter 11: the operators that are dynamic on these operand types although none is Any.
export function looseOp(op, ts) {
  if (op === '&&' || op === '||') return !ts.every((t) => t === 'Bool') && ts.every(stringable);
  // == between a Bool and a number compares numbers: true == 1
  if (op === '==' || op === '!=') return ts[0] !== ts[1] && ts.every((t) => PRIMITIVE.has(t)) && !ts.every((t) => NUMERIC.has(t));
  // (chapter 13: and with a string, which JavaScript converts to a number: '6' * 7 is 42)
  return ['+', '-', '*', '/', '%', '**', 'neg', '<', '<=', '>', '>='].includes(op) && (ts.includes('Bool') || ts.includes('String'))
    && ts.every(stringable);
}
// Chapter 13: the types a value can be converted to a string from (by + or String(x)).
// (chapter 14: an Error becomes "name: message")
export const stringable = (t) => PRIMITIVE.has(t) || t === 'String' || isErrorType(t);
const opName = (op) => (op === 'neg' ? 'unary -' : op);
export { isArrayType, elementType } from './types.js';
import { isArrayType, elementType, arrayOf, isFunctionType, functionParts, functionType, isDynamicType, isRecordType, isErrorType, recordFields, recordType } from './types.js';

const EXPRESSIONS = new Set(['Int', 'Bool', 'Var', 'Prim', 'If', 'Index', 'SetIndex', 'Set', 'ArrayLit', 'Call', 'AnyLit', 'Num', 'Caught',
  'Str', 'Record', 'Get', 'SetProp', 'MethodCall']);
const ARITH = new Set(['neg', '+', '-', '*']);
const ORDER = new Set(['<', '<=', '>', '>=']);
// Operand types JavaScript converts to numbers (and to booleans) without complaint.
const PRIMITIVE = new Set(['Int', 'Number', 'Bool', 'Any']);
// Chapter 10: Number is a JavaScript number, a double; Int is a number known to be a safe
// integer, which every Int operation keeps (or leaves the subset). An Int can be used where a
// Number is expected; the other way needs a cast through Any.
const NUMERIC = new Set(['Int', 'Number']);
const BITWISE = new Set(['&', '|', '^', '<<', '>>', '>>>', '~']);

// A value of type `got` may be used where `want` is expected: the same type, or a cast to
// or from Any that cast_insert will insert.
function assignable(got, want) {
  if (got === want) return true;
  if (got === 'Int' && want === 'Number') return true;      // chapter 10: an integer is a number
  // chapter 12: a written Int is a promise the program keeps at run time where the ranges
  // cannot prove it: a double that reaches it is checked to be an exact integer
  if (got === 'Number' && want === 'Int') return true;
  return (want === 'Any' && isDynamicType(got)) || (got === 'Any' && isDynamicType(want));
}
function mustAssign(got, want, what) {
  if (assignable(got, want)) return;
  if (want === 'Any' || got === 'Any')
    throw new CompileError(`${what}: a value of type ${got === 'Any' ? want : got} cannot be a dynamic value (Any) in this subset`);
  throw new CompileError(what.includes('cannot be assigned') ? what : `${what} must be ${want}, got ${got}`);
}
// Messages use the name from the source, not uniquify's renamed one.
const src = (name) => name.replace(/\.\d+$/, '');

// Whether running these statements always ends in a return. while (true) never ends at all
// unless a break leaves it, which is as good as a return.
// Chapter 10: statements run in order, so a break or continue before the return means it may
// not be reached.
export function alwaysReturns(stmts) {
  for (const s of stmts) {
    switch (s.kind) {
      case 'Return': return true;
      case 'Throw': return true;   // chapter 14: no path goes on after a throw
      case 'Try':
        if (s.finalizer && alwaysReturns([s.finalizer])) return true;
        if (alwaysReturns([s.body]) && (!s.handler || alwaysReturns([s.handler]))) return true;
        break;
      case 'Break': case 'Continue': return false;
      case 'Block': if (alwaysReturns(s.body)) return true; if (leaves(s.body)) return false; break;
      case 'IfStmt': if (s.els !== null && alwaysReturns([s.thn]) && alwaysReturns([s.els])) return true; break;
      case 'While':
        if (s.cond.kind === 'Bool' && s.cond.value === true && (!breaks(s.body, s.label) || alwaysReturns([s.body]))) return true;
        break;
      default: break;
    }
  }
  return false;
}
// a statement list that ends with an unconditional break or continue
const leaves = (stmts) => stmts.length > 0 && ['Break', 'Continue'].includes(stmts.at(-1).kind);
// whether a break that leaves the loop `label` appears anywhere in s
function breaks(s, label) {
  if (s === null || typeof s !== 'object') return false;
  if (Array.isArray(s)) return s.some((x) => breaks(x, label));
  if (s.kind === 'Break') return s.label === label;
  if (s.kind === 'FunDef' || s.kind === 'Lambda') return false;
  return Object.values(s).some((v) => typeof v === 'object' && breaks(v, label));
}


// Every function declaration in the program, at any depth (they are all hoisted).
function allFunDefs(stmts, out = []) {
  for (const s of stmts) {
    if (s.kind === 'FunDef') { out.push(s); allFunDefs(s.body, out); }
    if (s.kind === 'Block') allFunDefs(s.body, out);
  }
  return out;
}

export function typeCheck(p) {
  const env = new Map();   // unique name -> type
  let returnType = null;   // of the function being checked
  const lambdas = new Map();   // Lambda node -> { type, node }: each is checked once
  for (const d of allFunDefs(p.body)) env.set(d.name, functionType(d.params.map((q) => q.type), d.retType));
  // chapter 22: and every variable whose type was written or inferred, so that a function may
  // call a const arrow function defined below it (names are unique since uniquify, and a read
  // before the declaration in the same function was rejected there)
  (function declare(x) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(declare); return; }
    if ((x.kind === 'Const' || x.kind === 'Let') && typeof x.type === 'string' && x.init?.kind !== 'Hoisted') env.set(x.name, x.type);
    Object.values(x).forEach(declare);
  })(p.body);

  function exp(e) {
    switch (e.kind) {
      case 'Int': return 'Int';
      case 'Bool': return 'Bool';
      case 'AnyLit': return 'Any';
      case 'Num': return 'Number';
      case 'Str': return 'String';
      case 'Caught': return 'Any';   // chapter 14
      case 'Record': return record(e);
      case 'Get': {
        const o = exp(e.obj);
        if (o === 'Any') return 'Any';
        if (!isRecordType(o)) throw new CompileError(`.${e.name}: a ${o} has no properties in this subset`);
        const f = recordFields(o).find(([n]) => n === e.name);
        if (!f) throw new CompileError(`.${e.name}: the record ${o} has no field ${e.name}`);
        return f[1];
      }
      case 'SetProp': {
        const o = exp(e.obj);
        if (e.name === 'length' && (isArrayType(o) || o === 'Any')) {   // chapter 15: a.length = n
          mustAssign(against(e.exp, 'Int'), 'Int', 'an array\'s length');
          return 'Int';
        }
        if (o === 'Any') { mustAssign(against(e.exp, 'Any'), 'Any', `.${e.name} of a dynamic value`); return 'Any'; }
        if (!isRecordType(o)) throw new CompileError(`.${e.name} = : a ${o} has no properties in this subset`);
        const f = recordFields(o).find(([n]) => n === e.name);
        if (!f) throw new CompileError(`.${e.name}: the record ${o} has no field ${e.name}`);
        mustAssign(against(e.exp, f[1]), f[1], `the field ${e.name}`);
        return f[1];
      }
      case 'MethodCall': return methodCall(e);
      case 'Var': return env.get(e.name);
      case 'Prim': {
        const ts = e.args.map(exp);
        const dyn = ts.includes('Any');
        // chapter 13: strings. String(x), typeof x and a + with a string operand give strings;
        // two strings compare by their code units
        if (e.op === 'typeof') return 'String';   // of anything: a static type knows its kind
        if (e.op === 'Array.isArray') return 'Bool';   // chapter 15
        if (e.op === 'fn_arity') return 'Int';          // chapter 16
        if (e.op === 'host_arg' || e.op === 'host_entries') return 'Int';          // chapter 24
        if (e.op === 'host_call' || e.op === 'host_event') return 'Any';
        if (e.op === 'is_undefined') return 'Bool';     // chapter 17
        if (['any_delete', 'any_in', 'any_keys'].includes(e.op)) {   // chapter 19
          const o = ts[e.op === 'any_in' ? 1 : 0];
          if (!isDynamicType(o)) throw new CompileError(`a value of type ${o} cannot be used as a table in this subset`);
          return e.op === 'any_keys' ? 'Any[]' : 'Bool';
        }
        if (e.op === 'String') {
          if (!stringable(ts[0])) throw new CompileError(`${e.op}(${ts[0]}) is outside the subset: only numbers, booleans, strings and dynamic values become strings`);
          return 'String';
        }
        if (e.op === 'String.fromCharCode') {
          if (!NUMERIC.has(ts[0]) && ts[0] !== 'Any') throw new CompileError(`String.fromCharCode needs a number, got ${ts[0]}`);
          return 'String';
        }
        if (e.op === '+' && ts.includes('String')) {
          if (!ts.every(stringable)) throw new CompileError(`+ of ${ts.join(' and ')}: only numbers, booleans, strings and dynamic values become strings in this subset`);
          return 'String';
        }
        if (ts.every((t) => t === 'String') && ts.length === 2 && (ORDER.has(e.op) || ['===', '!==', '==', '!='].includes(e.op))) return 'Bool';
        if (e.op === '!' && ts[0] === 'String') return 'Bool';

        // chapter 10: a ?? b is a when a cannot be null or undefined, which only an Any can be
        if (e.op === '??') {
          if (ts[0] !== 'Any') return ts[0];
          if (!assignable(ts[1], 'Any')) throw new CompileError(`a value of type ${ts[1]} cannot be a dynamic value`);
          return 'Any';
        }
        // chapter 10: == and != on two values of one type are === and !==; on an Any they
        // are JavaScript's loose equality, which runtime.c implements
        const op = e.op === '==' ? '===' : e.op === '!=' ? '!==' : e.op;
        // chapter 10: Math's functions take numbers; an Int stays one where the result is sure
        // to be an integer (floor of an Int, max of two Ints), and is a Number otherwise
        if (e.op.startsWith('Math.')) {
          const m = MATH[e.op.slice(5)];
          if (!ts.every((t) => NUMERIC.has(t) || t === 'Any'))
            throw new CompileError(`${e.op} needs numbers, got ${ts.join(' and ')}`);
          if (m.result) return m.result;
          return m.int && ts.every((t) => t === 'Int') ? 'Int' : 'Number';
        }
        if (e.op.startsWith('typeof=')) return 'Bool';
        // chapter 10: the bitwise operators take any number (or a dynamic value) to a 32-bit integer
        if (BITWISE.has(e.op)) {   // (chapter 11: a Bool too, as JavaScript converts it)
          if (!ts.every((t) => PRIMITIVE.has(t)))
            throw new CompileError(`${e.op} needs numbers, got ${ts.join(' and ')}`);
          return 'Int';
        }
        // chapter 10: arithmetic on a Number is a double's; on two Ints it stays an Int, except /
        // chapter 12: an operation on Ints that the ranges cannot prove exact is a double's
        const numbers = ts.every((t) => NUMERIC.has(t)) && (ts.some((t) => t === 'Number') || !!e.double);
        const always = e.op === '/' || e.op === '**';   // a double even on two Ints
        // chapter 11: && and || on anything but two Bools, and arithmetic or an order on a
        // Bool, are JavaScript's, as on an Any: true + 1 is 2, n && b is n or b
        const loose = looseOp(e.op, ts);
        if (!dyn && !loose && (numbers || (always && ts.every((t) => NUMERIC.has(t))))) {
          if (['+', '-', '*', '/', '%', '**', 'neg'].includes(e.op)) return 'Number';
          if (ORDER.has(e.op) || op === '===' || op === '!==') return 'Bool';
        }
        if (e.op === '%' && ts.every((t) => t === 'Int')) return 'Int';
        if (e.op === '!' && NUMERIC.has(ts[0])) return 'Bool';   // a number's truthiness
        // chapter 22: and an object, an array or a function, always true (!t is false); CJI-3: of
        // any expression, which is evaluated for what it does (!seen.add(k), add giving the Set back)
        if (e.op === '!' && (isRecordType(ts[0]) || isArrayType(ts[0]) || isFunctionType(ts[0]))) return 'Bool';
        // chapter 22: a || b and a && b give back an operand, of any type that can be a dynamic
        // value: x || {}, list || [] (inference made both dynamic)
        if ((e.op === '&&' || e.op === '||') && !ts.every((t) => t === 'Bool')) {
          for (const t of ts) if (!assignable(t, 'Any')) throw new CompileError(`${e.op}: a value of type ${t} cannot be a dynamic value in this subset`);
          return 'Any';
        }
        if (dyn || always || loose) {
          // chapter 9: an operand of type Any makes the operator JavaScript's
          if (op === '===' || op === '!==') return 'Bool';
          if (e.op === '!') return 'Bool';
          if (e.op === 'length') return 'Int';
          if (!ts.every(stringable) || (!dyn && !loose && !ts.every((t) => NUMERIC.has(t))))
            throw new CompileError(`${opName(e.op)} needs numbers, got ${ts.join(' and ')}`);
          return ORDER.has(e.op) ? 'Bool' : 'Any';
        }
        if (op === '===' || op === '!==') {
          if (ts[0] !== ts[1])
            throw new CompileError(`${e.op} compares ${ts[0]} with ${ts[1]}; in JavaScript the answer is always ${e.op === '!=='}`);
          return 'Bool';
        }
        if (e.op === 'length') {
          if (!isArrayType(ts[0]) && ts[0] !== 'String') throw new CompileError(`.length needs an array or a string, got ${ts[0]}`);
          return 'Int';
        }
        const [want, result] = SIGNATURES[e.op];
        ts.forEach((t, k) => {
          if (t !== want[k])
            throw new CompileError(`${opName(e.op)} needs ${want.join(' and ')} operands, got ${ts.join(' and ')}`);
        });
        return result;
      }
      case 'If': {
        if (e.want) return e.want;   // (chapter 22: checked against its expected type)
        condition(exp(e.cond), '?:');
        const t = exp(e.thn), f = exp(e.els);
        if (t === f) return t;
        // chapter 22: an array literal in one branch is checked as an array of the other's kind
        // (text ? text.split(s) : [], items.length ? items : [{ s: "none" }])
        const lit = (x) => x.kind === 'ArrayLit';
        if (lit(e.thn) && !lit(e.els) && isArrayType(f)) return against(e.thn, f);
        if (lit(e.els) && !lit(e.thn) && isArrayType(t)) return against(e.els, t);
        // (chapter 23: two literals, one of them dynamic: k ? ['a', 'b'] : [])
        if (lit(e.thn) && lit(e.els) && isArrayType(t) && isArrayType(f)) {
          if (elementType(f) === 'Any') return against(e.thn, f);
          if (elementType(t) === 'Any') return against(e.els, t);
        }
        // (and against a dynamic value, as an Any[]: items.length ? items : [{ s: "none" }])
        if (lit(e.thn) && f === 'Any' && isDynamicType(against(e.thn, 'Any'))) return 'Any';
        if (lit(e.els) && t === 'Any' && isDynamicType(against(e.els, 'Any'))) return 'Any';
        if (NUMERIC.has(t) && NUMERIC.has(f)) return 'Number';
        if (isDynamicType(t) && isDynamicType(f)) return 'Any';
        throw new CompileError(`the branches of ?: have different types, ${t} and ${f}`);
      }
      case 'Index': {
        const a = exp(e.arr), i = exp(e.idx);
        if (a === 'String') {   // chapter 13: s[i], a string of one code unit
          if (!['Int', 'Any', 'Number'].includes(i)) throw new CompileError(`a string index must be Int, got ${i}`);
          return 'String';
        }
        // chapter 19: a dynamic value, or an object whose fields are dynamic, indexed by a key
        if ((a === 'Any' || (isRecordType(a) && isDynamicType(a))) && (i === 'String' || isRecordType(a))) return 'Any';
        if (!isArrayType(a) && a !== 'Any') throw new CompileError(`only an array can be indexed, got ${a}`);
        if (i !== 'Int' && i !== 'Any' && i !== 'Number') throw new CompileError(`an array index must be Int, got ${i}`);
        return a === 'Any' ? 'Any' : elementType(a);
      }
      case 'SetIndex': {
        if (exp(e.arr) === 'String') throw new CompileError('a string cannot be changed: s[i] = c is not JavaScript either');
        const t = exp({ kind: 'Index', arr: e.arr, idx: e.idx }), got = against(e.exp, t);
        if (e.op && (t !== 'Int' || got !== 'Int')) throw new CompileError(`${e.op}= needs an Int element and an Int value, got ${t} and ${got}`);
        if (!assignable(got, t)) mustAssign(got, t, `an element of type ${t} cannot be assigned ${got}`);
        return t;
      }
      case 'Set': {
        const want = env.get(e.name), got = against(e.exp, want);
        if (e.op && want !== 'Int') throw new CompileError(`${e.op}= needs an Int variable, ${src(e.name)} is ${want}`);
        if (e.op && got !== 'Int') throw new CompileError(`${e.op}= needs an Int value, got ${got}`);
        if (!assignable(got, want)) throw new CompileError(`${src(e.name)} is ${want} and cannot be assigned ${got}`);
        return want;
      }
      case 'ArrayLit':
        return arrayType(e);
      case 'Lambda':
        return lambda(e).type;
      case 'Call': {
        const f = exp(e.fn);
        if (f === undefined) throw new CompileError('a function is called through its own name before its type is known; give it a result type');
        if (f === 'Any') {           // chapter 9: a call of a dynamic value
          e.args.forEach((a, k) => mustAssign(against(a, 'Any'), 'Any', `argument ${k + 1} of a call`));
          return 'Any';
        }
        if (!isFunctionType(f)) throw new CompileError(`only a function can be called, got ${f}`);
        const { params, ret } = functionParts(f);
        // chapter 23: a dynamic function (inference made it one) ignores extra arguments
        if (e.args.length > params.length && params.every((q) => q === 'Any') && ret === 'Any') {
          e.args.forEach((a, k) => mustAssign(against(a, 'Any'), 'Any', `argument ${k + 1} of a call`));
          return 'Any';
        }
        // chapter 9: a missing argument is undefined, which only an Any parameter can be
        if (e.args.length > params.length || params.slice(e.args.length).some((q) => q !== 'Any'))
          throw new CompileError(`a call passes ${e.args.length} argument${e.args.length === 1 ? '' : 's'} to a function of ${params.length}`);
        e.args.forEach((a, k) => mustAssign(against(a, params[k]), params[k], `argument ${k + 1} of a call`));
        return ret;
      }
      default:
        throw new Error(`type_check: unexpected ${e.kind}`);
    }
  }

  function lambda(e) {
    if (lambdas.has(e)) return lambdas.get(e);
    for (const q of e.params) env.set(q.name, q.type);
    // CJI-3: the declarations in an arrow's block body are hoisted too (only the program's
    // and functions' were), so function f(n) { ... f(n - 1) ... } inside () => { ... } is known
    for (const d of allFunDefs(e.body)) env.set(d.name, functionType(d.params.map((q) => q.type), d.retType));
    const outer = returnType;
    returnType = e.retType ?? exp(e.body[0].arg);   // an expression body: its type
    const body = finish(e.body.map(stmt), 'an arrow function');
    const type = functionType(e.params.map((q) => q.type), returnType);
    const node = { ...Lambda(e.params, returnType, body, e.name), type, ty: type };
    returnType = outer;
    lambdas.set(e, node);
    return node;
  }

  // A function body that can reach its end: one that returns Any returns undefined there,
  // as JavaScript does; any other is an error.
  function finish(body, what) {
    if (alwaysReturns(body)) return body;
    if (returnType === 'Any') return [...body, Return(AnyLit(undefined))];
    throw new CompileError(`${what} can reach the end of its body without returning a value`);
  }

  // The type of e where a value of type `want` is expected. An array literal expected to be
  // dynamic is an Any[], whatever its elements: [1, 2] passed to an untyped parameter.
  // Chapter 10: likewise an array literal expected to be a Number[] is one, [1, 2] included.
  function against(e, want) {
    // chapter 22: the expected type reaches both branches of a ?: (c ? [1, x] : [0, y] for an Any[])
    if (e.kind === 'If' && isArrayType(want) && (e.thn.kind === 'ArrayLit' || e.els.kind === 'ArrayLit')) {
      condition(exp(e.cond), '?:');
      const t = against(e.thn, want), f = against(e.els, want);
      if (t === want && f === want) { e.want = want; return want; }
      return exp(e);
    }
    if (e.kind === 'ArrayLit' && (want === 'Any' || want === 'Any[]') && e.elems.every((x) => isDynamicType(against(x, 'Any'))))
      e.want = 'Any[]';
    else if (e.kind === 'ArrayLit' && isArrayType(want)
      && e.elems.every((x) => assignable(against(x, elementType(want)), elementType(want))))
      e.want = want;
    return exp(e);
  }

  function condition(t, what) {
    // chapter 10: a number's truthiness is JavaScript's: an Int is true unless 0, a Number
    // unless 0 or NaN
    // chapter 21: and a function, an array or an object, which is always true (Date.now ? ... : ...)
    if (!['Bool', 'Any', 'Number', 'Int', 'String'].includes(t) && !isFunctionType(t) && !isArrayType(t) && !isRecordType(t))
      throw new CompileError(`the condition of ${what} must be Bool, got ${t}`);
  }

  // The type of [e1, ..., en]: every element must have the type of the first, or else
  // (chapter 9) every element can be dynamic and the array is an Any[]. [] is an Any[].
  function arrayType(e) {
    if (e.want) return e.want;
    if (e.elems.length === 0) return 'Any[]';
    const ts = e.elems.map(exp);
    if (ts.every((t) => t === ts[0])) return arrayOf(ts[0]);
    if (ts.every((t) => NUMERIC.has(t))) return 'Number[]';
    const k = ts.findIndex((t) => !isDynamicType(t));
    if (k >= 0) throw new CompileError(`array elements must have one type; element 0 is ${ts[0]}, element ${ts.findIndex((t) => t !== ts[0])} is ${ts[ts.findIndex((t) => t !== ts[0])]}`);
    return 'Any[]';
  }

  // The tree again, with each array literal's type written into it. (Only expressions can
  // contain literals, and only this rebuild needs to visit them.)
  function annotate(e) {
    if (e === null || typeof e !== 'object') return e;
    if (Array.isArray(e)) return e.map(annotate);
    if (e.kind === 'Lambda') return lambda(e);
    const out = { ...e };
    for (const k of Object.keys(out)) if (typeof out[k] === 'object') out[k] = annotate(out[k]);
    if (e.kind === 'ArrayLit') out.type = exp(e);
    if (EXPRESSIONS.has(e.kind)) out.ty = exp(e);
    if (e.kind === 'Call') { out.type = exp(e); out.fnType = exp(e.fn); }   // for closure conversion
    return out;
  }

  // Chapter 13: a record literal has the type inference gave its class (fields the literal
  // lacks start as undefined, so they must be Any), or the type of its fields.
  function record(e) {
    const t = e.type ?? recordType(e.fields.map((f) => [f.name, exp(f.exp)]));
    for (const [name, ft] of recordFields(t)) {
      const f = e.fields.find((x) => x.name === name);
      if (f) mustAssign(against(f.exp, ft), ft, `the field ${name}`);
      else if (!assignable('Any', ft)) throw new CompileError(`the field ${name} is missing from a record literal, and undefined is not a ${ft}`);
    }
    return t;
  }

  // Chapter 13: a method of a string (or of a dynamic value, which must then be a string), a
  // record's function field, an array's join, a number's toString.
  function methodCall(e) {
    const o = exp(e.obj), m = STRING_METHODS[e.name];
    if (e.own && o === 'Any') {   // CJI-3: an object's own function field, whatever the name (library.js)
      e.args.forEach((a, k) => mustAssign(against(a, 'Any'), 'Any', `argument ${k + 1} of .${e.name}`));
      return 'Any';
    }
    // x.toString(), for any value that becomes a string (chapter 14: a dynamic one or an Error too)
    if (e.name === 'toString' && e.args.length === 0 && (stringable(o) || o === 'Any')) return 'String';
    // chapter 21: n.toFixed(f), n.toPrecision(p), of a number or of a dynamic value that is one
    if ((e.name === 'toFixed' || e.name === 'toPrecision') && (NUMERIC.has(o) || o === 'Any') && e.args.length <= 1) {
      if (e.args.length) mustAssign(against(e.args[0], 'Number'), 'Number', `the argument of .${e.name}`);
      return 'String';
    }
    if (e.name === 'toString' && e.args.length === 1 && (NUMERIC.has(o) || o === 'Any')) {   // a radix (chapter 21: of an Any too)
      mustAssign(against(e.args[0], 'Number'), 'Number', 'the radix of .toString');
      return 'String';
    }
    if ((o === 'String' || o === 'Any') && m) {
      const n = m.args.length - (m.fixed ?? 0);
      if (e.args.length > n) throw new CompileError(`.${e.name} takes at most ${n} argument${n === 1 ? '' : 's'} in this subset`);
      m.args.slice(0, n).forEach((want, k) => {
        if (k >= e.args.length) {
          if (m.defaults[k] === null) throw new CompileError(`.${e.name} needs ${k + 1} argument${k ? 's' : ''}`);
          return;
        }
        mustAssign(against(e.args[k], want), want, `argument ${k + 1} of .${e.name}`);
      });
      return m.result;
    }
    if (isRecordType(o)) {
      const f = recordFields(o).find(([n]) => n === e.name);
      if (!f) throw new CompileError(`.${e.name}(): the record ${o} has no field ${e.name}`);
      if (f[1] === 'Any') {   // CJI-3: a dynamic field, called dynamically (a method of a class instance)
        e.args.forEach((a, k) => mustAssign(against(a, 'Any'), 'Any', `argument ${k + 1} of .${e.name}`));
        return 'Any';
      }
      if (!isFunctionType(f[1])) throw new CompileError(`.${e.name}(): the field ${e.name} is a ${f[1]}, not a function`);
      const { params, ret } = functionParts(f[1]);
      if (e.args.length > params.length) throw new CompileError(`a call passes ${e.args.length} arguments to a function of ${params.length}`);
      e.args.forEach((a, k) => mustAssign(against(a, params[k]), params[k], `argument ${k + 1} of a call`));
      return ret;
    }
    if (isArrayType(o) && e.name === 'join') {
      if (!stringable(elementType(o))) throw new CompileError(`.join of a ${o} is outside the subset`);
      if (e.args.length > 1) throw new CompileError('.join takes at most one argument');
      if (e.args.length) mustAssign(against(e.args[0], 'String'), 'String', 'the separator of .join');
      return 'String';
    }
    if ((NUMERIC.has(o) || o === 'Bool') && e.name === 'toString' && e.args.length === 0) return 'String';
    // chapter 16: o.f(args) on a dynamic o: the field f, called as a dynamic function
    if (o === 'Any') {
      e.args.forEach((a, k) => mustAssign(against(a, 'Any'), 'Any', `argument ${k + 1} of .${e.name}`));
      return 'Any';
    }
    throw new CompileError(`.${e.name}() is not a method of ${o} in this subset`);
  }

  function stmt(s) {
    switch (s.kind) {
      case 'Print': {
        const t = exp(s.arg);
        if (t !== 'Int' && t !== 'Bool' && t !== 'Any' && t !== 'Number' && t !== 'String')
          throw new CompileError(`console.log of ${isArrayType(t) ? 'an array' : 'a function'} (${t}) is outside the subset: Node formats it with its own rules`);
        return Print(annotate(s.arg), t, s.end);
      }
      case 'Const':
      case 'Let': {
        // an arrow function with a declared result type may call itself through this name
        if (s.init.kind === 'Lambda' && s.init.retType)
          env.set(s.name, functionType(s.init.params.map((q) => q.type), s.init.retType));
        // chapter 16: a variable lower_async moved out of an async function starts with no value
        if (s.init.kind === 'Hoisted') { env.set(s.name, s.type ?? 'Any'); return { ...s, type: s.type ?? 'Any' }; }
        // chapter 16: a function in the initializer may use the variable (its type is known
        // when it was written or inferred)
        if (s.type) env.set(s.name, s.type);
        // chapter 9: a declared type, which the initializer must be assignable to
        const t = s.type ?? exp(s.init);
        if (s.type) mustAssign(against(s.init, s.type), s.type, `the initializer of ${src(s.name)}`);
        env.set(s.name, t);
        return { ...s, init: annotate(s.init), type: t };
      }
      case 'ExprStmt':
        exp(s.exp);
        return ExprStmt(annotate(s.exp));
      case 'Return': {
        const t = against(s.arg, returnType);
        if (!assignable(t, returnType)) throw new CompileError(`a function declared to return ${returnType} returns ${t}`);
        return Return(annotate(s.arg));
      }
      case 'FunDef': {
        for (const q of s.params) env.set(q.name, q.type);
        const outer = returnType;
        returnType = s.retType;
        const body = finish(s.body.map(stmt), src(s.name));
        returnType = outer;
        return FunDef(s.name, s.params, s.retType, body);
      }
      case 'While': {
        condition(exp(s.cond), 'while');
        return { ...s, cond: annotate(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
      }
      case 'Break':
      case 'Continue':
        return s;
      case 'Block':
        return Block(s.body.map(stmt));
      case 'IfStmt': {
        condition(exp(s.cond), 'if');
        return IfStmt(annotate(s.cond), stmt(s.thn), s.els && stmt(s.els));
      }
      case 'Throw':   // chapter 14: any value can be thrown; catch receives it as Any
        mustAssign(against(s.arg, 'Any'), 'Any', 'a thrown value');
        return { ...s, arg: annotate(s.arg) };
      case 'Try':
        return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      default:
        throw new Error(`type_check: unexpected ${s.kind}`);
    }
  }

  return { ...p, ...Program(p.body.map(stmt)) };   // (chapter 23: keeping the marks of the passes before)
}

// cast_insert: make every change of representation explicit (chapter 9).
//
// After type_check, every expression knows its type (its `ty`), and the type checker has
// allowed a value to flow where another type is expected only when the two are related by
// Any. In the compiled program an Int is a 64-bit integer and an Any is a NaN-boxed word
// (dynamic.js), so each such flow needs code: a cast. This pass inserts them, as the book's
// cast_insert does, with operators of their own:
//
//   inject_Int e      an Int becomes a number                     (a call: int to double)
//   inject_Bool e     a Bool becomes true or false                (e + 6)
//   inject e          an Any[] or a dynamic function: the same word
//   project_Int e     a number that is a safe integer becomes an Int; anything else stops
//                     the program with a type error
//   project_Bool e, project_array e, project_fn e n             likewise
//
// It also chooses the dynamic version of each operator that has an Any operand (any+,
// any<, any===, ...), turns an Any condition into truthy(e), and gives a call of a
// function with Any parameters undefined for each missing argument.

import { Prim, Int, If, AnyLit, Print, Return, Block, IfStmt, While, ExprStmt, FunDef, Num, Str, Shape, ArrayLit, Index, SetIndex, Bool, Begin } from './ast.js';
import { isArrayType, elementType, functionParts, dynamicFunctionType, isRecordType, isPointerType, isErrorType, recordFields, isFunctionType, literalOrder } from './types.js';
import { STRING_METHODS } from './strings.js';
import { mapDefs } from './defs.js';
import { CompileError, gensym } from './utils.js';
import { HOLE } from './dynamic.js';

export function cast(e, from, to) {
  if (from === to) return e;
  if (from === 'Int' && to === 'Number')                                   // chapter 10
    return e.kind === 'Int' ? Num(e.value) : Prim('int_to_num', [e]);  // a literal converts now
  // chapter 10: only an array index goes the other way, a[Math.floor(n / 2)]; a double that
  // is not an integer stops the program, as an Any that is not one does
  if (from === 'Number' && to === 'Int') return Prim('num_to_int', [e]);
  if (to === 'Any') {
    if (from === 'Int') return Prim('inject_Int', [e]);
    if (from === 'Bool') return Prim('inject_Bool', [e]);
    if (from === 'Number') return Prim('inject_Number', [e]);           // chapter 10: e + 2^49
    return Prim('inject', [e]);                  // a pointer is its own dynamic value
  }
  if (from !== 'Any') throw new Error(`cast_insert: no cast from ${from} to ${to}`);
  if (e.kind === 'AnyLit') throw new CompileError(`${String(e.value)} is used where ${to} is expected`);
  if (to === 'Int') return Prim('project_Int', [e]);
  if (to === 'Number') return Prim('project_Number', [e]);
  if (to === 'Bool') return Prim('project_Bool', [e]);
  if (to === 'String') return Prim('project_String', [e]);                 // chapter 13
  if (isRecordType(to)) return { ...Prim('project_record', [e, Shape(recordFields(to).map(([n]) => n), isErrorType(to))]), type: to };
  if (isArrayType(to)) return Prim('project_array', [e]);
  return Prim('project_fn', [e, Int(functionParts(to).params.length)]);
}

const DYNAMIC = { neg: 'anyneg', '+': 'any+', '-': 'any-', '*': 'any*', '/': 'any/', '%': 'any%', '<': 'any<', '<=': 'any<=',
  '>': 'any>', '>=': 'any>=', '===': 'any===', '&&': 'any&&', '||': 'any||', '**': 'any**' };
// Chapter 10: the operators on doubles. A typed Number operation is one machine instruction
// on doubles; an Int operation stays an integer one.
const NUMERIC_OP = { neg: 'numneg', '+': 'num+', '-': 'num-', '*': 'num*', '/': 'num/', '%': 'num%', '**': 'num**', '<': 'num<',
  '<=': 'num<=', '>': 'num>', '>=': 'num>=', '===': 'num===', '!==': 'num!==' };
const BITWISE = new Set(['&', '|', '^', '<<', '>>', '>>>', '~']);

import { MATH } from './math.js';
import { looseOp } from './typecheck.js';

// Chapter 13: what typeof gives for a value of a static type (null for Any: only the value knows).
function staticTypeof(t) {
  if (t === 'Int' || t === 'Number') return 'number';
  if (t === 'Bool') return 'boolean';
  if (t === 'String') return 'string';
  if (isFunctionType(t)) return 'function';
  if (isArrayType(t) || isRecordType(t)) return 'object';
  return null;
}

// Chapter 23: a dynamic call passes the arguments it has, as JavaScript does: a function of
// more parameters gets undefined for the rest, one of fewer ignores the extra arguments. A
// call of n arguments (n at most 8) on an Any callee becomes $dyncallN(f, a1, ..., an), which
// asks the closure's arity and calls it with that many; anything that is not a function
// reaches project_fn(f, n) as before and fails there with the same message.
export const MAX_DYNAMIC_ARITY = 8;
const v = (name, ty) => ({ kind: 'Var', name, ty });
function dynCallDef(name, n) {
  const f = gensym('f'), as = Array.from({ length: n }, (_, k) => gensym(`a${k}`)), k = gensym('k');
  const call = (m) => {
    const t = dynamicFunctionType(m);
    const args = Array.from({ length: m }, (_, j) => (j < n ? v(as[j], 'Any') : AnyLit(undefined)));
    return Return({ kind: 'Call', fn: Prim('project_fn', [v(f, 'Any'), Int(m)]), args, ty: 'Any', type: 'Any', fnType: t });
  };
  const is = (m) => Prim('===', [v(k, 'Int'), Int(m)]);
  const body = [{ kind: 'Const', name: k, init: Prim('any_arity', [v(f, 'Any')]), type: 'Int' }, IfStmt(is(n), call(n), null)];
  for (let m = 0; m <= MAX_DYNAMIC_ARITY; m++) {
    if (m === n) continue;
    // (arity 0 is also the answer for a value that is not a function)
    body.push(IfStmt(m === 0 ? Prim('&&', [is(0), Prim('typeof=function', [v(f, 'Any')])]) : is(m), call(m), null));
  }
  body.push(call(n));
  return FunDef(name, [{ name: f, type: 'Any' }, ...as.map((a) => ({ name: a, type: 'Any' }))], 'Any', body);
}

// Chapter 23: a[i] of a typed array or a string, where a dynamic value is wanted: the element,
// or undefined past the end, as in JavaScript. Where the element is used at its own type
// (a[i] + 1 of an Int[]), a read past the end still stops the program: an Int has no
// undefined. One function per array type, $readN(a, i).
// (A Number index, xs[3 / 2], must also be a whole number: $readN of a Number tests that too.)
function readDef(name, arrTy, idxTy) {
  const a = gensym('a'), i = gensym('i');
  const str = arrTy === 'String', t = str ? 'String' : elementType(arrTy);
  const len = str ? Prim('str_length', [v(a, arrTy)]) : Prim('length', [v(a, arrTy)]);
  const num = idxTy === 'Number', n = num ? Prim('int_to_num', [len]) : len;
  const ok = num ? Prim('&&', [Prim('&&', [Prim('num>=', [v(i, 'Number'), Num(0)]), Prim('num<', [v(i, 'Number'), n])]),
    Prim('num===', [Prim('math_floor', [v(i, 'Number')]), v(i, 'Number')])])
    : Prim('&&', [Prim('>=', [v(i, 'Int'), Int(0)]), Prim('<', [v(i, 'Int'), len])]);
  const k = num ? Prim('num_to_int', [v(i, 'Number')]) : v(i, 'Int');
  const read = str ? Prim('str_index', [v(a, 'String'), k]) : { kind: 'Index', arr: v(a, arrTy), idx: k, ty: t };
  return FunDef(name, [{ name: a, type: arrTy }, { name: i, type: idxTy }], 'Any',
    [IfStmt(ok, Return(cast(read, t, 'Any')), null), Return(AnyLit(undefined))]);
}

export function castInsert(p) {
  let returnType = 'Int';
  const reads = new Map();   // chapter 23: array type -> its $readN
  const probe = (e) => e.kind === 'Index' && !e.unchecked && !byKey(e) && (isArrayType(e.arr.ty) || e.arr.ty === 'String');
  const readAny = (e) => {
    const t = e.arr.ty, it = e.idx.ty === 'Number' ? 'Number' : 'Int', key = `${t} ${it}`;
    if (!reads.has(key)) reads.set(key, readDef(gensym(`$read${reads.size}`), t, it));
    const ft = `(${t},${it})=>Any`;
    return { kind: 'Call', fn: v(reads.get(key).name, ft), args: [exp(e.arr), to(e.idx, it)], ty: 'Any', type: 'Any', fnType: ft };
  };
  // chapter 23: the $dyncallN functions this program uses
  const dynCalls = new Map();
  const dynCall = (fn, args) => {
    const n = args.length;
    if (!dynCalls.has(n)) dynCalls.set(n, dynCallDef(gensym(`$dyncall${n}`), n));
    const t = dynamicFunctionType(n + 1);
    return { kind: 'Call', fn: v(dynCalls.get(n).name, t), args: [fn, ...args], ty: 'Any', type: 'Any', fnType: t };
  };

  const to = (e, t) => (t === 'Any' && probe(e) ? readAny(e) : cast(exp(e), e.ty, t));   // (chapter 23: probe)
  // an Any condition asks truthy; a Number (chapter 10) is boxed first and asks the same;
  // an Int is true unless it is 0
  const cond = (e) => (e.ty === 'Any' || e.ty === 'Number' || probe(e) ? Prim('truthy', [to(e, 'Any')])
    : e.ty === 'Int' ? Prim('!==', [exp(e), Int(0)])
      : e.ty === 'String' ? Prim('!==', [Prim('str_length', [exp(e)]), Int(0)])   // chapter 13: '' is false
        : e.ty !== 'Bool' ? objectCond(e)   // chapter 21: a function, an array or an object is true
          : exp(e));
  const objectCond = (e) => {
    // (CJI-3: an expression other than a name is evaluated for what it does: s.add(k) in !s.add(k))
    if (e.kind !== 'Var') return Begin([ExprStmt(exp(e))], Bool(true));
    return Bool(true);
  };
  // chapter 13: a value as a string, as + and String(x) convert it
  const toStr = (e) => {
    switch (e.ty) {
      case 'String': return exp(e);
      case 'Int': return Prim('int_to_str', [exp(e)]);
      case 'Number': return Prim('num_to_str', [exp(e)]);
      case 'Bool': return Prim('bool_to_str', [exp(e)]);
      default: return Prim('any_to_str', [to(e, 'Any')]);
    }
  };
  const int32 = (a) => (a.ty === 'Int' ? exp(a) : a.ty === 'Number' ? Prim('num_to_int32', [exp(a)])
    : Prim('any_to_int32', [to(a, 'Any')]));   // an Any, or (chapter 11) a Bool
  const array = (e) => (e.ty === 'Any' ? cast(exp(e), 'Any', 'Any[]') : exp(e));
  // chapter 19: o[k] of an object, or of a dynamic value by a key not known to be a number
  // (a dynamic value may be an array or an object: the runtime looks)
  const byKey = (e) => isRecordType(e.arr.ty) || (e.arr.ty === 'Any' && !e.op);

  function prim(e) {
    // chapter 13: strings
    if (e.op === 'String') return toStr(e.args[0]);
    if (e.op === 'Array.isArray') return Prim('any_is_array', [to(e.args[0], 'Any')]);   // chapter 15
    if (e.op === 'fn_arity') return Prim('any_arity', [to(e.args[0], 'Any')]);            // chapter 16
    // chapter 24: the native world's system calls: numbers as Ints, a value as Any
    if (e.op === 'host_arg') return Prim('host_arg', [to(e.args[0], 'Int'), to(e.args[1], 'Any')]);
    if (e.op === 'host_entries') return Prim('host_entries', e.args.map((a) => to(a, 'Any')));
    if (e.op === 'host_call' || e.op === 'host_event') return Prim(e.op, e.args.map((a) => to(a, 'Int')));
    // chapter 17: only a dynamic value can be undefined
    if (e.op === 'is_undefined') return e.args[0].ty === 'Any' ? Prim('any===', [exp(e.args[0]), AnyLit(undefined)]) : Bool(false);
    if (['any_delete', 'any_in', 'any_keys'].includes(e.op)) return Prim(e.op, e.args.map((a) => to(a, 'Any')));   // chapter 19
    if (e.op === 'typeof') {
      const k = staticTypeof(e.args[0].ty);
      return k ? Str(k) : Prim('any_typeof_str', [to(e.args[0], 'Any')]);
    }
    if (e.op.startsWith('typeof=') && e.args[0].ty !== 'Any') {   // a typed value's kind is known
      const k = staticTypeof(e.args[0].ty);
      return e.args[0].kind === 'Var' || e.args[0].kind === 'Str' || e.args[0].kind === 'Num' || e.args[0].kind === 'Int'
        ? Bool(k === e.op.slice(7)) : Prim('typeof=' + e.op.slice(7), [to(e.args[0], 'Any')]);
    }
    if (e.op === 'String.fromCharCode') return Prim('str_fromCharCode', [to(e.args[0], 'Number')]);
    if (e.op === '+' && e.ty === 'String') {   // ('' + x, which every template starts with, is x as a string)
      const [a, b] = e.args.map(toStr);
      if (a.kind === 'Str' && a.value === '') return b;
      if (b.kind === 'Str' && b.value === '') return a;
      return Prim('str_concat', [a, b]);
    }
    if (e.op === 'length' && e.args[0].ty === 'String') return Prim('str_length', [exp(e.args[0])]);
    // (chapter 14: of a dynamic value, a string's length or an array's, by name)
    if (e.op === 'length' && e.args[0].ty === 'Any') return Prim('any_length', [exp(e.args[0])]);
    // chapter 23: a comparison with an element read compares dynamically (past the end, undefined)
    if (['===', '!==', '==', '!='].includes(e.op) && e.args.some(probe)) {
      const eq = Prim(e.op.length === 3 ? 'any===' : 'any==', e.args.map((a) => to(a, 'Any')));
      return e.op[0] === '!' ? Prim('!', [eq]) : eq;
    }
    if (e.args.length === 2 && e.args.every((a) => a.ty === 'String')) {
      const args = e.args.map(exp);
      if (e.op === '===' || e.op === '==') return Prim('str_eq', args);
      if (e.op === '!==' || e.op === '!=') return Prim('!', [Prim('str_eq', args)]);
      if (['<', '<=', '>', '>='].includes(e.op)) return Prim(`str${e.op}`, args);
    }
    const dyn = e.args.some((a) => a.ty === 'Any') || looseOp(e.op, e.args.map((a) => a.ty));   // chapter 11
    const anyArgs = () => e.args.map((a) => to(a, 'Any'));
    if (e.op.startsWith('typeof=')) return Prim(e.op, anyArgs());
    // chapter 10: a bitwise operator converts each operand to a 32-bit integer first
    if (BITWISE.has(e.op)) return Prim(e.op, e.args.map(int32));
    // chapter 10: Math's functions (math.js)
    if (e.op.startsWith('Math.')) {
      const m = MATH[e.op.slice(5)];
      if (m.int32) return Prim(m.int32, e.args.map(int32));
      if (m.int && e.args.every((a) => a.ty === 'Int')) return m.int === 'id' ? exp(e.args[0]) : Prim(m.int, e.args.map(exp));
      return Prim(m.num, e.args.map((a) => to(a, 'Number')));
    }
    // chapter 10: an operator on numbers of which one is a Number (or /) works on doubles
    const numeric = !dyn && NUMERIC_OP[e.op] && e.args.every((a) => a.ty === 'Int' || a.ty === 'Number')
      && (e.args.some((a) => a.ty === 'Number') || e.op === '/' || e.op === '**' || e.double);   // chapter 12: e.double
    if (numeric) return Prim(NUMERIC_OP[e.op], e.args.map((a) => to(a, 'Number')));
    switch (e.op) {
      // chapter 10: ==, != and ??
      case '==': return dyn ? Prim('any==', anyArgs()) : prim({ ...e, op: '===' });
      case '!=': return dyn ? Prim('!', [Prim('any==', anyArgs())]) : prim({ ...e, op: '!==' });
      case '??': return e.args[0].ty === 'Any' ? Prim('any??', anyArgs()) : exp(e.args[0]);
      case '!': return Prim('!', [cond(e.args[0])]);
      case 'length': return Prim('length', [array(e.args[0])]);
      case '!==': return dyn ? Prim('!', [Prim('any===', anyArgs())]) : Prim(e.op, e.args.map(exp));
      case '&&': case '||':
        return e.ty === 'Any' ? Prim(DYNAMIC[e.op], anyArgs()) : Prim(e.op, e.args.map(exp));
      default:
        return dyn ? Prim(DYNAMIC[e.op], anyArgs()) : Prim(e.op, e.args.map(exp));
    }
  }

  function exp(e) {
    switch (e.kind) {
      case 'Int': case 'Bool': case 'Var': case 'AnyLit': case 'Num':
        return e;
      case 'Prim':
        return prim(e);
      case 'If':
        return If(cond(e.cond), to(e.thn, e.ty), to(e.els, e.ty));
      case 'Index':
        if (byKey(e)) return Prim('any_index', [to(e.arr, 'Any'), to(e.idx, 'Any')]);   // chapter 19
        if (e.arr.ty === 'String') return Prim('str_index', [exp(e.arr), to(e.idx, 'Int')]);   // chapter 13
        return { ...e, arr: array(e.arr), idx: to(e.idx, 'Int') };
      case 'Str':
      case 'Caught':   // chapter 14
        return e;
      // Chapter 13: a record is an object of 1 + n words after its header: its shape (the
      // field names, a static table a dynamic access searches), then its fields in the
      // order of their names. The literal's fields are computed in the order they are
      // written; slots says where each goes.
      case 'Record': {
        // (chapter 23: a table's literal in its own key order)
        const fields = e.ownOrder ? literalOrder(e.fields.map((f) => f.name)).map((n) => recordFields(e.ty).find(([m]) => m === n)) : recordFields(e.ty);
        const given = e.fields.map((f) => [f.name, to(f.exp, fields.find(([n]) => n === f.name)[1])]);
        // (chapter 20: a field of the class that this literal does not write is absent, HOLE)
        const missing = fields.filter(([n]) => !e.fields.some((f) => f.name === n)).map(([n]) => [n, AnyLit(HOLE)]);
        const all = [...given, ...missing];
        // chapter 19: and a last word for the properties added at run time (none yet)
        return { ...ArrayLit([Shape(fields.map(([n]) => n), isErrorType(e.ty)), ...all.map(([, x]) => x), AnyLit(undefined)], e.ty), record: true,
          slots: [0, ...all.map(([n]) => 1 + fields.findIndex(([m]) => m === n)), fields.length + 1] };
      }
      case 'Get': {
        if (e.obj.ty === 'Any') return Prim('any_get', [to(e.obj, 'Any'), Str(e.name)]);
        const fields = recordFields(e.obj.ty), k = fields.findIndex(([n]) => n === e.name);
        const read = { ...Index(exp(e.obj), Int(k + 1)), unchecked: true, fieldType: fields[k][1] };
        // chapter 20: a dynamic field may be absent from this object (HOLE): it reads undefined
        return fields[k][1] === 'Any' ? Prim('any_unhole', [read]) : read;
      }
      case 'SetProp': {
        // chapter 15: a.length = n, the new slots holding the element type's zero (undefined
        // in an Any[])
        if (e.name === 'length' && (e.obj.ty === 'Any' || isArrayType(e.obj.ty))) {
          const elem = e.obj.ty === 'Any' ? 'Any' : elementType(e.obj.ty);
          const zero = { Int: Int(0), Number: Num(0), Bool: Bool(false), Any: AnyLit(undefined), String: Str('') }[elem] ?? Int(0);
          return Prim('arr_resize', [array(e.obj), to(e.exp, 'Int'), zero]);
        }
        if (e.obj.ty === 'Any') return Prim('any_set', [to(e.obj, 'Any'), Str(e.name), to(e.exp, 'Any')]);
        const fields = recordFields(e.obj.ty), k = fields.findIndex(([n]) => n === e.name);
        return { ...SetIndex(exp(e.obj), Int(k + 1), to(e.exp, fields[k][1])), unchecked: true, fieldType: fields[k][1] };
      }
      case 'MethodCall':
        return methodCall(e);
      case 'SetIndex': {
        if (byKey(e)) {   // chapter 19
          if (e.op) throw new CompileError(`${e.op}= on a property found by a key is not in the subset`);
          return Prim('any_set_index', [to(e.arr, 'Any'), to(e.idx, 'Any'), to(e.exp, 'Any')]);
        }
        const elem = e.arr.ty === 'Any' ? 'Any' : elementType(e.arr.ty);
        return { ...e, arr: array(e.arr), idx: to(e.idx, 'Int'), exp: e.op ? exp(e.exp) : to(e.exp, elem) };
      }
      case 'Set':
        return { ...e, exp: e.op ? exp(e.exp) : to(e.exp, e.ty) };
      case 'ArrayLit':
        return { ...e, elems: e.elems.map((x) => to(x, elementType(e.type))) };
      case 'Lambda': {
        const outer = returnType;
        returnType = e.retType;
        const body = e.body.map(stmt);
        returnType = outer;
        return { ...e, body };
      }
      case 'Call': {
        if (e.fn.ty === 'Any' && e.args.length <= MAX_DYNAMIC_ARITY) return dynCall(to(e.fn, 'Any'), e.args.map((a) => to(a, 'Any')));   // chapter 23
        if (e.fn.ty === 'Any') {
          const t = dynamicFunctionType(e.args.length);
          return { ...e, fn: cast(exp(e.fn), 'Any', t), args: e.args.map((a) => to(a, 'Any')), fnType: t };
        }
        const { params } = functionParts(e.fn.ty);
        // chapter 23: extra arguments are evaluated and ignored: the call is a dynamic one
        if (e.args.length > params.length) return dynCall(cast(exp(e.fn), e.fn.ty, 'Any'), e.args.map((a) => to(a, 'Any')));
        return { ...e, fn: exp(e.fn), args: params.map((q, k) => (k < e.args.length ? to(e.args[k], q) : AnyLit(undefined))) };
      }
      default:
        throw new Error(`cast_insert: unexpected ${e.kind}`);
    }
  }

  // Chapter 13: s.f(args) becomes f's operator, with the defaults of missing arguments; a
  // record's function field is called as any closure is.
  function methodCall(e) {
    const m = STRING_METHODS[e.name], o = e.obj.ty;
    if (e.own && o === 'Any') return dynamicField(e);   // CJI-3: an object's own function field (library.js)
    if (e.name === 'toString' && e.args.length === 0 && o !== 'String') return toStr(e.obj);   // chapter 14: any value's
    if (e.name === 'toString' && e.args.length === 1) return Prim('num_to_radix', [to(e.obj, 'Number'), to(e.args[0], 'Number')]);
    // chapter 21
    if (e.name === 'toFixed') return Prim('num_to_fixed', [to(e.obj, 'Number'), e.args.length ? to(e.args[0], 'Number') : Num(0)]);
    if (e.name === 'toPrecision') return e.args.length ? Prim('num_to_precision', [to(e.obj, 'Number'), to(e.args[0], 'Number')]) : toStr(e.obj);
    if ((o === 'String' || o === 'Any') && m) {
      const recv = to(e.obj, 'String');
      if (m.op === 'id') return recv;
      const args = m.args.map((want, k) => (k < e.args.length && k < m.args.length - (m.fixed ?? 0) ? to(e.args[k], want) : m.defaults[k]));
      return Prim(m.op, [recv, ...args]);
    }
    if (isRecordType(o)) {
      const fields = recordFields(o), k = fields.findIndex(([n]) => n === e.name), ft = fields[k][1];
      const fn = { ...Index(exp(e.obj), Int(k + 1)), unchecked: true, fieldType: ft, ty: ft };
      if (ft === 'Any') {   // CJI-3: a dynamic field holding the function, called dynamically
        if (e.args.length <= MAX_DYNAMIC_ARITY) return dynCall(fn, e.args.map((a) => to(a, 'Any')));
        const t = dynamicFunctionType(e.args.length);
        return { kind: 'Call', fn: cast(fn, 'Any', t), args: e.args.map((a) => to(a, 'Any')), type: 'Any', fnType: t, ty: 'Any' };
      }
      const { params, ret } = functionParts(ft);
      return { kind: 'Call', fn, args: params.map((q, j) => (j < e.args.length ? to(e.args[j], q) : AnyLit(undefined))), type: ret, fnType: ft, ty: ret };
    }
    if (isArrayType(o) && e.name === 'join') {
      const kind = { Int: 0, Number: 1, String: 2, Bool: 3, Any: 4 }[elementType(o)];
      return Prim('arr_join', [exp(e.obj), e.args.length ? to(e.args[0], 'String') : Str(','), Int(kind)]);
    }
    if (o === 'Any') return dynamicField(e);   // chapter 16: a dynamic object's function field, called dynamically
    return toStr(e.obj);   // a number's or a boolean's toString()
  }
  function dynamicField(e) {
    const t = dynamicFunctionType(e.args.length);
    const f = Prim('any_get', [exp(e.obj), Str(e.name)]);
    if (e.args.length <= MAX_DYNAMIC_ARITY) return dynCall(f, e.args.map((a) => to(a, 'Any')));   // chapter 23
    return { kind: 'Call', fn: cast(f, 'Any', t), args: e.args.map((a) => to(a, 'Any')), type: 'Any', fnType: t, ty: 'Any' };
  }

  function stmt(s) {
    switch (s.kind) {
      case 'Print': return (probe(s.arg) ? { ...s, arg: readAny(s.arg), type: 'Any' } : { ...s, arg: exp(s.arg) });   // (chapter 23: a read past the end prints undefined)
      case 'Const': case 'Let':
        if (s.init.kind === 'Hoisted') {   // chapter 16: never read before it is assigned
          const zero = { Int: Int(0), Number: Num(0), Bool: Bool(false), String: Str('') }[s.type] ?? (isPointerType(s.type) && s.type !== 'Any' ? Int(0) : AnyLit(undefined));
          return { ...s, init: zero };
        }
        return { ...s, init: to(s.init, s.type) };
      case 'ExprStmt': return ExprStmt(exp(s.exp));
      case 'Return': return Return(to(s.arg, returnType));
      case 'Block': return Block(s.body.map(stmt));
      case 'IfStmt': return IfStmt(cond(s.cond), stmt(s.thn), s.els && stmt(s.els));
      case 'While': return { ...s, cond: cond(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
      case 'Break': case 'Continue': return s;
      case 'Throw': return { ...s, arg: to(s.arg, 'Any') };   // chapter 14
      case 'Try': return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      case 'FunDef': {
        const outer = returnType;
        returnType = s.retType;
        const body = s.body.map(stmt);
        returnType = outer;
        return FunDef(s.name, s.params, s.retType, body);
      }
      default:
        throw new Error(`cast_insert: unexpected ${s.kind}`);
    }
  }

  const body = p.body.map(stmt);
  return { ...p, body: [...dynCalls.values(), ...reads.values(), ...body] };
}

export { mapDefs };

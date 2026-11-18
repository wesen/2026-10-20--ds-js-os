// Dynamic values (chapter 9): what they mean, how they are encoded, and the interpreters
// for the languages that have them.
//
// A value of type Any can be any JavaScript value of the subset: a number (a double, not
// only an integer), true or false, undefined, null, an array of Any, or a function whose
// parameters and result are Any. The compiled program keeps it in one 64-bit word,
// "NaN-boxed" the way JavaScriptCore does it, favouring pointers:
//
//   a pointer                  the address itself: the top 16 bits are 0
//   a number                   the bits of its double, plus 2^49: the top 16 bits are 2 or more
//   false, true                6, 7
//   null, undefined            2, 10
//
// A double plus 2^49 never has its top 16 bits all 0 (the one double that would wrap
// around, a NaN with every bit set, is replaced by the canonical NaN first), so the three
// cases never overlap. A pointer needs no decoding at all, and neither the collector nor
// the code that passes values around has to know which words are dynamic.

import { CLASSES, TYPED_KINDS } from './classes.js';
import { inspect } from 'node:util';   // chapter 20: how console.log writes arrays and objects
import { MATH, MATH_OPS, MATH_OP_NAMES, HOST_MATH, hostNow } from './math.js';
import { STRING_METHODS, STRING_OPS, StringTrap } from './strings.js';
import { lowerAsync, usesAsync } from './async.js';
import { lowerRest, usesRest } from './spread.js';
import { uniquify } from './uniquify.js';
import { keyOrder, literalOrder } from './types.js';
import { InterpLLambda, InterpCLambda, Trap, OutsideSubset, arith, prim, UNINIT, emit, checkInt, Thrown, ERROR_NAMES, makeError } from './interp.js';

export const ANY_NULL = 2, ANY_FALSE = 6, ANY_TRUE = 7, ANY_UNDEFINED = 10;
export const ANY_HOLE = 14;   // chapter 19: an absent property's mark, which no dynamic value is
const OFFSET = 1n << 49n;
const view = new DataView(new ArrayBuffer(8));

// A number's word, as a signed 64-bit BigInt (SLIR's immediates are signed).
export function encodeNumber(d) {
  view.setFloat64(0, d);
  const bits = Number.isNaN(d) ? 0x7ff8000000000000n : view.getBigUint64(0);
  return BigInt.asIntN(64, bits + OFFSET);
}

export function decodeNumber(w) {
  view.setBigUint64(0, BigInt.asUintN(64, BigInt(w) - OFFSET));
  return view.getFloat64(0);
}

// Chapter 10: a Number is the 64 bits of its double, with no offset, as a signed BigInt.
export function doubleBits(d) {
  view.setFloat64(0, d);
  return BigInt.asIntN(64, Number.isNaN(d) ? 0x7ff8000000000000n : view.getBigUint64(0));
}
export function bitsDouble(w) {
  view.setBigUint64(0, BigInt.asUintN(64, BigInt(w)));
  return view.getFloat64(0);
}

// The word for a constant of type Any (an AnyLit).
export function encodeConstant(v) {
  if (v === undefined) return ANY_UNDEFINED;
  if (v === HOLE) return ANY_HOLE;   // chapter 20: a field the object does not have
  if (v === null) return ANY_NULL;
  return encodeNumber(v);
}

// What typeof answers, as the small integer any_typeof returns.
export const TYPEOF = { undefined: 0, boolean: 1, number: 2, object: 3, function: 4, string: 5 };

// The messages of the run-time errors a dynamic program can stop with. runtime.c prints
// the same ones.
export const TYPE_ERROR = {
  Int: 'type error: expected an integer',
  Number: 'type error: expected a number',
  Bool: 'type error: expected a boolean',
  array: 'type error: expected an array',
  fn: (n) => `type error: expected a function of ${n} argument${n === 1 ? '' : 's'}`,
  number: 'an array or function used as a number is outside the subset',
  print: 'console.log of an array or function is outside the subset',
  String: 'type error: expected a string',
  record: 'type error: expected an object with other fields',
  string: 'an array, function or object used as a string is outside the subset',
};

// What console.log prints for a number (Node prints -0 as -0).
export const formatNumber = (x) => (Object.is(x, -0) ? '-0' : String(x));

// ---- the operations, on the interpreters' values ------------------------------------
//
// The interpreters represent a dynamic value as the JavaScript value itself. A function is
// an object with a `fun` field (before closure conversion), or an array marked as a
// closure (after it).

export function isFunction(v) {
  if (v === null || typeof v !== 'object') return false;
  return Array.isArray(v) ? v.isClosure === true : 'fun' in v;
}
export const isArray = (v) => Array.isArray(v) && !isFunction(v) && !v.isRecord;
// Chapter 13: a record is an array [names, ...fields] marked isRecord; names is its shape.
export const isRecord = (v) => Array.isArray(v) && v.isRecord === true;
// A shape's names; one list per shape, flagged for an Error's (chapter 14).
const errorShapes = new Map();
export function shapeNames(names, error) {
  if (!error) return names;
  const key = names.join(',');
  if (key === ERROR_NAMES.join(',')) return ERROR_NAMES;
  if (!errorShapes.has(key)) errorShapes.set(key, Object.assign([...names], { error: true }));
  return errorShapes.get(key);
}
export function makeRecord(names, values) {
  const r = [names, ...values];
  r.isRecord = true;
  return r;
}
// Chapter 19: the properties added to a record at run time are in its Map `extra`, in the
// order they were added; a deleted field holds undefined, and HOLE in `extra` says it is gone.
export const HOLE = { deleted: true };   // (a unique object: only its identity matters)
// Chapter 22: before instantiate_library, the interpreters run a library class's instance as
// JavaScript's own object (a Map, a Set, a Date, a typed array), an oracle for the class's
// library code as JavaScript's array methods are for chapter 15's; the brand is the field
// the library's code tests for.
export const isClassObject = (v) => v instanceof Map || v instanceof Set || v instanceof Date || ArrayBuffer.isView(v);
const brandOf = (v) => (v instanceof Map ? '$mk' : v instanceof Set ? '$sv' : v instanceof Date ? '$date' : CLASSES[v.constructor.name]?.brand);
function newClassObject(name, args) {
  if (name === 'Date' && args.length === 1 && typeof args[0] === 'string') throw new Thrown(makeError('TypeError', 'new Date(string) is outside the subset'));
  if (name === 'Date' && args.length === 0) return new Date(hostNow());   // (chapter 23: a world's virtual clock)
  if (name === 'Date') return new Date(...args.map((a) => (a instanceof Date ? a : a === null || typeof a === 'boolean' ? Number(a) : a)));
  return new globalThis[name](...args);
}
export function getField(o, name) {
  if (isClassObject(o)) return o instanceof Date ? (name === '$date' ? o.getTime() : undefined) : name === 'size' || name === 'length' ? o[name] : undefined;
  if (isRecord(o)) {
    if (o.extra?.has(name)) { const v = o.extra.get(name); return v === HOLE ? undefined : v; }
    const k = o[0].indexOf(name);
    return k >= 0 && o[k + 1] !== HOLE ? o[k + 1] : undefined;   // (chapter 20: HOLE, a field it lacks)
  }
  if (typeof o === 'string' || isArray(o)) return name === 'length' ? o.length : undefined;
  if (o === null || o === undefined) throw new Thrown(makeError('TypeError', nullRead(o, name)));   // chapter 23
  return undefined;
}
export function setField(o, name, v) {
  if (isArray(o) && name === 'length') return STRING_OPS.arr_resize(o, toNumber(v), undefined);   // chapter 15
  if (!isRecord(o)) throw new Trap(`setting .${name} of a value that is not an object is outside the subset`);
  const k = o[0].indexOf(name), x = o.extra?.get(name);
  if (k >= 0 && !o.extra?.has(name)) o[k + 1] = v;
  else {   // (a deleted name made again comes last)
    if (x === HOLE) o.extra.delete(name);
    (o.extra ??= new Map()).set(name, v);
  }
  return v;
}
// Chapter 19: o[k], o[k] = v, delete o[k], k in o and Object.keys(o) of dynamic values
const keyOf = (k) => (typeof k === 'string' ? k : toStringJS(k));
function indexable(o, k) {
  if (!((isArray(o) || typeof o === 'string') && typeof k === 'number')) return false;
  const i = projectInt(k);
  if (typeof o === 'string') return true;
  if (i < 0 || i >= o.length) throw new Trap(`index out of range: ${i} in an array of length ${o.length}`);
  return true;
}
// Chapter 23: V8's text for a property of null or undefined (the runtime's, with the key)
const nullRead = (o, name) => `Cannot read properties of ${o}${name === null || name.length > 120 ? '' : ` (reading '${name}')`}`;
// CJI-3: a typed array after instantiate_library is a record { $u32: items, length: n } (classes.js
// typed); as a dynamic value, o[k] and o[k] = v are its items', a write converted as its kind
// converts and one outside it ignored, as in JavaScript (runtime.c typed_kind)
export const TYPED_CONV = { $u8: (n) => n & 255, $i8: (n) => (n << 24) >> 24, $i16: (n) => (n << 16) >> 16, $u16: (n) => n & 65535,
  $i32: (n) => n | 0, $u32: (n) => n >>> 0, $f32: Math.fround, $f64: (n) => n,
  $c8: (v) => { if (!(v > 0)) return 0; if (v >= 255) return 255; const f = Math.floor(v), d = v - f; return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1; } };
const typedRecord = (o) => isRecord(o) && TYPED_KINDS.some(([, b]) => b === o[0][0]) && isArray(o[1]);
export function anyIndex(o, k) {
  if (typeof k === 'number' && typedRecord(o)) return Number.isInteger(k) && k >= 0 && k < o[1].length ? o[1][k] : undefined;
  if (ArrayBuffer.isView(o) && typeof k === 'number') {   // chapter 22: a typed array's element; past the end stops, as an array's
    if (k < 0 || k >= o.length) throw new Trap(`index out of range: ${k} in an array of length ${o.length}`);
    return o[k | 0];
  }
  if ((isArray(o) || typeof o === 'string') && typeof k === 'number') {
    // chapter 23: past the end (or not a whole number) is undefined
    if (!(Number.isInteger(k) && k >= 0 && k < o.length)) return undefined;
    return typeof o === 'string' ? DYN_OPS.str_index(o, k) : o[k];
  }
  if (o === null || o === undefined) throw new Thrown(makeError('TypeError', nullRead(o, typeof k === 'string' || typeof k === 'number' ? String(k) : null)));   // chapter 23
  return getField(o, keyOf(k));
}
export function anySetIndex(o, k, v) {
  if (typeof k === 'number' && typedRecord(o)) { if (Number.isInteger(k) && k >= 0 && k < o[1].length) o[1][k] = TYPED_CONV[o[0][0]](toNumber(v)); return v; }
  if (ArrayBuffer.isView(o)) { o[k] = toNumber(v); return v; }   // chapter 22: converted; past the end ignored
  if (isArray(o) && indexable(o, k)) { o[k] = v; return v; }
  if (!isRecord(o)) throw new Trap('setting a property of a value that is not an object is outside the subset');
  return setField(o, keyOf(k), v);
}
export function anyDelete(o, k) {
  if (!isRecord(o)) return true;
  const name = keyOf(k), f = o[0].indexOf(name);
  o.extra?.delete(name);
  if (f >= 0) {
    o[f + 1] = undefined;
    (o.extra ??= new Map()).set(name, HOLE);
  }
  return true;
}
export function anyIn(k, o) {
  if (isClassObject(o)) return keyOf(k) === brandOf(o);   // chapter 22
  if (isArray(o)) return (typeof k === 'number' && Number.isInteger(k) && k >= 0 && k < o.length) || k === 'length';
  if (!isRecord(o)) throw new Trap("TypeError: 'in' needs an object");
  const name = keyOf(k);
  const f = o[0].indexOf(name);
  return o.extra?.has(name) ? o.extra.get(name) !== HOLE : f >= 0 && o[f + 1] !== HOLE;
}
// JavaScript's order of an object's keys: integer keys first, ascending, then the others as
// they were made (Array.prototype.sort is stable)
const integerKey = (n) => /^(0|[1-9][0-9]*)$/.test(n) && Number(n) < 2 ** 32 - 1;
export const jsKeyOrder = (ks) => ks.sort((a, b) => (integerKey(a) ? (integerKey(b) ? a - b : -1) : integerKey(b) ? 1 : 0));
export function anyKeys(o) {
  if (isRecord(o)) return jsKeyOrder([...o[0].filter((n, k) => !o.extra?.has(n) && o[k + 1] !== HOLE), ...[...(o.extra ?? new Map())].filter(([, v]) => v !== HOLE).map(([n]) => n)]);
  if (isArray(o) || typeof o === 'string') return Array.from({ length: o.length }, (_, i) => String(i));
  if (o === null || o === undefined) throw new Trap('TypeError: cannot convert undefined or null to object');
  return [];
}
// JavaScript's ToString, on the subset's values.
export function toStringJS(v) {
  if (typeof v === 'string') return v;
  if (isRecord(v) && v[0].error) {   // chapter 14: Error.prototype.toString
    const name = getField(v, 'name'), msg = getField(v, 'message');
    const n = name === undefined ? 'Error' : toStringJS(name), m = msg === undefined ? '' : toStringJS(msg);
    return n === '' ? m : m === '' ? n : `${n}: ${m}`;
  }
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
  throw new Trap(TYPE_ERROR.string);
}
// JavaScript's ToNumber of a string: its numeric literal, or NaN.
export const stringToNumber = (s) => Number(s);
// s.name(args) on the interpreters' values (chapter 13)
const ARRAY_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'map', 'forEach', 'filter', 'flatMap', 'flat', 'reduce',
  'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'indexOf', 'lastIndexOf', 'includes', 'slice', 'fill',
  'reverse', 'at', 'concat', 'sort']);
// Array.from, Array.isArray, new Array (chapter 15)
export function libCall(name, args, call) {
  if (name.startsWith('new ')) return newClassObject(name.slice(4), args);   // chapter 22
  if (name === 'Array.isArray') return isArray(args[0]);
  if (name === 'Array') return new Array(toNumber(args[0]));
  const [x, f] = args, fn = f && ((...xs) => call(f, xs.slice(0, arityOf(f))));
  if (isRecord(x)) return Array.from({ length: getField(x, 'length') }, fn);
  return fn ? Array.from(x, fn) : Array.from(x);
}

export function callMethod(o, name, args, call) {
  if (o === null || o === undefined) throw new Thrown(makeError('TypeError', nullRead(o, name)));   // chapter 23
  if (name === '$items') return isClassObject(o) && !(o instanceof Date) ? Array.from(o) : o;   // chapter 22: for...of
  if (isClassObject(o)) {   // chapter 22: a library class's method, as JavaScript's own
    const cls = o instanceof Map ? 'Map' : o instanceof Set ? 'Set' : o.constructor.name;
    if (!CLASSES[cls]?.methods[name] || name.startsWith('$')) throw new Trap(`.${name}() is not a method of a ${cls} in this subset`);
    const js = args.map((a) => (isFunction(a) ? (...xs) => call(a, xs.slice(0, arityOf(a))) : a));
    let r;
    try { r = o[name](...js); } catch (e) {   // (JavaScript's own errors, as the program's)
      if (e instanceof RangeError || e instanceof TypeError) throw new Thrown(makeError(e.name, e.message));
      throw e;
    }
    return ['keys', 'values', 'entries'].includes(name) ? Array.from(r) : r;   // (arrays in the subset, not iterators)
  }
  const m = STRING_METHODS[name];
  if (name === 'toString' && args.length === 0 && typeof o !== 'string') return toStringJS(o);   // chapter 14: an Error's too
  if (typeof o === 'string' && m) {
    if (m.op === 'id') return o;
    const full = m.args.map((_, k) => (k < args.length && k < m.args.length - (m.fixed ?? 0) ? args[k] : m.defaults[k].value));
    const conv = full.map((a, k) => (m.args[k] === 'Number' ? toNumber(a) : m.args[k] === 'String' ? toStringJS(a) : a));
    try {
      return STRING_OPS[m.op](o, ...conv);
    } catch (e) {
      if (e instanceof StringTrap) throw new Trap(e.message);
      throw e;
    }
  }
  if (isRecord(o)) {
    const f = getField(o, name);
    if (!isFunction(f)) throw new Trap(`TypeError: .${name} is not a function`);
    return call(f, args);
  }
  if (isArray(o) && name === 'join') return joinArray(o, args.length ? toStringJS(args[0]) : ',');
  // chapter 17: the parser's forms of push(...xs), unshift(...xs) and splice(s, n, ...xs)
  if (isArray(o) && name === 'pushArray') return o.push(...args[0]);
  if (isArray(o) && name === 'unshiftArray') return o.unshift(...args[0]);
  if (isArray(o) && name === 'spliceArray') return o.splice(toNumber(args[0]), toNumber(args[1]), ...args[2]);
  // chapter 15: the array methods, as JavaScript's own; a callback takes the arguments it names
  if (isArray(o) && ARRAY_METHODS.has(name)) {
    const js = args.map((a) => (isFunction(a) ? (...xs) => call(a, xs.slice(0, arityOf(a))) : a));
    if (name === 'sort' && args.length === 0) return o.sort((x, y) => { const a = toStringJS(x), b = toStringJS(y); return a < b ? -1 : b < a ? 1 : 0; });
    return o[name](...js);
  }
  if (typeof o === 'number' && name === 'toString' && args.length === 1) return STRING_OPS.num_to_radix(o, toNumber(args[0]));   // chapter 14
  if (typeof o === 'number' && name === 'toFixed') return STRING_OPS.num_to_fixed(o, args.length ? toNumber(args[0]) : 0);   // chapter 21
  if (typeof o === 'number' && name === 'toPrecision') return args.length ? STRING_OPS.num_to_precision(o, toNumber(args[0])) : String(o);
  if ((typeof o === 'number' || typeof o === 'boolean') && name === 'toString') return String(o);
  if (ARRAY_METHODS.has(name)) throw new Trap(TYPE_ERROR.array);   // chapter 15: as the library's array copy
  if (m) throw new Trap(TYPE_ERROR.String);   // as the compiled program's projection to String
  throw new Trap(`.${name}() is not a method of this value in the subset`);
}
const joinArray = (a, sep) => a.map((x) => (x === null || x === undefined ? '' : toStringJS(x))).join(sep);
const arityOf = (v) => (Array.isArray(v) ? v[0].arity - 1 : v.def ? v.def.params.length : v.arity);

export function toNumber(v) {
  switch (typeof v) {
    case 'number': return v;
    case 'boolean': return v ? 1 : 0;
    case 'undefined': return NaN;
    case 'string': return stringToNumber(v);   // chapter 13
    default:
      if (v === null) return 0;
      throw new Trap(TYPE_ERROR.number);
  }
}

export const truthy = (v) => !!v;

export function typeOf(v) {
  if (v === null || isArray(v) || isRecord(v)) return 'object';
  if (isFunction(v)) return 'function';
  return typeof v;
}

export function display(v) {
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return v;   // chapter 13
  if (v === null || v === undefined || typeof v === 'boolean') return String(v);
  if (isArray(v) || isRecord(v) || isClassObject(v)) return inspect(plain(v));   // chapter 20: Node's own format (chapter 22: a class's too)
  throw new Trap(TYPE_ERROR.print);
}
// Chapter 20: an interpreted array or record as the JavaScript value it stands for, for
// util.inspect (a plain object lists integer keys first, as anyKeys does)
function plain(v) {
  if (isFunction(v)) throw new Trap(TYPE_ERROR.print);
  if (isRecord(v)) {
    const ks = anyKeys(v);
    if (ks.length === 1 && ks[0] === '$date' && typeof getField(v, '$date') === 'number') return new Date(getField(v, '$date'));   // chapter 21
    const o = {};
    for (const k of ks) o[k] = plain(getField(v, k));
    return o;
  }
  if (isArray(v)) return v.map(plain);
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [plain(k), plain(x)]));   // chapter 22
  if (v instanceof Set) return new Set([...v].map(plain));
  return v;
}

// Chapter 10: JavaScript's ==, on the values of the subset. null and undefined equal each
// other and nothing else; numbers and booleans compare as numbers; an array or function
// equals only itself, and comparing one with a number or boolean (where JavaScript would
// turn the array into a string) is outside the subset.
export const OUTSIDE_EQ = '== between an array or function and a number or boolean is outside the subset';
export function looseEquals(a, b) {
  const nullish = (x) => x === null || x === undefined;
  if (nullish(a) || nullish(b)) return nullish(a) && nullish(b);
  if (typeof a === 'string' && typeof b === 'string') return a === b;   // chapter 13
  const prim = (x) => typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string';
  if (prim(a) && prim(b)) return Number(a) === Number(b);
  if (prim(a) || prim(b)) throw new Trap(OUTSIDE_EQ);
  return a === b;
}

export function projectInt(v) {
  if (!Number.isSafeInteger(v)) throw new Trap(TYPE_ERROR.Int);
  return v === 0 ? 0 : v;           // -0 becomes the integer 0
}

// The operators cast_insert introduces. Each is a Prim; select_instructions turns most of
// them into calls of runtime.c's functions of the same meaning.
export const DYN_OPS = {
  'any+': (a, b) => (typeof a === 'string' || typeof b === 'string' || isRecord(a) || isRecord(b) ? toStringJS(a) + toStringJS(b) : toNumber(a) + toNumber(b)),   // (chapter 13: concatenation)
  'any-': (a, b) => toNumber(a) - toNumber(b),
  'any*': (a, b) => toNumber(a) * toNumber(b),
  'any/': (a, b) => toNumber(a) / toNumber(b),
  anyneg: (a) => -toNumber(a),
  'any<': (a, b) => (typeof a === 'string' && typeof b === 'string' ? a < b : toNumber(a) < toNumber(b)),   // (chapter 22: two strings by code units)
  'any<=': (a, b) => (typeof a === 'string' && typeof b === 'string' ? a <= b : toNumber(a) <= toNumber(b)),   // (chapter 22: two strings by code units)
  'any>': (a, b) => (typeof a === 'string' && typeof b === 'string' ? a > b : toNumber(a) > toNumber(b)),   // (chapter 22: two strings by code units)
  'any>=': (a, b) => (typeof a === 'string' && typeof b === 'string' ? a >= b : toNumber(a) >= toNumber(b)),   // (chapter 22: two strings by code units)
  'any===': (a, b) => a === b,
  truthy,
  inject_Int: (a) => a,
  inject_Bool: (a) => a,
  inject: (a) => a,
  project_Int: projectInt,
  project_Bool: (a) => {
    if (typeof a !== 'boolean') throw new Trap(TYPE_ERROR.Bool);
    return a;
  },
  project_array: (a) => {
    if (!isArray(a)) throw new Trap(TYPE_ERROR.array);
    return a;
  },
  // chapter 10: numbers. A Number is a JavaScript number; an Int one known to be an integer.
  'any%': (a, b) => toNumber(a) % toNumber(b),
  'any**': (a, b) => toNumber(a) ** toNumber(b),
  'num**': (a, b) => a ** b,
  'any==': looseEquals,
  // chapter 13: strings and records
  ...STRING_OPS,
  int_to_str: (n) => String(n),
  num_to_radix: (n, r) => STRING_OPS.num_to_radix(n, r),
  num_to_fixed: (n, d) => STRING_OPS.num_to_fixed(n, d), num_to_precision: (n, d) => STRING_OPS.num_to_precision(n, d),   // chapter 21
  any_is_array: (v) => isArray(v),   // chapter 15
  any_arity: (f) => (isFunction(f) ? arityOf(f) : 0),   // chapter 16
  any_length: (v) => {
    if (v === null || v === undefined) throw new Thrown(makeError('TypeError', nullRead(v, 'length')));   // chapter 24
    if (isRecord(v) && typeof getField(v, 'length') === 'number') return getField(v, 'length');   // (CJI-3: an object's, a typed array's)
    return typeof v === 'string' ? v.length : DYN_OPS.project_array(v).length;
  },
  num_to_str: (x) => String(x),
  bool_to_str: (b) => String(b),
  any_to_str: toStringJS,
  str_eq: (a, b) => a === b,
  'str<': (a, b) => a < b,
  'str<=': (a, b) => a <= b,
  'str>': (a, b) => a > b,
  'str>=': (a, b) => a >= b,
  str_length: (s) => s.length,
  str_index: (s, i) => {
    if (i < 0 || i >= s.length) throw new Trap(`index out of range: ${i} in a string of length ${s.length}`);
    return s[i];
  },
  any_typeof_str: (v) => typeOf(v),
  project_String: (v) => {
    if (typeof v !== 'string') throw new Trap(TYPE_ERROR.String);
    return v;
  },
  project_record: (v, names) => {
    if (!isRecord(v) || v[0].length !== names.length || v[0].some((n, k) => n !== names[k])) throw new Trap(TYPE_ERROR.record);
    return v;
  },
  any_get: getField,
  any_set: setField,
  any_index: anyIndex, any_set_index: anySetIndex, any_delete: anyDelete, any_in: anyIn, any_keys: anyKeys,   // chapter 19
  any_unhole: (v) => (v === HOLE ? undefined : v),   // chapter 20: a typed read of a field that may be absent
  arr_join: (a, sep) => joinArray(a, sep),
  'num+': (a, b) => a + b,
  'num-': (a, b) => a - b,
  'num*': (a, b) => a * b,
  'num/': (a, b) => a / b,
  'num%': (a, b) => a % b,
  numneg: (a) => -a,
  'num<': (a, b) => a < b,
  'num<=': (a, b) => a <= b,
  'num>': (a, b) => a > b,
  'num>=': (a, b) => a >= b,
  'num===': (a, b) => a === b,
  'num!==': (a, b) => a !== b,
  int_to_num: (a) => a,
  num_to_int32: (a) => a | 0,
  num_to_int: projectInt,
  any_to_int32: (a) => toNumber(a) | 0,
  inject_Number: (a) => a,
  project_Number: (a) => {
    if (typeof a !== 'number') throw new Trap(TYPE_ERROR.Number);
    return a;
  },
  '&': (a, b) => a & b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
  '~': (a) => ~a,
  project_fn: (a, n) => {
    if (!isFunction(a) || arityOf(a) !== n) throw new Trap(TYPE_ERROR.fn(n));
    return a;
  },
};
for (const k of Object.keys(TYPEOF)) DYN_OPS[`typeof=${k}`] = (a) => typeOf(a) === k;
Object.assign(DYN_OPS, MATH_OPS);   // chapter 10
if (Object.keys(MATH_OPS).join() !== MATH_OP_NAMES.join()) throw new Error('src/math.js: MATH_OP_NAMES is not MATH_OPS\'s keys');

// chapter 21: the operators of no operand, the host's clock
export const NULLARY = new Set(['Math.$now', 'date_now']);
export const UNARY = new Set(['neg', '!', 'length', 'anyneg', 'truthy', 'inject_Int', 'inject_Bool', 'inject',
  'project_Int', 'project_Bool', 'project_array', ...Object.keys(TYPEOF).map((k) => `typeof=${k}`),
  '~', 'numneg', 'int_to_num', 'num_to_int', 'num_to_int32', 'any_to_int32', 'inject_Number', 'project_Number',
  ...Object.keys(MATH_OPS).filter((k) => MATH_OPS[k].length === 1 && !['num_min', 'num_max', 'int_min', 'int_max', 'math_hypot', 'math_atan2', 'math_imul'].includes(k)),
  ...Object.keys(MATH).filter((k) => MATH[k].arity === 1).map((k) => `Math.${k}`)]);

// An operator of the source language, applied with JavaScript's meaning. When every
// operand is an integer the typed meaning applies (results must stay safe integers);
// otherwise the operands are numbers, booleans, undefined or null, converted as
// JavaScript converts them.
// An integer of the subset: a safe integer, and not -0 (which only a double can be).
const isInt = (v) => Number.isSafeInteger(v) && !Object.is(v, -0);

// Chapter 24: a native world's system calls. Only a world running in picocalc-os has a kernel
// to call; an embedder (a test) may give the interpreters one.
let HOST = null;
export function setHost(h) { HOST = h; }
const hostOp = (op, args) => {
  if (!HOST) throw new Trap('host calls run only in a world inside picocalc-os');
  return HOST[op](...args);
};
function sourcePrim(op, args) {
  if (op === 'host_arg' || op === 'host_call' || op === 'host_event') return hostOp(op, args);   // chapter 24
  if (op === 'host_entries') return 0;   // (the embedder's: nothing calls them here)
  if (op === 'Array.isArray') return isArray(args[0]);   // chapter 15
  if (op === 'fn_arity') return isFunction(args[0]) ? arityOf(args[0]) : 0;   // chapter 16
  if (op === 'is_undefined') return args[0] === undefined;   // chapter 17
  if (op === 'any_delete' || op === 'any_in' || op === 'any_keys') return DYN_OPS[op](...args);   // chapter 19
  // chapter 13: strings
  if (op === 'String') return toStringJS(args[0]);
  if (op === 'typeof') return typeOf(args[0]);
  if (op === 'String.fromCharCode') return String.fromCharCode(toNumber(args[0]));
  if (op === '+' && (typeof args[0] === 'string' || typeof args[1] === 'string')) return toStringJS(args[0]) + toStringJS(args[1]);
  if (['<', '<=', '>', '>='].includes(op) && typeof args[0] === 'string' && typeof args[1] === 'string')
    return DYN_OPS[`str${op}`](...args);
  if (op === 'length' && typeof args[0] === 'string') return args[0].length;
  if (op === 'length' && (args[0] === null || args[0] === undefined)) return DYN_OPS.any_length(args[0]);   // (chapter 24: a TypeError)
  // the bitwise operators convert their operands as ToNumber does first (chapter 10)
  if (['&', '|', '^', '<<', '>>', '>>>', '~'].includes(op)) return DYN_OPS[op](...args.map(toNumber));
  if (DYN_OPS[op]) return DYN_OPS[op](...args);
  if (op.startsWith('Math.') && op !== 'Math.clz32' && op !== 'Math.imul') {   // chapter 10
    const r = (HOST_MATH[op.slice(5)] ?? Math[op.slice(5)])(...args.map(toNumber));   // (chapter 21: the host's, $now and $tz)
    return args.every(isInt) && MATH[op.slice(5)].int ? checkInt(r) : r;
  }
  switch (op) {
    case '%':
      return DYN_OPS['any%'](...args);
    case 'neg': case '+': case '-': case '*':
      // chapter 12: JavaScript's arithmetic, always. An integer that leaves the safe range,
      // or becomes -0, is a double, as in JavaScript; the ranges decide which operations
      // the compiled code may do on integers.
      return DYN_OPS[op === 'neg' ? 'anyneg' : `any${op}`](...args);
    case '/':
      return DYN_OPS['any/'](...args);
    case '**':
      return DYN_OPS['any**'](...args);
    case 'Math.clz32': case 'Math.imul':
      return Math[op.slice(5)](...args.map(toNumber));
    case '==': case '!=':
      return looseEquals(...args) === (op === '==');
    case '<': case '<=': case '>': case '>=':
      return DYN_OPS[`any${op}`](...args);
    case '!':
      return !args[0];
    case 'length':
      if (ArrayBuffer.isView(args[0])) return args[0].length;   // chapter 22: a typed array's
      if (typedRecord(args[0])) return getField(args[0], 'length');   // (CJI-3: one after instantiate_library)
      return DYN_OPS.project_array(args[0]).length;
    default:
      return prim(op, ...args);
  }
}

// ---- the interpreters ---------------------------------------------------------------

// L_Dyn: the source language of chapter 9, and every stage down to explicate_control.
// The same class runs programs before cast insertion, where + may meet a double or
// undefined, and after it, where every such + has become any+.
export class InterpLDyn extends InterpLLambda {
  interpExp(e, env) {
    switch (e.kind) {
      case 'AnyLit':
      case 'Num':
      case 'Str':
        return e.value;
      case 'Hoisted':   // chapter 16
        return undefined;
      // chapter 13: records and methods
      case 'Shape':
        return shapeNames(e.names, e.error);
      case 'Record': {
        const vals = new Map(e.fields.map((f) => [f.name, this.interpExp(f.exp, env)]));
        // chapter 19: in the type's key order (chapter 23: or, for a table's literal and before
        // inference has given it a type, its own, as in JavaScript)
        const names = e.ownOrder || e.type === undefined ? literalOrder([...vals.keys()]) : keyOrder([...vals.keys()]);
        return makeRecord(shapeNames(names, e.error), names.map((n) => vals.get(n)));
      }
      case 'ArrayLit':
        if (e.record) {
          const vals = e.elems.map((x) => this.interpExp(x, env)), r = new Array(vals.length);
          e.slots.forEach((slot, k) => { r[slot] = vals[k]; });
          r.isRecord = true;
          return r;
        }
        return super.interpExp(e, env);
      case 'Get':
        return getField(this.interpExp(e.obj, env), e.name);
      case 'SetProp': {
        const o = this.interpExp(e.obj, env), v = this.interpExp(e.exp, env);
        return setField(o, e.name, v);
      }
      case 'MethodCall': {
        const o = this.interpExp(e.obj, env), args = e.args.map((a) => this.interpExp(a, env));
        return callMethod(o, e.name, args, (f, a) => this.callFunction(f, a));
      }
      case 'LibCall':   // chapter 15
        return libCall(e.name, e.args.map((a) => this.interpExp(a, env)), (f, a) => this.callFunction(f, a));
      case 'Prim': {
        // && and || give back an operand, as in JavaScript, not only true or false
        if (e.op === '&&' || e.op === 'any&&') {
          const a = this.interpExp(e.args[0], env);
          return truthy(a) ? this.interpExp(e.args[1], env) : a;
        }
        if (e.op === '||' || e.op === 'any||') {
          const a = this.interpExp(e.args[0], env);
          return truthy(a) ? a : this.interpExp(e.args[1], env);
        }
        if (e.op === '??' || e.op === 'any??') {   // chapter 10: the right only for null or undefined
          const a = this.interpExp(e.args[0], env);
          return a === null || a === undefined ? this.interpExp(e.args[1], env) : a;
        }
        return sourcePrim(e.op, e.args.map((a) => this.interpExp(a, env)));
      }
      case 'Index': {
        if (e.unchecked) return super.interpExp(e, env);      // a box, or a record's field
        const a = this.interpExp(e.arr, env), i = this.interpExp(e.idx, env);
        if (isRecord(a) || typeof i !== 'number' || ArrayBuffer.isView(a) || a === null || a === undefined) return anyIndex(a, i);   // chapter 19 (chapter 22: a typed array; chapter 23: null)
        // chapter 23: past the end of an array or a string is undefined, as in JavaScript
        if ((isArray(a) || typeof a === 'string') && !(Number.isInteger(i) && i >= 0 && i < a.length)) return undefined;
        if (typeof a === 'string') return DYN_OPS.str_index(a, projectInt(i));   // chapter 13
        DYN_OPS.project_array(a);
        projectInt(i);
        return super.interpExp({ ...e, arr: { kind: 'AnyLit', value: a }, idx: { kind: 'AnyLit', value: i } }, env);
      }
      case 'SetIndex': {
        if (e.unchecked) return super.interpExp(e, env);
        const a = this.interpExp(e.arr, env), i = this.interpExp(e.idx, env);
        if (isRecord(a) || typeof i !== 'number' || ArrayBuffer.isView(a)) return anySetIndex(a, i, this.interpExp(e.exp, env));   // chapter 19 (chapter 22)
        DYN_OPS.project_array(a);
        projectInt(i);
        return super.interpExp({ ...e, arr: { kind: 'AnyLit', value: a }, idx: { kind: 'AnyLit', value: i } }, env);
      }
      case 'Call': {
        const f = this.interpExp(e.fn, env);
        // JavaScript ignores extra arguments and makes missing ones undefined (chapter 23: so
        // does the compiled program, through cast_insert's $dyncallN)
        if (!isFunction(f)) throw new Trap(TYPE_ERROR.fn(e.args.length));
        return this.callFunction(f, e.args.map((a) => this.interpExp(a, env)));
      }
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Print':
        emit(out, display(this.interpExp(s.arg, env)), s.end);
        return;
      case 'IfStmt':
        if (truthy(this.interpExp(s.cond, env))) this.interpStmt(s.thn, env, out);
        else if (s.els) this.interpStmt(s.els, env, out);
        return;
      default:
        super.interpStmt(s, env, out);
    }
  }

  describeThrown(v) { return describeThrown(v); }

  // Chapter 16: async functions mean what lower_async makes of them.
  // (chapter 17: and rest parameters what lower_rest makes of them)
  interpProgram(p) {
    if (p.kind === 'Program' && (usesAsync(p) || usesRest(p))) p = lowerAsync(lowerRest(p.uniquified ? p : uniquify(p)));
    return super.interpProgram(p);
  }

  // A function with typed parameters checks its arguments when it is called, which is
  // where the compiled program's casts check them (before the call). A function with
  // result type Any that reaches the end of its body returns undefined.
  callFunction(f, args) {
    const def = f.def ?? this.defs?.get(f.fun);
    def?.params.forEach((q, k) => {
      if (q.type === 'Int') projectInt(args[k]);
      if (q.type === 'Bool') DYN_OPS.project_Bool(args[k]);
    });
    try {
      return super.callFunction(f, args);
    } catch (err) {
      if (err instanceof Error && /reached its end without returning/.test(err.message) && def?.retType === 'Any') return undefined;
      throw err;
    }
  }
}

export class InterpCDyn extends InterpCLambda {
  interpExp(e, env) {
    switch (e.kind) {
      case 'AnyLit':
      case 'Num':
      case 'Str':
        return e.value;
      case 'Shape':
        return shapeNames(e.names, e.error);
      case 'Prim': {
        // chapter 14: an operation that throws sets the runtime's two globals, and its
        // result (never used: a test of exc_flag follows) is 0
        const args = e.args.map((a) => this.interpExp(a, env));
        try {
          return sourcePrim(e.op, args);
        } catch (x) {
          if (!(x instanceof Thrown)) throw x;
          this.globalsOf().set('exc_value', x.value).set('exc_flag', 1);
          return 0;
        }
      }
      case 'GlobalValue':
        if (e.name === 'exc_flag' || e.name === 'exc_value') return this.globalsOf().get(e.name);
        return super.interpExp(e, env);
      default:
        return super.interpExp(e, env);
    }
  }

  globalsOf() {
    this.exc ??= new Map([['exc_flag', 0], ['exc_value', 0]]);
    return this.exc;
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Print':
        emit(out, display(this.interpExp(s.arg, env)), s.end);
        return;
      case 'SetGlobal':   // chapter 14
        this.globalsOf().set(s.name, this.interpExp(s.value, env));
        return;
      case 'Uncaught':
        throw new Trap(`Uncaught ${describeThrown(this.globalsOf().get('exc_value'))}`);
      default:
        super.interpStmt(s, env, out);
    }
  }
}

// What an exception nobody caught is called in its report: its string, if it has one.
export function describeThrown(v) {
  try { return toStringJS(v); } catch { return typeOf(v); }
}

export { OutsideSubset, UNINIT };

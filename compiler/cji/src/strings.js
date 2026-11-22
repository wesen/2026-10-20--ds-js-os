// Chapter 13: strings' methods, and what every string operator means.
//
// A method call s.name(args) on a String becomes the operator `op` with the receiver and
// the arguments, missing ones filled in with their defaults. Each argument is converted to
// the type listed (a Number index, as JavaScript converts it; a String). The result has
// type `result`. runtime.c implements each operator under the same name; `alloc` marks
// those that allocate (they may collect, and take the root stack's top as a last argument).
import { Num, Str, Int } from './ast.js';
import { Trap, Thrown, makeError } from './interp.js';

export const STRING_METHODS = Object.assign(Object.create(null), {
  charAt: { op: 'str_charAt', args: ['Number'], defaults: [Num(0)], result: 'String', alloc: true },
  charCodeAt: { op: 'str_charCodeAt', args: ['Number'], defaults: [Num(0)], result: 'Number' },
  indexOf: { op: 'str_indexOf', args: ['String', 'Number'], defaults: [null, Num(0)], result: 'Int' },
  lastIndexOf: { op: 'str_lastIndexOf', args: ['String', 'Number'], defaults: [null, Num(Infinity)], result: 'Int' },   // (chapter 21: from)
  includes: { op: 'str_includes', args: ['String', 'Number'], defaults: [null, Num(0)], result: 'Bool' },
  startsWith: { op: 'str_startsWith', args: ['String', 'Number'], defaults: [null, Num(0)], result: 'Bool' },
  endsWith: { op: 'str_endsWith', args: ['String', 'Number'], defaults: [null, Num(Infinity)], result: 'Bool' },
  slice: { op: 'str_slice', args: ['Number', 'Number'], defaults: [Num(0), Num(Infinity)], result: 'String', alloc: true },
  substring: { op: 'str_substring', args: ['Number', 'Number'], defaults: [Num(0), Num(Infinity)], result: 'String', alloc: true },
  toUpperCase: { op: 'str_toUpperCase', args: [], defaults: [], result: 'String', alloc: true },
  toLowerCase: { op: 'str_toLowerCase', args: [], defaults: [], result: 'String', alloc: true },
  trim: { op: 'str_trim', args: ['Int'], defaults: [Int(3)], fixed: 1, result: 'String', alloc: true },
  trimStart: { op: 'str_trim', args: ['Int'], defaults: [Int(1)], fixed: 1, result: 'String', alloc: true },
  trimEnd: { op: 'str_trim', args: ['Int'], defaults: [Int(2)], fixed: 1, result: 'String', alloc: true },
  repeat: { op: 'str_repeat', args: ['Number'], defaults: [null], result: 'String', alloc: true },
  padStart: { op: 'str_padStart', args: ['Number', 'String'], defaults: [null, Str(' ')], result: 'String', alloc: true },
  padEnd: { op: 'str_padEnd', args: ['Number', 'String'], defaults: [null, Str(' ')], result: 'String', alloc: true },
  split: { op: 'str_split', args: ['String'], defaults: [null], result: 'String[]', alloc: true },
  concat: { op: 'str_concat', args: ['String'], defaults: [null], result: 'String', alloc: true },
  toString: { op: 'id', args: [], defaults: [], result: 'String' },
});

// The operators on strings that cast_insert introduces besides the methods' (all but
// str_length, str_eq, str_cmp, bool_to_str and any_typeof_str allocate).
export const STRING_ALLOC = new Set([
  ...Object.values(STRING_METHODS).filter((m) => m.alloc).map((m) => m.op),
  'str_concat', 'str_index', 'int_to_str', 'num_to_str', 'any_to_str', 'str_fromCharCode', 'arr_join', 'any_add',
  'num_to_radix',   // chapter 14
  'num_to_fixed', 'num_to_precision',   // chapter 21
  'arr_resize',     // chapter 15
  'any_set', 'any_index', 'any_set_index', 'any_delete', 'any_in', 'any_keys',   // chapter 19: properties added
  'host_call', 'host_event',   // chapter 24: their results
]);
export const STRING_RESULT = new Set([...Object.values(STRING_METHODS).filter((m) => m.result === 'String').map((m) => m.op),
  'str_concat', 'str_index', 'int_to_str', 'num_to_str', 'bool_to_str', 'any_to_str', 'str_fromCharCode', 'arr_join', 'num_to_radix', 'num_to_fixed', 'num_to_precision',
  'any_typeof_str', 'project_String']);

// JavaScript's ToIntegerOrInfinity, then clamped to [0, n]: how slice and friends read a
// position.
const pos = (x, n) => {
  let v = Number.isNaN(x) ? 0 : Math.trunc(x);
  if (v < 0) v = Math.max(n + v, 0);
  return Math.min(v, n);
};
const at = (x, n) => Math.min(Math.max(Number.isNaN(x) ? 0 : Math.trunc(x), 0), n);   // no negative counting

// Whitespace as String.prototype.trim knows it.
const SPACE = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+';
const WS = new RegExp(`^${SPACE}`);
const WS_END = new RegExp(`${SPACE}$`);

// toUpperCase and toLowerCase map one code unit at a time, where Unicode maps it to one
// unit (runtime/casemap.h has the same table); ß stays ß, where JavaScript makes it SS,
// and a final sigma is not special (exercise 13.3).
const unitCase = (f) => (s) => {
  let out = '';
  for (let k = 0; k < s.length; k++) {
    const c = s[k], m = c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) < 0xe000 ? c : f(c);
    out += m.length === 1 ? m : c;
  }
  return out;
};
const upper = unitCase((c) => c.toUpperCase());
const lower = unitCase((c) => c.toLowerCase());

export class StringTrap extends Trap {}

// Chapter 14: the runtime operations that can throw a JavaScript exception (an Error the
// program can catch), rather than stop.
// (chapter 23: any_get and any_index, a property of null or undefined)
export const THROWS = new Set(['str_repeat', 'num_to_radix', 'arr_resize', 'num_to_fixed', 'num_to_precision', 'any_get', 'any_index', 'any_length']);

// Each operator on the interpreters' values: JavaScript strings and numbers.
export const STRING_OPS = {
  // chapter 15: the interpreters' arrays are JavaScript's, their own storage
  arr_storage: (a) => a,
  arr_resize: (a, n, fill) => {
    if (!(Number.isInteger(n) && n >= 0 && n < 2 ** 32)) throw new Thrown(makeError('RangeError', 'Invalid array length'));
    const old = a.length;
    a.length = n;
    for (let k = old; k < n; k++) a[k] = fill;
    return n;
  },
  // n.toString(radix): a RangeError outside 2..36 (chapter 14)
  num_to_radix: (n, r) => {
    if (!(r >= 2 && r <= 36)) throw new Thrown(makeError('RangeError', 'toString() radix argument must be between 2 and 36'));
    return n.toString(Math.trunc(r));
  },
  // chapter 21: n.toFixed(f) and n.toPrecision(p), JavaScript's own (RangeErrors as Node's)
  num_to_fixed: (n, d) => {
    const f = Number.isNaN(d) ? 0 : Math.trunc(d);
    if (!(f >= 0 && f <= 100)) throw new Thrown(makeError('RangeError', 'toFixed() digits argument must be between 0 and 100'));
    return n.toFixed(f);
  },
  num_to_precision: (n, d) => {
    const p = Number.isNaN(d) ? 0 : Math.trunc(d);
    if (!Number.isFinite(n)) return String(n);
    if (!(p >= 1 && p <= 100)) throw new Thrown(makeError('RangeError', 'toPrecision() argument must be between 1 and 100'));
    return n.toPrecision(p);
  },
  str_charAt: (s, i) => (i >= 0 && i < s.length ? s[Math.trunc(i)] ?? '' : ''),
  str_charCodeAt: (s, i) => s.charCodeAt(Math.trunc(Number.isNaN(i) ? 0 : i)),
  str_indexOf: (s, t, from) => s.indexOf(t, at(from, s.length)),
  str_lastIndexOf: (s, t, from) => s.lastIndexOf(t, from),
  str_includes: (s, t, from) => s.includes(t, at(from, s.length)),
  str_startsWith: (s, t, p) => s.startsWith(t, at(p, s.length)),
  str_endsWith: (s, t, e) => s.endsWith(t, at(e, s.length)),
  str_slice: (s, a, b) => s.slice(pos(a, s.length), pos(b, s.length)),
  str_substring: (s, a, b) => s.substring(at(a, s.length), at(b, s.length)),
  str_toUpperCase: upper,
  str_toLowerCase: lower,
  str_trim: (s, mode) => {
    if (mode & 1) s = s.replace(WS, '');
    if (mode & 2) s = s.replace(WS_END, '');
    return s;
  },
  str_repeat: (s, n) => {
    // chapter 14: a RangeError the program can catch
    if (Math.trunc(n) < 0 || n === Infinity) throw new Thrown(makeError('RangeError', `Invalid count value: ${n}`));
    if (Number.isNaN(n)) n = 0;
    return s.repeat(n);
  },
  str_padStart: (s, n, f) => s.padStart(Number.isNaN(n) ? 0 : n, f),
  str_padEnd: (s, n, f) => s.padEnd(Number.isNaN(n) ? 0 : n, f),
  str_split: (s, sep) => s.split(sep),
  str_concat: (a, b) => a + b,
  str_fromCharCode: (c) => String.fromCharCode(c),
  id: (s) => s,
};

export const ASCII = { upper, lower };

// How many operands each of chapter 13's operators takes (the grammar checks).
export const STRING_ARITY = {
  ...Object.fromEntries(Object.values(STRING_METHODS).map((m) => [m.op, 1 + m.args.length])),
  id: 1, str_concat: 2, str_index: 2, int_to_str: 1, num_to_str: 1, bool_to_str: 1, any_to_str: 1, str_fromCharCode: 1, num_to_radix: 2, num_to_fixed: 2, num_to_precision: 2,
  arr_join: 3, any_typeof_str: 1, project_String: 1, str_eq: 2, 'str<': 2, 'str<=': 2, 'str>': 2, 'str>=': 2,
  str_length: 1, any_get: 2, any_set: 3, project_record: 2,
  arr_storage: 1, arr_resize: 3, any_is_array: 1, any_length: 1, any_arity: 1,
  any_index: 2, any_set_index: 3, any_delete: 2, any_in: 2, any_keys: 1, any_unhole: 1,
  host_arg: 2, host_call: 3, host_event: 1, host_entries: 2,   // chapter 24: the native world's system calls   // chapter 19   // chapter 15: an array's storage; a.length = n (with the value for new slots)
};
// The source operators of chapter 13 (before cast_insert).
export const STRING_SOURCE_ARITY = { String: 1, typeof: 1, 'String.fromCharCode': 1, 'Array.isArray': 1, fn_arity: 1, is_undefined: 1,
  host_arg: 2, host_call: 3, host_event: 1, host_entries: 2,   // chapter 24
  any_delete: 2, any_in: 2, any_keys: 1 };

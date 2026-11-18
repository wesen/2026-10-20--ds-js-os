// Types, as strings: 'Int', 'Bool', 'Int[]', '(Int,Bool)=>Int', '((Int)=>Int)[]'.
//
// Strings keep type equality a string comparison. This module builds and takes apart the
// compound ones, and parses the type comments of chapter 7.

import { CompileError, programResets } from './utils.js';

// The index of the parenthesis that closes the one at t[open].
function closing(t, open) {
  let depth = 0;
  for (let k = open; k < t.length; k++) {
    if (t[k] === '(') depth++;
    if (t[k] === ')' && --depth === 0) return k;
  }
  return -1;
}

// A function type starts with its parameter list and continues with =>; an array type ends
// in [] and is not a function type: (Int)=>Int[] is a function that returns an array, and
// ((Int)=>Int)[] an array of functions.
export const isFunctionType = (t) => typeof t === 'string' && t.startsWith('(') && t.slice(closing(t, 0) + 1).startsWith('=>');
export const isArrayType = (t) => typeof t === 'string' && t.endsWith('[]') && !isFunctionType(t) && !isRecordType(t);

// Chapter 13: a record type lists its fields in order of their names, {a:Int,b:String};
// so does its object's shape, the names a dynamic access looks up.
export const isRecordType = (t) => typeof t === 'string' && (t.startsWith('{') || t.startsWith('Error{'))
  && closingBrace(t, t.indexOf('{')) === t.length - 1;
// Chapter 14: an Error object is a record too, of a class of its own: its type is written
// Error{message:String,name:String}, and plain Error means exactly that.
export const isErrorType = (t) => isRecordType(t) && t.startsWith('Error{');
export const ERROR_TYPE = 'Error{message:String,name:String}';
function closingBrace(t, open) {
  let depth = 0;
  for (let k = open; k < t.length; k++) {
    if (t[k] === '{' || t[k] === '(') depth++;
    if ((t[k] === '}' || t[k] === ')') && --depth === 0) return k;
  }
  return -1;
}
export function recordType(fields, error = false) {   // fields: [[name, type]], any order
  return `${error ? 'Error' : ''}{${[...fields].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([n, t]) => `${n}:${t}`).join(',')}}`;
}
// Chapter 19: the order of an object's keys. JavaScript lists an object's properties in the
// order they were made (integer keys first, ascending); a record type lists its fields
// sorted, so that equal types are equal strings. A type's records keep their fields, and so
// Object.keys lists them, in the order of the first literal with exactly those fields, else
// in the order the names first appeared in the program.
const KEY_ORDER = new Map(), NAME_RANK = new Map(), FIELDS = new Map();
const integerKey = (n) => /^(0|[1-9][0-9]*)$/.test(n) && Number(n) < 2 ** 32 - 1;
// (CJI-3: when on, the calls a parse makes, which tools/gen-prelude-exports.mjs records for the world
// runtime: a world compiled on its own replays them instead of parsing the runtime)
let keyOrderLog = null;
export function logKeyOrders(on) { const log = keyOrderLog; keyOrderLog = on ? [] : null; return log; }
export function noteKeyOrder(names) {
  if (keyOrderLog) keyOrderLog.push(names.slice());
  for (const n of names) if (!NAME_RANK.has(n)) NAME_RANK.set(n, NAME_RANK.size);
  const key = [...names].sort().join(',');
  if (!KEY_ORDER.has(key)) KEY_ORDER.set(key, jsOrder(names));
}
export function resetKeyOrder() { KEY_ORDER.clear(); NAME_RANK.clear(); FIELDS.clear(); }
programResets.push(resetKeyOrder);
const jsOrder = (names) => [...names.filter(integerKey).sort((a, b) => a - b), ...names.filter((n) => !integerKey(n))];
export const literalOrder = (names) => jsOrder(names);   // chapter 23: a table literal's own
export function keyOrder(names) {   // (once chosen, a set's order stays: every pass lays records out alike)
  const key = [...names].sort().join(',');
  if (!KEY_ORDER.has(key)) {
    const rank = (n) => NAME_RANK.get(n) ?? Infinity;
    KEY_ORDER.set(key, jsOrder([...names].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))));
  }
  return KEY_ORDER.get(key);
}

export function recordFields(t) {      // '{a:Int,b:String}' -> [['a', 'Int'], ['b', 'String']], in key order
  if (FIELDS.has(t)) return FIELDS.get(t);
  const fields = sortedFields(t);
  if (t.startsWith('Error{')) { FIELDS.set(t, fields); return fields; }   // (the runtime's own: message, name)
  const out = keyOrder(fields.map(([n]) => n)).map((n) => fields.find(([m]) => m === n));
  FIELDS.set(t, out);
  return out;
}
function sortedFields(t) {
  const inside = t.slice(t.indexOf('{') + 1, -1), out = [];
  let depth = 0, start = 0;
  for (let k = 0; k <= inside.length; k++) {
    const c = inside[k];
    if (c === '(' || c === '{') depth++;
    if (c === ')' || c === '}') depth--;
    if ((c === ',' && depth === 0) || k === inside.length) {
      const part = inside.slice(start, k);
      if (part) { const colon = part.indexOf(':'); out.push([part.slice(0, colon), part.slice(colon + 1)]); }
      start = k + 1;
    }
  }
  return out;
}

// Values the collector must find and update (chapter 8: a function value is a closure, an
// object on the heap). 'Code', the address of a function's machine code, is not.
//
// Chapter 9: a value of type Any may be a pointer too (an array or a closure).
export const isPointerType = (t) => isArrayType(t) || isFunctionType(t) || t === 'Any' || t === 'String' || isRecordType(t);

// Chapter 9: the types a value can have and still be a dynamic value, Any: Int and Bool
// (converted), arrays of Any, and functions whose parameters and result are all Any. An
// Int[] holds raw integers, which dynamic code would misread, and a function of type
// (Int) => Int expects raw integers; neither can become Any in this subset.
export function isDynamicType(t) {
  if (t === 'Int' || t === 'Number' || t === 'Bool' || t === 'Any' || t === 'String') return true;
  if (isArrayType(t)) return elementType(t) === 'Any';
  if (isRecordType(t)) return recordFields(t).every(([, f]) => f === 'Any');   // chapter 13
  if (isFunctionType(t)) {
    const { params, ret } = functionParts(t);
    return ret === 'Any' && params.every((q) => q === 'Any');
  }
  return false;
}
export const dynamicFunctionType = (n) => functionType(new Array(n).fill('Any'), 'Any');

export function arrayOf(t) {
  return isFunctionType(t) ? `(${t})[]` : `${t}[]`;
}

export function elementType(t) {
  const e = t.slice(0, -2);
  return e.startsWith('(') && closing(e, 0) === e.length - 1 ? e.slice(1, -1) : e;
}

export function functionType(params, ret) {
  return `(${params.join(',')})=>${ret}`;
}

// '(Int,Bool)=>Int' -> { params: ['Int', 'Bool'], ret: 'Int' }
export function functionParts(t) {
  const close = closing(t, 0);
  const inside = t.slice(1, close), params = [];
  let depth = 0, start = 0;
  for (let k = 0; k < inside.length; k++) {
    if (inside[k] === '(' || inside[k] === '{') depth++;   // chapter 13: a record type has commas too
    if (inside[k] === ')' || inside[k] === '}') depth--;
    if (inside[k] === ',' && depth === 0) { params.push(inside.slice(start, k)); start = k + 1; }
  }
  if (inside.length) params.push(inside.slice(start));
  return { params, ret: t.slice(close + 3) };
}

// Parses the text of a type comment, `Int`, `Bool[]`, `(Int, Int) => Bool`, into the
// string form above.
export function parseType(text) {
  const toks = text.match(/=>|\[\]|[A-Za-z_$][A-Za-z0-9_$]*|[(),{}:]|\S/g) ?? [];
  let k = 0;
  const fail = (msg) => { throw new CompileError(`type /*: ${text.trim()} */: ${msg}`); };
  const type = () => {
    let t;
    if (toks[k] === '(') {
      k++;
      const parts = [];
      while (toks[k] !== ')') {
        if (toks[k] === undefined) fail('missing )');
        parts.push(type());
        if (toks[k] === ',') k++;
      }
      k++;
      if (toks[k] === '=>') { k++; t = functionType(parts, type()); }
      else if (parts.length === 1) t = parts[0];
      else fail('a list of types needs => and a result type');
    } else if (['Int', 'Number', 'Bool', 'Any', 'String'].includes(toks[k])) {
      t = toks[k++];
    } else if (toks[k] === 'Error' && toks[k + 1] !== '{') {   // chapter 14
      k++;
      t = ERROR_TYPE;
    } else if (toks[k] === '{' || toks[k] === 'Error') {   // chapter 13: { name: T, ... }
      const error = toks[k] === 'Error';
      if (error) k++;
      k++;
      const fields = [];
      while (toks[k] !== '}') {
        if (toks[k] === undefined) fail('missing }');
        const name = toks[k++];
        if (toks[k++] !== ':') fail(`a field needs a type: ${name}: T`);
        fields.push([name, type()]);
        if (toks[k] === ',') k++;
      }
      k++;
      t = recordType(fields, error);
    } else {
      fail(`unknown type ${toks[k] ?? '(nothing)'}; the types are Int, Number, Bool, String, Any, T[], { f: T, ... } and (T, ...) => T`);
    }
    while (toks[k] === '[]') { k++; t = arrayOf(t); }
    return t;
  };
  const t = type();
  if (k !== toks.length) fail(`unexpected ${toks[k]}`);
  return t;
}

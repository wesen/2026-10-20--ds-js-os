// Chapter 15: the library, in the language itself.
//
// The array methods (push, map, filter, sort, ...) are written below in the subset, as
// ordinary functions whose first parameter is the array. instantiate_library replaces each
// call a.map(f) with a call of a fresh copy of map, made for that call alone: inference
// then gives each copy the types of its own call, so one map serves Int[]s and String[]s
// without the type system knowing about generics. (A copy per call costs code size;
// exercise 15.2 shares the copies whose types agree.)
//
// Two conventions:
//   __call(f, x, i, a)   calls the callback f with as many of the arguments as it takes:
//                        JavaScript passes three and ignores those a function does not
//                        name, which the subset's calls do not allow
//   name_any             the version for a receiver whose type is Any: it returns
//                        undefined where JavaScript does (pop of []), and where strings
//                        have a method of the same name, it asks which it has
//
// A typed array's pop and shift on an empty array stop at the index check, rather than
// give undefined (which would make the result, and the array's elements, dynamic).

import { parse, coreDefs, INSPECT_NAMES } from './parse.js';
import { CLASSES, BRANDS, classOfType, CLASS_METHOD_NAMES, isSource, CLAMP8, NATIVES } from './classes.js';
import { uniquify } from './uniquify.js';
import { inferTypes } from './infer.js';
import { dropEpisodes } from './ranges.js';
import { functionParts, isFunctionType, isArrayType, isRecordType } from './types.js';
import { STRING_METHODS } from './strings.js';
import { Call, Var, Num, Int, AnyLit } from './ast.js';
import { CompileError } from './utils.js';
import { memoryStore } from './spill.js';

const APPEND = (r, x) => `{ const m = ${r}.length; ${r}.length = m + 1; ${r}[m] = ${x}; }`;
// A position as slice and friends read it: ToIntegerOrInfinity, counted from the end when
// negative, clamped to [0, n]; an Int once clamped (a written Int is a checked contract).
const REL = (v, x) => `let ${v} /*: Int */ = 0; { let t = ${x} !== ${x} ? 0 : Math.trunc(${x}); if (t < 0) { t = n + t; if (t < 0) t = 0; } else if (t > n) t = n; ${v} = t; }`;

export const LIBRARY_SOURCE = `
function pop(a) { const n = a.length; const x = a[n - 1]; a.length = n - 1; return x; }
function pop_any(a) { const n = a.length; if (n === 0) return undefined; const x = a[n - 1]; a.length = n - 1; return x; }
function shift(a) { const n = a.length; const x = a[0]; for (let i = 1; i < n; i++) a[i - 1] = a[i]; a.length = n - 1; return x; }
function shift_any(a) { const n = a.length; if (n === 0) return undefined; const x = a[0]; for (let i = 1; i < n; i++) a[i - 1] = a[i]; a.length = n - 1; return x; }
function map(a, f) { const n = a.length; const r = []; r.length = n; for (let i = 0; i < n; i++) r[i] = __call(f, a[i], i, a); return r; }
function forEach(a, f) { const n = a.length; for (let i = 0; i < n; i++) if (i < a.length) __call(f, a[i], i, a); }
function filter(a, f) { const r = []; const n = a.length; for (let i = 0; i < n; i++) { const x = a[i]; if (__call(f, x, i, a)) ${APPEND('r', 'x')} } return r; }
function flatMap(a, f) { const r = []; const n = a.length; for (let i = 0; i < n; i++) { const ys = __call(f, a[i], i, a); for (let j = 0; j < ys.length; j++) ${APPEND('r', 'ys[j]')} } return r; }
// CJI-3: a.flat(), one level: an array of arrays (typed), or of anything (dynamic: an item that is not
// an array is kept as it is)
function flat(a) { const r = []; const n = a.length; for (let i = 0; i < n; i++) { const ys = a[i]; for (let j = 0; j < ys.length; j++) ${APPEND('r', 'ys[j]')} } return r; }
function flat_any(a) { const r = []; const n = a.length; for (let i = 0; i < n; i++) { const ys = a[i]; if (__isArray(ys)) { for (let j = 0; j < ys.length; j++) ${APPEND('r', 'ys[j]')} } else ${APPEND('r', 'ys')} } return r; }
function reduce(a, f, init) { let acc = init; const n = a.length; for (let i = 0; i < n; i++) acc = __call(f, acc, a[i], i, a); return acc; }
function reduce1(a, f) { const n = a.length; let acc = a[0]; for (let i = 1; i < n; i++) acc = __call(f, acc, a[i], i, a); return acc; }
function some(a, f) { const n = a.length; for (let i = 0; i < n; i++) if (__call(f, a[i], i, a)) return true; return false; }
function every(a, f) { const n = a.length; for (let i = 0; i < n; i++) if (!__call(f, a[i], i, a)) return false; return true; }
function find(a, f) { const n = a.length; for (let i = 0; i < n; i++) { const x = a[i]; if (__call(f, x, i, a)) return x; } return undefined; }
function findIndex(a, f) { const n = a.length; for (let i = 0; i < n; i++) if (__call(f, a[i], i, a)) return i; return -1; }
function findLast(a, f) { for (let i = a.length - 1; i >= 0; i--) { const x = a[i]; if (__call(f, x, i, a)) return x; } return undefined; }
function findLastIndex(a, f) { for (let i = a.length - 1; i >= 0; i--) if (__call(f, a[i], i, a)) return i; return -1; }
function indexOf(a, x, from) { const n = a.length; ${REL('s', 'from')} for (let i = s; i < n; i++) if (a[i] === x) return i; return -1; }
function lastIndexOf(a, x) { for (let i = a.length - 1; i >= 0; i--) if (a[i] === x) return i; return -1; }
function includes(a, x) { const n = a.length; for (let i = 0; i < n; i++) { const y = a[i]; if (y === x || (y !== y && x !== x)) return true; } return false; }
function slice(a, start, end) { const n = a.length; ${REL('s', 'start')} ${REL('e', 'end')} const r = []; if (e > s) { r.length = e - s; for (let i = s; i < e; i++) r[i - s] = a[i]; } return r; }
function fill(a, v, start, end) { const n = a.length; ${REL('s', 'start')} ${REL('e', 'end')} for (let i = s; i < e; i++) a[i] = v; return a; }
function reverse(a) { let i = 0; let j = a.length - 1; while (i < j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } return a; }
function at(a, i) { const n = a.length; let k = Math.trunc(i); if (k < 0) k = n + k; if (k < 0 || k >= n) return undefined; return a[k]; }
function pushArray(a, xs) { const n = a.length, m = xs.length; a.length = n + m; for (let i = 0; i < m; i++) a[n + i] = xs[i]; return n + m; }
function unshiftArray(a, xs) { const n = a.length, m = xs.length; a.length = n + m; for (let i = n - 1; i >= 0; i--) a[i + m] = a[i]; for (let i = 0; i < m; i++) a[i] = xs[i]; return n + m; }
function spliceArray(a, start, count, xs) {
  const n = a.length; ${REL('s', 'start')}
  let c = count !== count ? 0 : Math.trunc(count); if (c < 0) c = 0; if (c > n - s) c = n - s;
  const r = []; r.length = c;
  for (let i = 0; i < c; i++) r[i] = a[s + i];
  const m = xs.length, len = n - c + m;
  if (m > c) { a.length = len; for (let i = n - 1; i >= s + c; i--) a[i + m - c] = a[i]; }
  else { for (let i = s + c; i < n; i++) a[i - c + m] = a[i]; a.length = len; }
  for (let i = 0; i < m; i++) a[s + i] = xs[i];
  return r;
}
function join_any(a, sep) { let s = ''; const n = a.length; for (let i = 0; i < n; i++) { if (i > 0) s += sep; const x = a[i]; if (x !== undefined && x !== null) s += x; } return s; }
function sort(a, cmp) {
  const n = a.length;
  if (n < 2) return a;
  const tmp = []; tmp.length = n;
  for (let w = 1; w < n; w = w * 2) {
    for (let lo = 0; lo < n - w; lo += 2 * w) {
      const mid = lo + w, hi = Math.min(lo + 2 * w, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) { if (__call(cmp, a[j], a[i]) < 0) { tmp[k] = a[j]; j++; } else { tmp[k] = a[i]; i++; } k++; }
      while (i < mid) { tmp[k] = a[i]; i++; k++; }
      while (j < hi) { tmp[k] = a[j]; j++; k++; }
      for (let t = lo; t < hi; t++) a[t] = tmp[t];
    }
  }
  return a;
}
function splice(a, start, count) {
  const n = a.length; ${REL('s', 'start')}
  let c = count !== count ? 0 : Math.trunc(count); if (c < 0) c = 0; if (c > n - s) c = n - s;
  const r = []; r.length = c;
  for (let i = 0; i < c; i++) r[i] = a[s + i];
  for (let i = s + c; i < n; i++) a[i - c] = a[i];
  a.length = n - c;
  return r;
}
function Array_isArray(x) { return __isArray(x); }
function Array_new(n) { const r = []; r.length = n; return r; }
function Array_from_array(a) { const n = a.length; const r = []; r.length = n; for (let i = 0; i < n; i++) r[i] = a[i]; return r; }
function Array_from_array_map(a, f) { const n = a.length; const r = []; r.length = n; for (let i = 0; i < n; i++) r[i] = __call(f, a[i], i); return r; }
function Array_from_string(s) {
  const r = []; const n = s.length; let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i); let k = 1;
    if (c >= 55296 && c < 56320 && i + 1 < n) { const d = s.charCodeAt(i + 1); if (d >= 56320 && d < 57344) k = 2; }
    ${APPEND('r', 's.slice(i, i + k)')}
    i += k;
  }
  return r;
}
function Array_from_length(n, f) { const r = []; r.length = n; for (let i = 0; i < n; i++) r[i] = __call(f, undefined, i); return r; }
`;

// Methods with several items (push(x, y), unshift, concat(b, c)): one copy per count.
const VARIADIC = Object.assign(Object.create(null), {
  push: (k) => `function push(a${xs(k, ', ')}) { const n = a.length; a.length = n + ${k};${range(k).map((j) => ` a[n + ${j}] = x${j};`).join('')} return n + ${k}; }`,
  unshift: (k) => `function unshift(a${xs(k, ', ')}) { const n = a.length; a.length = n + ${k}; for (let i = n - 1; i >= 0; i--) a[i + ${k}] = a[i];${range(k).map((j) => ` a[${j}] = x${j};`).join('')} return n + ${k}; }`,
  concat: (k) => `function concat(a${xs(k, ', ')}) { const r = []; let m = 0; r.length = a.length${range(k).map((j) => ` + x${j}.length`).join('')}; for (let i = 0; i < a.length; i++) { r[m] = a[i]; m++; }${range(k).map((j) => ` for (let i = 0; i < x${j}.length; i++) { r[m] = x${j}[i]; m++; }`).join('')} return r; }`,
});
const range = (k) => Array.from({ length: k }, (_, j) => j);
const xs = (k, pre) => range(k).map((j) => `${pre}x${j}`).join('');

// Default values for the arguments a call leaves out, where JavaScript's are not undefined.
const DEFAULTS = Object.assign(Object.create(null), {
  indexOf: [null, Int(0)], slice: [Num(0), Num(Infinity)], fill: [null, Num(0), Num(Infinity)],
  splice: [null, Num(Infinity)], join_any: [{ kind: 'Str', value: ',' }],
});
// The names strings share with arrays: their _any copy asks which the receiver is.
const SHARED = ['slice', 'indexOf', 'lastIndexOf', 'includes', 'concat', 'at'];
// chapter 20: a typed array's elements in a new Any[] (a copy per call, typed by its argument)
const ANY_COPY = 'function $anyCopy(a) /*: Any[] */ { const out /*: Any[] */ = []; out.length = a.length; for (let k = 0; k < a.length; k++) out[k] = a[k]; return out; }';

let parsed = null;
function libraryDefs() {
  if (!parsed) parsed = new Map(parse(LIBRARY_SOURCE).body.map((d) => [d.name, d]));
  return parsed;
}
export const LIBRARY_NAMES = new Set(['push', 'unshift', 'concat', ...[...libraryDefs().keys()].map((n) => n.replace(/_any$/, ''))]);

// The library function a call needs: { def, args }, or null to leave the call alone.
function choose(name, recv, args, anyElems) {
  // the _any copy for a dynamic receiver, or an Any[] (whose elements can be undefined)
  const any = recv === 'Any' || anyElems;
  if (!any && !isArrayType(recv)) return null;
  const defs = libraryDefs();
  let def = null;
  if (VARIADIC[name]) {
    if (args.length === 0 && name !== 'concat') return null;
    def = parse(VARIADIC[name](args.length)).body[0];
  } else if (name === 'reduce') def = defs.get(args.length > 1 ? 'reduce' : 'reduce1');
  else if (name === 'sort' && args.length === 0) def = parse('function sort_default(a) { return sort(a, (x, y) => (String(x) < String(y) ? -1 : String(y) < String(x) ? 1 : 0)); }').body[0];
  else def = (any && defs.get(`${name}_any`)) || defs.get(name);
  if (!def || (def.name === 'join_any' && recv !== 'Any')) return null;
  if (def.params.length - 1 < args.length && !VARIADIC[name]) return null;
  return { def, missing: (DEFAULTS[def.name] ?? []).slice(args.length) };
}

// Copies the library function for one call: the callbacks it calls through __call take as
// many arguments as their types say (all of them when the type is unknown).
function instance(def, callbackTypes, sortHelper) {
  const arity = (t) => (t && isFunctionType(t) ? functionParts(t).params.length : Infinity);
  const params = def.params.map((q) => q.name);
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    if (x.kind === 'Call' && x.fn.kind === 'Var' && x.fn.name === '__call') {
      const [f, ...rest] = x.args;
      const k = arity(callbackTypes[params.indexOf(f.name) - 1]);
      return Call(walk(f), rest.slice(0, k).map(walk));
    }
    if (x.kind === 'Call' && x.fn.kind === 'Var' && x.fn.name === '__isArray') return { kind: 'Prim', op: 'Array.isArray', args: x.args.map(walk) };
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = walk(v);
    return out;
  };
  return walk(def);
}

// The pass. Every a.name(args) whose receiver inference found to be an array (or Any),
// and every Array.from, Array.isArray and new Array, becomes a call of its own copy of the
// library function; inference then runs again over the whole program.
export function instantiateLibrary(p) {
  return instantiateLibraryTaking({ ir: p });
}
// (CJI-3: a build gives the program in a box, which this empties, so that the program before this pass
// is not held by the caller while the pass runs: see compileBoxToText in pipeline.js; and its store)
export function instantiateLibraryTaking(box, store = null, memo = true) {
  let p = box.ir;
  box.ir = null;
  // (CJI-3: the copies made in this round, handed to inference and then forgotten: a copy's parameter
  // count, which pad needs later, is kept by name)
  const added = [], arity = new Map();
  const add = (defs) => { for (const d of defs) { added.push(d); if (!arity.has(d.name)) arity.set(d.name, d.params.length); } };
  // chapter 22: the classes the program makes instances of; a call on a dynamic receiver
  // asks only about these
  const used = new Set();
  // CJI-3: the names of the methods of the program's classes: the arrows in a class instance's
  // record literal (parse.js classDef, its first field $class$C), or set by name after it (a
  // class's members past 28, through $setIn)
  const fnFields = new Set();
  // CJI-3: each constant's initializer (names are unique), for maybeArray below
  const constInit = new Map();
  const classRecord = (e) => e && (e.kind === 'Record' ? e.fields[0]?.name.startsWith('$class$')
    : e.kind === 'Call' && e.fn.kind === 'Var' && e.fn.name.startsWith('$setIn') && classRecord(e.args[0]));
  const scan = (x) => {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(scan); return; }
    if (x.kind === 'LibCall' && x.name.startsWith('new ')) used.add(x.name.slice(4));
    if (x.kind === 'Const') constInit.set(x.name, x.init);
    if (x.kind === 'Record' && classRecord(x)) x.fields.forEach((f) => { if (f.exp.kind === 'Lambda') fnFields.add(f.name); });
    if (x.kind === 'Call' && classRecord(x) && x.args[1]?.kind === 'Str' && x.args[2]?.kind === 'Lambda') fnFields.add(x.args[1].value);
    Object.values(x).forEach(scan);
  };
  scan(p.body);
  // CJI-3: a method call on a dynamic receiver whose name is a library method's and also a
  // class's method (the Parser's at): in JavaScript an object's own function is called, so the
  // receiver is asked first whether it is an object (not an array, not a string), and then its
  // field is called. Only for such names, so that programs without classes keep their code.
  // (An object literal's arrow named like an array method, called on a dynamic receiver, still
  // gets the array's method: left as it was, since worlds have such literals.)
  const objectFirst = (name, k) => {
    const ps = range(k).map((j) => `p${j}`);
    return `(typeof o === 'object' && o !== null && !__isArray(o)) return o.${name}(${ps.join(', ')}); `;
  };
  // (that call: the receiver's field, whatever the name means for a string; see ownCalls)
  // CJI-3: inference types x.slice(...) and x.concat(...) of a dynamic x as a String (a string
  // method's result) until this pass gives the call its dispatcher; but x may be an array (the
  // rest of a destructured dynamic array is its slice). A call that copies the items of such a
  // value by its type (Array.from, a spread, new Set) waits for the round after the dispatcher.
  const maybeArray = (e) => e && ((e.kind === 'MethodCall' && (e.name === 'slice' || e.name === 'concat') && e.recvType === 'Any')
    || (e.kind === 'Var' && constInit.has(e.name) && maybeArray(constInit.get(e.name))));
  const ownCalls = (d) => {
    const walk = (x) => {
      if (x === null || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.kind === 'MethodCall' && x.obj.kind === 'Var' && x.obj.name === 'o') x.own = true;
      Object.values(x).forEach(walk);
    };
    walk(d);
    return d;
  };
  // chapter 22: the program's own library functions, by their names before uniquify, for a
  // copy that calls them (a Date method calls chapter 21's Date$get)
  let outer = new Map();
  const program = (body) => { outer = new Map(body.filter((d) => d.kind === 'FunDef' && d.name.includes('$')).map((d) => [d.name.replace(/\.\d+$/, ''), d.name])); };
  program(p.body);
  // Copies of library functions (instance() applied), renamed together: one may call another
  // by its library name. Returns the new name of the last.
  const make = (defs0) => {
    // (chapter 31: one copy of a native primitive or an index's rebuild, however many sources bring it;
    // CJI-3: and of any function two sources bring, a class's instance test $is or the items of a
    // dynamic value, which a dispatcher's branches and a method's SELF_ITEMS both add)
    const defs = defs0.filter((d, i) => defs0.findIndex((e) => e.name === d.name) === i);
    const u = uniquify({ kind: 'Program', body: defs }, outer);
    add(u.body);
    u.body.forEach((d) => mine.add(d.name));
    return u.body.at(-1).name;
  };
  const mine = new Set();   // the copies' names: their own calls (a dispatcher's string method) stay
  let show = null;          // chapter 20: the program's one copy of $show, made when first needed

  // ---- chapter 22: library classes ----
  // A class function's source as a definition named name, its record literals marked as the
  // class's instances, its callbacks cut to their arities.
  const classDef = (text, name, callbackTypes = []) => {
    const d = { ...markLib(parse(text).body[0]), name };
    return instance(d, callbackTypes);
  };
  // The definitions a source needs besides itself: $anyCopy, $clamp8, and the items function
  // of the value it iterates (SELF_ITEMS), chosen by that value's type t.
  const support = (text, t) => {
    const defs = [];
    if (text.includes('$anyCopy')) defs.push(parse(ANY_COPY).body[0]);
    if (text.includes('$clamp8')) defs.push(parse(CLAMP8).body[0]);
    // chapter 31: an index's rebuild, and the native primitives (which the rebuilds use too)
    const natives = Object.keys(NATIVES).filter((n) => text.includes(n));
    natives.filter((n) => !n.startsWith('$nat_')).forEach((n) => natives.push(...Object.keys(NATIVES).filter((m) => NATIVES[n].includes(m) && !natives.includes(m))));
    [...new Set(natives)].forEach((n) => defs.push(parse(NATIVES[n]).body[0]));
    if (text.includes('SELF_ITEMS')) defs.push(...itemsDefs(t, 'SELF_ITEMS'));
    return defs;
  };
  // The definitions of a function named name that turns a value of type t into the array of
  // its items: the array itself, a string's characters, a class's items, or for a dynamic
  // value, whichever of these it turns out to be.
  const itemsDefs = (t, name) => {
    const c = classOfType(t);
    if (c) {
      const m = CLASSES[c].items;
      if (!m) throw new CompileError(`a ${c} is not iterable`);
      return [classDef(CLASSES[c].methods[m]([t]), name)];
    }
    if (t === 'String') return [{ ...libraryDefs().get('Array_from_string'), name }];
    if (t !== 'Any' && t !== undefined) return [parse(`function ${name}(a) { return a; }`).body[0]];
    const cs = [...used].filter((k) => CLASSES[k].items);
    const defs = cs.flatMap((k) => [instance(parse(isSource(k)).body[0], []), classDef(CLASSES[k].methods[CLASSES[k].items](['Any']), `${k}$items`)]);
    defs.push(parse(`function ${name}(o /*: Any */) /*: Any */ { ${cs.map((k) => `if (${k}$is(o)) return ${k}$items(o); `).join('')}return o; }`).body[0]);
    return defs;
  };
  // A call of class c's method on a receiver of type t: its copy's name, or null if c has none
  const classMethod = (c, name, t, args) => {
    const src = CLASSES[c].methods[name]?.([t, ...(args ?? [])]);
    if (!src) return null;
    return make([...support(src, undefined), classDef(src, `${c}$${name}`, args)]);
  };
  // the arguments a copy expects: the call's, then undefined for the parameters left out
  const pad = (fn, given) => {
    const n = arity.has(fn) ? arity.get(fn) - 1 : given.length;
    return [...given, ...Array.from({ length: Math.max(0, n - given.length) }, () => AnyLit(undefined))];
  };
  // A method call on a dynamic receiver whose name a class the program uses has: a
  // dispatcher that asks which class the receiver is, and otherwise does what the call did
  // before (an array method, or the receiver's own function field).
  const dispatch = (x) => {
    const cs = [...used].filter((k) => CLASSES[k].methods[x.name]);
    if (!cs.length) return null;
    const ps = x.args.map((_, j) => `p${j}`), list = ps.map((q) => `, ${q} /*: Any */`).join('');
    const defs = [];
    for (const k of cs) {
      const src = CLASSES[k].methods[x.name](['Any', ...x.args.map(() => 'Any')]);
      defs.push(...support(src, 'Any'), instance(parse(isSource(k)).body[0], []), classDef(src, `${k}$${x.name}`, x.argTypes));
    }
    const fallback = choose(x.name, 'Any', x.args, false);
    let other, first = '';
    if (fallback && fnFields.has(x.name)) first = `if ${objectFirst(x.name, ps.length)}`;   // (CJI-3)
    if (fallback) {
      defs.push({ ...instance(fallback.def, x.argTypes), name: `$arr$${x.name}` });
      other = `$arr$${x.name}(o${ps.map((q) => `, ${q}`).join('')}${fallback.missing.length ? ', ' + fallback.missing.map(() => 'undefined').join(', ') : ''})`;
    } else other = `o.${x.name}(${ps.join(', ')})`;
    const branch = (k) => {
      const d = defs.find((y) => y.name === `${k}$${x.name}`), extra = d.params.length - 1 - ps.length;
      // (the arguments the method takes: JavaScript ignores the others, as m.get(k, d) does)
      return `if (${k}$is(o)) return ${k}$${x.name}(o${ps.slice(0, d.params.length - 1).map((q) => `, ${q}`).join('')}${extra > 0 ? ', undefined'.repeat(extra) : ''}); `;
    };
    let d = parse(`function ${x.name.replace('$', '_')}$dispatch(o /*: Any */${list}) /*: Any */ { ${cs.map(branch).join('')}${first}return ${other}; }`).body[0];
    plainCalls(d);
    if (first) d = instance(ownCalls(d), []);   // (its __isArray)
    defs.push(d);
    return make(defs);
  };
  // (CJI-3, lane 5: a node whose walk changes nothing below it is kept as it is, not copied: a round
  // rewrites a few calls, and a copy of the whole program beside it was most of this pass's peak. The
  // program is a tree here, as inference writes it, so keeping a node does not make it shared; the one
  // rewrite that puts a node in two places, a typed array's compound assignment, copies it.)
  const rebuild = (x) => {
    if (Array.isArray(x)) {
      let out = null;
      for (let i = 0; i < x.length; i++) {
        const v = walk(x[i]);
        if (out === null && v !== x[i]) out = x.slice(0, i);
        if (out !== null) out.push(v);
      }
      return out ?? x;
    }
    // (lane 6: the keys, and each value read by its key: Object.entries made an array a field)
    const keys = Object.keys(x);
    let out = null;
    for (let i = 0; i < keys.length; i++) {
      const old = x[keys[i]], v = walk(old);
      if (out === null && v !== old) {
        out = {};
        for (let j = 0; j < i; j++) out[keys[j]] = x[keys[j]];
      }
      if (out !== null) out[keys[i]] = v;
    }
    return out ?? x;
  };
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return rebuild(x);
    // (CJI-3, lane 6: the node's kind read once, and the kinds this walk never rewrites sent straight to
    // rebuild, past the tests below, every one of which asks for one of these kinds first: in stage 1 each
    // test was a dynamic read of x.kind)
    const kind = x.kind;
    if (kind === 'FunDef' && mine.has(x.name)) return x;
    // chapter 22: in a round for constructors, only they are made (see the rounds below)
    if (ctorsOnly && !(kind === 'LibCall' && x.name.startsWith('new ') && !x.recvUnknown)) return rebuild(x);
    switch (kind) {
      case 'LibCall': case 'Print': case 'MethodCall': case 'Index': case 'SetIndex': case 'Prim': break;
      default: return rebuild(x);
    }
    // chapter 22: library classes
    if (kind === 'LibCall' && x.recvUnknown && !last) return { ...x, args: walk(x.args) };   // (chapter 22: its argument's type first)
    if (kind === 'LibCall' && !last && (x.argTypes ?? []).some((t, k) => t === 'String' && maybeArray(x.args[k]))) {   // (CJI-3)
      deferred = true;
      return { ...x, args: walk(x.args) };
    }
    if (kind === 'Print' && x.argUnknown && !last) return { ...x, arg: walk(x.arg) };
    if (kind === 'LibCall' && x.name.startsWith('new ')) {
      const c = x.name.slice(4), ts = x.argTypes ?? [];
      const src = CLASSES[c].ctor(ts);
      return Call(Var(make([...support(src, ts[0]), classDef(src, `${c}$new`, ts.slice(1))])), walk(x.args).slice(0, src.match(/\(([^)]*)\)/)[1].split(',').filter((q) => q.trim()).length));
    }
    if (kind === 'MethodCall' && !x.plain && x.recvType !== undefined && (!x.recvUnknown || last)) {
      const c = classOfType(x.recvType);
      if (x.name === '$items') {   // for...of: the items to loop over
        if (c || x.recvType === 'Any') {
          if (!c && ![...used].some((k) => CLASSES[k].items)) return walk(x.obj);
          return Call(Var(make(itemsDefs(x.recvType, '$items'))), [walk(x.obj)]);
        }
        if (isArrayType(x.recvType) || x.recvType === 'String' || last) return walk(x.obj);   // an array or a string: itself
        deferred = true;   // (a number or a record here was typed before a call it depends on was: wait)
        return { ...x, obj: walk(x.obj) };
      }
      if (c) {
        const fn = classMethod(c, x.name, x.recvType, x.argTypes);
        if (!fn) throw new CompileError(`.${x.name}() is not a method of a ${c} in this subset`);
        return Call(Var(fn), pad(fn, [walk(x.obj), ...walk(x.args)]));
      }
      if (x.recvType === 'Any' && CLASS_METHOD_NAMES.has(x.name)) {
        const fn = dispatch(x);
        if (fn) return Call(Var(fn), [walk(x.obj), ...walk(x.args)]);
      }
    }
    // chapter 22: a split whose array must be dynamic: its fresh String[] copied into an Any[]
    if (kind === 'MethodCall' && x.elemType !== undefined && x.elemType !== 'String' && !x.anyCopied && STRING_METHODS[x.name]?.result === 'String[]')
      return Call(Var(make([parse(ANY_COPY).body[0]])), [{ ...x, obj: walk(x.obj), args: walk(x.args), anyCopied: true }]);
    if ((kind === 'Index' || kind === 'SetIndex') && classOfType(x.recvType)) {   // a typed array's a[i], a[i] = v
      const c = classOfType(x.recvType);
      const at = classMethod(c, '$at', x.recvType, []);
      if (!at) throw new CompileError(`a ${c} cannot be indexed in this subset`);
      if (kind === 'Index') return Call(Var(at), [walk(x.arr), walk(x.idx)]);
      const put = classMethod(c, '$put', x.recvType, []);
      let v = walk(x.exp);
      if (x.op) {
        if (!['Var', 'Int'].includes(x.arr.kind) || !['Var', 'Int'].includes(x.idkind)) throw new CompileError(`a compound assignment to an element of a ${c} needs a name and a name or number`);
        v = { kind: 'Prim', op: x.op, args: [Call(Var(at), [{ ...x.arr }, { ...x.idx }]), v] };
      }
      return Call(Var(put), [walk(x.arr), walk(x.idx), v]);
    }
    if (kind === 'Prim' && x.op === 'length' && classOfType(x.recvType)) return { kind: 'Get', obj: walk(x.args[0]), name: 'length' };
    if (kind === 'MethodCall' && x.recvType !== undefined && x.recvType !== 'String' && (!x.recvUnknown || last)) {
      const recv = x.recvType;
      const c = choose(x.name, recv, x.args, x.recvAnyElems);
      if (c) {
        const args = [walk(x.obj), ...walk(x.args), ...c.missing];
        const defs = [instance(c.def, x.argTypes)];
        if (c.def.name === 'sort_default') defs.unshift(instance(libraryDefs().get('sort'), [undefined, '(Any,Any)=>Number']));
        if (SHARED.includes(x.name) && recv === 'Any') {   // a string's method, or the array's
          const ps = range(c.def.params.length - 1).map((j) => `p${j}`), list = ps.map((q) => `, ${q} /*: Any */`).join('');
          const sm = STRING_METHODS[x.name];   // the string method's arguments, converted as it expects them
          const sargs = ps.slice(0, x.args.length).map((q, j) => (sm?.args[j] === 'String' ? `String(${q})` : q));
          const sd = parse(`function ${x.name}_dispatch(a /*: Any */${list}) { if (typeof a === 'string') return a.${x.name}(${sargs.join(', ')}); `
            + `return ${c.def.name}(a${ps.map((q) => `, ${q}`).join('')}); }`).body[0];
          plainCalls(sd);   // (CJI-3: its a.name(...) is the string's method, for inference too)
          defs.push(sd);
        }
        if (recv === 'Any' && fnFields.has(x.name)) {   // (CJI-3: an object's own function first)
          const n = args.length - 1, ps = range(n).map((j) => `p${j}`), list = ps.map((q) => `, ${q} /*: Any */`).join('');
          const d = parse(`function ${x.name}$own(o /*: Any */${list}) /*: Any */ { if ${objectFirst(x.name, x.args.length)}`
            + `return ${defs.at(-1).name}(o${ps.map((q) => `, ${q}`).join('')}); }`).body[0];
          plainCalls(d);
          defs.push(instance(ownCalls(d), []));
        }
        return Call(Var(make(defs)), args);
      }
    }
    // chapter 20: console.log of an array, an object or a dynamic value goes through $show,
    // which gives back a primitive as it is and anything else as Node's inspect writes it
    if (kind === 'Print' && x.argType !== undefined && !x.shown && (x.argType === 'Any' || isArrayType(x.argType) || isRecordType(x.argType))) {
      if (!show) {   // (not one of `mine`: walked like the program, so its Array.isArray is instantiated)
        const u = uniquify({ kind: 'Program', body: coreDefs(INSPECT_NAMES) });
        add(u.body);
        show = u.body.at(-1).name;
      }
      // (a typed array is copied into an Any[] for it, so that printing it does not make the
      // program's array dynamic, which a String[] from split cannot be)
      const c = classOfType(x.argType);   // (chapter 22: a class's instance, through its dynamic copy)
      const arg = c ? Call(Var(make([parse(ANY_COPY).body[0], classDef(CLASSES[c].toAny, `${c}$toAny`)])), [walk(x.arg)])
        : isArrayType(x.argType) ? Call(Var(make([parse(ANY_COPY).body[0]])), [walk(x.arg)]) : walk(x.arg);
      return { ...x, arg: Call(Var(show), [arg]), shown: true };
    }
    if (kind === 'LibCall' && x.name === 'Array.from' && x.args.length === 1 && (classOfType(x.argTypes?.[0]) || (x.argTypes?.[0] === 'Any' && [...used].some((k) => CLASSES[k].items)))) {
      // chapter 22: a class's items (a copy already), or for a dynamic value whichever it is
      const items = make(itemsDefs(x.argTypes[0], '$items'));
      if (classOfType(x.argTypes[0])) return Call(Var(items), [walk(x.args[0])]);
      return Call(Var(make([instance(libraryDefs().get('Array_from_array'), [])])), [Call(Var(items), [walk(x.args[0])])]);
    }
    if (kind === 'LibCall') {
      const t = x.argTypes ?? [];
      const lib = libraryDefs();
      let def;
      if (x.name === 'Array.isArray') def = lib.get('Array_isArray');
      else if (x.name === 'Array') def = lib.get('Array_new');
      else if (t[0] === 'String') def = lib.get('Array_from_string');
      else if (t[0] && t[0].startsWith('{') && x.args.length === 2) def = lib.get('Array_from_length');
      else def = lib.get(x.args.length === 2 ? 'Array_from_array_map' : 'Array_from_array');
      // Array.from({ length: n }, f): the record's length field (a record has no .length of its own)
      const args = def.name === 'Array_from_length' ? [{ kind: 'Get', obj: walk(x.args[0]), name: 'length' }, walk(x.args[1])] : walk(x.args);
      return Call(Var(make([instance(def, t.slice(1))])), args);
    }
    return rebuild(x);
  };
  // Rounds: a receiver whose type is still unknown (the result of another library call,
  // a.filter(f).map(g)) waits until inference has typed the copies made before it; in the
  // last round it is taken as Any.
  // (chapter 22: a round that can make constructors makes only them. Until an instance's
  // class is known, a type that includes it is too narrow: [new Set(xs), 7] would be a
  // Number[], and its for...of or Array.from decided for numbers.)
  let last = false, deferred = false, ctorsOnly = false;
  // (CJI-3: the ranges' work, kept from one round to the next; see ranges.js. Lane 5: as text in the build's
  // store; and none when the caller says so (memo false): stage 1 with its store in the heap, where the memo
  // was 2.25 MB of agenda's 7.0 MB and 6.25 of collections/maps' 11.5 and saved little time. It decides time
  // only, never the output.)
  const episodes = memo ? { store: store ?? memoryStore() } : null;
  for (let round = 0; ; round++) {
    const before = added.length;
    deferred = false;
    ctorsOnly = hasCtor(p.body);
    let body = walk(p.body);
    if (ctorsOnly && added.length === before) { ctorsOnly = false; body = walk(p.body); }
    if (added.length > before) {
      // (CJI-3: the program before this round is not needed while inference runs on the new one)
      const input = { ...p, body: [...added.slice(before), ...body] };
      p = null;
      body = null;
      added.length = 0;
      p = inferTypes(input, episodes, true);   // (lane 5: input is this call's alone, and a tree)
      program(p.body);
    }
    else if (!last && (hasUnknown(p.body) || deferred)) { last = true; p = { ...p, body }; }
    else {
      if (episodes) dropEpisodes(episodes);   // (lane 5: the memo's last texts and episodes leave the store with the pass)
      return { ...p, body };   // (chapter 22: with the rewrites that add nothing, $items of an array)
    }
    if (round > 20) throw new Error('instantiate_library: too many rounds');
  }
}
const hasCtor = (x) => x !== null && typeof x === 'object'
  && (Array.isArray(x) ? x.some(hasCtor) : (x.kind === 'LibCall' && x.name.startsWith('new ') && !x.recvUnknown) || Object.values(x).some(hasCtor));
const hasUnknown = (x) => x !== null && typeof x === 'object'
  && (Array.isArray(x) ? x.some(hasUnknown) : ((x.kind === 'MethodCall' || x.kind === 'LibCall') && x.recvUnknown) || (x.kind === 'Print' && x.argUnknown && !x.shown) || Object.values(x).some(hasUnknown));

// Chapter 22: a class function's record literals whose first field is a class's brand make
// that class's instances.
function markLib(x) {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(markLib);
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = markLib(v);
  if (x.kind === 'Record' && x.fields.length && BRANDS[x.fields[0].name]) out.lib = BRANDS[x.fields[0].name];
  return out;
}
// A dispatcher's own o.name(args) is the receiver's function field, never dispatched again.
function plainCalls(x) {
  if (x === null || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach(plainCalls); return; }
  if (x.kind === 'MethodCall') x.plain = true;
  Object.values(x).forEach(plainCalls);
}

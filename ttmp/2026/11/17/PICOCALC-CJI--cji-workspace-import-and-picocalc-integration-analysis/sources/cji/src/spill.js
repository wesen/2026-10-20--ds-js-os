// CJI-3: spilling. A build that streams functions through the later passes (compileToText in
// pipeline.js) keeps each function, between its turns, as text in a store instead of as IR objects:
// the program after uncover_get, each function's printed SLIR (with holes for names), and the code
// canonical_names hashes. A store is anything with put(text) -> id and get(id) -> text. The memory
// store keeps the strings in the heap, where a function's text is about half the size of its objects;
// a file store (src/spill-file.js, the host's) keeps them on storage, so that the compiler holds an
// index and one function at a time.
//
// The IR is plain data: objects, arrays, strings, booleans, null, numbers, and three things JSON does
// not carry, which are written as one-key objects: undefined ({"$u":0}; JSON would drop it from an
// object and make it null in an array), a number JSON cannot print (Infinity, -Infinity, NaN, -0:
// {"$n":"-0"}), and an array hole from chapter 19 ({"$h":0}, dynamic.js's HOLE). A node two parents
// shared comes back as two copies; no pass after uncover_get tells them apart.
import { HOLE as ARRAY_HOLE } from './dynamic.js';

const ODD = new Set(['$u', '$n', '$h']);

// (CJI-3: written out by hand rather than with JSON.stringify's replacer, which the subset lacks, so
// that the stage-1 compiler spills too; the text is the same JSON)
export function serialize(value) {
  const out = [];
  put(value, out);
  return out.join('');
}
function put(v, out) {
  if (v === undefined) { out.push('{"$u":0}'); return; }
  if (v === null) { out.push('null'); return; }
  if (v === ARRAY_HOLE) { out.push('{"$h":0}'); return; }
  if (typeof v === 'number') {
    if (v !== v || v === Infinity || v === -Infinity || (v === 0 && 1 / v < 0)) out.push(`{"$n":"${v === 0 ? '-0' : String(v)}"}`);
    else out.push(String(v));
    return;
  }
  if (typeof v === 'string') { out.push(JSON.stringify(v)); return; }
  if (typeof v === 'boolean') { out.push(v ? 'true' : 'false'); return; }
  if (Array.isArray(v)) {
    out.push('[');
    for (let i = 0; i < v.length; i++) {
      if (i > 0) out.push(',');
      put(v[i], out);
    }
    out.push(']');
    return;
  }
  out.push('{');
  const keys = Object.keys(v);
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) out.push(',');
    out.push(JSON.stringify(keys[i]), ':');
    put(v[keys[i]], out);
  }
  out.push('}');
}

export function deserialize(text) {
  return fix(JSON.parse(text));
}

// (JSON.parse's reviver deletes what it returns undefined for, which would turn an undefined element
// into a hole: so the one-key objects are replaced after parsing, in place)
function fix(x) {
  if (x === null || typeof x !== 'object') return x;
  if (!Array.isArray(x)) {
    const keys = Object.keys(x);
    if (keys.length === 1 && ODD.has(keys[0])) {
      if (keys[0] === '$u') return undefined;
      if (keys[0] === '$h') return ARRAY_HOLE;
      return x.$n === '-0' ? -0 : Number(x.$n);
    }
    for (const k of keys) x[k] = fix(x[k]);
    return x;
  }
  for (let i = 0; i < x.length; i++) x[i] = fix(x[i]);
  return x;
}

export function memoryStore() {
  const texts = [];
  return {
    put: (text) => texts.push(text) - 1,
    get: (id) => texts[id],
    drop: (id) => { texts[id] = null; },
  };
}

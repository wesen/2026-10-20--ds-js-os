// Chapter 22: library classes. A library class is a kind of object the library defines in the
// subset: a record whose first field is the class's brand ($mk for a Map), made by the
// class's constructor, whose literal is marked lib so that inference keeps its instances
// apart from every other record (src/infer.js). Its methods take the instance as their first
// parameter, without a type: instantiate_library (src/library.js) gives each call its own
// copy, so a method is typed by the class of the instance it is called on, as chapter 15's
// array methods are typed by their arrays.
//
// Every entry of a class is a function from the call's argument types (as inference wrote
// them, receiver first for methods) to the source of the function the call gets, or null
// when the call is not one the class has. The source may use the names in USES, whose
// functions are copied with it: SELF_ITEMS is the items function of the class of the call's
// argument (chapter 22's $items), chosen by instantiate_library.

// SameValueZero, for a Map's keys and a Set's values: NaN is NaN, and (on insertion) -0 is 0.
// The -0 rule needs a number; a key of another type skips it (k === 0 would not type).
const ZERO = (t, x) => (t === 'Number' ? `${x} === 0 ? 0 : ${x}` : t === 'Any' ? `$zeroAny(${x})` : x);
// (chapter 31: a key the instantiation saw as Any may be inferred later as a record, where x === 0
// would not type; through a function of an Any it stays a comparison of dynamic values)
const ZERO_ANY = 'function $zeroAny(x /*: Any */) /*: Any */ { return x === 0 ? 0 : x; }';
const SAME = (a, b) => `(${a} === ${b} || (${a} !== ${a} && ${b} !== ${b}))`;
const elemOf = (t) => (t && t.endsWith('[]') ? t.slice(0, -2) : t === 'String' ? 'String' : 'Any');   // (a string's items are strings)

// Grow the array in the variable a by one element x (no push in the library's own code:
// its copies are not walked for method calls).
const APPEND = (a, x) => `{ const n = ${a}.length; ${a}.length = n + 1; ${a}[n] = ${x}; }`;

// Chapter 31: a Map's or Set's index. A collection of more than 8 keys keeps, besides its keys in
// insertion order, a hash index: an Int[] of a power-of-two length at least twice the size, each
// slot 0 (empty) or 1 + a key's position; collisions go to the next slot. The hash is the native
// primitive $nat_key_hash (runtime.c rt_key_hash). A key hashed by its address (an object) is
// marked in the index's flag, and the index is rebuilt when the collector may have moved it:
// when $nat_gc_epoch, the count of collections, is not the one the index was built at.
// (The index's fields sort after the brand, which must come first in the instance's type.)
const KEYED = (f) => {
  const { keys, index, objs, epoch, rebuild } = f;
  // (an element is read into a constant before it is compared: a comparison with a[i] itself is
  // chapter 23's dynamic one, undefined past the end, which costs two calls)
  // the position of key k in c, or -1, in p
  const find = (c, k) => `let p = -1;
    if (${c}.${index}.length === 0) { const ks = ${c}.${keys}; for (let i = 0; i < ${c}.size; i++) { const ki = ks[i]; if (${SAME('ki', k)}) { p = i; break; } } }
    else {
      if (${c}.${objs} && ${c}.${epoch} !== $nat_gc_epoch()) ${rebuild}(${c});
      const h = ${c}.${index}, ks = ${c}.${keys}, mask = h.length - 1;
      let hk = $nat_key_hash(${k}); if (hk < 0) hk = -hk - 1;
      let s = hk & mask, hs = h[s];
      while (hs !== 0) { const q = (hs - 1) | 0; const kq = ks[q]; if (${SAME('kq', k)}) { p = q; break; } s = (s + 1) & mask; hs = h[s]; } }`;
  // after key k was appended (c.size counts it): index it, or build the index
  const added = (c, k) => `{ const n = ${c}.size | 0;
    if (n > 8) {
      if (2 * n > ${c}.${index}.length || (${c}.${objs} && ${c}.${epoch} !== $nat_gc_epoch())) ${rebuild}(${c});
      else {
        const h = ${c}.${index}, mask = h.length - 1;
        let hk = $nat_key_hash(${k});
        if (hk < 0) { hk = -hk - 1; if (!${c}.${objs}) { ${c}.${objs} = true; ${c}.${epoch} = $nat_gc_epoch(); } }
        let s = hk & mask, hs = h[s]; while (hs !== 0) { s = (s + 1) & mask; hs = h[s]; } h[s] = n; } } }`;
  // after keys were removed: a smaller collection drops its index, a larger one rebuilds it
  const removed = (c) => `if (${c}.size > 8) ${rebuild}(${c}); else ${c}.${index}.length = 0;`;
  // the whole index, from the keys (allocating first: no collection between hashing and the epoch)
  const source = `function ${rebuild}(c) {
    let cap = 16; while (cap < 2 * c.size) cap = cap << 1;
    const h = []; h.length = cap; for (let i = 0; i < cap; i++) h[i] = 0;
    const ks = c.${keys}, mask = cap - 1; let o = false;
    for (let i = 0; i < c.size; i++) {
      let hk = $nat_key_hash(ks[i]); if (hk < 0) { o = true; hk = -hk - 1; }
      let s = hk & mask, hs = h[s]; while (hs !== 0) { s = (s + 1) & mask; hs = h[s]; } h[s] = (i + 1) | 0; }
    c.${index} = h; c.${objs} = o; c.${epoch} = $nat_gc_epoch(); }`;
  const fields = `${index}: h, ${objs}: false, ${epoch}: 0`;
  return { find, added, removed, source, fields };
};
const MAPX = KEYED({ keys: '$mk', index: '$mx', objs: '$my', epoch: '$mz', rebuild: '$mapIndex' });
const SETX = KEYED({ keys: '$sv', index: '$sx', objs: '$sy', epoch: '$sz', rebuild: '$setIndex' });

// The native primitives' reference definitions, which the interpreters run (slas assembles rt_NAME
// for $nat_NAME), and the helpers the classes' sources use. Any hash that agrees with SameValueZero
// will do: this one is not the C function's, but like it, it marks an object as hashed by identity,
// so that the interpreters take every path the C function makes.
export const NATIVES = {
  $nat_key_hash: `function $nat_key_hash(k /*: Any */) /*: Int */ {
    const t = typeof k;
    if ((t === "object" && k !== null) || t === "function") return -1;
    if (t === "string") { const s /*: String */ = k; const n = s.length; return n === 0 ? 3 : (n * 961 + s.charCodeAt(n >> 1) * 31 + s.charCodeAt(n - 1)) & 1073741823; }
    if (t === "number") { const x /*: Number */ = k; return (x * 1000003) & 1073741823; }
    return k === true ? 1 : 2; }`,
  $nat_gc_epoch: 'function $nat_gc_epoch() /*: Int */ { return 0; }',
  $zeroAny: ZERO_ANY,
  $mapIndex: MAPX.source,
  $setIndex: SETX.source,
};

const MAP = {
  brand: '$mk',
  // new Map() and new Map(pairs): an array of [key, value] arrays, a Map, or a dynamic value
  ctor: (ts) => (ts.length === 0
    ? `function Map$new() { const ks = [], vs = []; const h = []; return { $mk: ks, $mv: vs, ${MAPX.fields}, size: 0 }; }`
    : `function Map$new(it) { const ks = [], vs = []; const h = []; const m = { $mk: ks, $mv: vs, ${MAPX.fields}, size: 0 }; const es = SELF_ITEMS(it);
        for (let i = 0; i < es.length; i++) { const e = es[i]; const k = ${ZERO(elemOf(elemOf(ts[0])), 'e[0]')};
          ${MAPX.find('m', 'k')}
          if (p >= 0) m.$mv[p] = e[1]; else { const ks1 = m.$mk, vs1 = m.$mv; ${APPEND('ks1', 'k')} ${APPEND('vs1', 'e[1]')} m.size = (m.size + 1) | 0; ${MAPX.added('m', 'k')} } }
        return m; }`),
  methods: {
    get: (ts) => `function get(m, k) { ${MAPX.find('m', 'k')} return p >= 0 ? m.$mv[p] : undefined; }`,
    has: (ts) => `function has(m, k) { ${MAPX.find('m', 'k')} return p >= 0; }`,
    set: (ts) => `function set(m, k0, v) { const k = ${ZERO(ts[1], 'k0')};
        ${MAPX.find('m', 'k')}
        if (p >= 0) { m.$mv[p] = v; return m; }
        const ks = m.$mk, vs = m.$mv; ${APPEND('ks', 'k')} ${APPEND('vs', 'v')} m.size = (m.size + 1) | 0;
        ${MAPX.added('m', 'k')} return m; }`,
    delete: (ts) => `function del(m, k) { ${MAPX.find('m', 'k')}
        if (p < 0) return false;
        const ks = m.$mk, vs = m.$mv, n = m.size;
        for (let j = p + 1; j < n; j++) { ks[j - 1] = ks[j]; vs[j - 1] = vs[j]; }
        ks.length = n - 1; vs.length = n - 1; m.size = (n - 1) | 0; ${MAPX.removed('m')} return true; }`,
    clear: () => 'function clear(m) { const ks = m.$mk, vs = m.$mv; ks.length = 0; vs.length = 0; m.size = 0; m.$mx.length = 0; return undefined; }',
    forEach: () => 'function forEach(m, f) { for (let i = 0; i < m.size; i++) __call(f, m.$mv[i], m.$mk[i], m); return undefined; }',
    keys: () => 'function keys(m) { const r = []; r.length = m.size; for (let i = 0; i < m.size; i++) r[i] = m.$mk[i]; return r; }',
    values: () => 'function values(m) { const r = []; r.length = m.size; for (let i = 0; i < m.size; i++) r[i] = m.$mv[i]; return r; }',
    entries: () => 'function entries(m) { const r = []; r.length = m.size; for (let i = 0; i < m.size; i++) r[i] = [m.$mk[i], m.$mv[i]]; return r; }',
  },
  items: 'entries',
  // a copy whose fields are dynamic, for printing (chapter 20's $show)
  // (two loops, not $anyCopy twice: one copy of it would join the keys' and values' types)
  toAny: `function Map$toAny(m) { const ks /*: Any[] */ = [], vs /*: Any[] */ = []; ks.length = m.size; vs.length = m.size;
    for (let i = 0; i < m.size; i++) { ks[i] = m.$mk[i]; vs[i] = m.$mv[i]; }
    const r /*: Any */ = { $mk: ks, $mv: vs, size: m.size }; return r; }`,
};

const SET = {
  brand: '$sv',
  ctor: (ts) => (ts.length === 0
    ? `function Set$new() { const vs = []; const h = []; return { $sv: vs, ${SETX.fields}, size: 0 }; }`
    : `function Set$new(it) { const vs = []; const h = []; const c = { $sv: vs, ${SETX.fields}, size: 0 }; const es = SELF_ITEMS(it);
        for (let i = 0; i < es.length; i++) { const x = ${ZERO(elemOf(ts[0]), 'es[i]')};
          ${SETX.find('c', 'x')}
          if (p < 0) { const vs1 = c.$sv; ${APPEND('vs1', 'x')} c.size = (c.size + 1) | 0; ${SETX.added('c', 'x')} } }
        return c; }`),
  methods: {
    has: () => `function has(c, x) { ${SETX.find('c', 'x')} return p >= 0; }`,
    add: (ts) => `function add(c, x0) { const x = ${ZERO(ts[1], 'x0')};
        ${SETX.find('c', 'x')}
        if (p >= 0) return c;
        const vs = c.$sv; ${APPEND('vs', 'x')} c.size = (c.size + 1) | 0; ${SETX.added('c', 'x')} return c; }`,
    delete: () => `function del(c, x) { ${SETX.find('c', 'x')}
        if (p < 0) return false;
        const vs = c.$sv, n = c.size;
        for (let j = p + 1; j < n; j++) vs[j - 1] = vs[j];
        vs.length = n - 1; c.size = (n - 1) | 0; ${SETX.removed('c')} return true; }`,
    clear: () => 'function clear(c) { const vs = c.$sv; vs.length = 0; c.size = 0; c.$sx.length = 0; return undefined; }',
    forEach: () => 'function forEach(s, f) { for (let i = 0; i < s.size; i++) __call(f, s.$sv[i], s.$sv[i], s); return undefined; }',
    values: () => 'function values(s) { const r = []; r.length = s.size; for (let i = 0; i < s.size; i++) r[i] = s.$sv[i]; return r; }',
    keys: () => 'function keys(s) { const r = []; r.length = s.size; for (let i = 0; i < s.size; i++) r[i] = s.$sv[i]; return r; }',
    entries: () => 'function entries(s) { const r = []; r.length = s.size; for (let i = 0; i < s.size; i++) r[i] = [s.$sv[i], s.$sv[i]]; return r; }',
  },
  items: 'values',
  toAny: 'function Set$toAny(s) { const r /*: Any */ = { $sv: $anyCopy(s.$sv), size: s.size }; return r; }',
};

// Typed arrays: one class per element kind, each with the conversion a write applies. A read
// past the end stops the program, as an array's does (JavaScript gives undefined); a write
// past the end is ignored, as in JavaScript. (The methods read the length from the elements'
// array: in the class's own code o.length would be the array operator, not the field.)
export const TYPED_KINDS = [
  ['Uint8Array', '$u8', (x) => `${x} & 255`],
  ['Int8Array', '$i8', (x) => `(${x} << 24) >> 24`],
  ['Uint8ClampedArray', '$c8', (x) => `$clamp8(${x})`],
  ['Int16Array', '$i16', (x) => `(${x} << 16) >> 16`],
  ['Uint16Array', '$u16', (x) => `${x} & 65535`],
  ['Int32Array', '$i32', (x) => `${x} | 0`],
  ['Uint32Array', '$u32', (x) => `${x} >>> 0`],
  ['Float32Array', '$f32', (x) => `Math.fround(${x})`],
  ['Float64Array', '$f64', (x) => `${x} * 1`],
];
// Uint8ClampedArray's conversion: to 0..255, ties to even (2.5 is 2)
export const CLAMP8 = `function $clamp8(v /*: Number */) /*: Int */ {
  if (!(v > 0)) return 0;
  if (v >= 255) return 255;
  const f = Math.floor(v), d = v - f;
  return (d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1) | 0;
}`;

function typed(name, brand, conv) {
  const zero = brand === '$f32' || brand === '$f64' ? '0.5 - 0.5' : '0';   // (a Number for the float kinds)
  return {
    brand,
    ctor: (ts) => {
      if (ts.length === 0) return `function ${name}$new() { const a = []; return { ${brand}: a, length: 0 }; }`;
      if (ts[0] === 'Int' || ts[0] === 'Number')   // new Uint8Array(n): n zeros
        return `function ${name}$new(n0) { const n = n0 | 0; const a = []; a.length = n; for (let i = 0; i < n; i++) a[i] = ${zero}; return { ${brand}: a, length: n }; }`;
      // CJI-3: new Uint8Array(x) of a dynamic x: n zeros when it is a number (the stage-1 compiler's
      // dynamic sizes), its items otherwise
      if (ts[0] === 'Any')
        return `function ${name}$new(it) { if (typeof it === 'number') { const n = it | 0; const z = []; z.length = n; for (let i = 0; i < n; i++) z[i] = ${zero}; return { ${brand}: z, length: n }; }
        const es = SELF_ITEMS(it); const n = es.length; const a = []; a.length = n;
        for (let i = 0; i < n; i++) a[i] = ${conv('es[i] * 1')}; return { ${brand}: a, length: n }; }`;
      // new Uint8Array(items): each converted
      return `function ${name}$new(it) { const es = SELF_ITEMS(it); const n = es.length; const a = []; a.length = n;
        for (let i = 0; i < n; i++) a[i] = ${conv('es[i] * 1')}; return { ${brand}: a, length: n }; }`;
    },
    methods: {
      $at: () => `function at(o, i) { return o.${brand}[i | 0]; }`,
      $put: () => `function put(o, i, v) { const k = i | 0; const a = o.${brand}; if (k === i && k >= 0 && k < a.length) a[k] = ${conv('v * 1')}; return v; }`,
      fill: () => `function fill(o, v, start, end) { const a = o.${brand}; const n = a.length; const x = ${conv('v * 1')};
        let s = start === undefined ? 0 : Math.trunc(start * 1); let e = end === undefined ? n : Math.trunc(end * 1);
        if (s < 0) { s = s + n; if (s < 0) s = 0; } else if (s > n) s = n;
        if (e < 0) { e = e + n; if (e < 0) e = 0; } else if (e > n) e = n;
        for (let i = s; i < e; i++) a[i] = x; return o; }`,
      values: () => `function values(o) { const a = o.${brand}; const r = []; r.length = a.length; for (let i = 0; i < a.length; i++) r[i] = a[i]; return r; }`,
      // CJI-3: t.set(items, offset): the items converted and copied in from offset on, a
      // RangeError if they do not fit (the items are copied first, in case they are t's own)
      set: (ts) => {
        // (a typed source by its brand, read from its type: {$i32:...}; CLASSES is not made yet here)
        const s = ts[1], m = typeof s === 'string' && !s.endsWith('[]') ? /^\{(\$[a-z0-9]+):/.exec(s) : null;
        const items = s === 'Any' ? 'SELF_ITEMS(src)' : typeof s === 'string' && s.endsWith('[]') ? 'src'
          : m && TYPED_KINDS.some(([, b]) => b === m[1]) ? `src.${m[1]}` : null;
        if (!items) return null;
        return `function set(o, src, offset) { const a = o.${brand}; const es = ${items}; const n = es.length;
          const t = []; t.length = n; for (let i = 0; i < n; i++) t[i] = es[i];
          const k0 = offset === undefined ? 0 : Math.trunc(offset * 1); const k = k0 !== k0 ? 0 : k0;
          if (k < 0 || k + n > a.length) throw new RangeError("offset is out of bounds");
          for (let i = 0; i < n; i++) a[k + i] = ${conv('t[i] * 1')}; return undefined; }`;
      },
    },
    items: 'values',
    toAny: `function ${name}$toAny(o) { const a = o.${brand}; const r /*: Any */ = { ${brand}: $anyCopy(a), length: a.length }; return r; }`,
  };
}

// Dates (chapter 21's, as a class): { $date: t }, t the time value. The calendar and the
// formats are chapter 21's functions of t (CORE_SOURCE in src/parse.js); the methods only
// take t out of the instance.
const DATE_FIELDS = ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds'];
const DATE = {
  brand: '$date',
  ctor: (ts) => {
    if (ts.length === 0) return 'function Date$new() { return { $date: Math.$now() }; }';
    if (ts.length === 1) {
      if (ts[0] === 'Int' || ts[0] === 'Number') return 'function Date$new(t) { return { $date: Date$clip(t) }; }';
      if (ts[0].startsWith('{$date:')) return 'function Date$new(d) { return { $date: d.$date }; }';
      return 'function Date$new(v) { return { $date: Date$clip(Date$value(v)) }; }';
    }
    const ps = ['y', 'm', 'd', 'h', 'mi', 's', 'ms'], dflt = ['', '', '1', '0', '0', '0', '0'];
    const args = ps.map((q, k) => (k < ts.length ? q : dflt[k]));
    return `function Date$new(${ps.slice(0, Math.min(ts.length, 7)).join(', ')}) { return { $date: Date$clip(Date$utc(Date$compose(${args.join(', ')}))) }; }`;
  },
  methods: {
    getTime: () => 'function getTime(d) { return d.$date; }',
    valueOf: () => 'function valueOf(d) { return d.$date; }',
    getTimezoneOffset: () => 'function getTimezoneOffset(d) { return Date$tzo(d.$date); }',
    toISOString: () => 'function toISOString(d) { return Date$iso(d.$date); }',
    toJSON: () => 'function toJSON(d) { return Date$json(d.$date); }',
    toUTCString: () => 'function toUTCString(d) { return Date$utcString(d.$date); }',
    toGMTString: () => 'function toGMTString(d) { return Date$utcString(d.$date); }',
    toTimeString: () => 'function toTimeString(d) { return Date$timeString(d.$date); }',
    ...Object.fromEntries(DATE_FIELDS.flatMap((f, k) => [
      [`get${f}`, () => `function get${f}(d) { return Date$get(d.$date, true, ${k}); }`],
      [`getUTC${f}`, () => `function getUTC${f}(d) { return Date$get(d.$date, false, ${k}); }`]])),
  },
  items: null,
  toAny: 'function Date$toAny(d) { const r /*: Any */ = { $date: d.$date }; return r; }',
};

export const CLASSES = Object.assign(Object.create(null), {
  Map: MAP, Set: SET, Date: DATE,
  ...Object.fromEntries(TYPED_KINDS.map(([n, b, c]) => [n, typed(n, b, c)])),
});
// A class's name from its brand, and from a type that inference wrote ({$mk:..., ...})
export const BRANDS = Object.assign(Object.create(null), Object.fromEntries(Object.entries(CLASSES).map(([n, c]) => [c.brand, n])));
export function classOfType(t) {
  if (typeof t !== 'string' || !t.startsWith('{$') || t.endsWith('[]')) return null;   // (an array of instances is an array)
  const m = /^\{(\$[a-z0-9]+):/.exec(t);
  return m ? BRANDS[m[1]] ?? null : null;
}
// The method names of the classes, for a call on a dynamic receiver
export const CLASS_METHOD_NAMES = new Set(Object.values(CLASSES).flatMap((c) => Object.keys(c.methods)));
// A class's instance test, on a dynamic value
export const isSource = (name) => `function ${name}$is(o /*: Any */) /*: Bool */ { return o !== null && typeof o === "object" && !__isArray(o) && "${CLASSES[name].brand}" in o; }`;

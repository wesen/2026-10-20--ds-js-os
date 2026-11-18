// Chapter 13: the machine model's strings and records, as runtime.c lays them out.
//
// A string is an object of kind 3: its header, then the number of its UTF-16 code units,
// then the units, four to a word (unit k in bits 16(k mod 4) of word k / 4, as a
// little-endian machine stores a uint16_t array). A record is a kind-2 object with bit 52
// set in its header: its word 1 is its shape, a static table of its field names
// (count, then a pointer to each name's string), and its fields follow.
//
// Static strings (literals) and shapes live below the heap, made once each by strref and
// shaperef: the same text gives the same address, so two shapes compare by address.

import { Trap, Thrown } from './interp.js';
import { ARRAY_HEADER } from './select.js';
import { STRING_METHODS, STRING_OPS, StringTrap } from './strings.js';
import { ANY_NULL, ANY_FALSE, ANY_TRUE, ANY_UNDEFINED, encodeNumber, decodeNumber, doubleBits, bitsDouble,
  TYPE_ERROR, TYPEOF, jsKeyOrder, TYPED_CONV } from './dynamic.js';

export const STR_BASE = 0x00a00000;
const RECORD_BIT = 2 ** 52;
const ANY_HOLE = 14;   // chapter 19: a deleted field's mark

// The words of a string's units, as BigInts.
function packUnits(s) {
  const words = [];
  for (let k = 0; k < s.length; k += 4) {
    let w = 0n;
    for (let j = 0; j < 4 && k + j < s.length; j++) w |= BigInt(s.charCodeAt(k + j)) << BigInt(16 * j);
    words.push(BigInt.asIntN(64, w));
  }
  return words;
}

// The handlers: each takes the model (m), the arguments, the frame, and gives the result
// word (or undefined for none). Allocating ones get the root stack's top last.
export class Strings {
  constructor(m) {
    this.m = m;
    this.statics = new Map();   // text -> address
    this.shapes = new Map();    // JSON of the names -> address
    this.next = STR_BASE;
  }

  // ---- layout ----
  isString(w) { return this.m.isPointerWord(w) && this.m.mem.has(w) && Math.floor(this.m.mem.get(w) / 2) % 4 === 3; }
  isRecord(w) {
    if (!this.m.isPointerWord(w) || !this.m.mem.has(w)) return false;
    const h = this.m.mem.get(w);
    return Math.floor(h / 2) % 4 === 2 && Math.floor(h / 2 ** 51) % 4 === 2;   // (chapter 15: 3 is an array)
  }
  // CJI-3: a typed array as a dynamic value (runtime.c typed_kind): a record whose first field is
  // named by a typed kind's brand and holds an Any[] of its items; the brand, or null
  typedBrand(o) {
    if (!this.isRecord(o)) return null;
    const names = this.shapeNames(this.m.mem.get(o + 8));
    return names.length >= 2 && Object.hasOwn(TYPED_CONV, names[0]) && this.m.isArray(this.m.mem.get(o + 16)) ? names[0] : null;
  }
  read(p, frame) {
    if (!this.isString(p)) this.m.stop(frame, `${this.m.hex?.(p) ?? p} is not a string`);
    const n = this.m.mem.get(p + 8);
    let s = '';
    for (let k = 0; k < n; k++) {
      const w = BigInt.asUintN(64, BigInt(this.m.mem.get(p + 16 + 8 * (k >> 2))));
      s += String.fromCharCode(Number((w >> BigInt(16 * (k & 3))) & 0xffffn));
    }
    return s;
  }
  layout(p, s) {
    const words = packUnits(s);
    this.m.mem.set(p, (words.length + 1) * 8 + 3 * 2 + 1);
    this.m.mem.set(p + 8, s.length);
    words.forEach((w, k) => this.m.mem.set(p + 16 + 8 * k, w));
  }
  // Chapter 23: as the runtime's throw_null_read: a TypeError, one static object for null and
  // one for undefined, thrown without allocating
  // (with V8's text, the key named: one static object per kind and key, as the runtime keeps)
  nullRead(o, name = null) {
    const kind = o === ANY_NULL ? 'null' : 'undefined';
    const key = name === null || name.length > 120 ? kind : `${kind} (reading '${name}')`;
    this.nullErrors ??= new Map();
    if (!this.nullErrors.has(key)) {
      const shape = this.shape(['message', 'name'], true), msg = this.intern(`Cannot read properties of ${key}`), nm = this.intern('TypeError');
      const p = this.next;
      this.next += 40;
      this.m.mem.set(p, 2 ** 52 + 14 * 65536 + 4 * 8 + 5);
      this.m.mem.set(p + 8, shape);
      this.m.mem.set(p + 16, msg);
      this.m.mem.set(p + 24, nm);
      this.m.mem.set(p + 32, ANY_UNDEFINED);
      this.nullErrors.set(key, p);
    }
    this.m.globals.set('exc_value', this.nullErrors.get(key));
    this.m.globals.set('exc_flag', 1);
    return ANY_UNDEFINED;
  }
  intern(text) {
    if (!this.statics.has(text)) {
      const p = this.next;
      this.layout(p, text);
      this.next += 8 * (2 + Math.ceil(text.length / 4));
      this.statics.set(text, p);
    }
    return this.statics.get(text);
  }
  // A shape: [count, names..., 1 if an Error's (chapter 14) else 0]
  shape(names, error = false) {
    const key = JSON.stringify(names) + (error ? ' error' : '');
    if (!this.shapes.has(key)) {
      const ptrs = names.map((n) => this.intern(n));
      const p = this.next;
      this.m.mem.set(p, names.length);
      ptrs.forEach((q, k) => this.m.mem.set(p + 8 + 8 * k, q));
      this.m.mem.set(p + 8 + 8 * names.length, error ? 1 : 0);
      this.next += 8 * (2 + names.length);
      this.shapes.set(key, p);
    }
    return this.shapes.get(key);
  }
  isError(w) {
    if (!this.isRecord(w)) return false;
    const p = this.m.mem.get(w + 8);
    return this.m.mem.get(p + 8 + 8 * this.m.mem.get(p)) === 1;
  }
  // Chapter 14: a new Error object, thrown: the runtime's two globals are set, and the
  // operation's result (unused) is 0.
  throwError(name, message, roots, frame) {
    const msg = this.make(message, roots, frame);
    const [nm] = [this.intern(name)];
    const [p, [m2]] = this.alloc(4, roots, [msg], frame);
    this.m.mem.set(p, 2 ** 52 + 14 * 65536 + 4 * 8 + 5);
    this.m.mem.set(p + 8, this.shape(['message', 'name'], true));
    this.m.mem.set(p + 16, m2);
    this.m.mem.set(p + 24, nm);
    this.m.mem.set(p + 32, ANY_UNDEFINED);   // chapter 19: no properties added
    this.m.globals.set('exc_value', p);
    this.m.globals.set('exc_flag', 1);
    return 0;
  }
  describe(w, frame) {
    try { return this.toString(w, frame); } catch { return this.typeName(w); }
  }
  shapeNames(p) {
    const n = this.m.mem.get(p);
    return Array.from({ length: n }, (_, k) => this.read(this.m.mem.get(p + 8 + 8 * k)));
  }

  // Space for an object of `words` fields, collecting first if it does not fit; the
  // pointers in `keep` are written to the root stack above `roots` meanwhile, and the
  // updated values come back.
  alloc(words, roots, keep, frame) {
    const m = this.m, bytes = 8 * (words + 1);
    let kept = keep;
    if (m.globals.get('free_ptr') + bytes > m.globals.get('fromspace_end')) {
      keep.forEach((v, k) => m.mem.set(roots + 8 * k, v));
      m.collect(roots + 8 * keep.length, bytes, frame);
      kept = keep.map((_, k) => m.mem.get(roots + 8 * k));
      keep.forEach((_, k) => m.mem.delete(roots + 8 * k));
    }
    const p = m.globals.get('free_ptr');
    m.globals.set('free_ptr', p + bytes);
    return [p, kept];
  }
  make(s, roots, frame) {
    const [p] = this.alloc(1 + Math.ceil(s.length / 4), roots, [], frame);
    this.layout(p, s);
    return p;
  }

  // ---- JavaScript's conversions on words ----
  toString(w, frame) {   // ToString of a dynamic value
    if (typeof w === 'bigint') return String(decodeNumber(w));
    if (w === ANY_TRUE || w === ANY_FALSE) return String(w === ANY_TRUE);
    if (w === ANY_NULL) return 'null';
    if (w === ANY_UNDEFINED) return 'undefined';
    if (this.isString(w)) return this.read(w, frame);
    if (this.isError(w)) {   // chapter 14: Error.prototype.toString
      const name = this.get(w, 'name', frame), msg = this.get(w, 'message', frame);
      const n = name === ANY_UNDEFINED ? 'Error' : this.toString(name, frame), m = msg === ANY_UNDEFINED ? '' : this.toString(msg, frame);
      return n === '' ? m : m === '' ? n : `${n}: ${m}`;
    }
    throw new Trap(TYPE_ERROR.string);
  }
  typeName(w) {
    if (typeof w === 'bigint') return 'number';
    if (w === ANY_TRUE || w === ANY_FALSE) return 'boolean';
    if (w === ANY_UNDEFINED) return 'undefined';
    if (w === ANY_NULL) return 'object';
    if (this.isString(w)) return 'string';
    if (this.isRecord(w) || this.m.isArray(w)) return 'object';
    return Math.floor(this.m.mem.get(w) / 2) % 4 === 2 ? 'function' : 'object';
  }

  // ---- the runtime functions; null when fn is not one of them ----
  call(fn, args, frame) {
    const m = this.m, str = (w) => this.read(w, frame), num = (w) => bitsDouble(w);
    const roots = args.at(-1);
    const m13 = Object.values(STRING_METHODS).find((x) => x.op === fn && fn !== 'str_concat');
    if (m13) {
      const recv = str(args[0]);
      const conv = m13.args.map((t, k) => (t === 'Number' ? num(args[k + 1]) : t === 'String' ? str(args[k + 1]) : args[k + 1]));
      let r;
      try { r = STRING_OPS[fn](recv, ...conv); } catch (e) {
        if (e instanceof StringTrap) throw new Trap(e.message);
        if (e instanceof Thrown) return this.throwError(e.value[2], e.value[1], roots, frame);   // chapter 14
        throw e;
      }
      switch (m13.result) {
        case 'String': return this.make(r, roots, frame);
        case 'Int': return r;
        case 'Bool': return r ? 1 : 0;
        case 'Number': return doubleBits(r);
        case 'String[]': return this.array(r, roots, frame);
        default: throw new Error(`model: result ${m13.result}`);
      }
    }
    switch (fn) {
      case 'print_str': case 'put_str':
        return { print: str(args[0]) };
      case 'str_concat': {
        const s = str(args[0]) + str(args[1]);
        return this.make(s, roots, frame);
      }
      case 'str_eq': return str(args[0]) === str(args[1]) ? 1 : 0;
      case 'str_cmp': { const a = str(args[0]), b = str(args[1]); return a < b ? -1 : a > b ? 1 : 0; }
      case 'str_index': {
        const s = str(args[0]), i = args[1];
        if (i < 0 || i >= s.length) throw new Trap(`index out of range: ${i} in a string of length ${s.length}`);
        return this.make(s[i], roots, frame);
      }
      case 'int_to_str': return this.make(String(args[0]), roots, frame);
      case 'num_to_radix': {   // chapter 14
        const r = num(args[1]);
        if (!(r >= 2 && r <= 36)) return this.throwError('RangeError', 'toString() radix argument must be between 2 and 36', roots, frame);
        return this.make(num(args[0]).toString(Math.trunc(r)), roots, frame);
      }
      case 'num_to_fixed': case 'num_to_precision': {   // chapter 21
        let r;
        try { r = STRING_OPS[fn](num(args[0]), num(args[1])); } catch (e) {
          if (e instanceof Thrown) return this.throwError(e.value[2], e.value[1], roots, frame);
          throw e;
        }
        return this.make(r, roots, frame);
      }
      case 'num_to_str': return this.make(String(num(args[0])), roots, frame);
      case 'bool_to_str': return this.intern(args[0] ? 'true' : 'false');
      case 'any_to_str': return this.make(this.toString(args[0], frame), roots, frame);
      case 'str_fromCharCode': return this.make(String.fromCharCode(num(args[0])), roots, frame);
      case 'any_typeof_str': return this.intern(this.typeName(args[0]));
      case 'any_as_str':
        if (!this.isString(args[0])) throw new Trap(TYPE_ERROR.String);
        return args[0];
      case 'any_to_record':
        if (!this.isRecord(args[0]) || m.mem.get(args[0] + 8) !== args[1]) throw new Trap(TYPE_ERROR.record);
        return args[0];
      case 'any_get': return this.get(args[0], str(args[1]), frame);
      case 'any_set': return this.set(args[0], args[1], args[2], roots, frame);
      // chapter 19
      case 'any_index': {
        const [o, k] = args;
        if (typeof k === 'bigint' && this.typedBrand(o)) {   // CJI-3
          const items = m.mem.get(o + 16), d = decodeNumber(k);
          return Number.isInteger(d) && d >= 0 && d < m.mem.get(items + 8) ? m.mem.get(m.mem.get(items + 16) + 8 + 8 * d) : ANY_UNDEFINED;
        }
        if ((m.isArray(o) || this.isString(o)) && typeof k === 'bigint') {
          const d = decodeNumber(k);
          // chapter 23: past the end (or not a whole number) is undefined
          if (!(Number.isInteger(d) && d >= 0 && d < m.mem.get(o + 8))) return ANY_UNDEFINED;
          if (this.isString(o)) return this.call('str_index', [o, d, roots], frame);
          return m.mem.get(m.mem.get(o + 16) + 8 + 8 * d);
        }
        if (o === ANY_NULL || o === ANY_UNDEFINED) return this.nullRead(o, this.isString(k) ? str(k) : typeof k === 'bigint' ? String(decodeNumber(k)) : null);   // chapter 23
        return this.get(o, str(this.keyOf(k, roots, frame)), frame);
      }
      case 'any_set_index': {
        const [o, k, v] = args;
        const brand = typeof k === 'bigint' && this.typedBrand(o);
        if (brand) {   // CJI-3: converted as the kind converts; outside it, ignored
          const items = m.mem.get(o + 16), d = decodeNumber(k);
          const n = typeof v === 'bigint' ? decodeNumber(v) : v === ANY_TRUE ? 1 : v === ANY_FALSE || v === ANY_NULL ? 0 : this.isString(v) ? Number(str(v)) : NaN;
          if (Number.isInteger(d) && d >= 0 && d < m.mem.get(items + 8)) m.mem.set(m.mem.get(items + 16) + 8 + 8 * d, encodeNumber(TYPED_CONV[brand](n)));
          return v;
        }
        if (m.isArray(o) && typeof k === 'bigint') {
          const d = decodeNumber(k);
          if (!Number.isSafeInteger(d)) throw new Trap(TYPE_ERROR.Int);
          if (d < 0 || d >= m.mem.get(o + 8)) throw new Trap('index out of range');
          m.mem.set(m.mem.get(o + 16) + 8 + 8 * d, v);
          return v;
        }
        if (!this.isRecord(o)) throw new Trap('setting a property of a value that is not an object is outside the subset');
        const [name, [o2, v2]] = this.keep([o, v], roots, (r) => this.keyOf(k, r, frame));
        return this.set(o2, name, v2, roots, frame);
      }
      case 'any_delete': {
        const [o, k] = args;
        if (!this.isRecord(o)) return 1;
        const [name, [o2]] = this.keep([o], roots, (r) => this.keyOf(k, r, frame));
        const f = this.shapeNames(m.mem.get(o2 + 8)).indexOf(str(name)), x = this.extraFind(o2, str(name));
        if (x >= 0) this.extraRemove(o2, x);
        if (f >= 0) {   // a field: gone, as the pair (name, HOLE) says
          m.mem.set(o2 + 16 + 8 * f, ANY_UNDEFINED);
          this.extraAdd(o2, name, ANY_HOLE, roots, frame);
        }
        return 1;
      }
      case 'any_in': {
        const [k, o] = args;
        if (m.isArray(o)) {
          if (typeof k === 'bigint') { const d = decodeNumber(k); return Number.isInteger(d) && d >= 0 && d < m.mem.get(o + 8) ? 1 : 0; }
          return this.isString(k) && str(k) === 'length' ? 1 : 0;
        }
        if (!this.isRecord(o)) throw new Trap("TypeError: 'in' needs an object");
        const [name, [o2]] = this.keep([o], roots, (r) => this.keyOf(k, r, frame));
        const f = this.shapeNames(m.mem.get(o2 + 8)).indexOf(str(name)), x = this.extraFind(o2, str(name));
        if (x >= 0) return m.mem.get(this.elem(m.mem.get(this.extraAddr(o2)), x + 1)) !== ANY_HOLE ? 1 : 0;
        return f >= 0 && m.mem.get(o2 + 16 + 8 * f) !== ANY_HOLE ? 1 : 0;
      }
      case 'any_keys': {
        const o = args[0];
        if (this.isRecord(o)) {
          const names = (r) => {
            const shape = m.mem.get(r + 8), out = [];
            for (let k = 0; k < m.mem.get(shape); k++) { const p = m.mem.get(shape + 8 + 8 * k); if (this.extraFind(r, this.read(p)) < 0 && m.mem.get(r + 16 + 8 * k) !== ANY_HOLE) out.push(p); }
            const x = m.mem.get(this.extraAddr(r));
            if (m.isArray(x)) for (const [p, v] of this.pairs(x)) if (v !== ANY_HOLE) out.push(p);
            const names = jsKeyOrder(out.map((p) => this.read(p)));   // (integer keys first, as rt_any_keys)
            return names.map((n) => out.find((p) => this.read(p) === n));
          };
          const [a, [o2]] = this.alloc(names(o).length + 3, roots, [o], frame);
          return this.anyArrayAt(a, names(o2));
        }
        if (m.isArray(o) || this.isString(o)) return this.array(Array.from({ length: m.mem.get(o + 8) }, (_, i) => String(i)), roots, frame);
        if (o === ANY_NULL || o === ANY_UNDEFINED) throw new Trap('TypeError: cannot convert undefined or null to object');
        return this.anyArrayAt(this.alloc(3, roots, [], frame)[0], []);
      }
      case 'arr_join': return this.join(args[0], str(args[1]), args[2], roots, frame);
      case 'arr_resize': return this.resize(args[0], args[1], args[2], roots, frame);
      case 'any_is_array': return this.m.isArray(args[0]) ? 1 : 0;
      case 'any_unhole': return args[0] === ANY_HOLE ? ANY_UNDEFINED : args[0];   // chapter 20
      case 'host_entries': return 0;   // chapter 24
      case 'host_arg': case 'host_call': case 'host_event':   // chapter 24: only a world in picocalc-os has a kernel
        throw new Trap('host calls run only in a world inside picocalc-os');
      case 'any_arity': {   // chapter 16: a closure's arity bits (46 to 51)
        const w = args[0];
        if (!m.isPointerWord(w) || !m.mem.has(w) || m.kindOf(w) !== 2 || this.isRecord(w) || m.isArray(w)) return 0;
        return Math.floor(m.mem.get(w) / 2 ** 46) % 64;
      }
      case 'any_length':
        if (this.isString(args[0])) return m.mem.get(args[0] + 8);
        if (args[0] === ANY_NULL || args[0] === ANY_UNDEFINED) { this.nullRead(args[0], 'length'); return 0; }   // chapter 24
        if (this.isRecord(args[0])) {   // CJI-3: an object's length property (a typed array's)
          const v = this.get(args[0], 'length', frame), d = typeof v === 'bigint' ? decodeNumber(v) : NaN;
          if (Number.isSafeInteger(d)) return d;
        }
        if (!m.isArray(args[0])) throw new Trap(TYPE_ERROR.array);
        return m.mem.get(args[0] + 8);
      default: return null;
    }
  }

  get(o, name, frame) {
    if (this.isRecord(o)) {   // as rt_any_get: a name among the extras is there (deleted, or added again)
      const x = this.extraFind(o, name);
      if (x >= 0) {
        const v = this.m.mem.get(this.elem(this.m.mem.get(this.extraAddr(o)), x + 1));
        return v === ANY_HOLE ? ANY_UNDEFINED : v;
      }
      const k = this.shapeNames(this.m.mem.get(o + 8)).indexOf(name);   // (chapter 20: HOLE, absent)
      return k >= 0 && this.m.mem.get(o + 16 + 8 * k) !== ANY_HOLE ? this.m.mem.get(o + 16 + 8 * k) : ANY_UNDEFINED;
    }
    if (name === 'length' && this.isString(o)) return encodeNumber(this.m.mem.get(o + 8));
    if (name === 'length' && this.m.isArray(o)) return encodeNumber(this.m.mem.get(o + 8));
    if (o === ANY_NULL || o === ANY_UNDEFINED) return this.nullRead(o, name);   // chapter 23
    return ANY_UNDEFINED;
  }
  // name: a string's address
  set(o, namePtr, v, roots, frame) {
    const name = this.read(namePtr);
    if (!this.isRecord(o)) throw new Trap(`setting .${name} of a value that is not an object is outside the subset`);
    const names = this.shapeNames(this.m.mem.get(o + 8)), k = names.indexOf(name), x = this.extraFind(o, name);
    const at = x >= 0 ? this.elem(this.m.mem.get(this.extraAddr(o)), x + 1) : 0;
    if (x < 0 && k >= 0) this.m.mem.set(o + 16 + 8 * k, v);
    else if (x >= 0 && this.m.mem.get(at) !== ANY_HOLE) this.m.mem.set(at, v);
    else {   // chapter 19: a new property, or a deleted one made again: last (as rt_any_set)
      if (x >= 0) this.extraRemove(o, x);
      return this.extraAdd(o, namePtr, v, roots, frame)[1];
    }
    return v;
  }

  // ---- chapter 19: the properties added to a record, after its fields: undefined, or an
  // Any[] of names and values (a deleted field: its name and HOLE) ----
  extraAddr(o) { return o + 16 + 8 * this.m.mem.get(this.m.mem.get(o + 8)); }
  elem(a, k) { return this.m.mem.get(a + 16) + 8 + 8 * k; }
  *pairs(x) {
    for (let k = 0; k < this.m.mem.get(x + 8); k += 2) yield [this.m.mem.get(this.elem(x, k)), this.m.mem.get(this.elem(x, k + 1))];
  }
  extraFind(o, name) {
    const x = this.m.mem.get(this.extraAddr(o));
    if (!this.m.isArray(x)) return -1;
    let k = 0;
    for (const [p] of this.pairs(x)) { if (this.read(p) === name) return k; k += 2; }
    return -1;
  }
  extraRemove(o, k) {
    const mem = this.m.mem, x = mem.get(this.extraAddr(o)), n = mem.get(x + 8);
    for (let j = k; j < n - 2; j++) mem.set(this.elem(x, j), mem.get(this.elem(x, j + 2)));
    mem.set(this.elem(x, n - 2), ANY_UNDEFINED);
    mem.set(this.elem(x, n - 1), ANY_UNDEFINED);
    mem.set(x + 8, n - 2);
  }
  // runs f(roots above them) with the words kept on the root stack; [f's result, the words]
  keep(words, roots, f) {
    const mem = this.m.mem;
    words.forEach((w, k) => mem.set(roots + 8 * k, w));
    const r = f(roots + 8 * words.length);
    const kept = words.map((_, k) => mem.get(roots + 8 * k));
    words.forEach((_, k) => mem.delete(roots + 8 * k));
    return [r, kept];
  }
  // a property key: a string's address (anything else converted)
  keyOf(k, roots, frame) { return this.isString(k) ? k : this.make(this.toString(k, frame), roots, frame); }
  anyArrayAt(a, words) {   // lays out an Any[] of the words at a (n + 3 words allocated)
    const mem = this.m.mem, n = words.length;
    mem.set(a, ARRAY_HEADER);
    mem.set(a + 8, n);
    mem.set(a + 16, a + 24);
    mem.set(a + 24, n * 8 + 1 * 2 + 1);
    words.forEach((w, k) => mem.set(a + 32 + 8 * k, w));
    return a;
  }
  // appends (name, v) to o's extras: [o, v], moved if a collection ran
  extraAdd(o, namePtr, v, roots, frame) {
    const mem = this.m.mem;
    let [, [o2, n2, v2]] = this.keep([o, namePtr, v], roots, (r) => {
      if (!this.m.isArray(mem.get(this.extraAddr(mem.get(roots))))) {
        const [a] = this.alloc(3, r, [], frame);
        mem.set(this.extraAddr(mem.get(roots)), this.anyArrayAt(a, []));
      }
      const x = mem.get(this.extraAddr(mem.get(roots)));
      this.resize(x, mem.get(x + 8) + 2, ANY_UNDEFINED, r, frame);
    });
    const x = mem.get(this.extraAddr(o2)), n = mem.get(x + 8);
    mem.set(this.elem(x, n - 2), n2);
    mem.set(this.elem(x, n - 1), v2);
    return [o2, v2];
  }

  // An array of new strings: the array first (its elements 0, which the collector skips),
  // kept on the root stack while each string is made.
  // chapter 15: the array object and its storage, in one allocation, as compiled code makes them
  array(strings, roots, frame) {
    const n = strings.length;
    let [a] = this.alloc(n + 3, roots, [], frame);
    this.m.mem.set(a, ARRAY_HEADER);
    this.m.mem.set(a + 8, n);
    this.m.mem.set(a + 16, a + 24);
    this.m.mem.set(a + 24, n * 8 + 1 * 2 + 1);
    strings.forEach((_, k) => this.m.mem.set(a + 32 + 8 * k, 0));
    strings.forEach((s, k) => {
      const [p, [a2]] = this.alloc(1 + Math.ceil(s.length / 4), roots, [a], frame);
      a = a2;
      this.layout(p, s);
      this.m.mem.set(this.m.mem.get(a + 16) + 8 + 8 * k, p);
    });
    return a;
  }
  // a.length = n (chapter 15)
  resize(a, n, fill, roots, frame) {
    const m = this.m, old = m.mem.get(a + 8);
    let st = m.mem.get(a + 16);
    const cap = Math.floor(m.mem.get(st) / 8);
    if (!(n >= 0 && n < 2 ** 32)) return this.throwError('RangeError', 'Invalid array length', roots, frame);
    if (n > cap) {
      const size = Math.max(cap * 2, n, 4);
      const [ns, [a2, f2]] = this.alloc(size, roots, [a, fill], frame);
      a = a2;
      fill = f2;
      st = m.mem.get(a + 16);
      m.mem.set(ns, size * 8 + (m.mem.get(st) % 8 - 1) + 1);
      for (let k = 0; k < size; k++) m.mem.set(ns + 8 + 8 * k, k < old ? m.mem.get(st + 8 + 8 * k) : 0);
      m.mem.set(a + 16, ns);
      st = ns;
    }
    for (let k = old; k < n; k++) m.mem.set(st + 8 + 8 * k, fill);
    m.mem.set(a + 8, n);
    return n;
  }

  // arr.join(sep): kind says what the elements are (0 Int, 1 Number, 2 String, 3 Bool, 4 Any).
  join(a, sep, kind, roots, frame) {
    const parts = [];
    for (const w of this.m.arrayElements(a)) {
      if (kind === 0) parts.push(String(w));
      else if (kind === 1) parts.push(String(bitsDouble(w)));
      else if (kind === 2) parts.push(this.read(w, frame));
      else if (kind === 3) parts.push(String(!!w));
      else parts.push(w === ANY_NULL || w === ANY_UNDEFINED ? '' : this.toString(w, frame));
    }
    return this.make(parts.join(sep), roots, frame);
  }
}

export { TYPEOF };

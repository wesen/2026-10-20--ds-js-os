// values.mjs: the values the WGSL -> Typed lowering computes with, literals and the names it uses.
//
// A scalar value is { t, e } with t one of f32, i32, u32, bool or 'aint' (an untyped integer literal, { t: 'aint', v }),
// e a Typed expression. An aggregate value (a WGSL vector or struct) is { t, c }: t the WGSL type, c its leaves in
// order (a vector's components; a struct's members flattened, vectors as their components), each a scalar value. In
// Typed an aggregate is a value record (PICOCALC-TYPED-VALUES): V2f, V3f, V4f, V2i for the vectors, one per struct.

export const SCALARS = new Set(['f32', 'i32', 'u32', 'bool']);
export const VECTORS = { vec2f: ['f32', 2], vec3f: ['f32', 3], vec4f: ['f32', 4], vec2i: ['i32', 2] };
export const VREC = { vec2f: 'V2f', vec3f: 'V3f', vec4f: 'V4f', vec2i: 'V2i' };
export const COMPONENTS = 'xyzw';
export const isVec = t => typeof t === 'string' && t in VECTORS;
export const isScalar = t => SCALARS.has(t) || t === 'aint';
export const vecOf = (elem, n) => elem === 'f32' ? `vec${n}f` : (n === 2 ? 'vec2i' : null);

// Typed words a generated name must not take (keywords, types, the Math namespace, the vector records).
export const RESERVED = new Set(['function', 'return', 'if', 'else', 'while', 'for', 'break', 'const', 'let', 'true', 'false',
  'record', 'enum', 'type', 'distinct', 'match', 'namespace', 'methods', 'async', 'await', 'i32', 'f32', 'u32', 'bool', 'string',
  'buffer', 'Math', 'continue', 'var', 'new', 'null', 'this', 'class', 'switch', 'case', 'default', 'do', 'void', 'in', 'of',
  'typeof', 'instanceof', 'delete', 'yield', 'import', 'export', 'memory', 'V2f', 'V3f', 'V4f', 'V2i',
  'Int32Array', 'Uint32Array', 'Float32Array']);

const f32 = Math.fround;
// The shortest decimal that rounds (through a double, as Typed's lexer reads it) to the same f32, with a '.' or an exponent.
export function flit(v) {
  v = f32(v);
  if (!Number.isFinite(v)) throw new Error('lower: non-finite f32 literal ' + v);
  if (Object.is(v, -0)) return '(-0.0)';
  let s;
  for (let p = 1; p <= 9; p++) { s = v.toPrecision(p); if (f32(parseFloat(s)) === v) break; }
  s = String(parseFloat(s));                                  // drop trailing zeros, normalise the exponent
  if (!/[.e]/.test(s)) s += '.0';
  s = s.replace(/e\+?/, 'e');
  if (/e/.test(s) && !/\./.test(s.split('e')[0])) s = s.replace('e', '.0e');
  return v < 0 ? `(${s})` : s;
}
// An integer literal: decimal up to 2^31 - 1, hex above (the same 32 bits as an i32 or a u32), negative in parentheses.
export function ilit(v) {
  if (!Number.isInteger(v)) throw new Error('lower: integer literal ' + v);
  if (v < -2147483648 || v > 4294967295) throw new Error('lower: integer literal out of range ' + v);
  if (v > 2147483647) return '0x' + v.toString(16);
  return v < 0 ? `(${v})` : String(v);
}

// An atom may be repeated in generated code without recomputation: a name, a field of a name, a literal.
export const isAtom = e => /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/.test(e) || /^\(?-?\d[\d.]*(e-?\d+)?\)?$/.test(e) || /^0x[0-9a-f]+$/.test(e) ||
  e === 'true' || e === 'false';

export const sc = (t, e) => ({ t, e });

export const TYPED = { f32: 'f32', i32: 'i32', u32: 'u32', bool: 'bool' };
export const DEFAULT = { f32: '0.0', i32: '0', u32: '0', bool: 'false' };
export class LowerError extends Error {}
// a zero of a WGSL type (none: a void function's i32), as Typed text; an aggregate as its value record's constructor
export function zeroOf(P, t) {
  if (!t) return '0';
  if (P.isAgg(t)) return `${P.rec(t)}(${P.leaves(t).map(([, e]) => DEFAULT[e]).join(', ')})`;
  return DEFAULT[t];
}

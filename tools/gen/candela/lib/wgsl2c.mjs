// wgsl2c.mjs: translate Candela's strict WGSL subset to C++ (the firmware kernel, its post pass and a scene's
// generated sections). Grown from PICOCALC-CANDELA-P4 scripts/04-wgsl2cpp.mjs; the expression rules are the
// same (those of src/wgsl2glsl.js and the DGX Spark report's WGSL-to-CUDA table), with four changes:
//
//  1. Strict. Every line is tokenized and checked against the subset Candela writes: a keyword outside it,
//     an attribute, a call to an unknown function, an assignment to a swizzle, an integer literal with an
//     `i` suffix (which GNU C++ would read as an imaginary constant), a declaration without a type, or any
//     construct the rewrite rules do not consume throws with the line number.
//  2. `select(f, t, c)` becomes CDL_SEL(f, t, c) (lazy or eager by a switch), except where an argument draws
//     a random number: there the eager select() template keeps the GPU's random stream in both modes.
//     A struct or array declared without a value becomes `T x CDL_ZI; CDL_POISON(x);` (zeroed, left, or poisoned).
//  3. Functions named in `overrides` are emitted as <name>_wgsl plus a forwarding definition that a CPU
//     substitution can replace; `rewrites` produce a second, rewritten body under a switch.
//  4. The caller decides linkage: kernel-internal functions are static, the section API is external.
//  5. Evaluation order. WGSL evaluates operands and function arguments left to right; C++ leaves most of
//     that order unspecified, and GCC chooses it per target (x86-64 and RV32 differ). A declaration whose
//     initialiser calls two functions with side effects on module state (functions that assign a
//     var<private> global, such as rnd() advancing rngS, directly or through a call) gets those calls hoisted
//     into temporaries in WGSL's order; any other statement with two such calls fails. The same set decides
//     which selects stay eager (2.).
//
// translate() parses; the emitter lives in ../kernel.mjs (and, for compiled scenes, in PICOCALC-CANDELA-CPU-KERNEL's
// ticket script 03-gen-scene.mjs, which the firmware does not use).

export const SCALARS = ['f32', 'i32', 'u32', 'bool'];
export const VECTORS = ['vec2f', 'vec3f', 'vec4f', 'vec2i'];
const VALUE_TYPES = new Set([...SCALARS, ...VECTORS]);
export const BUILTINS = new Set(['abs', 'floor', 'ceil', 'fract', 'sign', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'exp2', 'log', 'log2', 'sqrt', 'pow', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'dot', 'cross', 'length',
  'normalize', 'distance', 'reflect', 'refract', 'select']);
const KEYWORDS = new Set(['fn', 'let', 'var', 'const', 'struct', 'if', 'else', 'for', 'loop', 'break', 'continue', 'return',
  'true', 'false', 'private', 'array']);
// WGSL keywords and built-ins that Candela's subset does not use; meeting one means the subset grew
const FORBIDDEN = new Set(['switch', 'case', 'default', 'while', 'ptr', 'bitcast', 'override', 'alias', 'discard', 'fallthrough',
  'continuing', 'enable', 'requires', 'diagnostic', 'function', 'workgroup', 'storage', 'uniform', 'atomic', 'sampler',
  'texture_2d', 'textureSample', 'textureLoad', 'arrayLength', 'mat2x2f', 'mat3x3f', 'mat4x4f', 'vec3i', 'vec4i', 'vec2u',
  'vec3u', 'vec4u', 'f16', 'inverseSqrt', 'fma', 'round', 'trunc', 'countOneBits', 'reverseBits', 'firstLeadingBit',
  'all', 'any', 'modf', 'frexp', 'ldexp', 'pack4x8unorm', 'unpack4x8unorm', 'dpdx', 'dpdy', 'fwidth']);

export class TranslateError extends Error {}
const fail = (where, line, msg) => { throw new TranslateError(`wgsl2c: ${where} line ${line}: ${msg}`); };

export function splitArgs(s) {
  const out = []; let d = 0, a = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '(' || c === '[' || c === '<') d++; else if (c === ')' || c === ']' || c === '>') d--;
    else if (c === ',' && !d) { out.push(s.slice(a, k)); a = k + 1; }
  }
  out.push(s.slice(a));
  return out.map(x => x.trim()).filter(Boolean);
}
function matchParen(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (!d) return k; } } return -1; }
const floatLit = s => s.replace(/(?<![\w.])((?:\d+\.\d*|\.\d+)(?:e[+-]?\d+)?|\d+e[+-]?\d+)(?![\w.])/gi, '$1f');
const swizzles = s => s.replace(/\.([xyzw]{2,4})\b(?!\s*\()/g, (_, k) => `.${k}()`);
// Functions with side effects on module state; set by translate() (effectful() over its source, plus opts.impure).
let IMPURE = new Set(['rnd', 'rnd2']);
const callsIn = s => [...s.matchAll(/\b(\w+)\s*\(/g)].map(m => m[1]);
const impureCall = s => callsIn(s).some(f => IMPURE.has(f));
export function effectful(src, extra = {}) {
  const code = src.replace(/\/\/.*$/gm, '');
  const globals = [...code.matchAll(/^\s*var<private>\s+(\w+)/gm)].map(m => m[1]).concat(extra.globals || []);
  const assigns = globals.map(g => new RegExp(`\\b${g}\\s*(?:\\.\\w+|\\[[^\\]]*\\])?\\s*[-+*/|&^]?=(?!=)`));
  const bodies = new Map();
  for (const m of code.matchAll(/^\s*fn\s+(\w+)\s*\(/gm)) {
    const i = code.indexOf('{', m.index);
    let d = 0, j = i;
    for (; j < code.length; j++) { if (code[j] === '{') d++; else if (code[j] === '}' && !--d) break; }
    bodies.set(m[1], code.slice(i, j + 1));
  }
  const out = new Set(extra.fns || []);
  for (const [n, b] of bodies) if (assigns.some(r => r.test(b))) out.add(n);
  for (let grew = true; grew;) {
    grew = false;
    for (const [n, b] of bodies) if (!out.has(n) && callsIn(b).some(f => out.has(f))) { out.add(n); grew = true; }
  }
  return out;
}
// Hoist the calls with side effects in one declaration into temporaries, in WGSL's left-to-right order.
function sequence(L, where, n, log) {
  if (callsIn(L).filter(f => IMPURE.has(f)).length < 2) return L;
  const d = L.match(/^(\s*)((?:const\s+)?\w+\s+\w+\s*=\s*)(.*;)\s*$/);
  if (!d) fail(where, n, 'two calls with side effects in a statement that is not a single declaration: ' + L.trim());
  const rhs = d[3], re = /\b(\w+)\s*\(/g;
  let pre = '', out = '', pos = 0, k = 0, m;
  while ((m = re.exec(rhs))) {
    if (!IMPURE.has(m[1])) continue;
    const open = rhs.indexOf('(', m.index), close = matchParen(rhs, open), call = rhs.slice(m.index, close + 1);
    if (impureCall(rhs.slice(open + 1, close))) fail(where, n, 'nested calls with side effects: ' + L.trim());
    const t = `cdlSeq${n}_${k++}`;
    pre += `const auto ${t} = ${call}; `;
    out += rhs.slice(pos, m.index) + t;
    pos = close + 1; re.lastIndex = close + 1;
  }
  out += rhs.slice(pos);
  if (log) log.push({ where, line: n, cpp: (d[1] + pre + d[2] + out).trim() });
  return d[1] + pre + d[2] + out;
}
function selects(s) {
  let from = 0, i;
  while ((i = s.slice(from).search(/\bselect\(/)) >= 0) {
    i += from;
    const open = s.indexOf('(', i), close = matchParen(s, open);
    const args = splitArgs(s.slice(open + 1, close));
    if (args.length !== 3) throw new TranslateError('wgsl2c: select needs 3 arguments: ' + s.slice(i, close + 1));
    if (impureCall(args[0] + args[1])) { from = open; continue; }   // eager: keeps WGSL's side effects (the random stream)
    const [f, t, c] = args.map(selects);
    s = s.slice(0, i) + `CDL_SEL(${f}, ${t}, ${c})` + s.slice(close + 1);
  }
  return s;
}
export const expr = s => swizzles(floatLit(selects(s)));

// Tokenize a WGSL line (without its comment) and check it against the subset.
function check(code, where, n, known) {
  if (code.includes('@')) fail(where, n, 'attribute: ' + code.trim());
  if (/\b\d+i\b/.test(code)) fail(where, n, 'integer literal with an i suffix: ' + code.trim());
  if (/\b\d+(?:\.\d*)?h\b/.test(code)) fail(where, n, 'f16 literal: ' + code.trim());
  if (/\.([xyzw]{2,4})\s*([-+*/]?=)(?!=)/.test(code)) fail(where, n, 'assignment to a swizzle: ' + code.trim());
  if (/(?<![\w.])&\s*\w/.test(code.replace(/&&/g, ' ').replace(/[\w)\]]\s*&/g, ' '))) fail(where, n, 'address-of (pointer): ' + code.trim());
  for (const m of code.matchAll(/\b([A-Za-z_]\w*)\b(\s*\()?/g)) {
    const id = m[1];
    if (FORBIDDEN.has(id)) fail(where, n, `'${id}' is outside Candela's WGSL subset: ` + code.trim());
    if (m[2] && !KEYWORDS.has(id) && !BUILTINS.has(id) && !VALUE_TYPES.has(id) && !known.has(id))
      fail(where, n, `call to unknown function '${id}': ` + code.trim());
  }
}

// Declarations inside a line. structs: names that get CDL_ZINIT when declared without a value.
function decl(L, structs, where, n) {
  L = L.replace(/\bvar\s+(\w+)\s*:\s*array<(\w+),\s*(\d+)>\s*;/g, (_, nm, t, k) => `${t} ${nm}[${k}] CDL_ZI; CDL_POISON(${nm});`);
  L = L.replace(/\bconst\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, nm, t) => `static const ${t} ${nm} =`);
  L = L.replace(/\blet\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, nm, t) => `const ${t} ${nm} =`);
  L = L.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, nm, t) => `${t} ${nm} =`);
  L = L.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*;/g, (_, nm, t) => {
    if (VALUE_TYPES.has(t)) return `${t} ${nm}{};`;
    if (structs.has(t)) return `${t} ${nm} CDL_ZI; CDL_POISON(${nm});`;
    fail(where, n, `declaration of unknown type ${t}`);
  });
  return L.replace(/\bloop\s*{/g, 'for (;;) {');
}

// Parse a WGSL source into structs, functions (header + translated body lines), globals and constants.
// opts.known: names of functions defined elsewhere (the kernel, for a scene's sections; accessors);
// opts.structs: struct names defined elsewhere; opts.where: a label for errors.
export function translate(src, opts = {}) {
  const where = opts.where || 'input';
  const lines = src.split('\n');
  const defined = new Set([...src.replace(/\/\/.*$/gm, '').matchAll(/^\s*fn\s+(\w+)\s*\(/gm)].map(m => m[1]));
  const known = new Set([...defined, ...(opts.known || [])]);
  const structNames = new Set([...(opts.structs || []), ...[...src.matchAll(/^\s*struct\s+(\w+)\s*{/gm)].map(m => m[1])]);
  const out = { structs: [], fns: [], globals: [], consts: [], tables: [], structNames, defined, sequenced: [] };
  IMPURE = effectful(src, opts.impure || {});
  out.impure = [...IMPURE].sort();
  let inStruct = null, fn = null, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1, raw = lines[i];
    const code = raw.replace(/\/\/.*$/, '');
    if (inStruct) {
      const m = code.match(/^(\s*)(\w+)\s*:\s*([\w<>, ]+?),?\s*$/);
      if (m) { if (!VALUE_TYPES.has(m[3].trim()) && !structNames.has(m[3].trim())) fail(where, n, 'struct member of unknown type ' + m[3]); inStruct.members.push(`${m[1]}${m[3].trim()} ${m[2]};`); continue; }
      if (/^\s*}\s*;?\s*$/.test(code)) { out.structs.push(inStruct); inStruct = null; continue; }
      fail(where, n, 'unexpected line in a struct: ' + raw);
    }
    if (!code.trim()) { if (fn) fn.body.push(raw); continue; }
    check(code, where, n, known);
    let m = !fn && code.match(/^\s*struct\s+(\w+)\s*{\s*$/);
    if (m) { inStruct = { name: m[1], members: [] }; continue; }
    m = code.match(/^(\s*)fn\s+(\w+)\s*\((.*?)\)\s*(?:->\s*([\w<>]+)\s*)?{(.*)$/);
    if (m) {
      if (fn) fail(where, n, 'nested fn');
      const params = splitArgs(m[3]).map(p => {
        const k = p.match(/^(\w+)\s*:\s*([\w<>]+)$/); if (!k) fail(where, n, 'parameter ' + p);
        return { name: k[1], type: k[2], cpp: VALUE_TYPES.has(k[2]) ? `${k[2]} ${k[1]}` : `const ${k[2]}& ${k[1]}` };
      });
      const ret = m[4] ? m[4] : 'void';
      if (!VALUE_TYPES.has(ret) && !structNames.has(ret) && ret !== 'void') fail(where, n, 'return type ' + ret);
      fn = { name: m[2], ret, params, body: [], wgsl: [raw] };
      depth = 1 + (m[5].match(/{/g) || []).length - (m[5].match(/}/g) || []).length;
      const rest = expr(decl(m[5], structNames, where, n));
      // statements on the header line (one-line functions): each may call at most one function with side effects
      for (const st of rest.split(/[;{}]/)) if (callsIn(st).filter(f => IMPURE.has(f)).length > 1) fail(where, n, 'two calls with side effects on a function\'s header line: ' + st.trim());
      if (depth === 0) { fn.oneLine = true; fn.body.push(rest.replace(/}\s*$/, '')); out.fns.push(fn); fn = null; }
      else fn.body.push(rest);
      continue;
    }
    if (fn) {
      fn.wgsl.push(raw);
      depth += (code.match(/{/g) || []).length - (code.match(/}/g) || []).length;
      let L = decl(raw, structNames, where, n);
      if (/\b(let|var|fn|array<|bitcast)\b/.test(L.replace(/\/\/.*$/, ''))) fail(where, n, 'untranslated construct: ' + raw);
      L = sequence(expr(L), where, n, out.sequenced);
      if (depth === 0) { if (!/^\s*}\s*$/.test(code)) fail(where, n, 'code after a function\'s closing brace'); out.fns.push(fn); fn = null; }
      else fn.body.push(L);
      continue;
    }
    // module scope: constants, private globals, initialised private tables
    const tab = code.match(/^\s*var<private>\s+(\w+)\s*:\s*array<(\w+),\s*(\d+)>\s*=\s*array<\w+,\s*\d+>\((.*)\);\s*$/);
    if (tab) { out.tables.push({ name: tab[1], type: tab[2], n: +tab[3], init: floatLit(tab[4]) }); continue; }
    m = code.match(/^\s*var<private>\s+(\w+)\s*:\s*([\w<>]+)\s*=\s*(.*);\s*$/);
    if (m) { if (!VALUE_TYPES.has(m[2])) fail(where, n, 'private global of type ' + m[2]); out.globals.push({ name: m[1], type: m[2], init: expr(m[3]) }); continue; }
    m = code.match(/^\s*const\s+(\w+)\s*:\s*([\w<>]+)\s*=\s*(.*);\s*$/);
    if (m) { out.consts.push({ name: m[1], type: m[2], init: expr(m[3]) }); continue; }
    fail(where, n, 'unrecognised module-scope line: ' + raw);
  }
  if (inStruct || fn) fail(where, lines.length, 'unterminated ' + (inStruct ? 'struct' : 'function'));
  return out;
}

export const head = (f, name = f.name, linkage = 'static ') => `${linkage}${f.ret} ${name}(${f.params.map(p => p.cpp).join(', ')})`;
export const args = f => f.params.map(p => p.name).join(', ');
export const body = f => f.oneLine ? ` {${f.body[0]}}` : ` {${f.body.join('\n')}\n}`;

// Apply a textual rewrite to one function's WGSL (exactly one occurrence, or the build fails), re-translate it.
export function rewriteFn(f, from, to, ctx) {
  const src = f.wgsl.join('\n');   // header line through the closing brace
  const parts = src.split(from);
  if (parts.length !== 2) throw new TranslateError(`wgsl2c: rewrite of ${f.name} expects exactly one '${from}', found ${parts.length - 1}`);
  const t = translate(parts.join(to), ctx);
  if (t.fns.length !== 1) throw new TranslateError('wgsl2c: rewrite of ' + f.name + ' did not yield one function');
  return t.fns[0];
}

// The prologue: vector types with every valid swizzle, and their operators. Scalar math comes from
// cpu/cdl_math.h, which the switches configure.
export function prologue() {
  const N = { vec2f: 2, vec3f: 3, vec4f: 4 }, C = 'xyzw';
  const all = (n) => { const r = []; const rec = (s) => { if (s.length >= 2) r.push(s); if (s.length < 4) for (const c of C.slice(0, n)) rec(s + c); }; rec(''); return r; };
  const swzDecl = T => all(N[T]).map(k => `vec${k.length}f ${k}() const;`).join(' ');
  const swzDefs = () => Object.keys(N).flatMap(T => all(N[T]).map(k => `inline vec${k.length}f ${T}::${k}() const { return vec${k.length}f(${[...k].join(', ')}); }`)).join('\n');
  const ops = (T, S = 'f32') => {
    const n = T === 'vec2i' ? 2 : N[T], f = C.slice(0, n).split('');
    const bin = (op) => `inline ${T} operator${op}(${T} a, ${T} b) { return ${T}(${f.map(c => `a.${c} ${op} b.${c}`).join(', ')}); }
inline ${T} operator${op}(${T} a, ${S} b) { return ${T}(${f.map(c => `a.${c} ${op} b`).join(', ')}); }
inline ${T} operator${op}(${S} a, ${T} b) { return ${T}(${f.map(c => `a ${op} b.${c}`).join(', ')}); }`;
    const u1 = (name) => `inline ${T} ${name}(${T} a) { return ${T}(${f.map(c => `${name}(a.${c})`).join(', ')}); }`;
    const u2 = (name) => `inline ${T} ${name}(${T} a, ${T} b) { return ${T}(${f.map(c => `${name}(a.${c}, b.${c})`).join(', ')}); }`;
    const common = [bin('+'), bin('-'), bin('*'), bin('/'), `inline ${T} operator-(${T} a) { return ${T}(${f.map(c => `-a.${c}`).join(', ')}); }`,
      u1('abs'), u2('min'), u2('max'), `inline ${T} clamp(${T} x, ${T} lo, ${T} hi) { return min(max(x, lo), hi); }`];
    if (T === 'vec2i') return common.join('\n');
    return [...common,
      ...['floor', 'ceil', 'fract', 'sign', 'sin', 'cos', 'exp', 'exp2', 'log', 'log2', 'sqrt'].map(u1),
      ...['pow', 'step', 'atan2'].map(u2),
      `inline ${T} mix(${T} a, ${T} b, f32 t) { return a + (b - a) * t; }`,
      `inline ${T} mix(${T} a, ${T} b, ${T} t) { return a + (b - a) * t; }`,
      `inline ${T} smoothstep(${T} e0, ${T} e1, ${T} x) { return ${T}(${f.map(c => `smoothstep(e0.${c}, e1.${c}, x.${c})`).join(', ')}); }`,
      `inline f32 dot(${T} a, ${T} b) { return ${f.map(c => `a.${c} * b.${c}`).join(' + ')}; }`,
      `inline f32 length(${T} a) { return sqrt(dot(a, a)); }`,
      `inline ${T} normalize(${T} a) { return a / length(a); }`,
      `inline f32 distance(${T} a, ${T} b) { return length(a - b); }`,
      `inline ${T} reflect(${T} i, ${T} n) { return i - n * (2.0f * dot(n, i)); }`,
      `inline ${T} refract(${T} i, ${T} n, f32 eta) { const f32 d = dot(n, i); const f32 k = 1.0f - eta * eta * (1.0f - d * d); if (k < 0.0f) return ${T}(0.0f); return i * eta - n * (eta * d + sqrt(k)); }`,
    ].join('\n');
  };
  // Trivial default constructors: `T x{}` zero-initialises, `T x;` does not (what CDL_NO_ZERO_INIT relies on).
  const types = `struct vec2f; struct vec3f; struct vec4f;
struct vec2f { f32 x, y;
  vec2f() = default; explicit vec2f(f32 s) : x(s), y(s) {} vec2f(f32 a, f32 b) : x(a), y(b) {}
  ${swzDecl('vec2f')}
};
struct vec3f { f32 x, y, z;
  vec3f() = default; explicit vec3f(f32 s) : x(s), y(s), z(s) {} vec3f(f32 a, f32 b, f32 c) : x(a), y(b), z(c) {}
  vec3f(vec2f a, f32 c) : x(a.x), y(a.y), z(c) {} vec3f(f32 a, vec2f b) : x(a), y(b.x), z(b.y) {}
  ${swzDecl('vec3f')}
};
struct vec4f { f32 x, y, z, w;
  vec4f() = default; explicit vec4f(f32 s) : x(s), y(s), z(s), w(s) {} vec4f(f32 a, f32 b, f32 c, f32 d) : x(a), y(b), z(c), w(d) {}
  vec4f(vec3f a, f32 d) : x(a.x), y(a.y), z(a.z), w(d) {} vec4f(vec2f a, vec2f b) : x(a.x), y(a.y), z(b.x), w(b.y) {} vec4f(vec2f a, f32 c, f32 d) : x(a.x), y(a.y), z(c), w(d) {}
  ${swzDecl('vec4f')}
};
struct vec2i { i32 x, y; vec2i() = default; explicit vec2i(i32 s) : x(s), y(s) {} vec2i(i32 a, i32 b) : x(a), y(b) {} };
${swzDefs()}`;
  return { types, ops: [ops('vec2f'), ops('vec3f'), ops('vec4f'), ops('vec2i', 'i32'),
    'inline vec3f cross(vec3f a, vec3f b) { return vec3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }'].join('\n') };
}

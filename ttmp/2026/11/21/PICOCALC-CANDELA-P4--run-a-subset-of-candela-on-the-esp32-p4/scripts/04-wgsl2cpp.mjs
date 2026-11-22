// 04-wgsl2cpp.mjs: translate Candela's strict WGSL subset (compiled.shared) to self-contained C++.
// usage: node 04-wgsl2cpp.mjs <kernel.wgsl> <kernel.cpp>
// The rules are those wgsl2glsl.js relies on (typed declarations, one struct member per line,
// select(f, t, c) with a scalar condition, loop { ... break; }, no pointers, no overloads) and the
// WGSL-to-CUDA table of the DGX Spark report. A generated prologue defines vec2f/vec3f/vec4f with
// operators and WGSL's built-ins, so most expressions survive unchanged. What the translator rewrites:
// declarations, function headers (struct parameters become const references: WGSL parameters are
// immutable, and a by-value Lobe would be copied on every call), struct bodies, arrays, loops,
// multi-component swizzles (v.xz -> v.xz()), and float literals (1.0 -> 1.0f, so nothing is computed
// in double precision, which the ESP32-P4 does in software). Structs are hoisted and every function
// gets a prototype, because C++ needs declarations before use and WGSL does not.
import { readFileSync, writeFileSync } from 'node:fs';
const [inPath, outPath] = process.argv.slice(2);
const src = readFileSync(inPath, 'utf8');

const VEC = new Set(['f32', 'i32', 'u32', 'bool', 'vec2f', 'vec3f', 'vec4f']);
const TY = t => t.trim();
function splitArgs(s) { const out = []; let d = 0, a = 0; for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '(' || c === '[' || c === '<') d++; else if (c === ')' || c === ']' || c === '>') d--; else if (c === ',' && !d) { out.push(s.slice(a, k)); a = k + 1; } } out.push(s.slice(a)); return out.map(x => x.trim()).filter(Boolean); }
const floatLit = s => s.replace(/(?<![\w.])((?:\d+\.\d*|\.\d+)(?:e[+-]?\d+)?|\d+e[+-]?\d+)(?![\w.])/gi, '$1f');
const used = new Set();
const swizzles = s => s.replace(/\.([xyzw]{2,4})\b(?!\s*\()/g, (_, k) => { used.add(k); return `.${k}()`; });
// select(f, t, c) evaluates both arguments in WGSL. A CPU should evaluate only the chosen one (the
// kernel selects, for example, between a cosine pdf and an HDRI lookup it does not need), so selects
// become conditionals, as in wgsl2glsl.js, unless an argument draws a random number: there the eager
// template keeps the GPU's random stream.
function matchParen(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (!d) return k; } } return -1; }
function selects(s) {
  let from = 0, i;
  while ((i = s.slice(from).search(/\bselect\(/)) >= 0) {
    i += from;
    const open = s.indexOf('(', i), close = matchParen(s, open);
    const args = splitArgs(s.slice(open + 1, close));
    if (args.length !== 3) throw new Error('wgsl2cpp: select needs 3 arguments: ' + s.slice(i, close + 1));
    if (/\brnd2?\(/.test(args[0] + args[1])) { from = open; continue; }
    const [f, t, c] = args.map(selects);
    s = s.slice(0, i) + `((${c}) ? (${t}) : (${f}))` + s.slice(close + 1);
  }
  return s;
}
const expr = s => swizzles(floatLit(selects(s)));

// declarations and loops inside a line (also the tail of a one-line function)
function decl(L) {
  L = L.replace(/\bvar\s+(\w+)\s*:\s*array<(\w+),\s*(\d+)>\s*;/g, (_, n, t, k) => `${t} ${n}[${k}] = {};`);
  L = L.replace(/var<private>\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `static ${TY(t)} ${n} =`);
  L = L.replace(/\bconst\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `static const ${TY(t)} ${n} =`);
  L = L.replace(/\blet\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `const ${TY(t)} ${n} =`);
  L = L.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `${TY(t)} ${n} =`);
  L = L.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*;/g, (_, n, t) => `${TY(t)} ${n}{};`);
  return L.replace(/\bloop\s*{/g, 'for (;;) {');
}
const lines = src.split('\n');
const structs = [], protos = [], body = [];
let inStruct = null;
for (let i = 0; i < lines.length; i++) {
  let L = lines[i];
  if (inStruct) {
    const m = L.match(/^(\s*)(\w+)\s*:\s*([\w<>, ]+?),?\s*$/);
    if (m) { inStruct.push(`${m[1]}${TY(m[3])} ${m[2]};`); continue; }
    if (/^\s*}\s*;?\s*$/.test(L)) { inStruct.push('};'); structs.push(inStruct.join('\n')); inStruct = null; continue; }
    throw new Error(`wgsl2cpp: unexpected struct line ${i + 1}: ${L}`);
  }
  let m = L.match(/^\s*struct\s+(\w+)\s*{\s*$/);
  if (m) { inStruct = [`struct ${m[1]} {`]; continue; }
  m = L.match(/^(\s*)fn\s+(\w+)\s*\((.*?)\)\s*(?:->\s*([\w<>]+)\s*)?{(.*)$/);
  if (m) {
    const params = splitArgs(m[3]).map(p => { const k = p.match(/^(\w+)\s*:\s*(.+)$/); const t = TY(k[2]); return VEC.has(t) ? `${t} ${k[1]}` : `const ${t}& ${k[1]}`; }).join(', ');
    const head = `${m[4] ? TY(m[4]) : 'void'} ${m[2]}(${params})`;
    protos.push(`static ${head};`);
    body.push(`${m[1]}static ${head} {${expr(decl(m[5]))}`); continue;
  }
  // a private table with an initializer (the GGX albedo table), uninitialised local arrays
  const tab = L.match(/^\s*var<private>\s+(\w+)\s*:\s*array<(\w+),\s*(\d+)>\s*=\s*array<\w+,\s*\d+>\((.*)\);\s*$/);
  if (tab) { body.push(`static ${tab[2]} ${tab[1]}[${tab[3]}] = {${floatLit(tab[4])}};`); continue; }
  L = decl(L);
  if (/\b(let|var|fn|array<|bitcast)\b/.test(L.replace(/\/\/.*$/, ''))) throw new Error(`wgsl2cpp: untranslated construct at line ${i + 1}: ${L}`);
  body.push(expr(L));
}

// ---- the prologue: scalar types, vectors with the swizzles this kernel uses, WGSL built-ins ----
const N = { vec2f: 2, vec3f: 3, vec4f: 4 }, C = 'xyzw';
const swzOk = (T) => [...used].filter(k => [...k].every(c => C.indexOf(c) < N[T]));
const swz = (T) => swzOk(T).map(k => `  vec${k.length}f ${k}() const;`).join('\n');
const swzDefs = () => ['vec2f', 'vec3f', 'vec4f'].flatMap(T => swzOk(T).map(k => `inline vec${k.length}f ${T}::${k}() const { return vec${k.length}f(${[...k].join(', ')}); }`)).join('\n');
const ops = T => {
  const n = N[T], f = C.slice(0, n).split('');
  const bin = (op) => `inline ${T} operator${op}(${T} a, ${T} b) { return ${T}(${f.map(c => `a.${c} ${op} b.${c}`).join(', ')}); }
inline ${T} operator${op}(${T} a, f32 b) { return ${T}(${f.map(c => `a.${c} ${op} b`).join(', ')}); }
inline ${T} operator${op}(f32 a, ${T} b) { return ${T}(${f.map(c => `a ${op} b.${c}`).join(', ')}); }`;
  const u1 = (name, fn) => `inline ${T} ${name}(${T} a) { return ${T}(${f.map(c => `${fn}(a.${c})`).join(', ')}); }`;
  const u2 = (name, fn) => `inline ${T} ${name}(${T} a, ${T} b) { return ${T}(${f.map(c => `${fn}(a.${c}, b.${c})`).join(', ')}); }`;
  return [bin('+'), bin('-'), bin('*'), bin('/'),
    `inline ${T} operator-(${T} a) { return ${T}(${f.map(c => `-a.${c}`).join(', ')}); }`,
    ...['abs', 'floor', 'ceil', 'fract', 'sign', 'sin', 'cos', 'exp', 'exp2', 'log', 'log2', 'sqrt'].map(k => u1(k, k)),
    ...['min', 'max', 'pow', 'step', 'atan2'].map(k => u2(k, k)),
    `inline ${T} clamp(${T} x, ${T} lo, ${T} hi) { return min(max(x, lo), hi); }`,
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
const prologue = `// generated by 04-wgsl2cpp.mjs from ${inPath.split('/').pop()}; do not edit
namespace cdl {
typedef float f32; typedef int i32; typedef unsigned u32;
struct vec2f; struct vec3f; struct vec4f;
struct vec2f { f32 x, y;
  vec2f() : x(0), y(0) {} explicit vec2f(f32 s) : x(s), y(s) {} vec2f(f32 a, f32 b) : x(a), y(b) {}
${swz('vec2f')}
};
struct vec3f { f32 x, y, z;
  vec3f() : x(0), y(0), z(0) {} explicit vec3f(f32 s) : x(s), y(s), z(s) {} vec3f(f32 a, f32 b, f32 c) : x(a), y(b), z(c) {}
  vec3f(vec2f a, f32 c) : x(a.x), y(a.y), z(c) {} vec3f(f32 a, vec2f b) : x(a), y(b.x), z(b.y) {}
${swz('vec3f')}
};
struct vec4f { f32 x, y, z, w;
  vec4f() : x(0), y(0), z(0), w(0) {} explicit vec4f(f32 s) : x(s), y(s), z(s), w(s) {} vec4f(f32 a, f32 b, f32 c, f32 d) : x(a), y(b), z(c), w(d) {}
  vec4f(vec3f a, f32 d) : x(a.x), y(a.y), z(a.z), w(d) {} vec4f(vec2f a, vec2f b) : x(a.x), y(a.y), z(b.x), w(b.y) {} vec4f(vec2f a, f32 c, f32 d) : x(a.x), y(a.y), z(c), w(d) {}
${swz('vec4f')}
};
${swzDefs()}
// scalar built-ins: GCC builtins, so sqrt, abs, min and max become single RV32F instructions
// (with -fno-math-errno) and the transcendental functions call newlib's single-precision libm
inline f32 ffloor(f32 x) { if (!(x > -2.1e9f && x < 2.1e9f)) return x; const f32 t = f32(i32(x)); return t > x ? t - 1.0f : t; }   // RV32F has no floor instruction
inline f32 abs(f32 a) { return __builtin_fabsf(a); }   inline i32 abs(i32 a) { return a < 0 ? -a : a; }
inline f32 sqrt(f32 a) { return __builtin_sqrtf(a); }
#ifdef CDL_FAST_MATH
inline f32 floor(f32 a) { return ffloor(a); }
#else
inline f32 floor(f32 a) { return __builtin_floorf(a); }
#endif
inline f32 ceil(f32 a) { return __builtin_ceilf(a); }  inline f32 fract(f32 a) { return a - floor(a); }
#ifdef CDL_FAST_MATH
// CPU-target approximations (an experiment, not Candela's semantics): one-step range reduction and
// short polynomials instead of newlib's exact reduction. Max error about 4e-6 for sin/cos on [-pi, pi]
// and 2e-7 relative for exp; for the large arguments of the sin-based hashes the result is a different,
// still uniform, pseudo-random value (WGSL leaves sin's accuracy for large arguments unspecified too).
inline f32 sin(f32 x) { const f32 k = ffloor(x * 0.15915494f + 0.5f); x = x - k * 6.2831853f;
  if (x > 1.5707963f) x = 3.1415927f - x; else if (x < -1.5707963f) x = -3.1415927f - x;
  const f32 x2 = x * x; return x * (1.0f + x2 * (-0.16666667f + x2 * (0.0083333310f + x2 * (-0.00019840874f + x2 * 2.7525562e-6f)))); }
inline f32 cos(f32 x) { return sin(x + 1.5707963f); }
inline f32 exp(f32 x) { if (x < -87.0f) return 0.0f; if (x > 88.0f) x = 88.0f; const f32 y = x * 1.4426950f; const f32 n = ffloor(y), t = y - n;
  const f32 p = 1.0f + t * (0.69314718f + t * (0.24022652f + t * (0.055504109f + t * (0.0096181291f + t * 0.0013333558f))));
  union { f32 f; i32 i; } u; u.i = (i32(n) + 127) << 23; return p * u.f; }
#else
inline f32 sin(f32 a) { return __builtin_sinf(a); }    inline f32 cos(f32 a) { return __builtin_cosf(a); }
inline f32 exp(f32 a) { return __builtin_expf(a); }
#endif
inline f32 tan(f32 a) { return __builtin_tanf(a); }    inline f32 asin(f32 a) { return __builtin_asinf(a); }
inline f32 acos(f32 a) { return __builtin_acosf(a); }  inline f32 atan(f32 a) { return __builtin_atanf(a); }
inline f32 atan2(f32 a, f32 b) { return __builtin_atan2f(a, b); }
inline f32 exp2(f32 a) { return __builtin_exp2f(a); }
inline f32 log(f32 a) { return __builtin_logf(a); }    inline f32 log2(f32 a) { return __builtin_log2f(a); }
inline f32 pow(f32 a, f32 b) { return __builtin_powf(a, b); }
inline f32 min(f32 a, f32 b) { return __builtin_fminf(a, b); } inline f32 max(f32 a, f32 b) { return __builtin_fmaxf(a, b); }
inline i32 min(i32 a, i32 b) { return a < b ? a : b; }   inline i32 max(i32 a, i32 b) { return a > b ? a : b; }
inline u32 min(u32 a, u32 b) { return a < b ? a : b; }   inline u32 max(u32 a, u32 b) { return a > b ? a : b; }
inline f32 clamp(f32 x, f32 lo, f32 hi) { return min(max(x, lo), hi); } inline i32 clamp(i32 x, i32 lo, i32 hi) { return min(max(x, lo), hi); }
inline f32 sign(f32 a) { return a > 0.0f ? 1.0f : a < 0.0f ? -1.0f : 0.0f; }
inline f32 step(f32 e, f32 x) { return x >= e ? 1.0f : 0.0f; }
inline f32 mix(f32 a, f32 b, f32 t) { return a + (b - a) * t; }
inline f32 smoothstep(f32 e0, f32 e1, f32 x) { const f32 t = clamp((x - e0) / (e1 - e0), 0.0f, 1.0f); return t * t * (3.0f - 2.0f * t); }
template <class T> inline T select(T f, T t, bool c) { return c ? t : f; }
${ops('vec2f')}
${ops('vec3f')}
${ops('vec4f')}
inline vec3f cross(vec3f a, vec3f b) { return vec3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
`;
// the buffer accessors the backend provides (render.js defines them per GPU API; the harness on the CPU)
const accessors = ['U', 'objF', 'litF', 'bvhF', 'sdF'].map(n => `static vec4f ${n}(i32 i);`).join(' ');
const out = prologue + accessors + '\n' + structs.join('\n') + '\n' + protos.join('\n') + '\n' + body.join('\n') + '\n} // namespace cdl\n';
writeFileSync(outPath, out);
console.log(`${structs.length} structs, ${protos.length} functions, ${used.size} swizzles, ${out.split('\n').length} lines -> ${outPath}`);

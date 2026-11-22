// wgsl2glsl.js — translate the kernel's strict WGSL subset to GLSL ES 3.00. The subset is enforced by the
// way the kernel and the code generator are written: typed declarations, `fn name(a: T) -> R {`, structs with
// one member per line, `select(f, t, c)` with scalar conditions, `loop {}` broken with `break`.
const TYPES = [['vec2f', 'vec2'], ['vec3f', 'vec3'], ['vec4f', 'vec4'], ['vec2u', 'uvec2'], ['vec3u', 'uvec3'], ['vec4u', 'uvec4'], ['vec2i', 'ivec2'], ['vec3i', 'ivec3'], ['vec4i', 'ivec4'], ['mat3x3f', 'mat3'], ['mat4x4f', 'mat4'], ['f32', 'float'], ['i32', 'int'], ['u32', 'uint']];
const ty = t => { t = t.trim(); for (const [a, b] of TYPES) if (t === a) return b; return t; };

// find the index of the parenthesis matching the one at `i`
function matchParen(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (!d) return k; } } return -1; }
// split a call's argument list at top-level commas
function splitArgs(s) { const out = []; let d = 0, a = 0; for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && !d) { out.push(s.slice(a, k)); a = k + 1; } } out.push(s.slice(a)); return out.map(x => x.trim()); }

function selects(s) {
  let i;
  while ((i = s.search(/\bselect\(/)) >= 0) {
    const open = s.indexOf('(', i), close = matchParen(s, open);
    if (close < 0) throw new Error('wgsl2glsl: unbalanced select');
    const args = splitArgs(s.slice(open + 1, close));
    if (args.length !== 3) throw new Error('wgsl2glsl: select needs 3 arguments: ' + s.slice(i, close + 1));
    const [f, t, c] = args.map(selects);
    s = s.slice(0, i) + `((${c}) ? (${t}) : (${f}))` + s.slice(close + 1);
  }
  return s;
}

export function wgslToGlsl(src) {
  const lines = src.split('\n'), out = [];
  let inStruct = false;
  for (let raw of lines) {
    let L = raw;
    if (inStruct) {
      const m = L.match(/^(\s*)(\w+)\s*:\s*([\w<>, ]+?),?\s*$/);
      if (m) { out.push(`${m[1]}${ty(m[3])} ${m[2]};`); continue; }
      if (/^\s*}\s*$/.test(L)) { out.push(L.replace('}', '};')); inStruct = false; continue; }
    }
    let m = L.match(/^(\s*)struct\s+(\w+)\s*{\s*$/);
    if (m) { inStruct = true; out.push(L); continue; }
    // fn name(a: T, b: U) -> R {
    m = L.match(/^(\s*)fn\s+(\w+)\s*\((.*?)\)\s*(?:->\s*([\w<>]+)\s*)?{(.*)$/);
    if (m) {
      const params = m[3].trim() ? splitArgs(m[3]).map(p => { const k = p.match(/^(\w+)\s*:\s*(.+)$/); return k ? `${ty(k[2])} ${k[1]}` : p; }).join(', ') : '';
      L = `${m[1]}${m[4] ? ty(m[4]) : 'void'} ${m[2]}(${params}) {${m[5]}`;
    }
    // private arrays with an initializer, uninitialised local arrays
    L = L.replace(/var<private>\s+(\w+)\s*:\s*array<(\w+),\s*(\d+)>\s*=\s*array<\w+,\s*\d+>\(/g, (_, n, t, k) => `${ty(t)} ${n}[${k}] = ${ty(t)}[${k}](`);
    L = L.replace(/var\s+(\w+)\s*:\s*array<(\w+),\s*(\d+)>\s*;/g, (_, n, t, k) => `${ty(t)} ${n}[${k}];`);
    L = L.replace(/var<private>\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `${ty(t)} ${n} =`);
    L = L.replace(/\bconst\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `const ${ty(t)} ${n} =`);
    L = L.replace(/\b(?:let|var)\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `${ty(t)} ${n} =`);
    L = L.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*;/g, (_, n, t) => `${ty(t)} ${n};`);
    L = L.replace(/\bloop\s*{/g, 'for (;;) {');
    L = L.replace(/\batan2\(/g, 'atan(').replace(/\binverseSqrt\(/g, 'inversesqrt(');
    L = L.replace(/bitcast<u32>\(/g, 'floatBitsToUint(').replace(/bitcast<f32>\(/g, 'uintBitsToFloat(');
    L = L.replace(/array<(\w+),\s*(\d+)>\(/g, (_, t, k) => `${ty(t)}[${k}](`);
    if (/\bselect\(/.test(L)) L = selects(L);
    for (const [a, b] of TYPES) L = L.replace(new RegExp('\\b' + a + '\\b', 'g'), b);
    out.push(L);
  }
  return out.join('\n');
}

// 01-section-api.mjs: which fixed-kernel names do Candela's per-scene generated sections use?
// usage: node 01-section-api.mjs <candela-root> <out.json>
//
// Builds every preset, splits compiled.shared with lib/candela.mjs (which also proves that every preset's
// program has the expected fixed/generated layout), and records, per preset, the fixed-kernel functions,
// globals and constants that the generated code (fieldCode, matCode) refers to. The union is the "section
// API": the kernel functions that must stay callable from separately compiled or interpreted sections
// (PICOCALC-CANDELA-SECTIONS calls them from bytecode). 02-gen-kernel.mjs reads the list from <out.json>.
import { writeFileSync } from 'node:fs';
import { checkPin, loadKernel, loadCandela, loadPresets, splitProgram, fixedParts } from './lib/candela.mjs';

const [root, outPath] = process.argv.slice(2);
if (!outPath) { console.error('usage: node 01-section-api.mjs <candela-root> <out.json>'); process.exit(2); }
checkPin(root);
const K = await loadKernel(root), C = await loadCandela(root);
const fixed = fixedParts(K).map(([, t]) => t).join('');
const strip = s => s.replace(/\/\/.*$/gm, '');
const defs = { fn: new Set(), global: new Set(), const: new Set(), struct: new Set() };
for (const m of strip(fixed).matchAll(/\bfn\s+(\w+)\s*\(/g)) defs.fn.add(m[1]);
for (const m of strip(fixed).matchAll(/var<private>\s+(\w+)/g)) defs.global.add(m[1]);
for (const m of strip(fixed).matchAll(/^\s*const\s+(\w+)\s*:/gm)) defs.const.add(m[1]);
for (const m of strip(fixed).matchAll(/\bstruct\s+(\w+)/g)) defs.struct.add(m[1]);
const ACCESSORS = ['U', 'objF', 'litF', 'bvhF', 'sdF'];
const uses = (code) => {
  const ids = new Set([...strip(code).matchAll(/\b([A-Za-z_]\w*)\b/g)].map(m => m[1]));
  const pick = (set) => [...set].filter(n => ids.has(n)).sort();
  return { fn: pick(defs.fn), global: pick(defs.global), const: pick(defs.const), struct: pick(defs.struct), accessors: ACCESSORS.filter(a => ids.has(a)) };
};
const rows = [], union = { fn: new Set(), global: new Set(), const: new Set(), struct: new Set(), accessors: new Set() };
let spectral = 0, custom = 0;
for (const p of loadPresets(root)) {
  const r = await C.build(p.files);
  if (!r.ok) { rows.push({ id: p.id, error: String(r.error && r.error.message || r.error) }); continue; }
  const s = splitProgram(r.compiled.shared, K);
  const u = uses(s.fieldCode + s.matCode);
  for (const k of Object.keys(union)) for (const n of u[k]) union[k].add(n);
  spectral += s.spectral; custom += !s.customDefault;
  rows.push({ id: p.id, spectral: s.spectral, customKernel: !s.customDefault, fieldLines: s.fieldCode.split('\n').length - 1, matLines: s.matCode.split('\n').length - 1, uses: u });
}
const api = Object.fromEntries(Object.entries(union).map(([k, v]) => [k, [...v].sort()]));
const fnCount = Object.fromEntries(api.fn.map(f => [f, rows.filter(r => r.uses && r.uses.fn.includes(f)).length]));
writeFileSync(outPath, JSON.stringify({ presets: rows.length, built: rows.filter(r => !r.error).length, spectral, customKernel: custom, api, fnPresetCount: fnCount, fixedFunctions: defs.fn.size, rows }, null, 1) + '\n');
console.log(`${rows.filter(r => !r.error).length}/${rows.length} presets split; ${spectral} spectral, ${custom} with a custom integrator`);
console.log(`section API: ${api.fn.length} of ${defs.fn.size} fixed functions, globals [${api.global}], constants [${api.const}], structs [${api.struct}], accessors [${api.accessors}]`);
console.log('functions (presets using each): ' + api.fn.map(f => `${f} ${fnCount[f]}`).join(', '));

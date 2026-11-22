// 01-census.mjs: build every Candela preset in Node and record what each one asks of a renderer.
// usage: node 01-census.mjs <candela-root> <out.json>
//   <candela-root> is a copy of the Candela workspace whose package.json has "type": "module"
//   (the original archive stays untouched). The script imports <root>/src/candela.js directly;
//   esbuild is not needed. Output: one record per preset plus a summary on stdout.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, outPath] = process.argv.slice(2);
if (!root || !outPath) { console.error('usage: node 01-census.mjs <candela-root> <out.json>'); process.exit(2); }
const C = await import(pathToFileURL(join(root, 'src/candela.js')).href);

// the preset loader of build/build.js, without its esbuild dependency
function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/); if (!m) return {};
  const meta = {}; for (const line of m[1].split('\n')) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
  return meta;
}
function loadPresets() {
  const dir = join(root, 'content/presets'), out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const meta = frontmatter(readFileSync(join(dir, f), 'utf8'));
    const base = f.replace(/\.md$/, ''), files = { 'scene.js': readFileSync(join(dir, base + '.js'), 'utf8') };
    const lib = join(dir, base); if (existsSync(lib)) for (const g of readdirSync(lib)) files['lib/' + g] = readFileSync(join(lib, g), 'utf8');
    out.push({ id: meta.id, title: meta.title, group: meta.group, files });
  }
  return out;
}

const SHAPES = ['sphere', 'plane', 'rect', 'disk', 'box', 'cylinder', 'capsule', 'torus', 'roundbox', 'cone', 'prism', 'sdf', 'heightfield', 'mesh'];
const LOBES = { 1: 'lambert', 2: 'conductor', 3: 'dielectric', 4: 'sheen', 5: 'thin', 6: 'passthrough' };
const ENVS = ['none', 'uniform', 'studio', 'gradient', 'sky', 'night', 'hdri'];
// magnitude census of a Float32Array: largest and smallest nonzero |x|
function range(a) { let lo = Infinity, hi = 0; for (const v of a) { const x = Math.abs(v); if (x > 0 && Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } } return { lo: lo === Infinity ? 0 : lo, hi }; }

const rows = [];
for (const p of loadPresets()) {
  const t0 = performance.now();
  const r = await C.build(p.files);
  const ms = performance.now() - t0;
  const row = { id: p.id, title: p.title, group: p.group, ok: r.ok, buildMs: +ms.toFixed(1) };
  if (!r.ok) { row.error = r.error && r.error.message; rows.push(row); continue; }
  const c = r.compiled, e = c.engine;
  const shapes = {}; for (const o of c.objects) { const k = SHAPES[o.ty] || String(o.ty); shapes[k] = (shapes[k] || 0) + 1; }
  // the lobes each material kernel can select, read from the generated WGSL (L.kind = N)
  const matCode = c.shared.slice(c.shared.indexOf('fn mat_'), c.shared.indexOf('fn evalMaterial'));
  const lobes = {}; for (const m of matCode.matchAll(/L\.kind = (\d)/g)) lobes[LOBES[m[1]] || m[1]] = true;
  const fxCalls = {}; for (const f of ['noise3(', 'fbm3(', 'voronoi3(', 'voronoiVec3(', 'hash13(', 'bumpN_', 'sellmeier(', 'filmR(', 'tangentWorld(']) { const n = matCode.split(f).length - 1; if (n) fxCalls[f.replace('(', '')] = n; }
  const flagsMS = (matCode.match(/L\.flags = L\.flags \| 8/g) || []).length;
  // a dielectric with flags 0 refracts; flags 2 is a reflect-only coat (material.pbr's specular layer)
  const refracting = [...matCode.matchAll(/L\.kind = 3;[^\n]*?L\.flags = (\d)/g)].filter(m => m[1] === '0').length;
  const interiors = [...matCode.matchAll(/L\.med = (\d+)/g)].length;
  const dynamicMix = (matCode.match(/if \(u < [xf]\d+_\d+\)/g) || []).length;
  // generated SSA values in material kernels, and those that vary over the surface (read a hit field,
  // the view direction or the clock) rather than only constants and uniforms
  const lets = [...matCode.matchAll(/^\s*let m\d+: \w+ = ([^\n]*)$/gm)].map(m => m[1]);
  const fieldLets = lets.filter(s => /h\.(P|uv|lp|N|Ng|irand|iid)\b|gTime|\bwo\b|gLam/.test(s)).length;
  const lights = {}; for (const L of c.lightsMeta) lights[L.kind] = (lights[L.kind] || 0) + 1;
  let pk = null;
  try { pk = c.pack({ time: 0 }); } catch (err) { row.packError = err.message; }
  Object.assign(row, {
    objects: c.stats.objects, shapes, materials: c.stats.materials, lobes: Object.keys(lobes), fxCalls, msCompensatedLobes: flagsMS,
    refracting, interiors, stochasticBranches: dynamicMix, matChars: matCode.length, materialLets: lets.length, fieldLets,
    customPasses: (e.post || []).filter(x => x.__pass === 'custom').length,
    matLines: matCode.split('\n').length, wgslLines: c.stats.lines, uniforms: c.stats.params, triangles: c.stats.triangles || 0,
    sdfs: c.stats.sdfs, media: c.stats.media, fog: !!c.fog, lights, sun: !!c.sun, sky: !!c.sky, env: c.env ? c.env.props.env : null,
    spectral: !!e.spectral, integrator: e.integrator.__integrator + (e.integrator.name ? ':' + e.integrator.name : ''), maxDepth: e.integrator.maxDepth || null,
    engine: e.name, post: (e.post || []).map(x => x.__pass + (x.op ? ':' + x.op : '')), motionBlur: !!c.motionBlur, animation: !!c.animation,
    behaviors: c.behaviors.length, hdri: c.hdri ? `${c.hdri.W}x${c.hdri.H}` : null, sceneDataBytes: c.stats.sceneData,
    thinLens: c.cameraComp ? !c.cameraComp.props.pinhole : true,
  });
  if (pk) {
    row.packed = { U: range(pk.U), O: range(pk.O), LI: range(pk.LI), sunRadiance: Math.max(pk.U[28], pk.U[29], pk.U[30]), envType: ENVS[pk.envType] || pk.envType, bvhNodes: pk.BV.length / 8 };
  }
  rows.push(row);
}
writeFileSync(outPath, JSON.stringify({ candela: root, node: process.version, presets: rows }, null, 1));
const ok = rows.filter(r => r.ok);
console.log(`${ok.length}/${rows.length} presets built; total ${rows.reduce((s, r) => s + r.buildMs, 0).toFixed(0)} ms in Node`);
for (const r of rows) console.log(`${r.ok ? 'ok ' : 'ERR'} ${r.id.padEnd(5)} ${String(r.objects ?? '').padStart(5)} obj ${String(r.materials ?? '').padStart(3)} mat ${(r.lobes || []).join('+').padEnd(28)} ${r.integrator || ''} ${r.env || ''}${r.sun ? ' sun' : ''}${r.sky ? ' sky' : ''} ${r.error || ''}`);

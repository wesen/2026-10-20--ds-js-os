// 01-prepare-scenes.mjs: the gallery's scenes, prepared on the host from the pinned Candela.
// usage: node 01-prepare-scenes.mjs <candela-run> <out-dir> [ID ...]
//
// <candela-run> is the pinned Candela (candela-workspace(1).zip, SHA-256 873b2dd4...df5d: src/, content/ and a
// package.json with "type": "module"). For each scene of GALLERY (or the IDs given) this runs Candela's own front end
// in Node (build, compile, pack at the scene's resolution, frame uniforms as Viewport.frame() writes them for pass 0)
// through PICOCALC-CANDELA-CPU-KERNEL's loader (scripts/lib/candela.mjs exportScene, read only), translates the
// generated WGSL sections to bytecode with PICOCALC-CANDELA-SECTIONS' translator (scripts/translator, read only), and
// takes the display settings the way Candela's viewport does (src/viewport.js: tone map, bloom, vignette, grain,
// false colour; camera exposure mode and EV; tan of half the field of view).
//
// Writes
//   <out-dir>/candela_gallery_scenes.c   the firmware's scene table (cg_scenes[], cg_nscenes), floats as bit patterns
//   <out-dir>/scenes.json                per scene: sizes, SHA-256 of the packed words and of the bytecode, settings
// and checks that every program was compiled against the fixed kernel the firmware carries (SHA-256 of fixedText()).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const T21 = join(HERE, '../../../21');
const CK = join(T21, 'PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/scripts');
const SE = join(T21, 'PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts');
const { checkPin, loadKernel, loadCandela, loadPresets, exportScene, ggxWGSL, METAL_AT, HIT_ALBEDO, HIT_EMISSION } =
  await import(pathToFileURL(join(CK, 'lib/candela.mjs')).href);
const { translateProgram } = await import(pathToFileURL(join(SE, 'translator/index.js')).href);

// The gallery, in showing order: CPU-KERNEL's six measured scenes, then SECTIONS' other verified presets by cost.
// Resolution: 160 x 160 unless one pass would take more than about 1.6 s on one core (estimated from SECTIONS'
// host and RV32 costs, design Section 4); then 80 x 80. The display upscales either to 320 x 320.
// Not in the gallery: K-04 and K-08, whose meshes pack into 1,135,111 and 1,065,550 static SD rows (18.2 and 17.1 MB),
// more than the firmware's 8 MB app partition.
export const GALLERY = [
  ['B-01', 160], ['R-01', 160], ['L-03', 160], ['G-01', 160], ['E-02', 160], ['W-02', 160],
  ['F-01', 160], ['V-02', 160], ['G-02', 160],
  ['X-04', 80], ['S-02', 80], ['R-05', 80], ['V-03', 80], ['V-04', 80],
  ['R-08', 80], ['X-03', 80], ['R-04', 80], ['G-03', 80],
];
const FIXED_KERNEL_SHA256 = '8925739795c775a2910c0096eb59dac235bd35719b5255539019b41cde12942d';   // WORLD design Section 8
const TONEMAP_IX = { agx: 0, aces: 1, neutral: 2, reinhard: 3, filmic: 4, linear: 5 };           // src/render.js
const EXPOSURE = { auto: 0, fixed: 1, param: 2, physical: 3 };

const [root, out, ...only] = process.argv.slice(2);
if (!out) { console.error('usage: node 01-prepare-scenes.mjs <candela-run> <out-dir> [ID ...]'); process.exit(2); }
checkPin(root);
const K = await loadKernel(root), C = await loadCandela(root);
const { cameraUniforms } = await import(pathToFileURL(join(root, 'src/compile.js')).href);
const fixed = K.PRELUDE + K.SPECTRAL + ggxWGSL(K) + K.CORE + METAL_AT + HIT_ALBEDO + HIT_EMISSION + K.PATH;
const fixedSha = createHash('sha256').update(fixed).digest('hex');
if (fixedSha !== FIXED_KERNEL_SHA256) throw new Error(`fixed kernel ${fixedSha}, expected ${FIXED_KERNEL_SHA256}`);
const presets = loadPresets(root);
const list = GALLERY.filter(([id]) => !only.length || only.includes(id));

const sha = (b) => createHash('sha256').update(b).digest('hex');
const f32 = (v) => { const a = new Float32Array([v]); return a[0]; };
// a C float literal for v rounded to single precision (the shortest double that rounds back to the same float)
const flit = (v) => { const t = String(f32(v)); return (/[.e]/.test(t) ? t : t + '.0') + 'f'; };
const words = (buf) => { const u = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4); return Array.from(u); };
const hex = (w) => '0x' + (w >>> 0).toString(16).padStart(8, '0');
const cstr = (s) => JSON.stringify(s).replace(/[^\x20-\x7e]/g, '?');
const wrap = (items, per) => { const o = []; for (let i = 0; i < items.length; i += per) o.push('  ' + items.slice(i, i + per).join(', ')); return o.join(',\n'); };

const rows = [], cParts = [], cTable = [];
for (const [id, size] of list) {
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error('no preset ' + id);
  const t0 = performance.now();
  const { compiled, bin, meta } = await exportScene(root, C, preset, size, size);
  const tr = translateProgram(compiled.shared, K);
  if (!tr.ok) throw new Error(`${id}: sections do not translate: ${JSON.stringify(tr.diagnostics)}`);
  if (!compiled.shared.includes(K.CORE) || !compiled.shared.endsWith(K.PATH)) throw new Error(`${id}: not compiled against the fixed kernel`);
  // display settings as src/viewport.js load() and show() take them
  const post = { tonemap: 'agx', denoise: !!compiled.engine.denoise, bloom: 0, falseColor: false, vignette: 0, grain: 0 };
  for (const p of compiled.engine.post || []) {
    if (p.__pass === 'tonemap') post.tonemap = p.op;
    else if (p.__pass === 'denoise') post.denoise = true;
    else if (p.__pass === 'bloom') post.bloom = p.strength;
    else if (p.__pass === 'falseColor') post.falseColor = true;
    else if (p.__pass === 'vignette') post.vignette = p.strength;
    else if (p.__pass === 'grain') post.grain = p.amount;
  }
  const cam = cameraUniforms(compiled.cameraComp, { width: size, height: size, time: 0 });
  const tm = TONEMAP_IX[post.tonemap];
  if (tm === undefined) throw new Error(`${id}: tone map ${post.tonemap}`);
  const head = new Uint32Array(bin.buffer, bin.byteOffset, 6);
  if (head[0] !== 0x314c4443) throw new Error(`${id}: packed blob magic`);
  const nrows = Array.from(head.slice(1, 6));
  const data = bin.subarray(24);
  const prog = Buffer.from(tr.bytes);
  const cid = id.replace(/\W/g, '_');
  const title = (preset.title || preset.base).replace(/^[A-Z]-\d\d\s*[-:·]?\s*/, '');
  const row = { id, title, base: preset.base, width: size, height: size, rows: nrows, dataBytes: data.length, progBytes: prog.length,
    dataSha256: sha(data), progSha256: sha(prog), spectral: !!(prog[6] & 1), integrator: meta.integrator, customKernel: meta.integrator === 'custom',
    exposureMode: cam.mode, ev: cam.ev, physicalEV: cam.physical, tanH: Math.tan(cam.fov / 2), post,
    engine: meta.engine, maxDepth: meta.maxDepth, objects: meta.objects, materials: meta.materials,
    registerWords: tr.stats.registerWords, codeHalfwords: tr.stats.codeHalfwords, prepareMs: Math.round(performance.now() - t0) };
  rows.push(row);
  cParts.push(`/* ${id} ${title}: ${size} x ${size}, rows U ${nrows[0]} O ${nrows[1]} LI ${nrows[2]} BV ${nrows[3]} SD ${nrows[4]}; data ${row.dataSha256.slice(0, 16)}, bytecode ${row.progSha256.slice(0, 16)} */
static const uint32_t ${cid}_data[${data.length / 4}] = {
${wrap(words(data).map(hex), 8)}
};
static const uint8_t ${cid}_prog[${prog.length}] = {
${wrap(Array.from(prog).map((b) => '0x' + b.toString(16).padStart(2, '0')), 16)}
};`);
  const ev = cam.mode === 'auto' || cam.ev == null ? 'NAN' : flit(cam.ev);
  cTable.push(`  { ${cstr(id)}, ${cstr(title)}, ${size}, ${size}, ${row.spectral ? 1 : 0}, ${row.customKernel ? 1 : 0}, ${EXPOSURE[cam.mode]}, ${tm}, ` +
    `${post.falseColor ? 1 : 0}, ${post.denoise ? 1 : 0}, ${ev}, ${flit(post.vignette || 0)}, ${flit(post.grain || 0)}, ${flit(post.bloom || 0)}, ` +
    `${flit(row.tanH)}, { ${nrows.join(', ')} }, ${cid}_data, ${cid}_prog, ${prog.length} }`);
  console.log(`${id} ${title}: ${size}x${size}, ${data.length} data bytes, ${prog.length} bytecode bytes, ${post.tonemap}, exposure ${cam.mode}` +
    `${cam.mode === 'auto' ? '' : ' ' + cam.ev.toFixed(3)}${row.spectral ? ', spectral' : ''} (${row.prepareMs} ms)`);
}

mkdirSync(out, { recursive: true });
const c = `/* candela_gallery_scenes.c: the Candela gallery's scenes (PICOCALC-CANDELA-GALLERY). Generated by
 * the PICOCALC-CANDELA-GALLERY ticket's scripts/01-prepare-scenes.mjs from the pinned Candela
 * (candela-workspace(1).zip, SHA-256 873b2dd4...df5d); do not edit. Per scene: Candela's packed buffers (U, O, LI, BV, SD
 * rows of four floats, frame uniforms for pass 0 at the scene's resolution) as float bit patterns, and the scene's
 * generated sections as PICOCALC-CANDELA-SECTIONS bytecode. Every program was compiled against the fixed kernel whose
 * fixedText() has SHA-256 CG_FIXED_KERNEL_SHA256. */
#include <math.h>
#include <stdint.h>
#include "candela_gallery.h"

const char cg_scenes_fixed_kernel_sha256[] = "${fixedSha}";

${cParts.join('\n\n')}

const cg_scene_desc cg_scenes[] = {
${cTable.join(',\n')}
};
const unsigned cg_nscenes = ${cTable.length};
`;
writeFileSync(join(out, 'candela_gallery_scenes.c'), c);
const kernelJs = createHash('sha256').update(readFileSync(join(root, 'src/kernel.js'))).digest('hex');
writeFileSync(join(out, 'scenes.json'), JSON.stringify({ fixedKernelSha256: fixedSha, kernelJsSha256: kernelJs, candelaArchive: '873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d', scenes: rows }, null, 1) + '\n');
console.log(`${rows.length} scenes; ${rows.reduce((a, r) => a + r.dataBytes + r.progBytes, 0)} bytes of scene data and bytecode; fixed kernel ${fixedSha}`);

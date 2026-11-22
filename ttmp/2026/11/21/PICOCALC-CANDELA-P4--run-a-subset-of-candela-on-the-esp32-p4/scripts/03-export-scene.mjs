// 03-export-scene.mjs: run Candela's own front end on one preset and write what a native kernel needs.
// usage: node 03-export-scene.mjs <candela-root> <preset-id> <width> <height> <out-dir>
// Writes <out-dir>/kernel.wgsl (compiled.shared: the hand-written kernel plus this scene's generated
// material, SDF, density and integrator functions), <out-dir>/scene.bin (the packed buffers, see the
// layout below) and <out-dir>/scene.json (sizes, camera exposure, engine settings). The uniform rows
// 0-5, 20 and 21 are filled the way src/viewport.js fills them before a dispatch (Viewport.step).
// scene.bin: magic 'CDL1', then u32 counts [nU, nO, nLI, nBV, nSD] (in vec4 rows), then the rows
// of U, O, LI, BV and SD as little-endian f32. SD is the scene data the kernel reads through sdF():
// the static head SDs followed, at row dynBase, by the dynamic tail SDd (as render.js uploadSD does).
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, id, W, H, outDir] = process.argv.slice(2);
if (!outDir) { console.error('usage: node 03-export-scene.mjs <candela-root> <preset-id> <width> <height> <out-dir>'); process.exit(2); }
const C = await import(pathToFileURL(join(root, 'src/candela.js')).href);
const { cameraUniforms } = await import(pathToFileURL(join(root, 'src/compile.js')).href);
const dir = join(root, 'content/presets');
const f = readdirSync(dir).find(f => f.startsWith(id + '-') && f.endsWith('.js'));
if (!f) throw new Error('no preset ' + id);
const files = { 'scene.js': readFileSync(join(dir, f), 'utf8') };
const lib = join(dir, f.replace(/\.js$/, '')); if (existsSync(lib)) for (const g of readdirSync(lib)) files['lib/' + g] = readFileSync(join(lib, g), 'utf8');
const r = await C.build(files);
if (!r.ok) throw r.error;
const c = r.compiled, w = +W, h = +H;
const pk = c.pack({ time: 0 });
const U = pk.U, integ = c.engine.integrator || {};
const cam = cameraUniforms(c.cameraComp, { width: w, height: h, time: 0 });
const mode = { path: 0, albedo: 1, normals: 2, depth: 3, ao: 4, custom: 9 }[integ.__integrator] || 0;
U.set([w, h, 0, 1], 0);
U.set(cam.U1, 4); U.set(cam.U2, 8); U.set(cam.U3, 12); U.set(cam.U4, 16);
U.set([1, integ.maxDepth || 8, integ.rrAfter || 3, (integ.nee === false ? 0 : 1) | (integ.mis === 'none' ? 0 : 2)], 20);
U[80] = cam.bladeRot || 0; U[81] = integ.radius || 0.5; U[82] = integ.clamp || 0;
U[84] = 1; U[85] = 1; U[86] = 1; U[87] = mode; U[96] = 0;
const sdRows = Math.max(pk.dynBase + pk.SDd.length / 4, pk.SDs.length / 4, 1);
const SD = new Float32Array(sdRows * 4); SD.set(pk.SDs, 0); SD.set(pk.SDd, pk.dynBase * 4);
const parts = [U, pk.O, pk.LI, pk.BV, SD];
const head = new Uint32Array([0x314c4443, ...parts.map(p => p.length / 4)]);
const bytes = Buffer.concat([Buffer.from(head.buffer), ...parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength))]);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'kernel.wgsl'), c.shared);
writeFileSync(join(outDir, 'scene.bin'), bytes);
writeFileSync(join(outDir, 'scene.json'), JSON.stringify({ preset: id, title: f, width: w, height: h, nU: c.nU, rows: parts.map(p => p.length / 4),
  ev: cam.ev, exposureMode: cam.mode, physicalEV: cam.physical, engine: c.engine.name, maxDepth: integ.maxDepth, rrAfter: integ.rrAfter,
  objects: c.stats.objects, materials: c.stats.materials, wgslLines: c.stats.lines, post: (c.engine.post || []).map(p => p.__pass + (p.op ? ':' + p.op : '')) }, null, 1));
console.log(`${id}: ${c.stats.lines} WGSL lines, ${bytes.length} data bytes, camera exposure ${cam.mode} ${cam.ev ?? ''}`);

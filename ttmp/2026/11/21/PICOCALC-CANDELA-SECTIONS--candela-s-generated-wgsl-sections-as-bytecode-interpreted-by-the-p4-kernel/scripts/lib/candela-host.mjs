// candela-host.mjs: host-side (Node) access to a pinned Candela copy for the SECTIONS host tests.
// Not part of the device translator: it reads files and imports Candela's modules by path.
//
// The Candela copy is untrusted downloaded data. Callers pass its path; nothing here runs from inside it, and
// this module only imports src/*.js from it, as PICOCALC-CANDELA-P4 and PICOCALC-CANDELA-CPU-KERNEL did.
// loadPresets() and exportScene() follow CPU-KERNEL's scripts/lib/candela.mjs (itself from P4's 01-census.mjs
// and 03-export-scene.mjs), so scene.bin has the same layout as both earlier tickets'.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PIN = {
  archive: '873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d',
  'src/kernel.js': '253d242df1a8827903e218c9ad119558d313f92da9f582ec3a25a6b8f7fb45c4',
  'src/compile.js': '6f5926cc1b8fe98a5ec3e3eb5dae0cc02efae75e67b115c99acca33aa2368f90',
  'src/fx.js': null,   // recorded by 01-export-sections.mjs, not enforced
};
export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
export function checkPin(root) {
  const bad = [];
  for (const [rel, want] of Object.entries(PIN)) {
    if (rel === 'archive' || !want) continue;
    const got = sha256(readFileSync(join(root, rel)));
    if (got !== want) bad.push(`${rel}: ${got} (pinned ${want})`);
  }
  if (bad.length) throw new Error('Candela copy differs from the pinned version:\n  ' + bad.join('\n  '));
}
export const loadKernel = root => import(pathToFileURL(join(root, 'src/kernel.js')).href);
export const loadCandela = root => import(pathToFileURL(join(root, 'src/candela.js')).href);

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/); if (!m) return {};
  const meta = {}; for (const line of m[1].split('\n')) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
  return meta;
}
export function loadPresets(root) {
  const dir = join(root, 'content/presets'), out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const meta = frontmatter(readFileSync(join(dir, f), 'utf8'));
    const base = f.replace(/\.md$/, ''), files = { 'scene.js': readFileSync(join(dir, base + '.js'), 'utf8') };
    const lib = join(dir, base); if (existsSync(lib)) for (const g of readdirSync(lib)) files['lib/' + g] = readFileSync(join(lib, g), 'utf8');
    out.push({ id: meta.id, title: meta.title, base, files });
  }
  return out;
}

// Build, pack at time 0, and fill uniform rows 0-5, 20, 21 as src/viewport.js does before a dispatch.
export async function exportScene(root, C, preset, W, H) {
  const { cameraUniforms } = await import(pathToFileURL(join(root, 'src/compile.js')).href);
  const r = await C.build(preset.files);
  if (!r.ok) throw r.error;
  const c = r.compiled;
  const pk = c.pack({ time: 0 });
  const U = pk.U, integ = c.engine.integrator || {};
  const cam = cameraUniforms(c.cameraComp, { width: W, height: H, time: 0 });
  const mode = { path: 0, albedo: 1, normals: 2, depth: 3, ao: 4, custom: 9 }[integ.__integrator] || 0;
  U.set([W, H, 0, 1], 0);
  U.set(cam.U1, 4); U.set(cam.U2, 8); U.set(cam.U3, 12); U.set(cam.U4, 16);
  U.set([1, integ.maxDepth || 8, integ.rrAfter || 3, (integ.nee === false ? 0 : 1) | (integ.mis === 'none' ? 0 : 2)], 20);
  U[80] = cam.bladeRot || 0; U[81] = integ.radius || 0.5; U[82] = integ.clamp || 0;
  U[84] = 1; U[85] = 1; U[86] = 1; U[87] = mode; U[96] = 0;
  const sdRows = Math.max(pk.dynBase + pk.SDd.length / 4, pk.SDs.length / 4, 1);
  const SD = new Float32Array(sdRows * 4); SD.set(pk.SDs, 0); SD.set(pk.SDd, pk.dynBase * 4);
  const parts = [U, pk.O, pk.LI, pk.BV, SD];
  const headWords = new Uint32Array([0x314c4443, ...parts.map(p => p.length / 4)]);
  const bin = Buffer.concat([Buffer.from(headWords.buffer), ...parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength))]);
  const meta = { preset: preset.id, title: preset.base, width: W, height: H, rows: parts.map(p => p.length / 4), nU: c.nU,
    engine: c.engine.name, maxDepth: integ.maxDepth, rrAfter: integ.rrAfter, integrator: integ.__integrator || 'path',
    objects: c.stats.objects, materials: c.stats.materials, sdfs: c.stats.sdfs, wgslLines: c.stats.lines, spectral: !!c.spectral };
  return { compiled: c, bin, meta };
}

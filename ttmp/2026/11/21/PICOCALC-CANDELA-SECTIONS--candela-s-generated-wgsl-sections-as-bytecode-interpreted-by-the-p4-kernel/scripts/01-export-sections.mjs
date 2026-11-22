// 01-export-sections.mjs: build every preset with Candela's own front end and write its generated sections.
// usage: node 01-export-sections.mjs <candela-root> <out-dir> [W H] [preset-id ...]
// For each preset, <out-dir>/<ID>/ receives
//   field.wgsl   sdfCode + hfCode + densCode (sdf_k, hf_k, dens_k, sdUser, heightAt, densityOf)
//   mat.wgsl     matCode without hitAlbedo/hitEmission (bump helpers, mat_k, evalMaterial, customKernel)
//   kernel.wgsl  the whole program (compiled.shared), for the prototype C++ translation (P4 04-wgsl2cpp.mjs)
//   scene.bin    U, O, LI, BV, SD rows in P4's 'CDL1' layout, uniform rows set for a W x H frame
//   meta.json    sizes, engine, spectral flag
// and <out-dir>/index.json lists every preset with its build result.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkPin, loadKernel, loadCandela, loadPresets, exportScene, sha256 } from './lib/candela-host.mjs';
import { splitProgram } from './translator/split.js';

const [root, outDir, W = '64', H = '64', ...only] = process.argv.slice(2);
if (!outDir) { console.error('usage: node 01-export-sections.mjs <candela-root> <out-dir> [W H] [preset-id ...]'); process.exit(2); }
checkPin(root);
const K = await loadKernel(root), C = await loadCandela(root);
const index = { candela: { kernel: sha256(readFileSync(join(root, 'src/kernel.js'))), compile: sha256(readFileSync(join(root, 'src/compile.js'))), fx: sha256(readFileSync(join(root, 'src/fx.js'))) }, width: +W, height: +H, presets: [] };
for (const p of loadPresets(root)) {
  if (only.length && !only.includes(p.id)) continue;
  const d = join(outDir, p.id); mkdirSync(d, { recursive: true });
  const t0 = performance.now();
  try {
    const { compiled, bin, meta } = await exportScene(root, C, p, +W, +H);
    const s = splitProgram(compiled.shared, K);
    writeFileSync(join(d, 'field.wgsl'), s.fieldCode);
    writeFileSync(join(d, 'mat.wgsl'), s.matCode);
    writeFileSync(join(d, 'kernel.wgsl'), compiled.shared);
    writeFileSync(join(d, 'scene.bin'), bin);
    meta.fieldLines = s.fieldCode.split('\n').length; meta.matLines = s.matCode.split('\n').length;
    writeFileSync(join(d, 'meta.json'), JSON.stringify(meta, null, 1));
    index.presets.push({ id: p.id, base: p.base, ok: true, spectral: s.spectral, fieldLines: meta.fieldLines, matLines: meta.matLines, ms: +(performance.now() - t0).toFixed(1) });
    console.log(`${p.id}: field ${meta.fieldLines} lines, material ${meta.matLines} lines${s.spectral ? ', spectral' : ''}`);
  } catch (e) {
    index.presets.push({ id: p.id, base: p.base, ok: false, error: String(e && e.message || e) });
    console.log(`${p.id}: FAILED ${e && e.message || e}`);
  }
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 1));
console.log(`${index.presets.filter(p => p.ok).length}/${index.presets.length} presets exported`);

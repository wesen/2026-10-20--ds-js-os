// 02-translate-all.mjs: translate every exported preset's sections to bytecode and report coverage by construct.
// usage: node 02-translate-all.mjs <export-dir> <out.json> [preset-id ...]
// Reads <export-dir>/<ID>/{field,mat}.wgsl and meta.json (01-export-sections.mjs), writes <ID>/prog.cdvm and
// <ID>/prog.lst, and a summary JSON (per preset: ok, diagnostics, sizes, instruction mix; failures by construct).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { translateSections } from './translator/index.js';
import { listing } from './translator/disasm.js';

const [dir, outJson, ...only] = process.argv.slice(2);
if (!outJson) { console.error('usage: node 02-translate-all.mjs <export-dir> <out.json> [preset-id ...]'); process.exit(2); }
const ids = readdirSync(dir).filter(d => existsSync(join(dir, d, 'mat.wgsl'))).filter(d => !only.length || only.includes(d)).sort();
const rows = [], byConstruct = {};
const t0 = performance.now();
for (const id of ids) {
  const meta = JSON.parse(readFileSync(join(dir, id, 'meta.json'), 'utf8'));
  const field = readFileSync(join(dir, id, 'field.wgsl'), 'utf8'), mat = readFileSync(join(dir, id, 'mat.wgsl'), 'utf8');
  const t = performance.now();
  const r = translateSections(field, mat, { spectral: meta.spectral });
  const ms = performance.now() - t;
  const row = { id, ok: r.ok, ms: +ms.toFixed(2), spectral: meta.spectral };
  if (r.ok) {
    writeFileSync(join(dir, id, 'prog.cdvm'), r.bytes);
    writeFileSync(join(dir, id, 'prog.lst'), listing(r.bytes) + '\n');
    Object.assign(row, { bytes: r.bytes.length, sha256: createHash('sha256').update(r.bytes).digest('hex'), stats: r.stats });
  } else {
    row.diagnostics = r.diagnostics;
    for (const d of r.diagnostics) (byConstruct[d.construct] = byConstruct[d.construct] || []).push(id);
  }
  rows.push(row);
  console.log(r.ok ? `${id}: ${r.bytes.length} bytes, ${r.stats.registerWords} registers, ${r.stats.codeHalfwords} halfwords (${ms.toFixed(1)} ms)`
    : `${id}: FAILED ${r.diagnostics.map(d => `${d.code} ${d.construct}: ${d.message}${d.where ? ` (${d.where.file}:${d.where.line}:${d.where.col})` : ''}`).join('; ')}`);
}
const ok = rows.filter(r => r.ok);
const summary = { presets: rows.length, translated: ok.length, failedByConstruct: byConstruct, totalMs: +(performance.now() - t0).toFixed(1), rows };
writeFileSync(outJson, JSON.stringify(summary, null, 1));
console.log(`${ok.length}/${rows.length} presets translated; failures by construct: ${JSON.stringify(Object.fromEntries(Object.entries(byConstruct).map(([k, v]) => [k, v.length])))}`);

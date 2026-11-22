// 04-qjs-translate.mjs: run the translator in the firmware's QuickJS (scripts/quickjs of PICOCALC-CANDELA-P4,
// candela-qjs) or in Node, over exported presets, and write each blob as hex plus the translation cost.
//   candela-qjs 04-qjs-translate.mjs EXPORT_DIR OUT_DIR [REPS] [IDS...]
//   node        04-qjs-translate.mjs EXPORT_DIR OUT_DIR [REPS] [IDS...]
// OUT_DIR/<ID>.hex holds the blob; one '@@' JSON line per preset gives bytes, an FNV-1a hash, the median CPU time of
// REPS translations after a first (cold) one, and, in QuickJS, interpreter steps per translation.
// The translator modules are imported by relative path; nothing here uses a Node API unless running under Node.
import { translateSections } from './translator/index.js';

const isNode = typeof host === 'undefined';
const H = isNode ? await nodeHost() : host;
async function nodeHost() {
  const fs = await import('node:fs');
  return {
    args: process.argv.slice(2), cpu: () => process.cpuUsage().user / 1000 + process.cpuUsage().system / 1000, steps: () => NaN,
    readFile: p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } },
    writeFile: (p, s) => { fs.writeFileSync(p, s); return true; },
    listDir: p => fs.readdirSync(p), isDir: p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } },
  };
}
const [dir, out, repsArg, ...only] = H.args;
const reps = +(repsArg || 5);
const hex = b => { let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; };
const fnv = b => { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const ids = H.listDir(dir).filter(d => H.isDir(dir + '/' + d) && H.readFile(dir + '/' + d + '/mat.wgsl') !== null && (!only.length || only.includes(d))).sort();
for (const id of ids) {
  const field = H.readFile(`${dir}/${id}/field.wgsl`), mat = H.readFile(`${dir}/${id}/mat.wgsl`);
  const meta = JSON.parse(H.readFile(`${dir}/${id}/meta.json`));
  const c0 = H.cpu(), s0 = H.steps();
  const r = translateSections(field, mat, { spectral: meta.spectral });
  const cold = H.cpu() - c0, coldSteps = H.steps() - s0;
  if (!r.ok) { console.log('@@' + JSON.stringify({ id, ok: false, diagnostics: r.diagnostics })); continue; }
  const t = [], st = [];
  for (let k = 0; k < reps; k++) { const a = H.cpu(), b = H.steps(); translateSections(field, mat, { spectral: meta.spectral }); t.push(H.cpu() - a); st.push(H.steps() - b); }
  H.writeFile(`${out}/${id}.hex`, hex(r.bytes) + '\n');
  console.log('@@' + JSON.stringify({ id, ok: true, engine: isNode ? 'node' : 'quickjs', bytes: r.bytes.length, fnv: fnv(r.bytes), coldMs: +cold.toFixed(2), warmMs: +median(t).toFixed(2),
    coldSteps, warmSteps: median(st), wgslBytes: field.length + mat.length }));
}

#!/usr/bin/env node
// 01-count.mjs: host instruction counts and an instruction profile of the Typed Candela kernel's RV32 build
// (PICOCALC-CANDELA-KERNEL-CODEGEN).
//
// usage: node 01-count.mjs [--repo DIR] [--app DIR | --gen] [--policy P] [--rows N] [--passes N] [--frame F] [--json OUT]
//        [--top K] [--dump DIR] ID ...
//
// The source is the generated app (--app, default apps/typed/candela-gallery, assembled in app.json's order) or a fresh
// run of the generator (--gen). For each scene: the RV32 build (one compile for all scenes) on the reference interpreter
// (bench/host/rv32-interp.js), N evenly spaced rows of frame F (default: every row of frame 0) at the gallery's size;
// prints instructions per sample, the instruction classes per sample and the functions with the most instructions
// (after inlining: an inlined callee counts in its caller). The C++ arm's count is
// bench/reference/candela-gallery/rv32-4-passes.jsonl's perSample (all four passes, the renderer core included).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(name); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
// --repo DIR: another tree's compiler, generator and app (a `git archive` of a base commit), for before/after counts
const REPO = resolve(opt('--repo', resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..')));
const { TypedKernel, realm } = await import(REPO + '/tools/gen/candela/typed/host.mjs');
const { generateTypedGallery, assemble } = await import(REPO + '/tools/gen/candela/kernel-typed.mjs');
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const gen = flag('--gen');
const appDir = resolve(opt('--app', REPO + '/apps/typed/candela-gallery'));
const policy = opt('--policy', 'kernel'), rowsArg = opt('--rows', null), frame = +opt('--frame', '0');
const jsonOut = opt('--json', null), top = +opt('--top', '25'), dump = opt('--dump', null), passes = +opt('--passes', '1');
const setArg = opt('--set', null);
const ids = argv;

const gallery = JSON.parse(readFileSync(REPO + '/tools/gen/candela/gallery.json'));
const g = await generateTypedGallery(REPO + '/firmware/third_party/candela', gallery);
let source;
if (gen) source = assemble(g.files);
else {
  const app = JSON.parse(readFileSync(appDir + '/app.json'));
  source = app.sources.map(s => readFileSync(resolve(appDir, s), 'utf8')).join('\n');
}
const cpp = new Map(readFileSync(REPO + '/bench/reference/candela-gallery/rv32-4-passes.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(r => [r.id, r.perSample]));

// RV32 instruction classes (one per word)
function klass(w) {
  const op = w & 0x7f, f3 = (w >>> 12) & 7, f7 = w >>> 25, rd = (w >>> 7) & 31, rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31;
  switch (op) {
    case 0x03: return rs1 === 2 || rs1 === 8 ? 'lw.frame' : 'lw.mem';
    case 0x07: return rs1 === 2 || rs1 === 8 ? 'flw.frame' : 'flw.mem';
    case 0x23: return rs1 === 2 || rs1 === 8 ? 'sw.frame' : 'sw.mem';
    case 0x27: return rs1 === 2 || rs1 === 8 ? 'fsw.frame' : 'fsw.mem';
    case 0x63: return 'branch';
    case 0x6f: return rd === 1 ? 'call' : 'jump';
    case 0x67: return rd === 0 && rs1 === 1 ? 'ret' : 'jalr';
    case 0x37: case 0x17: return 'lui';
    case 0x13: return f3 === 0 && (w >> 20) === 0 ? 'mv' : 'alu.imm';
    case 0x33: return f7 === 1 ? (f3 < 4 ? 'mul' : 'div') : 'alu';
    case 0x53: {
      if (f7 === 0x00 || f7 === 0x04) return 'fadd';
      if (f7 === 0x08) return 'fmul';
      if (f7 === 0x0c) return 'fdiv';
      if (f7 === 0x2c) return 'fsqrt';
      if (f7 === 0x10) return rs1 === rs2 && f3 === 0 ? 'fmv.s' : 'fsgnj';
      if (f7 === 0x14) return 'fminmax';
      if (f7 === 0x50) return 'fcmp';
      if (f7 === 0x60 || f7 === 0x68) return 'fcvt';
      if (f7 === 0x70 || f7 === 0x78) return 'fmv.x';
      return 'fother';
    }
    case 0x73: return w === 0x00100073 ? 'ebreak' : 'csr';
  }
  return 'other';
}

const ctx = realm();
// --set NAME=NUMBER,...: globals of the compiler's realm, for experiments with a switch a change reads from globalThis
for (const kv of (setArg ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); ctx[k] = +v; }
const t0 = Date.now();
const K = await TypedKernel.create(source, 'rv32', { ctx, policy });
const program = K.program;
const compileMs = Date.now() - t0;
const image = program.image, view = new DataView(image.buffer, image.byteOffset, image.byteLength);
const words = image.byteLength >>> 2;
console.log(JSON.stringify({ policy, imageBytes: image.length, compileMs, functions: Object.keys(program.entries).length }));

const results = [];
for (const id of ids) {
  const index = g.scenes.findIndex(s => s.id === id);
  if (index < 0) throw new Error('no scene ' + id);
  const s = g.scenes[index], w = s.size, h = s.size;
  K.bind({ index, spectral: s.spectral, bin: s.bin });
  const nrows = rowsArg ? +rowsArg : h;
  const counts = new Float64Array(words);
  let steps = 0;
  const t1 = Date.now();
  for (let p = 0; p < passes; p++) {
    const fr = p === 0 ? frame : frame + p + 1;          // the gallery's frame indices: 0, 2, 3, ...
    for (let k = 0; k < nrows; k++) {
      const y = Math.floor(k * h / nrows);
      const r = ctx.typedRv32Interp.run(program, 'cdlRenderSpan', [4096, K.out, y, 0, w, fr], K.mem, { counts: true, limit: 4e9, stackBytes: 1 << 16 });
      if (r.trap) throw new Error(id + ' trapped');
      K.mem.set(r.bytes);
      steps += r.steps;
      for (let i = 0; i < words; i++) if (r.counts[i]) counts[i] += r.counts[i];
    }
  }
  const samples = nrows * w * passes;
  if (dump) {
    writeFileSync(`${dump}/image.bin`, image);
    writeFileSync(`${dump}/entries.json`, JSON.stringify(program.entries));
    writeFileSync(`${dump}/${id}.counts.json`, JSON.stringify({ samples, counts: Array.from(counts) }));
  }
  const classes = {};
  for (let i = 0; i < words; i++) if (counts[i]) { const c = klass(view.getUint32(4 * i, true)); classes[c] = (classes[c] || 0) + counts[i]; }
  const starts = Object.entries(program.entries).sort((p, q) => p[1] - q[1]);
  const fns = [];
  for (let i = 0; i < starts.length; i++) {
    const [name, start] = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1][1] : image.byteLength;
    let n = 0; const fc = {};
    for (let a = start; a < end; a += 4) { const c = counts[a >>> 2]; if (!c) continue; n += c; const kk = klass(view.getUint32(a, true)); fc[kk] = (fc[kk] || 0) + c; }
    if (n) fns.push({ name, perSample: +(n / samples).toFixed(1), calls: +(counts[start >>> 2] / samples).toFixed(3), bytes: end - start,
      classes: Object.fromEntries(Object.entries(fc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / samples).toFixed(1)])) });
  }
  fns.sort((a, b) => b.perSample - a.perSample);
  const rec = { id, policy, frame, rows: nrows, samples, perSample: +(steps / samples).toFixed(1), cppPerSample: cpp.get(id) ?? null,
    ratio: cpp.get(id) ? +((steps / samples) / cpp.get(id)).toFixed(3) : null, ms: Date.now() - t1,
    classes: Object.fromEntries(Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / samples).toFixed(1)])),
    functions: fns.slice(0, top) };
  results.push(rec);
  console.log(JSON.stringify({ id, perSample: rec.perSample, cppPerSample: rec.cppPerSample, ratio: rec.ratio, rows: nrows, ms: rec.ms }));
  console.log('  classes ' + Object.entries(rec.classes).map(([k, v]) => `${k} ${v}`).join(', '));
  for (const f of rec.functions.slice(0, Math.min(top, 15))) console.log(`  ${f.name.padEnd(22)} ${String(f.perSample).padStart(8)} calls ${f.calls}  ${Object.entries(f.classes).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ policy, imageBytes: image.length, results }, null, 1) + '\n');

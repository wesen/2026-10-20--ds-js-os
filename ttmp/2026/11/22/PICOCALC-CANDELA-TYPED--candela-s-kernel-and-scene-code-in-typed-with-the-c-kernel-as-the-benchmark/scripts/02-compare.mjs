#!/usr/bin/env node
// 02-compare.mjs: the Typed Candela kernel on the host against itself and against the C++ arm (PICOCALC-CANDELA-TYPED).
//
// usage: node 02-compare.mjs CPPDIR PASSES [--rv32 all|rows:N|none] [--policy P] [--json OUT.jsonl] [ID ...]
//
// For each scene: the Typed program for all gallery scenes (or the listed ones) from tools/gen/candela/kernel-typed.mjs,
// its WebAssembly build rendering PASSES passes as the gallery does (typed/host.mjs render), the frame-0 and
// accumulation digests; with --rv32 the RV32 build on the reference interpreter over all rows (bit identity of every
// pixel output) or N rows of frame 0; and against CPPDIR/ID.frame0.f32 and ID.acc.f32 (01-build-cpp-ref.py) the
// image error of the diary's bound: E_rel = sum |m_t - m_c| / sum |m_c| over the mean colours m = acc.rgb / acc.a.
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const { TypedKernel, render, realm, fnv, hex } = await import(REPO + '/tools/gen/candela/typed/host.mjs');
const { generateTypedGallery, assemble } = await import(REPO + '/tools/gen/candela/kernel-typed.mjs');

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(name); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const rv32 = opt('--rv32', 'none'), policy = opt('--policy', 'kernel'), jsonOut = opt('--json', null), only = opt('--only', null);
const [cppDir, passesArg, ...ids] = argv;
const passes = +passesArg;
const gallery = JSON.parse(readFileSync(REPO + '/tools/gen/candela/gallery.json'));
const g = await generateTypedGallery(REPO + '/firmware/third_party/candela', gallery, { only: only ? only.split(',') : undefined });
const src = assemble(g.files);
const ctx = realm();
const W = await TypedKernel.create(src, 'wasm', { ctx });
const V = rv32 !== 'none' ? await TypedKernel.create(src, 'rv32', { ctx, policy }) : null;
if (V) console.log(JSON.stringify({ rv32Compile: { policy, ms: V.compileMs, bytes: V.program.image.length } }));

g.scenes.forEach((s, index) => {
  if (ids.length && !ids.includes(s.id)) return;
  const scene = { index, spectral: s.spectral, bin: s.bin }, w = s.size, h = s.size;
  const t0 = Date.now();
  W.bind(scene);
  const r = render(W, w, h, passes, { keep: rv32 === 'all' });
  const rec = { id: s.id, w, h, passes, frame0: r.frame0, acc: r.acc, wasmMs: Date.now() - t0 };
  if (V) {
    V.bind(scene);
    const t1 = Date.now();
    if (rv32 === 'all') {
      const rv = render(V, w, h, passes, { keep: true });
      let differ = 0;
      rv.pixouts.forEach((o, i) => { const a = new Uint32Array(o.buffer), b = new Uint32Array(r.pixouts[i].buffer); for (let j = 0; j < a.length; j++) if (a[j] !== b[j] && !(o[j] !== o[j] && r.pixouts[i][j] !== r.pixouts[i][j])) differ++; });
      Object.assign(rec, { rv32Frame0: rv.frame0, rv32Acc: rv.acc, rv32FloatsDiffer: differ, rv32Identical: rv.frame0 === r.frame0 && rv.acc === r.acc && differ === 0 });
    } else {
      const n = +rv32.split(':')[1];
      let differ = 0;
      for (let k = 0; k < n; k++) {
        const y = Math.floor(k * h / n);
        const a = new Uint32Array(W.span(y, 0, w, 0).buffer), b = new Uint32Array(V.span(y, 0, w, 0).buffer);
        for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) differ++;
      }
      Object.assign(rec, { rv32Rows: n, rv32FloatsDiffer: differ });
    }
    rec.rv32Ms = Date.now() - t1;
  }
  const accPath = `${cppDir}/${s.id}.acc.f32`, f0Path = `${cppDir}/${s.id}.frame0.f32`;
  if (existsSync(accPath)) {
    const c = new Float32Array(readFileSync(accPath).buffer.slice(0)), t = r.accFloats;
    let num = 0, den = 0, same = 0, maxRel = 0;
    for (let p = 0; p < w * h; p++) {
      let eq = true;
      for (let k = 0; k < 4; k++) if (Math.fround(c[4 * p + k]) !== t[4 * p + k] && !(c[4 * p + k] !== c[4 * p + k] && t[4 * p + k] !== t[4 * p + k])) eq = false;
      if (eq) same++;
      for (let k = 0; k < 3; k++) {
        const mc = c[4 * p + k] / c[4 * p + 3], mt = t[4 * p + k] / t[4 * p + 3];
        num += Math.abs(mt - mc); den += Math.abs(mc);
        const rel = Math.abs(mt - mc) / Math.max(Math.abs(mc), 1e-6);
        if (rel > maxRel) maxRel = rel;
      }
    }
    const f0 = new Uint32Array(readFileSync(f0Path).buffer.slice(0));
    rec.cpp = { eRel: +(num / den).toPrecision(4), withinBound: num / den <= 0.02, accPixelsIdentical: +(same / (w * h)).toFixed(4), maxRel: +maxRel.toPrecision(3), frame0Digest: hex(fnv(2166136261, new Uint8Array(f0.buffer))) };
  }
  console.log(JSON.stringify(rec));
  if (jsonOut) appendFileSync(jsonOut, JSON.stringify(rec) + '\n');
});

#!/usr/bin/env node
// 07-typed-dump.mjs: every pixel output of PASSES passes per gallery scene from the generated Typed program's
// WebAssembly build, as DUMPDIR/ID.typed.f32 (pass-major, then rows), for 07-typed-ref.c (PICOCALC-CANDELA-TYPED; copied to PICOCALC-CANDELA-KERNEL-CODEGEN).
// Prints the scene ids written. usage: node 07-typed-dump.mjs DUMPDIR PASSES [ID ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const { TypedKernel, render, realm } = await import(REPO + '/tools/gen/candela/typed/host.mjs');
const { generateTypedGallery, assemble } = await import(REPO + '/tools/gen/candela/kernel-typed.mjs');
const [dir, passes, ...ids] = process.argv.slice(2);
const gallery = JSON.parse(readFileSync(REPO + '/tools/gen/candela/gallery.json'));
const g = await generateTypedGallery(REPO + '/firmware/third_party/candela', gallery);
const k = await TypedKernel.create(assemble(g.files), 'wasm', { ctx: realm() });
const done = [];
g.scenes.forEach((s, index) => {
  if (ids.length && !ids.includes(s.id)) return;
  k.bind({ index, spectral: s.spectral, bin: s.bin });
  const r = render(k, s.size, s.size, +passes, { keep: true });
  writeFileSync(`${dir}/${s.id}.typed.f32`, Buffer.concat(r.pixouts.map(o => Buffer.from(o.buffer))));
  done.push(s.id);
});
console.log(done.join(' '));

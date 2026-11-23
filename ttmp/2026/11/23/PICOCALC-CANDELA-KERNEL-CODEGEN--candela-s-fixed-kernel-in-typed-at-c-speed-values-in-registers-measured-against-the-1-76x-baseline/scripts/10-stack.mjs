#!/usr/bin/env node
// 10-stack.mjs: the deepest stack the Typed Candela kernel's RV32 build can use from an entry (PICOCALC-CANDELA-KERNEL-CODEGEN).
//
// usage: node 10-stack.mjs [--repo DIR] [--policy P] [ENTRY ...]   (default entries: cdlRenderSpan cdlSky cdlInit)
//
// Each function's frame is read from its prologue (`addi sp, sp, -N`, or a large frame's `lui t5; addi t5; sub sp, sp,
// t5`; none for a frameless leaf), its callees from its `jal ra` words; Typed's call graph is acyclic, so the deepest
// path is a longest path. The gallery's render task has a 24 KB stack (candela_gallery_p4.c STACK) for this and the
// renderer core.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(name); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const REPO = resolve(opt('--repo', resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..')));
const policy = opt('--policy', 'kernel');
const entries = argv.length ? argv : ['cdlRenderSpan', 'cdlSky', 'cdlInit'];
const { realm } = await import(REPO + '/tools/gen/candela/typed/host.mjs');
const appDir = REPO + '/apps/typed/candela-gallery';
const app = JSON.parse(readFileSync(appDir + '/app.json'));
const source = app.sources.map(s => readFileSync(resolve(appDir, s), 'utf8')).join('\n');
const program = realm().typedRv32.compile(source, [], 1 << 22, { policy });
const image = program.image, view = new DataView(image.buffer, image.byteOffset, image.byteLength);
const starts = Object.entries(program.entries).sort((a, b) => a[1] - b[1]);
const at = new Map(starts.map(([n, s]) => [s, n]));
const fns = new Map();
starts.forEach(([name, start], i) => {
  const end = i + 1 < starts.length ? starts[i + 1][1] : image.length;
  const w = k => view.getUint32(start + 4 * k, true);
  let frame = 0;
  const w0 = w(0);
  if ((w0 & 0xfffff) === 0x10113) frame = -(w0 >> 20);                                  // addi sp, sp, -N
  else if ((w0 & 0xfff) === 0xf37) {                                                    // lui t5, hi; addi t5, t5, lo
    const hi = w0 & 0xfffff000, lo = w(1) >> 20;
    frame = (hi + lo) | 0;
  }
  const calls = new Set();
  for (let a = start; a < end; a += 4) {
    const x = view.getUint32(a, true);
    if ((x & 0xfff) !== 0x0ef) continue;                                                // jal ra, offset
    const imm = ((x >> 31) << 20) | (((x >>> 12) & 0xff) << 12) | (((x >>> 20) & 1) << 11) | (((x >>> 21) & 0x3ff) << 1);
    const t = at.get(a + imm);
    if (t) calls.add(t);
  }
  fns.set(name, { frame, calls: [...calls] });
});
const memo = new Map();
function depth(name) {
  if (memo.has(name)) return memo.get(name);
  const f = fns.get(name);
  let best = { bytes: 0, path: [] };
  for (const c of f.calls) { const d = depth(c); if (d.bytes > best.bytes) best = d; }
  const r = { bytes: f.frame + best.bytes, path: [`${name}(${f.frame})`, ...best.path] };
  memo.set(name, r);
  return r;
}
for (const e of entries) { const d = depth(e); console.log(JSON.stringify({ entry: e, policy, bytes: d.bytes, path: d.path.join(' > ') })); }
const big = [...fns].sort((a, b) => b[1].frame - a[1].frame).slice(0, 8).map(([n, f]) => `${n} ${f.frame}`);
console.log('largest frames: ' + big.join(', '));

// 09-order-test.mjs: calls with side effects run once each, in WGSL's left-to-right order (design Section 4.6).
//   node 09-order-test.mjs WORK_DIR
// Each case is a customKernel body. The translator turns it into bytecode (with every kernel function allowed, since
// rnd and rnd2 are outside the default section API), and vm/test-order.c runs it against a stub kernel in which every
// side effect changes one counter (rnd adds 1 and returns the counter, rnd2 adds 1, occluded 10, traceScene 100). The
// expected values follow from WGSL's rules by hand. Further cases must fail with a named construct.
// Prints one line per case and exits nonzero on any failure.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateSections } from './translator/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const work = process.argv[2];
if (!work) { console.error('usage: node 09-order-test.mjs WORK_DIR'); process.exit(2); }
mkdirSync(work, { recursive: true });
const FIELD = 'fn sdUser(k: i32, p: vec3f) -> f32 { return 1e9; }\nfn heightAt(k: i32, xz: vec2f) -> f32 { return 0.0; }\n' +
  'fn densityOf(m: i32, P: vec3f) -> f32 { return 0.0; }\nfn dens_9(P: vec3f) -> f32 { return rnd() + P.x; }\n';
const mat = body => 'fn evalMaterial(h: Hit, wo: vec3f, u: f32) -> Lobe { return lobeNone(); }\n' +
  `fn customKernel(ro: vec3f, rd: vec3f) -> vec3f {\n${body}\n}\n`;

const RUN = [
  ['constructor arguments', 'return vec3f(rnd(), rnd() * 2.0, rnd() + 1.0);', [1, 4, 4, 3]],
  ['binary operands', 'let a: f32 = rnd() - rnd();\nreturn vec3f(a, rnd(), 0.0);', [-1, 3, 0, 3]],
  ['built-in arguments and select', 'return vec3f(max(rnd(), rnd() * 0.0), pow(rnd(), 2.0), select(rnd(), rnd(), true));', [1, 9, 5, 5]],
  ['rnd2 then rnd', 'let v: vec2f = rnd2();\nreturn vec3f(v.x, v.y, rnd());', [1, 1.5, 2, 2]],
  ['an unused occluded still runs', 'let o: bool = occluded(ro, rd, 1.0);\nreturn vec3f(rnd(), 0.0, 0.0);', [11, 0, 0, 11]],
  ['an unused traceScene still runs', 'let t: Hit = traceScene(ro, rd, 5.0);\nreturn vec3f(rnd(), 0.0, 0.0);', [101, 0, 0, 101]],
  ['two equal traceScene calls are not merged', 'let a: Hit = traceScene(ro, rd, 5.0);\nlet b: Hit = traceScene(ro, rd, 5.0);\nreturn vec3f(a.t, b.t, 0.0);', [100, 200, 0, 200]],
  ['occluded between equal traces', 'let a: Hit = traceScene(ro, rd, 5.0);\nlet o: bool = occluded(ro, rd, 1.0);\nlet b: Hit = traceScene(ro, rd, 5.0);\nreturn vec3f(a.t, select(0.0, 1.0, o), b.t);', [100, 0, 210, 210]],
  ['nested calls', 'return vec3f(hitAlbedo(traceScene(ro, rd, 5.0), rd).x, rnd(), 0.0);', [100, 101, 0, 101]],
  ['a call inside an untaken branch does not run', 'var x: f32 = 0.0;\nif (rnd() > 5.0) { x = rnd(); }\nreturn vec3f(x, rnd(), 0.0);', [0, 2, 0, 2]],
  ['generated functions with effects are not merged', 'return vec3f(dens_9(ro) + 10.0 * dens_9(ro), 0.0, 0.0);', [21, 0, 0, 2]],
  ['&& with a side effect on the left only', 'if (rnd() > 0.5 && ro.x < 1.0) { return vec3f(rnd()); }\nreturn vec3f(0.0);', [2, 2, 2, 2]],
];
const FAIL = [
  ['&& with a side effect on the right', 'if (ro.x < 1.0 && rnd() > 0.5) { return vec3f(1.0); }\nreturn vec3f(0.0);', 'all', 'short-circuit:side-effect'],
  ['|| through a generated function', 'if (ro.x < 1.0 || dens_9(ro) > 0.5) { return vec3f(1.0); }\nreturn vec3f(0.0);', 'all', 'short-circuit:side-effect'],
  ['rnd with the default section API', 'return vec3f(rnd(), 0.0, 0.0);', undefined, 'call:rnd-not-in-kernel-api'],
];

const exe = join(work, 'test-order');
execFileSync('gcc', ['-std=c99', '-O1', '-Wall', '-Wno-unused-const-variable', join(HERE, 'vm', 'test-order.c'), join(HERE, 'vm', 'cdl_vm.c'), '-lm', '-o', exe]);
let failures = 0;
const blobs = [];
RUN.forEach(([name, body, expect], i) => {
  const r = translateSections(FIELD, mat(body), { kernelApi: 'all' });
  if (!r.ok) { console.log(`FAIL ${name}: ${r.diagnostics.map(d => d.message).join('; ')}`); failures++; return; }
  const f = join(work, `case${i}.cdvm`);
  writeFileSync(f, r.bytes);
  blobs.push([f, name, expect]);
});
const out = execFileSync(exe, blobs.map(b => b[0]), { encoding: 'utf8' }).trim().split('\n');
blobs.forEach(([f, name, expect], i) => {
  const got = out[i].split(' ').slice(1).map(Number);
  const ok = got.length === 4 && got.every((v, k) => v === expect[k]);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got (${got.slice(0, 3).join(', ')}) with counter ${got[3]}, expected (${expect.slice(0, 3).join(', ')}) with ${expect[3]}`);
});
for (const [name, body, api, construct] of FAIL) {
  const r = translateSections(FIELD, mat(body), api ? { kernelApi: api } : {});
  const d = r.diagnostics && r.diagnostics[0];
  const ok = !r.ok && d && d.construct === construct;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${r.ok ? 'translated' : `${d.code} ${d.construct}: ${d.message}`}`);
}
console.log(failures ? `${failures} failure(s)` : `all ${RUN.length + FAIL.length} cases pass`);
process.exit(failures ? 1 : 0);

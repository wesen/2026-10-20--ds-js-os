// 02-node-reference.mjs: the Node reference for the Candela world's device results.
//
// usage: node 02-node-reference.mjs --candela DIR --world DIR --out OUT.json
//        node 02-node-reference.mjs --archive ROOT --world DIR --tiers TIERS.json --out OUT.json
//   --candela  picocalc-os/third_party/candela (src/ and presets/, with PIN.json)
//   --world    picocalc-os/worlds/candela-world (frame.js, subset.js, program.js; world-only modules are not loaded)
//   --archive  the extracted archive's candela/ directory (instead of --candela): check subset.js's tier of the
//              presets against PICOCALC-CANDELA-P4's tiers, and frame.js's uniforms against Candela's own Viewport
//
// For every vendored preset (and the world's extra scenes in <world>/scenes), Candela as shipped (Node computes the
// GGX table itself) builds the scene; the record holds the SHA-256 of the WGSL (UTF-8), of each array of
// pack({time:0}) and pack({time:2.5}), of U after frame.js at 160 x 160, of the fixed and generated parts
// (program.js), the diagnostics and the subset verdict. The device must reproduce the digests.
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1]]]) : a), []));
const candela = resolvePath(args.archive || args.candela), world = resolvePath(args.world);
register(pathToFileURL(new URL('./lib/resolve-hooks.mjs', import.meta.url).pathname).href, import.meta.url, { data: { candela, world } });

const C = await import(pathToFileURL(join(candela, 'src/candela.js')).href);
const { frameUniforms, postOptions } = await import('world:frame.js');
const { subsetCheck, features } = await import('world:subset.js');
const { splitProgram, fixedText } = await import('world:program.js');

const sha = (x) => createHash('sha256').update(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.buffer, x.byteOffset, x.byteLength)).digest('hex');
const ARRAYS = ['U', 'O', 'LI', 'BV', 'SDs', 'SDd'];
const packDigest = (pk) => Object.fromEntries(ARRAYS.map(k => [k, { n: pk[k].length, sha256: sha(pk[k]) }]).concat([['dynBase', pk.dynBase]]));

if (!args.archive) {
const pin = JSON.parse(readFileSync(join(candela, 'PIN.json'), 'utf8'));
const scenes = Object.entries(pin.presets).map(([id, p]) => ({ id, files: { 'scene.js': readFileSync(join(candela, 'presets', p.file), 'utf8') } }));
const extra = join(world, 'scenes');
if (existsSync(extra)) for (const f of readdirSync(extra).filter(f => f.endsWith('.js')).sort()) scenes.push({ id: f.replace(/\.js$/, ''), files: { 'scene.js': readFileSync(join(extra, f), 'utf8') } });

const fixed = fixedText();
const out = { node: process.version, candela: { archiveSha256: pin.archiveSha256, kernel: pin.modules['kernel.js'] }, fixedKernelSha256: sha(fixed), fixedKernelBytes: Buffer.byteLength(fixed), scenes: {} };
for (const s of scenes) {
  C.paramStore.reset();
  const r = await C.build(s.files);
  const rec = { ok: r.ok, diags: r.diags.map(d => ({ code: d.code, severity: d.severity, loc: d.loc ? `${d.loc.file}:${d.loc.line}` : null })) };
  if (r.ok) {
    const c = r.compiled;
    rec.wgsl = { bytes: Buffer.byteLength(c.shared), lines: c.stats.lines, sha256: sha(c.shared) };
    const p0 = c.pack({ time: 0 });
    rec.pack0 = packDigest(p0);
    rec.packT = packDigest(c.pack({ time: 2.5 }));
    const U = Float32Array.from(p0.U);
    const cam = frameUniforms(c, U, { width: 160, height: 160, time: 0 });
    rec.frameU160 = sha(U);
    rec.post = postOptions(c, cam);
    const parts = splitProgram(c.shared);
    rec.sections = { fieldBytes: Buffer.byteLength(parts.fieldCode), matBytes: Buffer.byteLength(parts.matCode), sha256: sha(parts.fieldCode + parts.matCode), spectral: parts.spectral };
    rec.subset = subsetCheck(c).map(d => `${d.code} ${d.feature} @${d.loc ? d.loc.file + ':' + d.loc.line : '-'}`);
    rec.params = C.paramStore.order.map(id => { const h = C.paramStore.defs.get(id); return { id, kind: h.kind, static: h.isStatic, value: h.value }; });
    rec.animated = !!c.animation; rec.behaviors = c.behaviors.length;
  } else rec.error = String(r.error && r.error.message);
  out.scenes[s.id] = rec;
  console.log(`${r.ok ? 'ok ' : 'ERR'} ${s.id.padEnd(6)} ${rec.wgsl ? rec.wgsl.sha256.slice(0, 12) : ''} ${rec.subset ? (rec.subset.length ? rec.subset.join('; ') : 'T0') : rec.error}`);
}

writeFileSync(args.out, JSON.stringify(out, null, 1) + '\n');
}
// --archive: subset.js against the census's tiers for all 105 presets, and frame.js against Viewport.frame()
if (args.archive) {
  const root = candela, tiers = JSON.parse(readFileSync(args.tiers, 'utf8'));
  const want = Object.fromEntries(tiers.rows.map(r => [r.id, r.tier]));
  const dir = join(root, 'content/presets'), rows = [];
  const A = C, out = {};
  const { Viewport } = await import(pathToFileURL(join(root, 'src/viewport.js')).href);
  let frameAgree = 0, frameTried = 0;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const id = (readFileSync(join(dir, f), 'utf8').match(/^id:\s*(\S+)\s*$/m) || [])[1];
    const base = f.replace(/\.md$/, ''), files = { 'scene.js': readFileSync(join(dir, base + '.js'), 'utf8') };
    const lib = join(dir, base); if (existsSync(lib)) for (const g of readdirSync(lib)) files['lib/' + g] = readFileSync(join(lib, g), 'utf8');
    if (id === 'M-12' || id === 'X-02' || id.startsWith('K-')) { rows.push({ id, skipped: true, want: want[id] }); continue; }   // seconds to minutes each; tiers by feature below are unaffected
    A.paramStore.reset();
    const r = await A.build(files);
    if (!r.ok) { rows.push({ id, error: String(r.error && r.error.message) }); continue; }
    const got = features(r.compiled).reduce((t, x) => Math.max(t, x.tier), 0);
    rows.push({ id, got, want: want[id], agree: got === want[id] });
    // Candela's viewport with a backend that only records the uniforms it is given
    const vp = new Viewport(null); let seen = null;
    vp.backend = { compile: async () => {}, upload: () => {}, setUniforms: (U) => { seen = Float32Array.from(U); }, trace: () => {}, resize(w, h) { this.w = w; this.h = h; }, w: 160, h: 160, busy: () => false };
    vp.fixedSize = [160, 160]; vp.show = () => {}; vp.meter = () => {};
    await vp.load(r.compiled, { time: 0 });
    vp.frame({ time: 0, display: false });
    const U = Float32Array.from(r.compiled.pack({ time: 0 }).U);
    frameUniforms(r.compiled, U, { width: 160, height: 160, time: 0 });
    frameTried++; if (seen && sha(seen) === sha(U)) frameAgree++;
    else rows[rows.length - 1].frameDiff = seen ? [...U].map((v, i) => v === seen[i] ? null : [i, v, seen[i]]).filter(Boolean).slice(0, 8) : 'no uniforms';
  }
  out.archiveCheck = { tiersAgree: rows.filter(r => r.agree).length, tiersChecked: rows.filter(r => 'agree' in r).length, frameAgree, frameTried, disagreements: rows.filter(r => r.agree === false || r.error || r.frameDiff) };
  console.log(`subset.js tiers agree with 02-tiers.json for ${out.archiveCheck.tiersAgree}/${out.archiveCheck.tiersChecked}; frame.js equals Viewport.frame() for ${frameAgree}/${frameTried}`);
  writeFileSync(args.out, JSON.stringify(out, null, 1) + '\n');
}

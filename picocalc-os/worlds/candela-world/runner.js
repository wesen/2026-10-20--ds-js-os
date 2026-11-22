// world:runner.js — Candela's front end in a PicoCalc world: run a scene file, compile it, pack its buffers,
// check it against the subset, and hand program and buffers to the firmware renderer. Then keep it running:
// parameter changes and animation time re-pack; static parameters rebuild.
//
// Every phase reports one record through host.report(): a "CW {json}" line on the console, which the device
// measurement script reads. Timings are the real clock (host.now(), milliseconds); steps are QuickJS's
// interrupt-counter steps (deterministic); heap is what the world's allocator is charged; stack is the C stack
// high-water mark below the world's QuickJS stack top. Digests are SHA-256, computed in C.
import { host } from 'world:shims.js';          // first: installs atob, performance, console and Function
import { candela, build, compile, paramStore } from 'candela:candela.js';
import { subsetCheck, features } from 'world:subset.js';
import { frameUniforms, postOptions } from 'world:frame.js';
import { splitProgram, fixedText } from 'world:program.js';

export { host };
export const ARRAYS = ['U', 'O', 'LI', 'BV', 'SDs', 'SDd'];
export const SIZE = { width: 160, height: 160 };
const pin = JSON.parse(host.text('pin'));
const r2 = (x) => Math.round(x * 1000) / 1000;
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

// ---- scene files ------------------------------------------------------------------------------------------
// The T0 presets (third_party/candela/presets, by id through PIN.json) and the world's own scenes (scenes/).
export function sceneIds() { return Object.keys(pin.presets).concat(host.list('scene:').map(n => n.slice(6).replace(/\.js$/, ''))); }
export function sceneFiles(id) {
  const p = pin.presets[id];
  const text = p ? host.text('preset:' + p.file) : host.text('scene:' + id + '.js');
  if (text == null) throw new Error(`no scene called ${id} (scenes: ${sceneIds().join(' ')})`);
  return { 'scene.js': text };
}

const diagText = (d) => ({ severity: d.severity, code: d.code, message: String(d.message).slice(0, 160), loc: d.loc ? `${d.loc.file}:${d.loc.line}` : null });
const heap = () => { const m = host.mem(); return { used: m.used, peak: m.peak, limit: m.limit }; };
const digests = (pk) => Object.fromEntries(ARRAYS.map(k => [k, { n: pk[k].length, sha256: host.sha256(pk[k]) }]).concat([['dynBase', pk.dynBase]]));

let fixedDigest = null;   // the fixed kernel's text never changes: hash it once
export function fixedKernel() { if (!fixedDigest) { const t = fixedText(); fixedDigest = { sha256: host.sha256(t), bytes: t.length }; } return fixedDigest; }

// ---- the current scene ---------------------------------------------------------------------------------------
export let cur = null;   // { id, files, result, compiled, packed, U, time, gen }

function renderBuffers(pk, U) { return { U, O: pk.O, LI: pk.LI, BV: pk.BV, SDs: pk.SDs, SDd: pk.SDd, dynBase: pk.dynBase }; }

// Build a scene: Candela's build() (run the files, compile), the subset check, the first pack, the frame
// uniforms, then the renderer. o.render: start the renderer (default true); o.measure: also time later packs
// and a second, separate compile; o.keepParams: keep slider values (a static parameter's rebuild).
export async function buildScene(id, files, o = {}) {
  host.longSegment();                    // a build may outlast a 50 ms turn; the manifest's long_ms bounds it
  if (!o.keepParams) paramStore.reset();
  host.gc();
  const before = heap(); host.resetPeak(); host.stackPaint();
  const t0 = host.now(), s0 = host.steps();
  const r = await build(files, { main: 'scene.js' });
  const buildMs = host.now() - t0, buildSteps = host.steps() - s0, buildStack = host.stackUsed(), buildPeak = host.mem().peak;
  const rec = { ev: 'build', id, ok: r.ok, buildMs: r2(buildMs), candelaMs: r2(r.ms), steps: buildSteps, stackBytes: buildStack,
                heap: { before: before.used, peak: buildPeak, peakDelta: buildPeak - before.used, limit: before.limit }, diags: r.diags.map(diagText) };
  if (!r.ok) { rec.error = String(r.error && r.error.message).slice(0, 200); return rec; }
  const c = r.compiled;
  // the subset: refuse what this firmware cannot render, in Candela's own diagnostic format
  let t = host.now();
  const refused = subsetCheck(c);
  rec.subsetMs = r2(host.now() - t);
  rec.tier = features(c).reduce((m, f) => Math.max(m, f.tier), 0);
  if (refused.length) { rec.ok = false; rec.refused = refused.map(diagText); }
  // the first pack, then digests (untimed)
  host.resetPeak(); host.stackPaint();
  t = host.now(); let s = host.steps();
  const p0 = c.pack({ time: 0 });
  rec.pack0Ms = r2(host.now() - t); rec.pack0Steps = host.steps() - s; rec.packStackBytes = host.stackUsed();
  rec.wgsl = { bytes: host.utf8Length(c.shared), lines: c.stats.lines, sha256: host.sha256(c.shared) };
  rec.pack0 = digests(p0);
  if (o.measure) {
    const ms = [];
    for (let i = 0; i < 3; i++) { t = host.now(); const pk = c.pack({ time: 2.5 }); ms.push(host.now() - t); if (!i) rec.packT = digests(pk); }
    rec.packTMs = r2(median(ms));
  }
  // the frame uniforms at 160 x 160 and the split at the renderer's seam
  const U = Float32Array.from(p0.U);
  t = host.now();
  const cam = frameUniforms(c, U, { width: SIZE.width, height: SIZE.height, time: 0 });
  rec.frameMs = r2(host.now() - t);
  rec.frameU160 = host.sha256(U);
  t = host.now();
  const parts = splitProgram(c.shared);
  rec.splitMs = r2(host.now() - t);
  rec.sections = { fieldBytes: parts.fieldCode.length, matBytes: parts.matCode.length, sha256: host.sha256(parts.fieldCode + parts.matCode) };
  rec.fixedKernel = fixedKernel().sha256;
  if (o.measure) {
    // Candela's compile() alone, on the scene the build produced (build() above ran the files and compiled once)
    t = host.now(); s = host.steps();
    compile(r.scene, r.engine || candela.engine.realtime(), { defaultCamera: null });
    rec.compileMs = r2(host.now() - t); rec.compileSteps = host.steps() - s;
  }
  rec.heap.after = host.mem().used;
  cur = { id, files, result: r, compiled: c, packed: p0, U, time: 0, cam, parts, gen: 0, packMs: rec.pack0Ms };
  if (rec.ok && o.render !== false) {
    t = host.now();
    const program = { sceneId: id, wgsl: c.shared, fieldCode: parts.fieldCode, matCode: parts.matCode, spectral: parts.spectral,
                      fixedKernel: rec.fixedKernel, sections: null, integrator: (c.engine.integrator || {}).__integrator || 'path' };
    const started = host.render.start(program, renderBuffers(p0, U), { width: SIZE.width, height: SIZE.height, post: postOptions(c, cam) });
    cur.gen = started.gen;
    rec.render = { startMs: r2(host.now() - t), gen: started.gen, bytes: started.bytes };
  }
  return rec;
}

// A slider moved. A dynamic parameter is a uniform: re-pack and send the buffers (Candela's host.js onParam:
// vp.repack). A static one is a specialisation constant: rebuild, keeping the slider values.
export async function setParam(id, value) {
  if (!cur) throw new Error('no scene is built');
  const h = paramStore.defs.get(id);
  if (!h) throw new Error(`no parameter ${id} (parameters: ${paramStore.order.join(' ') || 'none'})`);
  const t0 = host.now(), s0 = host.steps();
  h.set(value);
  if (h.isStatic) {
    const rec = await buildScene(cur.id, cur.files, { keepParams: true });
    return Object.assign(rec, { ev: 'param', param: id, static: true, value, totalMs: r2(host.now() - t0) });
  }
  return Object.assign(repack(cur.time), { ev: 'param', param: id, static: false, value, totalMs: r2(host.now() - t0), totalSteps: host.steps() - s0 });
}

// Pack at a time (animation, a parameter) and hand the new buffers to the renderer. A re-pack is an ordinary
// turn (the manifest's budget_ms, 50 ms) unless the scene's last pack took more than half of that: then it asks
// for a long segment first. On the P4, B-01 packs in 6-7 ms; M-03 and M-09 in about 40 ms, L-05 in 270-380 ms.
export const PACK_LONG_MS = 25;
export function repack(time) {
  const c = cur.compiled;
  const long = cur.packMs > PACK_LONG_MS;
  if (long) host.longSegment();
  const t0 = host.now();
  let poses = null;
  if (c.animation) { try { poses = c.animation(time); } catch (e) { poses = null; } }
  const pk = c.pack({ time, poses });
  const packMs = host.now() - t0;
  const U = pk.U;
  frameUniforms(c, U, { width: SIZE.width, height: SIZE.height, time });
  const t1 = host.now();
  const upd = host.render.update(renderBuffers(pk, U), { reset: true });
  const updateMs = host.now() - t1;
  cur.packed = pk; cur.U = U; cur.time = time; cur.gen = upd.gen; cur.packMs = packMs;
  return { id: cur.id, time, long, packMs: r2(packMs), updateMs: r2(updateMs), repackMs: r2(host.now() - t0), gen: upd.gen,
           pack: digests(pk), segmentMs: r2(host.segmentMs()) };
}

export function params() { return paramStore.order.map(id => { const h = paramStore.defs.get(id); return { id, kind: h.kind, static: h.isStatic, value: h.value, min: h.min, max: h.max }; }); }

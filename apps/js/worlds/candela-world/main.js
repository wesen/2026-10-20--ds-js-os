// The Candela world: Candela scene programs on the PicoCalc (PICOCALC-CANDELA-WORLD).
//
// Candela's front end (candela.js and the 14 modules it imports) is QuickJS bytecode in the firmware
// (candela/front.qbc, written by tools/gen/candela/candela-bc when the firmware is built). This script loads it on the
// first message, through the module loader of nucleus/candela_world.c, and then runs scene files as Candela's
// workbench host does: build, pack, parameters and time, with the program and buffers handed to the renderer.
//
// Messages (from other worlds, or from the console: send candela TYPE JSON):
//   load                         import Candela (once); reports module load time, heap and steps
//   build {id, measure, render}  build a scene by id (T0 presets and scenes/*.js) and start rendering it
//   build {id, files}            build the files given ({"scene.js": text, "lib/x.js": text}) under the name id
//   file {path}                  build a scene file from storage (fs:/candela/PATH)
//   suite {ids, measure}         build each scene in turn, one per turn (default: every scene)
//   rebuilds {id, n}             build one scene n times: heap after each, for growth across edits
//   param {id, value}            move a slider: dynamic parameters re-pack, static ones rebuild
//   time {t}                     re-pack at a time (animation)
//   params | scenes | status     what there is (an ask answers with it)
//   stop                         stop the renderer
//   candela.frame                the renderer finished a pass (from the kernel)
"use strict";
const H = globalThis.__candela;   // world:shims.js takes it off the global object when it loads
let R = null;

const report = (rec) => { H.report(rec); return rec; };
const fail = (s, what, e) => { s.error = `${what}: ${errText(e)}`; s.phase = 'error'; return report({ ev: 'error', what, error: errText(e), stack: String(e && e.stack || '').split('\n').slice(0, 6).join('\n') }); };

async function load(s) {
  if (R) return R;
  H.longSegment();
  H.gc();
  const before = H.mem(); H.resetPeak();
  const t0 = H.now(), s0 = H.steps(), l0 = H.loaderStats();
  s.phase = 'loading';
  R = await import('world:runner.js');
  const ms = H.now() - t0, steps = H.steps() - s0, l1 = H.loaderStats();
  const peak = H.mem().peak;
  H.gc();
  s.phase = 'ready';
  report({ ev: 'load', ms: Math.round(ms * 1000) / 1000, steps, modules: l1.modules - l0.modules, bytecodeBytes: l1.bytes - l0.bytes,
           readMs: Math.round((l1.readUs - l0.readUs) / 1000 * 1000) / 1000, heap: { before: before.used, after: H.mem().used, peak, limit: before.limit },
           fixedKernel: R.fixedKernel() });
  return R;
}

function remember(s, rec) {
  s.last = { id: rec.id, ok: rec.ok, buildMs: rec.buildMs, pack0Ms: rec.pack0Ms, tier: rec.tier, diags: (rec.refused || rec.diags || []).length };
  s.scene = rec.id; s.phase = rec.ok ? 'rendering' : 'refused'; s.frames = 0;
  if (rec.refused) s.error = `${rec.refused[0].code} ${rec.refused[0].message}`;
  else if (!rec.ok) s.error = rec.error || 'build failed'; else s.error = null;
}

async function buildOne(s, id, o = {}, files = null) {
  const r = await load(s);
  const rec = await r.buildScene(id, files || r.sceneFiles(id), o);
  remember(s, rec);
  return report(rec);
}

app("candela")
  .title("Candela")
  .about("Candela scene programs, built and packed on the handheld")
  .state({ phase: "idle", scene: null, last: null, frames: 0, error: null, queue: [], suite: null })
  .on("load", async (s) => { try { await load(s); return { ok: true }; } catch (e) { return fail(s, 'load', e); } })
  .on("build", async (s, m) => { try { return await buildOne(s, m.id, { measure: !!m.measure, render: m.render !== false }, m.files || null); } catch (e) { return fail(s, 'build ' + m.id, e); } })
  .on("file", async (s, m) => {
    try {
      const r = await load(s);
      const dir = hw.fs("fs:/candela");
      const text = await dir.read(m.path);
      const rec = await r.buildScene(m.path, { 'scene.js': String(text) }, { measure: !!m.measure });
      remember(s, rec);
      return report(rec);
    } catch (e) { return fail(s, 'file ' + m.path, e); }
  })
  .on("suite", async (s, m) => {
    try {
      const r = await load(s);
      s.queue = (m && m.ids) || r.sceneIds();
      s.suite = { measure: !!(m && m.measure), started: H.now(), n: s.queue.length, ok: 0 };
      report({ ev: 'suite-begin', ids: s.queue });
      send(self, "next", null);
    } catch (e) { return fail(s, 'suite', e); }
  })
  .on("next", async (s) => {
    const id = s.queue.shift();
    if (id === undefined) { report({ ev: 'suite-end', n: s.suite.n, ok: s.suite.ok, ms: Math.round(H.now() - s.suite.started) }); return; }
    try { const rec = await buildOne(s, id, { measure: s.suite.measure, render: false }); if (rec.ok) s.suite.ok++; }
    catch (e) { fail(s, 'build ' + id, e); }
    send(self, "next", null);   // the next scene gets a turn (and a long segment) of its own
  })
  .on("rebuilds", async (s, m) => {
    try {
      const r = await load(s);
      s.queue = Array.from({ length: m.n || 10 }, () => m.id);
      s.suite = { measure: false, started: H.now(), n: s.queue.length, ok: 0 };
      report({ ev: 'suite-begin', ids: s.queue, rebuilds: true });
      send(self, "next", null);
    } catch (e) { return fail(s, 'rebuilds', e); }
  })
  .on("param", async (s, m) => { try { const r = await load(s); return report(await r.setParam(m.id, m.value)); } catch (e) { return fail(s, 'param ' + m.id, e); } })
  .on("time", async (s, m) => { try { const r = await load(s); return report(Object.assign({ ev: 'time' }, r.repack(+m.t || 0))); } catch (e) { return fail(s, 'time', e); } })
  .on("params", async (s) => { const r = await load(s); return report({ ev: 'params', id: s.scene, params: r.params() }); })
  .on("scenes", async (s) => { const r = await load(s); return report({ ev: 'scenes', ids: r.sceneIds() }); })
  .on("stop", (s) => { H.render.stop(); s.phase = R ? 'ready' : 'idle'; return report({ ev: 'stop' }); })
  .on("status", (s) => report({ ev: 'status', phase: s.phase, scene: s.scene, frames: s.frames, render: H.render.status(), heap: H.mem(), error: s.error }))
  .on("candela.frame", (s, f) => { s.frames++; if (f && (f.pass === 1 || f.pass % 16 === 0)) report(Object.assign({ ev: 'frame' }, f)); })
  .screen((s) => ui.col({ gap: 6 },
    ui.title("Candela"),
    ui.kv([["state", s.phase], ["scene", s.scene || "—"], ["passes", String(s.frames)],
           ["build", s.last ? `${s.last.buildMs} ms` : "—"], ["pack", s.last ? `${s.last.pack0Ms} ms` : "—"]]),
    s.error ? ui.text(s.error, { font: "s", color: "warn" }) : null,
    ui.text("console: send candela build {\"id\":\"B-01\"}", { font: "s", color: "dim" })))
  .hints("console-driven");

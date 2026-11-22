// driver.mjs: measure Candela's front end (module load, build, pack) in one JavaScript runtime.
// It runs under candela-qjs (QuickJS, `host` global from candela-qjs.c) and under Node (a small `host` stand-in
// below), so the two engines run the same protocol and their outputs can be compared byte for byte.
//
// usage: candela-qjs driver.mjs CANDELA_ROOT MODE [ARGS...]      node driver.mjs CANDELA_ROOT MODE [ARGS...]
//   load                 import src/candela.js only
//   ggx [REPS]           import, then time kernel.js's ggxAlbedoTable() and ggxTableWGSL() REPS times (default 3)
//   build ID [RUNS]      import, then build preset ID RUNS times (default 4) in this runtime; the first build is
//                        cold (fresh runtime), later ones warm. Each build is followed by pack({time:0}),
//                        pack({time:2.5}) and three more pack({time:2.5}) (skipped when one pack takes >= 500 ms).
//   all [IDS...]         import, then build every preset (or the IDS given) once, in this runtime
//   dump ID OUT.json     import, build ID, write pack({time:0}) and pack({time:2.5}) as plain arrays to OUT.json
// Every record is one line on stdout starting with "@@" followed by JSON. Nothing in Candela is modified.
const isNode = typeof host === 'undefined';
const H = isNode ? await nodeHost() : host;
const [root, mode, ...rest] = H.args;
if (!root || !mode) throw new Error('usage: driver.mjs CANDELA_ROOT load|ggx|build|all [ARGS...]');
const emit = o => console.log('@@' + JSON.stringify(o));
const engine = isNode ? { name: 'node', version: process.version, pointerBytes: 8 } : { name: 'quickjs', version: H.runtime.version, pointerBytes: H.runtime.pointerBytes, jsValueBytes: H.runtime.jsValueBytes, runtimeBytes: H.runtime.runtimeBytes, runtimeBytesAcct: H.runtime.runtimeBytesAcct, stackKB: H.runtime.stackKB, limitKB: H.runtime.limitKB };

async function nodeHost() {
  const fs = await import('node:fs');
  const mem = () => { const m = process.memoryUsage(); return { cur: m.heapUsed + m.external + m.arrayBuffers, peak: NaN, curAcct: NaN, peakAcct: NaN, maxRssKB: process.resourceUsage().maxRSS }; };
  return {
    args: process.argv.slice(2), now: () => performance.now(), cpu: () => process.cpuUsage().user / 1000, steps: () => NaN,
    stackPaint: () => {}, stackUsed: () => NaN,
    readFile: p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } },
    writeFile: (p, s) => { fs.writeFileSync(p, s); return true; },
    listDir: p => { try { return fs.readdirSync(p); } catch (e) { return null; } },
    isDir: p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } },
    mem, resetPeak: () => {}, gc: () => { if (globalThis.gc) globalThis.gc(); }, memUsage: () => null, loader: () => null,
  };
}

// ---------- helpers ----------
const fnvStr = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const fnvF32 = a => { const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
function utf8Len(s) { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x80) n++; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; } else n += 3; } return n; }
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r2 = x => x == null || Number.isNaN(x) ? x : Math.round(x * 100) / 100;
const memSnap = () => { const m = H.mem(); return { cur: m.cur, peak: m.peak, curAcct: m.curAcct, peakAcct: m.peakAcct }; };
// a timed section: wall ms, CPU ms of the process, and QuickJS interrupt-counter steps (deterministic)
const meter = () => ({ w: H.now(), c: H.cpu(), s: H.steps() });
// C stack high-water mark (candela-qjs.c); runners without it report null
const stackPaint = () => { if (H.stackPaint) H.stackPaint(); };
const stackUsed = () => H.stackUsed ? H.stackUsed() : null;
const since = m0 => { const m = meter(); return { ms: r2(m.w - m0.w), cpuMs: r2(m.c - m0.c), steps: m.s - m0.s }; };

// the preset loader of the census (01-census.mjs), on H's file functions
function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/); if (!m) return {};
  const meta = {}; for (const line of m[1].split('\n')) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
  return meta;
}
function presetList() {
  const dir = root + '/content/presets';
  return H.listDir(dir).filter(f => f.endsWith('.md')).sort().map(f => ({ md: f, base: f.replace(/\.md$/, ''), id: frontmatter(H.readFile(dir + '/' + f)).id }));
}
function presetFiles(p) {
  const dir = root + '/content/presets', files = { 'scene.js': H.readFile(dir + '/' + p.base + '.js') };
  const lib = dir + '/' + p.base;
  if (H.isDir(lib)) for (const g of H.listDir(lib).sort()) files['lib/' + g] = H.readFile(lib + '/' + g);
  return files;
}

// ---------- load ----------
H.gc();
const mBefore = memSnap();
const tImport0 = meter();
const C = await import(root + '/src/candela.js');
const importT = since(tImport0), importMs = importT.ms;
const mAfterImport = memSnap();
H.gc();
const mAfterImportGc = memSnap();
const loadRec = { engine, importMs: r2(importMs), importCpuMs: importT.cpuMs, importSteps: importT.steps, loader: H.loader(), memBefore: mBefore, memAfterImport: mAfterImport, memAfterImportGc: mAfterImportGc, memUsage: H.memUsage() };
// the C stack depth at which the driver itself runs (inside module evaluation): what any build's figure includes
stackPaint(); loadRec.stackBaseline = stackUsed();
// with candela-qjs --memo-ggx, kernel.js's ggxTableWGSL() keeps its first result (an in-memory rewrite made by the
// loader; the file is unchanged). Fill the memo here, once, so that no measured build pays for the constant table.
const memo = !isNode && H.loader().memoGgx > 0;
if (memo) {
  const K = await import(root + '/src/kernel.js');
  const t = meter(); const s = K.ggxTableWGSL(); loadRec.memoPrewarm = since(t); loadRec.memoTableBytes = s.length;
  H.gc(); loadRec.memAfterPrewarm = memSnap();
}
engine.memoGgx = memo;

function errInfo(e) {
  if (!e) return null;
  return { name: e.name, code: e.code || null, message: String(e.message || e), loc: e.loc || null, stack: String(e.stack || '').split('\n').slice(0, 6).join('\n') };
}
function diagInfo(diags) {
  const by = {}; let withLoc = 0;
  for (const d of diags || []) { by[d.severity] = (by[d.severity] || 0) + 1; if (d.loc) withLoc++; }
  return { n: (diags || []).length, by, withLoc, codes: (diags || []).map(d => d.code + (d.loc ? '@' + d.loc.file + ':' + d.loc.line : '')) };
}

async function buildOnce(files, wantPack) {
  H.gc();
  const m0 = memSnap(); H.resetPeak();
  stackPaint();
  const t0 = meter();
  let r, thrown = null;
  try { r = await C.build(files); } catch (e) { thrown = e; }
  const bt = since(t0);
  const stackBytes = stackUsed();
  const m1 = memSnap();
  const rec = { ms: bt.ms, cpuMs: bt.cpuMs, steps: bt.steps, stackBytes, selfMs: r ? r2(r.ms) : null, ok: !!(r && r.ok), memStart: m0.cur, peakDelta: m1.peak - m0.cur, peakAbs: m1.peak, peakAbsAcct: m1.peakAcct, curAfter: m1.cur };
  if (thrown) { rec.thrown = errInfo(thrown); return { rec }; }
  rec.diags = diagInfo(r.diags);
  if (!r.ok) { rec.error = errInfo(r.error); return { rec }; }
  const c = r.compiled;
  rec.wgslBytes = utf8Len(c.shared); rec.wgslChars = c.shared.length; rec.wgslLines = c.stats.lines; rec.wgslHash = fnvStr(c.shared);
  rec.stats = { objects: c.stats.objects, materials: c.stats.materials, lights: c.stats.lights, params: c.stats.params, triangles: c.stats.triangles || 0, sdfs: c.stats.sdfs, sceneData: c.stats.sceneData };
  if (wantPack) {
    try {
      H.resetPeak(); const mp0 = memSnap(); stackPaint();
      const a = meter(); const pk0 = c.pack({ time: 0 }); const p0 = since(a); const packStack = stackUsed();
      const b = meter(); const pkT = c.pack({ time: 2.5 }); const pT = since(b);
      // three more packs for a steadier number, unless one pack is already slow (X-02: seconds per pack)
      const more = []; if (pT.ms < 500) for (let k = 0; k < 3; k++) { const t = meter(); c.pack({ time: 2.5 }); more.push(since(t)); }
      const mp1 = memSnap();
      const arr = {}; for (const k of ['U', 'O', 'LI', 'BV', 'SDs', 'SDd']) if (pk0[k]) arr[k] = { len: pk0[k].length, hash0: fnvF32(pk0[k]), hashT: pkT[k] ? fnvF32(pkT[k]) : null };
      rec.pack = { stackBytes: packStack, ms0: p0.ms, cpuMs0: p0.cpuMs, steps0: p0.steps, msT: pT.ms, cpuMsT: pT.cpuMs, stepsT: pT.steps, msTmedian3: r2(median(more.map(x => x.ms))), cpuMsTmedian3: r2(median(more.map(x => x.cpuMs))), peakDelta: mp1.peak - mp0.cur, arrays: arr, packedBytes: Object.values(arr).reduce((s, x) => s + 4 * x.len, 0) };
    } catch (e) { rec.packError = errInfo(e); }
  }
  // what stays alive after the build and its packs (the compiled scene, pack's caches in it, the last packed arrays)
  H.gc(); rec.retained = memSnap().cur - m0.cur;
  return { rec, r };
}

// ---------- modes ----------
if (mode === 'load') {
  emit({ mode, ...loadRec });
} else if (mode === 'ggx') {
  const K = await import(root + '/src/kernel.js');
  const reps = +(rest[0] || 3), tab = [], wgsl = [];
  let len = 0, hash = '';
  for (let i = 0; i < reps; i++) { H.gc(); H.resetPeak(); const m0 = memSnap(); const t = meter(); const T = K.ggxAlbedoTable(); tab.push({ ...since(t), peakDelta: memSnap().peak - m0.cur }); len = T.length; hash = fnvStr(T.map(v => v.toFixed(4)).join(',')); }
  for (let i = 0; i < reps; i++) { H.gc(); const t = meter(); const s = K.ggxTableWGSL(); wgsl.push({ ...since(t), bytes: s.length }); }
  // the nucleus's calibration programs (nucleus/vm.c vm_calibrate: 133 ms and 31 ms on the ESP32-P4), for scale
  const calib = {};
  for (const [k, src] of [['loop100k', '(()=>{let s=0; for(let i=0;i<100000;i++) s+=i; return s;})()'], ['fib20', '(()=>{function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()']]) {
    const runs = []; for (let i = 0; i < reps; i++) { const t = meter(); (0, eval)(src); runs.push(since(t)); }
    calib[k] = { runs, medianMs: median(runs.map(x => x.ms)), medianCpuMs: median(runs.map(x => x.cpuMs)), steps: runs[0].steps };
  }
  emit({ mode, engine, load: loadRec, table: { entries: len, hash4dp: hash, runs: tab, medianMs: median(tab.map(x => x.ms)), medianCpuMs: median(tab.map(x => x.cpuMs)), steps: tab[0].steps }, tableWGSL: { runs: wgsl, medianMs: median(wgsl.map(x => x.ms)), medianCpuMs: median(wgsl.map(x => x.cpuMs)), steps: wgsl[0].steps }, calib });
} else if (mode === 'build') {
  const id = rest[0], runs = +(rest[1] || 4);
  const p = presetList().find(x => x.id === id); if (!p) throw new Error('no preset ' + id);
  const files = presetFiles(p);
  const recs = [];
  for (let i = 0; i < runs; i++) { const { rec } = await buildOnce(files, true); rec.run = i; recs.push(rec); }
  emit({ mode, id, engine, load: loadRec, sourceBytes: Object.values(files).reduce((s, x) => s + utf8Len(x), 0), files: Object.keys(files), runs: recs });
} else if (mode === 'all') {
  const list = presetList().filter(p => !rest.length || rest.includes(p.id));
  emit({ mode: 'all-begin', engine, load: loadRec, presets: list.length });
  for (const p of list) {
    const files = presetFiles(p);
    const { rec } = await buildOnce(files, true);
    rec.id = p.id;
    emit({ mode: 'all-row', ...rec });
  }
  emit({ mode: 'all-end' });
} else if (mode === 'dump') {
  const [id, out] = rest;
  const p = presetList().find(x => x.id === id); if (!p) throw new Error('no preset ' + id);
  const r = await C.build(presetFiles(p)); if (!r.ok) throw r.error;
  const plain = pk => Object.fromEntries(['U', 'O', 'LI', 'BV', 'SDs', 'SDd'].filter(k => pk[k]).map(k => [k, Array.from(pk[k])]));
  H.writeFile(out, JSON.stringify({ engine, id, t0: plain(r.compiled.pack({ time: 0 })), t25: plain(r.compiled.pack({ time: 2.5 })) }));
  emit({ mode, id, out });
} else throw new Error('unknown mode ' + mode);

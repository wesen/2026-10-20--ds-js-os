// candela.js — the public namespace, a small module system for the scene files (import/export and require),
// and `build`: run the files, collect diagnostics, compile the scene.
import { CandelaError, collecting, userFiles, lineOffset, sources, callSite, toDiag, formatDiag, report, didYouMean } from './diag.js';
import { u, Quantity, parseQuantity } from './units.js';
import { fx, nodeOf, evalNode, E, lift } from './fx.js';
import { param, params, store as paramStore, derivedRegistry, isParam } from './params.js';
import { scene, shape, material, bsdf, ior, light, camera, medium, phase, engine, integrator, pass, post, fragment, useFragment, clearGlobalFragments, compOf, isEngine, setEvalField, makeRng, Comp } from './scene.js';
import './stdlib.js';
import { compile, directNormalLux } from './compile.js';
import * as fragments from './fragments.js';
import { test } from './test.js';
import { explain, irText, irGraph } from './ir.js';
import { mesh, isMesh } from './mesh.js';
import { hdri, assets } from './hdri.js';
import { finish } from './finish.js';
import { normPoses } from './compile.js';

setEvalField((n, env) => { const v = evalNode(n, env); return typeof v === 'number' ? v : Array.isArray(v) ? v[0] : +v; });

export const candela = {
  scene, shape, material, bsdf, ior, light, camera, medium, phase, engine, integrator, pass, post, fx, param, params, fragment, u, units: u,
  lift: param.lift, use: f => useFragment(f), config: o => Object.assign(CONFIG, o), version: '0.4',
  quantity: parseQuantity, directNormalLux, mesh, hdri, finish, assets,
};
export const CONFIG = { diagnostics: 'normal' };
const API = Object.assign({}, candela, { candela, default: candela });

// ---------- modules ----------
function transform(src) {
  const tail = [];
  const out = src.split('\n').map(line => {
    let m;
    if ((m = line.match(/^(\s*)import\s+(\w+)\s*,\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/))) return `${m[1]}const ${m[2]} = __def(__req(${JSON.stringify(m[4])})), {${names(m[3])}} = __req(${JSON.stringify(m[4])});`;
    if ((m = line.match(/^(\s*)import\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/))) return `${m[1]}const {${names(m[2])}} = __req(${JSON.stringify(m[3])});`;
    if ((m = line.match(/^(\s*)import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"]\s*;?\s*$/))) return `${m[1]}const ${m[2]} = __req(${JSON.stringify(m[3])});`;
    if ((m = line.match(/^(\s*)import\s+(\w+)\s+from\s*['"]([^'"]+)['"]\s*;?\s*$/))) return `${m[1]}const ${m[2]} = __def(__req(${JSON.stringify(m[3])}));`;
    if ((m = line.match(/^(\s*)import\s*['"]([^'"]+)['"]\s*;?\s*$/))) return `${m[1]}__req(${JSON.stringify(m[2])});`;
    if ((m = line.match(/^(\s*)export\s+default\s+/))) return line.replace(/^(\s*)export\s+default\s+/, '$1__exports.default = ');
    if ((m = line.match(/^(\s*)export\s+(const|let|var)\s+engine\s*=/))) return line.replace(/^(\s*)export\s+(const|let|var)\s+engine\s*=/, '$1__exports.engine =');
    if ((m = line.match(/^(\s*)export\s+(const|let|var)\s+(\w+)\s*=/))) return line.replace(/^(\s*)export\s+(const|let|var)\s+(\w+)\s*=/, `$1$2 $3 = __exports.$3 =`);
    if ((m = line.match(/^(\s*)export\s+(async\s+)?(function\*?|class)\s+(\w+)/))) { tail.push(`__exports.${m[4]} = ${m[4]};`); return line.replace(/^(\s*)export\s+/, '$1'); }
    if ((m = line.match(/^(\s*)export\s*{([^}]*)}\s*;?\s*$/))) return `${m[1]}Object.assign(__exports, {${m[2].split(',').map(s => s.trim()).filter(Boolean).map(s => { const k = s.split(/\s+as\s+/); return k.length === 2 ? `${k[1]}: ${k[0]}` : k[0]; }).join(', ')}});`;
    return line;
  });
  return out.join('\n') + (tail.length ? '\n' + tail.join(' ') : '');
}
const names = s => s.split(',').map(x => x.trim()).filter(Boolean).map(x => { const k = x.split(/\s+as\s+/); return k.length === 2 ? `${k[0]}: ${k[1]}` : k[0]; }).join(', ');
const SCOPE_NAMES = Object.keys(API).filter(k => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');

// measure how many lines `new Function` puts before the body, so stack lines map to file lines
(function measure() {
  try { userFiles.add('probe.js'); const f = new Function('"use strict";\nthrow new Error("probe");\n//# sourceURL=probe.js'); f(); }
  catch (e) { const m = String(e.stack).match(/probe\.js:(\d+)/); if (m) lineOffset.n = +m[1] - 2; }
})();
export async function runFiles(files, main = 'scene.js', extraScope = {}) {
  const cache = new Map(), logs = [];
  const consoleShim = { log: (...a) => logs.push(a.map(fmtLog).join(' ')), info: (...a) => logs.push(a.map(fmtLog).join(' ')), warn: (...a) => logs.push('warn: ' + a.map(fmtLog).join(' ')), error: (...a) => logs.push('error: ' + a.map(fmtLog).join(' ')) };
  const req = (from) => async (spec) => resolve(spec, from);
  const LIB = { candela: API, 'candela/fragments': fragments, 'candela/test': { test, default: test }, 'candela/units': { u, default: u } };
  const loading = new Map();
  const resolve = (spec, from) => {
    if (LIB[spec]) return LIB[spec];
    let p = spec.replace(/^\.\//, '').replace(/^\//, ''); if (!/\.js$/.test(p)) p += '.js';
    if (from && from.includes('/') && spec.startsWith('./')) p = from.slice(0, from.lastIndexOf('/') + 1) + p;
    if (files[p] == null) throw new CandelaError('E150', `cannot find module '${spec}'`, { suggest: didYouMean(p, Object.keys(files).concat(Object.keys(LIB))), hint: 'modules: candela, candela/fragments, candela/test, and the project\'s files' });
    if (cache.has(p)) return cache.get(p);
    if (loading.has(p)) throw new CandelaError('E151', `circular import of ${p}`);
    throw new CandelaError('E152', `modules other than the main file must be loaded first: ${p}`);
  };
  // load every library file (lib/*.js) before the main file, in dependency order (by trial)
  const order = Object.keys(files).filter(f => f !== main && /\.js$/.test(f)).sort();
  const evalModule = async (path) => {
    userFiles.add(path); sources.set(path, files[path]);
    const exportsObj = {};
    const body = transform(files[path]);
    let fn;
    try { fn = new Function('__req', '__exports', '__def', 'console', ...SCOPE_NAMES, ...Object.keys(extraScope), '"use strict";\nreturn (async () => {\n' + body + '\n})();\n//# sourceURL=' + path); }
    catch (e) { const m = e.message; const err = new CandelaError('E001', `${path}: syntax error: ${m}`, { loc: syntaxLoc(files[path], e, path) }); throw err; }
    loading.set(path, true);
    await fn((s) => resolve(s, path), exportsObj, x => (x && x.default !== undefined ? x.default : x), consoleShim, ...SCOPE_NAMES.map(k => API[k]), ...Object.values(extraScope));
    loading.delete(path); cache.set(path, exportsObj);
    return exportsObj;
  };
  const pending = order.slice(); let guard = 0;
  while (pending.length && guard++ < 50) {
    const p = pending.shift();
    try { await evalModule(p); } catch (e) { if (e && e.code === 'E152') { pending.push(p); continue; } throw e; }
  }
  const ex = await evalModule(main);
  return { exports: ex, logs };
}
function syntaxLoc(src, e, path) {
  // syntax errors carry no stack position: find the first line that fails to parse on its own prefix
  const lines = src.split('\n');
  for (let i = 1; i <= lines.length; i++) { try { new Function(transform(lines.slice(0, i).join('\n')) + '\n}}}}}}}}'); } catch (x) { if (!/Unexpected token '}'|Unexpected end|missing \) after|Unexpected token/.test(x.message)) return { file: path, line: i, col: 1 }; } }
  return { file: path, line: 1, col: 1 };
}
const fmtLog = x => typeof x === 'string' ? x : x && x[Symbol.for('candela.comp')] ? `[${compOf(x).kind}]` : (() => { try { return JSON.stringify(x, (k, v) => typeof v === 'number' ? +v.toFixed(5) : v); } catch (e) { return String(x); } })();

// ---------- build: files → scene → compiled ----------
export async function build(files, o = {}) {
  const t0 = performance.now();
  paramStore.beginBuild(); derivedRegistry.clear(); clearGlobalFragments();
  for (const k of [...sources.keys()]) sources.delete(k);
  let res, diags = [], logs = [], sceneB = null, engineB = null, compiled = null, error = null, animation = null;
  try {
    const r = await collectingAsync(async () => {
      const { exports, logs: lg } = await runFiles(files, o.main || 'scene.js', o.scope || {});
      logs = lg;
      sceneB = exports.default || exports.scene || null;
      engineB = exports.engine || null;
      animation = exports.animation || null;
      if (animation != null && typeof animation !== 'function') throw new CandelaError('E162', 'export const animation = t => ({ id: pose, … }): a function of time (seconds) returning poses by node id', { loc: { file: o.main || 'scene.js', line: 1 } });
      if (sceneB && typeof sceneB === 'function') sceneB = sceneB();
      if (!sceneB || !compOf(sceneB) || compOf(sceneB).kind !== 'scene') throw new CandelaError('E160', `${o.main || 'scene.js'} must export a scene: export default scene().add(…)`, { loc: { file: o.main || 'scene.js', line: 1 } });
      if (engineB && !isEngine(engineB)) throw new CandelaError('E161', 'export const engine = engine.realtime() | engine.offline() | …');
      compiled = compile(sceneB, engineB || o.engine || engine.realtime(), { defaultCamera: null });
      if (animation) {
        // poses at t = 0: catch malformed poses and ids that name no node now, not every frame
        let P0;
        try { P0 = normPoses(animation(0)); } catch (e) { throw e instanceof CandelaError ? e : new CandelaError('E163', `animation(0) threw: ${e.message}`); }
        const unknown = P0 ? [...P0.keys()].filter(k => !compiled.poseIds.has(k)) : [];
        if (unknown.length) report('warning', 'W170', `animation: no node has the id${unknown.length > 1 ? 's' : ''} ${unknown.slice(0, 6).map(k => `'${k}'`).join(', ')}${unknown.length > 6 ? ' …' : ''}`, { suggest: didYouMean(unknown[0], [...compiled.poseIds]), hint: 'poses are keyed by .id() on shapes and groups' });
        compiled.animation = animation;
      }
    });
    diags = r.diags;
  } catch (e) {
    error = e; diags = (e.diags || []).concat([toDiag(e)]);
  }
  return { ok: !error, error, diags, logs, scene: sceneB, engine: engineB, compiled, animation, ms: performance.now() - t0 };
}
import { collectingAsync } from './diag.js';

// the scope an agent's `eval` sees, without the host
export { API, transform, explain, irText, irGraph, formatDiag, test, fragments, paramStore, compile, nodeOf };

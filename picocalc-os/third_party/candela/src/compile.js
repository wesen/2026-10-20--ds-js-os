// compile.js — lowering: a scene's builders become (1) generated WGSL — materials, SDFs, densities, a custom
// integrator — and (2) packed data — objects, lights, a BVH, media, uniforms. Code changes only when structure
// changes; moving a slider or the clock only re-packs the data.
import { CandelaError, report, warn, info, fmtLoc } from './diag.js';
import { isQ, fmtNum } from './units.js';
import { node, constNode, nodeOf, isExpr, Gen, genFunction, evalNode, intervalOf, E, WT, depsOf, walkNodes, blackbodyRGB, cmf, planck, xyzToLinearSRGB, lift, fl, withTracer } from './fx.js';
import { isParam, store as pstore, derivedRegistry, paramValue } from './params.js';
import { compOf, lightIntensity, definedMaterial, attrsOf, fragInternals, engine, Comp, matches, fragmentsOf } from './scene.js';
import { PRELUDE, SPECTRAL, CORE, PATH, POST, ggxTableWGSL } from './kernel.js';
import { isConst } from './stdlib.js';
import { blasOf, matchFace } from './mesh.js';
import { envTables } from './hdri.js';
import { finishFromMetadata } from './finish.js';

const SHAPE_TYPE = { 'shape.sphere': 0, 'shape.plane': 1, 'shape.rect': 2, 'shape.disk': 3, 'shape.box': 4, 'shape.cylinder': 5, 'shape.capsule': 6, 'shape.torus': 7, 'shape.roundbox': 8, 'shape.cone': 9, 'shape.prism': 10, 'shape.sdf': 11, 'shape.heightfield': 12, 'shape.mesh': 13 };
export const U_BASE = 32;

// ---------- matrices (3×4, row-major) ----------
const I34 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function mul34(A, B) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { let s = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c]; if (c === 3) s += A[r * 4 + 3]; o[r * 4 + c] = s; }
  return o;
}
const rot = (ax, a) => { const c = Math.cos(a), s = Math.sin(a); return ax === 'x' ? [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0] : ax === 'y' ? [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0] : [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
function inv34(M) {
  const [a, b, c, tx, d, e, f, ty, g, h, i, tz] = M;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C; const k = Math.abs(det) < 1e-20 ? 0 : 1 / det;
  const r = [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, 0, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, 0, C * k, -(a * h - b * g) * k, (a * e - b * d) * k, 0];
  r[3] = -(r[0] * tx + r[1] * ty + r[2] * tz); r[7] = -(r[4] * tx + r[5] * ty + r[6] * tz); r[11] = -(r[8] * tx + r[9] * ty + r[10] * tz);
  return r;
}
const xfPoint = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];
const xfDir = (M, d) => [M[0] * d[0] + M[1] * d[1] + M[2] * d[2], M[4] * d[0] + M[5] * d[1] + M[6] * d[2], M[8] * d[0] + M[9] * d[1] + M[10] * d[2]];
const V = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };
export { V as vec3, mul34, inv34, xfPoint, xfDir };
function alignY(dir) {
  const y = V.norm(dir); const ref = Math.abs(y[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  let x = V.norm(V.cross(ref, y)); if (Math.abs(y[1]) > 0.99) x = V.norm(V.cross(y, [0, 0, 1])); const z = V.cross(x, y);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0];
}

// ---------- values that may move: numbers, quantities, params, fields of time ----------
function valueOf(v, env) {
  if (v == null) return v;
  if (typeof v === 'number') return v;
  if (isQ(v)) return v.v;
  if (isParam(v)) { const x = v.value; return isQ(x) ? x.v : x; }
  if (isExpr(v)) return evalNode(nodeOf(v), { time: env.time, param: id => paramValue(id) });
  if (v instanceof Object && v.op) return evalNode(v, { time: env.time, param: id => paramValue(id) });
  if (Array.isArray(v)) return v.map(x => valueOf(x, env));
  return +v;
}
function moves(v) {
  if (v == null || typeof v === 'number' || isQ(v)) return null;
  if (isParam(v)) return v.isStatic ? null : 'param';
  const n = isExpr(v) ? nodeOf(v) : v && v.op ? v : null;
  if (n) { const d = depsOf(n); return d.has('time') ? 'time' : d.has('param') ? 'param' : null; }
  if (Array.isArray(v)) { let r = null; for (const x of v) { const m = moves(x); if (m === 'time') return 'time'; if (m) r = m; } return r; }
  return null;
}
function isBlackSurface(b) {
  const c = b && b.props ? b : b ? compOf(b) : null; if (!c || c.kind !== 'bsdf.lambert') return false;
  const r = c.props.rho; const n = r && (r.op ? r : nodeOf(r));
  return !!(n && n.op === 'const' && (Array.isArray(n.x) ? n.x.every(v => v === 0) : n.x === 0));
}
function nodeXf(c, env) {
  const p = c.props;
  let M = I34();
  const ov = env && env.overrides && p.id ? env.overrides.get(p.id) : null;
  const at = ov && ov.pos ? ov.pos : p.at ? valueOf(p.at, env) : [0, 0, 0];
  if (p.scale) { const s = valueOf(p.scale, env); M = [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0]; }
  if (p.facing) M = mul34(alignY(V.sub(valueOf(p.facing, env), at)), M);
  for (const [ax, a] of p.rot || []) M = mul34(rot(ax, valueOf(a, env)), M);
  if (ov && ov.rot) { M = mul34(rot('x', ov.rot[0] || 0), M); M = mul34(rot('y', ov.rot[1] || 0), M); M = mul34(rot('z', ov.rot[2] || 0), M); }
  if (ov && ov.scale != null) { const k = ov.scale; M = M.map((v, i) => (i % 4 === 3 ? v : v * k)); }
  M[3] += at[0]; M[7] += at[1]; M[11] += at[2];
  return M;
}
function xfMoves(c) { const p = c.props; let m = moves(p.at) || moves(p.scale) || moves(p.facing); for (const [, a] of p.rot || []) m = m === 'time' ? m : moves(a) || m; return m; }

// ---------- local bounds per shape type ----------
function localBox(ty, pr) {
  switch (ty) {
    case 0: return [[-pr[0], -pr[0], -pr[0]], [pr[0], pr[0], pr[0]]];
    case 1: return pr[0] > 0 ? [[-pr[0] / 2, -1e-3, -pr[0] / 2], [pr[0] / 2, 1e-3, pr[0] / 2]] : null;
    case 2: return [[-pr[0], -1e-3, -pr[1]], [pr[0], 1e-3, pr[1]]];
    case 3: return [[-pr[0], -1e-3, -pr[0]], [pr[0], 1e-3, pr[0]]];
    case 4: case 8: return [[-pr[0], -pr[1], -pr[2]], [pr[0], pr[1], pr[2]]];
    case 5: return [[-pr[0], -pr[1], -pr[0]], [pr[0], pr[1], pr[0]]];
    default: return null;
  }
}
function worldBox(M, box, bound) {
  if (!box) { const b = bound; box = [[-b, -b, -b], [b, b, b]]; }
  const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
  for (let k = 0; k < 8; k++) { const p = xfPoint(M, [box[k & 1][0], box[(k >> 1) & 1][1], box[(k >> 2) & 1][2]]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } }
  return [mn, mx];
}

// ---------- BVH ----------
function buildBVH(items) {
  // items: [{box:[mn,mx], idx}] → nodes [{mn, mx, left|first, count}] and an order of items
  const nodes = [], order = [];
  if (!items.length) return { nodes, order };
  const cen = it => [0, 1, 2].map(i => (it.box[0][i] + it.box[1][i]) / 2);
  const build = (list) => {
    const ni = nodes.length; const n = { mn: [1e30, 1e30, 1e30], mx: [-1e30, -1e30, -1e30], a: 0, cnt: 0 }; nodes.push(n);
    for (const it of list) for (let i = 0; i < 3; i++) { n.mn[i] = Math.min(n.mn[i], it.box[0][i]); n.mx[i] = Math.max(n.mx[i], it.box[1][i]); }
    if (list.length <= 3) { n.a = order.length; n.cnt = list.length; for (const it of list) order.push(it.idx); return ni; }
    const cmn = [1e30, 1e30, 1e30], cmx = [-1e30, -1e30, -1e30];
    for (const it of list) { const c = cen(it); for (let i = 0; i < 3; i++) { cmn[i] = Math.min(cmn[i], c[i]); cmx[i] = Math.max(cmx[i], c[i]); } }
    const ax = [0, 1, 2].reduce((b, i) => (cmx[i] - cmn[i] > cmx[b] - cmn[b] ? i : b), 0);
    const sorted = list.slice().sort((p, q) => cen(p)[ax] - cen(q)[ax]);
    const half = sorted.length >> 1;
    n.cnt = 0;
    const left = nodes.length; nodes.push(null, null); // children are consecutive
    const L = build2(sorted.slice(0, half), left), R = build2(sorted.slice(half), left + 1);
    n.a = left; return ni;
  };
  const build2 = (list, at) => {
    const n = { mn: [1e30, 1e30, 1e30], mx: [-1e30, -1e30, -1e30], a: 0, cnt: 0 }; nodes[at] = n;
    for (const it of list) for (let i = 0; i < 3; i++) { n.mn[i] = Math.min(n.mn[i], it.box[0][i]); n.mx[i] = Math.max(n.mx[i], it.box[1][i]); }
    if (list.length <= 3) { n.a = order.length; n.cnt = list.length; for (const it of list) order.push(it.idx); return at; }
    const cmn = [1e30, 1e30, 1e30], cmx = [-1e30, -1e30, -1e30];
    for (const it of list) { const c = cen(it); for (let i = 0; i < 3; i++) { cmn[i] = Math.min(cmn[i], c[i]); cmx[i] = Math.max(cmx[i], c[i]); } }
    const ax = [0, 1, 2].reduce((b, i) => (cmx[i] - cmn[i] > cmx[b] - cmn[b] ? i : b), 0);
    const sorted = list.slice().sort((p, q) => cen(p)[ax] - cen(q)[ax]); const half = sorted.length >> 1;
    const left = nodes.length; nodes.push(null, null);
    build2(sorted.slice(0, half), left); build2(sorted.slice(half), left + 1);
    n.a = left; n.cnt = 0; return at;
  };
  build(items);
  return { nodes, order };
}

// ---------- sun, sky ----------
export function directNormalLux(elevRad) {
  const e = elevRad * 180 / Math.PI; if (e <= 0) return 0;
  const z = 90 - e, am = 1 / (Math.cos(z * Math.PI / 180) + 0.50572 * Math.pow(96.07995 - z, -1.6364));
  return 128000 * Math.pow(0.7, Math.pow(am, 0.678));
}
function sunColor(elevRad) {
  const e = Math.max(elevRad * 180 / Math.PI, 0.5), z = 90 - e, am = 1 / (Math.cos(z * Math.PI / 180) + 0.50572 * Math.pow(96.07995 - z, -1.6364));
  const bb = blackbodyRGB(5778), beta = [0.10, 0.16, 0.29];
  const c = bb.map((v, i) => v * Math.exp(-beta[i] * (am - 1)));
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map(v => v / y);
}
function preetham(T, thetaS) {
  const ts = Math.min(thetaS, Math.PI / 2 - 0.01);
  const chi = (4 / 9 - T / 120) * (Math.PI - 2 * ts);
  const Yz = ((4.0453 * T - 4.9710) * Math.tan(chi) - 0.2155 * T + 2.4192) * 1000;
  const t2 = ts * ts, t3 = t2 * ts;
  const xz = T * T * (0.00166 * t3 - 0.00375 * t2 + 0.00209 * ts) + T * (-0.02903 * t3 + 0.06377 * t2 - 0.03202 * ts + 0.00394) + (0.11693 * t3 - 0.21196 * t2 + 0.06052 * ts + 0.25886);
  const yz = T * T * (0.00275 * t3 - 0.00610 * t2 + 0.00317 * ts) + T * (-0.04214 * t3 + 0.08970 * t2 - 0.04153 * ts + 0.00516) + (0.15346 * t3 - 0.26756 * t2 + 0.06670 * ts + 0.26688);
  const cY = [0.1787 * T - 1.4630, -0.3554 * T + 0.4275, -0.0227 * T + 5.3251, 0.1206 * T - 2.5771, -0.0670 * T + 0.3703];
  const cx = [-0.0193 * T - 0.2592, -0.0665 * T + 0.0008, -0.0004 * T + 0.2125, -0.0641 * T - 0.8989, -0.0033 * T + 0.0452];
  const cy = [-0.0167 * T - 0.2608, -0.0950 * T + 0.0092, -0.0079 * T + 0.2102, -0.0441 * T - 1.6537, -0.0109 * T + 0.0529];
  const perez = (th, ga, c) => (1 + c[0] * Math.exp(c[1] / Math.max(Math.cos(th), 0.01))) * (1 + c[2] * Math.exp(c[3] * ga) + c[4] * Math.cos(ga) ** 2);
  return { Yz: Math.max(Yz, 50), xz, yz, cY, cx, cy, F0Y: perez(0, ts, cY), F0x: perez(0, ts, cx), F0y: perez(0, ts, cy) };
}

// ---------- the compiler ----------
export function compile(sceneB, engineB, opts = {}) {
  const sc = compOf(sceneB);
  if (!sc || sc.kind !== 'scene') throw new CandelaError('E121', 'compile(scene, engine): the first argument must be a scene()');
  const eng = engineB && engineB.cfg ? engineB.cfg : engine.realtime().cfg;
  const spectralOn = !!eng.spectral;
  const S = {
    objs: [], lights: [], mats: [], matByKey: new Map(), matByComp: new Map(), media: [], sdfs: [], heights: [], dens: [], helpers: [],
    slots: new Map(), slotList: [], sun: null, sky: null, env: null, fog: null, cam: sc.props.camera, behaviors: [], moving: { time: false, param: false },
    ids: new Map(), spectralUse: false, matCode: [], warnedKeys: new Set(), shapeCount: new Map(), autoMats: new Map(), triangles: 0, nodeIds: new Set(),
  };
  const uniform = (id, type, n) => {
    let s = S.slots.get(id);
    if (s == null) { s = U_BASE + S.slotList.length; S.slots.set(id, s); S.slotList.push({ id, slot: s, type, derived: !!(n && n.x && n.x.derived) }); }
    return type === 'f' ? `U(${s}).x` : type === 'b' ? `(U(${s}).x > 0.5)` : type === 'v2' ? `U(${s}).xy` : type === 'v3' ? `U(${s}).xyz` : `U(${s})`;
  };

  // ---- walk the node tree ----
  const env0 = { time: 0 };
  const walk = (c, parent, inheritedMat, chain) => {
    if (c.props && c.props.id != null && !c.kind.startsWith('light.')) S.nodeIds.add(String(c.props.id));
    if (c.kind === 'group') {
      const own = () => nodeXf(c, env0); const mv = xfMoves(c);
      const recipe = { parent, c, mv };
      if (c.props.behaviors) for (const b of c.props.behaviors) S.behaviors.push({ fn: b, id: c.props.id, comp: c });
      for (const n of c.props.nodes) walk(n, recipe, c.props.material || inheritedMat, chain);
      return;
    }
    if (c.kind.startsWith('light.')) { addLight(c, parent); return; }
    if (c.kind.startsWith('shape.')) {
      const recipe = { parent, c, mv: xfMoves(c) };
      addShape(c, recipe, c.props.material || inheritedMat);
      for (const ch of c.props.children || []) walk(ch, recipe, inheritedMat, chain);
      if (c.props.behaviors) for (const b of c.props.behaviors) S.behaviors.push({ fn: b, id: c.props.id, comp: c });
      return;
    }
    throw new CandelaError('E121', `scene: cannot place a ${c.kind}`);
  };
  const recipeMoves = r => { let m = null; for (let x = r; x; x = x.parent) { if (x.mv === 'time') return 'time'; if (x.mv) m = x.mv; } return m; };
  const evalRecipe = (r, env) => { const chain = []; for (let x = r; x; x = x.parent) chain.unshift(x.c); let M = I34(); for (const c of chain) M = mul34(M, nodeXf(c, env)); return M; };

  // ---- shapes ----
  function addShape(c, recipe, matComp) {
    const ty = SHAPE_TYPE[c.kind]; const p = c.props;
    let pr = [0, 0, 0, 0], bound = 1;
    const pv = v => valueOf(v, env0);
    switch (ty) {
      case 0: pr = [pv(p.r), 0, 0, 0]; bound = pv(p.r); break;
      case 1: pr = [pv(p.size), 0, 0, 0]; break;
      case 2: pr = [pv(p.w) / 2, pv(p.h) / 2, 0, 0]; break;
      case 3: pr = [pv(p.r), 0, 0, 0]; break;
      case 4: pr = [pv(p.size[0]) / 2, pv(p.size[1]) / 2, pv(p.size[2]) / 2, 0]; break;
      case 5: pr = [pv(p.r), pv(p.h) / 2, 0, 0]; break;
      case 6: pr = [pv(p.r), pv(p.h) / 2, 0, 0]; bound = pv(p.h) / 2 + pv(p.r); break;
      case 7: pr = [pv(p.R), pv(p.r), 0, 0]; bound = pv(p.R) + pv(p.r); break;
      case 8: pr = [pv(p.size[0]) / 2, pv(p.size[1]) / 2, pv(p.size[2]) / 2, Math.min(pv(p.rr), Math.min(...p.size.map(pv)) / 2)]; bound = Math.hypot(pr[0], pr[1], pr[2]); break;
      case 9: pr = [pv(p.r), pv(p.h) / 2, 0, 0]; bound = Math.hypot(pv(p.r), pv(p.h) / 2); break;
      case 10: { const s = pv(p.size); const d = p.depth != null ? pv(p.depth) : s; pr = [s, d / 2, 0, 0]; bound = Math.hypot(s, d / 2) * 1.2; break; }
      case 11: { const k = S.sdfs.length; S.sdfs.push(p.sdf); pr = [k, 0, 0, 0]; bound = pv(p.bound); break; }
      case 12: { const k = S.heights.length; S.heights.push({ h: p.h, amp: p.amp }); pr = [k, pv(p.size) / 2, p.amp, 0]; bound = Math.hypot(pv(p.size) / 2 * Math.SQRT2, p.amp * 1.3 + 0.1); break; }
      case 13: { pr = [0, 0, -1, 0]; bound = p.def.radius; break; }
    }
    S.shapeCount.set(c.kind, (S.shapeCount.get(c.kind) || 0) + 1);
    // area emitters
    let lightIdx = -1, mat;
    if (p.emit) {
      lightIdx = S.lights.length;
      S.lights.push({ kind: 'emit', comp: p.emit, shape: c, ty, pr, recipe, objIndex: S.objs.length });
      mat = emitterMaterial(p.emit, ty, pr, recipe);
    } else if (ty === 13 && p.autoFinish && !matComp) mat = -1;
    else mat = lowerMaterial(matComp, c);
    // a mesh's faces: materials from metadata (autoFinish) and explicit .face(selector, material) bindings
    let faceMats = null;
    if (ty === 13) {
      const def = p.def, fm = new Array(def.faces.length).fill(-1); let any = false;
      if (p.autoFinish) def.faces.forEach((f, k) => {
        const meta = Object.assign({ part: def.name }, def.meta, f.meta, { face: f.id });
        const key = JSON.stringify(meta) + (typeof p.autoFinish === 'function' ? '#' + S.objs.length : '');
        let m = S.autoMats.get(key);
        if (m === undefined) { m = typeof p.autoFinish === 'function' ? p.autoFinish(meta, f) : finishFromMetadata(meta); m = m ? compOf(m) || m : null; S.autoMats.set(key, m); }
        if (m) { fm[k] = lowerMaterial(m, c); any = true; }
      });
      for (const [sel, mc] of p.faceMats || []) def.faces.forEach((f, k) => { if (matchFace(f, sel)) { fm[k] = lowerMaterial(mc, c); any = true; } });
      if (mat < 0) mat = fm.find(x => x >= 0) ?? lowerMaterial(null, c);
      faceMats = any ? fm : null;
      S.triangles += def.count;
    }
    // a pure glow (an emissive material over a black BSDF: flames, neon, fairy lights) casts no shadow, so a light
    // placed inside it — a candle's point light in its flame — still reaches the scene
    const mc = matComp && matComp.props ? matComp : matComp ? compOf(matComp) : null;
    const glow = !!(mc && mc.props && mc.props.emission && isBlackSurface(mc.props.surface));
    const o = { comp: c, ty, pr, bound, recipe, mat, lightIdx, irand: hashRand(S.objs.length + 1), id: p.id || null, tags: p.tags || [], hidden: !!p.hidden, flags: glow ? 1 : 0, def: ty === 13 ? p.def : null, box: ty === 13 ? p.def.bounds : null, faceMats };
    if (p.id) S.ids.set(p.id, { kind: 'object', index: S.objs.length, comp: c });
    S.objs.push(o);
    const mv = recipeMoves(recipe); if (mv) S.moving[mv] = true;
  }
  const hashRand = k => { let x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---- lights ----
  function addLight(c, parent) {
    const p = c.props;
    if (p.id) S.ids.set(p.id, { kind: 'light', index: S.lights.length, comp: c });
    if (c.kind === 'light.sun') { S.sun = c; if (moves(p.elevation) || moves(p.azimuth) || moves(p.illuminance)) S.moving[moves(p.elevation) || moves(p.azimuth) || moves(p.illuminance)] = true; return; }
    if (c.kind === 'light.sky') { S.sky = c; S.env = null; return; }
    if (c.kind === 'light.env') { S.env = c; return; }
    if (c.kind === 'light.area') { report('warning', 'W345', 'a light.area() on its own has no shape: give it one with shape.rect(w, h).emit(light.area()…)', { loc: c.meta.loc }); return; }
    const recipe = { parent, c, mv: xfMoves(c) };
    const li = S.lights.length;
    S.lights.push({ kind: c.kind, comp: c, recipe });
    // a bulb with a size is also a visible sphere that the BSDF can hit
    const r = valueOf(p.radius, env0);
    if (r > 0) {
      const o = { comp: c, ty: 0, pr: [r, 0, 0, 0], bound: r, recipe: { parent, c: { props: { at: p.at } }, mv: moves(p.at) }, mat: null, lightIdx: li, irand: 0, id: p.id || null, tags: p.tags || [], flags: 1, bulb: true };
      o.mat = lowerMaterial(null, c, { emissionOf: li });
      S.lights[li].objIndex = S.objs.length;
      S.objs.push(o);
    }
    for (const k of ['power', 'intensity', 'temperature', 'at', 'target', 'color', 'cone']) { const m = moves(p[k]); if (m) S.moving[m] = true; }
  }

  // ---- materials ----
  function emitterMaterial(lc, ty, pr, recipe) {
    // the emitter's surface: black, emitting its luminance (computed at pack time, so it is a uniform)
    const li = S.lights.length - 1;
    const key = 'emit:' + li;
    const id = S.mats.length;
    const slot = uniform('__emit' + li, 'v3');
    const code = `fn mat_${id}(h: Hit, wo: vec3f, uIn: f32) -> Lobe {\n  var L: Lobe = lobeNone();\n  L.kind = 1; L.c0 = vec3f(0.0, 0.0, 0.0); L.N = h.N;\n  L.Le = ${slot};\n  return L;\n}\n`;
    S.mats.push({ id, code, label: 'emitter', key }); S.lights[li].emitSlot = '__emit' + li;
    return id;
  }
  function lowerMaterial(mc, shapeComp, o = {}) {
    if (o.emissionOf != null) {
      const id = S.mats.length, slot = uniform('__emit' + o.emissionOf, 'v3');
      S.mats.push({ id, code: `fn mat_${id}(h: Hit, wo: vec3f, uIn: f32) -> Lobe {\n  var L: Lobe = lobeNone();\n  L.kind = 1; L.c0 = vec3f(0.0, 0.0, 0.0); L.N = h.N;\n  L.Le = ${slot};\n  return L;\n}\n`, label: 'bulb' });
      S.lights[o.emissionOf].emitSlot = '__emit' + o.emissionOf;
      return id;
    }
    if (!mc) {
      if (!S._defaultMatWarned) { S._defaultMatWarned = true; info('I206', `a shape without a material gets a grey diffuse (ρ = 0.5)`, { loc: shapeComp.meta.loc }); }
      mc = compOf(material_plainLambert());
    }
    if (S.matByComp.has(mc)) return S.matByComp.get(mc);
    const gen = new Gen({ uniform, prefix: 'm', label: 'a material', ctx: { P: 'h.P', N: 'h.N', Ng: 'h.Ng', uv: 'h.uv', wo: 'wo', time: 'gTime', lambda: 'gLam', local: 'h.lp', irand: 'h.irand', iid: 'h.iid', curvature: '0.0' } });
    gen.onBump = (n, g) => bumpCall(n, g);
    const body = [];
    let surface, attrs = null;
    const unchecked = new Set(mc.meta.unchecked || []);
    const loc = mc.meta.loc;
    const def = definedMaterial(mc.kind);
    if (def) {
      attrs = attrsOf(mc, def);
      // fragments: their params become attributes; their lowerings rewrite the material's attributes
      const frags = fragsFor(mc);
      for (const f of frags) {
        const F = fragInternals(f);
        for (const r of F.req) if (!(r in attrs)) throw new CandelaError('E130', `fragment '${F.name}' needs attribute '${r}', which ${mc.kind} does not expose`, { loc, hint: 'apply it to a material.pbr() (or a material.define with that attribute)' });
        const fv = {}; for (const [k, d] of Object.entries(F.ps)) { const v = mc.props['frag:' + F.name + ':' + k]; fv[k] = E(v != null ? (isParam(v) ? lift(v) : v) : (d.kind === 'color' ? constNode(d.def) : constNode(+d.def || 0))); }
        for (const vf of F.vals) vf(mc, fv, { warn: (code, msg) => report('warning', code, msg, { loc }), info: (code, msg) => report('info', code, msg, { loc }) });
        for (const lf of F.lowers) {
          const view = mkView(attrs);
          const out = lf(view, fv);
          if (out && out.__attrs) attrs = out.__attrs;
        }
      }
      if (mc.kind === 'material.pbr') {
        const mt = nodeOf(attrs.metallic);
        if (mt.op === 'const' && mt.x > 0.04 && mt.x < 0.96 && !unchecked.has('W335')) report('warning', 'W335', `metallic = ${+mt.x.toFixed(2)}: partially metallic surfaces are non-physical outside texel boundaries (fine for a chart; silence with .unchecked('W335'))`, { loc });
      }
      surface = compOf(def.body(attrs));
    } else surface = mc.props.surface;
    // emission, normal, interior medium
    const normalCode = mc.props.normal ? `safeNorm(${gen.ref(mc.props.normal)})` : 'h.N';
    const medIdx = mc.props.interior ? lowerMedium(mc.props.interior) : -1;
    S._k = 0;   // temporaries are numbered per material, so identical materials give identical code (and share a kernel)
    const tree = genSurface(surface, gen, normalCode, { loc, unchecked, depth: 0 });
    const emit = mc.props.emission ? gen.ref(mc.props.emission) : null;
    const id0 = S.mats.length;
    const fnBody = `  var u: f32 = uIn;\n  var L: Lobe = lobeNone();\n  var wgt: vec3f = vec3f(1.0, 1.0, 1.0);\n${gen.lines.map(l => '  ' + l).join('\n')}\n${tree}\n  L.w = L.w * wgt;\n${emit ? `  L.Le = ${emit};\n` : ''}  L.med = ${medIdx};\n  return L;\n`;
    const dup = S.matByKey.get(fnBody);
    if (dup != null) { S.matByComp.set(mc, dup); S.mats[dup].users++; return dup; }
    S.mats.push({ id: id0, code: `fn mat_${id0}(h: Hit, wo: vec3f, uIn: f32) -> Lobe {\n${fnBody}}\n`, label: mc.kind === 'material.plain' ? describeSurface(surface) : mc.kind.slice(9), comp: mc, users: 1 });
    S.matByKey.set(fnBody, id0); S.matByComp.set(mc, id0);
    return id0;
  }
  const fragsFor = mc => fragmentsOf(mc);
  function mkView(attrs) {
    const v = { __attrs: attrs, map(name, fn) { if (!(name in attrs)) throw new CandelaError('E130', `.map('${name}'): no such attribute (have ${Object.keys(attrs).join(', ')})`); const nv = Object.assign({}, attrs, { [name]: E(lift(fn(attrs[name]))) }); return mkView(nv); }, attr(name) { const a = attrs[name]; return { nonZero: () => !isConst(a, 0), isConst: (x) => isConst(a, x) }; }, get(name) { return attrs[name]; } };
    return v;
  }
  let BUMPS = 0;
  function bumpCall(n, g) {
    const k = ++BUMPS;
    const hgen = new Gen({ uniform, prefix: 'b', label: 'a bump height', ctx: Object.assign({}, g.ctx, { P: 'Pq' }) });
    const r = hgen.ref(n.args[0]);
    S.helpers.push(`fn bumpH_${k}(Pq: vec3f, h: Hit, wo: vec3f) -> f32 {\n${hgen.lines.map(l => '  ' + l).join('\n')}\n  return ${r};\n}\nfn bumpN_${k}(h: Hit, wo: vec3f, amt: f32) -> vec3f {\n  let e: f32 = 0.0005;\n  let g: vec3f = vec3f(bumpH_${k}(h.P + vec3f(e, 0.0, 0.0), h, wo) - bumpH_${k}(h.P - vec3f(e, 0.0, 0.0), h, wo), bumpH_${k}(h.P + vec3f(0.0, e, 0.0), h, wo) - bumpH_${k}(h.P - vec3f(0.0, e, 0.0), h, wo), bumpH_${k}(h.P + vec3f(0.0, 0.0, e), h, wo) - bumpH_${k}(h.P - vec3f(0.0, 0.0, e), h, wo)) / (2.0 * e);\n  let n: vec3f = h.N;\n  return safeNorm(n - (g - dot(g, n) * n) * amt);\n}\n`);
    return `bumpN_${k}(h, wo, ${g.ref(n.args[1])})`;
  }
  // the BSDF tree as stochastic selection: one leaf per shading point, weight carried in `wgt`
  function genSurface(c, gen, Ncode, o) {
    const ind = '  '.repeat(o.depth + 1);
    const R = n => gen.ref(n);
    const nrm = c.props.normal ? `safeNorm(${R(c.props.normal)})` : Ncode;
    const rough = r => Array.isArray(r) ? [R(r[0]), R(r[1])] : [R(r), null];
    const alpha = (r) => { const [a, b] = rough(r); return b ? `L.ax = max(${a} * ${a}, 0.0005); L.ay = max(${b} * ${b}, 0.0005);` : `L.ax = max(${a} * ${a}, 0.0005); L.ay = L.ax;`; };
    const film = () => c.props.film ? ` L.flags = L.flags | 4; L.film = vec2f(${R(c.props.film.thickness)} * 1e9, ${R(c.props.film.ior)});` : '';
    const tang = q => q.props.tangent ? ` L.T = tangentWorld(h, ${R(q.props.tangent)}, ${q.props.rotation ? R(q.props.rotation) : '0.0'}, ${nrm});` : '';
    switch (c.kind) {
      case 'bsdf.lambert': {
        const n = c.props.rho;
        if (n.op === 'const' && !o.unchecked.has('W330') && !o.unchecked.has('*')) { const y = 0.2126 * n.x[0] + 0.7152 * n.x[1] + 0.0722 * n.x[2]; if ((y > 0.905 || (y < 0.025 && y > 0)) && !S.warnedKeys.has('W330' + y)) { S.warnedKeys.add('W330' + y); report('warning', 'W330', `albedo ${y.toFixed(2)} is outside the measured range of real materials [0.03 charcoal … 0.90 fresh snow]`, { loc: c.meta.loc || o.loc, hint: 'a perfect reflector makes indirect light converge slowly and look flat; use ≤ 0.9, or .unchecked()' }); } }
        return `${ind}L.kind = 1; L.c0 = ${R(n)}; L.N = ${nrm};`;
      }
      case 'bsdf.conductor': {
        const p = c.props; let s;
        if (p.ior) {
          if (spectralOn) S.spectralUse = true;
          const eta = `vec3f(${p.ior.eta.map(fl).join(', ')})`, k = `vec3f(${p.ior.k.map(fl).join(', ')})`;
          s = `${ind}L.kind = 2; L.c0 = metalAt(${eta}); L.c1 = metalAt(${k}); L.flags = 0;`;
        } else s = `${ind}L.kind = 2; L.c1 = ${R(p.f0)}; L.c0 = vec3f(1.0, 1.0, 1.0); L.flags = 1;`;
        return s + ` ${alpha(p.roughness)} L.N = ${nrm};${p.ms !== false ? ' L.flags = L.flags | 8;' : ''}${film()}${tang(c)}`;
      }
      case 'bsdf.dielectric': {
        const p = c.props; let iorC;
        if (p.f0) { const f = R(p.f0); iorC = `((1.0 + sqrt(clamp(${f}, 0.0, 0.99))) / (1.0 - sqrt(clamp(${f}, 0.0, 0.99))))`; }
        else iorC = iorCode(p.ior, gen);
        if (p.ior && p.ior.op === 'const' && p.ior.x < 1 && !o.unchecked.has('W340')) report('warning', 'W340', `ior ${p.ior.x} < 1 describes a relative index (e.g. glass→water): declare the outside medium with .exterior(…)`, { loc: c.meta.loc || o.loc });
        return `${ind}L.kind = 3; L.ior = ${iorC}; L.c0 = ${p.tint ? R(p.tint) : 'vec3f(1.0, 1.0, 1.0)'}; ${alpha(p.roughness)} L.N = ${nrm}; L.flags = ${p.reflectOnly ? 2 : 0};${film()}${tang(c)}`;
      }
      case 'bsdf.sheen': { const p = c.props; return `${ind}L.kind = 4; L.c0 = ${R(p.color)}; L.ax = max(${rough(p.roughness)[0]}, 0.07); L.N = ${nrm};`; }
      case 'bsdf.thin': { const p = c.props; return `${ind}L.kind = 5; L.ior = ${iorCode(p.ior, gen)}; L.c0 = ${p.tint ? R(p.tint) : 'vec3f(1.0, 1.0, 1.0)'}; L.N = ${nrm};${film()}`; }
      case 'bsdf.scale': return `${ind}wgt = wgt * ${R(c.props.k)};\n` + genSurface(c.props.a, gen, nrm, o);
      case 'bsdf.mix': {
        const t = c.props.t;
        if (t.op === 'const') { if (t.x <= 0) return genSurface(c.props.a, gen, nrm, o); if (t.x >= 1) return genSurface(c.props.b, gen, nrm, o); }
        const v = `x${o.depth}_${++S._k}`;
        const d = Object.assign({}, o, { depth: o.depth + 1 });
        return `${ind}let ${v}: f32 = clamp(${R(t)}, 0.0, 1.0);\n${ind}if (u < ${v}) {\n${ind}  u = u / max(${v}, 1e-6);\n${genSurface(c.props.b, gen, nrm, d)}\n${ind}} else {\n${ind}  u = (u - ${v}) / max(1.0 - ${v}, 1e-6);\n${genSurface(c.props.a, gen, nrm, d)}\n${ind}}`;
      }
      case 'bsdf.add': {
        energyCheck(c, o);
        const d = Object.assign({}, o, { depth: o.depth + 1 });
        return `${ind}wgt = wgt * 2.0;\n${ind}if (u < 0.5) {\n${ind}  u = u * 2.0;\n${genSurface(c.props.a, gen, nrm, d)}\n${ind}} else {\n${ind}  u = (u - 0.5) * 2.0;\n${genSurface(c.props.b, gen, nrm, d)}\n${ind}}`;
      }
      case 'bsdf.layer': {
        const top = c.props.top, d = Object.assign({}, o, { depth: o.depth + 1 });
        const v = `f${o.depth}_${++S._k}`;
        let pick, topCode;
        if (top.kind === 'bsdf.sheen') { pick = `clamp(lum(${R(top.props.color)}) * 0.25, 0.0, 1.0)`; topCode = genSurface(top, gen, nrm, d); }
        else {
          const iorC = top.props.f0 ? `((1.0 + sqrt(clamp(${R(top.props.f0)}, 0.0, 0.99))) / (1.0 - sqrt(clamp(${R(top.props.f0)}, 0.0, 0.99))))` : iorCode(top.props.ior, gen);
          pick = `fresnelDielectric(clamp(dot(wo, ${nrm}), 0.0, 1.0), ${iorC})`;
          topCode = `${ind}  L.kind = 3; L.ior = ${iorC}; L.c0 = vec3f(1.0, 1.0, 1.0); ${alpha(top.props.roughness)} L.N = ${nrm}; L.flags = 2;${tang(top)}`;
        }
        const tint = c.props.tint ? `\n${ind}  wgt = wgt * pow(max(${R(c.props.tint)}, vec3f(1e-4, 1e-4, 1e-4)), vec3f(1.0, 1.0, 1.0) * (1.0 + 1.0 / max(abs(dot(wo, ${nrm})), 0.2)));` : '';
        return `${ind}let ${v}: f32 = ${pick};\n${ind}if (u < ${v}) {\n${ind}  u = u / max(${v}, 1e-6);\n${topCode}\n${ind}} else {\n${ind}  u = (u - ${v}) / max(1.0 - ${v}, 1e-6);${tint}\n${genSurface(c.props.bottom, gen, nrm, d)}\n${ind}}`;
      }
    }
    throw new CandelaError('E710', `no lowering for ${c.kind}`);
  }
  S._k = 0;
  function iorCode(iorv, gen) {
    if (isParam(iorv) || isExpr(iorv) || typeof iorv === 'number') return gen.ref(iorv);
    if (iorv && iorv.__ior === 'sellmeier') { S.spectralUse = true; const B = `vec3f(${iorv.B.map(fl).join(', ')})`, C = `vec3f(${iorv.C.map(fl).join(', ')})`; return `select(${fl(iorv.nd)}, sellmeier(gLam, ${B}, ${C}), SPECTRAL_ON)`; }
    if (iorv && iorv.__ior === 'cauchy') { S.spectralUse = true; return `select(${fl(iorv.nd)}, ${fl(iorv.A)} + ${fl(iorv.B)} / sq(gLam * 0.001), SPECTRAL_ON)`; }
    if (iorv && iorv.__ior === 'metal') throw new CandelaError('E121', 'a metal IOR on a dielectric: use bsdf.conductor({ ior: ior.metal(…) })');
    return gen.ref(iorv);
  }
  // directional albedo at normal incidence, an upper bound for constants (1 for fields)
  function albedoBound(c) {
    const k = n => n.op === 'const' ? (Array.isArray(n.x) ? Math.max(...n.x) : n.x) : 1;
    switch (c.kind) {
      case 'bsdf.lambert': return k(c.props.rho);
      case 'bsdf.conductor': return c.props.ior ? Math.max(...c.props.ior.f0) : k(c.props.f0);
      case 'bsdf.dielectric': case 'bsdf.thin': return 1;
      case 'bsdf.sheen': return 0.25 * k(c.props.color);
      case 'bsdf.mix': { const t = c.props.t.op === 'const' ? c.props.t.x : 0.5; return (1 - t) * albedoBound(c.props.a) + t * albedoBound(c.props.b); }
      case 'bsdf.add': return albedoBound(c.props.a) + albedoBound(c.props.b);
      case 'bsdf.scale': return k(c.props.k) * albedoBound(c.props.a);
      case 'bsdf.layer': return 1;
    }
    return 1;
  }
  function energyCheck(c, o) {
    if (o.unchecked.has('W420') || o.unchecked.has('*')) return;
    const a = albedoBound(c);
    if (a > 1.001) report('warning', 'W420', `bsdf.add(…) is not energy-conserving: directional albedo ρ(0°) ≈ ${a.toFixed(2)} > 1`, { loc: c.props.loc || c.meta.loc || o.loc, hint: ['→ bsdf.mix(a, b, t)           convex: always valid', '→ bsdf.layer(b, a)            Fresnel-coupled: physically motivated'] });
  }
  function describeSurface(c) { const k = c.kind.slice(5); if (c.kind === 'bsdf.mix' || c.kind === 'bsdf.add') return `${k}(${describeSurface(c.props.a)}, ${describeSurface(c.props.b)})`; if (c.kind === 'bsdf.layer') return `layer(${describeSurface(c.props.top)}, ${describeSurface(c.props.bottom)})`; if (c.kind === 'bsdf.scale') return `scale(${describeSurface(c.props.a)})`; if (c.kind === 'bsdf.conductor' && c.props.ior) return `conductor ${c.props.ior.name}`; return k; }

  // ---- media ----
  function lowerMedium(mcomp) {
    const ix = S.media.findIndex(m => m.comp === mcomp); if (ix >= 0) return ix;
    const p = mcomp.props, id = S.media.length;
    const alb = p.albedo.op === 'const' ? p.albedo.x : (warn('W350', 'a medium albedo must be a constant colour here; using its value at the origin', { loc: mcomp.meta.loc }), evalNode(p.albedo, {}));
    const m = { comp: mcomp, id, sigmaT: p.sigmaT, albedo: Array.isArray(alb) ? alb : [alb, alb, alb], g: p.g, hetero: mcomp.kind === 'medium.heterogeneous' };
    if (m.hetero) {
      const k = S.dens.length; S.dens.push({ node: p.density, med: id });
      const b = p.bounds; const M = nodeXf(b, env0); const half = b.props.size ? b.props.size.map(v => valueOf(v, env0) / 2) : [1, 1, 1];
      const wb = worldBox(M, [[-half[0], -half[1], -half[2]], half]);
      m.box = wb;
      let maj = p.majorant;
      if (maj === 'auto') {
        const iv = intervalOf(p.density, { P: [[wb[0][0], wb[1][0]], [wb[0][1], wb[1][1]], [wb[0][2], wb[1][2]]], local: [[wb[0][0], wb[1][0]], [wb[0][1], wb[1][1]], [wb[0][2], wb[1][2]]], time: [0, 1e4], param: id => paramValue(id) });
        maj = iv[1];
        if (!Number.isFinite(maj) || maj <= 0) throw new CandelaError('E450', `majorant: 'auto' failed for a heterogeneous medium: the density is unbounded inside its bounds (interval [${fmtNum(iv[0])}, ${fmtNum(iv[1])}])`, { loc: mcomp.meta.loc, hint: '→ pass majorant: <number> (m⁻¹), or clamp the field: .min(120)' });
        info('I451', `majorant for the density field: ${fmtNum(maj)} m⁻¹ (interval arithmetic over the IR)`, { loc: mcomp.meta.loc });
      }
      m.majorant = maj;
      // an invisible box that switches the path into the medium
      const o = { comp: b, ty: 4, pr: [half[0], half[1], half[2], 0], bound: 1, recipe: { parent: null, c: b, mv: null }, mat: null, lightIdx: -1, irand: 0, id: null, tags: [], flags: 1, mediumBox: true };
      const mid = S.mats.length;
      S.mats.push({ id: mid, code: `fn mat_${mid}(h: Hit, wo: vec3f, uIn: f32) -> Lobe {\n  var L: Lobe = lobeNone();\n  L.kind = 6; L.N = h.N; L.med = ${id};\n  return L;\n}\n`, label: 'medium bounds' });
      o.mat = mid; S.objs.push(o);
    }
    S.media.push(m);
    return id;
  }

  // ---- walk ----
  for (const n of sc.props.nodes) walk(n, null, null, []);
  for (const mc of sc.props.media || (sc.props.medium ? [sc.props.medium] : [])) {
    if (mc.kind === 'medium.heterogeneous') lowerMedium(mc);
    else { const p = mc.props; const alb = p.albedo.op === 'const' ? p.albedo.x : [0.9, 0.9, 0.9]; S.fog = { sigmaT: p.sigmaT, albedo: alb, g: p.g, extent: p.extent || null }; if (!p.extent) info('I452', 'the scene fog fills a sphere around the objects and the camera (clear air beyond, so distant lights still reach it); set medium.homogeneous({ extent }) to choose its radius', { loc: mc.meta.loc }); }
  }
  if (!S.cam) { S.cam = compOf(opts.defaultCamera || null); if (!S.cam) info('I207', 'no camera: using a 50 mm thin lens at (0, 1.2, 5) looking at (0, 0.5, 0)', { loc: null }); }
  if (!S.sun && !S.sky && !S.env && !S.lights.length) info('I208', 'no lights: the scene is lit by nothing but its emissive surfaces');

  // ---- the scene data's static head: mesh BVHs and triangles (once per definition), face tables, the HDRI ----
  {
    const parts = []; let len = 0;
    const push = f => { parts.push(f); const at = len; len += f.length / 4; return at; };
    const meshAt = new Map(), tableAt = new Map();
    for (const o of S.objs) if (o.ty === 13) {
      if (!meshAt.has(o.def)) { const b = blasOf(o.def); meshAt.set(o.def, { nodeBase: push(b.nodes), triBase: push(b.tris), nodes: b.nNodes }); }
      const m = meshAt.get(o.def);
      let ft = -1;
      if (o.faceMats) { const key = o.faceMats.join(','); if (!tableAt.has(key)) { const t = new Float32Array(Math.ceil(o.faceMats.length / 4) * 4).fill(-1); t.set(o.faceMats); tableAt.set(key, push(t)); } ft = tableAt.get(key); }
      o.pr = [m.nodeBase, m.triBase, ft, 0];
    }
    S.env6 = null;
    if (S.env && S.env.props.env === 'hdri') {
      const p = S.env.props, T = envTablesCached(p.image);
      const base = push(T.tex);
      S.env6 = { base, W: T.W, H: T.H, avg: T.avgLuminance, name: p.imageName };
    }
    const head = new Float32Array(len * 4); let at = 0; for (const f of parts) { head.set(f, at); at += f.length; }
    S.sdHead = head; S.dynBase = Math.ceil(len / 1024) * 1024;
    S.meshDefs = meshAt.size;
  }

  // ---- custom integrator ----
  let customCode = 'fn customKernel(ro: vec3f, rd: vec3f) -> vec3f { return vec3f(1.0, 0.0, 1.0); }\n';
  const integ = eng.integrator || { __integrator: 'path' };
  if (integ.__integrator === 'custom') customCode = genCustomKernel(integ, uniform);
  if (integ.clamp > 0) info('I460', `integrator clamp ${fmtNum(integ.clamp)} is biased: path throughput above it is discarded (caustics and highlights darken)`, { loc: null });

  // ---- generated sections ----
  const sdfCode = S.sdfs.map((n, k) => genFunction(`sdf_${k}`, [['P', 'vec3f']], 'f', n, { uniform, ctx: { P: 'P', local: 'P', time: 'gTime' }, label: 'an SDF' })).join('\n') +
    `fn sdUser(k: i32, p: vec3f) -> f32 {\n${S.sdfs.map((_, k) => `  if (k == ${k}) { return sdf_${k}(p); }`).join('\n')}\n  return 1e9;\n}\n`;
  const hfCode = S.heights.map((h, k) => genFunction(`hf_${k}`, [['xz', 'vec2f']], 'f', node('mul', 'f', [h.h, constNode(h.amp)]), { uniform, ctx: { P: 'vec3f(xz.x, 0.0, xz.y)', local: 'vec3f(xz.x, 0.0, xz.y)', time: 'gTime' }, label: 'a heightfield' })).join('\n') +
    `fn heightAt(k: i32, xz: vec2f) -> f32 {\n${S.heights.map((_, k) => `  if (k == ${k}) { return hf_${k}(xz); }`).join('\n')}\n  return 0.0;\n}\n`;
  const densCode = S.dens.map((d, k) => genFunction(`dens_${k}`, [['P', 'vec3f']], 'f', d.node, { uniform, ctx: { P: 'P', local: 'P', time: 'gTime' }, label: 'a density field' })).join('\n') +
    `fn densityOf(m: i32, P: vec3f) -> f32 {\n${S.dens.map((d, k) => `  if (m == ${d.med}) { return max(dens_${k}(P), 0.0); }`).join('\n')}\n  return 0.0;\n}\n`;
  const metalAt = `fn metalAt(v: vec3f) -> vec3f {\n  if (SPECTRAL_ON) {\n    let t: f32 = clamp((gLam - 450.0) / 200.0, 0.0, 1.0);\n    let s: f32 = select(mix(v.z, v.y, t * 2.0), mix(v.y, v.x, t * 2.0 - 1.0), t > 0.5);\n    return vec3f(s, s, s);\n  }\n  return v;\n}\n`;
  const matCode = S.helpers.join('\n') + '\n' + S.mats.map(m => m.code).join('\n') +
    `fn evalMaterial(h: Hit, wo: vec3f, u: f32) -> Lobe {\n${S.mats.map(m => `  if (h.mat == ${m.id}) { return mat_${m.id}(h, wo, u); }`).join('\n')}\n  var L: Lobe = lobeNone(); L.kind = 1; L.c0 = vec3f(0.5, 0.5, 0.5); L.N = h.N;\n  return L;\n}\n` +
    `fn hitAlbedo(h: Hit, wo: vec3f) -> vec3f { let L: Lobe = evalMaterial(h, wo, 0.5); if (L.kind == 2 && (L.flags & 1) != 0) { return L.c1; } if (L.kind == 1 || L.kind == 4) { return L.c0; } return vec3f(0.8, 0.8, 0.8); }\n` +
    `fn hitEmission(h: Hit, wo: vec3f) -> vec3f { let L: Lobe = evalMaterial(h, wo, 0.5); return L.Le; }\n` + customCode;

  if (S.spectralUse && !spectralOn && !S.warnedKeys.has('W610')) report('warning', 'W610', 'a material has a wavelength-dependent IOR but the engine renders RGB: dispersion is approximated (no rainbow). → engine.offline().spectral()', { loc: null });
  const nInst = S.objs.length;
  if (nInst >= 12 && S.mats.length < nInst / 2) info('I205', `${nInst} objects → ${S.mats.length} material kernels (bodies deduplicated by structure)`, { loc: null });

  const head = `const SPECTRAL_ON: bool = ${spectralOn ? 'true' : 'false'};\n`;
  const shared = head + PRELUDE + SPECTRAL + ggxTableWGSL() + sdfCode + hfCode + densCode + CORE + metalAt + matCode + PATH;
  const nU = U_BASE + Math.max(S.slotList.length, 1) + 8;

  // ---- data packing (re-run when params move or the clock ticks) ----
  const compiled = {
    shared, post: POST, nU, spectral: spectralOn, engine: eng, slots: S.slotList, ids: S.ids, behaviors: S.behaviors, moving: S.moving,
    objects: S.objs, lightsMeta: S.lights, materials: S.mats.map(m => ({ id: m.id, label: m.label, users: m.users || 1 })), media: S.media, cameraComp: S.cam,
    stats: { objects: S.objs.length, lights: S.lights.length, materials: S.mats.length, media: S.media.length, sdfs: S.sdfs.length, params: S.slotList.length, lines: 0, triangles: S.triangles, meshes: S.meshDefs, sceneData: S.sdHead.byteLength },
    motionBlur: S.cam && S.cam.props && S.cam.props.motion ? S.cam.props.motion : null, hdri: S.env6, poseIds: S.nodeIds,
    sun: S.sun, sky: S.sky, env: S.env, fog: S.fog,
    pack: (env = {}) => pack(S, env, nU),
  };
  compiled.stats.lines = shared.split('\n').length;
  return compiled;
}

function material_plainLambert() { return { [Symbol.for('candela.comp')]: new Comp('material.plain', { surface: new Comp('bsdf.lambert', { rho: constNode([0.5, 0.5, 0.5]) }, { frags: [], loc: null, unchecked: [] }) }, { frags: [], loc: null, unchecked: [] }) }; }

// ---------- custom integrators: a traced kernel over a small transport API ----------
function genCustomKernel(integ, uniform) {
  const n = (op, type, args = [], x = null) => node(op, type, args, x);
  const ray = { o: E(n('ctx', 'v3', [], 'ro')), d: E(n('ctx', 'v3', [], 'rd')) };
  let tag = 0;
  const hitOf = (r) => {
    const o = nodeOf(r.o) || lift(r.o), d = nodeOf(r.d) || lift(r.d);
    const h = n('trace', 'hit', [o, d], { tag: ++tag });
    const f = (name, t) => E(n('hitf', t, [h], name));
    return {
      missed: E(n('hitMiss', 'b', [h])), t: f('t', 'f'), P: f('P', 'v3'), N: f('N', 'v3'), Ng: f('Ng', 'v3'), uv: f('uv', 'v2'),
      albedo: E(n('hitAlb', 'v3', [h, d])), emission: E(n('hitEm', 'v3', [h, d])),
      spawn: dir => ({ o: E(n('add', 'v3', [n('hitf', 'v3', [h], 'P'), n('mul', 'v3', [n('hitf', 'v3', [h], 'Ng'), constNode(0.001)])])), d: E(lift(dir)) }),
    };
  };
  const api = {
    ray,
    scene: {
      intersect: r => hitOf(r),
      occluded: (o, d, maxT = 1e30) => E(n('occl', 'b', [lift(o), lift(d), lift(maxT)])),
      env: d => E(n('envL', 'v3', [lift(d)])),
      sunDir: E(n('sunDir', 'v3')),
    },
    sampler: {
      next1D: () => E(n('rand', 'f', [], { tag: ++tag })),
      next2D: () => E(n('rand2', 'v2', [], { tag: ++tag })),
      cosineHemisphere: N => E(n('cosHemiN', 'v3', [lift(N)], { tag: ++tag })),
      uniformSphere: () => E(n('uSphere', 'v3', [], { tag: ++tag })),
    },
  };
  const P = {}; for (const [k, d] of Object.entries(integ.params || {})) P[k] = d && d.__def ? d.__def.def : d;
  const root = lift(integ.kernel(api, P));
  if (root.type !== 'v3' && root.type !== 'f') throw new CandelaError('E122', 'an integrator kernel returns a colour (Vec3)');
  const gen = new Gen({ uniform, prefix: 'k', label: 'an integrator', ctx: { ro: 'ro', rd: 'rd', time: 'gTime' } });
  const base = gen.code.bind(gen);
  gen.code = (nd) => {
    const a = nd.args.map(x => gen.ref(x));
    switch (nd.op) {
      case 'trace': return `traceScene(${a[0]}, ${a[1]}, 1e30)`;
      case 'hitf': return `${a[0]}.${nd.x}`;
      case 'hitMiss': return `(!${a[0]}.ok)`;
      case 'hitAlb': return `hitAlbedo(${a[0]}, -${a[1]})`;
      case 'hitEm': return `hitEmission(${a[0]}, -${a[1]})`;
      case 'occl': return `occluded(${a[0]}, ${a[1]}, ${a[2]})`;
      case 'envL': return `(envL(${a[0]}) + sunL(${a[0]}))`;
      case 'sunDir': return 'U(6).xyz';
      case 'rand': return 'rnd()';
      case 'rand2': return 'rnd2()';
      case 'cosHemiN': return `toWorld(frameOf(${a[0]}), cosHemi(rnd2()))`;
      case 'uSphere': return `safeNorm(vec3f(rnd() * 2.0 - 1.0, rnd() * 2.0 - 1.0, rnd() * 2.0 - 1.0))`;
    }
    return base(nd);
  };
  const WTx = Object.assign({}, WT, { hit: 'Hit' });
  // types: Gen uses WT; extend for 'hit'
  const origRef = gen.ref.bind(gen);
  gen.ref = (nd) => {
    if (nd.type === 'hit' && !gen.names.has(nd.id)) { const code = gen.code(nd); const name = `${gen.prefix}${++gen.k}`; gen.lines.push(`let ${name}: Hit = ${code};`); gen.names.set(nd.id, name); return name; }
    return origRef(nd);
  };
  const r = gen.ref(root);
  return `fn customKernel(ro: vec3f, rd: vec3f) -> vec3f {\n${gen.lines.map(l => '  ' + l).join('\n')}\n  return ${root.type === 'f' ? `vec3f(${r})` : r};\n}\n`;
}

// ---------- packing ----------
const LUMW = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function lightColor(p, env) {
  if (p.color) { const c = valueOf(p.color, env); const y = LUMW(c) || 1; return { rgb: c.map(v => v / y), T: 0 }; }
  const T = p.temperature != null ? valueOf(p.temperature, env) : 6504;
  return { rgb: blackbodyRGB(T), T };
}
function planckNorm(T) { if (!T) return 0; let Y = 0; for (let l = 380; l <= 780; l += 5) Y += planck(l, T) * cmf(l)[1] * 5; const rel = l => { const x = l * 1e-3; return 1 / (x ** 5 * (Math.exp(14387.77 / (x * T)) - 1)); }; let Yr = 0; for (let l = 380; l <= 780; l += 5) Yr += rel(l) * cmf(l)[1] * 5; return 106.857 / Yr; }
function pack(S, env, nU) {
  const time = env.time || 0; const poses = normPoses(env.poses); const E0 = { time, overrides: env.overrides || null, poses };
  // objects, ordered for the BVH: bounded first (in leaf order), then unbounded
  const objs = S.objs;
  const mats = objs.map(o => o.recipe ? evalRecipeOf(o.recipe, E0) : I34());
  // motion blur: the scene at K instants across the shutter; each object that moves gets a block of K rigid
  // poses relative to its matrix now (P_k = M_k · M_c⁻¹), and a BVH box swept over them
  const mo = env.motion && env.motion.samples && env.motion.samples.length >= 2 ? env.motion : null;
  const K = mo ? mo.samples.length : 0, rig = new Map();
  if (mo) {
    const envs = mo.samples.map(sm => ({ time: sm.time != null ? sm.time : time, overrides: sm.overrides !== undefined ? sm.overrides : E0.overrides, poses: sm.poses !== undefined ? normPoses(sm.poses) : poses }));
    objs.forEach((o, i) => {
      if (o.hidden || !o.recipe) return;
      const Mi = inv34(mats[i]); let still = true;
      const R = envs.map(e => { const P = mul34(evalRecipeOf(o.recipe, e), Mi); for (let k = 0; k < 12; k++) if (Math.abs(P[k] - (k % 5 === 0 ? 1 : 0)) > 1e-7) still = false; return P; });
      if (!still) rig.set(i, R.map(rigidOf));
    });
  }
  const items = [], unb = [];
  objs.forEach((o, i) => { if (o.hidden) return; const lb = o.box || localBox(o.ty, o.pr); const unbounded = o.ty === 1 && !(o.pr[0] > 0); if (unbounded) unb.push(i); else items.push({ idx: i, box: rig.has(i) ? sweptBox(rig.get(i), mats[i], lb, o.bound) : worldBox(mats[i], lb, o.bound) }); });
  const bvh = buildBVH(items);
  const order = bvh.order.concat(unb);
  const remap = new Map(order.map((oi, k) => [oi, k]));
  // the scene data's dynamic tail: media, then motion blocks
  const dynBase = S.dynBase, mBase0 = dynBase + S.media.length * 3;
  const SDd = new Float32Array((S.media.length * 3 + rig.size * K * 2) * 4 || 4);
  const O = new Float32Array(Math.max(1, order.length) * 24);
  let mAt = 0;
  order.forEach((oi, k) => {
    const o = objs[oi], M = mats[oi], Mi = inv34(M), b = k * 24;
    O.set([o.ty, o.mat, o.lightIdx, o.flags || 0], b);
    O.set(Mi, b + 4);
    O.set(o.pr, b + 16);
    let mb = 0;
    if (rig.has(oi)) {
      const at = S.media.length * 3 + mAt * K * 2; mb = dynBase + at + 1;
      rig.get(oi).forEach((P, j) => SDd.set([...P.q, ...P.t, P.s], (at + j * 2) * 4));
      mAt++;
    }
    O.set([o.irand, oi, mb, o.ty >= 6 ? o.bound : 0], b + 20);
  });
  const BV = new Float32Array(Math.max(1, bvh.nodes.length) * 8);
  bvh.nodes.forEach((n, k) => { BV.set([n.mn[0], n.mn[1], n.mn[2], n.a, n.mx[0], n.mx[1], n.mx[2], n.cnt], k * 8); });
  // lights
  const lightRecs = [], uniOver = new Map();
  for (const [li, L] of S.lights.entries()) {
    const r = new Float32Array(24);
    const p = L.comp.props;
    const col = lightColor(p, E0);
    if (L.kind === 'emit') {
      const M = evalRecipeOf(L.recipe, E0);
      const twoSided = !!p.twoSided;
      let power = p.power != null ? valueOf(p.power, E0) : null, Lum = p.luminance != null ? valueOf(p.luminance, E0) : null;
      if (L.ty === 0) {
        const c = xfPoint(M, [0, 0, 0]), rr = L.pr[0] * Math.cbrt(Math.abs((M[0] * (M[5] * M[10] - M[6] * M[9]) - M[1] * (M[4] * M[10] - M[6] * M[8]) + M[2] * (M[4] * M[9] - M[5] * M[8])))) ;
        const lum = Lum != null ? Lum : power / (4 * Math.PI * Math.PI * rr * rr);
        const I = lum * Math.PI * rr * rr;
        r.set([0, remap.get(L.objIndex) ?? -1, 0, 0, c[0], c[1], c[2], rr, ...col.rgb.map(v => v * I), 0, 0, 0, 0, -1, 0, 0, 0, col.T, planckNorm(col.T), 0, 0, 0]);
        uniOver.set('__emit' + li, col.rgb.map(v => v * lum));
      } else {
        const c = xfPoint(M, [0, 0, 0]);
        let ex, ey, area;
        if (L.ty === 2) { ex = xfDir(M, [L.pr[0], 0, 0]); ey = xfDir(M, [0, 0, L.pr[1]]); area = 4 * V.len(ex) * V.len(ey); }
        else { ex = xfDir(M, [L.pr[0], 0, 0]); ey = xfDir(M, [0, 0, L.pr[0]]); area = Math.PI * V.len(ex) * V.len(ey); }
        // make (ex × ey) point along the local +y the shape faces
        const n = V.norm(V.cross(ex, ey)), ny = V.norm(xfDir(M, [0, 1, 0]));
        if (V.dot(n, ny) < 0) { const t = ex; ex = ey; ey = t; }
        const lum = Lum != null ? Lum : power / ((twoSided ? 2 : 1) * Math.PI * area);
        r.set([L.ty === 2 ? 2 : 3, remap.get(L.objIndex) ?? -1, twoSided ? 1 : 0, 0, c[0], c[1], c[2], L.ty === 3 ? 1 : 0, ...col.rgb.map(v => v * lum), area, ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], col.T, planckNorm(col.T), 0, 0, 0]);
        uniOver.set('__emit' + li, col.rgb.map(v => v * lum));
      }
    } else {
      const M = L.recipe ? evalRecipeOf(L.recipe, E0) : I34();
      const pos = xfPoint(M, [0, 0, 0]);
      const I = lightIntensityAt(L.comp, E0);
      const rad = valueOf(p.radius, E0) || 0;
      if (L.kind === 'light.spot') {
        const tgt = p.target ? valueOf(p.target, E0) : [pos[0], pos[1] - 1, pos[2]];
        const dir = V.norm(V.sub(tgt, pos));
        const cone = valueOf(p.cone, E0), soft = valueOf(p.soft, E0) || 0;
        r.set([1, L.objIndex != null ? remap.get(L.objIndex) ?? -1 : -1, 0, 0, pos[0], pos[1], pos[2], rad, ...col.rgb.map(v => v * I), Math.cos(cone), dir[0], dir[1], dir[2], Math.cos(Math.max(0, cone - soft)), 0, 0, 0, col.T, planckNorm(col.T), 0, 0, 0]);
      } else {
        r.set([0, L.objIndex != null ? remap.get(L.objIndex) ?? -1 : -1, 0, 0, pos[0], pos[1], pos[2], rad, ...col.rgb.map(v => v * I), 0, 0, 0, 0, 0, 0, 0, 0, col.T, planckNorm(col.T), 0, 0, 0]);
      }
      if (rad > 0) uniOver.set('__emit' + li, col.rgb.map(v => v * I / (Math.PI * rad * rad)));
    }
    lightRecs.push(r);
  }
  // light index of each object follows the remap (lights reference objects; objects reference lights)
  const LI = new Float32Array(Math.max(1, lightRecs.length) * 24); lightRecs.forEach((r, k) => LI.set(r, k * 24));
  // media (the head of the dynamic tail)
  S.media.forEach((m, k) => {
    if (m.hetero) SDd.set([m.box[0][0], m.box[0][1], m.box[0][2], m.g, m.albedo[0], m.albedo[1], m.albedo[2], 1, m.box[1][0], m.box[1][1], m.box[1][2], m.majorant], k * 12);
    else SDd.set([m.sigmaT[0], m.sigmaT[1], m.sigmaT[2], m.g, m.albedo[0], m.albedo[1], m.albedo[2], 0, 0, 0, 0, 0], k * 12);
  });
  // uniforms
  const U = new Float32Array(nU * 4);
  const set = (i, a) => U.set(a, i * 4);
  set(19, [order.length, lightRecs.length, items.length, bvh.nodes.length]);
  // sun, sky, environment
  let sunOn = 0, sunDir = [0, 1, 0], sunCos = 1, sunRad = [0, 0, 0], sunElev = Math.PI / 4, sunAz = 0;
  if (S.sun || S.sky) {
    const sp = S.sun ? S.sun.props : {};
    sunElev = S.sun ? valueOf(sp.elevation, E0) : (S.sky.props.elevation != null ? valueOf(S.sky.props.elevation, E0) : Math.PI / 4);
    sunAz = S.sun ? valueOf(sp.azimuth, E0) : (S.sky.props.azimuth != null ? valueOf(S.sky.props.azimuth, E0) : Math.PI * 0.75);
    if (S.sky && S.sky.props.elevation != null && !S.sky.props.fromSun) { sunElev = valueOf(S.sky.props.elevation, E0); sunAz = S.sky.props.azimuth != null ? valueOf(S.sky.props.azimuth, E0) : sunAz; }
    sunDir = [Math.sin(sunAz) * Math.cos(sunElev), Math.sin(sunElev), Math.cos(sunAz) * Math.cos(sunElev)];
  }
  if (S.sun) {
    const sp = S.sun.props; sunOn = sunElev > -0.02 ? 1 : 0;
    if (sp.dir) sunDir = V.norm(valueOf(sp.dir, E0));
    const half = (valueOf(sp.diam, E0) || 0.0093) / 2; sunCos = Math.cos(half);
    const E = sp.illuminance != null ? valueOf(sp.illuminance, E0) : directNormalLux(sunElev);
    const omega = 2 * Math.PI * (1 - sunCos);
    const c = sp.color ? lightColor(sp, E0).rgb : sp.temperature != null ? blackbodyRGB(valueOf(sp.temperature, E0)) : sunColor(sunElev);
    sunRad = c.map(v => v * E / omega);
  }
  set(6, [...sunDir, sunCos]); set(7, [...sunRad, sunOn]);
  let envType = 0, envLum = 0, envRot = 0; let top = [1, 1, 1], bottom = [0, 0, 0];
  if (S.sky) {
    envType = 4;
    const T = S.sky.props.turbidity || 3, th = Math.PI / 2 - Math.max(sunElev, 0.02);
    const pr = preetham(T, th);
    const fade = Math.max(0, Math.min(1, (sunElev + 0.1) / 0.15));
    set(11, [pr.cY[0], pr.cY[1], pr.cY[2], pr.cY[3]]); set(12, [pr.cY[4], pr.cx[0], pr.cx[1], pr.cx[2]]); set(13, [pr.cx[3], pr.cx[4], pr.cy[0], pr.cy[1]]);
    set(14, [pr.cy[2], pr.cy[3], pr.cy[4], 0]); set(15, [pr.Yz, pr.xz, pr.yz, pr.F0Y]); set(16, [pr.F0x, pr.F0y, (S.sky.props.scale || 1) * fade + 0.0005, T]);
  } else if (S.env) {
    const p = S.env.props, kind = p.env;
    envType = kind === 'uniform' ? 1 : kind === 'studio' ? 2 : kind === 'gradient' ? 3 : kind === 'night' ? 5 : kind === 'hdri' ? 6 : 0;
    envLum = valueOf(p.luminance, E0); envRot = valueOf(p.rotation, E0) || 0;
    if (kind === 'gradient') { top = p.top; bottom = p.bottom; }
    // an HDRI's pixels are relative unless calibrated: `luminance` sets its average (nits), `intensity` scales it
    if (kind === 'hdri') envLum = (p.average != null ? valueOf(p.average, E0) / (S.env6.avg || 1) : 1) * (envLum != null ? envLum : 1);
  }
  set(8, [envType, envLum, envRot, 0]); set(9, [...top, 0]); set(10, [...bottom, 0]);
  set(23, S.env6 ? [S.env6.base, S.env6.W, S.env6.H, dynBase] : [0, 0, 0, dynBase]);
  set(24, [env.seed || 0, K, 0, 0]);
  // fog
  if (S.fog) { set(17, [...S.fog.sigmaT, S.fog.g]); set(18, [...S.fog.albedo, 1]); } else { set(17, [0, 0, 0, 0]); set(18, [0, 0, 0, 0]); }
  // the fog's extent: a sphere around the bounded objects and the camera (or medium.homogeneous({ extent }))
  if (S.fog) {
    let c = [0, 0, 0], R = 20;
    if (bvh.nodes.length) { const n = bvh.nodes[0]; c = [0, 1, 2].map(k => (n.mn[k] + n.mx[k]) / 2); R = Math.hypot(n.mx[0] - n.mn[0], n.mx[1] - n.mn[1], n.mx[2] - n.mn[2]) / 2 * 1.25 + 1; }
    const cp = S.cam && S.cam.props && S.cam.props.at ? valueOf(S.cam.props.at, E0) : null;
    if (cp) R = Math.max(R, Math.hypot(cp[0] - c[0], cp[1] - c[1], cp[2] - c[2]) * 1.1 + 1);
    if (S.fog.extent) R = S.fog.extent;
    set(22, [...c, R]);
  }
  set(20, [0, 0.5, 0, S.media.length]);
  set(21, [1, 1, 1, 0]);
  // params and derived values
  for (const s of S.slotList) {
    let v;
    if (uniOver.has(s.id)) v = uniOver.get(s.id);
    else v = paramValue(s.id);
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (typeof v === 'string') v = 0;
    if (isQ(v)) v = v.v;
    if (typeof v === 'number') set(s.slot, [v, 0, 0, 0]); else if (Array.isArray(v)) set(s.slot, [v[0] || 0, v[1] || 0, v[2] || 0, v[3] || 0]);
  }
  return { U, O, LI, BV, SDs: S.sdHead, SDd, dynBase, order, remap, nObjs: order.length, sunDir, sunElev, envType, moving: rig.size, mats };
}
function lightIntensityAt(c, env) {
  const p = c.props;
  if (p.intensity != null) return valueOf(p.intensity, env);
  const P = valueOf(p.power, env);
  if (c.kind === 'light.spot' && p.powerMode !== 'masked') { const th = valueOf(p.cone, env); return P / (2 * Math.PI * (1 - Math.cos(th))); }
  return P / (4 * Math.PI);
}
// a node's world transform. With poses (id → world matrix, from an animation engine or animation(t)), the
// deepest posed node on the chain replaces everything above it: M = Pose · (the chain below it)
// A local pose ({ …, local: true }) replaces only that node's own transform, under whatever is above it.
function evalRecipeOf(r, env) {
  const chain = []; for (let x = r; x; x = x.parent) chain.unshift(x.c);
  let start = 0, M = I34();
  const P = env && env.poses && env.poses.size ? env.poses : null;
  const poseOf = c => (P && c.props.id != null ? P.get(String(c.props.id)) : null);
  if (P) for (let i = chain.length - 1; i >= 0; i--) { const q = poseOf(chain[i]); if (q && !q.local) { M = q.M; start = i + 1; break; } }
  for (let i = start; i < chain.length; i++) { const q = poseOf(chain[i]); M = mul34(M, q && q.local ? q.M : nodeXf(chain[i], env)); }
  return M;
}
const ENV_CACHE = new WeakMap();
function envTablesCached(img) { let t = ENV_CACHE.get(img); if (!t) { t = envTables(img); ENV_CACHE.set(img, t); } return t; }

// ---------- poses ----------
// accepted: a 4×4 column-major array (three.js / glTF), { matrix }, { position, quaternion: [x, y, z, w] },
// { position, rotation: [x, y, z] (radians, XYZ order) }, each with an optional scale (number or [x, y, z]);
// world space, or the node's own transform under its parents with local: true
export function poseMatrix(p, id = '?') {
  const bad = () => new CandelaError('E121', `pose '${id}': expected a 16-number matrix, { matrix }, { position, quaternion } or { position, rotation }`);
  if (p == null) throw bad();
  if (p.length === 12 && !p.position) return Array.from(p);
  const m = p.length === 16 ? p : p.matrix;
  if (m) { if (m.length !== 16) throw bad(); return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]]; }
  const t = p.position || p.translation || [0, 0, 0];
  let R;
  if (p.quaternion || p.q) { let [x, y, z, w] = p.quaternion || p.q; const l = Math.hypot(x, y, z, w) || 1; x /= l; y /= l; z /= l; w /= l; R = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]; }
  else if (p.rotation) { const [a, b, c] = p.rotation, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c); R = [cb * cc, -cb * sc, sb, ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb, sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb]; }
  else if (p.position || p.translation || p.scale != null) R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  else throw bad();
  const s = p.scale == null ? [1, 1, 1] : typeof p.scale === 'number' ? [p.scale, p.scale, p.scale] : p.scale;
  return [R[0] * s[0], R[1] * s[1], R[2] * s[2], t[0], R[3] * s[0], R[4] * s[1], R[5] * s[2], t[1], R[6] * s[0], R[7] * s[1], R[8] * s[2], t[2]];
}
export function normPoses(P) {
  if (!P) return null;
  if (P instanceof Map && P._norm) return P;
  const out = new Map(); out._norm = true;
  for (const [k, v] of P instanceof Map ? P : Object.entries(P)) if (v != null) out.set(String(k), { M: poseMatrix(v, k), local: !!(v && v.local) });
  return out;
}
// P = M·inv(Mc) as (quaternion, translation, uniform scale)
function rigidOf(A) {
  const det = A[0] * (A[5] * A[10] - A[6] * A[9]) - A[1] * (A[4] * A[10] - A[6] * A[8]) + A[2] * (A[4] * A[9] - A[5] * A[8]);
  const s = Math.cbrt(det) || 1;
  const m = [A[0] / s, A[1] / s, A[2] / s, A[4] / s, A[5] / s, A[6] / s, A[8] / s, A[9] / s, A[10] / s];
  // quaternion from a (nearly) orthonormal matrix (Shepperd)
  const tr = m[0] + m[4] + m[8]; let q;
  if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; q = [(m[7] - m[5]) / k, (m[2] - m[6]) / k, (m[3] - m[1]) / k, k / 4]; }
  else if (m[0] > m[4] && m[0] > m[8]) { const k = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; q = [k / 4, (m[1] + m[3]) / k, (m[2] + m[6]) / k, (m[7] - m[5]) / k]; }
  else if (m[4] > m[8]) { const k = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; q = [(m[1] + m[3]) / k, k / 4, (m[5] + m[7]) / k, (m[2] - m[6]) / k]; }
  else { const k = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; q = [(m[2] + m[6]) / k, (m[5] + m[7]) / k, k / 4, (m[3] - m[1]) / k]; }
  const l = Math.hypot(...q) || 1;
  return { q: q.map(v => v / l), t: [A[3], A[7], A[11]], s };
}
const qrotJS = (q, v) => { const [x, y, z, w] = q, d = x * v[0] + y * v[1] + z * v[2], uu = x * x + y * y + z * z, c = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]]; return [2 * d * x + (w * w - uu) * v[0] + 2 * w * c[0], 2 * d * y + (w * w - uu) * v[1] + 2 * w * c[1], 2 * d * z + (w * w - uu) * v[2] + 2 * w * c[2]]; };
// the kernel's interpolation, for swept bounds
function poseAt(R, tau) {
  const K = R.length, x = Math.min(Math.max(tau, 0), 1) * (K - 1), k0 = Math.min(Math.max(Math.floor(x), 0), K - 2), f = x - k0;
  const a = R[k0], b = R[k0 + 1]; let qb = b.q; if (a.q[0] * qb[0] + a.q[1] * qb[1] + a.q[2] * qb[2] + a.q[3] * qb[3] < 0) qb = qb.map(v => -v);
  const q = a.q.map((v, i) => v + (qb[i] - v) * f), l = Math.hypot(...q) || 1;
  return { q: q.map(v => v / l), t: a.t.map((v, i) => v + (b.t[i] - v) * f), s: a.s + (b.s - a.s) * f };
}
function sweptBox(R, M, lb, bound) {
  const base = worldBox(M, lb, bound), mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
  const N = (R.length - 1) * 4;
  for (let j = 0; j <= N; j++) {
    const P = poseAt(R, j / N);
    for (let k = 0; k < 8; k++) {
      const c = [base[k & 1][0], base[(k >> 1) & 1][1], base[(k >> 2) & 1][2]];
      const w = qrotJS(P.q, c).map((v, i) => v * P.s + P.t[i]);
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], w[i]); mx[i] = Math.max(mx[i], w[i]); }
    }
  }
  // a rotating box's corners sweep arcs that bulge past the sampled corners: pad by the sagitta
  const ext = Math.hypot(base[1][0] - base[0][0], base[1][1] - base[0][1], base[1][2] - base[0][2]) / 2;
  const pad = ext * (1 - Math.cos(Math.PI / N)) + 1e-5;
  return [mn.map(v => v - pad), mx.map(v => v + pad)];
}

// ---------- the camera, as uniforms ----------
export function cameraUniforms(camComp, o) {
  const p = camComp ? camComp.props : { at: [0, 1.2, 5], target: [0, 0.5, 0], focal: 0.05, fstop: 8, shutter: 1 / 125, iso: 100, exposure: 'auto', sensor: 0.036, blades: 0, bladeRot: 0 };
  const env = { time: o.time || 0 };
  const at = o.view ? o.view.at : valueOf(p.at, env), tgt = o.view ? o.view.target : valueOf(p.target, env);
  const f = V.norm(V.sub(tgt, at));
  let r = V.norm(V.cross(f, [0, 1, 0])); if (!Number.isFinite(r[0]) || V.len(V.cross(f, [0, 1, 0])) < 1e-6) r = [1, 0, 0];
  const up = V.cross(r, f);
  const focal = valueOf(p.focal, env), sensor = p.sensor || 0.036;
  const tanH = sensor / 2 / focal, aspect = o.width / o.height, tanV = tanH / aspect;
  const N = valueOf(p.fstop, env);
  const lensR = p.pinhole || o.noDof ? 0 : focal / (2 * N);
  let focus = p.focus != null ? valueOf(p.focus, env) : V.len(V.sub(tgt, at));
  if (p.focusOn && o.focusPoint) focus = Math.max(0.05, V.dot(V.sub(o.focusPoint, at), f));
  if (o.view && o.view.focus) focus = o.view.focus;
  const physical = Math.log2(N * N / p.shutter) - Math.log2(p.iso / 100);
  let ev = null, mode = 'auto';
  if (typeof p.exposure === 'number') { ev = p.exposure; mode = 'fixed'; }
  else if (isParam(p.exposure)) { ev = valueOf(p.exposure, env); mode = 'param'; }
  else if (p.exposure === 'physical') { ev = physical; mode = 'physical'; }
  return { U1: [...at, lensR], U2: [...V.mul(r, tanH), focus], U3: [...V.mul(up, tanV), p.blades || 0], U4: [...f, o.time || 0], bladeRot: p.bladeRot || 0, ev, mode, physical, fov: 2 * Math.atan(tanH), focal, N, focus, at, target: tgt };
}

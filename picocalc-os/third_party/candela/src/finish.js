// finish.js — what CAD parts are made of, as materials: a metal (or polymer), the machining process that
// left its grooves (turned, faced, milled, ground, brushed, hobbed …) and a surface treatment over it (black
// oxide, zinc, anodizing, paint). finish.fromMetadata(meta) reads the same vocabulary from part and face
// metadata, which is how shape.mesh(def).autoFinish() dresses an imported assembly without hand assignment.
import { material } from './scene.js';
import { pbr } from './stdlib.js';
import { fx } from './fx.js';
import { CandelaError, didYouMean } from './diag.js';

// normal-incidence reflectance (linear sRGB) and a typical bare roughness
export const METAL_F0 = {
  steel: { f0: [0.56, 0.57, 0.58], r: 0.3 },
  stainless: { f0: [0.62, 0.62, 0.61], r: 0.25 },
  'bearing-steel': { f0: [0.6, 0.6, 0.6], r: 0.2 },
  'tool-steel': { f0: [0.55, 0.56, 0.57], r: 0.25 },
  'cast-iron': { f0: [0.43, 0.43, 0.43], r: 0.55 },
  iron: { f0: [0.53, 0.51, 0.49], r: 0.35 },
  aluminium: { f0: [0.91, 0.92, 0.92], r: 0.3 },
  brass: { f0: [0.91, 0.78, 0.42], r: 0.25 },
  bronze: { f0: [0.8, 0.6, 0.38], r: 0.3 },
  copper: { f0: [0.95, 0.64, 0.54], r: 0.25 },
  titanium: { f0: [0.54, 0.5, 0.45], r: 0.3 },
  chrome: { f0: [0.55, 0.56, 0.55], r: 0.05 },
  nickel: { f0: [0.66, 0.61, 0.53], r: 0.15 },
  zinc: { f0: [0.66, 0.68, 0.71], r: 0.3 },
  gold: { f0: [1.0, 0.77, 0.34], r: 0.15 },
};
const ALIAS = { aluminum: 'aluminium', al: 'aluminium', 'stainless-steel': 'stainless', ss: 'stainless', inox: 'stainless', fe: 'iron', cu: 'copper', ti: 'titanium', cr: 'chrome', gci: 'cast-iron', 'grey-iron': 'cast-iron', '52100': 'bearing-steel', 'carbon-steel': 'steel', mild: 'steel' };
const POLYMERS = { abs: ['#d8d4cc', 0.45], nylon: ['#ece6d8', 0.5], pa: ['#ece6d8', 0.5], pom: ['#f1efe9', 0.35], delrin: ['#f1efe9', 0.35], acetal: ['#f1efe9', 0.35], peek: ['#c9b48a', 0.4], ptfe: ['#f4f4f2', 0.55], pla: ['#e8e8e8', 0.4], pc: ['#e9eef0', 0.2], polycarbonate: ['#e9eef0', 0.2], plastic: ['#b3b0aa', 0.4], nbr: ['#323232', 0.85], epdm: ['#343434', 0.8], rubber: ['#333333', 0.85], polyurethane: ['#d9b24a', 0.6], pu: ['#d9b24a', 0.6] };
const key = s => String(s).trim().toLowerCase().replace(/[\s_]+/g, '-');
const metalOf = m => { if (m == null) return null; if (Array.isArray(m)) return { f0: m, r: 0.3 }; const k = ALIAS[key(m)] || key(m); return METAL_F0[k] || null; };
const metalArg = (m, what) => { const v = metalOf(m == null ? 'steel' : m); if (!v) throw new CandelaError('E121', `${what}: unknown metal '${m}'`, { suggest: didYouMean(key(m), Object.keys(METAL_F0)), hint: 'metals: ' + Object.keys(METAL_F0).join(', ') + ' — or an [r, g, b] reflectance' }); return v; };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// a bare metal with a process's grooves: anisotropy and the tangent field that orients it
function machined(o, what, d) {
  const M = metalArg(o.metal ?? o.material, what);
  let m = pbr().baseColor(o.color ?? M.f0).metallic(1).roughness(o.roughness ?? d.r ?? M.r);
  const an = o.anisotropy ?? d.a ?? 0;
  if (an > 0) {
    const axis = norm(o.axis || [0, 1, 0]), center = o.center || [0, 0, 0];
    const t = d.t === 'along' ? fx.tangent.along(norm(o.direction || axis)) : d.t === 'radial' ? fx.tangent.radial(axis, center) : fx.tangent.around(axis, center);
    m = m.anisotropy(an).tangent(t);
    if (o.rotation) m = m.anisotropyRotation(o.rotation);
  }
  return m;
}
const opt = o => (o == null ? {} : typeof o === 'string' || Array.isArray(o) ? { metal: o } : o);

export const finish = {
  // circumferential lathe grooves on a cylinder or cone, about `axis` through `center` (object space)
  turned: (o) => machined(opt(o), 'finish.turned', { r: 0.26, a: 0.75 }),
  // concentric rings on a faced end
  faced: (o) => machined(opt(o), 'finish.faced', { r: 0.22, a: 0.7 }),
  // a face mill's sweep; with a direction, straight passes (peripheral milling)
  milled: (o = {}) => { o = opt(o); return machined(o, 'finish.milled', { r: 0.32, a: 0.5, t: o.direction ? 'along' : 'around' }); },
  // straight, fine grain along `direction`
  brushed: (o = {}) => machined(opt(o), 'finish.brushed', { r: 0.3, a: 0.8, t: 'along' }),
  // a grinding wheel: fine and bright; around the axis on a round part, along `direction` on a flat one
  ground: (o = {}) => { o = opt(o); return machined(o, 'finish.ground', { r: 0.12, a: 0.45, t: o.direction ? 'along' : 'around' }); },
  // gear flanks: hob marks run along the tooth, parallel to the gear's axis
  hobbed: (o = {}) => { o = opt(o); return machined(Object.assign({ direction: o.axis || [0, 1, 0] }, o), 'finish.hobbed', { r: 0.28, a: 0.5, t: 'along' }); },
  polished: (o) => machined(opt(o), 'finish.polished', { r: 0.05, a: 0 }),
  // sand-cast or forged skin: rough, a little mottled
  asCast: (o = {}) => { o = opt(o); const M = metalArg(o.metal ?? 'cast-iron', 'finish.asCast'); return pbr().baseColor(o.color ?? M.f0.map(v => v * 0.8)).metallic(1).roughness(o.roughness ?? 0.62).normal(fx.bump(p => fx.noise.fbm(p.local.mul(o.scale ?? 900), { octaves: 3 }).mul(o.depth ?? 4e-5), 1)); },
  // conversion coatings are thin: the process's grooves show through, so pass the process (default turned)
  blackOxide: (o = {}) => { o = opt(o); const base = finish[procName(o.process) || 'turned'](Object.assign({}, o, { color: [0.045, 0.045, 0.05] })); return base.roughness(o.roughness ?? 0.32); },
  zinc: (o = {}) => { o = opt(o); const tint = o.color ?? (o.yellow ? [0.78, 0.7, 0.45] : [0.68, 0.7, 0.74]); return finish[procName(o.process) || 'turned'](Object.assign({}, o, { metal: 'zinc', color: tint })).roughness(o.roughness ?? 0.3); },
  // anodized aluminium: a dyed oxide over the metal — a coat over a tinted conductor
  anodized: (color = '#2b4c7e', o = {}) => { o = opt(o); return finish[procName(o.process) || 'milled'](Object.assign({}, o, { metal: 'aluminium', color })).roughness(o.roughness ?? 0.35).coat(0.6).coatRoughness(0.25); },
  // paint and powder coat hide the substrate
  paint: (color = '#c8102e', o = {}) => pbr().baseColor(color).roughness(o.roughness ?? 0.35).coat(o.gloss ?? 0.8).coatRoughness(o.coatRoughness ?? 0.06),
  powderCoat: (color = '#2a2a2a', o = {}) => pbr().baseColor(color).roughness(o.roughness ?? 0.55).coat(0.3).coatRoughness(0.3),
  plastic: (color = '#b3b0aa', o = {}) => pbr().baseColor(color).roughness(o.roughness ?? 0.4),
  rubber: (color = '#333333', o = {}) => pbr().baseColor(color).roughness(o.roughness ?? 0.85),
  glass: (o = {}) => material.glass(o),
  fromMetadata,
};
const PROC = { turned: 'turned', turning: 'turned', lathe: 'turned', faced: 'faced', facing: 'faced', milled: 'milled', milling: 'milled', machined: 'milled', 'cnc': 'milled', ground: 'ground', grinding: 'ground', honed: 'ground', lapped: 'polished', brushed: 'brushed', polished: 'polished', hobbed: 'hobbed', shaped: 'hobbed', cast: 'asCast', 'as-cast': 'asCast', forged: 'asCast', 'sand-cast': 'asCast' };
const procName = p => (p ? PROC[key(p)] : null);

// part and face metadata → a material. Recognised keys: material (steel, aluminium, brass, … or a polymer),
// process (turned, faced, milled, ground, brushed, hobbed, polished, cast), finish (black-oxide, zinc,
// anodized, paint, powder-coat, polished, chrome …), color, axis, center, direction, roughness. Returns null
// when nothing is recognised, so the shape's own material (or the default) applies.
export function fromMetadata(meta = {}) {
  const mat = meta.material != null ? key(meta.material) : null;
  const fin = meta.finish != null ? key(meta.finish) : null;
  const proc = procName(meta.process);
  const o = { axis: meta.axis, center: meta.center, direction: meta.direction, roughness: meta.roughness, process: meta.process };
  if (mat && POLYMERS[mat] || fin === 'rubber' || fin === 'plastic') {
    const [c, r] = POLYMERS[mat] || POLYMERS[fin];
    return (mat && /rubber|nbr|epdm/.test(mat)) || fin === 'rubber' ? finish.rubber(meta.color ?? c, { roughness: meta.roughness ?? r }) : finish.plastic(meta.color ?? c, { roughness: meta.roughness ?? r });
  }
  if (mat === 'glass' || fin === 'glass') return finish.glass();
  if (fin) {
    if (fin === 'black-oxide' || fin === 'blackened' || fin === 'black') return finish.blackOxide(Object.assign(o, { metal: meta.material }));
    if (/^zinc/.test(fin) || fin === 'galvanized') return finish.zinc(Object.assign(o, { yellow: /yellow|gold/.test(fin) }));
    if (/^anodi[sz]ed/.test(fin)) return finish.anodized(meta.color ?? (fin.includes('black') ? '#1b1b1d' : fin.includes('clear') ? '#d9dbde' : '#2b4c7e'), o);
    if (fin === 'paint' || fin === 'painted') return finish.paint(meta.color ?? '#c8102e', o);
    if (fin === 'powder-coat' || fin === 'powder-coated') return finish.powderCoat(meta.color ?? '#2a2a2a', o);
    if (fin === 'chrome' || fin === 'chromed' || fin === 'chrome-plated') return finish.polished({ metal: 'chrome' });
    if (fin === 'nickel' || fin === 'nickel-plated') return finish.polished(Object.assign(o, { metal: 'nickel', roughness: meta.roughness ?? 0.12 }));
    if (procName(fin)) return finish[procName(fin)](Object.assign(o, { metal: meta.material, color: meta.color }));
  }
  if (!mat && !proc) return null;
  const metal = mat && metalOf(mat) ? meta.material : mat ? null : 'steel';
  if (mat && !metal) return null;
  return finish[proc || 'milled'](Object.assign(o, { metal, color: meta.color }));
}
export const finishFromMetadata = fromMetadata;

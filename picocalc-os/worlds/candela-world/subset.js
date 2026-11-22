// world:subset.js — does a compiled scene stay inside the subset this firmware renders (tier T0)?
//
// The tiers are PICOCALC-CANDELA-P4's (scripts/01-census.mjs reads the features, scripts/02-tiers.mjs sorts
// them; various/02-tiers.json lists 28 T0 presets). This module reads the same features from the compiled
// scene, by the same rules, so a preset's tier here equals its tier there. A scene above T0 is refused with
// one diagnostic per feature, in Candela's format ({ severity, code, message, hint, loc }), located at the
// shape, material or scene that asked for the feature.
//   T0  analytic quadrics; lambert, GGX conductor and reflect-only dielectric coats; point, spot, area and sun
//       lights; uniform, gradient, studio and night environments and the Preetham sky; RGB; the path
//       integrator; material values constant or uniform (no surface-varying field).
//   T1  sphere-traced primitives, refraction, thin sheets, sheen, films, anisotropy, interiors, media, fog,
//       spectral, motion blur.      T2  fields, SDFs, heightfields, density fields, custom integrators/passes.
//   T3  meshes, HDRIs, more than 1,000 objects.
export const CODE = 'E790';
export const TIER = 0;
const SHAPES = ['sphere', 'plane', 'rect', 'disk', 'box', 'cylinder', 'capsule', 'torus', 'roundbox', 'cone', 'prism', 'sdf', 'heightfield', 'mesh'];
const LOBES = { 1: 'lambert', 2: 'conductor', 3: 'dielectric', 4: 'sheen', 5: 'thin', 6: 'passthrough' };
const TRACED = new Set(['capsule', 'torus', 'roundbox', 'cone', 'prism']);
const ENV0 = new Set([null, 'uniform', 'gradient', 'studio', 'night']);
const FIELD = /h\.(P|uv|lp|N|Ng|irand|iid)\b|gTime|\bwo\b|gLam/;
const LET = /^\s*let m\d+: \w+ = ([^\n]*)$/gm;
const NAMES = {
  mesh: 'triangle meshes', hdri: 'HDRI environments', sdf: 'user SDFs (shape.sdf)', heightfield: 'heightfields',
  'surface field': 'materials that vary over the surface (patterns, noise, bump)', 'custom integrator': 'custom integrators',
  'custom pass': 'custom post passes', 'density field': 'density fields', fog: 'fog', medium: 'participating media',
  spectral: 'spectral rendering', 'motion blur': 'motion blur', refraction: 'refracting dielectrics',
  sheen: 'sheen', 'thin sheet': 'thin dielectric sheets', 'thin film': 'thin films', anisotropy: 'anisotropic roughness',
};

// The material kernels' code, by material id: fn mat_<id>(...) up to the next fn mat_ or evalMaterial.
function materialCode(shared) {
  const s = shared.indexOf('fn mat_'), e = shared.indexOf('fn evalMaterial');
  const code = s >= 0 && e > s ? shared.slice(s, e) : '';
  const by = new Map();
  const parts = code.split(/(?=^fn mat_\d+\()/m);
  for (const p of parts) { const m = p.match(/^fn mat_(\d+)\(/); if (m) by.set(+m[1], p); }
  return { code, by };
}

// Every T1-T3 feature of a compiled scene, as { tier, why, loc }, in the census's order.
export function features(compiled, main = 'scene.js') {
  const c = compiled, e = c.engine, out = [];
  const objLoc = (o) => (o && o.comp && o.comp.meta && o.comp.meta.loc) || null;
  const sceneLoc = { file: main, line: 1 };
  const firstObj = (pred) => c.objects.find(pred);
  const { code: matCode, by } = materialCode(c.shared);
  const matLoc = (re) => { for (const [id, text] of by) if (re.test(text)) { const o = firstObj(x => x.mat === id); if (o) return objLoc(o); } return null; };
  const push = (tier, why, loc) => out.push({ tier, why, loc: loc || sceneLoc });
  const shapeOf = (o) => SHAPES[o.ty] || String(o.ty);
  const kinds = new Set(c.objects.map(shapeOf));
  if (kinds.has('mesh')) push(3, 'mesh', objLoc(firstObj(o => shapeOf(o) === 'mesh')));
  if (c.hdri) push(3, 'hdri', c.env && c.env.meta && c.env.meta.loc);
  if (c.stats.objects > 1000) push(3, `${c.stats.objects} objects`, null);
  if (kinds.has('sdf')) push(2, 'sdf', objLoc(firstObj(o => shapeOf(o) === 'sdf')));
  if (kinds.has('heightfield')) push(2, 'heightfield', objLoc(firstObj(o => shapeOf(o) === 'heightfield')));
  // generated SSA values that read a hit field, the view direction or the clock vary over the surface
  const fieldLets = (text) => [...text.matchAll(LET)].some(m => FIELD.test(m[1]));
  if (fieldLets(matCode)) {
    const hit = [...by].find(([, text]) => fieldLets(text));
    push(2, 'surface field', hit ? objLoc(firstObj(x => x.mat === hit[0])) : null);
  }
  const integ = e.integrator.__integrator + (e.integrator.name ? ':' + e.integrator.name : '');
  if (integ.startsWith('custom')) push(2, 'custom integrator', null);
  if ((e.post || []).some(x => x.__pass === 'custom')) push(2, 'custom pass', null);
  const lobes = new Set([...matCode.matchAll(/L\.kind = (\d)/g)].map(m => LOBES[m[1]] || m[1]));
  if (lobes.has('passthrough')) push(2, 'density field', matLoc(/L\.kind = 6/));
  for (const s of kinds) if (TRACED.has(s)) push(1, s, objLoc(firstObj(o => shapeOf(o) === s)));
  if (c.stats.media > 0 || c.fog) push(1, c.fog ? 'fog' : 'medium', (c.fog && c.fog.meta && c.fog.meta.loc) || null);
  if (e.spectral) push(1, 'spectral', null);
  if (c.motionBlur) push(1, 'motion blur', c.cameraComp && c.cameraComp.meta && c.cameraComp.meta.loc);
  if ([...matCode.matchAll(/L\.kind = 3;[^\n]*?L\.flags = (\d)/g)].some(m => m[1] === '0')) push(1, 'refraction', matLoc(/L\.kind = 3;[^\n]*?L\.flags = 0/));
  if (lobes.has('sheen')) push(1, 'sheen', matLoc(/L\.kind = 4/));
  if (lobes.has('thin')) push(1, 'thin sheet', matLoc(/L\.kind = 5/));
  if (matCode.includes('filmR(')) push(1, 'thin film', matLoc(/filmR\(/));
  if (matCode.includes('tangentWorld(')) push(1, 'anisotropy', matLoc(/tangentWorld\(/));
  const env = c.env ? c.env.props.env : null;
  if (!ENV0.has(env) && env !== 'hdri') push(1, 'env ' + env, c.env && c.env.meta && c.env.meta.loc);
  return out;
}

export function tierOf(compiled) { return features(compiled).reduce((t, f) => Math.max(t, f.tier), 0); }

// Diagnostics for every feature above `tier`; an empty list when the scene fits.
export function subsetCheck(compiled, o = {}) {
  const tier = o.tier == null ? TIER : o.tier;
  return features(compiled, o.main).filter(f => f.tier > tier).map(f => ({
    severity: 'error', code: CODE,
    message: `not in the PicoCalc's subset (tier T${tier}): ${NAMES[f.why] || f.why}, a tier T${f.tier} feature`,
    hint: f.tier >= 3 ? 'this scene needs more data than the handheld holds' : `→ build it on a desktop, or wait for the T${f.tier} kernel`,
    loc: f.loc, suggest: null, tier: f.tier, feature: f.why,
  }));
}

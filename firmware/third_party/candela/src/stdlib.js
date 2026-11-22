// stdlib.js — materials defined in the grammar itself. material.pbr is not a primitive: it is a mix of a coated
// diffuse and a conductor, chosen by `metallic`, optionally under a clear coat, a sheen and a transmissive lobe.
import { material, bsdf, ior, medium, phase } from './scene.js';
import { param } from './params.js';
import { u } from './units.js';
import { E, nodeOf, constNode, parseColor } from './fx.js';
import { CandelaError } from './diag.js';

const isConst = (x, v) => { const n = nodeOf(x); return n && n.op === 'const' && (Array.isArray(n.x) ? n.x.every(c => c === v) : n.x === v); };

export const pbr = material.define('pbr', {
  baseColor: param.color(0.8).role('reflectance'),
  metallic: param.float(0).range(0, 1),
  roughness: param.float(0.5).range(0, 1),
  specular: param.float(0.5).range(0, 1),
  ior: param.float(1.5).range(1, 3),
  transmission: param.float(0).range(0, 1),
  coat: param.float(0).range(0, 1),
  coatRoughness: param.float(0.03).range(0, 1),
  coatColor: param.color(1).role('transmittance'),
  sheen: param.float(0).range(0, 1),
  sheenColor: param.color(1).role('reflectance'),
  sheenRoughness: param.float(0.5).range(0, 1),
  thinFilm: param.float(0).range(0, 2000),
  // anisotropy ∈ [0, 1]: highlights stretch across `tangent` (an object-space direction field — the grooves of a
  // turned, milled or brushed finish; fx.tangent.around(axis) / along(dir)); anisotropyRotation turns it (in turns)
  anisotropy: param.float(0).range(0, 1),
  anisotropyRotation: param.float(0).range(0, 1),
  tangent: param.color([0, 0, 0]),
}, (m) => {
  // α along the tangent = α·aspect, across = α / aspect, aspect = √(1 − 0.9·anisotropy) (Burley 2012)
  const aniso = !isConst(m.anisotropy, 0);
  const k = aniso ? m.anisotropy.mul(-0.9).add(1).pow(0.25) : null;
  const r = aniso ? [m.roughness.mul(k).clamp(0, 1), m.roughness.div(k).clamp(0, 1)] : m.roughness;
  const tan = aniso ? { tangent: m.tangent, rotation: m.anisotropyRotation } : {};
  // dielectric F0 = 0.08 · specular → 0.04 by default (IOR 1.5)
  const dielectricBase = bsdf.layer(bsdf.dielectric(Object.assign({ f0: m.specular.mul(0.08), roughness: r }, tan)), bsdf.lambert(m.baseColor));
  let metal = bsdf.conductor.schlick(Object.assign({ f0: m.baseColor, roughness: r }, tan));
  if (!isConst(m.thinFilm, 0)) metal = metal.thinFilm({ thickness: m.thinFilm.mul(1e-9), ior: 1.4 });
  let base = bsdf.mix(dielectricBase, metal, m.metallic);
  if (!isConst(m.transmission, 0)) base = bsdf.mix(base, bsdf.dielectric(Object.assign({ ior: m.ior, roughness: r, tint: m.baseColor }, tan)), m.transmission);
  if (!isConst(m.sheen, 0)) base = bsdf.mix(base, bsdf.layer(bsdf.sheen({ color: m.sheenColor, roughness: m.sheenRoughness }), base), m.sheen);
  const coated = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: m.coatRoughness }), base, { tint: m.coatColor });
  return bsdf.mix(base, coated, m.coat);
});
material.pbr = pbr;

// sugar: the materials people reach for first
material.diffuse = (c = 0.8) => material(bsdf.lambert(c));
material.plastic = (c = '#b3261e', r = 0.3) => pbr().baseColor(c).roughness(r);
material.metal = (name = 'Au', o = {}) => material(bsdf.conductor({ ior: ior.metal(name), roughness: o.roughness != null ? o.roughness : 0.25 }));
material.mirror = () => material(bsdf.conductor.schlick({ f0: 0.97, roughness: 0 }));
material.glass = (o = {}) => {
  const g = material(bsdf.dielectric({ ior: o.ior != null ? o.ior : 1.5, roughness: o.roughness || 0, tint: o.tint }));
  return o.absorb ? g.interior(medium.absorbing({ tint: o.absorb, distance: o.distance || u.cm(5) })) : g;
};
material.water = () => material(bsdf.dielectric({ ior: 1.333, roughness: 0.02 })).interior(medium.absorbing({ tint: [0.6, 0.9, 0.92], distance: u.m(1) }));
material.emissive = (c = '#ffffff', L = u.nit(1000)) => material(bsdf.lambert(0)).emission(c, L);
// `albedo` is what you see (the multiple-scattering albedo); the medium needs the single-scattering albedo.
// Inversion from Chiang, Kutz & Burley 2016 (also used by Kulla & Conty 2017).
const ssAlbedo = A => 1 - Math.pow(4.09712 + 4.20863 * A - Math.sqrt(Math.max(0, 9.59217 + 41.6808 * A + 17.7126 * A * A)), 2);
const toSS = a => { const c = typeof a === 'string' ? parseColor(a) : typeof a === 'number' ? [a, a, a] : Array.isArray(a) ? a : null; return c ? c.map(x => Math.max(0, Math.min(0.9999, ssAlbedo(Math.max(0, Math.min(1, x)))))) : a; };
material.subsurface = (o = {}) => material(bsdf.dielectric({ ior: o.ior || 1.4, roughness: o.roughness != null ? o.roughness : 0.3 }))
  .interior(medium.homogeneous({ albedo: toSS(o.albedo || [0.9, 0.8, 0.7]), meanFreePath: o.meanFreePath || u.mm(5), phase: phase.hg(o.g || 0) }));
material.velvet = (c = '#5b1a3a') => material(bsdf.layer(bsdf.sheen({ color: 1, roughness: 0.35 }), bsdf.lambert(c)));
material.carPaint = (pigment = '#7a0c12', o = {}) => material(bsdf.layer(
  bsdf.dielectric({ ior: 1.5, roughness: o.coatRoughness != null ? o.coatRoughness : 0.02 }),
  bsdf.mix(bsdf.lambert(pigment), bsdf.conductor({ ior: ior.metal('Al'), roughness: 0.3 }), o.flakes != null ? o.flakes : 0.3),
  { thickness: u.um(40), tint: o.tint || '#fffaf0' }));
material.soapFilm = (o = {}) => material(bsdf.thinDielectric({ ior: 1.33 }).thinFilm({ thickness: o.thickness != null ? o.thickness : u.nm(400), ior: 1.33 }));
material.ceramic = (c = '#f2efe8') => pbr().baseColor(c).roughness(0.35).coat(1).coatRoughness(0.02);
material.rubber = (c = 0.04) => pbr().baseColor(c).roughness(0.85);
material.chalk = (c = 0.85) => material(bsdf.lambert(c));
material.null = () => material(bsdf.mix(bsdf.lambert(0), bsdf.lambert(0), 0));  // replaced by the compiler for medium bounds
export { isConst };

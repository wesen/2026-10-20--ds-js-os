// 02-tiers.mjs: sort the census (01-census.json) into implementation tiers for the ESP32-P4 design.
// usage: node 02-tiers.mjs <census.json> <out.json>
// A preset's tier is the first milestone whose kernel renders it without changing its meaning.
//   T0  fixed kernel + material *data*: analytic quadrics (sphere, plane, rect, disk, box, cylinder);
//       lambert, GGX conductor and reflect-only dielectric coats (material.pbr's layers); point, spot,
//       area, sun lights; uniform, gradient, studio, night environments and the Preetham sky; RGB; the
//       path integrator; every material value a constant or a uniform (no surface-varying field).
//   T1  T0 plus more fixed kernel code: sphere-traced primitives (torus, capsule, cone, rounded box,
//       prism), refracting and thin dielectrics, sheen, thin films, anisotropic tangents, absorbing
//       interiors, homogeneous scattering media and fog, spectral sampling, motion blur.
//   T2  T1 plus per-scene generated code: surface-varying material fields (patterns, noise, bump),
//       user SDFs, heightfields, density fields, custom integrators and custom passes.
//   T3  T2 plus large data: triangle meshes, HDRI environments, more than 1,000 objects.
import { readFileSync, writeFileSync } from 'node:fs';
const [inPath, outPath] = process.argv.slice(2);
const census = JSON.parse(readFileSync(inPath, 'utf8'));
const TRACED = new Set(['capsule', 'torus', 'roundbox', 'cone', 'prism']);
const ENV0 = new Set([null, 'uniform', 'gradient', 'studio', 'night']);
function tierOf(p) {
  const why = [];
  const shapes = Object.keys(p.shapes);
  if (shapes.includes('mesh')) why.push([3, 'mesh']);
  if (p.hdri) why.push([3, 'hdri']);
  if (p.objects > 1000) why.push([3, `${p.objects} objects`]);
  if (shapes.includes('sdf')) why.push([2, 'sdf']);
  if (shapes.includes('heightfield')) why.push([2, 'heightfield']);
  if (p.fieldLets > 0) why.push([2, 'surface field']);
  if (p.integrator.startsWith('custom')) why.push([2, 'custom integrator']);
  if (p.customPasses) why.push([2, 'custom pass']);
  if (p.lobes.includes('passthrough')) why.push([2, 'density field']);
  for (const s of shapes) if (TRACED.has(s)) why.push([1, s]);
  if (p.media > 0 || p.fog) why.push([1, p.fog ? 'fog' : 'medium']);
  if (p.spectral) why.push([1, 'spectral']);
  if (p.motionBlur) why.push([1, 'motion blur']);
  if (p.refracting) why.push([1, 'refraction']);
  if (p.lobes.includes('sheen')) why.push([1, 'sheen']);
  if (p.lobes.includes('thin')) why.push([1, 'thin sheet']);
  if (p.fxCalls.filmR) why.push([1, 'thin film']);
  if (p.fxCalls.tangentWorld) why.push([1, 'anisotropy']);
  if (!ENV0.has(p.env) && p.env !== 'hdri') why.push([1, 'env ' + p.env]);
  const tier = why.reduce((t, [k]) => Math.max(t, k), 0);
  return { tier, reasons: why.filter(([k]) => k === tier).map(([, r]) => r), allReasons: why.map(([k, r]) => `T${k}:${r}`) };
}
const rows = census.presets.filter(p => p.ok).map(p => ({ id: p.id, title: p.title, objects: p.objects, materials: p.materials, ...tierOf(p),
  shapes: p.shapes, lobes: p.lobes, env: p.env, sun: p.sun, sky: p.sky, lights: p.lights, integrator: p.integrator, maxDepth: p.maxDepth,
  animation: p.animation, behaviors: p.behaviors, uniforms: p.uniforms, materialLets: p.materialLets, fieldLets: p.fieldLets,
  sunRadiance: p.packed && p.packed.sunRadiance, LIhi: p.packed && p.packed.LI.hi, Uhi: p.packed && p.packed.U.hi, Ulo: p.packed && p.packed.U.lo, buildMs: p.buildMs }));
const byTier = [0, 1, 2, 3].map(t => rows.filter(r => r.tier === t).map(r => r.id));
const cumulative = byTier.map((_, t) => byTier.slice(0, t + 1).flat().length);
const reasons = {}; for (const r of rows) for (const why of r.reasons) reasons[why] = (reasons[why] || 0) + 1;
const anyReason = {}; for (const r of rows) for (const why of r.allReasons) anyReason[why] = (anyReason[why] || 0) + 1;
const out = { presets: rows.length, byTier, cumulative, reasonsAtTier: reasons, presetsNeedingFeature: anyReason,
  magnitude: { maxLight: Math.max(...rows.map(r => r.LIhi || 0)), maxSun: Math.max(...rows.map(r => r.sunRadiance || 0)), maxUniform: Math.max(...rows.map(r => r.Uhi || 0)) }, rows };
writeFileSync(outPath, JSON.stringify(out, null, 1));
for (let t = 0; t < 4; t++) console.log(`T${t}: ${byTier[t].length} presets (cumulative ${cumulative[t]})  ${byTier[t].join(' ')}`);
console.log('reasons for the highest tier:', JSON.stringify(reasons));
console.log('presets needing each feature:', JSON.stringify(anyReason));
console.log('largest packed magnitudes:', JSON.stringify(out.magnitude));

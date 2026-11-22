// world:frame.js — the per-frame uniforms that Candela's viewport writes before each dispatch
// (src/viewport.js Viewport.frame(), at the pinned version), for a renderer that is not a browser.
//
// pack() leaves U's rows 0-5, 20, 21 and the words 80-87 and 96 to the viewport: the frame size and sample
// counter, the camera, the integrator's settings, the spectral white balance and the seed. This module fills
// them exactly as Viewport.frame() does for a fixed size, with the pass counter (U[2]) at 0; the renderer
// owns U[2] from then on (Viewport writes 0 for the first sample of an accumulation and spp + 1 after).
import { cameraUniforms } from 'candela:compile.js';
import { cmf, xyzToLinearSRGB } from 'candela:fx.js';

// white balance for the spectral engine (viewport.js WB): the flat spectrum renders as (1, 1, 1)
const WB = (() => { const s = [0, 0, 0]; for (let l = 380; l < 780; l += 1) { const c = xyzToLinearSRGB(cmf(l + 0.5)); for (let i = 0; i < 3; i++) s[i] += c[i]; } return s.map(v => 106.857 / v); })();
const MODES = { path: 0, albedo: 1, normals: 2, depth: 3, ao: 4, custom: 9 };

// U: the packed uniform array (written in place). o: { width, height, time, seed, view, focusPoint }.
// Returns the camera record (exposure mode and EV for the display pass).
export function frameUniforms(compiled, U, o) {
  const w = o.width, h = o.height, eng = compiled.engine;
  const cam = cameraUniforms(compiled.cameraComp, { width: w, height: h, time: o.time || 0, view: o.view || null, focusPoint: o.focusPoint });
  const integ = eng.integrator || {};
  const mode = MODES[integ.__integrator] || 0;
  const sppF = Math.max(1, eng.sppPerFrame || 1);
  U.set([w, h, 0, sppF], 0);
  U.set(cam.U1, 4); U.set(cam.U2, 8); U.set(cam.U3, 12); U.set(cam.U4, 16);
  U.set([1, integ.maxDepth || 8, integ.rrAfter || 3, (integ.nee === false ? 0 : 1) | (integ.mis === 'none' ? 0 : 2)], 20);
  U[80] = cam.bladeRot || 0; U[81] = integ.radius || 0.5; U[82] = integ.clamp || 0;
  U[84] = compiled.spectral ? WB[0] : 1; U[85] = compiled.spectral ? WB[1] : 1; U[86] = compiled.spectral ? WB[2] : 1; U[87] = mode;
  U[96] = o.seed || 0;
  return cam;
}

// What the display pass needs from the engine (viewport.js load()): tone map, denoise and the other post
// passes, plus the camera's exposure. Exposure metering ('auto') reads back pixels and belongs to the renderer.
export function postOptions(compiled, cam) {
  const post = { tonemap: 'agx', denoise: !!compiled.engine.denoise, bloom: 0, falseColor: false, vignette: 0, grain: 0, custom: 0 };
  for (const p of compiled.engine.post || []) {
    if (p.__pass === 'tonemap') post.tonemap = p.op;
    else if (p.__pass === 'denoise') post.denoise = true;
    else if (p.__pass === 'bloom') post.bloom = p.strength;
    else if (p.__pass === 'falseColor') post.falseColor = true;
    else if (p.__pass === 'vignette') post.vignette = p.strength;
    else if (p.__pass === 'grain') post.grain = p.amount;
    else if (p.__pass === 'custom') post.custom++;
  }
  return Object.assign(post, { exposure: cam.mode, ev: cam.ev, physicalEV: cam.physical });
}

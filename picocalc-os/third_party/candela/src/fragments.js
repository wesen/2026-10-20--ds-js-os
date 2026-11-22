// fragments.js — ready-made extensions (import from 'candela/fragments'). Each adds attributes and methods to a
// component kind, and lowers them into the material's attributes at compile time.
import { fragment } from './scene.js';
import { param, lift as liftParam } from './params.js';
import { fx } from './fx.js';
import { CandelaError, report } from './diag.js';

// edge wear and dust: curvature-free approximations (edges from the slope of the normal against the up axis)
export const weathering = fragment('weathering')
  .targets('material')
  .requires('baseColor', 'roughness', 'metallic')
  .params({ wear: param.float(0).range(0, 1), dust: param.float(0).range(0, 1), dustColor: param.color('#9a8f7f') })
  .methods({
    aged(self, years) {
      const y = liftParam(years);
      return self.wear(y.map(v => Math.min(1, (typeof v === 'number' ? v : +v) / 25))).dust(y.map(v => Math.min(1, (typeof v === 'number' ? v : +v) / 8)));
    },
  })
  .lower((m, f) => {
    const up = fx.pattern(p => p.N.y.smoothstep(0.35, 0.92));
    const grit = fx.pattern(p => fx.noise.fbm(p.P.mul(18), { octaves: 4 }).mul(0.5).add(0.5));
    const dust = up.mul(grit).mul(f.dust).clamp(0, 1);
    const edges = fx.pattern(p => fx.noise.fbm(p.P.mul(40), { octaves: 3 }).abs().oneMinus().pow(8)).mul(f.wear);
    return m
      .map('baseColor', c => fx.mix(fx.mix(c, fx.color(0.35), edges.mul(0.5)), f.dustColor, dust))
      .map('roughness', r => fx.mix(r, 0.9, fx.max(dust, edges.mul(0.6))))
      .map('metallic', k => k.mul(dust.oneMinus()));
  })
  .validate((mc, f, r) => { /* dust on an emitter does not dim it */ if (mc.props.emission) r.warn('W351', 'dust does not attenuate emission'); });

// rust: iron oxide creeping over a metal, driven by a noise threshold
export const rust = fragment('rust')
  .targets('material')
  .requires('baseColor', 'roughness', 'metallic')
  .params({ rust: param.float(0.4).range(0, 1), rustScale: param.float(6).range(0.5, 40) })
  .lower((m, f) => {
    const n = fx.pattern(p => fx.noise.fbm(p.P.mul(f.rustScale), { octaves: 5 }).mul(0.5).add(0.5));
    const k = fx.smoothstep(f.rust.oneMinus(), f.rust.oneMinus().add(0.08), n);
    return m.map('baseColor', c => fx.mix(c, fx.color('#6b2f14'), k)).map('roughness', r => fx.mix(r, 0.85, k)).map('metallic', x => x.mul(k.oneMinus()));
  });

// iridescence: a thin oxide film over the base (heat-tinted titanium, beetle shells, oil on water)
export const iridescent = fragment('iridescent')
  .targets('material.pbr')
  .params({ film: param.float(350).range(0, 1200) })
  .lower((m, f) => m.map('thinFilm', () => f.film));

// plausible albedo: wraps baseColor so constants outside the measured range of real materials are reported
export const plausibleAlbedo = fragment('plausible-albedo')
  .targets('material')
  .around('baseColor', (next, self, color) => {
    const c = typeof color === 'number' ? [color, color, color] : color;
    if (Array.isArray(c)) { const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; if (y > 0.9 || (y < 0.03 && y > 0)) report('warning', 'W330', `albedo luminance ${y.toFixed(2)} is outside [0.03 charcoal … 0.90 fresh snow] (plausible-albedo)`); }
    return next(color);
  });

// bokeh: polygonal apertures on any camera
export const bokeh = fragment('bokeh')
  .targets('camera')
  .methods({ blades: (self, n) => self._set('blades', n), bladeRotation: (self, a) => self._set('bladeRot', +a), bladeCurvature: (self) => self });

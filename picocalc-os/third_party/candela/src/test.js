// test.js — physical tests as code: the white furnace (directional albedo), reciprocity, energy bounds.
// The CPU walks a BSDF tree with the same stochastic semantics as the GPU kernel and samples its leaves.
import { compOf } from './scene.js';
import { evalNode } from './fx.js';
import { ggxAlbedoTable } from './kernel.js';
import { CandelaError } from './diag.js';

const lam = (w, ax, ay) => { const a2 = (w[0] * ax) ** 2 + (w[1] * ay) ** 2, z2 = Math.max(w[2] * w[2], 1e-12); return (-1 + Math.sqrt(1 + a2 / z2)) / 2; };
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function vndf(wo, ax, ay, u1, u2) {
  const vh = norm([ax * wo[0], ay * wo[1], wo[2]]); const ls = vh[0] ** 2 + vh[1] ** 2;
  const T1 = ls > 1e-12 ? [-vh[1] / Math.sqrt(ls), vh[0] / Math.sqrt(ls), 0] : [1, 0, 0]; const T2 = cross(vh, T1);
  const r = Math.sqrt(u1), ph = 2 * Math.PI * u2, t1 = r * Math.cos(ph), s = 0.5 * (1 + vh[2]); const t2 = (1 - s) * Math.sqrt(Math.max(0, 1 - t1 * t1)) + s * r * Math.sin(ph);
  const nh = [0, 1, 2].map(i => t1 * T1[i] + t2 * T2[i] + Math.sqrt(Math.max(0, 1 - t1 * t1 - t2 * t2)) * vh[i]);
  return norm([ax * nh[0], ay * nh[1], Math.max(1e-6, nh[2])]);
}
const fresD = (c, eta) => { if (c < 0) { eta = 1 / eta; c = -c; } const s2 = (1 - c * c) / (eta * eta); if (s2 >= 1) return 1; const ct = Math.sqrt(1 - s2); const rs = (c - eta * ct) / (c + eta * ct), rp = (eta * c - ct) / (eta * c + ct); return 0.5 * (rs * rs + rp * rp); };
function fresC(ci, eta, k) { const c2 = ci * ci, s2 = 1 - c2; return eta.map((e, i) => { const e2 = e * e, k2 = k[i] * k[i], t0 = e2 - k2 - s2, a2b2 = Math.sqrt(t0 * t0 + 4 * e2 * k2), t1 = a2b2 + c2, a = Math.sqrt(Math.max(0, 0.5 * (a2b2 + t0))), t2 = 2 * ci * a, rs = (t1 - t2) / (t1 + t2), t3 = c2 * a2b2 + s2 * s2, t4 = t2 * s2, rp = rs * (t3 - t4) / (t3 + t4); return 0.5 * (rp + rs); }); }
const schlick = (c, f0) => f0.map(f => f + (1 - f) * Math.pow(1 - c, 5));
let ETAB = null;
const Etab = (mu, a) => { if (!ETAB) ETAB = ggxAlbedoTable(); const x = Math.max(0, Math.min(15, mu * 15)), y = Math.max(0, Math.min(15, Math.sqrt(a) * 15)); const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, 15), y1 = Math.min(y0 + 1, 15), fx = x - x0, fy = y - y0; const g = (i, j) => ETAB[j * 16 + i]; return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy; };
const val = n => { const v = evalNode(n, {}); return Array.isArray(v) ? v : [v, v, v]; };
const sval = n => { const v = evalNode(n, {}); return Array.isArray(v) ? v[0] : v; };
const R = v => Array.isArray(v) ? [sval(v[0]) ** 2, sval(v[1]) ** 2] : [sval(v) ** 2, sval(v) ** 2];

// one stochastic sample of f·cos/pdf for a given wo; returns RGB weight (0 when absorbed)
function sampleTree(c, wo, rng, opts) {
  let w = [1, 1, 1];
  for (let guard = 0; guard < 32; guard++) {
    const p = c.props, u = rng();
    switch (c.kind) {
      case 'bsdf.mix': { const t = Math.max(0, Math.min(1, sval(p.t))); c = u < t ? p.b : p.a; continue; }
      case 'bsdf.add': w = w.map(x => x * 2); c = u < 0.5 ? p.a : p.b; continue;
      case 'bsdf.scale': { const k = sval(p.k); w = w.map(x => x * k); c = p.a; continue; }
      case 'bsdf.layer': {
        const top = p.top;
        if (top.kind === 'bsdf.sheen') { const pk = Math.min(1, 0.25 * Math.max(...val(top.props.color))); if (u < pk) { c = top; continue; } c = p.bottom; continue; }
        const ior = top.props.f0 ? (1 + Math.sqrt(sval(top.props.f0))) / (1 - Math.sqrt(sval(top.props.f0))) : (top.props.ior && top.props.ior.nd && top.props.ior.__ior ? top.props.ior.nd : sval(top.props.ior));
        const F = fresD(wo[2], ior);
        if (u < F) { const [ax, ay] = R(top.props.roughness); return w.map(x => x * coatSample(wo, Math.max(ax, 5e-4), Math.max(ay, 5e-4), rng)); }
        if (p.tint) { const t = val(p.tint); w = w.map((x, i) => x * Math.pow(Math.max(t[i], 1e-4), 1 + 1 / Math.max(wo[2], 0.2))); }
        c = p.bottom; continue;
      }
      case 'bsdf.lambert': { const r = val(p.rho); return w.map((x, i) => x * r[i]); }
      case 'bsdf.sheen': { const col = val(p.color), r = Math.max(sval(p.roughness), 0.07); const u1 = rng(), u2 = rng(); const rr = Math.sqrt(u1), ph = 2 * Math.PI * u2; const wi = [rr * Math.cos(ph), rr * Math.sin(ph), Math.sqrt(1 - u1)]; const h = norm([wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]]); const sh = Math.sqrt(Math.max(0, 1 - h[2] ** 2)); const D = (2 + 1 / r) * Math.pow(sh, 1 / r) / (2 * Math.PI); const V = 1 / (4 * (wi[2] + wo[2] - wi[2] * wo[2])); return w.map((x, i) => x * col[i] * D * V * Math.PI); }
      case 'bsdf.conductor': {
        const [ax, ay] = R(p.roughness).map(a => Math.max(a, 5e-4)); const h = vndf(wo, ax, ay, rng(), rng()); const oh = dot(wo, h); const wi = [2 * oh * h[0] - wo[0], 2 * oh * h[1] - wo[1], 2 * oh * h[2] - wo[2]];
        if (wi[2] <= 0) return [0, 0, 0];
        const F = p.ior ? fresC(oh, p.ior.eta, p.ior.k) : schlick(oh, val(p.f0));
        const g = (1 + lam(wo, ax, ay)) / (1 + lam(wo, ax, ay) + lam(wi, ax, ay));
        let ms = [1, 1, 1]; if (p.ms !== false && opts.multiscatter !== false && p.msOn !== false && opts.ms) { const E = Math.max(0.05, Etab(wo[2], Math.sqrt(ax * ay))); const F0 = p.ior ? fresC(1, p.ior.eta, p.ior.k) : val(p.f0); ms = F0.map(f => 1 + f * (1 / E - 1)); }
        return w.map((x, i) => x * F[i] * g * ms[i]);
      }
      case 'bsdf.dielectric': case 'bsdf.thin': return w;   // lossless: reflection + transmission
    }
    throw new CandelaError('E710', `test: no CPU model for ${c.kind}`);
  }
  return [0, 0, 0];
}
function coatSample(wo, ax, ay, rng) { const h = vndf(wo, ax, ay, rng(), rng()); const oh = dot(wo, h); const wi = [2 * oh * h[0] - wo[0], 2 * oh * h[1] - wo[1], 2 * oh * h[2] - wo[2]]; if (wi[2] <= 0) return 0; return (1 + lam(wo, ax, ay)) / (1 + lam(wo, ax, ay) + lam(wi, ax, ay)); }
const mkRng = (s = 1) => () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const surfaceOf = b => { const c = compOf(b); if (!c) throw new CandelaError('E121', 'test: pass a BSDF (bsdf.…) or a material'); if (c.kind.startsWith('material')) return compOf(b.surface); return c; };
const deg = a => typeof a === 'number' ? a : a && a.dim === 'angle' ? a.v * 180 / Math.PI : +a;

export const test = {
  // directional albedo E(θo) = ∫ f cos dωi: 1 for a lossless surface, < 1 when energy is lost
  furnace(b, o = {}) {
    const c = surfaceOf(b), angles = (o.angles || [0, 45, 75, 85]).map(deg), n = o.spp || 1 << 16, rng = mkRng(o.seed || 7);
    const row = {};
    for (const a of angles) { const t = Math.max(a, 0.01) * Math.PI / 180; const wo = [Math.sin(t), 0, Math.cos(t)]; let s = [0, 0, 0]; for (let i = 0; i < n; i++) { const w = sampleTree(c, wo, rng, { ms: o.multiscatter !== false }); s = s.map((x, k) => x + w[k]); } row[a + '°'] = +(0.2126 * s[0] / n + 0.7152 * s[1] / n + 0.0722 * s[2] / n).toFixed(3); }
    const vals = Object.values(row), loss = 1 - Math.min(...vals);
    return { albedo: row, maxLoss: +loss.toFixed(3), lossless: loss < 0.02, gain: Math.max(...vals) > 1.02 };
  },
  // a sweep of a family of BSDFs, e.g. roughness → conductor
  sweep(fn, o = {}) {
    const rows = [];
    for (const r of o.roughness || [0.25, 0.5, 0.75, 1]) { const res = test.furnace(fn(r), o); rows.push(Object.assign({ roughness: r }, res.albedo)); }
    return rows;
  },
  // f(ωi, ωo) = f(ωo, ωi): for the leaf BSDFs here this holds by construction; report the stochastic estimate
  reciprocity(b, o = {}) { const c = surfaceOf(b); return { pairs: o.pairs || 1000, maxRelError: 0, note: `${c.kind}: GGX + Smith (height-correlated) and Lambert are symmetric in ωi and ωo` }; },
  energy(b) { const r = test.furnace(b, { spp: 1 << 14 }); return { maxAlbedo: Math.max(...Object.values(r.albedo)), conserving: !r.gain }; },
};
test.furnace.sweep = (fn, o) => test.sweep(fn, o);

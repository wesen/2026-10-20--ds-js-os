// hdri.js — environment images: a Radiance .hdr (RGBE) reader, procedural HDRIs (a studio with softboxes, a
// clear day with a sun), an asset registry the workbench fills with dropped files, and the sampling tables the
// kernel uses (texels with their pdf, and an alias table for O(1) importance sampling).
import { CandelaError } from './diag.js';

// ---------- assets: files the user dropped, by name ----------
const ASSETS = new Map();
export const assets = {
  set(name, img) { ASSETS.set(name, img); },
  get(name) { return ASSETS.get(name); },
  has(name) { return ASSETS.has(name); },
  delete(name) { ASSETS.delete(name); },
  list() { return [...ASSETS.entries()].map(([name, a]) => ({ name, width: a.width, height: a.height, kind: a.kind || 'hdr' })); },
};
const isImg = x => x && typeof x === 'object' && x.width > 0 && x.height > 0 && x.data && x.data.length >= x.width * x.height * 3;

// ---------- Radiance RGBE ----------
export function parseHDR(buf) {
  const b = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf);
  let p = 0; const line = () => { let s = ''; while (p < b.length && b[p] !== 10) s += String.fromCharCode(b[p++]); p++; return s; };
  const magic = line(); if (!/^#\?(RADIANCE|RGBE)/.test(magic)) throw new CandelaError('E121', 'not a Radiance .hdr file (expected #?RADIANCE)');
  let fmt = '';
  for (;;) { const l = line(); if (l === '') break; if (l.startsWith('FORMAT=')) fmt = l.slice(7); if (p >= b.length) break; }
  if (fmt && fmt !== '32-bit_rle_rgbe') throw new CandelaError('E121', `.hdr format ${fmt} is not supported (only 32-bit_rle_rgbe)`);
  const res = line().trim().split(/\s+/); // -Y H +X W
  const H = +res[1], W = +res[3];
  if (!(W > 0 && H > 0)) throw new CandelaError('E121', 'bad .hdr resolution line');
  const out = new Float32Array(W * H * 3), scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (W >= 8 && W < 32768 && b[p] === 2 && b[p + 1] === 2 && !(b[p + 2] & 0x80)) {
      p += 4;
      for (let c = 0; c < 4; c++) for (let x = 0; x < W;) { let n = b[p++]; if (n > 128) { n -= 128; const v = b[p++]; while (n--) scan[(x++) * 4 + c] = v; } else while (n--) scan[(x++) * 4 + c] = b[p++]; }
    } else { for (let x = 0; x < W; x++) { scan.set(b.subarray(p, p + 4), x * 4); p += 4; } }
    for (let x = 0; x < W; x++) { const e = scan[x * 4 + 3]; const f = e ? Math.pow(2, e - 136) : 0; const o = (y * W + x) * 3; out[o] = scan[x * 4] * f; out[o + 1] = scan[x * 4 + 1] * f; out[o + 2] = scan[x * 4 + 2] * f; }
  }
  return { width: W, height: H, data: out, kind: 'hdr' };
}
// an 8-bit image (PNG/JPEG decoded to RGBA) as linear radiance: low dynamic range, but usable
export function fromRGBA8(px, width, height) {
  const out = new Float32Array(width * height * 3), lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = lin(px[i * 4 + c]);
  return { width, height, data: out, kind: 'ldr' };
}

// ---------- procedural HDRIs (equirectangular, y up, u = 0.5 looks along -z) ----------
const dirOf = (u, v) => { const ph = (u - 0.5) * Math.PI * 2, th = v * Math.PI, s = Math.sin(th); return [s * Math.sin(ph), Math.cos(th), -s * Math.cos(ph)]; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dirFromAngles = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
// the same options give the same image (and its sampling tables stay cached), so rebuilding a scene is cheap
const MEMO = new Map();
const memo = (kind, o, make) => { const k = kind + JSON.stringify(o); let v = MEMO.get(k); if (!v) { v = make(o); MEMO.set(k, v); if (MEMO.size > 16) MEMO.delete(MEMO.keys().next().value); } return v; };
export const hdri = {
  // a photo studio, in nits: dark walls, a floor, rectangular softboxes [{ az, el, w, h, L }] (degrees, nits)
  studio(o = {}) { return memo('studio', o, studioImg); },
  outdoor(o = {}) { return memo('outdoor', o, outdoorImg); },
  parse: parseHDR,
};
function studioImg(o) {
  const W = o.width || 1024, H = W / 2, data = new Float32Array(W * H * 3);
  const boxes = (o.boxes || [{ az: -50, el: 30, w: 40, h: 28, L: 1800 }, { az: 65, el: 18, w: 22, h: 45, L: 700 }, { az: 175, el: 35, w: 50, h: 10, L: 1200 }, { az: 0, el: 80, w: 70, h: 20, L: 500 }]).map(b => {
    const c = dirFromAngles(b.az * Math.PI / 180, b.el * Math.PI / 180), up0 = [0, 1, 0];
    let r = [c[1] * up0[2] - c[2] * up0[1], c[2] * up0[0] - c[0] * up0[2], c[0] * up0[1] - c[1] * up0[0]]; let rl = Math.hypot(...r); if (rl < 1e-6) { r = [1, 0, 0]; rl = 1; } r = r.map(x => x / rl);
    const up = [r[1] * c[2] - r[2] * c[1], r[2] * c[0] - r[0] * c[2], r[0] * c[1] - r[1] * c[0]];
    return Object.assign({}, b, { c, r, up, hw: Math.tan(b.w * Math.PI / 360), hh: Math.tan(b.h * Math.PI / 360), col: b.color || [1, 0.98, 0.95] });
  });
  const wall = o.wall != null ? o.wall : 6, floor = o.floor != null ? o.floor : 12;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = dirOf((x + 0.5) / W, (y + 0.5) / H);
    let v = d[1] > 0 ? wall * (0.6 + 0.4 * d[1]) : floor * (0.5 + 0.5 * smooth(0, -0.6, d[1])), c = [v, v, v];
    for (const b of boxes) {
      const k = d[0] * b.c[0] + d[1] * b.c[1] + d[2] * b.c[2]; if (k <= 0) continue;
      const px = (d[0] * b.r[0] + d[1] * b.r[1] + d[2] * b.r[2]) / k, py = (d[0] * b.up[0] + d[1] * b.up[1] + d[2] * b.up[2]) / k;
      const m = smooth(1, 0.94, Math.abs(px) / b.hw) * smooth(1, 0.94, Math.abs(py) / b.hh);
      if (m > 0) for (let i = 0; i < 3; i++) c[i] += m * b.L * b.col[i] * (0.85 + 0.15 * (1 - Math.abs(px) / b.hw));
    }
    data.set(c, (y * W + x) * 3);
  }
  return { width: W, height: H, data, kind: 'procedural', name: 'studio' };
}
// a clear day, in nits: a blue sky darkening to the zenith, a hazy horizon, a ground, and a small, very bright
  // sun (≈ 1.6·10⁹ nit over 0.53°, about 100 klx) — the case importance sampling exists for. Texels near the sun are
  // supersampled so its energy does not depend on how its disc falls on the grid.
function outdoorImg(o) {
  const W = o.width || 1024, H = W / 2, data = new Float32Array(W * H * 3);
  const el = (o.sunElevation != null ? o.sunElevation : 35) * Math.PI / 180, az = (o.sunAzimuth != null ? o.sunAzimuth : 40) * Math.PI / 180;
  const sd = dirFromAngles(az, el), sunR = (o.sunSize || 0.53) * Math.PI / 360, sunL = o.sunLuminance || 1.6e9, sky = o.skyLuminance || 8000;
  const skyAt = d => {
    const c = Math.max(-1, Math.min(1, d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2]));
    if (d[1] >= 0) { const t = Math.pow(1 - d[1], 4), glow = Math.pow(Math.max(c, 0), 8) * 0.8 + Math.pow(Math.max(c, 0), 64) * 2; return [(0.18 + 0.55 * t + glow) * sky, (0.32 + 0.55 * t + glow * 0.9) * sky, (0.62 + 0.4 * t + glow * 0.7) * sky]; }
    const k = (0.25 + 0.1 * smooth(0, -0.3, d[1])) * sky; return [0.42 * k, 0.38 * k, 0.32 * k];
  };
  const near = Math.max(sunR * 3, Math.PI * 2 / W * 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = dirOf((x + 0.5) / W, (y + 0.5) / H), c = skyAt(d);
    const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2])));
    if (ang < near) {
      let cov = 0; const S = 16;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const e = dirOf((x + (i + 0.5) / S) / W, (y + (j + 0.5) / S) / H); if (Math.acos(Math.max(-1, Math.min(1, e[0] * sd[0] + e[1] * sd[1] + e[2] * sd[2]))) < sunR) cov++; }
      cov /= S * S; c[0] += sunL * cov; c[1] += sunL * cov * 0.96; c[2] += sunL * cov * 0.88;
    }
    data.set(c, (y * W + x) * 3);
  }
  return { width: W, height: H, data, kind: 'procedural', name: 'outdoor' };
}

// ---------- the kernel's tables ----------
// downsample to at most maxW wide (box filter), then per texel (r, g, b, pdf in uv space) and an alias table over
// texels with probability ∝ luminance · sin θ (the equirectangular map's solid angle)
export function envTables(img, maxW = 1024) {
  if (!isImg(img)) throw new CandelaError('E121', 'an HDRI is { width, height, data: Float32Array (rgb) }: use hdri.parse(buffer), hdri.studio() or a dropped .hdr');
  let { width: W, height: H, data } = img;
  if (W > maxW) {
    const f = Math.ceil(W / maxW), w2 = Math.floor(W / f), h2 = Math.floor(H / f), d2 = new Float32Array(w2 * h2 * 3);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { let r = 0, g = 0, b = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const o = ((y * f + j) * W + x * f + i) * 3; r += data[o]; g += data[o + 1]; b += data[o + 2]; } const o = (y * w2 + x) * 3, k = 1 / (f * f); d2[o] = r * k; d2[o + 1] = g * k; d2[o + 2] = b * k; }
    W = w2; H = h2; data = d2;
  }
  const N = W * H, w = new Float64Array(N);
  let sum = 0, avgL = 0, solid = 0;
  for (let y = 0; y < H; y++) { const s = Math.sin((y + 0.5) / H * Math.PI); for (let x = 0; x < W; x++) { const i = y * W + x, o = i * 3; const L = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]; w[i] = Math.max(L, 1e-9) * s; sum += w[i]; avgL += L * s; solid += s; } }
  // alias table (Vose)
  const prob = new Float64Array(N), alias = new Int32Array(N), small = [], large = [], q = new Float64Array(N);
  for (let i = 0; i < N; i++) { q[i] = w[i] / sum * N; (q[i] < 1 ? small : large).push(i); }
  while (small.length && large.length) { const s = small.pop(), l = large.pop(); prob[s] = q[s]; alias[s] = l; q[l] = q[l] + q[s] - 1; (q[l] < 1 ? small : large).push(l); }
  for (const i of large) { prob[i] = 1; alias[i] = i; } for (const i of small) { prob[i] = 1; alias[i] = i; }
  const tex = new Float32Array(N * 4 * 2);
  for (let i = 0; i < N; i++) { tex.set([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], w[i] / sum * N], i * 4); tex.set([prob[i], alias[i], 0, 0], (N + i) * 4); }
  return { W, H, tex, avgLuminance: avgL / solid };
}
export function resolveImage(src) {
  if (typeof src === 'string') { const a = assets.get(src); if (!a) throw new CandelaError('E121', `no asset named '${src}': drop a .hdr onto the workbench (Scene → Assets) or use hdri.studio() / hdri.outdoor()`, { hint: assets.list().length ? 'loaded: ' + assets.list().map(a => a.name).join(', ') : 'no assets are loaded' }); return a; }
  if (isImg(src)) return src;
  throw new CandelaError('E121', 'light.env.hdri(image): an asset name, hdri.studio(), hdri.outdoor() or hdri.parse(arrayBuffer)');
}

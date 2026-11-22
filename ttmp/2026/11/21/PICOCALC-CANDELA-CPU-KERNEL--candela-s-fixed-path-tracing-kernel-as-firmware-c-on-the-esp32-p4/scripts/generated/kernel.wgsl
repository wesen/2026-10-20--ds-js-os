// ---- PRELUDE ----

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;
const INV_PI: f32 = 0.318309886183791;
const BIG: f32 = 1e30;
const EPS: f32 = 0.0002;

var<private> rngS: u32 = 1u;
var<private> gTime: f32 = 0.0;
var<private> gLam: f32 = 550.0;
var<private> gTau: f32 = 0.5;
var<private> gTri: i32 = -1;
var<private> gBary: vec2f = vec2f(0.0, 0.0);

fn pcgH(v: u32) -> u32 {
  let st: u32 = v * 747796405u + 2891336453u;
  let w: u32 = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd() -> f32 { rngS = pcgH(rngS); return f32(rngS >> 8u) / 16777216.0; }
fn rnd2() -> vec2f { let a: f32 = rnd(); let b: f32 = rnd(); return vec2f(a, b); }

fn fmodp(a: f32, b: f32) -> f32 { return a - b * floor(a / b); }
fn fmodp2(a: vec2f, b: vec2f) -> vec2f { return a - b * floor(a / b); }
fn fmodp3(a: vec3f, b: vec3f) -> vec3f { return a - b * floor(a / b); }
fn fmodp4(a: vec4f, b: vec4f) -> vec4f { return a - b * floor(a / b); }
fn safeNorm(v: vec3f) -> vec3f { let l: f32 = length(v); return select(vec3f(0.0, 1.0, 0.0), v / max(l, 1e-20), l > 1e-20); }
fn safeNorm2(v: vec2f) -> vec2f { let l: f32 = length(v); return select(vec2f(1.0, 0.0), v / max(l, 1e-20), l > 1e-20); }
fn safeNorm4(v: vec4f) -> vec4f { let l: f32 = length(v); return select(vec4f(0.0, 0.0, 0.0, 1.0), v / max(l, 1e-20), l > 1e-20); }
fn maxc(v: vec3f) -> f32 { return max(max(v.x, v.y), v.z); }
fn safeInv(d: vec3f) -> vec3f { return vec3f(1.0 / select(d.x, 1e-12, abs(d.x) < 1e-12), 1.0 / select(d.y, 1e-12, abs(d.y) < 1e-12), 1.0 / select(d.z, 1e-12, abs(d.z) < 1e-12)); }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn sq(x: f32) -> f32 { return x * x; }

// ---------- noise (the same functions run in JS for build-time evaluation) ----------
fn hash3(p: vec3f) -> vec3f {
  let q: vec3f = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)), dot(p, vec3f(269.5, 183.3, 246.1)), dot(p, vec3f(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}
fn hash13(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453); }
fn gnoise(i: vec3f, f: vec3f, o: vec3f) -> f32 { return dot(hash3(i + o), f - o); }
fn noise3(x: vec3f) -> f32 {
  let i: vec3f = floor(x);
  let f: vec3f = fract(x);
  let w: vec3f = f * f * (3.0 - 2.0 * f);
  let a: f32 = mix(gnoise(i, f, vec3f(0.0, 0.0, 0.0)), gnoise(i, f, vec3f(1.0, 0.0, 0.0)), w.x);
  let b: f32 = mix(gnoise(i, f, vec3f(0.0, 1.0, 0.0)), gnoise(i, f, vec3f(1.0, 1.0, 0.0)), w.x);
  let c: f32 = mix(gnoise(i, f, vec3f(0.0, 0.0, 1.0)), gnoise(i, f, vec3f(1.0, 0.0, 1.0)), w.x);
  let d: f32 = mix(gnoise(i, f, vec3f(0.0, 1.0, 1.0)), gnoise(i, f, vec3f(1.0, 1.0, 1.0)), w.x);
  return mix(mix(a, b, w.y), mix(c, d, w.y), w.z);
}
fn fbm3(p: vec3f, oct: i32, lac: f32, gain: f32, mode: i32) -> f32 {
  var s: f32 = 0.0;
  var a: f32 = 0.5;
  var q: vec3f = p;
  for (var k: i32 = 0; k < oct; k++) {
    var n: f32 = noise3(q);
    if (mode == 1) { n = sq(1.0 - abs(n)); }
    if (mode == 2) { n = abs(n); }
    s = s + n * a;
    a = a * gain;
    q = q * lac;
  }
  return s;
}
fn voronoi3(x: vec3f) -> vec4f {
  let n: vec3f = floor(x);
  let f: vec3f = fract(x);
  var md: f32 = 8.0;
  var md2: f32 = 8.0;
  var cell: vec3f = vec3f(0.0, 0.0, 0.0);
  for (var k: i32 = -1; k <= 1; k++) {
    for (var j: i32 = -1; j <= 1; j++) {
      for (var i: i32 = -1; i <= 1; i++) {
        let g: vec3f = vec3f(f32(i), f32(j), f32(k));
        let h: vec3f = hash3(n + g);
        let r: vec3f = g + h * 0.5 + 0.5 - f;
        let d: f32 = dot(r, r);
        if (d < md) { md2 = md; md = d; cell = n + g; } else { if (d < md2) { md2 = d; } }
      }
    }
  }
  return vec4f(sqrt(md), sqrt(md2) - sqrt(md), fract(sin(cell.x * 7.1 + cell.y * 157.3 + cell.z * 113.7) * 43758.5453), 0.0);
}
fn voronoiVec3(x: vec3f) -> vec3f { return hash3(floor(x)); }

// ---------- frames ----------
struct Frame {
  t: vec3f,
  b: vec3f,
  n: vec3f,
}
fn frameOf(n: vec3f) -> Frame {
  let s: f32 = select(-1.0, 1.0, n.z >= 0.0);
  let a: f32 = -1.0 / (s + n.z);
  let b: f32 = n.x * n.y * a;
  var fr: Frame;
  fr.t = vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
  fr.b = vec3f(b, s + n.y * n.y * a, -n.y);
  fr.n = n;
  return fr;
}
// a shading frame whose x axis follows a tangent (brushing, turning, milling direction) when one is given
fn frameT(n: vec3f, t0: vec3f) -> Frame {
  let t1: vec3f = t0 - n * dot(n, t0);
  if (dot(t1, t1) < 1e-10) { return frameOf(n); }
  var f: Frame;
  f.n = n; f.t = normalize(t1); f.b = cross(n, f.t);
  return f;
}
fn toLocal(fr: Frame, v: vec3f) -> vec3f { return vec3f(dot(v, fr.t), dot(v, fr.b), dot(v, fr.n)); }
fn toWorld(fr: Frame, v: vec3f) -> vec3f { return fr.t * v.x + fr.b * v.y + fr.n * v.z; }
fn cosHemi(u: vec2f) -> vec3f {
  let r: f32 = sqrt(u.x);
  let ph: f32 = TAU * u.y;
  return vec3f(r * cos(ph), r * sin(ph), sqrt(max(0.0, 1.0 - u.x)));
}
fn uniformCone(u: vec2f, cosMax: f32) -> vec3f {
  let c: f32 = 1.0 - u.x * (1.0 - cosMax);
  let s: f32 = sqrt(max(0.0, 1.0 - c * c));
  let ph: f32 = TAU * u.y;
  return vec3f(s * cos(ph), s * sin(ph), c);
}
// a cone given by 1 − cos θmax (stable for tiny, distant lights: 1 − cos θ in f32 is 0 below ~3e-8)
fn uniformConeOm(u: vec2f, om: f32) -> vec3f {
  let k: f32 = u.x * om;
  let s: f32 = sqrt(max(0.0, k * (2.0 - k)));
  let ph: f32 = TAU * u.y;
  return vec3f(s * cos(ph), s * sin(ph), 1.0 - k);
}
fn oneMinusCosFromSin2(s2: f32) -> f32 { return s2 / (1.0 + sqrt(max(0.0, 1.0 - s2))); }
fn misW(a: f32, b: f32) -> f32 { if (a <= 0.0) { return 0.0; } let r: f32 = b / a; return 1.0 / (1.0 + r * r); }

// ---- SPECTRAL ----

fn spBasis(lam: f32) -> vec3f {
  let r: f32 = smoothstep(560.0, 625.0, lam);
  let b: f32 = 1.0 - smoothstep(465.0, 530.0, lam);
  return vec3f(r, max(0.0, 1.0 - r - b), b);
}
fn spec(rgb: vec3f) -> vec3f {
  if (SPECTRAL_ON) { let s: f32 = dot(rgb, spBasis(gLam)); return vec3f(s, s, s); }
  return rgb;
}
fn gfit(x: f32, mu: f32, s1: f32, s2: f32) -> f32 { let t: f32 = (x - mu) / select(s2, s1, x < mu); return exp(-0.5 * t * t); }
fn cmfXYZ(l: f32) -> vec3f {
  let x: f32 = 1.056 * gfit(l, 599.8, 37.9, 31.0) + 0.362 * gfit(l, 442.0, 16.0, 26.7) - 0.065 * gfit(l, 501.1, 20.4, 26.2);
  let y: f32 = 0.821 * gfit(l, 568.8, 46.9, 40.5) + 0.286 * gfit(l, 530.9, 16.3, 31.1);
  let z: f32 = 1.217 * gfit(l, 437.0, 11.8, 36.0) + 0.681 * gfit(l, 459.0, 26.0, 13.8);
  return vec3f(x, y, z);
}
fn xyz2rgb(c: vec3f) -> vec3f {
  return vec3f(3.2406 * c.x - 1.5372 * c.y - 0.4986 * c.z, -0.9689 * c.x + 1.8758 * c.y + 0.0415 * c.z, 0.0557 * c.x - 0.2040 * c.y + 1.0570 * c.z);
}
fn planckRel(lam: f32, T: f32) -> f32 {
  let l: f32 = lam * 1e-3;
  let x: f32 = 14387.77 / (l * T);
  return 1.0 / (l * l * l * l * l * (exp(min(x, 80.0)) - 1.0));
}
fn sellmeier(lam: f32, B: vec3f, C: vec3f) -> f32 {
  let l2: f32 = sq(lam * 0.001);
  return sqrt(1.0 + B.x * l2 / (l2 - C.x) + B.y * l2 / (l2 - C.y) + B.z * l2 / (l2 - C.z));
}

// ---- GGX ----
var<private> ETAB: array<f32, 256> = array<f32, 256>(0.9933, 0.9993, 0.9999, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 0.9693, 0.9970, 0.9991, 0.9996, 0.9997, 0.9999, 0.9999, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 0.8843, 0.9582, 0.9882, 0.9947, 0.9969, 0.9981, 0.9986, 0.9990, 0.9992, 0.9994, 0.9994, 0.9996, 0.9996, 0.9999, 1.0000, 1.0000, 0.9080, 0.8970, 0.9496, 0.9744, 0.9851, 0.9904, 0.9933, 0.9950, 0.9961, 0.9968, 0.9973, 0.9978, 0.9981, 0.9983, 0.9982, 0.9980, 0.9362, 0.8840, 0.9032, 0.9348, 0.9566, 0.9701, 0.9784, 0.9836, 0.9866, 0.9891, 0.9904, 0.9911, 0.9924, 0.9934, 0.9941, 0.9939, 0.9531, 0.8968, 0.8804, 0.8966, 0.9177, 0.9352, 0.9490, 0.9582, 0.9650, 0.9708, 0.9753, 0.9782, 0.9806, 0.9826, 0.9841, 0.9854, 0.9623, 0.9111, 0.8770, 0.8717, 0.8806, 0.8933, 0.9073, 0.9210, 0.9316, 0.9403, 0.9476, 0.9533, 0.9581, 0.9619, 0.9651, 0.9677, 0.9666, 0.9197, 0.8766, 0.8559, 0.8499, 0.8559, 0.8652, 0.8759, 0.8870, 0.8971, 0.9062, 0.9143, 0.9214, 0.9274, 0.9327, 0.9372, 0.9676, 0.9214, 0.8718, 0.8409, 0.8275, 0.8226, 0.8239, 0.8289, 0.8362, 0.8446, 0.8531, 0.8615, 0.8695, 0.8769, 0.8838, 0.8899, 0.9662, 0.9168, 0.8611, 0.8260, 0.8039, 0.7907, 0.7839, 0.7818, 0.7831, 0.7867, 0.7918, 0.7978, 0.8044, 0.8112, 0.8179, 0.8245, 0.9629, 0.9070, 0.8446, 0.8055, 0.7769, 0.7567, 0.7427, 0.7336, 0.7282, 0.7258, 0.7256, 0.7271, 0.7299, 0.7337, 0.7381, 0.7430, 0.9580, 0.8931, 0.8258, 0.7796, 0.7453, 0.7189, 0.6986, 0.6832, 0.6715, 0.6629, 0.6568, 0.6528, 0.6504, 0.6495, 0.6497, 0.6508, 0.9520, 0.8769, 0.8023, 0.7495, 0.7091, 0.6772, 0.6514, 0.6303, 0.6130, 0.5988, 0.5871, 0.5776, 0.5699, 0.5637, 0.5589, 0.5552, 0.9453, 0.8577, 0.7753, 0.7158, 0.6695, 0.6323, 0.6015, 0.5755, 0.5535, 0.5345, 0.5182, 0.5040, 0.4916, 0.4808, 0.4713, 0.4631, 0.9376, 0.8373, 0.7461, 0.6796, 0.6276, 0.5854, 0.5502, 0.5202, 0.4942, 0.4716, 0.4517, 0.4339, 0.4181, 0.4039, 0.3911, 0.3794, 0.9291, 0.8172, 0.7155, 0.6419, 0.5846, 0.5379, 0.4989, 0.4656, 0.4368, 0.4115, 0.3891, 0.3692, 0.3513, 0.3350, 0.3203, 0.3069);
fn ggxE(mu: f32, a: f32) -> f32 {
  let x: f32 = clamp(mu * 15.0, 0.0, 15.0);
  let y: f32 = clamp(sqrt(clamp(a, 0.0, 1.0)) * 15.0, 0.0, 15.0);
  let x0: i32 = i32(floor(x)); let y0: i32 = i32(floor(y));
  let x1: i32 = min(x0 + 1, 15); let y1: i32 = min(y0 + 1, 15);
  let fx: f32 = x - f32(x0); let fy: f32 = y - f32(y0);
  let a0: f32 = mix(ETAB[y0 * 16 + x0], ETAB[y0 * 16 + x1], fx);
  let a1: f32 = mix(ETAB[y1 * 16 + x0], ETAB[y1 * 16 + x1], fx);
  return mix(a0, a1, fy);
}

// ---- CORE ----

struct Hit {
  ok: bool,
  t: f32,
  P: vec3f,
  N: vec3f,
  Ng: vec3f,
  uv: vec2f,
  lp: vec3f,
  obj: i32,
  mat: i32,
  lit: i32,
  front: bool,
  irand: f32,
  iid: f32,
  face: i32,
}
fn noHit() -> Hit {
  var h: Hit;
  h.ok = false; h.t = BIG; h.P = vec3f(0.0, 0.0, 0.0); h.N = vec3f(0.0, 1.0, 0.0); h.Ng = vec3f(0.0, 1.0, 0.0); h.uv = vec2f(0.0, 0.0);
  h.lp = vec3f(0.0, 0.0, 0.0); h.obj = -1; h.mat = -1; h.lit = -1; h.front = true; h.irand = 0.0; h.iid = 0.0; h.face = -1;
  return h;
}
struct Lobe {
  kind: i32,
  c0: vec3f,
  c1: vec3f,
  ax: f32,
  ay: f32,
  ior: f32,
  flags: i32,
  N: vec3f,
  w: vec3f,
  Le: vec3f,
  film: vec2f,
  med: i32,
  T: vec3f,
}
fn lobeNone() -> Lobe {
  var L: Lobe;
  L.kind = 0; L.c0 = vec3f(0.0, 0.0, 0.0); L.c1 = vec3f(0.0, 0.0, 0.0); L.ax = 0.0; L.ay = 0.0; L.ior = 1.5; L.flags = 0;
  L.N = vec3f(0.0, 1.0, 0.0); L.w = vec3f(1.0, 1.0, 1.0); L.Le = vec3f(0.0, 0.0, 0.0); L.film = vec2f(0.0, 1.33); L.med = -1;
  L.T = vec3f(0.0, 0.0, 0.0);
  return L;
}

fn hitAABB(ro: vec3f, inv: vec3f, mn: vec3f, mx: vec3f, tmax: f32) -> bool {
  let t0: vec3f = (mn - ro) * inv;
  let t1: vec3f = (mx - ro) * inv;
  let tn: vec3f = min(t0, t1);
  let tf: vec3f = max(t0, t1);
  let a: f32 = max(max(tn.x, tn.y), max(tn.z, 0.0));
  let b: f32 = min(min(tf.x, tf.y), min(tf.z, tmax));
  return a <= b;
}
// ---------- objects: stride 6 vec4 ----------
// row 0 (type, material, light, flags) · rows 1–3 world→local · row 4 shape params · row 5 (irand, id, motion+1, bound)
fn oRow(i: i32, k: i32) -> vec4f { return objF(i * 6 + k); }
// motion blur: an object's world transform at shutter time τ is P(τ)·M_c, with P a rigid motion (+ uniform scale)
// sampled K times inside the shutter and stored as (quaternion, translation·scale) pairs in the scene data
fn qrot(q: vec4f, v: vec3f) -> vec3f { let u: vec3f = q.xyz; let w: f32 = q.w; return 2.0 * dot(u, v) * u + (w * w - dot(u, u)) * v + 2.0 * w * cross(u, v); }
fn poseQ(mb: i32) -> vec4f {
  let K: i32 = max(i32(U(24).y), 2);
  let x: f32 = clamp(gTau, 0.0, 1.0) * f32(K - 1);
  let k0: i32 = clamp(i32(floor(x)), 0, K - 2);
  let f: f32 = x - f32(k0);
  let qa: vec4f = sdF(mb + k0 * 2);
  var qb: vec4f = sdF(mb + k0 * 2 + 2);
  if (dot(qa, qb) < 0.0) { qb = -qb; }
  return safeNorm4(mix(qa, qb, f));
}
fn poseT(mb: i32) -> vec4f {
  let K: i32 = max(i32(U(24).y), 2);
  let x: f32 = clamp(gTau, 0.0, 1.0) * f32(K - 1);
  let k0: i32 = clamp(i32(floor(x)), 0, K - 2);
  let f: f32 = x - f32(k0);
  return mix(sdF(mb + k0 * 2 + 1), sdF(mb + k0 * 2 + 3), f);
}
fn mBase(i: i32) -> i32 { return i32(oRow(i, 5).z) - 1; }
fn xfP(i: i32, p0: vec3f) -> vec3f {
  var p: vec3f = p0;
  let mb: i32 = mBase(i);
  if (mb >= 0) { let q: vec4f = poseQ(mb); let t: vec4f = poseT(mb); p = qrot(vec4f(-q.xyz, q.w), p0 - t.xyz) / t.w; }
  let a: vec4f = oRow(i, 1); let b: vec4f = oRow(i, 2); let c: vec4f = oRow(i, 3);
  return vec3f(dot(a.xyz, p) + a.w, dot(b.xyz, p) + b.w, dot(c.xyz, p) + c.w);
}
fn xfD(i: i32, d0: vec3f) -> vec3f {
  var d: vec3f = d0;
  let mb: i32 = mBase(i);
  if (mb >= 0) { let q: vec4f = poseQ(mb); let t: vec4f = poseT(mb); d = qrot(vec4f(-q.xyz, q.w), d0) / t.w; }
  let a: vec4f = oRow(i, 1); let b: vec4f = oRow(i, 2); let c: vec4f = oRow(i, 3);
  return vec3f(dot(a.xyz, d), dot(b.xyz, d), dot(c.xyz, d));
}
// a local normal (or tangent) to world: the inverse transpose, then the pose's rotation
fn xfN(i: i32, n: vec3f) -> vec3f {
  let a: vec4f = oRow(i, 1); let b: vec4f = oRow(i, 2); let c: vec4f = oRow(i, 3);
  var w: vec3f = a.xyz * n.x + b.xyz * n.y + c.xyz * n.z;
  let mb: i32 = mBase(i);
  if (mb >= 0) { w = qrot(poseQ(mb), w); }
  return safeNorm(w);
}
// a material's tangent (object space) as a world direction in the shading plane, turned by rot turns about N
fn tangentWorld(h: Hit, tl: vec3f, rot: f32, N: vec3f) -> vec3f {
  if (dot(tl, tl) < 1e-12) { return vec3f(0.0, 0.0, 0.0); }
  var t: vec3f = xfN(h.obj, tl);
  t = t - N * dot(N, t);
  if (dot(t, t) < 1e-10) { return vec3f(0.0, 0.0, 0.0); }
  t = normalize(t);
  if (rot != 0.0) { let a: f32 = rot * TAU; t = t * cos(a) + cross(N, t) * sin(a); }
  return t;
}

// ---------- triangle meshes: a BVH per mesh definition (in the scene data), traversed in object space ----------
// node: (min, left|first) (max, count) · triangle: (v0, face) (e1, u0) (e2, v0) (n0, u1) (n1, v1) (n2, u2) (v2, -, -, -)
fn hitMesh(o: vec3f, d: vec3f, pr: vec4f, tmax: f32) -> f32 {
  let nodeBase: i32 = i32(pr.x);
  let triBase: i32 = i32(pr.y);
  let inv: vec3f = safeInv(d);
  var best: f32 = tmax;
  var bt: i32 = -1;
  var bb: vec2f = vec2f(0.0, 0.0);
  var stack: array<i32, 48>;
  var sp: i32 = 1;
  stack[0] = 0;
  loop {
    if (sp <= 0) { break; }
    sp = sp - 1;
    let ni: i32 = stack[sp];
    let a: vec4f = sdF(nodeBase + ni * 2);
    let b: vec4f = sdF(nodeBase + ni * 2 + 1);
    if (!hitAABB(o, inv, a.xyz, b.xyz, best)) { continue; }
    let cnt: i32 = i32(b.w);
    if (cnt > 0) {
      let first: i32 = i32(a.w);
      for (var k: i32 = 0; k < cnt; k++) {
        let tb: i32 = triBase + (first + k) * 7;
        let r0: vec4f = sdF(tb);
        let e1: vec3f = sdF(tb + 1).xyz;
        let e2: vec3f = sdF(tb + 2).xyz;
        let pv: vec3f = cross(d, e2);
        let det: f32 = dot(e1, pv);
        if (abs(det) < 1e-14) { continue; }
        let idet: f32 = 1.0 / det;
        let tv: vec3f = o - r0.xyz;
        let u: f32 = dot(tv, pv) * idet;
        if (u < 0.0 || u > 1.0) { continue; }
        let qv: vec3f = cross(tv, e1);
        let v: f32 = dot(d, qv) * idet;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let t: f32 = dot(e2, qv) * idet;
        if (t > EPS && t < best) { best = t; bt = tb; bb = vec2f(u, v); }
      }
    } else {
      if (sp < 46) { stack[sp] = i32(a.w); stack[sp + 1] = i32(a.w) + 1; sp = sp + 2; }
    }
  }
  if (bt < 0) { return BIG; }
  gTri = bt; gBary = bb;
  return best;
}

fn sdBox(p: vec3f, b: vec3f) -> f32 { let q: vec3f = abs(p) - b; return length(max(q, vec3f(0.0, 0.0, 0.0))) + min(max(q.x, max(q.y, q.z)), 0.0); }
fn sdLocal(ty: i32, p: vec3f, pr: vec4f, i: i32) -> f32 {
  if (ty == 7) { let q: vec2f = vec2f(length(p.xz) - pr.x, p.y); return length(q) - pr.y; }
  if (ty == 8) { return sdBox(p, pr.xyz - vec3f(pr.w, pr.w, pr.w)) - pr.w; }
  if (ty == 6) { let q: vec3f = vec3f(p.x, p.y - clamp(p.y, -pr.y, pr.y), p.z); return length(q) - pr.x; }
  if (ty == 9) {
    let q: vec2f = vec2f(length(p.xz), p.y);
    let k1: vec2f = vec2f(0.0, pr.y);
    let k2: vec2f = vec2f(-pr.x, 2.0 * pr.y);
    let ca: vec2f = vec2f(q.x - min(q.x, select(0.0, pr.x, q.y < 0.0)), abs(q.y) - pr.y);
    let cb: vec2f = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
    let s: f32 = select(1.0, -1.0, cb.x < 0.0 && ca.y < 0.0);
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
  }
  if (ty == 10) {
    let q: vec3f = abs(p);
    let h: vec2f = vec2f(pr.x, pr.y);
    return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
  }
  if (ty == 12) { return max((p.y - heightAt(i32(pr.x), p.xz)) * 0.5, sdBox(p, vec3f(pr.y, pr.z * 1.2 + 0.05, pr.y))); }
  return sdUser(i32(pr.x), p);
}
fn sdNormal(ty: i32, p: vec3f, pr: vec4f, i: i32) -> vec3f {
  let e: f32 = 0.0005;
  let a: vec3f = vec3f(1.0, -1.0, -1.0);
  let b: vec3f = vec3f(-1.0, -1.0, 1.0);
  let c: vec3f = vec3f(-1.0, 1.0, -1.0);
  let d: vec3f = vec3f(1.0, 1.0, 1.0);
  return safeNorm(a * sdLocal(ty, p + a * e, pr, i) + b * sdLocal(ty, p + b * e, pr, i) + c * sdLocal(ty, p + c * e, pr, i) + d * sdLocal(ty, p + d * e, pr, i));
}

// distance t along (ro + t rd) to object i, or BIG
fn hitObj(i: i32, ro: vec3f, rd: vec3f, tmax: f32) -> f32 {
  let h0: vec4f = oRow(i, 0);
  let ty: i32 = i32(h0.x);
  let pr: vec4f = oRow(i, 4);
  let o: vec3f = xfP(i, ro);
  let d: vec3f = xfD(i, rd);
  if (ty == 13) { return hitMesh(o, d, pr, tmax); }
  if (ty == 0) {
    let a: f32 = dot(d, d); let b: f32 = dot(o, d); let c: f32 = dot(o, o) - pr.x * pr.x;
    let disc: f32 = b * b - a * c;
    if (disc < 0.0) { return BIG; }
    let s: f32 = sqrt(disc);
    var t: f32 = (-b - s) / a;
    if (t < EPS) { t = (-b + s) / a; }
    if (t < EPS || t > tmax) { return BIG; }
    return t;
  }
  if (ty == 1 || ty == 2 || ty == 3) {
    if (abs(d.y) < 1e-12) { return BIG; }
    let t: f32 = -o.y / d.y;
    if (t < EPS || t > tmax) { return BIG; }
    let p: vec3f = o + d * t;
    if (ty == 1 && pr.x > 0.0 && (abs(p.x) > pr.x * 0.5 || abs(p.z) > pr.x * 0.5)) { return BIG; }
    if (ty == 2 && (abs(p.x) > pr.x || abs(p.z) > pr.y)) { return BIG; }
    if (ty == 3 && dot(p.xz, p.xz) > pr.x * pr.x) { return BIG; }
    return t;
  }
  if (ty == 4) {
    let inv: vec3f = safeInv(d);
    let t0: vec3f = (-pr.xyz - o) * inv;
    let t1: vec3f = (pr.xyz - o) * inv;
    let tn: vec3f = min(t0, t1);
    let tf: vec3f = max(t0, t1);
    let a: f32 = max(max(tn.x, tn.y), tn.z);
    let b: f32 = min(min(tf.x, tf.y), tf.z);
    if (a > b || b < EPS) { return BIG; }
    let t: f32 = select(a, b, a < EPS);
    if (t > tmax) { return BIG; }
    return t;
  }
  if (ty == 5) {
    var best: f32 = BIG;
    let a: f32 = d.x * d.x + d.z * d.z;
    let b: f32 = o.x * d.x + o.z * d.z;
    let c: f32 = o.x * o.x + o.z * o.z - pr.x * pr.x;
    let disc: f32 = b * b - a * c;
    if (disc >= 0.0 && a > 1e-14) {
      let s: f32 = sqrt(disc);
      let ta: f32 = (-b - s) / a;
      let tb: f32 = (-b + s) / a;
      if (ta > EPS && abs(o.y + d.y * ta) <= pr.y) { best = ta; } else { if (tb > EPS && abs(o.y + d.y * tb) <= pr.y) { best = tb; } }
    }
    if (abs(d.y) > 1e-12) {
      let tc1: f32 = (pr.y - o.y) / d.y;
      let tc2: f32 = (-pr.y - o.y) / d.y;
      let p1: vec3f = o + d * tc1;
      let p2: vec3f = o + d * tc2;
      if (tc1 > EPS && tc1 < best && dot(p1.xz, p1.xz) <= pr.x * pr.x) { best = tc1; }
      if (tc2 > EPS && tc2 < best && dot(p2.xz, p2.xz) <= pr.x * pr.x) { best = tc2; }
    }
    if (best > tmax) { return BIG; }
    return best;
  }
  // signed distance fields: sphere-trace in object space inside the bounding sphere
  let bound: f32 = oRow(i, 5).w;
  let dl: f32 = length(d);
  let dn: vec3f = d / dl;
  let bb: f32 = dot(o, dn);
  let bc: f32 = dot(o, o) - bound * bound;
  let bdisc: f32 = bb * bb - bc;
  if (bdisc < 0.0) { return BIG; }
  let bs: f32 = sqrt(bdisc);
  var s: f32 = max(-bb - bs, 0.0);
  let s1: f32 = min(-bb + bs, tmax * dl);
  var steps: i32 = 0;
  let lip: f32 = select(1.0, 0.6, ty == 12);
  loop {
    if (s > s1 || steps > 220) { break; }
    let dist: f32 = sdLocal(ty, o + dn * s, pr, i);
    if (abs(dist) < 0.0004 * max(1.0, s * 0.02)) {
      let t: f32 = s / dl;
      if (t > EPS) { return t; }
      s = s + 0.002;
    }
    s = s + abs(dist) * lip;
    steps++;
  }
  return BIG;
}

// fill a hit record for object i at t
fn finishHit(i: i32, ro: vec3f, rd: vec3f, t: f32) -> Hit {
  var h: Hit = noHit();
  let h0: vec4f = oRow(i, 0);
  let ty: i32 = i32(h0.x);
  let pr: vec4f = oRow(i, 4);
  let r5: vec4f = oRow(i, 5);
  h.ok = true; h.t = t; h.obj = i; h.mat = i32(h0.y); h.lit = i32(h0.z); h.irand = r5.x; h.iid = r5.y;
  h.P = ro + rd * t;
  let p: vec3f = xfP(i, h.P);
  h.lp = p;
  var n: vec3f = vec3f(0.0, 1.0, 0.0);
  var uv: vec2f = vec2f(0.0, 0.0);
  if (ty == 13) {
    // the closest triangle was recorded by hitMesh; interpolate its normals and uvs, look up its face's material
    let tb: i32 = gTri;
    let r0: vec4f = sdF(tb); let r1: vec4f = sdF(tb + 1); let r2: vec4f = sdF(tb + 2);
    let r3: vec4f = sdF(tb + 3); let r4: vec4f = sdF(tb + 4); let r5: vec4f = sdF(tb + 5); let r6: vec4f = sdF(tb + 6);
    let bu: f32 = gBary.x; let bv: f32 = gBary.y; let bw: f32 = 1.0 - bu - bv;
    let ngL: vec3f = safeNorm(cross(r1.xyz, r2.xyz));
    let nsL: vec3f = safeNorm(r3.xyz * bw + r4.xyz * bu + r5.xyz * bv);
    h.uv = vec2f(r1.w, r2.w) * bw + vec2f(r3.w, r4.w) * bu + vec2f(r5.w, r6.x) * bv;
    h.face = i32(r0.w);
    if (pr.z >= 0.0) {
      let fr: vec4f = sdF(i32(pr.z) + h.face / 4);
      let k: i32 = h.face % 4;
      let fm: f32 = select(select(select(fr.w, fr.z, k == 2), fr.y, k == 1), fr.x, k == 0);
      if (fm >= 0.0) { h.mat = i32(fm); }
    }
    let ng: vec3f = xfN(i, ngL);
    h.front = dot(ng, rd) < 0.0;
    h.Ng = select(-ng, ng, h.front);
    let ns: vec3f = xfN(i, nsL);
    h.N = select(-ns, ns, h.front);
    if (dot(h.N, h.Ng) <= 0.0) { h.N = h.Ng; }
    return h;
  }
  if (ty == 0) { n = p / pr.x; uv = vec2f(atan2(p.z, p.x) * (0.5 * INV_PI) + 0.5, acos(clamp(p.y / pr.x, -1.0, 1.0)) * INV_PI); }
  else { if (ty == 1 || ty == 2 || ty == 3) { n = vec3f(0.0, 1.0, 0.0); uv = p.xz; }
  else { if (ty == 4) {
    let q: vec3f = p / pr.xyz;
    let a: vec3f = abs(q);
    if (a.x >= a.y && a.x >= a.z) { n = vec3f(sign(q.x), 0.0, 0.0); uv = p.zy; }
    else { if (a.y >= a.z) { n = vec3f(0.0, sign(q.y), 0.0); uv = p.xz; } else { n = vec3f(0.0, 0.0, sign(q.z)); uv = p.xy; } }
  }
  else { if (ty == 5) {
    if (abs(p.y) >= pr.y * 0.9999) { n = vec3f(0.0, sign(p.y), 0.0); uv = p.xz; }
    else { n = safeNorm(vec3f(p.x, 0.0, p.z)); uv = vec2f(atan2(p.z, p.x) * (0.5 * INV_PI) + 0.5, p.y); }
  }
  else {
    n = sdNormal(ty, p, pr, i);
    uv = vec2f(atan2(p.z, p.x) * (0.5 * INV_PI) + 0.5, p.y);
    if (ty == 7) { uv = vec2f(atan2(p.z, p.x) * (0.5 * INV_PI) + 0.5, atan2(p.y, length(p.xz) - pr.x) * (0.5 * INV_PI) + 0.5); }
    if (ty == 12) { uv = p.xz; }
  } } } }
  h.uv = uv;
  let ng: vec3f = xfN(i, n);
  h.front = dot(ng, rd) < 0.0;
  h.Ng = select(-ng, ng, h.front);
  h.N = h.Ng;
  return h;
}

// ---------- the scene: BVH over bounded objects, a list of unbounded ones ----------
struct TraceR {
  t: f32,
  obj: i32,
}
fn traceAll(ro: vec3f, rd: vec3f, tmax: f32, shadow: bool) -> TraceR {
  var r: TraceR;
  r.t = tmax; r.obj = -1;
  let cnt: vec4f = U(19);
  let nObj: i32 = i32(cnt.x);
  let nB: i32 = i32(cnt.z);
  let nNodes: i32 = i32(cnt.w);
  for (var i: i32 = nB; i < nObj; i++) {
    if (shadow && (i32(oRow(i, 0).w) & 1) != 0) { continue; }
    let t: f32 = hitObj(i, ro, rd, r.t);
    if (t < r.t) { r.t = t; r.obj = i; }
  }
  if (nNodes > 0) {
    let inv: vec3f = safeInv(rd);
    var stack: array<i32, 40>;
    var sp: i32 = 1;
    stack[0] = 0;
    loop {
      if (sp <= 0) { break; }
      sp = sp - 1;
      let ni: i32 = stack[sp];
      let a: vec4f = bvhF(ni * 2);
      let b: vec4f = bvhF(ni * 2 + 1);
      if (!hitAABB(ro, inv, a.xyz, b.xyz, r.t)) { continue; }
      let cntN: i32 = i32(b.w);
      if (cntN > 0) {
        let first: i32 = i32(a.w);
        for (var k: i32 = 0; k < cntN; k++) {
          let oi: i32 = first + k;
          if (shadow && (i32(oRow(oi, 0).w) & 1) != 0) { continue; }
          let t: f32 = hitObj(oi, ro, rd, r.t);
          if (t < r.t) { r.t = t; r.obj = oi; }
        }
      } else {
        if (sp < 38) {
          stack[sp] = i32(a.w);
          stack[sp + 1] = i32(a.w) + 1;
          sp = sp + 2;
        }
      }
    }
  }
  return r;
}
fn traceScene(ro: vec3f, rd: vec3f, tmax: f32) -> Hit {
  let r: TraceR = traceAll(ro, rd, tmax, false);
  if (r.obj < 0) { return noHit(); }
  return finishHit(r.obj, ro, rd, r.t);
}
fn occluded(ro: vec3f, rd: vec3f, tmax: f32) -> bool {
  let r: TraceR = traceAll(ro, rd, tmax, true);
  return r.obj >= 0;
}

// ---------- microfacets ----------
fn ggxD(h: vec3f, ax: f32, ay: f32) -> f32 {
  let x: f32 = h.x / ax;
  let y: f32 = h.y / ay;
  let d: f32 = x * x + y * y + h.z * h.z;
  return 1.0 / (PI * ax * ay * d * d);
}
fn ggxLambda(w: vec3f, ax: f32, ay: f32) -> f32 {
  let a2: f32 = sq(w.x * ax) + sq(w.y * ay);
  let z2: f32 = max(w.z * w.z, 1e-12);
  return (-1.0 + sqrt(1.0 + a2 / z2)) * 0.5;
}
fn sampleVNDF(wo: vec3f, ax: f32, ay: f32, u: vec2f) -> vec3f {
  let vh: vec3f = safeNorm(vec3f(ax * wo.x, ay * wo.y, wo.z));
  let ls: f32 = vh.x * vh.x + vh.y * vh.y;
  let T1: vec3f = select(vec3f(1.0, 0.0, 0.0), vec3f(-vh.y, vh.x, 0.0) / sqrt(max(ls, 1e-20)), ls > 1e-12);
  let T2: vec3f = cross(vh, T1);
  let r: f32 = sqrt(u.x);
  let ph: f32 = TAU * u.y;
  let t1: f32 = r * cos(ph);
  let s: f32 = 0.5 * (1.0 + vh.z);
  let t2: f32 = (1.0 - s) * sqrt(max(0.0, 1.0 - t1 * t1)) + s * r * sin(ph);
  let nh: vec3f = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * vh;
  return safeNorm(vec3f(ax * nh.x, ay * nh.y, max(1e-6, nh.z)));
}
fn fresnelDielectric(cosIn: f32, eta: f32) -> f32 {
  var c: f32 = clamp(cosIn, -1.0, 1.0);
  var e: f32 = eta;
  if (c < 0.0) { e = 1.0 / e; c = -c; }
  let s2: f32 = (1.0 - c * c) / (e * e);
  if (s2 >= 1.0) { return 1.0; }
  let ct: f32 = sqrt(1.0 - s2);
  let rs: f32 = (c - e * ct) / (c + e * ct);
  let rp: f32 = (e * c - ct) / (e * c + ct);
  return 0.5 * (rs * rs + rp * rp);
}
fn fresnelConductor(ci: f32, eta: vec3f, k: vec3f) -> vec3f {
  let c2: f32 = ci * ci;
  let s2: f32 = 1.0 - c2;
  let e2: vec3f = eta * eta;
  let k2: vec3f = k * k;
  let t0: vec3f = e2 - k2 - s2;
  let a2b2: vec3f = sqrt(t0 * t0 + 4.0 * e2 * k2);
  let t1: vec3f = a2b2 + c2;
  let a: vec3f = sqrt(max(0.5 * (a2b2 + t0), vec3f(0.0, 0.0, 0.0)));
  let t2: vec3f = 2.0 * ci * a;
  let rs: vec3f = (t1 - t2) / (t1 + t2);
  let t3: vec3f = c2 * a2b2 + s2 * s2;
  let t4: vec3f = t2 * s2;
  let rp: vec3f = rs * (t3 - t4) / (t3 + t4);
  return clamp(0.5 * (rp + rs), vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0));
}
fn schlick3(c: f32, f0: vec3f) -> vec3f { let m: f32 = clamp(1.0 - c, 0.0, 1.0); let m2: f32 = m * m; return f0 + (1.0 - f0) * (m2 * m2 * m); }
// thin-film interference (Airy summation, s and p averaged) over a substrate of index n2
fn airy1(ci: f32, n1: f32, n2: f32, dnm: f32, lam: f32) -> f32 {
  let si2: f32 = 1.0 - ci * ci;
  let sf2: f32 = si2 / (n1 * n1);
  if (sf2 >= 1.0) { return 1.0; }
  let cf: f32 = sqrt(1.0 - sf2);
  let sb2: f32 = si2 / (n2 * n2);
  if (sb2 >= 1.0) { return 1.0; }
  let cb: f32 = sqrt(1.0 - sb2);
  let r12s: f32 = (ci - n1 * cf) / (ci + n1 * cf);
  let r23s: f32 = (n1 * cf - n2 * cb) / (n1 * cf + n2 * cb);
  let r12p: f32 = (n1 * ci - cf) / (n1 * ci + cf);
  let r23p: f32 = (n2 * cf - n1 * cb) / (n2 * cf + n1 * cb);
  let cd: f32 = cos(4.0 * PI * n1 * dnm * cf / lam);
  let Rs: f32 = (r12s * r12s + r23s * r23s + 2.0 * r12s * r23s * cd) / (1.0 + r12s * r12s * r23s * r23s + 2.0 * r12s * r23s * cd);
  let Rp: f32 = (r12p * r12p + r23p * r23p + 2.0 * r12p * r23p * cd) / (1.0 + r12p * r12p * r23p * r23p + 2.0 * r12p * r23p * cd);
  return clamp(0.5 * (Rs + Rp), 0.0, 1.0);
}
fn filmR(ci: f32, film: vec2f, n2: vec3f) -> vec3f {
  if (SPECTRAL_ON) { let r: f32 = airy1(ci, film.y, n2.y, film.x, gLam); return vec3f(r, r, r); }
  return vec3f(airy1(ci, film.y, n2.x, film.x, 640.0), airy1(ci, film.y, n2.y, film.x, 545.0), airy1(ci, film.y, n2.z, film.x, 455.0));
}
fn f0ToN(f0: vec3f) -> vec3f { let s: vec3f = sqrt(clamp(f0, vec3f(0.0, 0.0, 0.0), vec3f(0.99, 0.99, 0.99))); return (1.0 + s) / (1.0 - s); }
fn condF(L: Lobe, c: f32) -> vec3f {
  if ((L.flags & 4) != 0) { var n2: vec3f = L.c0; if ((L.flags & 1) != 0) { n2 = f0ToN(L.c1); } return filmR(c, L.film, n2); }
  if ((L.flags & 1) != 0) { return schlick3(c, L.c1); }
  return fresnelConductor(c, L.c0, L.c1);
}
fn msComp(L: Lobe, cwo: f32) -> vec3f {
  if ((L.flags & 8) == 0) { return vec3f(1.0, 1.0, 1.0); }
  let E: f32 = ggxE(cwo, sqrt(L.ax * L.ay));
  let F0: vec3f = condF(L, 1.0);
  return 1.0 + F0 * (1.0 / max(E, 0.05) - 1.0);
}

// ---------- lobes: f·cos, pdf, sampling (local frame: z = shading normal) ----------
struct BS {
  wi: vec3f,
  w: vec3f,
  pdf: f32,
  delta: bool,
  trans: bool,
  ok: bool,
}
fn bsNone() -> BS { var b: BS; b.wi = vec3f(0.0, 0.0, 1.0); b.w = vec3f(0.0, 0.0, 0.0); b.pdf = 0.0; b.delta = false; b.trans = false; b.ok = false; return b; }
fn isDeltaLobe(L: Lobe) -> bool { return L.kind == 5 || L.kind == 6 || ((L.kind == 2 || L.kind == 3) && max(L.ax, L.ay) < 0.002); }

// a rough dielectric's transmission lobe (Walter et al. 2007): wo above, wi below; eta = n(wi side) / n(wo side).
// Returns f·|cos θi| and the pdf of the VNDF sampler choosing it, in the form whose ratio is the sampler's G2/G1.
fn dielTrans(L: Lobe, wo: vec3f, wi: vec3f) -> vec2f {
  if (L.kind != 3 || (L.flags & 2) != 0 || max(L.ax, L.ay) < 0.002 || wo.z <= 0.0 || wi.z >= 0.0) { return vec2f(0.0, 0.0); }
  let eta: f32 = L.ior;
  var h: vec3f = -(wo + wi * eta);
  if (dot(h, h) < 1e-12) { return vec2f(0.0, 0.0); }
  h = normalize(h); if (h.z < 0.0) { h = -h; }
  let co: f32 = dot(wo, h); let ci: f32 = dot(wi, h);
  if (co <= 0.0 || ci >= 0.0) { return vec2f(0.0, 0.0); }
  var F: f32 = fresnelDielectric(co, eta);
  if ((L.flags & 4) != 0) { F = lum(filmR(co, L.film, vec3f(eta, eta, eta))); }
  let den: f32 = co + eta * ci;
  let D: f32 = ggxD(h, L.ax, L.ay);
  let G1: f32 = 1.0 / (1.0 + ggxLambda(wo, L.ax, L.ay));
  let G2: f32 = 1.0 / (1.0 + ggxLambda(wo, L.ax, L.ay) + ggxLambda(vec3f(wi.x, wi.y, -wi.z), L.ax, L.ay));
  let jac: f32 = eta * eta * abs(ci) / max(den * den, 1e-12);
  let fc: f32 = (1.0 - F) * D * G2 * co * jac / wo.z;
  let pdf: f32 = (1.0 - F) * G1 * D * co / wo.z * jac;
  return vec2f(fc, pdf);
}
fn evalLobe(L: Lobe, wo: vec3f, wi: vec3f) -> vec3f {
  if (L.kind == 3 && wi.z < 0.0) { let t: vec2f = dielTrans(L, wo, wi); return spec(L.c0) * t.x; }
  if (wo.z <= 0.0 || wi.z <= 0.0) { return vec3f(0.0, 0.0, 0.0); }
  if (L.kind == 1) { return spec(L.c0) * (INV_PI * wi.z); }
  if (L.kind == 4) {
    let h: vec3f = safeNorm(wo + wi);
    let sinh: f32 = sqrt(max(0.0, 1.0 - h.z * h.z));
    let r: f32 = max(L.ax, 0.07);
    let D: f32 = (2.0 + 1.0 / r) * pow(sinh, 1.0 / r) * (0.5 * INV_PI);
    let V: f32 = 1.0 / (4.0 * (wi.z + wo.z - wi.z * wo.z));
    return spec(L.c0) * (D * V * wi.z);
  }
  if (L.kind == 2 || L.kind == 3) {
    if (max(L.ax, L.ay) < 0.002) { return vec3f(0.0, 0.0, 0.0); }
    let h: vec3f = safeNorm(wo + wi);
    let D: f32 = ggxD(h, L.ax, L.ay);
    let G: f32 = 1.0 / (1.0 + ggxLambda(wo, L.ax, L.ay) + ggxLambda(wi, L.ax, L.ay));
    var F: vec3f = vec3f(1.0, 1.0, 1.0);
    if (L.kind == 2) { F = spec(condF(L, dot(wo, h))) * msComp(L, wo.z); }
    else {
      if ((L.flags & 2) == 0) {
        if ((L.flags & 4) != 0) { F = spec(filmR(dot(wo, h), L.film, vec3f(L.ior, L.ior, L.ior))); }
        else { let f: f32 = fresnelDielectric(dot(wo, h), L.ior); F = vec3f(f, f, f); }
      }
    }
    return F * (D * G / (4.0 * wo.z));
  }
  return vec3f(0.0, 0.0, 0.0);
}
fn pdfLobe(L: Lobe, wo: vec3f, wi: vec3f) -> f32 {
  if (L.kind == 3 && wi.z < 0.0) { return dielTrans(L, wo, wi).y; }
  if (wo.z <= 0.0 || wi.z <= 0.0) { return 0.0; }
  if (L.kind == 1 || L.kind == 4) { return wi.z * INV_PI; }
  if (L.kind == 2 || L.kind == 3) {
    if (max(L.ax, L.ay) < 0.002) { return 0.0; }
    let h: vec3f = safeNorm(wo + wi);
    let G1: f32 = 1.0 / (1.0 + ggxLambda(wo, L.ax, L.ay));
    var p: f32 = G1 * ggxD(h, L.ax, L.ay) / (4.0 * wo.z);
    if (L.kind == 3 && (L.flags & 2) == 0) { p = p * fresnelDielectric(dot(wo, h), L.ior); }
    return p;
  }
  return 0.0;
}
fn sampleLobe(L: Lobe, wo: vec3f, u: vec2f, u1: f32) -> BS {
  var b: BS = bsNone();
  if (wo.z <= 0.0 && L.kind != 3 && L.kind != 5 && L.kind != 6) { return b; }
  if (L.kind == 1 || L.kind == 4) {
    let wi: vec3f = cosHemi(u);
    b.wi = wi; b.pdf = wi.z * INV_PI; b.ok = wi.z > 0.0;
    if (b.pdf > 0.0) { b.w = evalLobe(L, wo, wi) / b.pdf; }
    return b;
  }
  if (L.kind == 2) {
    if (max(L.ax, L.ay) < 0.002) {
      b.wi = vec3f(-wo.x, -wo.y, wo.z); b.delta = true; b.ok = true; b.pdf = 1.0;
      b.w = spec(condF(L, wo.z));
      return b;
    }
    let h: vec3f = sampleVNDF(wo, L.ax, L.ay, u);
    let wi: vec3f = reflect(-wo, h);
    if (wi.z <= 0.0) { return b; }
    b.wi = wi; b.ok = true; b.pdf = pdfLobe(L, wo, wi);
    let G1: f32 = 1.0 / (1.0 + ggxLambda(wo, L.ax, L.ay));
    let G2: f32 = 1.0 / (1.0 + ggxLambda(wo, L.ax, L.ay) + ggxLambda(wi, L.ax, L.ay));
    b.w = spec(condF(L, dot(wo, h))) * msComp(L, wo.z) * (G2 / G1);
    return b;
  }
  if (L.kind == 3) {
    // rough or smooth dielectric: reflection or refraction, chosen by Fresnel
    let entering: bool = wo.z > 0.0;
    let wl: vec3f = select(-wo, wo, entering);
    let eta: f32 = select(1.0 / L.ior, L.ior, entering);
    var h: vec3f = vec3f(0.0, 0.0, 1.0);
    let smooth0: bool = max(L.ax, L.ay) < 0.002;
    if (!smooth0) { h = sampleVNDF(wl, L.ax, L.ay, u); }
    let c: f32 = dot(wl, h);
    var F: f32 = 1.0;
    if ((L.flags & 2) == 0) {
      if ((L.flags & 4) != 0) { F = lum(filmR(c, L.film, vec3f(L.ior, L.ior, L.ior))); } else { F = fresnelDielectric(c, eta); }
    }
    var wi: vec3f = vec3f(0.0, 0.0, 1.0);
    if (u1 < F || (L.flags & 2) != 0) {
      wi = reflect(-wl, h);
      if (wi.z <= 0.0) { return b; }
      b.trans = false;
    } else {
      let r: vec3f = refract(-wl, h, 1.0 / eta);
      if (dot(r, r) < 0.5) { wi = reflect(-wl, h); b.trans = false; } else { wi = r; b.trans = true; }
      if (b.trans && wi.z >= 0.0) { return b; }
    }
    b.ok = true;
    if (smooth0) { b.delta = true; b.pdf = 1.0; b.w = vec3f(1.0, 1.0, 1.0); }
    else {
      let G1: f32 = 1.0 / (1.0 + ggxLambda(wl, L.ax, L.ay));
      let G2: f32 = 1.0 / (1.0 + ggxLambda(wl, L.ax, L.ay) + ggxLambda(vec3f(wi.x, wi.y, abs(wi.z)), L.ax, L.ay));
      b.w = vec3f(G2 / G1, G2 / G1, G2 / G1);
      b.pdf = pdfLobe(L, wl, wi);
      b.delta = false;
      if (b.pdf <= 0.0) { b.pdf = 1.0; b.delta = true; }
    }
    if (b.trans) { b.w = b.w * spec(L.c0); }
    if (!entering) { wi = -wi; }
    b.wi = wi;
    return b;
  }
  if (L.kind == 5) {
    // thin dielectric: reflect, or pass straight through
    let c: f32 = abs(wo.z);
    var R: f32 = 0.0;
    if ((L.flags & 4) != 0) { R = lum(filmR(c, L.film, vec3f(1.0, 1.0, 1.0))); }
    else { let r0: f32 = fresnelDielectric(c, L.ior); R = select(r0 + (1.0 - r0) * (1.0 - r0) * r0 / (1.0 - r0 * r0), 1.0, r0 >= 1.0); }
    b.ok = true; b.delta = true; b.pdf = 1.0;
    if (u1 < R) { b.wi = vec3f(-wo.x, -wo.y, wo.z); b.w = vec3f(1.0, 1.0, 1.0); }
    else { b.wi = -wo; b.trans = true; b.w = spec(L.c0); }
    if ((L.flags & 4) != 0) {
      let Rc: vec3f = spec(filmR(c, L.film, vec3f(1.0, 1.0, 1.0)));
      let Rl: f32 = max(lum(Rc), 1e-4);
      if (!b.trans) { b.w = Rc / Rl; } else { b.w = (1.0 - Rc) / max(1.0 - Rl, 1e-4) * spec(L.c0); }
    }
    return b;
  }
  if (L.kind == 6) { b.wi = -wo; b.ok = true; b.delta = true; b.trans = true; b.pdf = 1.0; b.w = vec3f(1.0, 1.0, 1.0); return b; }
  return b;
}

// ---------- lights: stride 6 vec4 ----------
fn lRow(i: i32, k: i32) -> vec4f { return litF(i * 6 + k); }
struct LS {
  wi: vec3f,
  Li: vec3f,
  pdf: f32,
  dist: f32,
  delta: bool,
  ok: bool,
}
fn lsNone() -> LS { var s: LS; s.wi = vec3f(0.0, 1.0, 0.0); s.Li = vec3f(0.0, 0.0, 0.0); s.pdf = 0.0; s.dist = 0.0; s.delta = false; s.ok = false; return s; }
// light emission as a spectrum: kind 0 rgb, 1 blackbody (temperature in .w of row 4, normaliser in row 5)
fn lightSpec(i: i32, rgb: vec3f) -> vec3f {
  if (SPECTRAL_ON) {
    let r4: vec4f = lRow(i, 4);
    let r5: vec4f = lRow(i, 5);
    if (r4.w > 0.0) { let s: f32 = planckRel(gLam, r4.w) * r5.x * lum(rgb); return vec3f(s, s, s); }
    return spec(rgb);
  }
  return rgb;
}
fn sampleSphereDir(c: vec3f, r: f32, P: vec3f, u: vec2f) -> vec4f {
  let d: vec3f = c - P;
  let dd: f32 = dot(d, d);
  let sin2: f32 = r * r / max(dd, 1e-12);
  if (sin2 >= 0.9999) { return vec4f(safeNorm(d), 1.0); }
  let om: f32 = max(oneMinusCosFromSin2(sin2), 1e-12);
  let fr: Frame = frameOf(safeNorm(d));
  let w: vec3f = toWorld(fr, uniformConeOm(u, om));
  return vec4f(w, 1.0 / (TAU * om));
}
fn sampleLight(i: i32, P: vec3f, u: vec2f) -> LS {
  var s: LS = lsNone();
  let r0: vec4f = lRow(i, 0);
  let r1: vec4f = lRow(i, 1);
  let r2: vec4f = lRow(i, 2);
  let r3: vec4f = lRow(i, 3);
  let r4: vec4f = lRow(i, 4);
  let ty: i32 = i32(r0.x);
  if (ty == 0 || ty == 1) {
    let d: vec3f = r1.xyz - P;
    let dist: f32 = length(d);
    var fall: f32 = 1.0;
    if (ty == 1) { fall = smoothstep(r2.w, r3.w, dot(-d / dist, r3.xyz)); }
    if (fall <= 0.0) { return s; }
    if (r1.w <= 0.0) {
      s.wi = d / dist; s.dist = dist; s.delta = true; s.pdf = 1.0; s.ok = true;
      s.Li = lightSpec(i, r2.xyz) * (fall / max(dist * dist, 1e-8));
      return s;
    }
    let sd: vec4f = sampleSphereDir(r1.xyz, r1.w, P, u);
    s.wi = sd.xyz; s.pdf = sd.w; s.ok = true;
    let b: f32 = dot(r1.xyz - P, s.wi);
    let c: f32 = dot(d, d) - r1.w * r1.w;
    s.dist = max(b - sqrt(max(b * b - c, 0.0)), 1e-4);
    s.Li = lightSpec(i, r2.xyz) * (fall / (PI * r1.w * r1.w));
    return s;
  }
  if (ty == 2 || ty == 3) {
    var q: vec3f = r1.xyz;
    if (ty == 2) { q = r1.xyz + r3.xyz * (2.0 * u.x - 1.0) + r4.xyz * (2.0 * u.y - 1.0); }
    else { let rr: f32 = sqrt(u.x) * r1.w; let ph: f32 = TAU * u.y; q = r1.xyz + r3.xyz * (rr * cos(ph)) + r4.xyz * (rr * sin(ph)); }
    let n: vec3f = safeNorm(cross(r3.xyz, r4.xyz));
    let d: vec3f = q - P;
    let dist: f32 = length(d);
    let wi: vec3f = d / dist;
    var cl: f32 = -dot(wi, n);
    if (r0.z > 0.5) { cl = abs(cl); }
    if (cl <= 1e-6) { return s; }
    s.wi = wi; s.dist = dist * 0.9995; s.ok = true;
    s.pdf = dist * dist / (cl * r2.w);
    s.Li = lightSpec(i, r2.xyz);
    return s;
  }
  return s;
}
// the solid-angle pdf with which sampleLight would have chosen the point a BSDF ray hit
fn lightPdfAt(i: i32, P: vec3f, wi: vec3f, h: Hit) -> f32 {
  let r0: vec4f = lRow(i, 0);
  let r1: vec4f = lRow(i, 1);
  let r2: vec4f = lRow(i, 2);
  let ty: i32 = i32(r0.x);
  if (ty == 0 || ty == 1) {
    if (r1.w <= 0.0) { return 0.0; }
    let dd: f32 = dot(r1.xyz - P, r1.xyz - P);
    let sin2: f32 = r1.w * r1.w / max(dd, 1e-12);
    if (sin2 >= 0.9999) { return 0.0; }
    return 1.0 / (TAU * max(oneMinusCosFromSin2(sin2), 1e-12));
  }
  let cl: f32 = abs(dot(wi, h.Ng));
  return h.t * h.t / max(cl * r2.w, 1e-12);
}

// ---------- sky and environments ----------
fn perez(th: f32, ga: f32, A: f32, B: f32, C: f32, D: f32, E: f32) -> f32 {
  return (1.0 + A * exp(B / max(cos(th), 0.01))) * (1.0 + C * exp(D * ga) + E * cos(ga) * cos(ga));
}
fn skyL(d: vec3f) -> vec3f {
  let s1: vec4f = U(11); let s2: vec4f = U(12); let s3: vec4f = U(13); let s4: vec4f = U(14); let s5: vec4f = U(15); let s6: vec4f = U(16);
  let sd: vec3f = U(6).xyz;
  let dy: f32 = max(d.y, 0.001);
  let dd: vec3f = safeNorm(vec3f(d.x, dy, d.z));
  let th: f32 = acos(clamp(dd.y, -1.0, 1.0));
  let ga: f32 = acos(clamp(dot(dd, sd), -1.0, 1.0));
  let Y: f32 = s5.x * perez(th, ga, s1.x, s1.y, s1.z, s1.w, s2.x) / s5.w;
  let x: f32 = s5.y * perez(th, ga, s2.y, s2.z, s2.w, s3.x, s3.y) / s6.x;
  let y: f32 = s5.z * perez(th, ga, s3.z, s3.w, s4.x, s4.y, s4.z) / s6.y;
  let X: f32 = x * Y / max(y, 1e-4);
  let Z: f32 = (1.0 - x - y) * Y / max(y, 1e-4);
  var c: vec3f = max(xyz2rgb(vec3f(X, Y, Z)), vec3f(0.0, 0.0, 0.0)) * s6.z;
  if (d.y < 0.0) { c = c * vec3f(0.25, 0.23, 0.21) * exp(d.y * 3.0); }
  return c;
}
fn studioL(d0: vec3f) -> vec3f {
  let rot: f32 = U(8).z;
  let d: vec3f = vec3f(cos(rot) * d0.x - sin(rot) * d0.z, d0.y, sin(rot) * d0.x + cos(rot) * d0.z);
  var c: f32 = 0.035 + 0.03 * smoothstep(-0.2, 0.8, d.y);
  let key: vec3f = safeNorm(vec3f(-0.7, 0.55, 0.45));
  let fill: vec3f = safeNorm(vec3f(0.8, 0.25, 0.4));
  let top: vec3f = vec3f(0.0, 1.0, 0.0);
  c = c + 1.0 * smoothstep(0.93, 0.95, dot(d, key));
  c = c + 0.35 * smoothstep(0.90, 0.93, dot(d, fill));
  c = c + 0.6 * smoothstep(0.965, 0.975, dot(d, top));
  c = c + 0.25 * smoothstep(0.97, 0.98, dot(d, safeNorm(vec3f(0.1, 0.35, -1.0))));
  return vec3f(c, c, c);
}
// an equirectangular HDRI in the scene data (U23: base, width, height): W·H texels (r, g, b, pdf per unit uv area)
// followed by W·H alias-table entries (probability, alias); importance sampling is O(1)
fn envRot(d: vec3f, r: f32) -> vec3f { return vec3f(cos(r) * d.x - sin(r) * d.z, d.y, sin(r) * d.x + cos(r) * d.z); }
fn hdriTexel(x0: i32, y0: i32) -> vec4f {
  let W: i32 = i32(U(23).y); let H: i32 = i32(U(23).z);
  let x: i32 = ((x0 % W) + W) % W;
  let y: i32 = clamp(y0, 0, H - 1);
  return sdF(i32(U(23).x) + y * W + x);
}
fn hdriUV(d0: vec3f) -> vec2f {
  let e: vec3f = envRot(d0, U(8).z);
  return vec2f(atan2(e.x, -e.z) * (0.5 * INV_PI) + 0.5, acos(clamp(e.y, -1.0, 1.0)) * INV_PI);
}
fn hdriL(d: vec3f) -> vec3f {
  let W: f32 = U(23).y; let H: f32 = U(23).z;
  let uv: vec2f = hdriUV(d);
  let x: f32 = uv.x * W - 0.5; let y: f32 = uv.y * H - 0.5;
  let x0: f32 = floor(x); let y0: f32 = floor(y);
  let fx: f32 = x - x0; let fy: f32 = y - y0;
  let ix: i32 = i32(x0); let iy: i32 = i32(y0);
  let c: vec3f = mix(mix(hdriTexel(ix, iy).xyz, hdriTexel(ix + 1, iy).xyz, fx), mix(hdriTexel(ix, iy + 1).xyz, hdriTexel(ix + 1, iy + 1).xyz, fx), fy);
  return c;
}
fn hdriPdf(d: vec3f) -> f32 {
  let W: f32 = U(23).y; let H: f32 = U(23).z;
  let uv: vec2f = hdriUV(d);
  let s: f32 = sin(uv.y * PI);
  if (s <= 1e-6) { return 0.0; }
  let t: vec4f = hdriTexel(i32(floor(uv.x * W)), i32(floor(uv.y * H)));
  return t.w / (2.0 * PI * PI * s);
}
// (direction, solid-angle pdf)
fn hdriSample(u1: f32, u2: vec2f) -> vec4f {
  let Wi: i32 = i32(U(23).y); let Hi: i32 = i32(U(23).z);
  let N: i32 = Wi * Hi;
  let base: i32 = i32(U(23).x);
  let xN: f32 = u1 * f32(N);
  var i: i32 = min(i32(xN), N - 1);
  let al: vec4f = sdF(base + N + i);
  if (xN - f32(i) >= al.x) { i = i32(al.y); }
  let px: i32 = i % Wi; let py: i32 = i / Wi;
  let uv: vec2f = vec2f((f32(px) + u2.x) / f32(Wi), (f32(py) + u2.y) / f32(Hi));
  let ph: f32 = (uv.x - 0.5) * TAU; let th: f32 = uv.y * PI;
  let st: f32 = sin(th);
  let e: vec3f = vec3f(st * sin(ph), cos(th), -st * cos(ph));
  let d: vec3f = envRot(e, -U(8).z);
  let pdf: f32 = sdF(base + i).w / (2.0 * PI * PI * max(st, 1e-6));
  return vec4f(d, pdf);
}
fn envL(d: vec3f) -> vec3f {
  let e: vec4f = U(8);
  let ty: i32 = i32(e.x);
  if (ty == 0) { return vec3f(0.0, 0.0, 0.0); }
  if (ty == 6) { return spec(hdriL(d)) * e.y; }
  if (ty == 1) { return spec(U(9).xyz) * e.y; }
  if (ty == 2) { return spec(studioL(d)) * e.y; }
  if (ty == 3) { return spec(mix(U(10).xyz, U(9).xyz, smoothstep(-0.3, 0.6, d.y))) * e.y; }
  if (ty == 4) { return spec(skyL(d)); }
  if (ty == 5) { let st: f32 = step(0.9985, hash13(floor(d * 400.0))) * smoothstep(0.0, 0.3, d.y); return spec(vec3f(0.02, 0.025, 0.05) * smoothstep(-0.1, 0.5, d.y) + vec3f(st, st, st) * 3.0) * e.y; }
  return vec3f(0.0, 0.0, 0.0);
}
fn sunL(d: vec3f) -> vec3f {
  let s: vec4f = U(6);
  let r: vec4f = U(7);
  if (r.w < 0.5 || dot(d, s.xyz) < s.w) { return vec3f(0.0, 0.0, 0.0); }
  return spec(r.xyz);
}

// light selection: the scene's lights, then the sun, then the environment
fn nLightChoices() -> i32 {
  let n: i32 = i32(U(19).y);
  return n + select(0, 1, U(7).w > 0.5) + select(0, 1, U(8).x > 0.5);
}

// ---------- participating media ----------
fn mRow(i: i32, k: i32) -> vec4f { return sdF(i32(U(23).w) + i * 3 + k); }
fn hgPhase(c: f32, g: f32) -> f32 { let d: f32 = 1.0 + g * g - 2.0 * g * c; return 0.25 * INV_PI * (1.0 - g * g) / (d * sqrt(max(d, 1e-8))); }
fn sampleHG(wo: vec3f, g: f32, u: vec2f) -> vec3f {
  var c: f32 = 1.0 - 2.0 * u.x;
  if (abs(g) > 1e-3) { let t: f32 = (1.0 - g * g) / (1.0 - g + 2.0 * g * u.x); c = (1.0 + g * g - t * t) / (2.0 * g); }
  let s: f32 = sqrt(max(0.0, 1.0 - c * c));
  let ph: f32 = TAU * u.y;
  let fr: Frame = frameOf(-wo);
  return toWorld(fr, vec3f(s * cos(ph), s * sin(ph), c));
}
// the scene's fog fills a sphere around the scene (U22: centre, radius) — clear air beyond, so the sun and the sky
// still reach it; returns the part [a, b] of the ray segment [0, tmax] inside that sphere
fn fogSeg(o: vec3f, d: vec3f, tmax: f32) -> vec2f {
  let s: vec4f = U(22);
  let oc: vec3f = o - s.xyz;
  let b: f32 = dot(oc, d);
  let c: f32 = dot(oc, oc) - s.w * s.w;
  let disc: f32 = b * b - c;
  if (disc <= 0.0) { return vec2f(0.0, 0.0); }
  let q: f32 = sqrt(disc);
  let a0: f32 = clamp(-b - q, 0.0, tmax);
  let b0: f32 = clamp(-b + q, 0.0, tmax);
  return vec2f(a0, max(b0, a0));
}
// transmittance along a shadow ray: the scene fog and any heterogeneous volumes it crosses (ratio tracking)
fn shadowTr(o: vec3f, d: vec3f, dist: f32) -> vec3f {
  var T: vec3f = vec3f(1.0, 1.0, 1.0);
  let fog: vec4f = U(17);
  if (U(18).w > 0.5) { let fs: vec2f = fogSeg(o, d, dist); T = T * exp(-fog.xyz * (fs.y - fs.x)); }
  let nm: i32 = i32(U(20).w);
  for (var m: i32 = 0; m < nm; m++) {
    let a: vec4f = mRow(m, 1);
    if (a.w < 0.5) { continue; }
    let c: vec4f = mRow(m, 2);
    let lo: vec3f = mRow(m, 0).xyz;
    let inv: vec3f = safeInv(d);
    let t0: vec3f = (lo - o) * inv;
    let t1: vec3f = (c.xyz - o) * inv;
    let ta: f32 = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), max(min(t0.z, t1.z), 0.0));
    let tb: f32 = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), min(max(t0.z, t1.z), dist));
    if (ta >= tb) { continue; }
    let maj: f32 = max(c.w, 1e-4);
    var t: f32 = ta;
    var tr: f32 = 1.0;
    for (var k: i32 = 0; k < 64; k++) {
      t = t - log(1.0 - rnd()) / maj;
      if (t >= tb) { break; }
      tr = tr * (1.0 - clamp(densityOf(m, o + d * t) / maj, 0.0, 1.0));
      if (tr < 0.01) { tr = 0.0; break; }
    }
    T = T * tr;
  }
  return T;
}

// ---- METAL ----
fn metalAt(v: vec3f) -> vec3f {
  if (SPECTRAL_ON) {
    let t: f32 = clamp((gLam - 450.0) / 200.0, 0.0, 1.0);
    let s: f32 = select(mix(v.z, v.y, t * 2.0), mix(v.y, v.x, t * 2.0 - 1.0), t > 0.5);
    return vec3f(s, s, s);
  }
  return v;
}

// ---- HITFN ----
fn hitAlbedo(h: Hit, wo: vec3f) -> vec3f { let L: Lobe = evalMaterial(h, wo, 0.5); if (L.kind == 2 && (L.flags & 1) != 0) { return L.c1; } if (L.kind == 1 || L.kind == 4) { return L.c0; } return vec3f(0.8, 0.8, 0.8); }
fn hitEmission(h: Hit, wo: vec3f) -> vec3f { let L: Lobe = evalMaterial(h, wo, 0.5); return L.Le; }

// ---- PATH ----

struct Ray {
  o: vec3f,
  d: vec3f,
}
struct PathOut {
  L: vec3f,
  alb: vec3f,
  nrm: vec3f,
  depth: f32,
}
fn neeAt(P: vec3f, Ng: vec3f, fr: Frame, wo: vec3f, L: Lobe, phaseG: f32, inMedium: bool, misOn: bool) -> vec3f {
  let nc: i32 = nLightChoices();
  if (nc == 0) { return vec3f(0.0, 0.0, 0.0); }
  let pick: i32 = min(i32(rnd() * f32(nc)), nc - 1);
  let sel: f32 = 1.0 / f32(nc);
  let nl: i32 = i32(U(19).y);
  let sunOn: bool = U(7).w > 0.5;
  var ls: LS = lsNone();
  let u: vec2f = rnd2();
  if (pick < nl) { ls = sampleLight(pick, P, u); }
  else {
    if (pick == nl && sunOn) {
      let sd: vec4f = U(6);
      let fs: Frame = frameOf(sd.xyz);
      ls.wi = toWorld(fs, uniformCone(u, sd.w)); ls.pdf = 1.0 / (TAU * (1.0 - sd.w)); ls.dist = BIG; ls.ok = true;
      ls.Li = spec(U(7).xyz);
    } else {
      // environment: an HDRI is importance-sampled by its texels' power; procedural ones cosine-weighted about the
      // normal (or uniformly in a medium)
      if (i32(U(8).x) == 6) { let hs: vec4f = hdriSample(u.x, rnd2()); ls.wi = hs.xyz; ls.pdf = hs.w; }
      else {
        if (inMedium) { let z: f32 = 1.0 - 2.0 * u.x; let r: f32 = sqrt(max(0.0, 1.0 - z * z)); ls.wi = vec3f(r * cos(TAU * u.y), r * sin(TAU * u.y), z); ls.pdf = 0.25 * INV_PI; }
        else { ls.wi = toWorld(fr, cosHemi(u)); ls.pdf = max(dot(ls.wi, fr.n), 0.0) * INV_PI; }
      }
      ls.dist = BIG; ls.ok = ls.pdf > 0.0; ls.Li = envL(ls.wi);
    }
  }
  if (!ls.ok || ls.pdf <= 0.0) { return vec3f(0.0, 0.0, 0.0); }
  var f: vec3f = vec3f(0.0, 0.0, 0.0);
  var bp: f32 = 0.0;
  if (inMedium) { let ph: f32 = hgPhase(dot(-wo, ls.wi), phaseG); f = vec3f(ph, ph, ph); bp = ph; }
  else {
    let wl: vec3f = toLocal(fr, wo);
    let il: vec3f = toLocal(fr, ls.wi);
    let below: bool = dot(ls.wi, Ng) <= 0.0;
    let transOK: bool = L.kind == 3 && (L.flags & 2) == 0 && max(L.ax, L.ay) >= 0.002;
    if (below && !transOK) { return vec3f(0.0, 0.0, 0.0); }
    f = evalLobe(L, wl, il);
    bp = pdfLobe(L, wl, il);
  }
  if (maxc(f) <= 0.0) { return vec3f(0.0, 0.0, 0.0); }
  let side: f32 = select(1.0, -1.0, dot(ls.wi, Ng) < 0.0);
  let off: vec3f = select(Ng * (EPS * 4.0 * side), vec3f(0.0, 0.0, 0.0), inMedium);
  if (occluded(P + off, ls.wi, ls.dist)) { return vec3f(0.0, 0.0, 0.0); }
  let tr: vec3f = shadowTr(P, ls.wi, min(ls.dist, 1e4));
  var w: f32 = 1.0;
  if (!ls.delta && misOn) { w = misW(ls.pdf * sel, bp); }
  return f * ls.Li * tr * (w / (ls.pdf * sel));
}

fn tracePath(ro0: vec3f, rd0: vec3f) -> PathOut {
  var po: PathOut;
  po.L = vec3f(0.0, 0.0, 0.0); po.alb = vec3f(0.0, 0.0, 0.0); po.nrm = vec3f(0.0, 0.0, 0.0); po.depth = 0.0;
  var ro: vec3f = ro0;
  var rd: vec3f = rd0;
  var beta: vec3f = vec3f(1.0, 1.0, 1.0);
  var pdfPrev: f32 = 1.0;
  var deltaPrev: bool = true;
  var prevP: vec3f = ro0;
  var prevN: vec3f = vec3f(0.0, 1.0, 0.0);
  var curMed: i32 = -1;
  var aovDone: bool = false;
  var volEvents: i32 = 0;
  var aovTint: vec3f = vec3f(1.0, 1.0, 1.0);
  let p5: vec4f = U(5);
  let maxDepth: i32 = i32(p5.y);
  let rrAfter: i32 = i32(p5.z);
  let flags: i32 = i32(p5.w);
  let neeOn: bool = (flags & 1) != 0;
  let misOn: bool = (flags & 2) != 0;
  let fogOn: bool = U(18).w > 0.5;
  let fog: vec4f = U(17);
  let fogAlb: vec3f = U(18).xyz;
  let nc: i32 = nLightChoices();
  let nl: i32 = i32(U(19).y);
  let sel: f32 = 1.0 / f32(max(nc, 1));
  for (var depth: i32 = 0; depth <= maxDepth; depth++) {
    let h: Hit = traceScene(ro, rd, BIG);
    // ---- media: fog outside objects, or the medium inside one ----
    var scattered: bool = false;
    var medSig: vec3f = vec3f(0.0, 0.0, 0.0);
    var medAlb: vec3f = vec3f(0.0, 0.0, 0.0);
    var medG: f32 = 0.0;
    var hetero: bool = false;
    if (curMed >= 0) { let m0: vec4f = mRow(curMed, 0); let m1: vec4f = mRow(curMed, 1); hetero = m1.w > 0.5; medSig = select(m0.xyz, vec3f(mRow(curMed, 2).w, mRow(curMed, 2).w, mRow(curMed, 2).w), hetero); medAlb = m1.xyz; medG = m0.w; }
    else { if (fogOn) { medSig = fog.xyz; medAlb = fogAlb; medG = fog.w; } }
    if (maxc(medSig) > 0.0) {
      let sAvg: f32 = (medSig.x + medSig.y + medSig.z) / 3.0;
      let tEnd: f32 = select(1e4, h.t, h.ok);
      // the part of this segment inside the medium: all of it for an object's interior, the fog sphere for the air
      var segA: f32 = 0.0;
      var segB: f32 = tEnd;
      if (curMed < 0) { let fs: vec2f = fogSeg(ro, rd, tEnd); segA = fs.x; segB = fs.y; }
      if (hetero) {
        // delta tracking against the majorant
        var t: f32 = 0.0;
        for (var k: i32 = 0; k < 256; k++) {
          t = t - log(1.0 - rnd()) / sAvg;
          if (t >= tEnd) { break; }
          let dens: f32 = densityOf(curMed, ro + rd * t);
          if (rnd() < dens / sAvg) { scattered = true; ro = ro + rd * t; break; }
        }
        if (scattered) { beta = beta * spec(medAlb); }
      } else { if (maxc(medAlb) <= 0.0) {
        // purely absorbing (coloured glass, liquids): Beer-Lambert along the whole segment, no sampling noise
        beta = beta * spec(exp(-medSig * min(segB - segA, 1e3)));
      } else {
        // scattering: decide "event or pass" with the analog probability, then place the event by a one-sample
        // mixture of free-flight (exponential) and equi-angular sampling toward the point and spot lights
        let tE: f32 = min(segB - segA, 1e4);
        let ro2: vec3f = ro + rd * segA;
        let q: f32 = 1.0 - exp(-sAvg * tE);
        if (rnd() < q) {
          var t: f32 = 0.0;
          let ul: f32 = rnd();
          let nlit: i32 = i32(U(19).y);
          var pick: i32 = -1;
          if (ul >= 0.5 && nlit > 0) { pick = min(i32((ul - 0.5) * 2.0 * f32(nlit)), nlit - 1); if (i32(lRow(pick, 0).x) > 1) { pick = -1; } }
          let u1: f32 = rnd();
          if (pick >= 0) {
            let c: vec3f = lRow(pick, 1).xyz;
            let dl: f32 = dot(c - ro2, rd);
            let D: f32 = max(length(c - ro2 - rd * dl), 1e-4);
            let ta: f32 = atan2(-dl, D); let tb: f32 = atan2(tE - dl, D);
            t = clamp(dl + D * tan(ta + u1 * (tb - ta)), 0.0, tE);
          } else {
            t = -log(1.0 - u1 * q) / sAvg;
          }
          // the mixture pdf of t over every way it could have been chosen
          let pExp: f32 = sAvg * exp(-sAvg * t) / max(q, 1e-8);
          var pEA: f32 = 0.0;
          var nPt: i32 = 0;
          for (var j: i32 = 0; j < nlit; j++) {
            if (i32(lRow(j, 0).x) > 1) { continue; }
            nPt = nPt + 1;
            let c: vec3f = lRow(j, 1).xyz;
            let dl: f32 = dot(c - ro2, rd);
            let D: f32 = max(length(c - ro2 - rd * dl), 1e-4);
            let ta: f32 = atan2(-dl, D); let tb: f32 = atan2(tE - dl, D);
            pEA = pEA + D / (max(tb - ta, 1e-8) * (D * D + (t - dl) * (t - dl)));
          }
          let fEA: f32 = select(0.0, 0.5 / f32(max(nlit, 1)), nlit > 0);
          let pdfT: f32 = (1.0 - fEA * f32(nPt)) * pExp + fEA * pEA;
          scattered = true; ro = ro2 + rd * t;
          beta = beta * spec(exp(-medSig * t) * medSig * medAlb / max(q * pdfT, 1e-12));
        } else {
          beta = beta * spec(exp(-medSig * tE) / max(1.0 - q, 1e-8));
        }
      } }
      if (scattered) {
        if (!aovDone) { po.alb = medAlb * aovTint; po.nrm = -rd; if (depth == 0) { po.depth = length(ro - ro0); } aovDone = true; }
        if (neeOn) { let fr0: Frame = frameOf(-rd); po.L = po.L + beta * neeAt(ro, -rd, fr0, -rd, lobeNone(), medG, true, misOn); }
        let nd: vec3f = sampleHG(-rd, medG, rnd2());
        pdfPrev = hgPhase(dot(rd, nd), medG); deltaPrev = false; prevP = ro; prevN = nd;
        rd = nd;
        // a scattering event inside a volume is not a surface bounce: random walks (subsurface, dense smoke) need
        // dozens of them, so they have their own budget and only Russian roulette ends them early
        volEvents = volEvents + 1;
        if (volEvents < 256) { depth = depth - 1; }
        if (volEvents > 8) { let q: f32 = clamp(maxc(beta), 0.05, 1.0); if (rnd() > q) { break; } beta = beta / q; }
        continue;
      }
    }
    if (!h.ok) {
      // escaped: environment and sun, weighted against light sampling
      let envP: f32 = select(max(dot(rd, prevN), 0.0) * INV_PI, hdriPdf(rd), i32(U(8).x) == 6);
      let wE: f32 = select(misW(pdfPrev, sel * envP), 1.0, deltaPrev || !neeOn || !misOn);
      po.L = po.L + beta * envL(rd) * select(wE, 1.0, U(8).x < 0.5);
      let sd: vec4f = U(6);
      let wS: f32 = select(misW(pdfPrev, sel / (TAU * (1.0 - sd.w))), 1.0, deltaPrev || !neeOn || !misOn);
      po.L = po.L + beta * sunL(rd) * wS;
      if (!aovDone) { po.alb = envL(rd) / max(lum(envL(rd)), 1e-6) * 0.5 * aovTint; po.nrm = vec3f(0.0, 0.0, 0.0); if (depth == 0) { po.depth = 1e4; } }
      break;
    }
    let wo: vec3f = -rd;
    var L: Lobe = evalMaterial(h, wo, rnd());
    // leaving a closed dielectric: the relative index is inverted (glass → air), so refraction bends away and TIR can occur
    if (!h.front && L.kind == 3 && (L.flags & 2) == 0) { L.ior = 1.0 / L.ior; }
    // ---- emission ----
    if (maxc(L.Le) > 0.0 && (h.front || h.lit < 0)) {
      var wL: f32 = 1.0;
      if (h.lit >= 0 && !deltaPrev && neeOn && misOn) { wL = misW(pdfPrev, sel * lightPdfAt(h.lit, prevP, rd, h)); }
      if (h.lit >= 0 && !deltaPrev && neeOn && !misOn) { wL = 0.0; }
      po.L = po.L + beta * spec(L.Le) * wL;
    }
    // denoiser guides: the first non-specular vertex (through glass and mirrors), so detail seen in them stays sharp
    if (!aovDone) {
      po.alb = select(L.c0, vec3f(0.8, 0.8, 0.8), L.kind == 2 || L.kind == 3 || L.kind == 5) * aovTint; if (L.kind == 2 && (L.flags & 1) != 0) { po.alb = L.c1 * aovTint; }
      po.nrm = L.N; if (depth == 0) { po.depth = h.t; }
      aovDone = !isDeltaLobe(L) || L.kind == 0;
    }
    if (L.kind == 0 || depth == maxDepth) { break; }
    // shading frame; flip shading normals that face away
    var Ns: vec3f = L.N;
    if (dot(Ns, h.Ng) < 0.0) { Ns = h.Ng; }
    let fr: Frame = frameT(Ns, L.T);
    // ---- next-event estimation ----
    if (neeOn && !isDeltaLobe(L)) { po.L = po.L + beta * L.w * neeAt(h.P, h.Ng, fr, wo, L, 0.0, false, misOn); }
    // ---- continue: sample the lobe ----
    let woL: vec3f = toLocal(fr, wo);
    let bs: BS = sampleLobe(L, woL, rnd2(), rnd());
    if (!bs.ok) { break; }
    let wi: vec3f = toWorld(fr, bs.wi);
    beta = beta * L.w * bs.w;
    if (maxc(beta) <= 0.0) { break; }
    pdfPrev = bs.pdf; deltaPrev = bs.delta; prevP = h.P; prevN = Ns;
    let goesIn: bool = dot(wi, h.Ng) < 0.0;
    ro = h.P + select(h.Ng, -h.Ng, goesIn) * EPS * 4.0;
    rd = wi;
    if ((bs.trans || L.kind == 6) && goesIn) {
      // crossing a boundary (h.Ng faces the incoming ray, so goesIn means "passes through"): entering a front face
      // takes the object's interior medium, leaving through a back face returns to the air (and its fog)
      curMed = select(-1, L.med, h.front);
    }
    if (depth >= rrAfter) { let q: f32 = clamp(maxc(beta), 0.05, 1.0); if (rnd() > q) { break; } beta = beta / q; }
    let cl: f32 = U(20).z;
    if (cl > 0.0 && depth >= 1) { let m: f32 = maxc(beta); if (m > cl) { beta = beta * (cl / m); } }
  }
  return po;
}

// AOV integrators and the custom kernel hook
fn traceAOV(ro: vec3f, rd: vec3f, mode: i32) -> vec3f {
  let h: Hit = traceScene(ro, rd, BIG);
  if (!h.ok) { if (mode == 1) { return envL(rd) / max(maxc(envL(rd)), 1.0); } return vec3f(0.0, 0.0, 0.0); }
  let L: Lobe = evalMaterial(h, -rd, rnd());
  if (mode == 1) { if (L.kind == 2 && (L.flags & 1) != 0) { return L.c1; } if (L.kind == 1 || L.kind == 4) { return L.c0; } return vec3f(0.8, 0.8, 0.8) + L.Le * 0.0; }
  if (mode == 2) { return L.N * 0.5 + 0.5; }
  if (mode == 3) { let z: f32 = 1.0 - exp(-h.t * 0.15); return vec3f(z, z, z); }
  if (mode == 4) {
    let fr: Frame = frameOf(h.Ng);
    let d: vec3f = toWorld(fr, cosHemi(rnd2()));
    let rad: f32 = U(20).y;
    let o: f32 = select(1.0, 0.0, occluded(h.P + h.Ng * EPS * 4.0, d, rad));
    return vec3f(o, o, o);
  }
  return vec3f(1.0, 0.0, 1.0);
}

fn cameraRay(px: vec2f, res: vec2f) -> Ray {
  let c1: vec4f = U(1); let c2: vec4f = U(2); let c3: vec4f = U(3); let c4: vec4f = U(4);
  let jit: vec2f = rnd2();
  let ndc: vec2f = vec2f((px.x + jit.x) / res.x * 2.0 - 1.0, 1.0 - (px.y + jit.y) / res.y * 2.0);
  let dir: vec3f = safeNorm(c4.xyz + c2.xyz * ndc.x + c3.xyz * ndc.y);
  var r: Ray;
  r.o = c1.xyz; r.d = dir;
  if (c1.w > 0.0) {
    // thin lens: a point on the aperture (a disc, or a polygon of blades), aimed at the focal plane
    let ft: f32 = c2.w / dot(dir, safeNorm(c4.xyz));
    let pf: vec3f = c1.xyz + dir * ft;
    var lu: vec2f = vec2f(0.0, 0.0);
    let blades: f32 = c3.w;
    let u: vec2f = rnd2();
    if (blades >= 3.0) {
      let seg: f32 = floor(u.x * blades);
      let a0: f32 = TAU * seg / blades + U(20).x;
      let a1: f32 = TAU * (seg + 1.0) / blades + U(20).x;
      var s: f32 = rnd();
      var t: f32 = rnd();
      if (s + t > 1.0) { s = 1.0 - s; t = 1.0 - t; }
      lu = vec2f(cos(a0), sin(a0)) * s + vec2f(cos(a1), sin(a1)) * t;
    } else { let rr: f32 = sqrt(u.x); lu = vec2f(rr * cos(TAU * u.y), rr * sin(TAU * u.y)); }
    let o: vec3f = c1.xyz + safeNorm(c2.xyz) * (lu.x * c1.w) + safeNorm(c3.xyz) * (lu.y * c1.w);
    r.o = o; r.d = safeNorm(pf - o);
  }
  return r;
}

struct PixOut {
  c: vec4f,
  alb: vec4f,
  nrm: vec4f,
}
fn renderPixel(px: vec2f, frameIx: u32) -> PixOut {
  let u0: vec4f = U(0);
  let res: vec2f = u0.xy;
  rngS = pcgH(u32(px.x) + u32(px.y) * 9781u + frameIx * 6271u + 17u) ^ pcgH(frameIx * 26699u + 3u + u32(U(24).x) * 7919u);
  gTime = U(4).w;
  var o: PixOut;
  o.c = vec4f(0.0, 0.0, 0.0, 0.0); o.alb = vec4f(0.0, 0.0, 0.0, 0.0); o.nrm = vec4f(0.0, 0.0, 0.0, 0.0);
  let spp: i32 = max(i32(u0.w), 1);
  let mode: i32 = i32(U(21).w);
  for (var s: i32 = 0; s < spp; s++) {
    var wgt: vec3f = vec3f(1.0, 1.0, 1.0);
    if (SPECTRAL_ON) {
      gLam = 380.0 + 400.0 * fract(rnd() + f32(s) * 0.618034);
      wgt = xyz2rgb(cmfXYZ(gLam)) * (400.0 / 106.857) * U(21).xyz;
    }
    // motion blur: each sample sees the scene at its own moment inside the shutter
    gTau = select(0.5, (f32(s) + rnd()) / f32(spp), U(24).y >= 2.0);
    let r: Ray = cameraRay(px, res);
    var col: vec3f = vec3f(0.0, 0.0, 0.0);
    if (mode == 20) {
      // the id pass: object, face and depth of the first hit
      let h: Hit = traceScene(r.o, r.d, BIG);
      col = select(vec3f(-1.0, -1.0, 1e4), vec3f(h.iid, f32(h.face), h.t), h.ok);
      o.c = vec4f(col, 1.0);
      return o;
    }
    if (mode == 0) {
      let p: PathOut = tracePath(r.o, r.d);
      col = p.L;
      o.alb = o.alb + vec4f(p.alb, 0.0);
      o.nrm = o.nrm + vec4f(p.nrm, p.depth);
    } else { if (mode == 9) { col = customKernel(r.o, r.d); } else { col = traceAOV(r.o, r.d, mode); } }
    if (mode == 0 && SPECTRAL_ON) { col = col * wgt; }
    if (!(col.x == col.x && col.y == col.y && col.z == col.z)) { col = vec3f(0.0, 0.0, 0.0); }
    col = min(col, vec3f(1e9, 1e9, 1e9));
    o.c = o.c + vec4f(col, 1.0);
  }
  return o;
}

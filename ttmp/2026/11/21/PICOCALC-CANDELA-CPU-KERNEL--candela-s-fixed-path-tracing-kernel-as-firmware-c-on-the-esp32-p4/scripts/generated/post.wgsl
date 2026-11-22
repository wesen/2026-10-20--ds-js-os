
fn agxCurve(x: vec3f) -> vec3f {
  let x2: vec3f = x * x;
  let x4: vec3f = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
fn tmAgx(c0: vec3f) -> vec3f {
  let c: vec3f = max(c0, vec3f(1e-10, 1e-10, 1e-10));
  let m: vec3f = vec3f(0.842479062253094 * c.x + 0.0784335999999992 * c.y + 0.0792237451477643 * c.z,
                       0.0423282422610123 * c.x + 0.878468636469772 * c.y + 0.0791661274605434 * c.z,
                       0.0423756549057051 * c.x + 0.0784336 * c.y + 0.879142973793104 * c.z);
  let lg: vec3f = clamp((log2(m) + 12.47393) / 16.5, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0));
  let v: vec3f = agxCurve(lg);
  let o: vec3f = vec3f(1.19687900512017 * v.x - 0.0980208811401368 * v.y - 0.0990297440797205 * v.z,
                       -0.0528968517574562 * v.x + 1.15190312990417 * v.y - 0.0989611768448433 * v.z,
                       -0.0529716355144438 * v.x - 0.0980434501171241 * v.y + 1.15107367264116 * v.z);
  return pow(clamp(o, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0)), vec3f(2.2, 2.2, 2.2));
}
fn tmAces(c: vec3f) -> vec3f { let a: vec3f = c * 0.6; return clamp((a * (2.51 * a + 0.03)) / (a * (2.43 * a + 0.59) + 0.14), vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0)); }
fn tmNeutral(c0: vec3f) -> vec3f {
  let sc: f32 = 0.76;
  let ds: f32 = 0.15;
  let x: f32 = min(c0.x, min(c0.y, c0.z));
  let off: f32 = select(0.04, x - 6.25 * x * x, x < 0.08);
  let c: vec3f = c0 - off;
  let pk: f32 = max(c.x, max(c.y, c.z));
  if (pk < sc) { return c; }
  let d: f32 = 1.0 - sc;
  let np: f32 = 1.0 - d * d / (pk + d - sc);
  let cc: vec3f = c * (np / pk);
  let g: f32 = 1.0 - 1.0 / (ds * (pk - np) + 1.0);
  return mix(cc, vec3f(np, np, np), g);
}
fn tmFilmic(c: vec3f) -> vec3f { let x: vec3f = max(vec3f(0.0, 0.0, 0.0), c - 0.004); let y: vec3f = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06); return pow(y, vec3f(2.2, 2.2, 2.2)); }
fn tonemap(c: vec3f, op: i32) -> vec3f {
  if (op == 0) { return tmAgx(c); }
  if (op == 1) { return tmAces(c); }
  if (op == 2) { return tmNeutral(c); }
  if (op == 3) { return c / (1.0 + c); }
  if (op == 4) { return tmFilmic(c); }
  return clamp(c, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0));
}
fn srgbEnc(c: vec3f) -> vec3f {
  let lo: vec3f = c * 12.92;
  let hi: vec3f = 1.055 * pow(max(c, vec3f(0.0, 0.0, 0.0)), vec3f(0.4166667, 0.4166667, 0.4166667)) - 0.055;
  return vec3f(select(hi.x, lo.x, c.x <= 0.0031308), select(hi.y, lo.y, c.y <= 0.0031308), select(hi.z, lo.z, c.z <= 0.0031308));
}
fn falseColor(v: f32) -> vec3f {
  // stops relative to middle grey: the reflected-meter reading sits at 0.125/1.2 of saturation
  let s: f32 = log2(max(v, 1e-8) / 0.104167);
  if (s < -6.0) { return vec3f(0.07, 0.02, 0.12); }
  if (s < -4.0) { return vec3f(0.17, 0.04, 0.24); }
  if (s < -2.0) { return vec3f(0.12, 0.37, 0.75); }
  if (s < -0.5) { return vec3f(0.35, 0.35, 0.35); }
  if (s < 0.5) { return vec3f(0.5, 0.5, 0.5); }
  if (s < 2.0) { return vec3f(0.8, 0.8, 0.8); }
  if (s < 3.0) { return vec3f(0.95, 0.76, 0.18); }
  if (s < 3.5) { return vec3f(0.91, 0.21, 0.11); }
  return vec3f(1.0, 0.0, 0.2);
}
fn atrousW(c0: vec3f, c1: vec3f, n0: vec3f, n1: vec3f, a0: vec3f, a1: vec3f, sc: f32, sn: f32, sa: f32) -> f32 {
  let dc: vec3f = c0 - c1;
  let wc: f32 = exp(-dot(dc, dc) / sc);
  let dn: f32 = max(0.0, dot(n0, n1));
  let wn: f32 = pow(dn, sn);
  let da: vec3f = a0 - a1;
  let wa: f32 = exp(-dot(da, da) / sa);
  return wc * wn * wa;
}

fn denoisePx(p: vec2i, stp: i32, res: vec2i, sc: f32, ex: f32) -> vec3f {
  let c0: vec3f = cAt(p);
  let n0: vec4f = nAt(p);
  let a0: vec3f = aAt(p);
  let e0: vec3f = c0 * ex;
  var sum: vec3f = vec3f(0.0, 0.0, 0.0);
  var ws: f32 = 0.0;
  for (var j: i32 = -2; j <= 2; j++) {
    for (var i: i32 = -2; i <= 2; i++) {
      let q: vec2i = clamp(p + vec2i(i, j) * stp, vec2i(0, 0), res - vec2i(1, 1));
      let kx: f32 = select(select(0.375, 0.25, abs(i) == 1), 0.0625, abs(i) == 2);
      let ky: f32 = select(select(0.375, 0.25, abs(j) == 1), 0.0625, abs(j) == 2);
      let c1: vec3f = cAt(q);
      let n1: vec4f = nAt(q);
      let w: f32 = kx * ky * atrousW(e0, c1 * ex, n0.xyz, n1.xyz, a0, aAt(q), sc, 32.0, 0.05) * exp(-abs(n0.w - n1.w) / max(0.03 * n0.w, 0.001));
      sum = sum + c1 * w;
      ws = ws + w;
    }
  }
  return sum / max(ws, 1e-8);
}
fn grainHash(p: vec2f, s: f32) -> f32 { return fract(sin(dot(p + s, vec2f(12.9898, 78.233))) * 43758.5453); }
fn displayPx(p: vec2i, res: vec2i) -> vec4f {
  let d0: vec4f = D(0);
  let d1: vec4f = D(1);
  let d2: vec4f = D(2);
  let d3: vec4f = D(3);
  let uv: vec2f = (vec2f(f32(p.x), f32(p.y)) + 0.5) / vec2f(f32(res.x), f32(res.y));
  let alb: vec3f = aAt(p);
  let nrm: vec3f = nAt(p).xyz;
  let view: i32 = i32(d1.z);
  if (view == 1) { return vec4f(srgbEnc(clamp(alb, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0))), 1.0); }
  if (view == 2) { return vec4f(srgbEnc(nrm * 0.5 + 0.5), 1.0); }
  if (view == 3) { let z: f32 = 1.0 - exp(-nAt(p).w * 0.15); return vec4f(z, z, z, 1.0); }
  var c: vec3f = cAt(p) * d0.w;
  if (d2.z > 0.0) {
    var g: vec3f = vec3f(0.0, 0.0, 0.0);
    for (var k: i32 = 0; k < 12; k++) {
      let a: f32 = f32(k) * 2.39996;
      let r: f32 = 3.0 + f32(k) * 2.2;
      let q: vec2i = clamp(p + vec2i(i32(cos(a) * r), i32(sin(a) * r)), vec2i(0, 0), res - vec2i(1, 1));
      g = g + max(cAt(q) * d0.w - 1.0, vec3f(0.0, 0.0, 0.0));
    }
    c = c + g * (d2.z / 12.0);
  }

  if (d1.y > 0.5) { return vec4f(falseColor(lum(c)), 1.0); }
  if (d2.x > 0.0) {
    let ndc: vec2f = uv * 2.0 - 1.0;
    let tc: f32 = 1.0 / sqrt(1.0 + sq(ndc.x * d3.x) + sq(ndc.y * d3.y));
    c = c * mix(1.0, tc * tc * tc * tc, d2.x);
  }
  var t: vec3f = tonemap(c, i32(d1.x));
  if (d2.y > 0.0) { let n: f32 = grainHash(vec2f(f32(p.x), f32(p.y)), d2.w) - 0.5; t = t * (1.0 + n * d2.y * 2.0); }

  return vec4f(srgbEnc(clamp(t, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0))), 1.0);
}

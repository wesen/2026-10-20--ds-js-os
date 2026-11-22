// cdl_overrides.inc: CPU replacements for kernel functions, included into the generated kernel's translation
// unit after every prototype (so they may call the WGSL originals, named <fn>_wgsl). Each block is compiled
// only when its switch is on; the generated forwarding definitions choose between it and the original.

#if CDL_INT_HASH
// pcg3d (Jarzynski and Olano, "Hash Functions for GPU Rendering", JCGT 2020) of the inputs' bit patterns.
// Candela calls these hashes on lattice points (noise3, voronoi3, the night sky's star field); a GPU computes
// fract(sin(x) * 43758.5453) in a few cycles, newlib's sinf needs Payne-Hanek reduction for such arguments.
static inline u32 cdl_bits(f32 v) { u32 u; memcpy(&u, &v, 4); return u; }
static inline void cdl_pcg3d(u32 &x, u32 &y, u32 &z) {
  x = x * 1664525u + 1013904223u; y = y * 1664525u + 1013904223u; z = z * 1664525u + 1013904223u;
  x += y * z; y += z * x; z += x * y;
  x ^= x >> 16u; y ^= y >> 16u; z ^= z >> 16u;
  x += y * z; y += z * x; z += x * y;
}
static inline vec3f cdl_cpu_hash3(vec3f p) {          // like hash3: three values in [-1, 1)
  u32 x = cdl_bits(p.x), y = cdl_bits(p.y), z = cdl_bits(p.z); cdl_pcg3d(x, y, z);
  const f32 k = 2.0f / 16777216.0f;
  return vec3f(f32(x >> 8u) * k - 1.0f, f32(y >> 8u) * k - 1.0f, f32(z >> 8u) * k - 1.0f);
}
static inline f32 cdl_cpu_hash13(vec3f p) {           // like hash13: one value in [0, 1)
  u32 x = cdl_bits(p.x), y = cdl_bits(p.y), z = cdl_bits(p.z); cdl_pcg3d(x, y, z);
  return f32(x >> 8u) * (1.0f / 16777216.0f);
}
#endif

#if CDL_SKY_TABLE
// The Preetham sky (skyL) as an N x N table over the upper hemisphere in hemi-octahedral coordinates:
// p = (d.x, d.z) / (|d.x| + d.y + |d.z|), then (u, v) = (p.x + p.z, p.x - p.z) fills the square [-1, 1]^2.
// The lookup needs one division and no trigonometry. Below the horizon skyL evaluates the horizon direction
// and multiplies by a ground factor; the lookup does the same with the table's horizon texels.
// The table depends on uniform rows 6 (sun direction) and 11-16 (Perez coefficients and scales) only, so
// bind() rebuilds it when those rows change; the workspace records the rows and the instance it was built by.
static const int SKY_N = CDL_SKY_N;
struct SkyWs { u32 tag; f32 sig[28]; f32 tex[CDL_SKY_N * CDL_SKY_N * 3]; };
static const SkyWs *gSky = nullptr;
static void cdl_sky_sig(f32 *s) {
  const int rows[7] = {6, 11, 12, 13, 14, 15, 16};
  for (int k = 0; k < 7; k++) { const vec4f r = U(rows[k]); s[4 * k] = r.x; s[4 * k + 1] = r.y; s[4 * k + 2] = r.z; s[4 * k + 3] = r.w; }
}
static int cdl_sky_bind(void *ws) {
  if (!ws) { gSky = nullptr; return 0; }
  SkyWs *w = (SkyWs *)ws;
  f32 sig[28]; cdl_sky_sig(sig);
  const u32 tag = (u32)(uintptr_t)&gSky;   // unique per kernel instance
  gSky = w;
  if (w->tag == tag && !memcmp(w->sig, sig, sizeof sig)) return 0;
  for (int j = 0; j < SKY_N; j++) for (int i = 0; i < SKY_N; i++) {
    const f32 u = (f32(i) + 0.5f) * (2.0f / f32(SKY_N)) - 1.0f, v = (f32(j) + 0.5f) * (2.0f / f32(SKY_N)) - 1.0f;
    const f32 px = 0.5f * (u + v), pz = 0.5f * (u - v), py = 1.0f - abs(px) - abs(pz);
    const vec3f c = skyL_wgsl(normalize(vec3f(px, py, pz)));
    f32 *t = w->tex + 3 * (j * SKY_N + i); t[0] = c.x; t[1] = c.y; t[2] = c.z;
  }
  w->tag = tag; memcpy(w->sig, sig, sizeof sig);
  return 1;
}
static inline vec3f cdl_sky_texel(i32 x, i32 y) { const f32 *t = gSky->tex + 3 * (y * SKY_N + x); return vec3f(t[0], t[1], t[2]); }
static vec3f cdl_cpu_skyL(vec3f d) {
  if (!gSky) return skyL_wgsl(d);
  const f32 inv = 1.0f / max(abs(d.x) + max(d.y, 0.0f) + abs(d.z), 1e-20f);
  const f32 px = d.x * inv, pz = d.z * inv, h = 0.5f * f32(SKY_N), top = f32(SKY_N - 1);
  const f32 fx = clamp((px + pz + 1.0f) * h - 0.5f, 0.0f, top), fy = clamp((px - pz + 1.0f) * h - 0.5f, 0.0f, top);
  const i32 x0 = i32(fx), y0 = i32(fy), x1 = min(x0 + 1, SKY_N - 1), y1 = min(y0 + 1, SKY_N - 1);
  const f32 tx = fx - f32(x0), ty = fy - f32(y0);
  vec3f c = mix(mix(cdl_sky_texel(x0, y0), cdl_sky_texel(x1, y0), tx), mix(cdl_sky_texel(x0, y1), cdl_sky_texel(x1, y1), tx), ty);
  if (d.y < 0.0f) { c = c * vec3f(0.25f, 0.23f, 0.21f) * exp(d.y * 3.0f); }
  return c;
}
#endif

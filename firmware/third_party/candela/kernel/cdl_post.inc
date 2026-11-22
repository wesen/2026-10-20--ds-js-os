// cdl_post.inc: the buffer accessors of Candela's post shader (src/render.js, the WGSL preamble of the
// denoise and display pipelines: D, W, cAt, aAt, nAt, sq, lum, safeNorm), written for the CPU, and powSn
// for CDL_POW32. Included into the generated post translation unit before its functions.
static const vec4f *gPostSrc, *gPostAlb, *gPostNrm, *gPostD;
static inline vec4f D(i32 i) { return gPostD[i]; }
static inline i32 W() { return i32(gPostD[0].x); }
static inline f32 sq(f32 x) { return x * x; }
static inline f32 lum(vec3f c) { return dot(c, vec3f(0.2126f, 0.7152f, 0.0722f)); }
static inline vec3f safeNorm(vec3f v) { const f32 l = length(v); return CDL_SEL(vec3f(0.0f, 1.0f, 0.0f), v / max(l, 1e-20f), l > 1e-20f); }
static inline vec3f cAt(vec2i p) { const i32 i = p.y * W() + p.x; const vec4f v = gPostSrc[i]; return v.xyz() / max(v.w, 1.0f); }
static inline vec3f aAt(vec2i p) { const i32 i = p.y * W() + p.x; return gPostAlb[i].xyz() / max(gPostD[0].z, 1.0f); }
static inline vec4f nAt(vec2i p) { const i32 i = p.y * W() + p.x; const vec4f n = gPostNrm[i] / max(gPostD[0].z, 1.0f); return vec4f(safeNorm(n.xyz()), n.w); }
#if CDL_POW32
// denoisePx passes the constant 32 as atrousW's normal exponent: five squarings instead of powf.
static inline f32 powSn(f32 x, f32 s) { if (s == 32.0f) { x = x * x; x = x * x; x = x * x; x = x * x; return x * x; } return pow(x, s); }
#endif

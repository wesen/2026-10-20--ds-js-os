// cdl_math.h: WGSL's scalar built-ins for the generated kernel, included inside its namespace.
// GCC built-ins, so sqrt, abs, min and max are single RV32F instructions (with -fno-math-errno) and the
// transcendental functions call newlib's single-precision libm, unless a CPU substitution replaces them.
// From PICOCALC-CANDELA-P4 scripts/04-wgsl2cpp.mjs (its CDL_FAST_MATH, split into three switches).

// floor through conversion: RV32F has no rounding-to-integer instruction, and newlib's floorf is a
// 25-instruction call. Exact for |x| < 2.1e9 (larger floats are integers already) and NaN; floor(-0.0) is +0.0.
inline f32 ffloor(f32 x) { if (!(x > -2.1e9f && x < 2.1e9f)) return x; const f32 t = f32(i32(x)); return t > x ? t - 1.0f : t; }
inline f32 abs(f32 a) { return __builtin_fabsf(a); }   inline i32 abs(i32 a) { return a < 0 ? -a : a; }
inline f32 sqrt(f32 a) { return __builtin_sqrtf(a); }
#if CDL_FAST_FLOOR
inline f32 floor(f32 a) { return ffloor(a); }
#else
inline f32 floor(f32 a) { return __builtin_floorf(a); }
#endif
inline f32 ceil(f32 a) { return __builtin_ceilf(a); }  inline f32 fract(f32 a) { return a - floor(a); }
#if CDL_FAST_TRIG
// One-step range reduction and a degree-9 odd polynomial: max error about 4e-6 on [-pi, pi]. For the large
// arguments of sine-based hashes the result is a different, still uniform, pseudo-random value (WGSL leaves
// sin's accuracy there unspecified as well).
inline f32 sin(f32 x) { const f32 k = ffloor(x * 0.15915494f + 0.5f); x = x - k * 6.2831853f;
  if (x > 1.5707963f) x = 3.1415927f - x; else if (x < -1.5707963f) x = -3.1415927f - x;
  const f32 x2 = x * x; return x * (1.0f + x2 * (-0.16666667f + x2 * (0.0083333310f + x2 * (-0.00019840874f + x2 * 2.7525562e-6f)))); }
inline f32 cos(f32 x) { return sin(x + 1.5707963f); }
#else
inline f32 sin(f32 a) { return __builtin_sinf(a); }    inline f32 cos(f32 a) { return __builtin_cosf(a); }
#endif
#if CDL_FAST_EXP
// exp(x) = 2^n * p(t), x log2(e) = n + t, p a degree-6 polynomial: 2e-7 relative error.
inline f32 exp(f32 x) { if (x < -87.0f) return 0.0f; if (x > 88.0f) x = 88.0f; const f32 y = x * 1.4426950f; const f32 n = ffloor(y), t = y - n;
  const f32 p = 1.0f + t * (0.69314718f + t * (0.24022652f + t * (0.055504109f + t * (0.0096181291f + t * 0.0013333558f))));
  union { f32 f; i32 i; } u; u.i = (i32(n) + 127) << 23; return p * u.f; }
#else
inline f32 exp(f32 a) { return __builtin_expf(a); }
#endif
inline f32 tan(f32 a) { return __builtin_tanf(a); }    inline f32 asin(f32 a) { return __builtin_asinf(a); }
inline f32 acos(f32 a) { return __builtin_acosf(a); }  inline f32 atan(f32 a) { return __builtin_atanf(a); }
inline f32 atan2(f32 a, f32 b) { return __builtin_atan2f(a, b); }
inline f32 exp2(f32 a) { return __builtin_exp2f(a); }
inline f32 log(f32 a) { return __builtin_logf(a); }    inline f32 log2(f32 a) { return __builtin_log2f(a); }
inline f32 pow(f32 a, f32 b) { return __builtin_powf(a, b); }
inline f32 min(f32 a, f32 b) { return __builtin_fminf(a, b); } inline f32 max(f32 a, f32 b) { return __builtin_fmaxf(a, b); }
inline i32 min(i32 a, i32 b) { return a < b ? a : b; }   inline i32 max(i32 a, i32 b) { return a > b ? a : b; }
inline u32 min(u32 a, u32 b) { return a < b ? a : b; }   inline u32 max(u32 a, u32 b) { return a > b ? a : b; }
inline f32 clamp(f32 x, f32 lo, f32 hi) { return min(max(x, lo), hi); } inline i32 clamp(i32 x, i32 lo, i32 hi) { return min(max(x, lo), hi); }
inline f32 sign(f32 a) { return a > 0.0f ? 1.0f : a < 0.0f ? -1.0f : 0.0f; }
inline f32 step(f32 e, f32 x) { return x >= e ? 1.0f : 0.0f; }
inline f32 mix(f32 a, f32 b, f32 t) { return a + (b - a) * t; }
inline f32 smoothstep(f32 e0, f32 e1, f32 x) { const f32 t = clamp((x - e0) / (e1 - e0), 0.0f, 1.0f); return t * t * (3.0f - 2.0f * t); }
// WGSL's select evaluates both arguments; as a function, so does this one (CDL_SEL uses it when eager).
// The return type must be a value: `-> decltype(c ? t : f)` would be a reference to a parameter.
template <class A, class B> inline auto select(A f, B t, bool c) { return c ? t : f; }

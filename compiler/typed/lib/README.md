# Typed's f32 math library

`math.typed` holds the f32 functions Candela's kernel calls that RV32F has no instruction for, written in Typed
(PICOCALC-TYPED-F32). Typed has no imports: a program that uses them concatenates `math.typed` before its own
functions (and puts its `record` declarations first, since a program's declarations precede its functions; the
library declares none). Because the library is Typed, the WebAssembly oracle and the RV32 build compute the same bits
(`tests/compiler/typed-f32.test.mjs` checks every function under every policy on the reference interpreter, and
`tools/trace-repl/pkg/traceapi/f32_test.go` on the Go machine); bit-exactness with C's libm is not a goal.

| Function | Notes |
|---|---|
| `sinf(x)`, `cosf(x)`, `tanf(x)` | Cephes's reduction by pi/4 in three parts and its degree-7/8 polynomials. Exact reduction up to about 51,000; beyond that accuracy degrades gradually; from 2^23 (every f32 is an integer there) `sinf` gives 0 and `cosf` 1. NaN and the infinities give NaN. `sinf(-0)` is -0. |
| `expf(x)`, `exp2f(x)` | `x = n ln 2 + r` (ln 2 in two parts), a degree-6 polynomial, `2^n` from its bits in at most two exact steps (`ldexpf`), so subnormal results round once. Overflow gives +infinity, underflow +0, NaN NaN. |
| `logf(x)`, `log2f(x)` | The mantissa in [sqrt(1/2), sqrt(2)) from the bits (subnormals scaled by 2^24 first) and Cephes's degree-8 polynomial. 0 gives -infinity, a negative x or NaN gives NaN, +infinity itself. |
| `powf(x, y)` | `exp2f(y * log2f(x))` for x > 0; `powf(x, 0)` is 1, `powf(0, y)` is 0 for y > 0 and +infinity for y < 0, a negative x gives NaN (Candela raises only non-negative bases). Its error grows with the size of `y log2 x` (the table). |
| `atanf(x)`, `atan2f(y, x)` | Reduction around 0, pi/4 and pi/2 and Cephes's odd degree-9 polynomial; `atan2f` has C's quadrants, signed zeros and infinities. |
| `asinf(x)`, `acosf(x)` | Cephes's polynomial on [0, 1/2] and `asin(a) = pi/2 - 2 asin(sqrt((1 - a) / 2))` above it; `acosf` keeps the bits of pi/2 that f32 pi/4 misses. Outside [-1, 1]: NaN. |
| `fract`, `mix`, `clamp`, `saturate`, `step`, `sign`, `smoothstep` | WGSL's definitions as `firmware/third_party/candela/kernel/cdl_math.h` writes them: `fract(x) = x - floor(x)`, `mix(a, b, t) = a + (b - a) t`, `clamp(x, lo, hi) = min(max(x, lo), hi)` (so `clamp(NaN, 0, 1)` is 0, by Typed's min/max rule). |
| `ldexpf(x, n)`, `pow2i(n)` | `x * 2^n` for n in [-276, 254]; `2^n` for n in [-126, 127] from its bits. |

## Accuracy

`node compiler/typed/lib/accuracy.mjs` compiles the library to WebAssembly and compares each function with
`Math.fround` of JavaScript's double-precision function, in ulps of the f32 result (+0 and -0 are one point; NaN
against NaN is 0), over 200,000 samples per domain and the edge inputs listed in the script. The RV32 build equals the
WebAssembly build bit for bit, so the table holds for the device. "Max abs error" is the largest absolute difference
from the double-precision result; it matters where the result is near a zero of the function (sin and cos of large
arguments), where an ulp is tiny.

| Function | Domain | Samples | Max ulp | Mean ulp | Max abs error | Worst input |
|---|---|---:|---:|---:|---:|---|
| `sinf` | [-pi, pi] | 200000 | 1 | 0.113 | 6.7e-8 | -0.24661915004253387 |
| `sinf` | [-100, 100] | 200000 | 1 | 0.164 | 7.6e-8 | -52.60317611694336 |
| `sinf` | [-8192, 8192] | 200000 | 33 | 0.167 | 7.5e-8 | 2839.999755859375 |
| `sinf` | [2^-20, 1) | 200000 | 1 | 0.01 | 6.4e-8 | 0.1515137404203415 |
| `sinf` | edges | 11 | 0 |  |  |  |
| `cosf` | [-pi, pi] | 200000 | 1 | 0.183 | 7.5e-8 | -2.029209613800049 |
| `cosf` | [-100, 100] | 200000 | 1 | 0.167 | 7.4e-8 | 7.826147556304932 |
| `cosf` | [-8192, 8192] | 200000 | 232 | 0.167 | 7.5e-8 | 3099.18115234375 |
| `cosf` | edges | 7 | 0 |  |  |  |
| `tanf` | [-1.5, 1.5] | 200000 | 3 | 0.399 | 0.0000016 | 1.313955545425415 |
| `tanf` | [-pi/4, pi/4] | 200000 | 2 | 0.335 | 1.4e-7 | 0.6463269591331482 |
| `tanf` | edges | 4 | 0 |  |  |  |
| `expf` | [-1, 1] | 200000 | 1 | 0.095 | 1.7e-7 | 0.27343589067459106 |
| `expf` | [-87, 88.7] | 200000 | 1 | 0.099 | 1.5e+31 | -55.53923797607422 |
| `expf` | [-103.9, -87] (subnormal) | 200000 | 1 | 0.02 | 1.0e-45 | -87.6727523803711 |
| `expf` | edges | 11 | 0 |  |  |  |
| `exp2f` | [-1, 1] | 200000 | 1 | 0.106 | 1.4e-7 | 0.2080708146095276 |
| `exp2f` | [-126, 127.9] | 200000 | 1 | 0.107 | 2.3e+31 | 123.62612915039062 |
| `exp2f` | [-149, -126] (subnormal) | 200000 | 1 | 0.022 | 1.1e-45 | -126.80623626708984 |
| `exp2f` | edges | 10 | 1 |  |  | 0.5 |
| `logf` | [0.5, 2] | 200000 | 1 | 0.076 | 3.9e-8 | 0.8634141683578491 |
| `logf` | 2^[-126, 128) | 200000 | 1 | 0.007 | 0.0000038 | 0.7238845825195312 |
| `logf` | subnormals | 200000 | 1 | 0.001 | 0.0000038 | 5.844255375313082e-41 |
| `logf` | edges | 10 | 0 |  |  |  |
| `log2f` | [0.5, 2] | 200000 | 1 | 0.171 | 6.1e-8 | 1.6444423198699951 |
| `log2f` | 2^[-126, 128) | 200000 | 1 | 0.007 | 0.0000038 | 0.0000012121901136197266 |
| `log2f` | subnormals | 200000 | 1 | 0.001 | 0.0000077 | 1.9211801945893242e-42 |
| `log2f` | edges | 10 | 0 |  |  |  |
| `powf` | x in [0, 1], y in [0.45, 2.2] | 200000 | 21 | 0.513 | 8.5e-8 | 0.002911021700128913, 1.9055496454238892 |
| `powf` | x in [0.01, 100], y in [-4, 4] | 200000 | 21 | 2.538 | 1.0e+2 | 83.1884536743164, 3.9184911251068115 |
| `powf` | x in [0.5, 2], y in [-60, 60] | 200000 | 48 | 3.979 | 1.5e+12 | 0.5711753368377686, 54.52328872680664 |
| `powf` | edges | 8 | 0 |  |  |  |
| `atanf` | [-1, 1] | 200000 | 3 | 0.33 | 9.2e-8 | 0.43704041838645935 |
| `atanf` | [-100, 100] | 200000 | 2 | 0.363 | 1.3e-7 | 0.5192593932151794 |
| `atanf` | 2^[-30, 30) | 200000 | 3 | 0.192 | 1.4e-7 | 0.4334363639354706 |
| `atanf` | edges | 10 | 0 |  |  |  |
| `atan2f` | y, x in [-10, 10] | 200000 | 3 | 0.342 | 2.7e-7 | 3.878619909286499, 8.993159294128418 |
| `atan2f` | y in [-1, 1], x in [-1e-3, 1e-3] | 200000 | 2 | 0.367 | 2.4e-7 | 0.00017182156443595886, 0.00039043650031089783 |
| `atan2f` | edges | 17 | 0 |  |  |  |
| `asinf` | [-1, 1] | 200000 | 2 | 0.331 | 1.6e-7 | 0.5020632743835449 |
| `asinf` | [-0.5, 0.5] | 200000 | 1 | 0.038 | 3.4e-8 | -0.3707135319709778 |
| `asinf` | (0.99, 1] | 200000 | 1 | 0.363 | 1.2e-7 | 0.997150182723999 |
| `asinf` | edges | 8 | 0 |  |  |  |
| `acosf` | [-1, 1] | 200000 | 2 | 0.498 | 2.9e-7 | 0.10558345913887024 |
| `acosf` | [-0.5, 0.5] | 200000 | 2 | 0.689 | 2.0e-7 | -0.35416558384895325 |
| `acosf` | (0.99, 1] | 200000 | 1 | 0.251 | 1.5e-8 | 0.9916015863418579 |
| `acosf` | [-1, -0.99) | 200000 | 1 | 0.365 | 2.2e-7 | -0.9981259107589722 |
| `acosf` | edges | 8 | 1 |  |  | 0 |

The large ulp counts of `sinf` and `cosf` on [-8192, 8192] are at arguments next to a multiple of pi (pi/2), where the
result is close to zero: the absolute error stays below 7.6e-8 there. `powf`'s error is that of `exp2f` amplified by
`y log2 x`.

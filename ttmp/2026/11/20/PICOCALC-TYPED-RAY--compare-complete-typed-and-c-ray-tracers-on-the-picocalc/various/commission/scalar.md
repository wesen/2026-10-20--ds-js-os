---
Title: Opus scalar research consultation
Ticket: PICOCALC-TYPED-RAY
DocType: reference
Topics: [compiler, performance]
Status: complete
---

Independent research memo. Model: claude-opus-5-5. Effort: high. The author received the public-topic prompt under scripts/commission/scalar.txt and no project sources or raw measurements. Treat proposed methods and examples as hypotheses until checked in the project.

# Research Memo: A Differential Oracle for an Integer Orthographic Sphere Ray Tracer

**Status:** Design proposal. No experiments have been run. Every number in this memo comes from hand arithmetic shown in the text, and each one can be re-derived from the definitions given here. Nothing is a measured result.

---

## 0. Problem statement

The implementation under test (IUT) renders spheres with an orthographic camera using only integer arithmetic. Its outputs are:

- a per-pixel **ID buffer**: which sphere is visible, or background;
- a per-pixel **depth buffer**: the quantized depth of the visible hit;
- a per-pixel **RGB565 color**, computed with Lambert shading and hard shadows from one directional light.

We want a **differential oracle**: a reference implementation plus a set of checks that, given the same scene, predicts every output bit, and classifies each disagreement as one of:

1. an IUT defect;
2. a reference defect;
3. a property of the specification itself, such as quantization reordering two surfaces.

Separating (3) from (1) is the central design problem. An integer tracer is not wrong when it disagrees with real-number geometry. It is wrong when it disagrees with its own stated integer rules.

---

## 1. Normative integer specification

An oracle cannot exist without a precise spec. The choices below are deliberate. Each one marked **[choice]** must be fixed before testing, because each produces different, equally valid outputs.

**Scene**
- Spheres `s` with integer center `(cx, cy, cz)`, integer radius `r ≥ 1`, unique ID in `1..N`, and base color `(R8, G8, B8)`. ID `0` means background.
- Directional light: integer vector `L = (lx, ly, lz)` pointing from the surface toward the light, with integer length `Lq`, so `lx² + ly² + lz² = Lq²` **[choice]**. Such vectors are Pythagorean quadruples, for example `(2, 3, 6)` with `Lq = 7`. This keeps Lambert's ratio an exact rational number with no square root of the light vector.
- Ambient level `amb` in `[0, 255]`. This memo uses `amb = 32`.

**Camera**
- Pixel `(i, j)` maps to the ray origin `(X0 + i, Y0 + j, Zcam)` **[choice: integer pixel coordinates]**. Half-integer pixel centers can be handled by doubling all coordinates.
- Rays travel in the `+z` direction, so a smaller `z` is nearer.
- Precondition: `cz − r > Zcam` for every sphere. Scenes that violate this are rejected and tested separately (§7, case 11).

**Primary visibility, per sphere and pixel**
```
dx = x − cx,  dy = y − cy
D  = r² − (dx² + dy²)              # discriminant
if D < 0: miss
h  = isqrt(D)                      # floor square root
zq = cz − h                        # quantized near depth
```

**Visibility rule:** the winner minimizes the pair `(zq, ID)` in lexicographic order. Ties go to the lowest ID **[choice]**.

**Shading of the winner**
```
N   = (dx, dy, −h)                 # unnormalized normal; |N|² ≤ r²
dot = dx·lx + dy·ly − h·lz
if dot ≤ 0 or shadowed:  I = amb
else:                    I = amb + floor((255 − amb)·dot / (r·Lq))
```

**Shadow rule:**
- Cast from the integer hit point `P = (x, y, zq)` along `L`.
- Test against every sphere except the winner **[choice: self-exclusion by ID]**.
- A sphere occludes if the ray meets it at some `t > 0`.
- A tangent contact counts as occlusion **[choice: closed]**.
- The shadow test runs only when `dot > 0`. This does not change the result, because the intensity is `amb` either way when `dot ≤ 0`.

**Color**
```
ch     = floor(base_ch · I / 255)                    for each channel
rgb565 = ((R >> 3) << 11) | ((G >> 2) << 5) | (B >> 3)    # [choice: truncation]
```
- The output is compared as a `uint16`. Byte order in memory is a separate, explicit check.
- Background pixels get `ID = 0`, `rgb565 = 0x0000`, and a sentinel depth **[choice]**.

**Invariant guaranteed by the spec:** `I ≤ 255`, with no clamp needed.
- By Cauchy–Schwarz, `dot ≤ |N|·Lq`.
- `|N|² = dx² + dy² + h² ≤ dx² + dy² + D = r²`, so `|N| ≤ r`.
- Therefore `(255 − amb)·dot / (r·Lq) ≤ 255 − amb`.

An IUT that ever produces `I > 255`, or that needs a clamp to avoid it, is using a different square root or normal. This makes `I ≤ 255` a free assertion.

---

## 2. Oracle architecture

The oracle has four layers, each with a different job.

| Layer | What it computes | What a mismatch means |
|---|---|---|
| **R_int**: bit-exact reference | The spec of §1, executed with arbitrary-precision integers (e.g., Python `int`) | IUT defect, usually overflow, rounding, or a spec misreading |
| **R_int′**: second independent reference | The same spec, written separately in C with `__int128` intermediates | If R_int and R_int′ disagree, the defect is in a reference |
| **R_exact**: exact-geometry visibility | Visible ID under real-number depth `cz − √D`, decided exactly using integers | A spec property, not a defect. Reported, never failed |
| **Invariants and metamorphic relations** | Assertions such as `I ≤ 255`, plus relations between transformed scenes | IUT defect, detectable even without trusting the reference |

**Why arbitrary precision in R_int:** the reference must not share the IUT's overflow behavior. Suppose the IUT computes `dx²` in `int32` and the product wraps. The bigint reference does not wrap, so the wrap shows up as a mismatch instead of being reproduced silently.

**Comparison granularity:**
- The minimum comparison is the ID buffer, the depth buffer, and the RGB565 framebuffer.
- If the IUT can expose a debug buffer of intermediates `(D, h, dot, shadowed, I)`, compare those as well.
- The first diverging intermediate localizes the defect. This shortens diagnosis much more than comparing final colors alone.

---

## 3. Two exact results that keep the oracle simple

### 3.1 Quantized order can disagree with exact order only on ties

- The exact near depth is `z* = cz − √D`, with `√D ∈ [h, h+1)`.
- Therefore `z* ∈ (zq − 1, zq]`.
- If `zq_i < zq_j`, then `zq_i ≤ zq_j − 1`, because both are integers.
- This gives `z*_i ≤ zq_i ≤ zq_j − 1 < z*_j`.

**Consequence:** a strict quantized ordering always matches the exact ordering. R_exact only needs to run on pixels where two or more spheres share the minimal `zq`.

The hit sets are also identical in both layers. The test `D < 0` is exact on integers, so negative discriminants are never a source of exact-versus-quantized divergence.

### 3.2 When can two exact depths tie?

- An exact tie means `a − √p = b − √q`, where `a, b` are centers and `p, q` are discriminants.
- If `a = b`, a tie requires `p = q`.
- Otherwise, `√p − √q = a − b` is a nonzero integer `k`. Squaring `√p = k + √q` gives `p = k² + q + 2k√q`, which forces `√q` to be rational, so `q` is a perfect square, and then `p` is too.

**Consequence:** exact ties occur only when (same `cz` and same `D`) or (both `D` are perfect squares and the depths are equal). In every other case R_exact returns a strict answer.

### 3.3 Exact depth comparison with integers only

We need the sign of `(a − √p) − (b − √q)` without computing a square root.

**Helper `sgn_ab(A, B, n)`:** the sign of `A + B√n`, for integers `A, B` and `n ≥ 0`.
- If `B = 0` or `n = 0`: return `sign(A)`.
- If `A ≥ 0` and `B > 0`: return `+1`.
- If `A ≤ 0` and `B < 0`: return `−1`.
- If the signs are opposite: `t = A² − B²n`. Return `sign(t)` when `A > 0`, and `−sign(t)` when `A < 0`.

**Depth comparison.** Let `e = a − b`.
- If `e ≥ 0`: both `e + √q` and `√p` are non-negative, so their difference has the same sign as the difference of their squares, `e² + q − p + 2e√q`. Return `sgn_ab(e² + q − p, 2e, q)`.
- If `e < 0`: by symmetry, return `−sgn_ab(e² + p − q, −2e, p)`.

The intermediate `A²` can exceed 64 bits for large coordinates (§4), so this layer runs on bigints.

### 3.4 Exact shadow predicate with integers only

The shadow ray is `P + tL` and the occluder is center `C`, radius `r`. Let:

- `m = P − C`
- `a = Lq²`
- `b = m·L`
- `c = m·m − r²`

The ray meets the sphere where `a·t² + 2b·t + c = 0`. The discriminant is `Δ = b² − a·c`.

If `Δ ≥ 0`, the larger root is `t₂ = (−b + √Δ)/a`, and `t₂ > 0` if and only if `√Δ > b`:
- If `b < 0`, this is always true.
- If `b ≥ 0`, it holds if and only if `Δ > b²`, which is equivalent to `c < 0`.

So:

```
occluded  ⇔  Δ ≥ 0  and  (b < 0  or  c < 0)
```

This needs no square root.
- The `Δ ≥ 0` test encodes the closed tangent rule. For the open rule, use `Δ > 0`.
- `c < 0` means `P` lies strictly inside the occluder.
- `c = 0` with `b ≥ 0` means `P` lies on the occluder's surface and the light points outward from it, so the point is lit.

**Lagrange's identity** gives a tight bound and a construction tool:

```
Δ = r²·Lq² − |m × L|²
```

Two consequences follow:
- `Δ ≤ r²·Lq²`.
- `Δ = 0` exactly when `|m × L|² = r²·Lq²`. This is how directed tangent cases are generated (§7, case 8).

---

## 4. Numeric ranges

Parameters:
- `C`: bound on all coordinates, `|coord| ≤ C`, including pixel coordinates;
- `R`: maximum radius;
- `Lq`: light vector length;
- `M = 2C + R`: bound on each component of `m`.

**Exact bounds**

| Quantity | Bound | Note |
|---|---|---|
| `dx`, `dy` | `2C` | Difference of two `int16` values needs 17 bits |
| `dx² + dy²`, no early reject | `8C²` | |
| `dx² + dy²`, with early reject `\|dx\| ≤ r`, `\|dy\| ≤ r` | `2R²` | The early reject is exact: `dx² > r²` implies `D < 0` |
| `D` when `D ≥ 0` | `R²` | So `h ≤ R` |
| `zq` | `[−C − R, C]` | |
| `dot` | `≤ r·Lq` | Cauchy–Schwarz, §1 |
| Lambert numerator `(255 − amb)·dot` | `≤ 255·R·Lq` | |
| Shadow intermediates `b²`, `\|a·c\|` | `≤ 3M²·Lq²` when `r ≤ √3·M` | |
| Shadow `Δ` | `≤ r²·Lq²` | Lagrange, §3.4 |
| Exact comparator `A²`, `B²n` | about `(4C² + R²)²` and `16C²R²` | Needs bigints or `int128` in general |

**Concrete `int32` thresholds, a common source of defects**
- `r²` fits in `int32` only when `r ≤ 46340`. `46340² = 2,147,395,600` fits; `46341² = 2,147,488,281` exceeds `2³¹ − 1 = 2,147,483,647`.
- `dx² + dy²` fits when `|dx|, |dy| ≤ 32767`, since `2·32767² = 2,147,352,578`. At `|dx| = |dy| = 32768` the sum is exactly `2³¹` and overflows.
- The Lambert numerator fits when `R·Lq ≤ 8,421,504`, because `255 × 8,421,504 = 2,147,483,520`.

**Example profile:** `C = 2¹⁴`, `R = 2¹²`, `Lq ≤ 2¹⁰`.
- `M = 36,864 < 2¹⁶`.
- Shadow intermediates are below `3·2³²·2²⁰ < 2⁵⁴`, so they fit in `int64`.
- Raising `C` and `R` to `2¹⁵` pushes the comparator's `A²` past `2⁶⁴`.

**Floating-point square root.** IEEE 754 binary64 has a correctly rounded `sqrt`. Under round-to-nearest, `floor(sqrt((double)n)) = isqrt(n)` for `0 ≤ n < 2⁵²`. Proof sketch:
- Let `k = isqrt(n) + 1`, so `k ≤ 2²⁶`.
- The gap from `√n` up to `k` exceeds `1/(2k)`, because `√(k² − 1) < k − 1/(2k)`.
- Half an ulp just below `k` is less than `k·2⁻⁵³`.
- `1/(2k) > k·2⁻⁵³` whenever `k² ≤ 2⁵²`, so rounding cannot reach `k`.
- Rounding cannot fall below `k − 1`, because `k − 1` is representable and rounding is monotone.

This argument does not cover `x87` extended precision, fast-math flags, `float32`, or `n ≥ 2⁵²`. Because the reachable range of `D` is `[0, R²]`, the cheaper and more conclusive approach is to test all `R² + 1` inputs exhaustively.

---

## 5. Reference pseudocode (R_int)

```python
def isqrt(n):                       # floor(sqrt(n)), n >= 0, digit-by-digit
    assert n >= 0                   # negative D must never reach here
    x, bit = 0, 1
    while bit * 4 <= n: bit *= 4    # highest power of 4 <= n
    while bit:
        if n >= x + bit:
            n -= x + bit
            x = (x >> 1) + bit
        else:
            x >>= 1
        bit >>= 2
    return x
# Postcondition, checked in tests: x*x <= n_orig < (x+1)*(x+1)

def primary(x, y, spheres):
    best = None
    for s in spheres:
        dx, dy = x - s.cx, y - s.cy
        D = s.r*s.r - (dx*dx + dy*dy)
        if D < 0: continue
        h = isqrt(D)
        zq = s.cz - h
        if best is None or (zq, s.id) < (best.zq, best.id):
            best = Hit(s, dx, dy, D, h, zq)
    return best

def shadowed(P, L, Lq, spheres, self_id):
    a = Lq*Lq
    for o in spheres:
        if o.id == self_id: continue
        m = (P.x - o.cx, P.y - o.cy, P.z - o.cz)
        b = m[0]*L[0] + m[1]*L[1] + m[2]*L[2]
        c = m[0]*m[0] + m[1]*m[1] + m[2]*m[2] - o.r*o.r
        if b*b - a*c >= 0 and (b < 0 or c < 0):
            return True
    return False

def shade_pixel(x, y, scene):
    hit = primary(x, y, scene.spheres)
    if hit is None:
        return Pixel(id=0, depth=SENTINEL, rgb=0x0000)
    lx, ly, lz = scene.L
    dot = hit.dx*lx + hit.dy*ly - hit.h*lz
    sh = False
    if dot > 0:
        sh = shadowed((x, y, hit.zq), scene.L, scene.Lq, scene.spheres, hit.s.id)
    if dot <= 0 or sh:
        I = scene.amb
    else:                              # all operands non-negative: floor == truncation
        I = scene.amb + ((255 - scene.amb) * dot) // (hit.s.r * scene.Lq)
    assert 0 <= I <= 255
    R, G, B = (c * I // 255 for c in hit.s.color)
    rgb = ((R >> 3) << 11) | ((G >> 2) << 5) | (B >> 3)
    return Pixel(id=hit.s.id, depth=hit.zq, rgb=rgb, dbg=(hit.D, hit.h, dot, sh, I))
```

**Note on division.** Every division in the spec has a non-negative numerator, because `dot` is tested before dividing. For non-negative operands, C's truncating `/` and Python's flooring `//` agree. Any spec change that allows negative numerators must name a rounding direction.

**R_exact,** applied only to pixels where two or more spheres share the minimal `zq`:

```python
def exact_winner(tied):                     # tied: hits sharing the minimal zq
    best = tied[0]
    for t in tied[1:]:
        s = cmp_depth(t.s.cz, t.D, best.s.cz, best.D)   # sign of z*_t − z*_best
        if s < 0 or (s == 0 and t.s.id < best.s.id):
            best = t
    return best.s.id    # compare with R_int's ID; a difference is a spec property
```

---

## 6. Worked example

**Scene**
- Light `L = (2, 3, −6)`, `Lq = 7`. Check: `4 + 9 + 36 = 49`. The negative `z` component means the light is on the camera side.
- `amb = 32`, `Zcam = 0`.
- Sphere 1: center `(3, 0, 17)`, `r = 3`, color `(255, 200, 40)`.
- Sphere 2: center `(0, 0, 20)`, `r = 5`, color `(40, 120, 255)`.

Both spheres satisfy `cz − r > 0`.

**Pixel `(x, y) = (1, 2)`**

**Step 1: primary visibility.**

| | Sphere 1 | Sphere 2 |
|---|---|---|
| `dx`, `dy` | `−2`, `2` | `1`, `2` |
| `dx² + dy²` | `8` | `5` |
| `D` | `9 − 8 = 1` | `25 − 5 = 20` |
| `h = isqrt(D)` | `1` | `4` (check: `16 ≤ 20 < 25`) |
| `zq` | `17 − 1 = 16` | `20 − 4 = 16` |
| exact `z*` | `16` | `20 − √20 ≈ 15.53` |

The quantized depths tie at 16. The tie-break rule picks **ID 1**. Depth is 16.

**Step 2: R_exact on the tie.** Compute `cmp_depth(17, 1, 20, 20)`:
- `e = −3 < 0`, so the result is `−sgn_ab(9 + 1 − 20, 6, 1) = −sgn_ab(−10, 6, 1)`.
- The signs are opposite with `A < 0`, so `t = 100 − 36 = 64` and `sgn_ab = −sign(64) = −1`.
- Overall result: `+1`. Sphere 1 is exactly farther.

R_exact therefore picks **ID 2**. The disagreement is reported as a spec-induced reordering, not a defect. Per §3.1, it is possible only because the quantized depths tied.

**Step 3: Lambert for ID 1.**
- `N = (−2, 2, −1)`. `|N|² = 9 = r²`; the normal has exact length because `D` is a perfect square.
- `dot = (−2)(2) + (2)(3) − (1)(−6) = −4 + 6 + 6 = 8`.
- `dot > 0`, so the shadow test runs.

**Step 4: shadow test against sphere 2.**
- `P = (1, 2, 16)`, so `m = (1, 2, −4)`.
- `a = 49`.
- `b = 2 + 6 + 24 = 32`.
- `c = 1 + 4 + 16 − 25 = −4`.

`c < 0`, so the hit point lies **inside sphere 2**. `Δ = 1024 + 196 = 1220 ≥ 0`, and the pixel is **shadowed**.

This is a direct consequence of quantization. Sphere 2's exact surface at this pixel is at `z ≈ 15.53`, in front of `z = 16`.

**Step 5: color.**
- `I = amb = 32`.
- `R = floor(255·32/255) = 32`.
- `G = floor(6400/255) = 25`.
- `B = floor(1280/255) = 5`.
- RGB565 fields: `32 >> 3 = 4`, `25 >> 2 = 6`, `5 >> 3 = 0`.
- `rgb565 = (4 << 11) | (6 << 5) | 0 = 8192 + 192 = 8384 = 0x20C0`.
- Little-endian bytes: `C0 20`.

**Expected R_int record**

| Field | Value |
|---|---|
| ID | 1 |
| depth | 16 |
| `D` | 1 |
| `h` | 1 |
| `dot` | 8 |
| shadowed | true |
| `I` | 32 |
| rgb565 | `0x20C0` |

**Diagnostic counterfactuals.** Each value below is what a specific defect or alternative choice would produce.

- **Shadow test skipped or broken** (ID 1 unshadowed):
  - `I = 32 + floor(223·8/21) = 32 + floor(1784/21) = 32 + 84 = 116`.
  - Colors: `R = 116`, `G = floor(23200/255) = 90`, `B = floor(4640/255) = 18`.
  - `rgb565 = (14 << 11) | (22 << 5) | 2 = 0x72C2`.
- **Tie-break inverted, or ordering by exact depth** (ID 2 wins):
  - `N = (1, 2, −4)`, `|N|² = 21 < 25`. `dot = 2 + 6 + 24 = 32`.
  - Shadow test against sphere 1: `m = (−2, 2, −1)`, `c = 9 − 9 = 0`, `b = −4 + 6 + 6 = 8 ≥ 0`, so the point is **not occluded**. This is the `c = 0` boundary: `P` lies exactly on sphere 1's surface.
  - `I = 32 + floor(223·32/35) = 32 + floor(7136/35) = 32 + 203 = 235`.
  - Colors: `R = floor(9400/255) = 36`, `G = floor(28200/255) = 110`, `B = 235`.
  - `rgb565 = (4 << 11) | (27 << 5) | 29 = 0x237D`.

This one pixel exercises five things at once: the tie-break, the exact comparator, the inside-occluder shadow (`c < 0`), the on-surface boundary (`c = 0`), and the quantization of the normal.

---

## 7. Edge-case catalogue

Each case lists its construction, the expected value under §1, and the defect class it targets. Cases A–E use the `(2, 3, 6)` light family; the sign of each component is fixed per test.

| # | Case | Construction and expected value | Defect class targeted |
|---|---|---|---|
| 1 | Tangent pixel, `D = 0` | `r = 5`, offset `(5, 0)`: `D = 0`, `h = 0`, `zq = cz`, `N = (5, 0, 0)` | Treating `D = 0` as a miss; `isqrt(0)` |
| 2 | Just miss, `D = −1` | `r = 5`, offset `(5, 1)`: `D = −1`, so ID 0 | `≤` versus `<`; passing negative `D` to `isqrt`; casting to unsigned |
| 3 | `k² − 1` / `k²` boundary | `r = 5`, offsets `(0, 1)` and `(0, 0)`: `D = 24 → h = 4` and `D = 25 → h = 5` | `isqrt` off-by-one; float `sqrt` rounding |
| 4 | Integer Newton oscillation | `isqrt(3)`: the iteration `x ← (x + n/x)/2` from `x = 2` cycles 2 → 1 → 2. Expected `1` | A Newton loop that never terminates or stops on the wrong value; the correct rule stops when the next iterate is not smaller |
| 5 | `int32` wrap creates a phantom hit | Pixel `(32767, 32767)`, center `(−32768, −32768)`: `dx = dy = 65535`. `65535² = 4,294,836,225` wraps to `−131,071` in two's complement, so the sum becomes `−262,142` and `D = r² + 262,142 > 0`. Expected: miss | Overflow in `dx²`. Signed overflow is undefined behavior in C/C++, so actual IUT behavior may vary; run UBSan alongside |
| 6 | `r²` overflow | `r = 46341` with an `int32` IUT | `r²` computed in 32 bits |
| 7 | Quantized tie, exact order differs | §6: expected ID 1, with R_exact reporting ID 2. Also include identical spheres with different IDs, which are exact ties | Tie-break by list order instead of ID; `≤` versus `<` in the depth test |
| 8 | Tangent shadow ray, `Δ = 0` | Search small integer `m` and `L` for `\|m × L\|² = r²·Lq²` with `b < 0`. Expected: occluded under the closed rule | `Δ > 0` versus `Δ ≥ 0` |
| 9 | Hit point inside or on another sphere | §6: `c = −4` gives occluded; `c = 0` with `b ≥ 0` gives lit | Using `t ≥ 0`; missing the `c < 0` branch; adding an epsilon offset |
| 10 | Self-shadowing | The quantized `P` always satisfies `\|m\|² ≤ r²` for its own sphere, so `c ≤ 0` and self-exclusion is required | Missing self-exclusion, which shadows almost every lit pixel |
| 11 | Camera-plane precondition | `cz − r ≤ Zcam` | Undefined region; test whether the IUT rejects the scene or differs from a documented extension |
| A | Terminator, `dot = 0` | `L = (2, 3, −6)`, `r = 7`, offset `(3, −6)`: `D = 4`, `h = 2`, `N = (3, −6, −2)`, `dot = 6 − 18 + 12 = 0`. Expected `I = amb` | `dot < 0` versus `dot ≤ 0`; the shadow test must not affect this pixel |
| B | Maximum intensity | `L = (2, 3, −6)`, `r = 7`, offset `(2, 3)`: `D = 36`, `h = 6`, `N = (2, 3, −6)`, `dot = 49 = r·Lq`. Expected `I = 255` | Off-by-one producing 256; `uint8` wrap to 0 |
| C | Light along the view axis | `L = (0, 0, −1)`, `Lq = 1`: `dot = h` | Sign of `lz`; normal orientation |
| D | Smallest sphere, `r = 1` | Hits at the center pixel (`D = 1`, `h = 1`) and at the four axis neighbors (`D = 0`, `h = 0`) | Degenerate loops; the lighting denominator; `r = 0` must be rejected because it divides by zero |
| E | RGB565 field boundaries | Choose `I` and base colors so that channels land on 7/8, 247/248, and 255 (R, B) and on 3/4, 251/252 (G) | Rounding mode; field shifts; R/B swap; byte order |
| F | ID-buffer width | 256 and 65,536 spheres | IDs stored in an 8- or 16-bit buffer |
| G | Image geometry | `1×1`, odd widths, window offsets `X0, Y0 < 0` | Stride and indexing; negative coordinates combined with `>>` on signed values |

---

## 8. Proposed experiment, designed to be auditable

### 8.1 Artifacts fixed before any run

- The spec document from §1, with every **[choice]** resolved, and its hash.
- Commit hashes for R_int, R_int′, and R_exact.
- IUT commit hash, compiler and version, and build flags. At least two builds: production flags, and `-fsanitize=undefined,signed-integer-overflow`.
- Corpus generator code and its hash. Every random seed is recorded.
- A run manifest (JSON) recording all of the above, plus corpus counts and the exact command line needed to reproduce the run.

### 8.2 Stages

**E0. Reference self-validation.** Must pass before any IUT is tested.
- Exhaustive `isqrt` over `n ∈ [0, 2³²)`: that is 4,294,967,296 checks of the postcondition `h² ≤ n < (h+1)²`, computed with 128-bit products.
- For the 64-bit range: `n ∈ {k² − 1, k², k² + 1}` for every `k < 2²⁰`, plus logarithmically spaced `k` up to `2³²`.
- Run R_int and R_int′ on the full corpus. Any disagreement is a reference defect and stops the experiment.
- Check `cmp_depth` against a high-precision decimal evaluation (for example, 100 significant digits) on random inputs, excluding exact ties. Exact ties are classified by §3.2 instead.

**E1. Directed suite.**
- Every case in §7, plus the §6 pixel.
- Each fixture stores its scene, its expected per-pixel record, and the hand derivation as a comment.
- Pass criterion: exact equality on every field.

**E2. Exhaustive small worlds.**
- All single-sphere scenes with `r ∈ [1, 6]` and `(cx, cy) ∈ [−3, 3]²`, with `cz` fixed. Translation invariance (E4) covers other `cz` values.
- Each scene is rendered over the pixel window `[−9, 9]²`, under each light in the set: `(0,0,±1)`, `(0,3,−4)`, `(±1,±2,−2)`, `(±2,±3,−6)`, `(±4,±4,−7)`, `(±6,±6,−7)`.
- All ordered pairs of spheres from a smaller domain. Record the exact scene count produced by the generator in the manifest.

**E3. Stratified random corpus.** The generators are built around the boundaries:
- **Tangency:** pick a pixel, then set `r² = dx² + dy² + δ` with `δ ∈ {−1, 0, 1}`. This needs `r²` to be a square, so search over `(dx, dy, r)`.
- **Ties:** pick `D₁`, `D₂` and set `cz₂ = cz₁ − h₁ + h₂`.
- **Inside-occluder:** pairs where §3.1 ties occur.
- **Range extremes:** coordinates at `±C` and radii at `R`, using the thresholds in §4.
- **Uniform:** a baseline for comparison.

**E4. Metamorphic relations.** Each relation holds exactly under the §1 spec. Check each against the IUT alone, with no reference involved.
- Integer translation of all spheres and the pixel window in `x`/`y`: identical buffers.
- Integer translation of all `cz` and `Zcam` together: depth shifted by that amount; ID and color unchanged.
- Permuting the order of the sphere list while keeping IDs: identical buffers.
- Mirroring `x → −x` with `lx → −lx`: mirrored buffers.
- Swapping `x ↔ y` with `lx ↔ ly`: transposed buffers.
- Scaling the light, `L → kL` and `Lq → kLq`: identical output. Lambert's ratio cancels `k`; in the shadow predicate, `b` scales by `k` and `Δ` by `k²`, so all signs are preserved.
- Uniform scaling of geometry is **not** a valid relation, because `isqrt` does not commute with scaling. It is excluded.

**E5. Mutation analysis of the oracle.** This measures whether the oracle can detect defects at all. Inject each mutant into a copy of R_int′ and record which stages detect it:

| Mutant | Description |
|---|---|
| M1 | `int32` wrap in `dx² + dy²` |
| M2 | `isqrt` returns `h + 1` at perfect squares |
| M3 | Ceiling square root |
| M4 | Tie-break by list order |
| M5 | `D ≤ 0` treated as a miss |
| M6 | Shadow uses `Δ > 0` |
| M7 | Shadow uses `t ≥ 0` |
| M8 | No self-exclusion |
| M9 | `dot < 0` used instead of `dot ≤ 0` |
| M10 | RGB565 with round-half-up |
| M11 | R/B field swap |
| M12 | Big-endian store |
| M13 | 8-bit ID buffer |

**E6. Spec-property measurement.** This is descriptive only, with no pass/fail criterion. On the E3 uniform and tie corpora, report the fraction of pixels where R_int's ID differs from R_exact's ID, as a function of `R` and sphere density.

### 8.3 Pre-registered hypotheses

These are stated before any data exists.
- **H1:** Every mutant M1–M13 is detected by at least one E1 or E2 case.
- **H2:** Some mutants (candidates are M5, M6, M7, M9) are detected at a lower rate by the uniform E3 generator than by the boundary-biased generators.
- **H3:** The E6 divergence fraction is nonzero for every `R ≥ 2` in tie-rich corpora. §6 already shows a nonzero case at `R = 5`; the rate itself is unknown.

### 8.4 Reporting

For each IUT build, report:
- per-field mismatch counts by stage;
- the first mismatching intermediate for each failing pixel;
- a minimal reproducer for each distinct failure, shrunk by removing spheres and reducing coordinate magnitudes until the mismatch disappears;
- the mutant-detection matrix, as a table with one row per mutant and one column per stage.

Every reported number must be regenerable from the manifest. **All result cells are empty until the experiment is run.**

---

## 9. Limitations

1. **Common-mode spec errors go undetected.** If the spec itself is wrong, for example with a sign error in the normal, R_int and the IUT can agree and both be wrong. R_exact covers only visibility, and the metamorphic relations cover only symmetries.
2. **Reference correctness is assumed but not proved.** Two independent implementations reduce this risk without eliminating it. A defect shared through a common misreading of the spec would pass E0.
3. **R_exact is limited to visibility.** Exact real-number shading at the true hit point involves algebraic numbers, so it is not attempted. Divergences in color between the exact and quantized hit points are not characterized.
4. **Restricted lights.** Requiring Pythagorean-quadruple lights limits directions to rational points on the sphere. These are dense, but an IUT that normalizes arbitrary light vectors in fixed point needs that normalization added to the spec and reproduced bit for bit.
5. **Scope.** Orthographic camera, spheres only, one directional light, no anti-aliasing, no reflections. A perspective camera breaks the 2D discriminant structure and §3.1.
6. **Undefined behavior.** For a C/C++ IUT, the result of case 5 depends on compiler optimization. Running the same suite at two optimization levels plus UBSan is necessary but does not cover every outcome.
7. **Coverage is incomplete.** Exhaustive coverage is achieved only for `isqrt` and the small worlds. The rest is sampling, so passing shows only that no defect was found in the tested inputs.
8. **Black-box IUTs.** Without a debug buffer of intermediates, failures can be localized only by fields, which makes diagnosis slower.
9. **Floating-point IUTs** cannot be compared bit for bit against this oracle. They would need a tolerance-based oracle, which is a different design.

---

## 10. Summary

- The oracle is the integer spec, executed in arbitrary precision. A second independent implementation and exhaustive `isqrt` validation guard the reference itself.
- Two short proofs keep the exact layer cheap and decisive:
  - quantized depth order can differ from exact order only on ties;
  - both the depth comparison and the shadow test reduce to sign tests on integers, needing no square root.
- The highest-value cases cluster at four boundaries:
  - `D ∈ {−1, 0}`, `k² − 1`/`k²`, and `int32` thresholds (46340, 32767);
  - quantized ties;
  - hit points inside or on another sphere;
  - the `dot = 0` and `I = 255` extremes.
- The worked pixel at `(1, 2)` shows several of these interacting at once. Its expected output is `0x20C0`, and plausible defects produce `0x72C2` or `0x237D`.

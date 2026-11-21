---
Title: Opus compiler research consultation
Ticket: PICOCALC-TYPED-RAY
DocType: reference
Topics: [compiler, performance]
Status: complete
---

Independent research memo. Model: claude-opus-5-5. Effort: high. The author received the public-topic prompt under scripts/commission/compiler.txt and no project sources or raw measurements. Treat proposed methods and examples as hypotheses until checked in the project.

# Research Memo: Proof Obligations and a Falsifiable Experiment for a Bounded Integer Sphere Scanline Kernel

**Status:** This is a design document only. I have run nothing, and every performance statement below is a prediction or a hypothesis. All numeric values in the worked examples come from arithmetic on the defined kernel, not from any machine.

---

## 0. Summary

The kernel computes, for one scanline through a voxel sphere, a signed 16-bit value per pixel. The value is the squared-distance margin `c − dx²` inside the sphere and `−1` outside. The memo covers five things:

1. A reference semantics with no undefined behaviour, and the value ranges that let all per-pixel arithmetic fit in **signed halfwords** (int16).
2. Two eight-lane lowerings:
   - **inferred**, where an auto-vectorizer works from scalar C;
   - **explicit**, written with 8 × int16 operations on 128-bit vectors.
   It also covers why the inferred one may not narrow to 16-bit lanes.
3. A complete list of what must be proven: well-definedness, ranges, narrowing under wraparound, aliasing, tails, alignment and the recurrence invariants.
4. An inexpensive scalar optimization, **span clipping plus forward differencing**, with a worked example and a stated way it can fail.
5. An auditable experiment. Its correctness gate is *exhaustive* over the per-element domain, which is small enough to enumerate.

---

## 1. Problem definition

### 1.1 Inputs

- Sphere centre `(cx, cy, cz)` and radius `R`, all integers.
- A scanline fixed at `(y, z)`, starting at integer `x0`, of length `n ≥ 0`.
- Output buffer `out[0..n)` of `int16`.

### 1.2 Mathematical reference (unbounded integers)

```
for i in [0, n):
    dx = x0 + i − cx
    dy = y − cy
    dz = z − cz
    d  = R² − dx² − dy² − dz²
    out[i] = d   if d ≥ 0
             −1  otherwise
```

### 1.3 Precondition

`0 ≤ R ≤ 181`.

The bound comes from the output type. The largest stored value is `R²`, and it must satisfy `R² ≤ 32767`. Since 181² = 32761 and 182² = 33124, the limit is R = 181.

### 1.4 Per-scanline reduction

Define `c = R² − dy² − dz²`. Each output then depends only on the pair `(c, dx_i)`:

```
f(c, dx) = (dx² ≤ c) ? c − dx² : −1
```

This reduction drives both the narrowing argument and the exhaustive verification later.

---

## 2. Range analysis

All bounds assume the precondition and the per-row early-out described below.

| Quantity | Definition | Bound | Smallest safe type |
|---|---|---|---|
| `R` | input | [0, 181] | int16 |
| `R²` | | [0, 32761] | int16 |
| `dy`, `dz` | after early-out | [−R, R] | int16 |
| `k = dy² + dz²` | | [0, 2R²] = [0, 65522] | int32 (or uint16) |
| `c = R² − k` | | [−32761, 32761] | int16 |
| `c' = max(c, −1)` | normalized | [−1, 32761] | int16 |
| `dx` in the "middle" region | see §4 | [−181, 181] | int16 |
| `dx²` in the middle region | | [0, 32761] | int16 |
| `c' − dx²` | | [−32762, 32761] | int16 |
| `out[i]` | | {−1} ∪ [0, 32761] | int16 |

### 2.1 Per-row early-out

If `|dy| > R` or `|dz| > R`, the whole row is −1.

- Proof: `dy² > R²` implies `c < 0`, so `c − dx² < 0` for every `dx`.
- The early-out matters because coordinates are wider than 16 bits. Without it, `dy²` can overflow int32. For example, `|dy| ≥ 46341` already gives `dy² > 2³¹ − 1`.
- The early-out is what keeps `k` and `c` small.

### 2.2 Normalizing c

For any `c < 0`, `f(c, dx) = −1 = f(−1, dx)`. So clamping `c` to `−1` preserves results and bounds the subtraction.

### 2.3 The middle-region lemma

For `|dx| ≥ 182`, `dx² ≥ 33124 > 32761 ≥ c'`. Therefore `f = −1`.

Only indices whose `dx` lies in [−181, 181] need arithmetic. There are at most 363 such indices per row, independent of `n`.

---

## 3. Worked example (scalar semantics)

### 3.1 Setup

- `R = 5`, centre `(0, 0, 0)`.
- Scanline `y = 3`, `z = 0`, so `k = 9` and `c = 16`.
- `x0 = −6`, `n = 13`.

### 3.2 Per-pixel values

| i | dx | dx² | c − dx² | out |
|---|---|---|---|---|
| 0 | −6 | 36 | −20 | −1 |
| 1 | −5 | 25 | −9 | −1 |
| 2 | −4 | 16 | 0 | 0 |
| 3 | −3 | 9 | 7 | 7 |
| 4 | −2 | 4 | 12 | 12 |
| 5 | −1 | 1 | 15 | 15 |
| 6 | 0 | 0 | 16 | 16 |
| 7 | 1 | 1 | 15 | 15 |
| 8 | 2 | 4 | 12 | 12 |
| 9 | 3 | 9 | 7 | 7 |
| 10 | 4 | 16 | 0 | 0 |
| 11 | 5 | 25 | −9 | −1 |
| 12 | 6 | 36 | −20 | −1 |

### 3.3 Counterexample 1: clamping too tightly

Suppose an implementation clamps `|dx|` to 181 instead of splitting regions.

- Take `R = 181`, `k = 0`, so `c = 32761`.
- At `dx = 182`, the true result is `32761 − 33124 < 0`, so the output should be −1.
- The clamped computation gives `dx = 181`, `d = 0`, and outputs **0**. That is wrong.

Two fixes are available:

- clamp to 181 only under the stronger precondition `R ≤ 180`, because then `c' ≤ 32400 < 32761`; or
- use the region split in §4, which keeps R ≤ 181.

### 3.4 Counterexample 2: wrapping in an unstored tail lane

A full vector computed past the middle region can contain `dx = 188`.

- `188² = 35344`. In 16-bit two's complement this wraps to `35344 − 65536 = −30192`.
- With `c = 16`: `16 − (−30192) = 30208`.
- `max(30208, −1) = 30208`, which reads as "inside, margin 30208". The true answer is −1.

The lane is only harmless if it is provably never stored.

---

## 4. Code-generation variants

### V0: Reference

Uses int64 arithmetic and is used for testing only.

```
V0(out, n, x0, cx, cy, cz, R, y, z):
  dy = (int64)y − cy;  dz = (int64)z − cz
  for i in [0, n):
     dx = (int64)x0 + i − cx
     d  = (int64)R*R − dx*dx − dy*dy − dz*dz      // assumes |coords| ≤ 2^30
     out[i] = d ≥ 0 ? (int16)d : −1
```

### Row setup shared by V1–V4

```
SETUP(R, y, z, cy, cz) -> c':
  dy = y − cy;  dz = z − cz             // int64
  if |dy| > R or |dz| > R: return −1
  c = R*R − dy*dy − dz*dz               // fits int32
  return max(c, −1)
```

### V1: Natural scalar C (baseline)

```c
for (int64_t i = 0; i < n; i++) {
    int64_t dx64 = (int64_t)x0 + i - cx;
    int32_t dx = (int32_t)clamp64(dx64, -182, 182);   // keeps dx*dx defined in int32
    int32_t d  = c1 - dx * dx;
    out[i] = (int16_t)(d >= 0 ? d : -1);
}
```

- The clamp to ±182 is required for well-definedness in C. Without it, `dx*dx` in `int` is undefined behaviour for `|dx| ≥ 46341`.
- ±182 is correct for every `R ≤ 181`, by the middle-region lemma (182² > c').
- Range of `d` here: [−33125, 32761]. That **does not fit int16**, which matters for §4.1.

### V1c: Narrowing-friendly scalar C

V1c tests whether communicated ranges change the inferred lowering:

- `R ≤ 180` is stated through an assumption intrinsic (`__builtin_assume` in Clang, `[[assume]]` in C++23, or `if (!(c1 <= 32400)) __builtin_unreachable();` in GCC);
- `dx` is clamped to ±181.

Under those facts, `d ∈ [−32762, 32400]` and every intermediate fits int16.

### V2: Optimized scalar

Span clipping plus forward differencing. See §6.

### V3: Inferred vectorization

V1 and V1c compiled with the auto-vectorizer enabled.

### V4: Explicit 8 × int16, region split

The operation names are generic. The SSE2 and NEON equivalents are:

| Generic | SSE2 | NEON |
|---|---|---|
| splat16 | `_mm_set1_epi16` | `vdupq_n_s16` |
| add16 | `_mm_add_epi16` | `vaddq_s16` |
| mullo16 | `_mm_mullo_epi16` (`pmullw`) | `vmulq_s16` |
| sub16 | `_mm_sub_epi16` | `vsubq_s16` |
| max16 (signed) | `_mm_max_epi16` (`pmaxsw`) | `vmaxq_s16` |
| store | `_mm_storeu_si128` | `vst1q_s16` |

```
V4(out, n, x0, cx, c'):
  lo = clamp64(cx − 181 − x0,     0, n)     // first i with dx ≥ −181
  hi = clamp64(cx + 181 − x0 + 1, 0, n)     // one past last i with dx ≤ 181
  fill(out[0:lo], −1);  fill(out[hi:n], −1) // −1 is 0xFFFF, so memset(0xFF) works
  m = hi − lo
  if m == 0: return
  C    = splat16(c');  NEG1 = splat16(−1);  LANE = [0,1,2,3,4,5,6,7]
  base = x0 + lo − cx                       // ∈ [−181, 181]
  j = 0
  while j + 8 ≤ m:
     DX = add16(splat16(base + j), LANE)    // every lane ∈ [−181, 181]
     D  = sub16(C, mullo16(DX, DX))
     store_unaligned(out + lo + j, max16(D, NEG1))
     j += 8
  TAIL(m − j remaining)
```

Three tail strategies are tested separately:

- **T1, scalar epilogue.** Process the remaining elements one at a time with the element function.
- **T2, overlapping final block.** If `m ≥ 8`, recompute the block at `j' = m − 8` and store all 8 lanes. Every lane of that block lies inside the middle region, so there is no wrap. Indices in `[j', j)` are rewritten with identical values. If `m < 8`, fall back to T1, because extending into the fill regions would produce lanes with `|dx| > 181` (see §3.4).
- **T3, masked store.** For example AVX-512BW `vmovdqu16` with a k-mask, or an SVE predicate. The masked-off lanes may hold wrapped garbage, so the mask must be proven exact.

### Why SSE2 favours signed halfwords

- Baseline x86-64 (SSE2) has signed 16-bit min/max (`pminsw`/`pmaxsw`).
- It lacks unsigned 16-bit min/max and a 32-bit low multiply. `pminuw`/`pmaxuw` and `pmulld` arrived in SSE4.1.
- So an int32-lane lowering on the default `-march=x86-64` target needs `pmuludq`-plus-shuffle sequences or is not vectorized at all.
- NEON has both signed and unsigned forms.

### 4.1 Prediction about V3

This is a hypothesis, not a result.

- In C, int16 operands are promoted to `int`, so the vectorizer sees 32-bit operations.
- Narrowing based on demanded bits justifies computing `c − dx²` modulo 2¹⁶ when only the low 16 bits are used. This holds because the low 16 bits of a product or difference depend only on the low 16 bits of the operands.
- The comparison `d ≥ 0` demands the *sign of the true value*, which is all 32 bits. So narrowing requires a value-range proof, not a demanded-bits argument.
- For V1 no such proof exists: `d` can reach −33125.
- My prediction is that V3 compiled from V1 uses 32-bit lanes: 4 per 128-bit register, or 8 per 256-bit register under AVX2.
- The phrase "eight-lane" is therefore ambiguous. 8 × i32 in 256-bit and 8 × i16 in 128-bit are different lowerings, and the experiment must record which one occurred.
- Whether V1c's assumptions cause narrowing is an open question that the experiment tests.

### 4.2 Saturation pitfall (proof-obligation example)

An alternative to the region split is to keep a running `dx` vector updated with *saturating* adds and then clamp to ±181. That is incorrect.

- Updating `sat16(sat16(v) + 8)` per block is not equal to `sat16(v + 8)` once `v < −32776`.
- The running value drifts toward zero faster than the true `dx`.
- It can reach [−181, 181] while the true `dx` is still around −68000. For example, starting at `dx = −100000`.

Rebasing each block from an int64 scalar base, `sat16(b + 8j)`, and *then* adding lane offsets 0..7 is correct after the clamp. At the low end both paths give values ≤ −32761, which clamp to −181.

---

## 5. What must be proven

Each item lists its method: argument (A), exhaustive test (E), assembly inspection (I) or runtime guard (G).

### P1. Reference well-definedness (A)

- V0 uses int64 under `|coords| ≤ 2³⁰`.
- V1 avoids signed overflow through the early-out and the ±182 clamp.
- Converting an out-of-range `int` to `int16_t` is implementation-defined in C. Every conversion in V1 is of a value already in range.

### P2. Range table (A)

Every row of §2 is derived from the precondition. The early-out and normalization lemmas are proven as in §2.1 and §2.2.

### P3. Narrowing under wraparound (A + E)

- Lane arithmetic is exact modulo 2¹⁶.
- An int16 result equals the true integer whenever the true value lies in [−32768, 32767]. By P2, that holds for every lane that is stored.
- The `max16(D, −1)` select is correct only on stored lanes.

### P4. Region-split correctness (A + E)

- `lo` and `hi` bracket exactly the indices with `|dx| ≤ 181`.
- All indices outside get −1, by the middle-region lemma.
- `lo` and `hi` are computed in int64 to avoid overflow in `cx ± 181 − x0`.

### P5. Aliasing (A + I)

- **Struct aliasing.** If parameters arrive through a struct pointer, for example `struct sphere { int16_t cx, cy, cz, R; }`, then a store through `int16_t *out` may legally modify `s->cx`.
  - Type-based alias analysis cannot separate same-type accesses.
  - Expected consequences: per-iteration reloads, or loop versioning with a runtime overlap check, or no vectorization.
  - Fix: copy the fields to locals before the loop, or use `restrict`. Both rely on a caller contract that must be stated.
- **Read-modify-write variant.** A composite such as `out[i] = max(out[i], d)` with a separate input buffer requires proving the buffers are disjoint, or accepting the compiler's runtime check.
- **Overlap tail.** T2 is valid only if nothing the kernel reads lives in `out`.

### P6. Tails (A + E + G)

- Every index in [0, n) is written with the correct value.
- No byte outside `out[0..n)` is written. This is checked with guard canaries before and after the buffer.
- The overlap tail T2 is idempotent. For the plain store, rewriting the same value is idempotent. For the `max` variant, `max(max(a, d), d) = max(a, d)`.
- T2 requires `m ≥ 8`. T3 requires the mask to exactly equal `[0, m − j)`.

### P7. Alignment (I)

- Use unaligned stores, or prove alignment.
- Check that the compiler did not assume alignment it cannot know.

### P8. Recurrence invariants for V2 (A + E)

- Integer square root correctness: `r² ≤ c' < (r+1)²`.
- The recurrence equals the direct formula by induction.
- The bounds on the intermediates (in §6) fit their types.

### P9. Codegen claims are observations (I)

Statements such as "V3 uses 16-bit lanes" or "the scalar build was not vectorized" are verified from emitted assembly and optimization remarks. They are never inferred from timing.

---

## 6. Scalar optimization: span clipping with forward differencing

### 6.1 Derivation

For `c' ≥ 0`, let `r = isqrt(c')`. Then `out[i] ≥ 0` exactly when `dx ∈ [−r, r]`.

Inside that span:

```
d(dx+1) = c' − (dx+1)² = d(dx) − (2dx + 1)
s(dx)   = 2dx + 1,   s(dx+1) = s(dx) + 2
```

The second difference is constant (−2), so each pixel costs two adds and a store. There is no multiply, no comparison and no select.

### 6.2 Pseudocode

```
V2(out, n, x0, cx, c'):
  if c' < 0: fill(out[0:n], −1); return
  r  = isqrt(c')                         // see below
  lo = clamp64(cx − r − x0,     0, n)
  hi = clamp64(cx + r − x0 + 1, 0, n)
  fill(out[0:lo], −1);  fill(out[hi:n], −1)
  if lo ≥ hi: return
  dx = x0 + lo − cx                      // ∈ [−r, r]
  d  = c' − dx*dx                        // one multiply per row
  s  = 2*dx + 1
  for i in [lo, hi):
     out[i] = (int16)d
     d -= s
     s += 2
```

**isqrt.** Compute `r = (int)sqrt((double)c')` and then correct it:

```
while r*r > c':        r--
while (r+1)*(r+1) ≤ c': r++
```

Correctness is verified exhaustively for every `c' ∈ [0, 32761]`.

**Bounds inside the span.**

- `d ∈ [0, c'] ⊆ [0, 32761]`.
- `s ∈ [−2r + 1, 2r + 3] ⊆ [−361, 365]`. The upper end is the final unused update.
- So `d` and `s` fit in int16, and the loop could also run in int32 with no overflow concern.

### 6.3 Worked example (same row as §3, c' = 16)

- `r = 4`, since 4² = 16 ≤ 16 < 25.
- `lo = 0 + (−4) + 6 = 2`.
- `hi = 0 + 4 + 6 + 1 = 11`.
- Fill indices 0–1 and 11–12 with −1.
- Start: `dx = −4`, `d = 16 − 16 = 0`, `s = −7`.

| i | stored d | d after −s | s after +2 |
|---|---|---|---|
| 2 | 0 | 7 | −5 |
| 3 | 7 | 12 | −3 |
| 4 | 12 | 15 | −1 |
| 5 | 15 | 16 | 1 |
| 6 | 16 | 15 | 3 |
| 7 | 15 | 12 | 5 |
| 8 | 12 | 7 | 7 |
| 9 | 7 | 0 | 9 |
| 10 | 0 | −9 | 11 |

The stored column matches §3 at every index.

### 6.4 Reasoning about cost (prediction, not result)

| Aspect | V1 per element | V2 per element |
|---|---|---|
| Work | add, multiply, subtract, signed max or cmov, store | subtract, add, store |
| Loop-carried dependency | only the index | `d` and `s`, each a one-add chain |
| Per-row overhead | none | isqrt with fixups, two fills |

The outside regions in V2 become `memset`.

**Reasons it might not help:**

- Both variants may be bound by store throughput.
- A multiply that is not on a loop-carried path is usually pipelined.
- The isqrt overhead dominates short rows.
- The recurrence may block auto-vectorization of V2. A compiler's induction analysis may represent `d` as a quadratic add-recurrence, which loop vectorizers typically do not vectorize as an induction. I have not verified this for any specific compiler, so it is tested by inspection.

For this reason V2 is proposed as the **scalar** path. The vector path keeps the direct form, where one `mullo16` covers 8 lanes.

### 6.5 Falsifiable hypothesis H1

- **Claim.** With auto-vectorization disabled for both, V2's median cycles per element is at least 10% lower than V1's for rows with `n ≥ 64` and span fraction `(hi − lo)/n ≥ 0.5`, on both test machines.
- **Falsified if** the 95% bootstrap confidence interval for the V2/V1 ratio includes values above 0.90 on either machine.
- **Secondary prediction.** V2 is no faster than V1 for `n ≤ 16`.

---

## 7. Proposed experiment

### 7.1 Variants

| ID | Description |
|---|---|
| V0 | Reference (correctness only) |
| V1-s / V2-s | Scalar, vectorization disabled (GCC `-fno-tree-vectorize`; Clang `-fno-vectorize -fno-slp-vectorize`) |
| V3a | V1 with auto-vectorization enabled |
| V3c | V1c with auto-vectorization enabled |
| V4-T1 / V4-T2 / V4-T3 | Explicit 8 × int16 with each tail strategy (T3 only on AVX-512BW or SVE hardware) |
| V5-alias | V1 taking a struct pointer without `restrict`, versus locals |

### 7.2 Build matrix

- Two pinned compiler versions: one GCC and one Clang. Record exact versions and full flags.
- x86-64 targets: `-march=x86-64` (SSE2 baseline), `x86-64-v2`, `x86-64-v3`.
- AArch64 target: baseline NEON.

### 7.3 Correctness gate (must pass before any timing)

1. **Element function, exhaustive.**
   - For every `c' ∈ [−1, 32761]` and `dx ∈ [−181, 181]`, compare each compiled variant with V0. That is 32763 × 363 = 11,892,969 pairs.
   - Drive the compiled kernel, not a re-implementation. Use rows with `n = 363` positioned to cover the middle region.
   - For c' = −1, also include the c < 0 early-out path.
2. **Span recurrence, exhaustive.** V2 over every `c' ∈ [0, 32761]` with the span fully inside the row.
3. **Index and tail logic.**
   - All `n ∈ [0, 400]`.
   - Sphere offsets placing the span fully left, partially overlapping, inside, and fully right of the row.
   - Output pointer misalignment of 0–15 bytes.
   - 64-byte canaries on both sides of the buffer, checked after every call.
4. **Large-coordinate randomized tests** against V0 near `±2³⁰`, including all `|dy|` / `|dz|` boundary cases at `R` and `R + 1`.

Log the count of cases checked and the count of mismatches. Any mismatch voids timing for that variant.

### 7.4 Codegen audit (I)

For every build, archive:

- the assembly;
- optimization remarks (Clang `-Rpass=loop-vectorize -Rpass-missed=loop-vectorize`; GCC `-fopt-info-vec-all`).

Record per build:

- lane width and element type: look for `pmullw` vs `pmulld`/`pmuludq` on x86, and `.8h` vs `.4s` arrangements on AArch64;
- presence of runtime alias checks;
- epilogue form;
- whether the select became `max`, `cmov` or a branch.

### 7.5 Workloads

- **Rows.** `n ∈ {7, 8, 9, 15, 16, 17, 64, 363, 1024, 4096}` × span fraction ∈ {0, 0.25, 0.5, 1}.
- **Images.** Full-sphere renders, `R ∈ {8, 64, 181}`, all scanlines at a fixed `z`. Row order is sequential, plus one shuffled order to expose branch-prediction effects.
- **Input handling.** Inputs are read at run time from a file or argv to prevent constant folding. Outputs are folded into a checksum that is printed.

### 7.6 Measurement

- Pin the process to a core. Fix the frequency governor and disable turbo where permitted.
- Warm up, then 30 repetitions per configuration.
- Collect hardware counters (cycles, instructions, branch misses) and wall time.
- Report median, interquartile range, and the 95% bootstrap CI of the ratio to the baseline.
- No outlier removal beyond a predeclared rule.

### 7.7 Preregistered hypotheses

| ID | Hypothesis | Falsified if |
|---|---|---|
| H1 | Defined in §6.5 | As stated there |
| H2 | V3a emits 32-bit lanes, not 16-bit, on every compiler/target | Any build emits 16-bit lane multiplies for V3a |
| H3 | V3c narrows to 16-bit lanes on at least one compiler | No build does |
| H4 | V4 (best tail) is at least 1.3× faster per element than the best V3 at `n = 363` on each machine | CI of the ratio includes values below 1.3 |
| H5 | V5-alias without `restrict` shows a runtime check, reloads, or no vectorization; the locals version shows none of these | Assembly shows identical code |
| H6 | T2 is no slower than T1 for `n mod 8 ≠ 0`, `n ≥ 8` | CI of T2/T1 lies entirely above 1.0 |

### 7.8 Audit artifacts

Archive all of the following:

- source commit hash;
- compiler binaries' versions;
- full command lines;
- CPU model and microcode, OS and kernel;
- assembly and remark files;
- raw counter CSVs;
- correctness logs with case counts;
- the analysis script.

The goal is that a third party can rerun every step and check every claim against the raw data.

---

## 8. Limitations

- **Bounded domain.** R ≤ 181, or ≤ 180 for clamp-based lowerings, is narrow. Larger spheres need int32 lanes or a split-precision scheme, which are not studied here.
- **Exhaustive testing is exact only for the tested binary on the tested machine.** Index logic is exhaustive only for `n ≤ 400`. Larger `n` rests on the argument in P4 and P6, which is sound but not machine-checked. A formal check, for example SMT over bit-vectors or Alive2 at the LLVM IR level with bounded unrolling, would strengthen it but is not proposed as mandatory.
- **Microbenchmark scope.** Rows of at most 8 KB live in L1. The results say nothing about memory-bound rendering, other quadrics, or 256- and 512-bit (16- and 32-lane int16) lowerings.
- **Compiler and microarchitecture dependence.** Codegen and timing are specific to compiler version and microarchitecture. H2 and H3 describe particular compilers at particular versions, not general laws.
- **The H1 threshold is a choice.** A 10% threshold is a decision criterion, not a derived quantity. A smaller effect can be real yet still count as "falsified" under this protocol.
- **Unmeasured costs.** Energy and code size are not measured.
- **Alias variant setup is artificial.** The V5 aliasing variant reflects a common API shape, but it was chosen by me, not drawn from an existing codebase.

---

## 9. What would change the recommendations

- **If H1 is falsified:** keep V1 for the scalar path. The span-clip fill step can still be adopted alone, and it can be tested as a variant without the recurrence.
- **If H3 holds:** source-level range assumptions are a viable route to 16-bit inferred lowering, and the explicit V4 becomes a maintenance cost to justify.
- **If any correctness check fails:** the corresponding proof obligation in §5 was wrong or incompletely implemented. Revise the proof first, then the code.

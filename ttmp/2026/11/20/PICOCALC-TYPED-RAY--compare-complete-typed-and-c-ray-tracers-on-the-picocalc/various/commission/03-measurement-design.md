---
Title: Opus measurement research consultation
Ticket: PICOCALC-TYPED-RAY
DocType: reference
Topics: [compiler, performance]
Status: complete
---

Independent research memo. Model: claude-opus-5-5. Effort: high. The author received the public-topic prompt under scripts/commission/measurement.txt and no project sources or raw measurements. Treat proposed methods and examples as hypotheses until checked in the project.

# Research Memo: A Physical Microbenchmark for Comparing a C Integer Ray Tracer with a Generated RISC-V Integer Ray Tracer

**Scope.** This memo designs an experiment. It uses general public knowledge of the RISC-V ISA, C semantics, cache behavior and measurement statistics. It reports no measurements. Every number in it is either a definition, a quantity computed exactly from stated inputs, or an explicitly marked parameter for the experimenter to choose.

---

## 1. The question and its estimand

Two programs render the same scene with integer-only arithmetic:

- **Variant C**: a ray tracer written in C, compiled to RISC-V by a standard compiler (GCC or Clang).
- **Variant G**: a ray tracer whose RISC-V machine code is produced by some other generator (a DSL compiler, a template expander or a hand-written code generator).

Both run on a physical RISC-V core.

"Which is faster?" is not a well-posed question until four things are fixed:

1. **What counts as a frame.** Define a frame as one complete call `render(scene, fb, idbuf, zbuf)` that writes every pixel of the color, identifier and depth buffers. Display scan-out, buffer copies and hashing fall outside the frame.
2. **Which cache state.** Fix it in advance:
   - **Steady-state warm**: the same variant has rendered at least W frames immediately before.
   - **Cold**: the instruction cache holds no lines of the kernel. This is a separate estimand, discussed in §4.
3. **Which unit.** Report core cycles as the primary unit, and wall-clock time as secondary, derived through an independently verified clock frequency (§5).
4. **Which comparison.** Use the ratio ρ = cycles(G)/cycles(C) per frame. Report it with an interval that reflects variation across code and data layouts, not only across repeated frames (§7).

A result stated without all four is not auditable.

---

## 2. Correctness before timing

Timing a program that computes something different measures nothing useful. Verification is therefore a gate: a variant that fails any check is not timed.

### 2.1 What must be compared

Compare three per-pixel buffers, not one:

| Buffer | Content | Why it is needed |
|---|---|---|
| `fb` | final color, bit-exact | The visible output. |
| `idbuf` | identifier of the winning primitive (or a sentinel for background) | Two primitives with the same material produce identical colors. A wrong winner is invisible in `fb` but visible here. |
| `zbuf` | exact integer depth key of the winning hit | Catches the case where the right primitive wins with a wrong depth. That error is latent until a scene change exposes it. |

Hashing each buffer (for example with SHA-256 over the raw bytes, with fixed endianness and fixed pixel order) is adequate for the gate. On a mismatch, the harness must be able to dump the full buffers, so the first differing pixel can be located. A hash tells you only that the buffers differ, not where.

### 2.2 The reference must be independent

If the reference is the C variant run on a host, any bug in the C source is shared by the reference, so the comparison cannot detect it. Use a third implementation as the oracle:

- written separately (for example in Python, using arbitrary-precision integers);
- implementing the *specified* integer semantics: exact floor square root, stated rounding of every shift and division, stated tie rule;
- also asserting at every intermediate step that the value fits the bit width the target implementations use. This turns overflow from silent corruption into a reported specification violation.

Then require: `oracle == C_on_target == G_on_target`, for all three buffers, on every verification scene.

### 2.3 Where C and generated RISC-V can legitimately disagree

These are the places where two "correct-looking" integer implementations diverge. Each one needs targeted test inputs.

- **Signed overflow.**
  - In C it is undefined behavior, and an optimizing compiler may assume it never occurs (for example when reasoning about loop bounds or comparisons).
  - RISC-V `add`/`mul` wrap modulo 2^XLEN.
  - Consequence: if any intermediate overflows, C and G can differ, and C's behavior may change with optimization level.
  - Requirement: the oracle's bound checks must prove that no overflow occurs on the verification scenes, and the experimenter should derive a static bound for the scene parameter ranges (§3.3).
- **Right shift of negative values.**
  - In C this is implementation-defined. GCC and Clang on RISC-V emit `sra` (arithmetic shift), which rounds toward −∞.
  - A generator might use `srl`, or might rely on shift-as-division, which rounds differently from C's `/`.
  - C's `/` truncates toward zero, and RISC-V `div` also truncates toward zero. So `x >> 1` and `x / 2` differ for negative odd `x`.
- **Division edge cases.**
  - RISC-V defines division by zero: `div` returns −1 (all bits set) and `rem` returns the dividend.
  - RISC-V defines `INT_MIN / −1 = INT_MIN`.
  - C leaves both undefined. A generator that emits raw `div` inherits the RISC-V definitions. A C compiler may not.
  - If either case is reachable (for example on rays parallel to a plane), the specification must say what happens, and the oracle must implement exactly that.
- **High-word multiplication.**
  - On RV32, 64-bit products need `mul` plus `mulh`/`mulhu`/`mulhsu`. Choosing the wrong signedness variant is a common generator bug.
  - It shows up only when operands are negative and large.
- **Integer square root.**
  - Floor, round-to-nearest and "Newton iteration stopped one step early" agree on most inputs and disagree near specific boundaries (worked example in §3.2).

### 2.4 Depth ties

In floating point, exact depth ties are rare in ordinary scenes. In integer arithmetic on a coarse grid they are common and systematic. Two primitives that touch, or two primitives sharing a vertex, produce identical depth keys.

The tie rule must be specified in a way that is independent of iteration order. For example: *among hits with minimal depth key, the lowest identifier wins.* Then:

- both implementations must follow that rule;
- the verification suite must contain scenes that are constructed to produce ties;
- the suite must also contain the same scenes with the primitive list permuted. An implementation that gets the right answer only because of list order fails the permuted version.

### 2.5 Verification also runs after timing

Hash the buffers produced by the *last timed frame* of every run, outside the timed region. Compare them to the oracle hashes.

This rules out two failures that a single pre-timing check misses:

- a timed binary that is not the binary that was verified;
- a kernel that corrupts its own state across repeated frames (for example by failing to reset an accumulator or a per-frame counter).

---

## 3. Worked example: exact integer intersection, a constructed tie, and a square-root boundary

### 3.1 Setup and arithmetic

Take a ray from the origin with integer direction **d**, and a sphere with center **c** and radius r. Points on the ray are t·**d**. The intersection condition |t**d** − **c**|² = r² becomes

  a t² − 2 b t + k = 0, with a = **d**·**d**, b = **d**·**c**, k = **c**·**c** − r².

The discriminant (quarter form) is Δ = b² − a k. The near root is t = (b − √Δ)/a.

**Integer formulation.** Within one ray, a is the same for every primitive. That means the numerator alone orders the hits:

  depth key = b − isqrt(Δ)

This needs no division. Ties are exact equalities of integers.

(This holds when √Δ is exact. When it is not, the floor-sqrt key is a specified approximation, and the specification must say so. The oracle implements the specification, not the real-valued root.)

**Ray:** **d** = (0, 0, 4), so a = 16.

**Sphere 1 (id 1):** **c** = (0, 0, 20), r = 5.
- b = 4·20 = 80
- k = 400 − 25 = 375
- Δ = 6400 − 16·375 = 6400 − 6000 = 400
- isqrt(Δ) = 20
- key = 80 − 20 = **60**
- Check: t = 60/16 = 3.75, and the hit point is z = 3.75·4 = 15 = 20 − 5. Correct.

**Sphere 2 (id 2):** **c** = (0, 0, 25), r = 10.
- b = 100
- k = 625 − 100 = 525
- Δ = 10000 − 8400 = 1600
- isqrt(Δ) = 40
- key = 100 − 40 = **60**
- Check: the hit point is z = 15 = 25 − 10. Correct.

The two spheres are tangent at (0, 0, 15), so this ray produces an exact depth tie.

### 3.2 How the tie and square-root rules play out

**Tie rule consequences.** Iterate primitives in list order [1, 2]:

- `if (key < best)` keeps id 1. This matches the lowest-id rule, but only by accident of list order.
- `if (key <= best)` keeps id 2. This violates the rule.
- With list order [2, 1], `<` keeps id 2. So the strict-less implementation is also wrong, under permutation.

A correct implementation compares the pair (key, id) lexicographically:

```
if (key < best_key || (key == best_key && id < best_id)) { ... }
```

If both spheres share a material, `fb` is identical under every one of these variants. Only `idbuf` exposes the difference. This is why §2.1 requires the identifier buffer.

**Square-root boundary vectors.** Let n = 20. The exact values below separate floor sqrt from round-to-nearest sqrt:

| Δ | √Δ (real) | floor | nearest |
|---|---|---|---|
| 399 = n² − 1 | 19.97… | 19 | 20 |
| 400 = n² | 20 | 20 | 20 |
| 420 = n² + n | 20.49… | 20 | 20 |
| 421 = n² + n + 1 | 20.51… | 20 | 21 |

These follow from (n + ½)² = n² + n + ¼, which lies strictly between 420 and 421.

The rows Δ = n² − 1 and Δ = n² + n + 1 are where the two definitions differ. A unit test of `isqrt` alone should cover these boundaries for many n, including n near the top of the operand range. A scene test should place at least one primitive so that some pixel's Δ falls on such a boundary.

### 3.3 Overflow bound for the same formulation

Suppose every coordinate component satisfies |c_i| ≤ M and every direction component satisfies |d_i| ≤ D. Then:

- |b| ≤ 3MD, so b² ≤ 9M²D²;
- a ≤ 3D² and |k| ≤ 3M² + r², so |a k| ≤ 3D²(3M² + r²).

For Δ to fit a signed 32-bit intermediate, both terms must be below 2³¹. For example, M = D = 2⁷ = 128 gives 9·2²⁸ > 2³¹, which overflows.

So an RV32 implementation of this formulation needs either 64-bit intermediates (`mul`/`mulh` pairs) or tighter ranges. The specification must state which. The oracle's width assertions (§2.2) verify the choice on concrete scenes. The derived bound covers the parameter range.

---

## 4. Factor 1: memory placement

The same instruction sequence can take a different number of cycles depending on where its code and data reside. Physical RISC-V systems commonly mix several memory types, for example:

- execute-in-place flash with wait states and a prefetch buffer;
- tightly coupled SRAM with single-cycle access;
- cached DRAM;
- uncached peripheral or video memory.

**Controls:**

1. **One binary, both kernels.** Link C and G into a single image with a shared harness. They then share the same:
   - scene data and scene addresses;
   - framebuffer, identifier and depth buffer addresses;
   - stack region.

   Place each kernel in its own named section via the linker script, so its address can be set explicitly.
2. **Record every placement.** Log from the linker map:
   - the start address of each kernel;
   - the start address of the scene, the three buffers and the stack;
   - the memory region type of each.
3. **Render into ordinary memory.** If the displayed framebuffer is memory that a display controller reads concurrently, its bus contention depends on scan-out timing. Render into an ordinary SRAM/DRAM buffer instead, and copy to the display outside the frame.
   - If writing directly to video memory is the deployment case of interest, measure it as a separate, explicitly named condition.
4. **Placement as a factor, not a constant.** If more than one region can hold code, run the experiment with code in each region. Report ρ per region. The ratio may depend on placement; for example, a larger G kernel suffers more from flash wait states.
5. **Stack and ABI.**
   - The generated kernel must obey the calling convention: preserve the callee-saved registers `s0`–`s11` and `sp`, and keep the stack 16-byte aligned per the standard RISC-V psABI.
   - The harness should fill the callee-saved registers with canary values before the call and check them afterward, in verification builds only.
   - Its stack depth should be measured (for example by painting the stack region and scanning it after a frame), so that stack placement is known to fit the intended region.

---

## 5. Factor 2: instruction cache and code layout

Even on a simple in-order core, the cycle count of a hot loop can change with its alignment. The causes:

- fetch-block boundaries (for example, a 4-byte instruction straddling a fetch boundary when compressed instructions are present);
- branch-target alignment;
- cache-set conflicts between the kernel and the harness or the other kernel.

Published systems work has shown that layout changes unrelated to the code under test can produce performance differences as large as the effects being studied. For example, Mytkowicz et al. found that link order and environment size alone can shift measured performance (ASPLOS 2009).

**Controls:**

1. **Report the hot-path code size** of each kernel, in bytes, alongside the I-cache size, line size and associativity from the core's documentation.
   - A kernel whose hot path exceeds the cache does not reach a "warm" state in the usual sense. In that case, say so.
2. **Use the same ISA profile.** Compile and generate both kernels for the same ISA string, for example `rv32imc` or `rv64imac`. Whether the C (compressed) extension is used changes code density substantially.
   - If G cannot emit compressed instructions, that is a real property of G, and should be reported as such. It should not be hidden by compiling C without compressed instructions too.
   - The two options, both compressed, or C with and without compressed, answer different questions, and the chosen one must be stated.
3. **Randomize layout.** Insert a padding section of `p` bytes before each kernel. Draw `p` from a set covering at least one I-cache way span in steps of the minimum instruction alignment (2 bytes with compressed instructions, 4 without).
   - Use L layout configurations, each a pair (p_C, p_G), drawn from a recorded seed.
   - The layout is the main source of variance the comparison must account for (§7).
4. **Cold-cache estimand.**
   - `fence.i` guarantees instruction-fetch coherence with prior stores. It does not portably guarantee eviction or define a timing state.
   - To approximate a cold I-cache, execute an eviction sweep: a straight-line block of code larger than the I-cache, located at addresses that map to every set.
   - Then time the first frame. Report it separately from steady-state numbers, never averaged with them.
5. **Cross-contamination in interleaved runs.** Alternating C and G frames in one boot lets each kernel evict the other. Precede each timed frame with one untimed frame of the same variant (a "pre-warm"), so that every timed frame measures the steady-state warm estimand defined in §1.

---

## 6. Factor 3: frame clocks

### 6.1 Clock sources

There are three independent clock sources, which measure different things:

| Source | What it counts | Typical use |
|---|---|---|
| `mcycle` / `cycle` (Zicntr) | core clock cycles | Primary unit. |
| `mtime` (memory-mapped platform timer) | fixed-frequency ticks, often different from core clock | Wall-time check independent of core PLL. |
| External: GPIO edge at frame start and end, captured by a logic analyzer or oscilloscope | wall time on an instrument's own timebase | Ground truth for frequency, and for detecting stalls the core does not count. |

### 6.2 Cross-checks before timing

Run these on the target:

1. **Counter existence and monotonicity.** Read `cycle` and `instret` repeatedly. Some cores omit them, alias them or read zero. In user mode under Linux, counter access may be disabled by the kernel.
2. **Frequency agreement.** Over one frame, compute:
   - f₁ = Δcycle / Δt_external
   - f₂ = Δcycle / (Δmtime / f_mtime)

   Compare both to the configured core frequency. Disagreement indicates a wrong PLL setting, frequency scaling, or a cycle counter that pauses in some states.
3. **Fixed frequency.** Disable dynamic frequency scaling. On bare metal, configure the clock tree explicitly and log its register values.

### 6.3 Reading a 64-bit counter on RV32

On RV32, read the 64-bit counter with the standard high-low-high loop:

```c
static inline uint64_t read_cycle64(void) {
    uint32_t hi, lo, hi2;
    do {
        __asm__ volatile ("rdcycleh %0" : "=r"(hi));
        __asm__ volatile ("rdcycle  %0" : "=r"(lo));
        __asm__ volatile ("rdcycleh %0" : "=r"(hi2));
    } while (hi != hi2);
    return ((uint64_t)hi << 32) | lo;
}
```

On RV64, a single `rdcycle` suffices.

### 6.4 Interrupts

On bare metal, disable interrupts (`mstatus.MIE = 0`) for the timed region. Then the measured cycles contain no handler time. If the deployment has interrupts enabled, that is a separate condition, and should be timed as such.

---

## 7. Factor 4: instrumentation effects

A probe changes the system it measures:

- reading a CSR takes cycles;
- probe code occupies I-cache lines and shifts the addresses of the code after it;
- printing over UART during a run adds both time and bus traffic.

**Controls:**

1. **Coarse probes only in timed runs.** Read the counters once at frame start and once at frame end, in the shared harness. Probes are then identical for both variants and lie outside both kernels.
2. **Measure probe overhead.**
   - Time an empty region (two consecutive counter reads) N times. Record the distribution.
   - Compute the ratio of overhead to frame cycles from that distribution. Do not assume it is negligible.
   - If the ratio is below the resolution the comparison needs, report it and do not subtract. If it is not, report results both with and without subtraction.
3. **No I/O during timed regions.** Store per-frame counts in a preallocated array and transmit after the run.
4. **Fine-grained attribution is a separate experiment.** Per-pixel, per-ray or per-primitive probes perturb layout and cost too much to sit inside the comparison runs. Use them in separate runs labeled "attribution". Never mix their cycle counts into ρ.
5. **Hardware performance counters.** If the core implements counters such as `mhpmcounter3+` for I-cache misses, branch mispredictions or stalls, program them identically for both variants and read them at the same points.
   - Their event definitions are implementation-specific. Cite the core's documentation for each event used.
6. **Instructions retired.** Always record `instret` alongside `cycle`. Since cycles = instret × CPI,

   ln ρ_cycles = ln ρ_instret + ln ρ_CPI.

   This additive split separates "G executes fewer or more instructions" from "G's instructions run faster or slower per instruction". The split is exact per frame, not an estimate.

---

## 8. Factor 5: comparative estimators

### 8.1 Design units

- **Boot b** = 1…B: a power cycle or reset, re-establishing the clock configuration.
- **Layout ℓ** = 1…L: the padding pair (p_C, p_G), rebuilt per layout.
- **Frame j** = 1…J: a timed frame within a (b, ℓ) run, after W warm-up frames.

Within each (b, ℓ) run, execute the frames in a randomized order of variant blocks. For example, use ABBA or a random permutation of J C-frames and J G-frames, each preceded by a pre-warm frame of the same variant. Record the seed.

### 8.2 Why frame repetitions are not replicates

On a simple in-order core with interrupts disabled and a deterministic memory system, repeated frames can give identical cycle counts. Within-run variance is then zero, so any interval built from frame repetitions alone claims certainty the experiment does not have.

The variance that matters comes from layout and from boot-to-boot state (for example, DRAM refresh phase). So the unit of replication is (b, ℓ), not j.

### 8.3 Primary estimator

1. For each unit (b, ℓ) and variant V, compute the unit summary m^V_{bℓ} = median over j of the per-frame cycles. The median is robust to a rare outlier frame.
2. Compute the unit log ratio L_{bℓ} = ln(m^G_{bℓ} / m^C_{bℓ}).
3. Estimate: ρ̂ = exp( mean over (b, ℓ) of L_{bℓ} ). This is a geometric-mean ratio.
4. Interval: a cluster bootstrap. Resample layouts with replacement; within each resampled layout, resample boots with replacement; recompute ρ̂. Repeat R times (for example R = 10 000) and take the percentile interval. A t-interval on the L_{bℓ} is an acceptable alternative if their distribution is checked first.

### 8.4 Secondary reports

- **Per-layout extremes.** Report the min and max of L_{bℓ} across layouts. If the spread across layouts is wider than |ln ρ̂|, the honest conclusion is that layout matters more than the C/G difference on this core.
- **Hodges–Lehmann estimate.** Use the median of pairwise Walsh averages of L_{bℓ} as a robustness check on the mean.
- **Instruction/CPI split.** Report the instret and CPI log ratios from §7.6.
- **Cold-frame ratio.** Use the same estimator on first-frame cycles after an eviction sweep, as a separate estimand.
- **Wall time.** Convert using frequencies verified in §6.2. Never use a nominal frequency.

### 8.5 Exclusions

Exclusion rules must be stated before data collection. Acceptable reasons:

- a failed post-timing hash check (§2.5);
- a failed frequency cross-check (§6.2).

Excluding a frame for being slow is not acceptable. Report every excluded unit, together with its reason.

---

## 9. Pseudocode

### 9.1 Verification gate (host + target)

```
procedure VERIFY(scenes, target):
    for s in scenes ∪ permutations_of_primitive_lists(scenes):
        ref ← ORACLE_RENDER(s)                # big-int, asserts width bounds
        if ref.overflow_flag: FAIL("spec violation in scene", s)
        for V in {C, G}:
            out ← target.run(V, s, frames=1, dump=true)
            for buf in {fb, idbuf, zbuf}:
                if hash(out[buf]) ≠ hash(ref[buf]):
                    p ← first_differing_pixel(out[buf], ref[buf])
                    FAIL(V, s, buf, p, out[buf][p], ref[buf][p])
    PASS
```

Required scenes:

1. constructed ties, including the tangent-sphere case from §3;
2. square-root boundary scenes;
3. rays near the overflow bound;
4. rays parallel to planes, if planes exist;
5. negative coordinates on all axes;
6. the benchmark scene itself.

### 9.2 Target-side timed run

```
procedure TIMED_RUN(variant_order, W, scene):
    disable_interrupts()
    for V in {C, G}:  repeat W: render_V(scene)        # warm-up, untimed
    for (k, V) in enumerate(variant_order):            # randomized, seeded
        render_V(scene)                                # pre-warm, untimed
        c0 ← read_cycle64(); i0 ← read_instret64(); gpio_high()
        render_V(scene)
        gpio_low(); i1 ← read_instret64(); c1 ← read_cycle64()
        log[k] ← (V, c1 − c0, i1 − i0)
    enable_interrupts()
    final_hash[C] ← hash_buffers_after(render_C(scene))  # untimed
    final_hash[G] ← hash_buffers_after(render_G(scene))
    transmit(log, final_hash, mtime_snapshot, clock_regs)
```

### 9.3 Host-side estimator

```
procedure ESTIMATE(units):                # units: list of (b, ℓ, log)
    Ls ← []
    for u in units:
        if u.final_hash ≠ oracle_hash or not u.freq_ok: record_exclusion(u); continue
        mC ← median(cycles of u.log where V = C)
        mG ← median(cycles of u.log where V = G)
        Ls.append((u.ℓ, u.b, ln(mG / mC)))
    rho ← exp(mean(L for _,_,L in Ls))
    CI  ← cluster_bootstrap(Ls, cluster=ℓ, subcluster=b, R=10000)
    report(rho, CI, min/max per ℓ, HL(Ls), instret/CPI split, exclusions)
```

---

## 10. Auditable proposed experiment

### 10.1 Pre-registration

Commit the following to version control, timestamped, before any timed run:

- **Primary estimand:** ρ = steady-state warm per-frame cycles, G over C, at a fixed placement, a fixed ISA string and a fixed core frequency.
- **Secondary estimands:** the cold-frame ratio; the per-placement ratios; the instret and CPI split.
- **Design parameters**, chosen by the experimenter: W, J, B, L, R, the padding range and step, and the random seeds.
- **Stopping rule:** a fixed B × L. No early stopping on observed ρ.
- **Exclusion rules:** as in §8.5.
- **Scenes:** the verification suite and the benchmark scene, including the camera, resolution and primitive list.

### 10.2 Artifacts to archive

1. Source of the C kernel, the generator, the generator's input, and the generated assembly.
2. Toolchain names and versions, full compile, assemble and link command lines, and the linker script.
3. For every layout: the ELF, its SHA-256, and the linker map.
4. Core identification:
   - `misa`, `mvendorid`, `marchid`, `mimpid`, where implemented;
   - the board revision;
   - the documented cache parameters.
5. The clock tree register dump for every boot, and the frequency cross-check values f₁ and f₂.
6. Raw per-frame records (variant, cycles, instret, any HPM counts) for every unit, including excluded ones.
7. Oracle source, oracle output hashes, and target output hashes, before and after timing.
8. The analysis script and the bootstrap seed.

Anyone holding these artifacts can rerun the analysis exactly, and can rebuild the binaries to check their hashes.

### 10.3 Execution order

1. Bring-up: counter checks and frequency cross-checks (§6.2).
2. Unit tests for `isqrt`, the division and shift helpers, and 64-bit multiplication, against the oracle.
3. The full verification gate (§9.1). Stop on any failure.
4. Probe-overhead measurement (§7.2).
5. Timed runs over all B × L units, with post-timing hash checks.
6. Estimation (§9.3).
7. Attribution runs with fine-grained probes, if wanted. These are separate and labeled.

---

## 11. Limitations

- **One core, one memory system.** ρ depends on the microarchitecture:
  - pipeline depth, branch prediction, fetch width and cache geometry all affect it;
  - an out-of-order core adds variance sources (predictor state, memory disambiguation) that this design reduces through layout randomization but does not eliminate.

  The result does not transfer to other cores without new measurements.
- **One compiler configuration.** Variant C stands for one compiler, version and flag set. A different `-O` level, `-march` or compiler can change ρ. The comparison is "this G versus this compilation of C", not "generated code versus C" in general.
- **Scene dependence.** Branch behavior and inner-loop trip counts depend on the scene (primitive count, coverage, depth complexity). One benchmark scene gives one point. A claim about scene classes needs a sample of scenes chosen in advance.
- **Finite layout sample.** L layouts sample the space of alignments. They do not cover it. Conflicts between the kernel and the harness depend on the harness too, which is held fixed.
- **Counter semantics vary.**
  - Whether `cycle` counts during stalls, sleep or debug-halt states is implementation-defined in practice. The external-clock cross-check detects gross discrepancies, but not every one.
  - HPM event definitions are vendor-specific, so they are not comparable across cores.
- **The oracle can share specification errors.** An independent oracle catches implementation bugs, not mistakes in the specification itself. For example, a tie rule or square-root rounding that is consistently specified but unsuitable for the application passes every check.
- **Verification is scene-bounded.** Bit-exact agreement on the verification suite does not prove agreement on all inputs. The static overflow bound (§3.3) covers arithmetic range. Agreement on control flow outside the tested scenes is not proven.
- **Steady state is an idealization.** A deployed renderer that interleaves other work starts frames with a partially warm cache. Neither the warm nor the cold estimand describes that case exactly.

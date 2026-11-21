---
Title: Fixed-point particle layouts and contact scheduling on the ESP32-P4
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Fixed-Point Particle Layouts and Contact Scheduling on the ESP32-P4

This chapter examines physical experiments on two integer physics kernels running on the ESP32-P4. A saturating particle update shows how memory layout affects packed arithmetic. A pairwise contact update shows how data dependencies limit packing and what an independent-contact schedule costs.

Every physical observation in this chapter is a **kernel-level physical cycle count per call**. Each count was measured over a batch of **12 buffer copies**. The particle study used **12 blocks** and the contact study used **14 blocks**. The four matched specialized plans in the study (`guarded-aos-scalar`, `guarded-aos-pie`, `guarded-soa-scalar`, `guarded-soa-pie`) were **manually assigned**. Section 10 follows those calibrated kernels from ordinary Typed source through a bounded automatic selector and into the exact firmware used to obtain the measurements.

Data source: ticket PICOCALC-SIMD-LAB, directories `scripts/physics/` and `various/physics/`, and the physics workbook `07-physics-workbook.py`.

## 1. Definitions

- **Q8.8 value.** A signed 16-bit integer `q` stored in one halfword. It represents the real number `q / 256`. All operands share this scale, so addition needs no rescaling.
- **Signed saturation.** `sat16(z) = clamp(z, -32768, 32767)`.
- **Interleaved layout (AoS).** Each particle record is 4 bytes, a position halfword followed by a velocity halfword.
- **Planar layout (SoA).** All `n` positions are stored first, then all `n` velocities.
- **Packet.** Eight signed halfwords, which is the content of one 128-bit PIE register.
- **Tail.** The `n mod 8` elements left after the last full packet.
- **Arm.** One implementation measured under one name.
- **Block.** One complete pass over all arms in a rotated order.
- **Contact.** An ordered pair `(i, j)` of distinct, writable body indices.
- **Color.** A set of contacts in which no body index appears twice.
- **Same-order.** Two implementations are same-order if they apply contacts in an identical sequence. Contacts within one color may be processed in any order, because they share no bodies.

## 2. Measurement pipeline

```text
Typed source ─► production front end + streaming RV32 emitter ─► emitted words
                                                                     │
                       immutable generated assembly stream (words + public entry symbols)
                         │                                           │
           host: Unicorn replay of linked image          board: Espressif assemble/link
           allowlisted PIE modeled via vendor            PIE executed by the P4
           disassembly → instruction counts,             → cycle-counter deltas,
             per-PC histograms, trap states                818 validated rows
```

The timing interval on the board includes dispatch and a series of kernel calls. It excludes initialization, the independent output comparison and UART printing. The stock Typed words came from the production compiler. The other native implementations were assembled using the Espressif toolchain.

## 3. Particle saturation and layout

### 3.1 The law

```text
interleaved bytes, signed halfwords     [x0, v0, x1, v1]
planar bytes, signed halfwords          [x0, x1, v0, v1]
mathematical update                     xi' = clamp(xi + vi, -32768, 32767)
```

Worked saturation example:

- Let `x = 32000` (125.0) and `v = 1000` (3.90625). The exact sum is 33000, so `x' = 32767` (127.99609375).
- Let `x = -32768` and `v = -1`. Then `x' = -32768`.

Outputs are compared as halfwords after one step. Agreement is therefore exact at the saturation boundaries.

### 3.2 Arms

```text
scalar(n):      for i in 0..n-1: x[i] = sat16(x[i] + v[i])
packed_soa(n):  for p in 0..floor(n/8)-1:
                    X = vld128(&x[8p]); V = vld128(&v[8p])
                    vst128(&x[8p], vadd_s16(X, V))
                scalar over the tail
packed_aos(n):  load records, arrange lanes so positions pair with velocities,
                add, restore interleaving, preserve each velocity, store
```

The study has four groups of particle arms:

- **Native arms.** Four hand-scheduled arms form a factorial: {AoS, SoA} × {scalar, PIE}. They take slices that the harness has already validated.
- **Typed controls.** `typed-aos` and `typed-soa` are ordinary Typed source compiled unchanged. They keep the language-defined per-access checks. Compiling them today need not generate any PIE, and the host traces confirm that no PIE executes.
- **Conversion arms.** These are covered in Section 4.
- **Guarded plans.** These are covered in Section 6.

The workload sizes cover distinct cases:

| n | Case exercised |
|---|---|
| 7 | No full packet |
| 8 | First full packet |
| 64 | Aligned groups |
| 127 | Tail |
| 128 | Aligned groups |

### 3.3 Board results (median cycles per call)

| n | aos-scalar | aos-pie | soa-scalar | soa-pie | typed-aos | typed-soa |
|---|---|---|---|---|---|---|
| 7 | 94.5 | 99.4 | 107.8 | 111.5 | 801.1 | 729.2 |
| 8 | 104.9 | 95.2 | 115.7 | 39.7 | 909.8 | 827.1 |
| 64 | 771.3 | 518.1 | 837.0 | 90.3 | 7003.0 | 6353.5 |
| 127 | 1508.3 | 1036.8 | 1638.5 | 1068.3 | 13844.5 | 12548.9 |
| 128 | 1516.8 | 1002.5 | 1650.3 | 150.4 | 13944.0 | 12645.2 |

The table supports five observations:

1. **n = 7.** There is no full packet, and both PIE arms are slightly slower than scalar. The AoS pair saves −5.1% and the SoA pair −3.4%, with 1 of 12 blocks favorable in each.
2. **n = 8.** The first packet appears. Planar PIE saves 65.9% (12/12 favorable). Interleaved PIE saves only 9.5% (11/12).
3. **Scalar layout cost.** Planar scalar is consistently slower than interleaved scalar, by −8.6% to −9.9% at n ≥ 8 (0/12 favorable at each size). Layout alone does not favor SoA. It favors SoA only when the code consumes contiguous packets.
4. **n = 128.** Planar PIE saves 90.9% against planar scalar and 85.0% against interleaved PIE (12/12 favorable for both).
5. **n = 127.** Planar PIE costs 1068.3 cycles, against 150.4 at n = 128, and saves only 34.8%. For the recorded aligned base, the second plane starts 254 bytes later at n = 127 and 256 bytes later at n = 128. The former takes the kernel’s aligned scratch-copy path. In the native image the packed addition at offset 652 executed 15 times at n = 127, with 973 guest instructions in total. At n = 128 the direct packed addition at offset 468 executed 16 times, with 111 instructions in total. The source branch and per-address counts establish which path ran. These counts cannot allocate an exact fraction of physical cycles to the tail or copies.

### 3.4 Host evidence on layout (n = 128, executed RV32 instructions)

| Kernel | Steps | PIE executed |
|---|---|---|
| particle_aos_scalar | 1257 | none |
| particle_aos_pie | 923 | vadd.s16 16, vld.128.ip 32, vst.128.ip 16 |
| particle_soa_scalar | 1388 | none |
| particle_soa_pie | 111 | vadd.s16 16, vld.128.ip 32, vst.128.ip 16 |

The two PIE kernels execute identical PIE instruction mixes: 16 packets, each with two loads, one add and one store. Their difference of 923 − 111 = 812 instructions therefore lies entirely in non-PIE instructions. That difference includes scalar loads, stores, alignment handling and loop control for the interleaved path. The arithmetic is the same in both kernels; the extra cost is memory movement.

## 4. Conversion amortization

There are two conversion arms:

- `convert-roundtrip` performs only the two layout changes: interleaved to planar, then planar back to interleaved.
- `convert-pie-roundtrip` performs the same two conversions with the packed planar update in between.

| n | convert-roundtrip | convert-pie-roundtrip | convert-roundtrip + soa-pie |
|---|---|---|---|
| 7 | 134.1 | 238.3 | 245.6 |
| 8 | 150.1 | 181.6 | 189.8 |
| 64 | 1053.1 | 1141.5 | 1143.4 |
| 128 | 2076.3 | 2233.1 | 2226.7 |

At every size, a single-tick migration loses against staying interleaved. At n = 128 it saves −47.2% against `aos-scalar` and −122.8% against `aos-pie`, with 0/12 favorable for both. Conversion alone (2076.3) already exceeds the whole scalar interleaved update (1516.8).

The last column adds two separately measured medians. Medians are not additive in general. At n ≥ 64, however, the sum agrees with the measured composite to within 0.3%. That agreement is consistent with the composite not suffering a large interaction cost, but it does not prove it.

**Projection, not a measured result.** Suppose state stays planar for `K` ticks and is converted once in each direction. The model is:

```text
cost_planar(K)      = C_conv + K · c_soa-pie
cost_interleaved(K) = K · c_aos-pie
K* = C_conv / (c_aos-pie − c_soa-pie)
```

With the n = 128 medians, `K* = 2076.3 / (1002.5 − 150.4) ≈ 2.4` ticks. At n = 127 the denominator is negative (1036.8 − 1068.3), so the model never breaks even.

The experiment measures a single tick. It does not measure a complete game, and it does not establish a universal break-even frame count. Any value of `K*` must be confirmed by a multi-tick arm.

## 5. Contact dependencies and scheduling

### 5.1 The law

Let `A` and `B` be the old velocities of the two bodies in a contact. In signed 32-bit arithmetic:

```text
d  = floor((B − A) / 2)
A' = A + d
B' = B − d
```

The bounds follow from the halfword range: `B − A ∈ [−65535, 65535]`, so `d ∈ [−32768, 32767]`. Both new values lie between the old values, and `A' + B' = A + B` exactly.

Worked example: let `A = 5` and `B = 2`.

- `B − A = −3`, so `d = floor(−1.5) = −2`. Truncation toward zero would give −1 instead.
- `A' = 3` and `B' = 4`.
- The sum is 7 before and after.

This kernel is a reduced velocity relaxation with two reads and two writes per contact. It has no geometry, mass matrix, friction or impulse cache.

### 5.2 Greedy coloring

```text
colors = []
for c = (i, j) in input order:
    k = first index with i ∉ bodies(colors[k]) and j ∉ bodies(colors[k])
    if none: append empty color, k = last
    colors[k].append(c)                  # stable: input order within a color
schedule = concat(colors)
```

No body appears twice within one color. Applying a color in packets of eight therefore equals applying that color sequentially. Applying the colors in sequence, however, can change the result compared with the producer's original order.

Worked example: take the chain `c0=(0,1)`, `c1=(1,2)`, `c2=(2,3)` with velocities `[0, 0, 0, 8]`.

- Coloring gives `{c0, c2}` and `{c1}`, so the schedule is `c0, c2, c1`.
- Original order (c0, c1, c2): c0 and c1 change nothing; c2 gives `[0, 0, 4, 4]`.
- Scheduled order (c0, c2, c1): c2 gives `[0, 0, 4, 4]`; c1 then gives `[0, 2, 2, 4]`.

The results differ, and both sums are 8.

### 5.3 Same-order correctness

```text
original order → independent scalar reference
               → greedy coloring → same-order scalar
                                  → same-order PIE
                                  → same-order checked Typed
```

The three scheduled implementations must agree bit for bit with each other and with a scalar reference applied in the scheduled order. Differences from the original order are expected and are not defects. Host fixtures:

| Fixture | Bodies | Contacts | Color sizes | Original-vs-scheduled differences |
|---|---|---|---|---|
| chain16 | 17 | 16 | [8, 8] | 16 |
| star16 | 17 | 16 | sixteen 1s | 0 |
| disjoint16 | 32 | 16 | [16] | 0 |
| mesh128 | 128 | 128 | [57, 41, 30] | 107 |

- **star16.** Every contact shares the center body, so each one receives a new color in input order. The schedule equals the original order, and nothing can be packed.
- **disjoint16.** All contacts share no bodies, so a single color holds all of them and no reordering can matter.

The records report the difference counts without stating their denominator, whether bodies or halfwords. Treat the replay script as the authority on that denominator before computing any rate from the counts.

### 5.4 Board results (n = 128 contacts, median cycles per call)

| Arm | Cycles |
|---|---|
| original-scalar | 2198.7 |
| grouped-scalar | 2262.0 |
| grouped-pie | 3255.4 |
| original-typed | 20786.9 |
| grouped-typed | 20669.6 |
| generate-color-scatter | 10174.4 |
| generate-color-pie | 13417.4 |

Paired results:

- Grouping the scalar arm takes 2.9% more cycles (1/14 favorable).
- Grouped PIE against grouped scalar, over the same contacts in the same order, saves **−43.9%** (0/14 favorable).
- Scheduling plus PIE against the original scalar arm saves −510.2% (0/14).
- Original Typed against grouped Typed differs by 0.56% (10/14).

Grouped Typed processes the flattened list, because it stores immediately. Its host per-color controls may pay extra function entries, so each observation must be read with its invocation granularity.

The host trace of `contact_pie` on mesh128 is fully consistent with the color sizes:

- Colors of 57, 41 and 30 contacts give 7 + 5 + 3 = **15 full packets**.
- That leaves 1 + 1 + 6 = 8 tail contacts for scalar code.
- The executed PIE counts are vadd.s16 15, vsub.s16 15, vld.128.ip 45 and vst.128.ip 30, which is 105 PIE instructions.
- The kernel executes 3107 steps in total, against 2060 for scheduled scalar.

The extra instructions lie outside the packed arithmetic. They assemble lanes from scattered body indices and return them afterward.

Box2D's solver research packs contacts that share no dynamic body, and it keeps the coloring while the contacts persist (Catto). This harness instead times its complete deterministic generation, coloring and stable scatter: 10174.4 cycles, which is 4.6× the original scalar update. That figure is the cost of this fixture's scheduler. It is not the cost of a production incremental coloring algorithm. A system that regenerates every contact and rebuilds the full schedule pays those costs every step. An engine retaining colors can update only modified constraints.

## 6. Checked candidate plans

```text
guarded_plan(buffer_header, n):
    if n <= 0: return stock_checked(buffer_header, n)
    capacity = signed_word_at(buffer_header)
    if capacity < 0 or n > (capacity >> 1): return stock_checked(buffer_header, n)
    selected_kernel(buffer_header + 4, n)
    return n
```

The stock function, the wrapper and the selected kernel are independent objects in the firmware.

On the host, every guarded arm was also tested with nonpositive counts and partial capacities. There were 280 valid kernel/output comparisons and 192 additional guard-versus-stock trap-or-return comparisons. For each, the host recorded the exact post-trap memory state and VM interruption, or the normal return value when the path completed.

Guard overhead at n = 128:

| Pair | Host steps (guarded − native) | Board cycles (guarded − native) |
|---|---|---|
| aos-scalar | 1272 − 1257 = 15 | 24.0 |
| aos-pie | 938 − 923 = 15 | 17.0 |
| soa-pie | 126 − 111 = 15 | 28.8 |

The guard adds a constant 15 instructions on the host. The board cost of those instructions varies by arm. Against the unmodified Typed controls, the manually assigned plans save 92.7% (AoS) and 98.6% (SoA) at n = 128, both 12/12 favorable. This shows what is attainable for this kernel. It is not an evaluation of compiler selection on a held-out workload.

## 7. Paired statistics and denominators

The board timing loop:

```text
for b in 1..B:                          # B = 12 particle, 14 contact
    for arm in rotate(arms, b):          # cyclic ordinal positions
        bufs = 12 copies of deterministic state      # before first counter read
        t0 = cycle_counter()
        for k in 0..11: arm(bufs[k])
        t1 = cycle_counter()
        validate, checksum, UART                      # after second read
        if any buffer mismatches the reference: invalidate the arm
        emit (b, arm, (t1 − t0) / 12)
```

Rotation is balanced in both studies:

- **Particles.** Twelve arms and 12 blocks place each arm in each ordinal position once. Five sizes × 12 arms × 12 blocks gives 720 rows.
- **Contacts.** Seven arms and 14 blocks place each arm in each position twice, giving 98 rows.
- **Total.** 818 rows, each validated against an independent reference.

The same operator ran all board studies.

For block `b`, define the paired quantities:

- `s_b = c_base,b − c_cand,b`
- `p_b = 100 · s_b / c_base,b`
- **favorable** = the number of blocks with `s_b > 0`.

A positive value means the candidate is faster. The denominator of `p_b` is the baseline's cycles in the same block.

Worked example: compare `soa-scalar` and `soa-pie` at n = 128.

| Quantity | Value |
|---|---|
| Difference of arm medians | 1650.25 − 150.375 = 1499.875 |
| Ratio of arm medians | 90.89% |
| Recorded medianSavedCycles | 1499.92 |
| Recorded medianSavedPct | 90.888% |

The calculation in 05-physical-results.py takes the median over individual matched block differences and ratios. The difference from the arm-median calculation follows from that definition. Report the paired statistic, and keep its block count next to it, such as 12/12.

## 8. Board cycles, host instructions and per-PC joins

The board and host measure in different units:

- **Board unit:** P4 cycle-counter delta per call across a 12-call batch. Harness call overhead is included; setup and validation are excluded.
- **Host unit:** executed RV32 instructions. Each vendor instruction counts once.

The ratio between the two is not CPI. The board numerator contains harness calls, and the host numerator ignores pipeline and memory timing. For example, 150.4 cycles against 111 steps for `soa-pie` must not be reported as a CPI of 1.35.

**Per-PC join.** The host keeps a complete histogram from PC to execution count for each trace. Source annotations assign roles to byte ranges within that same linked image. A join sums the executions whose PC falls inside a role's ranges. Host addresses are relative to their own image, so a join is valid only when the image SHA matches.

Example from the replay, `simd.executions("physics-guarded_soa_pie", "physics-guarded_soa_pie-particle-n128", "packed-arithmetic")`:

| Field | Value |
|---|---|
| Image | `79809bfa…f3ac` |
| Source | `scripts/physics/board/physics_checked.S` line 35 |
| Role ranges | [740, 744) and [924, 928) |
| Static instructions | 2 |
| Executed PCs | 1 (PC 740, 16 executions) |
| Trace steps | 126 |

The instruction at PC 924 executed zero times in this trace. Because the histogram is complete, an unlisted PC within the image has a count of zero for this trace. That zero says nothing about other traces, workloads or images.

## 9. Reproduction from the scripts

1. **Confirm the physical capture.** Its SHA must be `77d3d84b0c60e95fe0efa23a3f9a91d9235f948eb4c615da6e50095c32f4c6eb`, and it must contain 818 rows.
2. **Confirm the host images by SHA.**
   - typed: `ced49a39…a04f`
   - native: `48f9254b…9c03`
   - guard: `79809bfa…f3ac`
3. **Run the cells in `07-physics-workbook.py`** and check them against the recorded results:

```text
pairedPhysics("particle",128,"guarded-soa-scalar","guarded-soa-pie") → 12 blocks, 89.30%, 12 winning
pairedPhysics("particle",128,"aos-scalar","convert-pie-roundtrip")   → 12 blocks, −47.18%, 0 winning
pairedPhysics("contact",128,"grouped-scalar","grouped-pie")          → 14 blocks, −43.89%, 0 winning
simd.executions("physics-guarded_soa_pie", ..., "packed-arithmetic") → 16 executions at PC 740
```

4. **Keep the three kinds of item separate.** The manuscript and the replay distinguish measured arms, alternatives declined for correctness, and future inference mechanisms. Do not merge them when citing results.

## 10. Automatic recognition

A host compiler experiment now takes ordinary Typed function definitions and emits a symbol map selecting either a qualified checked entry point or the original compiled function. The match reads one numeric operation tape from the production Typed frontend. It uses the function signature and the operations. Function names appear in diagnostics and symbol bindings. Renaming functions or moving them past another declaration preserves eligibility.

Consider the following two reads and write, with signed conversion and clamping omitted here for readability.

```text
load halfword at n + i
load halfword at i
store the saturated sum at i
```

Represent a cell index by three coefficients `(a,b,c)` such that its value is `a*i + b*n + c` in i32 arithmetic. The index `n + i` has coefficients `(1,1,0)`. The index `i` has coefficients `(1,0,0)`. At an iteration `0 <= i < n`, those address families occupy disjoint intervals `[n,2n)` and `[0,n)`. Each iteration writes a different position. Thus eight lanes can gather the input values and commit the outputs together on the guard-admitted path. For interleaved records, every position has an even index and every velocity an odd one. The source `i + i` normalizes to the same `(2,0,0)` as `2 * i`.

Address analysis by itself is insufficient. The matcher verifies unit induction and its return, both checked reads from the same buffer, the halfword memory width and offset, the exact explicit conversion of each unsigned read to a signed value, widened addition of both distinct values, both saturating limits and a single checked store to the inferred position. Introducing an extra write can change the observable state at a trap even if the last store produces the same successful result. Such a function retains the original stock implementation.

```text
for function in Typed.frontend(source):
    if signature differs or numeric tape exceeds 256 words:
        publish original RV32 symbol
    else:
        prove signed saturating arithmetic, memory effects and address families
        if all proofs succeed:
            bind published entry to checked implementation for the inferred layout
        else:
            bind published entry to original RV32 symbol
```

| Qualification | Evidence |
|---|---|
| Two original functions and four equivalent variants | Selected interleaved or planar PIE after moving, renaming, commuting the sum or affine indices, or exchanging the two read roles. Native replay observes packed arithmetic on every accepted function. |
| Eleven near matches | Shifted, overlapping, nonlinear or changed destinations, altered sign and saturation operations, a duplicated addend, an extra store, a changed return and an over-budget tape all fall back. |
| Differential observations | 2,280 comparisons with stock over signed counts, capacities, aligned and unaligned data. Compare returned word or first trap indication and all observed memory bytes including the write prefix. Stock and forced strong-scalar compiler policies also execute zero packed additions. |
| Sensitive negative control | Starting at position 32,767 with velocity 3, the changed clamp really writes 32,766 through its fallback. The accepted original writes 32,767. |
| Image identity | The selected original corpus rebuilds the full 3,400-byte calibrated host image byte for byte. Each of its three separate relocatable objects also matches. |

The strongest final check uses the actual firmware that produced the timings. Its digest begins `f9ad948d`. The scanner finds all 1,652 native kernel bytes and all 1,476 stock machine-code bytes at unique offsets in that firmware (313,308 and 311,832). The native linker placed the guard wrappers elsewhere. Comparing each instruction outside the two PC-relative relocation sites in each wrapper, and decoding all eight call and fallback targets, ties the selected entry map to the calibrated code at its real location. The same original guarded planar update therefore has a measured 89.30% paired cycle reduction against its matched strong scalar at 128 aligned particles. Host recognition elapsed time and extra working heap on the P4 remain unmeasured.

The experiment is an entry-point compiler for self-contained modules, invoked with `node 09-recognize-particles.mjs input.typed out [pie|scalar|stock]`. Its host driver makes a separate bounded preflight before emitting ordinary stock code and links the selected assembly templates. Calls compiled inside stock functions continue to target their original compiled bodies. Both specializations and stock functions are present in the calibration module. This choice makes comparison and fallback possible and increases image size. Moving the selection to production streaming lowering, measuring net size after dead-code elimination and deciding whether a short or poorly aligned input warrants the strong scalar path are separate engineering decisions.

The benchmark ultimately supports two compiler decisions. A resident, suitably aligned planar saturating update merits a checked packet specialization. The same arithmetic expressed over transient interleaved input or scattered contact bodies has different movement costs. A selection rule should model those costs and treat upstream conversion and solver order as application decisions.

### Reproducing the compiler experiment

From the repository root set `P` to the ticket's `scripts/physics` directory and `PREFIX` to the Espressif toolchain pathname ending in `riscv32-esp-elf`. The files produced under the output directories include the native images, ELF/disassembly or entry map, the distinct controls and the joined evidence.

```sh
python3 "$P/03-qualify.py" /tmp/physics-calibration "$PREFIX"
python3 "$P/10-verify-recognition.py" /tmp/physics-recognition "$PREFIX"
python3 "$P/12-bind-flashed-physics.py" "$FIRST_BENCHMARK_FIRMWARE" \
    /tmp/physics-calibration /tmp/physics-recognition/original /tmp/physics-binding.json
python3 "$P/07-physics-workbook.py" --addr 127.0.0.1:3794
```

See `physics.typed` for ordinary source, `physics.S` for the scalar and PIE bodies, `board/physics_checked.S` for the admission guard and `board/physics_bench.c` for hardware validation. The selector and its adversarial test program are `09-recognize-particles.mjs` and `10-verify-recognition.py`. The archival decision records and physical identity witness are in `various/physics/recognition.json` and `various/physics/recognizer-flashed-binding.json`.

## References

- Erin Catto describes incremental contact coloring and the representation used by a production physics solver. [SIMD Matters, Box2D](https://box2d.org/posts/2024/08/simd-matters/)
- Espressif documents the processor’s PIE registers, instruction families and vector load constraints. [Introduction to the PIE, Espressif](https://developer.espressif.com/blog/2024/12/pie-introduction/)

## Run this article's JavaScript

From the compiler checkout, the following commands open a fresh stateful session on port 3794 and run the exact cell printed below. The shell variable `sid` retains the session ID for follow-up queries. If the service has stopped, its [launcher](../scripts/evidence/06-start-workbench.sh) accepts `candidates` to mount the combined study.

~~~sh
ticket=$(ls -d ttmp/2026/11/21/PICOCALC-SIMD-LAB--*)
sid=$(python3 "$ticket/scripts/director/09-open-lab-session.py" --keep | awk '{print $NF}')
go run ./cmd/trace-repl eval --addr 127.0.0.1:3794 --session "$sid" < "$ticket/scripts/reports/04-physics.js"
~~~

~~~js
({
    checkedPlanar: lab.physicsPair("particle", 128, "guarded-soa-scalar", "guarded-soa-pie"),
    oneTickIncludingConversion: lab.physicsPair("particle", 128, "aos-scalar", "convert-pie-roundtrip"),
    identicalContactOrder: lab.physicsPair("contact", 128, "grouped-scalar", "grouped-pie")
})
~~~

[Standalone JavaScript file](../scripts/reports/04-physics.js) · [Checked replies from all six articles](../various/director/report-cell-replies.json)

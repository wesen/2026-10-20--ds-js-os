---
Title: Fixed-point particle layouts and contact scheduling on the ESP32-P4
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics: [compiler, performance, picocalc]
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Measuring layout and contact scheduling independently

The physics study uses two one-dimensional update laws. A Q8.8 value represents the signed integer stored in one halfword divided by 256. Both laws can operate entirely on integer coordinates because their operands share a scale. We compare output halfwords at the end of one step. This design makes exact numerical agreement testable at saturation boundaries.

## Particle update

For each particle, compute the new position as the signed saturation of the previous position plus velocity. A record occupies four bytes in the interleaved representation: two for position and two for velocity. The planar representation stores all positions followed by all velocities. Eight consecutive planar positions fit in one 128-bit PIE register. An interleaved implementation must obtain positions and velocities in the appropriate lane order and preserve each velocity on output. This changes the cost of memory movement even with identical arithmetic.

The representations below describe the same two physical particles:

```text
interleaved bytes, signed halfwords     [x0, v0, x1, v1]
planar bytes, signed halfwords          [x0, x1, v0, v1]
mathematical update                     xi' = clamp(xi + vi, -32768, 32767)
```

The factorial comparison contains four hand-scheduled machine-code arms, scalar and packed for each layout. The same source operation is also written in ordinary Typed for both representations and compiled unchanged. The two Typed controls show the current compiler's output. They retain language-defined per-access checks, whereas the assembly kernels take valid slices certified by the harness. The native scalar-versus-packed pairs share a prevalidated data contract. Compiling the checked Typed controls today need not generate any PIE.

The workload sizes of 7, 8, 64, 127 and 128 exercise the no-packet case, the first full packet, tails, and aligned groups. Test the end-to-end migration cost separately by starting with interleaved storage, converting to planar, running the packed planar update, and converting back. A conversion-only arm measures the same two layout changes. If a simulation keeps state planar for many ticks, the up-front conversion could amortize; this experiment gives a single-tick measurement. It measures neither a complete game nor a universal number of frames to break even.

## Contact update and dependency proof

A contact is an ordered pair of distinct writable body indices. Let `A` and `B` be their old signed velocities. Compute `d=floor((B-A)/2)` in signed 32-bit arithmetic and set `A'=A+d`, `B'=B-d`. Values are bounded: the original difference lies in [-65535,65535] and `d` in [-32768,32767]. Both new velocities lie between the old velocities, with exact preservation of their sum. The rule provides an integer workload with two reads and two writes per contact. It is a reduced velocity-relaxation kernel, with no geometric collision detection, mass matrix, friction or persistent impulse cache.

Two contacts sharing a dynamic body can observe different input values if reordered. The scheduler scans the input list and greedily assigns a contact to the first color with neither body already present. No body is touched by two contacts of the same color. Applying a single color in packets of eight therefore produces the same result as applying that color sequentially. Reordering the colors can change the result compared to the producer's original sequence. Confirm both facts using a chain, a center-and-spokes star, disjoint pairs and a deterministic 128-body graph.

```text
original order → independent scalar reference
               → greedy coloring → same-order scalar
                                  → same-order PIE
                                  → same-order checked Typed
```

For physical timing, prepare the schedule outside timed updates and also measure scheduling alone and scheduling plus grouped PIE in their own arms. A changing graph and a long-lived graph have different amortization behavior. Test grouped scalar versus grouped PIE over the same contacts in the same order. Grouped Typed can process the flattened list because it performs immediate stores. Its host per-color controls may pay extra function entries, so retain the invocation granularity with each observation.

## Identity and qualification

The host uses the production Typed front end and streaming RV32 emitter. A generated, immutable assembly stream embeds the emitted words with their public entry symbols. The board compiler links precisely these words, so the experiment does not require an independent Typed implementation on the device. The timed interval covers repeated kernel calls plus harness dispatch. Preparation and correctness checks run outside it. The native assembly undergoes assembly and static linking with the Espressif toolchain. The host replays actual RV32 image words in Unicorn and models a small allowlisted set of PIE instructions using vendor disassembly. The board independently executes these instructions. Each recorded host address is relative to its own linked image.

Each timed arm starts with twelve copies of the same deterministic state prepared before reading the cycle counter. Output validation, checksums and UART emission happen after the second counter read. Twelve particle blocks and fourteen contact blocks rotate arm ordering and retain individual records. The same operator runs all board studies. A failure in any buffer comparison invalidates that arm. The counter measures elapsed CPU cycles for a batch including harness calls; one emulated instruction in the host study has a different unit.

The researcher manuscript, replay script and retained device data distinguish measured arms, alternatives declined for correctness, and future compiler inference mechanisms. A winning manually selected arm is evidence about attainable speed for this kernel. It does not by itself evaluate the compiler's selection policy on a held-out workload.

## Checked candidate plans and the board schedule

A second pair of controls connects each particle layout to an explicitly selected checked plan. The caller invokes exactly the stock Typed signature. The wrapper admits a positive count when the buffer capacity covers `2*n` halfwords; it tests `n <= capacity/2` to avoid an overflowing multiplication. All other cases branch to the original checked function, which performs each load and store in source order. Four candidate wrappers select scalar or PIE under this same guard. The embedded stock function, candidate wrapper and selected native kernel are independent objects in the firmware. This is an experimentally specialized plan for a known kernel; no general new vectorizer has been inferred from recognizing its function name.

Each particle size has twelve arms. The first four are the native factorial, then two unmodified Typed baseline functions, two layout conversion arms, and four matched checked plans. Twelve cyclic blocks put each arm in each ordinal position once. Contacts use seven arms and fourteen cyclic blocks. The board thus prints 818 measured rows, each validated against an independent reference. The host additionally tests nonpositive count and partial capacities on every guarded arm. It records the exact post-trap memory state and virtual-machine interruption, and the normal return value for paths that complete.

Box2D's solver research describes packing contacts which share no dynamic body and retaining the coloring while contacts survive. The toy fixture here fixes one step of a two-body relaxation law and separately times the complete deterministic input-generation, coloring and stable scatter used in this harness. A production incremental coloring algorithm would have a different cost. [Erin Catto on contact coloring and SIMD](https://box2d.org/posts/2024/08/simd-matters/) · [Espressif on aligned vector loads and PIE](https://developer.espressif.com/blog/2024/12/pie-introduction/)


## Transferring the qualified layouts into a compiler

The first integration target is a host prototype for exported Typed entries. The frontend exposes one numeric operation tape per function through `typedWasm.compileFunctions(..., true, onFunction)`. The recognizer declines a tape larger than 256 words before decoding it. A cursor verifies the single-loop control flow, checked halfword accesses, sign extension, widened sum, saturation clamps, sole store, induction step and return. Index expressions are normalized to coefficients of iteration, count and constant in i32 arithmetic. Distinct role IDs protect the induction variable and loaded values from mutation. Ordinary scalar compilation supplies the fallback and every unsupported function.

```text
ordinary Typed source
  ├── per-function numeric operations → bounded proof → entry selection
  └── production compiler → generic code for every function
checked exported entry
  ├── count > 0 and capacity / 2 >= count → qualified scalar or PIE body
  └── other input → source-ordered generic function and its original traps
```

The study implementation generates one proof record and public entry symbol per function. Two recognized layouts share the wrapper code and use separate native templates. Multiple accepted functions of the same family receive different labels. Recognition considers source arithmetic and affine access families. Names remain solely as identifiers for symbol emission and reporting. The host compiler fixture is a standalone driver and checks self-contained modules. Internal stock calls keep their original targets. No compile-time performance bound for the complete host driver follows from the 256-word bound on its local analysis.

The 2,280-comparison qualification and the actual flashed-image binding are described in the [physics research report](../analysis/04-fixed-point-particle-layouts-and-contact-scheduling-on-the-esp32-p4.md). Source, plan records, selected addresses, real stock fallbacks and complete before/after state are available to independent reviewers.

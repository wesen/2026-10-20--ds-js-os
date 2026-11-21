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

The host uses the production Typed front end and streaming RV32 emitter. A generated, immutable assembly stream embeds the emitted words with their public entry symbols. The board compiler links precisely these words, so the experiment does not require an independent Typed implementation on the device. The physical trial therefore measures generated execution only. The native assembly undergoes assembly and static linking with the Espressif toolchain. The host replays actual RV32 image words in Unicorn and models a small allowlisted set of PIE instructions using vendor disassembly. The board independently executes these instructions. Each recorded host address is relative to its own linked image.

Each timed arm starts with twelve copies of the same deterministic state prepared before reading the cycle counter. Output validation, checksums and UART emission happen after the second counter read. Eight blocks rotate arm ordering and retain individual records. The same operator runs all board studies. A failure in any buffer comparison invalidates that arm. The counter measures elapsed CPU cycles for a batch including harness calls; one emulated instruction in the host study has a different unit.

The researcher manuscript, replay script and retained device data distinguish measured arms, alternatives declined for correctness, and future compiler inference mechanisms. A winning manually selected arm is evidence about attainable speed for this kernel. It does not by itself evaluate the compiler's selection policy on a held-out workload.

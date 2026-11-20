---
Title: When a scalar chess vertex loop becomes eight PIE lanes
Ticket: PICOCALC-TYPED-PIE
Status: active
Topics:
    - compiler
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/01-vertices.typed
      Note: Original scalar vertex projection
    - Path: repo://ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/qualify.mjs
      Note: Independent differential host coverage
    - Path: repo://ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/various/physical.json
      Note: Counter distributions, correctness cases, and firmware restoration
ExternalSources: []
Summary: A measured experiment in automatic eight-lane vertex projection from ordinary scalar Typed code.
LastUpdated: 2026-11-20T16:09:34.014991268-05:00
WhatFor: ""
WhenToUse: ""
---

# When a scalar chess vertex loop becomes eight PIE lanes

An isometric board renderer projects three integer coordinates into two screen coordinates and a depth used for draw order. It applies the same formulas to every vertex. This is a suitable place to investigate automatic vectorization because each result has a small, observable set of dependencies. The experiment compiles one ordinary Typed function through the existing frontend and compares three machine-code bodies generated from that function.

## One vertex before eight vertices

The fixture reads a vertex's x, y and z components from three buffers. A Typed buffer starts with a four-byte capacity followed by unsigned 16-bit units. `charCodeAt(i)` checks the index against the capacity and returns the unit as an i32. The fixture takes each component modulo 256 so the projection can operate on bounded coordinate codes. With x=17, y=25 and z=40, the loop writes screen x=361, screen y=647 and depth=82.

```javascript
for (let i = 0; i < count; i = i + 1) {
    const x = xs.charCodeAt(i) % 256;
    const y = ys.charCodeAt(i) % 256;
    const z = zs.charCodeAt(i) % 256;
    sx.setCharCodeAt(i, 384 + x - z);
    sy.setCharCodeAt(i, 640 + x + z - y * 2);
    depth.setCharCodeAt(i, x + z + y);
}
```

The backend sees a sequence of type-checked operations. It can identify the loop's initial value, comparison and induction update, and recognize the specific check-address-load sequence for a Typed buffer. This is where it can prove facts about the computation. The zero-extending load gives a range of 0 to 65,535. Remainder by positive 256 bounds that result to 0 through 255, and the same low eight bits are available with a mask. The addition `640 + x + z` reaches at most 1,150. The product `2 * y` reaches 510. Subtracting gives the interval [130, 1150]. This examination matters at every operation. An i32 expression can return a small result after subtracting two large intermediates, while a saturating 16-bit addition can change the intermediate and the final answer.

An ESP32-P4 vector register holds 128 bits. The selected routine loads eight halfwords per input, masks off the upper eight bits of each halfword, applies the same three expressions lane by lane and stores the eight results of each expression. It replaces multiplication by two with an addition of the same vector. Inputs live independently in their registers and the outputs have no cross-lane arithmetic. This is the part where the processor's PIE extensions directly reduce the work. [ESP32-P4 Technical Reference Manual, chapters 2 and 4](https://documentation.espressif.com/esp32-p4_technical_reference_manual_en.pdf)

## Prove what the compiler can and check what the caller controls

The compiler knows the operation and inferred ranges. The function caller controls the actual count, capacity, payload alignment and aliasing. Two buffer parameters may refer to some of the same memory. If an output affects an input's next element, computing eight loads before eight stores may observe different values than computing one at a time. A buffer store can also overlap a different buffer's capacity word. Each runtime guard compares the intervals from the header through the last vectorized element for pairs with at least one writer.

The guard calculates the largest whole number of eight-element groups. It checks that the count is in bounds for the arithmetic, that each participating buffer covers that prefix, that each payload starts on a 16-byte boundary, and that the checked addresses do not wrap. A guard failure enters the existing scalar loop at zero without having written output. A successful vector prefix leaves the scalar loop positioned exactly after the last complete group. For count 17 the vector routine can cover indices 0 through 15, and the original loop computes index 16.

This arrangement preserves failures too. Suppose count is 17 and the first output's capacity is 6. The guard rejects the prefix and the scalar loop fills six positions before failing on the seventh. If the capacity is 16, vectorization can fill those 16 positions, and the scalar tail performs the checks that fail at position 16. A guard that directly trapped on the first insufficient capacity would change what the caller could observe before the trap. LLVM's loop vectorizer also uses runtime disjointness checks and a scalar path when the needed memory properties are unavailable at compile time. [Auto-Vectorization in LLVM](https://llvm.org/docs/Vectorizers.html)

## Separate the proof from the vector hardware

There are three compiled expressions of the same source. Stock RV32 follows the existing general scalar emitter and checks each read and write. Guarded RV32 reuses the experiment's proof and runtime guard, walks pointers and reuses narrowed values, but processes one coordinate per instruction. The PIE version keeps the same guards and processes eight positions per group. The compiled function grows from 628 bytes to 1,416 bytes for guarded RV32 or 1,384 bytes for PIE. The extra entry checks and retained scalar path account for the size of both candidates. Inside that larger body, the guarded RV32 loop occupies 40 instruction words and the eight-vertex PIE loop occupies 29.

This comparison gives a specific interpretation to a stock-to-PIE speedup. Relocating checks and performing pointer arithmetic in a short, bounded loop already reduce the work of scalar code. The guarded-to-PIE difference estimates what eight-lane instruction selection contributes on the measured processor, given these emitted loops. It also avoids comparing the PIE code with a general scalar backend and attributing every difference to SIMD.

The independent host review ran the machine code against the real Wasm compiler and a separately specified reference. Its 145 states included 97 returns and 48 traps. In the host instruction model, 47 of those states selected the PIE path and together issued 510 eight-lane stores. It also exercised 35 source-level holdouts across six counts and both candidate arms, for another 420 executions. The reviewer assembled and disassembled the actual PIE words with the Espressif toolchain. Two reviewing counterexamples sharpened the eligibility rules. A legal scalar assignment could write to the induction slot while resembling an input declaration. Also, two additional stack slots pushed scalar-compilable functions past the native frame limit. The final selector disallows the induction write and reuses dead checked-address temporaries. [Independent qualification script](../scripts/review/qualify.mjs)

## Measure the loaded machine code

The board test embeds all three generated images into one isolated ESP-IDF application. The application runs all three routines from flash-mapped text and uses buffers in internal RAM. It batches calls on CPU0 of the revision 1.3 ESP32-P4, which reported 360 MHz at boot. Power management was disabled. The cycle counter brackets the batch. Each arm runs a warmup call, then 11 samples, each consisting of `floor(16384 / count)` calls. The table shows median cycles per call with aligned, disjoint buffers. Other checks exercise a naturally unaligned payload and an output that aliases an input. All 72 board correctness comparisons passed, with CRC-32 over the entire destination buffers and an additional element-by-element oracle for the disjoint buffers. This includes the poison-filled capacity after the end of the result, which checks that the vector stores never pass the scalar limit. [Physical benchmark receipt](../various/physical.json)

| Vertices | Stock RV32 | Guarded RV32 | PIE | Stock / PIE | Guarded / PIE |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 316 | 319 | 319 | 0.99× | 1.00× |
| 7 | 1,353 | 1,355 | 1,355 | 1.00× | 1.00× |
| 8 | 1,526 | 755 | 398 | 3.83× | 1.90× |
| 9 | 1,699 | 932 | 578 | 2.94× | 1.61× |
| 17 | 3,092 | 1,340 | 617 | 5.01× | 2.17× |
| 64 | 11,360 | 3,561 | 678 | 16.76× | 5.25× |
| 256 | 45,675 | 13,161 | 1,644 | 27.78× | 8.01× |
| 1,024 | 184,005 | 51,561 | 5,484 | 33.55× | 9.40× |

Counts 1 and 7 fall into the original loop after the first guard. Count 8 pays the full set of preflight checks and runs exactly one PIE group. Adding a ninth vertex adds a scalar tail. For large counts such as 1,024, the preflight cost is a small share of total time and each additional eight-vertex group has predictable work. At the configured 360 MHz, 5,484 cycles correspond to about 15 µs for the aligned 1,024-vertex call. This result characterizes the measured projection kernel and memory layout. A board frame also involves obtaining geometry, sorting, drawing, and updating the display.

The prototype shows how a typed compiler can select a narrow native representation from checked scalar operations. It also identifies when the optimization pays off. A short loop gets little benefit from version selection, and the extra native code consumes space for every selected function. The measured win appears when a renderer submits many independent vertices in six contiguous, aligned buffers.

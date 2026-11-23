---
Title: Candela's kernel at C++ speed
Ticket: PICOCALC-CANDELA-KERNEL-CODEGEN
Status: active
Topics:
    - compiler
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:22.78144373-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela's kernel at C++ speed

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

# Candela's kernel at C++ speed

Depends on PICOCALC-TYPED-VALUES (local records, record results, more than 8 parameters, continue, conditionals, u32, local arrays). It uses PICOCALC-COMPILE-CACHE where available.

## Baseline

PICOCALC-CANDELA-TYPED's paired study (`ttmp/2026/11/22/PICOCALC-CANDELA-TYPED--*/various/device-6c7e2ca0/`): Typed/C++ cycles per sample, geometric mean 1.76 over 18 scenes; 2.49–2.79× on the kernel-bound scenes B-01, R-01, L-03, V-02 and W-02; 0.81–0.99× where C++ interprets scene code. The earlier fragment study (PICOCALC-TYPED-F32) had Typed at 1.17–1.33× GCC on single functions. The gap is in how the generated program uses memory, not in single-function code generation.

## Work

1. **Regenerate with value types.** Change `tools/gen/candela/typed/` to use:
   - value records for WGSL vectors and structs, replacing static frame records;
   - record results, replacing the `r1..r3` fields;
   - native `continue`, `?:` and `u32`;
   - local arrays.

   Keep all three checks:
   - image error within E_rel ≤ 0.02 per scene;
   - Wasm vs RV32 bit identity on all 18 scenes;
   - the host Typed digests through the renderer core.
2. **Profile before optimizing.** Use the trace REPL or the Go machine's profile on B-01 to find where cycles go per function and per instruction class: loads and stores, float operations, calls. Write the result down before any compiler change.
3. **Compiler work the profile justifies.** Candidates, in the order the baseline suggests:
   - keep scalarized record fields in registers across calls (callee-saved float registers `fs0–fs11`);
   - bound local growth under `inline` and `split`. Locals grew to about 600 in `tracePath` and `sampleLobe`; set an inlining budget per caller;
   - range facts and value sets for f32 functions, which skip them today;
   - leaf and frame optimizations for float-heavy functions.

   Each change is gated by the 84-digest harness for integer programs, or explicitly re-pins digests with a board study when it changes them.
4. **Paired board study** against the baseline: the same 18 scenes, 4 blocks, alternating order. Report cycles per sample per scene and the geometric mean.

## Target

Geometric mean ≤ 1.3× C++, and kernel-bound scenes ≤ 1.5×. If that is not reached, report how far each step got and why.

## Gates

- `make test`, and `make test-host` with both policies (25/25).
- The three Candela checks above.
- `gallery.py --arm typed` and `--arm cpp` 18/18 on the device.
- The playable firmware healthy after every board session, restored from the main checkout.

## Refinements (2026-11-23)

Verified against the code and the measurements of this session (diary steps 1–6). Host numbers are RV32 instructions
per sample on the reference interpreter, 16 rows of frame 0; the C++ arm's count includes the renderer core.

**The gap is in the frame, not the arena.** Regenerating with value records and record results removed most arena
traffic but made the kernel slower on the host (B-01 10,279 → 11,464 instructions per sample): each value-record copy
and each record result became a chain of `flw`/`fsw` and `fmv.s` through frame slots. The profile (step 2) put
floating-point arithmetic under 7% of B-01. Frame loads and stores, moves, f32 constants, and the address arithmetic
and range checks of `getF32` made up the rest. The design's premise holds, with "memory" meaning the frame.

**Step 3's candidates, as built:**
- *fs registers across calls.* Callee-saved homes already existed (`planSavedHomes`). Giving them more locals (a lower
  `SAVED_MARGIN`) did not pay. What paid was the opposite: the caller-saved fa1–fa7, ft8 and ft9 as homes, at no
  cost, for locals whose live interval holds no call (`operandLocations.callFree`, kernel only).
- *An inlining budget per caller.* `INLINE_DEFAULTS.callerLocals = 400`. It was needed for correctness, not only size:
  without it s3_evalMaterial grew to 1,163 locals and its frame exceeded the instruction range.
- *Range facts and value sets for f32 functions.* Not built. The only checks the profile showed were `getF32`'s, and
  the `rows` pass removes them exactly (one two-sided check per group) without range facts.
- *Leaf and frame work.* This became four smaller changes the profile pointed at: `coalesce` (f32 copies), open
  inlining of record results, record-result leaves stored straight into their locals, and set-get forwarding.

**New, not in the design:** the `rows` pass, extended to affine index forms and record-field buffers, with dead index
stores removed (step 6). Generated code computes the same field load and index product in every inlined copy; value
numbering within straight stretches was enough to merge them.

**All changes run only on f32 functions under the kernel policy.** Integer programs keep their images: the 84-digest
harness is IDENTICAL 84 of 84 after every commit, and nothing was re-pinned.

**Host result**, instructions per sample, 16 rows of frame 0 (base: the compiler and generator before this ticket;
step1: the regenerated kernel; final: 6b1f2e3). The ratios are to the C++ arm; kernel-bound means B-01, R-01, L-03,
V-02 and W-02.

| Scene | C++ | base | ratio | step1 | ratio | final | ratio |
|---|---|---|---|---|---|---|---|
| B-01 | 5,743.6 | 10,278.9 | 1.790 | 11,463.5 | 1.996 | 8,193.0 | 1.426 |
| R-01 | 11,061.5 | 22,000.0 | 1.989 | 23,327.6 | 2.109 | 14,966.8 | 1.353 |
| L-03 | 4,567.3 | 8,036.0 | 1.759 | 9,045.8 | 1.981 | 6,666.4 | 1.460 |
| G-01 | 9,785.6 | 18,041.5 | 1.844 | 19,173.8 | 1.959 | 12,883.7 | 1.317 |
| E-02 | 5,517.2 | 7,981.8 | 1.447 | 8,730.9 | 1.582 | 5,696.7 | 1.033 |
| W-02 | 16,004.6 | 29,264.3 | 1.828 | 31,406.9 | 1.962 | 21,025.3 | 1.314 |
| F-01 | 6,795.6 | 12,779.0 | 1.880 | 14,065.1 | 2.070 | 9,898.1 | 1.457 |
| V-02 | 14,333.6 | 29,804.9 | 2.079 | 32,071.8 | 2.238 | 21,566.8 | 1.505 |
| G-02 | 18,686.9 | 21,316.6 | 1.141 | 22,625.3 | 1.211 | 17,373.8 | 0.930 |
| X-04 | 40,442.0 | 21,081.5 | 0.521 | 24,670.0 | 0.610 | 21,058.2 | 0.521 |
| S-02 | 25,566.9 | 32,833.9 | 1.284 | 35,402.8 | 1.385 | 25,521.9 | 0.998 |
| R-05 | 17,583.4 | 29,208.5 | 1.661 | 30,870.6 | 1.756 | 21,046.1 | 1.197 |
| V-03 | 53,164.7 | 61,661.3 | 1.160 | 57,389.8 | 1.079 | 52,244.2 | 0.983 |
| V-04 | 100,950.1 | 107,801.6 | 1.068 | 99,533.9 | 0.986 | 91,938.6 | 0.911 |
| R-08 | 122,808.0 | 66,684.4 | 0.543 | 66,402.8 | 0.541 | 60,133.8 | 0.490 |
| X-03 | 396,477.5 | 330,167.6 | 0.833 | 317,839.9 | 0.802 | 305,382.9 | 0.770 |
| R-04 | 650,101.2 | 675,580.3 | 1.039 | 610,945.6 | 0.940 | 584,574.5 | 0.899 |
| G-03 | 791,855.0 | 878,537.1 | 1.109 | 774,943.5 | 0.979 | 746,977.3 | 0.943 |
| geometric mean, 18 scenes | | | 1.290 | | 1.334 | | 1.034 |
| geometric mean, kernel-bound | | | 1.885 | | 2.054 | | 1.410 |

On the host the kernel-bound scenes went from 1.89x to 1.41x and the 18-scene geometric mean from 1.29x to 1.03x.

The device ratio will differ: the device's frames sit behind the PSRAM cache, and its cycles per instruction differ
by class. Step 4's paired board study remains the measurement of record. It was not run in this session (the
PicoCalc's keyboard I2C was NACKing until a power cycle).

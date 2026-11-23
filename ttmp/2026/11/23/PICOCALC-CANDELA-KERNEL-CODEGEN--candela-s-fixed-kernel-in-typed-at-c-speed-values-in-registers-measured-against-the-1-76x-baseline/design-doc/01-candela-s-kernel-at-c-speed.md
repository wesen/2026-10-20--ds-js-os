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

---
Title: The compiler's cost on the P4
Ticket: PICOCALC-COMPILER-DEVICE-COST
Status: active
Topics:
    - compiler
    - firmware
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:21.321497763-05:00
WhatFor: ""
WhenToUse: ""
---

# The compiler's cost on the P4

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

# The compiler's cost on the P4

Three measured costs, each found by an earlier ticket and left open:

1. **Source text kept in memory.** PICOCALC-RV32-REGISTERS found that the compiler realm grew by about 45 KB on the host (about 26 KB on the P4). The cause was not the new code's size: QuickJS keeps every function's source text unless `JS_SetStripInfo(rt, JS_STRIP_SOURCE)` is set (`firmware/third_party/quickjs/quickjs.h:969`), and `typed_p4.c` never sets it. The compiler's bytecode is cached across runtimes (see the top of `typed_p4.c`), so the stripping must happen where that bytecode is *produced*.
   - Measure `JS_STRIP_SOURCE` and `JS_STRIP_DEBUG` separately: QuickJS heap peak per boot compile, the bytecode cache size, and boot compile times.
   - Keep what error messages need. A compile error must still name the Typed source position. That comes from the compiler's own diagnostics, not from QuickJS line numbers, but check that every `compile rejected` message the tests produce is unchanged.
2. **The P4-only slowdown of lazy pass groups.** PICOCALC-TYPED-PIPELINE split the RV32 backend into a core bundle and two lazily loaded groups. On the P4 that cut 122–157 KB of heap peak but made every boot compile 15–96 ms slower. Callgrind on the host showed no instruction change (Agenda 132.35 M vs 132.4 M), and the cause was never found.
   - Find it, then fix or explain it. Candidates: evaluating a group bundle from the bytecode cache inside the compile, memory placement (PSRAM vs internal), and the cache lookup itself.
   - Use the device clock around each `eval_file` and around the compile's phases. The per-pass timers already exist.
3. **Files loads a whole group for two passes.** Files' `default` policy needs `split` and `version`, both in the loop group. Move `split` (2.5 KB) and anything else small that `default` needs into the core. Measure Files' compile time and heap.
4. **Three bundlers.** `compiler/typed/frontend/build.mjs`, `compiler/typed/rv32/build.mjs` and `compiler/typed/async/build.mjs` each concatenate ES modules into one script scope. Replace them with one shared bundler module (for example `compiler/typed/bundle.mjs`) that each build calls with its module list. Every generated bundle must stay byte-identical, or differ only in a header comment.

## Measurement

- A paired board study (`make bench-board STUDY=…`, or a study JSON under `bench/board/studies/`) of boot compiles. Arms: control (main) and candidate. Measure per app: compile µs, QuickJS peak bytes, and module bytes, which must be identical.
- Report each change separately where the study allows, at least stripping versus the group changes.

## Gates

- `make test`, and `make test-host` with both policies (25/25).
- The 84-digest harness: no image changes.
- The playable build passes health with peripherals on. Every boot app compiles within 75 % of its deadline.

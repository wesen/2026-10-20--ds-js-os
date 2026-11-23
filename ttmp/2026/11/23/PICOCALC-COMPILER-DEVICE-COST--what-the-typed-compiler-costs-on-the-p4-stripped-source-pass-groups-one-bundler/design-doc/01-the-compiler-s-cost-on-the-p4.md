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
RelatedFiles:
    - Path: repo://compiler/typed/bundle.mjs
      Note: the one bundler
    - Path: repo://compiler/typed/rv32/passes/kernel-group.js
      Note: passes only kernel runs
    - Path: repo://compiler/typed/rv32/passes/registry.js
      Note: groups inline, loops, kernel
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: TYPEDCOMPILE phases and COMPILER_STRIP
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

## Refinements (2026-11-23)

Decisions taken while implementing (details and evidence in the diary, `reference/01-diary.md`):

1. **Instrumentation first.** `typed_p4.c` prints a `TYPEDCOMPILE {...}` line after every compile: per evaluated
   compiler source whether it was cached or parsed, its load and top-level run time and the heap after it, the
   linker call, the teardown. It is permanent: the compile cache and later tickets read the same line.
2. **Stripping: `JS_STRIP_DEBUG`, set in every compile runtime.** The runtimes `p4_typed_compile` makes are the
   only producers of the cached bytecode (whichever compile first evaluates a source writes it), so the flag goes
   there, not into a separate producer. On the host the seven compiler sources make 1,065 KB of bytecode, 263 KB with
   `JS_STRIP_SOURCE` and 191 KB with `JS_STRIP_DEBUG`; the realm after reading them all is 1,139, 684 and 579 KB.
   Rejected-compile messages are identical under all three modes (33 cases from the tests' negative cases,
   `scripts/08-*`); with `JS_STRIP_DEBUG` a stack trace through the compiler keeps function names and loses
   `file:line`, which the host's run of the same compiler gives. The board measures both modes before the choice is
   final.
3. **Files no longer loads a pass group.** Since PICOCALC-TYPED-FIRST, Files is a Typed world under `interactive`.
   The playable image's one `default` compile is Candela's scene, the first compile of every boot. `default` needs
   `version` (which imports `hoist`) and `split`: `split` alone in the core changes nothing, and `version` with
   `hoist` (31 KB of source) would grow every boot compile's core. Instead the loops group is split: `loops` keeps
   what `default` adds to `balanced` (version, hoist, induction, split), and a new `kernel` group
   (`typed-rv32-kernel.js`) holds what only `kernel` runs (conjunctions, sets, ranges, facts).
4. **One bundler:** `compiler/typed/bundle.mjs` (script layout, plain-script concatenation, ES-module scope hoisting,
   the write/`--check` command line); each `build.mjs` lists its modules. Every generated bundle is byte-identical,
   headers included.
5. **The slowdown.** Compile runtimes never run QuickJS's cycle collector (`typed_p4.c`'s allocator does not maintain
   `malloc_state.malloc_size`, which this QuickJS's GC trigger reads), so a GC schedule cannot be the cause. The
   instrumented boot shows the group load inside Chess's compile costs 6.8 ms, not 96. The remaining candidates are
   measured in one image with the `typedcost` experiment command (`scripts/02-experiment-tree.py`): lazy groups
   against everything evaluated up front, and the compile's heap moved by a held PSRAM block.
6. **The 84-digest harness** is PICOCALC-RV32-REGISTERS's, copied into `scripts/digests/` with Files and Agenda as
   the Typed worlds they are now (the old units no longer compile).

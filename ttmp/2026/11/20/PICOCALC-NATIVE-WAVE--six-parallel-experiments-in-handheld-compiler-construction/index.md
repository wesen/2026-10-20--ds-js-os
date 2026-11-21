---
Title: Six parallel experiments in handheld compiler construction
Ticket: PICOCALC-NATIVE-WAVE
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Generates native instructions and fixes function and import calls.
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Checks Typed source and emits the numeric operations examined by the lowering studies.
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/scripts/director/10-replay-host.sh
      Note: Reproduces the independent held-out treatments and instruction counts.
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T18:54:30.271263216-05:00
WhatFor: ""
WhenToUse: ""
---

# Six parallel experiments in handheld compiler construction

## Research question

Which compiler decisions improve the complete experience of building, editing and running a small native program on a PicoCalc? The six studies start independently from project revision `cb492ce`. Each study publishes its assumptions, candidate and evidence, including outcomes where the simpler compiler wins.

| Study | Control and decision | Primary observation |
|---|---|---|
| 1 · Bounds proofs | Compare proof admission in an existing streaming pass against unchanged checks and fixed-budget controls. | Compiler cost, useful proofs and execution of identical guest work. |
| 2 · Semantic operations | Compare early expansion with preserving a read or literal-write operation until native instruction selection. | Code size, cold cost and actual guest behavior. |
| 3 · Leaf functions | Compare existing call lowering, a leaf without a stack frame where legal, and selective inlining. | Physical search time with identical positions, moves and node counts. |
| 4 · Incremental dependencies | Compare clean compilation, the global descriptor and a precise per-function invalidation rule. | Edited native output identity, diagnostics, edit latency and retained bytes. |
| 5 · Stack certificates | Compare an independently checked emitted native stack bound with the compiler's declared bound. | Coverage, certificate size, checking cost and assumptions for imported calls. |
| 6 · Turn lifetimes | Compare explicit contracts and inference for references whose storage expires on a turn boundary. | Correct classifications across callers, aliases, joins and suspension. |

## Read the research

Start with [What a handheld compiler should remember](analysis/07-what-a-handheld-compiler-should-remember.md) for the common experiment, application results and release recommendations. The six teams used the same current compiler and separate research prototypes.

| Study | Intern guide | Research report | Work diary |
|---|---|---|---|
| Selecting bounds proofs | [Admission policy](design-doc/01-select-bounds-analysis-while-streaming.md) | [Where the fixed budget goes](analysis/01-streamed-bounds-admission.md) | [Investigation](reference/11-bounds-admission-diary.md) |
| Retaining checked operations | [Frontend to RV32](design-doc/02-preserve-checked-operations-to-native-lowering.md) | [Operation lifetime](analysis/02-checked-operation-lifetime.md) | [Investigation](reference/12-operation-lifetime-diary.md) |
| Leaf functions and inlining | [Register and call conventions](design-doc/03-leaf-functions-and-selective-inlining.md) | [Generated Chess execution](analysis/03-leaf-lowering-and-selective-inlining.md) | [Investigation](reference/13-leaf-lowering-diary.md) |
| Dependency tracking | [Invalidation and relinking](design-doc/04-precise-fragment-dependencies.md) | [Edit evidence](various/04-deps/clean-fragments.json) | [Investigation](reference/14-dependency-reuse-diary.md) |
| Stack-use certificates | [Claims and independent checks](design-doc/05-stack-use-certificates.md) | [Stack bounds and rejected candidate](analysis/05-stack-use-certificates.md) | [Investigation](reference/15-stack-certificates-diary.md) |
| Buffer lifetimes | [Borrowed values across turns](design-doc/06-infer-turn-lifetime-parameters.md) | [Inferred continuation lifetimes](analysis/06-turn-lifetime-inference.md) | [Investigation](reference/16-turn-lifetime-diary.md) |

The [six-guide reMarkable book](various/director/remarkable.json) is filed under `/ai/2026/11/20/PICOCALC-NATIVE-WAVE`. The [first physical matrix](various/director/paired-results.json) measures the guest after compilation. The [balanced fresh-compiler comparison](various/01-bounds/physical-first-summary.json) measures time spent producing a complete native world.

## Shared evaluation

Each researcher owns a distinct design, implementation, diary and article. Research operators can build and test on the host concurrently. Physical measurements have one operator at a time. Preserve the installed, qualified ordinary firmware and check the application and partition identities at each handoff. Absolute host timings under concurrent load are exploratory. Rotate physical arms and compare corresponding runs. Static correctness studies can use relevant host controls where an extra board run would add no information.

The director constructed an independent test program, a clean expected-output calculation and a separate set of lifetime cases. Its source and tests were fixed before candidate results. [Hash commitment and clean control](various/director/heldout-lock.json) · [Director diary](reference/01-director-investigation-diary.md) · [Task list](tasks.md)

## Related work

The [professor’s open roadmap](../../19/PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/index.md) identifies the original acceptance gates. The [previous release lab](../PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/index.md) provides baseline literal storage, global fragment invalidation, and generated Chess search measurements.

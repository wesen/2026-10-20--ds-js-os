---
Title: Eight experiments in compiler construction on the PicoCalc
Ticket: PICOCALC-COMPILER-LAB2
Status: active
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T21:53:48.044137313-05:00
WhatFor: ""
WhenToUse: ""
---

# Eight compiler experiments on the PicoCalc

This program asks whether a compiler executing on the ESP32-P4 can produce faster native builds, smaller or faster guest code, and shorter edit-to-run latency on the same device. The previous four-study program ended at source revision `dbe26be`. The first prerequisite for this wave passed all 24 historical application replays.

## Research designs

1. [ Measuring scanning and token lifetime independently on the PicoCalc](../PICOCALC-FRONTEND-FACTORIAL--separate-scanning-token-allocation-and-lazy-text-on-the-picocalc/design-doc/01-measuring-scanning-and-token-lifetime-independently-on-the-picocalc.md)
2. [ How a Boolean expression becomes a branch](../PICOCALC-CONDITION-TARGETS--compile-typed-conditions-directly-to-branch-destinations/design-doc/01-how-a-boolean-expression-becomes-a-branch.md)
3. [ A per-function stream for text reads and comparison branches](../PICOCALC-STREAMED-TYPED-OPS--preserve-typed-reads-and-predicates-through-streamed-native-lowering/design-doc/01-a-per-function-stream-for-text-reads-and-comparison-branches.md)
4. [ From an Editor source edit to a native return with bounded fragments](../PICOCALC-EDITOR-FRAGMENTS--bound-native-function-fragments-and-time-real-picocalc-editor-edits/design-doc/01-from-an-editor-source-edit-to-a-native-return-with-bounded-fragments.md)
5. [ Choose a register home before lowering a function](../PICOCALC-REGISTER-LOCALS--measure-register-homes-for-profitable-rv32-locals/design-doc/01-choose-a-register-home-before-lowering-a-function.md)
6. [ A fixed-budget proof for guarded Editor text reads](../PICOCALC-BOUNDED-INDEX--prove-editor-text-bounds-through-two-guards-with-bounded-search/design-doc/01-a-fixed-budget-proof-for-guarded-editor-text-reads.md)
7. [ A preregistered comparison of bounded function selectors](../PICOCALC-ANALYSIS-SELECTION--predict-analysis-benefit-under-a-fixed-compiler-work-budget/design-doc/01-a-preregistered-comparison-of-bounded-function-selectors.md)
8. [ Compiling a typed Editor Open into a start and a native continuation](../PICOCALC-EDITOR-AWAIT--compile-editor-open-through-a-real-typed-await-and-native-resumption/design-doc/01-compiling-a-typed-editor-open-into-a-start-and-a-native-continuation.md)

## Supervisor evidence

The [trial protocol](design-doc/01-how-to-compare-eight-compiler-designs-on-one-esp32-p4.md) defines the controls and measurement units. The [replay receipt](various/staged-replays.json) identifies the staged compiler and each tested entry point. Eight [Opus High reviews](various/opus/) give independent proposals for experiments. See the [diary](reference/01-supervising-experimentalist-diary.md) for rejected attempts and the [task list](tasks.md) for outstanding work.

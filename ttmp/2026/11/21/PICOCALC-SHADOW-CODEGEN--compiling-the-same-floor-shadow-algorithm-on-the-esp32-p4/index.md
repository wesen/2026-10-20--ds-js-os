---
Title: Compiling the same floor shadow algorithm on the ESP32-P4
Ticket: PICOCALC-SHADOW-CODEGEN
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Native frontend consumer and machine code emitter
    - Path: repo://picocalc-os/nucleus/raytrace_demo.c
      Note: Production C shadow reference
    - Path: repo://picocalc-os/worlds/raytrace/raytrace.typed
      Note: Unchanged Typed algorithm and fixtures
ExternalSources: []
Summary: "Physical shadow timings, an optional streaming compiler pass, and a held-out Chess transfer test"
LastUpdated: 2026-11-21T17:26:48.03694886-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiling the same floor shadow algorithm on the ESP32-P4

A compiler-only change removed 74,226 dynamic helper calls from the opening ray-traced frame. The native ESP32-P4 image now has an opt-in rule for small unary guarded returns. General selection reduced opening full-frame time from 55.6635 to 53.0440 ms, and the independent Chess evaluator measured a transfer effect in advanced mode. Both apps were compiled from their frozen source.

## Read the study

1. [Director’s report on the algorithm, controls and physical results](analysis/01-from-a-shadow-ray-to-an-esp32-p4-instruction-budget.md).
2. [Researcher’s chapter on choosing the optimization](analysis/03-choosing-a-compiler-optimization-from-the-cost-of-a-floor-shadow.md) and [implementation guide from typed operations to machine words](design-doc/03-recognizing-pure-guarded-numeric-returns-in-a-streaming-compiler.md).
3. [Experimental protocol and hardware contracts](design-doc/01-experimental-protocol-and-implementation-guide-for-the-shadow-compiler-lab.md) and [blind Chess transfer plan](design-doc/04-validation-and-blind-chess-transfer.md).
4. [Director’s diary](reference/01-lab-director-investigation-diary.md) and [compiler researcher’s diary](reference/03-compiler-investigation-diary.md). The [initial device](reference/02-device-research-checkpoint.md) and [validation](reference/04-validation-operator-diary.md) handoffs record the staffing change.

## Reproduce a result

[Open a persistent trace session](scripts/reports/05-open-repl.py) to load all paired blocks, host counts and paths. The [JavaScript workbook](scripts/reports/shadow.js) defines individual phase comparisons. [Device trial inputs and raw rows](various/board/final/rows.jsonl), [native image identities](various/board/candidate-images.json) and [independent route classification](various/validation/strata.json) support separate analysis.

See the [task ledger](tasks.md) and [changelog](changelog.md).

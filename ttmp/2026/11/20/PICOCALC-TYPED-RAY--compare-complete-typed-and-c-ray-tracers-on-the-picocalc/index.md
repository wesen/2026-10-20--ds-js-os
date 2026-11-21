---
Title: Compare complete Typed and C ray tracers on the PicoCalc
Ticket: PICOCALC-TYPED-RAY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:51:25.871803705-05:00
WhatFor: ""
WhenToUse: ""
---

# Compare complete Typed and C ray tracers on the PicoCalc

A handheld compiler and an optimizing C compiler can produce very different instruction sequences for the same image. This lab starts with the existing 160 × 160 fixed-material scene. It tests exact visibility and color before measuring complete frames. The [experimental contract](design-doc/01-complete-frame-contract-and-compiler-experiment-matrix.md) identifies the independent variables. The [director diary](reference/01-director-investigation-diary.md) records decisions and commands. The [task list](tasks.md) follows the work through physical qualification and publication.

| Research lane | Work product |
|---|---|
| Scalar renderer | A single native entry that computes the complete frame from Typed source, and differential tests against the existing C kernel. |
| Compiler | A semantics-preserving scalar code-generation trial and an assessment of signed-width and packed row lowering. |
| Physical measurements | Matched runs with live outputs, separate audit and timing calls, asset and firmware identity, and board receipts. |
| Director | Integration, a separate projected-span algorithm control, and independent synthesis. |

The earlier [C and PIE device study](../PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/various/device/summary.json) supplies a historical control. The [Candela authoring study](../PICOCALC-CANDELA--programmable-handheld-scenes-with-typed-builders-and-staged-materials/index.md) supplies the programmable material system.

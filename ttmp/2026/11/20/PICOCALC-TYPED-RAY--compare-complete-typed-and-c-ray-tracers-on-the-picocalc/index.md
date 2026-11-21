---
Title: Compare complete Typed and C ray tracers on the PicoCalc
Ticket: PICOCALC-TYPED-RAY
Status: complete
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
LastUpdated: 2026-11-21T00:18:59.246945418-05:00
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

## Results on the ESP32-P4

The default clean frame took 9.521 ms in scalar C, 8.350 ms in packed C, 57.674 ms in ordinary Typed and 29.975 ms in the best measured Typed combination. The board trials covered all 25,600 pixels, depth values and object IDs. The full set includes 324 fixed-scene blocks, 36 paired programmable frames and 36 isolated material/shadow observations.

- [Director’s project report and physical comparison](analysis/01-which-work-survives-compilation-in-a-handheld-ray-tracer.md)
- [A complete ray tracer in Typed](analysis/02-a-complete-ray-tracer-in-typed.md)
- [What eight lanes save in a complete Typed ray tracer](analysis/03-what-eight-lanes-save-in-a-complete-typed-ray-tracer.md)
- [How to time a complete Typed ray tracer on the handheld](analysis/04-how-to-time-a-complete-typed-ray-tracer-on-the-handheld.md)

The earlier [C and PIE device study](../PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/various/device/summary.json) supplies a historical control. The [Candela authoring study](../PICOCALC-CANDELA--programmable-handheld-scenes-with-typed-builders-and-staged-materials/index.md) supplies the programmable material system.

The final firmware is identified by its [verified readback and live UI receipt](various/device/final.json). The four reports and three figures were committed and pushed to go-go-parc main at `1440d663ab467ba9c5e0a83a475c4468d2dfaa2c`. [Publication receipt](various/director/publication.json)

---
Title: Factor the Typed ray scalar row
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-SCALAR-BREAKDOWN--factor-the-typed-ray-scalar-row/scripts/compiler/make-backends.mjs
      Note: Controlled generator
    - Path: repo://ttmp/2026/11/21/PICOCALC-SCALAR-BREAKDOWN--factor-the-typed-ray-scalar-row/various/device/summary.json
      Note: Paired physical timing evidence
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:48:11.274075909-05:00
WhatFor: ""
WhenToUse: ""
---

# Factor the Typed ray scalar row

Measure how repeated bounds checks, local register homes and sphere-row rejection affect the same scalar ray tracer on the ESP32-P4. The companion held-out experiment tests a preregistered instruction prediction in the shadow routine.

## Read the study

- [Separating the costs of a scalar ray on the ESP32-P4](analysis/01-separating-the-costs-of-a-scalar-ray.md)
- [What a bounds check costs in a ray-tracing loop](analysis/02-what-a-bounds-check-costs-in-a-ray-tracing-loop.md)
- [Which scalar costs show up in a physical frame?](analysis/03-which-scalar-costs-show-up-in-a-physical-frame.md)
- [Experimental design and implementation guide](design-doc/01-experimental-design-and-implementation-guide.md)
- [Reproduce the scalar compiler factorial](design-doc/02-reproduce-the-scalar-factorial.md)
- [Protocol for the paired physical scalar trial](design-doc/03-protocol-for-the-paired-physical-scalar-trial.md)
- [Director investigation diary](reference/01-director-investigation-diary.md)
- [Scalar compiler investigation diary](reference/02-compiler-investigation-diary.md)
- [Physical scalar factor investigation diary](reference/03-physical-investigation-diary.md)

Reproduction programs are in [scripts](scripts/). The [evidence directory](various/) contains frozen inputs, compact receipts or raw timing records. See the [tasks](tasks.md) and [changelog](changelog.md) for status.

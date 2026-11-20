---
Title: Render a three-dimensional Chess position with a delivered Typed painter
Ticket: PICOCALC-CHESS-3D
Status: active
Topics:
    - picocalc
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Production streaming backend supplying the scalar code generator
    - Path: repo://picocalc-os/nucleus/painter_commands.c
      Note: Base command reader for the temporary triangle extension
    - Path: repo://picocalc-os/port/esp32p4/main/painter_service.c
      Note: Production owner of retained state and asynchronous painter installation
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:07:52.936976622-05:00
WhatFor: ""
WhenToUse: ""
---

# Render a three-dimensional Chess position with a delivered Typed painter

## What the experiment measures

Chess publishes the same PSIX positions that drove the flat native painter. An alternative Typed source program projects a low-polygon board and six piece models into a bounded stream of colored triangles. Its physical comparison uses the original on-device compiler, framebuffer and SPI subsystem. The separate packed-vertex arm uses a private eight-argument painter entry and measures whether the isolated P4 vector result transfers to a visible application.

Start with the [intern implementation guide](design-doc/01-projecting-a-chess-position-into-a-bounded-triangle-stream.md) and the [director article](analysis/01-how-a-chess-position-becomes-a-three-dimensional-screen-on-the-picocalc.md). See [research diaries](reference/), [project scripts](scripts/), [evidence](various/), [tasks](tasks.md), and the [changelog](changelog.md).

The upstream [mobile source and PSIX experiments](../PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/index.md) establish source provenance and exact two-dimensional physical results. The [compiler experiment](../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/index.md) tests automatic PIE lowering and separates guarded scalar optimization from packed hardware arithmetic.

## Research departments

- [Scalar graphics and completed display transfers](design-doc/02-implement-and-qualify-the-scalar-scene.md)
- [Packed geometry and its private workspace](design-doc/03-feed-the-visible-board-from-packed-ground-vertices.md)
- [Independent compiler and drawing qualification](design-doc/04-independent-packed-painter-review.md)

---
Title: Ship semantic Snake snapshots and changed-cell painting on the PicoCalc
Ticket: PICOCALC-SNAKE-INTEGRATION
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://cji/tests/native/snake.out
      Note: Qualified RV32 world output
    - Path: repo://picocalc-os/js/apps/snake.js
      Note: Complete head-first board and visual state
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: Admission, full composition and changed-cell painting
    - Path: repo://picocalc-os/nucleus/gfx.c
      Note: Commit, comparison copy and invalidation
ExternalSources: []
Summary: Integrate complete semantic Snake frames and incremental painting, qualify two runtimes, publish the measured results.
LastUpdated: 2026-11-20T13:31:12.277911127-05:00
WhatFor: ""
WhenToUse: ""
---

# Shipping semantic Snake frames on the PicoCalc

The native and JS Snake producers now publish game positions, and the compositor paints verified single-step movements using two or three cell interiors. Complete positions support full composition after focus changes, death, skipped publications or a compositor restart. This ticket implements the earlier [Snake research result](../PICOCALC-RENDER-SNAKE--measuring-snake-snapshots-and-damage-against-full-frames/index.md).

## Read in order

1. [Intern design and implementation guide](design-doc/01-from-a-complete-snake-position-to-changed-framebuffer-cells.md) explains the screen message, sender and receiver, validation, painting and ownership.
2. [Director report](analysis/01-drawing-a-moving-snake-on-the-picocalc.md) connects the protocol change with the verified movement, recovery cases and device result.
3. [Physical measurement report](analysis/02-snake-on-the-device.md) explains the normal playable build, measurement boundaries, observations and final firmware.
4. [Independent correctness study](analysis/03-snake-rendering-correctness.md) uses exact pixels, malformed positions, and simulated display failures.

The [director diary](reference/01-director-implementation-and-integration-diary.md), [board diary](reference/02-device-diary.md) and [replay diary](reference/03-replay-diary.md) record the research and implementation chronologically. See the [reproduction guide](README.md) and [tasks](tasks.md).

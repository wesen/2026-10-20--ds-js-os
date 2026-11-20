---
Title: Lower bounded scalar Typed vertex loops to ESP32-P4 PIE instructions
Ticket: PICOCALC-TYPED-PIE
Status: complete
Topics:
    - compiler
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Opt-in generation and qualification of a guarded eight-lane ESP32-P4 vertex projection from unchanged scalar Typed source.
LastUpdated: 2026-11-20T16:17:52.709609359-05:00
WhatFor: Reproduce the selector, independent oracle and physical benchmark.
WhenToUse: When evaluating automatic vectorization of checked integer loops on PicoCalc.
---

# Lower bounded scalar Typed vertex loops to ESP32-P4 PIE instructions

The research compiler generates a guarded eight-lane ESP32-P4 PIE loop from the same Typed vertex projection compiled by the stock scalar target. A second generated RV32 arm applies the same proof and guards using only scalar instructions. Both candidates preserve the original scalar loop for rejected buffers and short tails.

On revision 1.3 hardware at 360 MHz, the median 256-vertex projection took 45,675 cycles stock, 13,161 cycles guarded scalar, and 1,644 cycles with PIE. All 72 board correctness cases passed. The benchmark restored the preceding verified playable image.

## Read and reproduce

- [Research synthesis](analysis/03-when-eight-vertices-can-share-one-instruction-on-a-handheld-compiler.md)
- [Compiler design and reproduction](design-doc/03-a-guarded-eight-lane-vertex-projection-from-the-scalar-typed-loop.md)
- [Measured article](analysis/01-when-a-scalar-chess-vertex-loop-becomes-eight-pie-lanes.md)
- [Independent qualification](analysis/02-independent-review.md)
- [Compiler and board diary](reference/04-typed-pie-investigation-diary.md)
- [Physical measurement receipt](various/physical.json) and [raw benchmark rows](various/board-counter-rows.txt)
- [Host compilation receipt](various/director-host-compile.json) and [projection timing figure](various/projection-cost.png)
- [Delivered 3D Chess painter](../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/index.md)
- [Tasks](tasks.md) and [changelog](changelog.md)

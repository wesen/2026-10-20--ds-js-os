---
Title: Projecting a Chess position into a bounded triangle stream
Ticket: PICOCALC-CHESS-3D
Status: active
Topics:
    - picocalc
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:08:00.292152378-05:00
WhatFor: ""
WhenToUse: ""
---

# Projecting a Chess position into a bounded triangle stream

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

# Projecting a Chess position into a bounded triangle stream

The 2D experiment established that Chess can send Typed source to the compositor and that the compiled source can paint several received positions. The first 3D experiment changes the received program. A Chess position already includes the location and identity of every piece. Geometry for a white knight, its surface colors, and the camera transform belong to the painting program. An unchanged 313-byte opening position can therefore drive two different renderings.

## Geometry and the source of each value

Use an orthographic camera for the first experiment. In this projection parallel edges remain parallel. The screen position of a point is an affine function of its three world coordinates. Represent a square by four vertices on the plane y = 0. Elevate piece vertices above the plane. Project faces and paint the visible faces in depth order for the chosen view. A piece must visibly cover its own square and a taller piece's top must project above its base. A sprite drawn on a diamond board would exercise a different workload.

For an initial view one may use u = cx + a(x - z), v = cy + b(x + z) - c*y. The horizontal coefficients fix the difference between two board axes, the vertical coefficients control their apparent height and the height of the pieces. A second camera pitch varies b with c chosen to keep the board in the app body. Work in fixed point, explicitly define integer division and rounding, and prove all intermediates fit i32. A real moving camera is a useful second workload; three discrete prototype views are sufficient to expose whether the geometry coordinate path executes.

## Data and drawing contract

```text
Chess native world                   receiving compositor
  sends 3D painter source ----------> compile and relocate closed native function
  sends unchanged PSIX -------------> check and decode 90 cells
                                       choose mesh, project vertices, sort faces
                                       validate triangles in bounded output
                                       fill spans using existing 16-bit graphics
                                       layer headers/hints and commit to the panel
```

A proposed extra record carries one opcode, three pairs of body-relative integer screen coordinates, and a single RGB565 face color. Validate the complete record before drawing, including every vertex. Degenerate triangles may be skipped. Compare the fill rule on shared edges with an independent reference. Use the existing gfx_fill primitive for horizontal spans so that dirty tracking remains correct. Keep a fixed maximum number of commands and verify the largest observed legal Chess scene, including the opening position with all 32 pieces. If a prototype needs to raise the current 274-command bound, report the measured demand and the tradeoff before considering product integration.

The compositor owns the status bar, hints strip, clip rectangle and the framebuffer. The experiment can add its drawing opcode in a private firmware tree. Chess source is published by the native game and compared to the receiver's version-matched allowlist. Keep the two source locations in sync and pass the actual delivered bytes to the compiler. Capture the image hash for each camera/firmware configuration.

## Implementation and acceptance

1. Implement one closed scalar Typed painter, called through paintChess(state, out), and retain the unchanged normalized state layout. Start at picocalc-os/worlds/chess/painter.typed and picocalc-os/nucleus/mobile_painter.h.
2. Implement triangle validation and rasterization in an experimental copy of picocalc-os/nucleus/painter_commands.c or an isolated ticket patch. Handle clipped bounds according to the chosen contract; verify empty and invalid output retains the last valid picture.
3. Replay known states on the host, including opening cursor, a cursor move, piece movement, distinct piece types and an empty board. Validate output bounds, scene geometry and pixel checksums. Save a small figure at the real screen resolution and capture scalar compile size against the 16 KiB code slot.
4. Exercise a second camera view and compare it with a separately calculated projected corner. A scalar run establishes geometry first. The PIE researcher independently tests the legal transformation of a vertex loop. To claim a SIMD-enhanced scene, verify that the scene actually enters the generated vector block and receives the same projected vertices. A CPU benchmark for a separate transform cannot establish a speedup for the delivered painter.
5. Obtain the shared P4 window only after the 2D operator has released it. Boot a labeled experimental build, capture a real PSIX-driven change plus completed SPI pixels, and restore the latest qualified ordinary image unless the new experiment itself qualifies for use as the default. Keep compile, projection, raster and transfer timing scopes distinct.

## Reviewing results

One static camera with correct geometry would establish that a different native program can render the same position on the current OS. A camera sweep tests work under changing geometry; cursor motion gives a control where most vertices stay fixed. The ticket should identify actual code paths, fallback paths, and unanswered measurements for each experiment. It should never derive full-frame latency from instruction counts, emulator throughput or isolated vertex speed alone.

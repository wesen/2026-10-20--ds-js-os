---
Title: Measure bounded screen readers and semantic views across PicoCalc applications
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: Control painter and frames event
    - Path: repo://picocalc-os/nucleus/gfx.c
      Note: Raster and panel diff
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: Frame retention and delivery
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:19.761722347-05:00
WhatFor: ""
WhenToUse: ""
---

# Measuring bounded screen readers and semantic views

This ticket executes the two architecture proposals in PICOCALC-RENDER-NEXT. The director owns cross-workload qualification and the sole ESP32-P4. Five Opus High research assignments covered System, Snake, Chess, bounded JSON readers and a directly indexable binary format. Each researcher recorded an independent proposal, experiments and a project report.

Read the [common protocol](design-doc/01-experimental-protocol-for-renderer-admission-pixels-and-device-replay.md), the [director diary](reference/01-director-investigation-diary.md) and the [blind representation design](various/01-representation-blind.md). The coordinated host and physical runs use scripts in this ticket.

## Results and application handoff

Start with [Where a PicoCalc should build its screen](analysis/02-where-a-picocalc-should-build-its-screen.md) for the production trace, the controlled comparisons and the recommended first integration trial. [The application handoff](reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md) includes the binary API and the app-specific results. The independent [binary design](../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/design-doc/01-a-binary-snapshot-with-direct-indexed-access.md) describes the wire format, admission rules and direct access.

- [Restartable screens on the PicoCalc, measured byte by byte](../PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/analysis/01-what-stays-on-the-other-side-of-a-system-screen.md)
- [What Moves When a Snake Advances One Cell?](../PICOCALC-RENDER-SNAKE--measuring-snake-snapshots-and-damage-against-full-frames/analysis/01-what-moves-when-a-snake-advances-one-cell.md)
- [What crosses the screen boundary when a Chess cursor moves?](../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/analysis/01-what-crosses-the-screen-boundary-when-a-chess-cursor-moves.md)
- [What an index on the wire buys a PicoCalc renderer](../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/analysis/01-what-an-index-on-the-wire-buys-a-picocalc-renderer.md)
- [What a Bounded Screen Reader Retains](analysis/01-what-a-bounded-screen-reader-retains.md)

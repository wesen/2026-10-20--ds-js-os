---
Title: Measuring semantic Chess screens and portable typed views
Ticket: PICOCALC-RENDER-CHESS
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/scripts/07-replay.mjs
      Note: Independent guest traces, retained replay and fixture production
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/scripts/17-run-host.sh
      Note: Complete reproducible host experiment
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/various/host-summary.json
      Note: Verified aggregate frame, byte and cold endpoint measurements
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:38:25.816195658-05:00
WhatFor: ""
WhenToUse: ""
---

# Measuring semantic Chess screens and portable typed views

A Chess world can publish an entire drawing or describe its visible position and let a separate renderer construct the drawing. This ticket measures the two choices with independent production guest instances, retains the latest complete position, and prices loading or compiling the same isolated view.

- [The project report](analysis/01-what-crosses-the-screen-boundary-when-a-chess-cursor-moves.md) explains the findings and their scope.
- [Independent prediction and operator contract](design-doc/01-a-retained-chess-view-from-a-by-value-position.md) record the gates before timing.
- [Researcher diary](reference/02-opus-researcher-investigation-diary.md) and [operator diary](reference/01-chess-operator-investigation-diary.md) document decisions, errors and verification.
- [Host reproduction](scripts/17-run-host.sh) runs the guest, common raster oracle, mobile code paths and timing trials. Start with [summary](various/host-summary.json), [timing distributions](various/host-timing.json) and [pixel receipts](various/pixel-gate.json).
- [Board fixtures](scripts/08-board-fixtures.py) and [whole-producer staging](scripts/15-stage-producer.py) support the lab director's single-device experiments.

See [tasks](tasks.md) and [changelog](changelog.md).

The director published the [vault edition](https://github.com/go-go-golems/go-go-parc/blob/f6350ad094cf91cf98224cffa9e3029ab32e078f/Projects/2026/11/20/ARTICLE%20-%20PicoCalc%20Rendering%20-%20What%20crosses%20the%20screen%20boundary%20when%20a%20Chess%20cursor%20moves.md) with its verified Chess selection figure at go-go-parc revision `f6350ad094cf91cf98224cffa9e3029ab32e078f`.

## Native binary research handoff

All 47 Chess semantic observations reproduce their original view. Chess is the first proposed native key-to-final-transfer integration trial. [API, evidence and integration boundary](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md)

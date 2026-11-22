---
Title: Specialize PSIX screen encoders with the PicoCalc typed compiler
Ticket: PICOCALC-PSIX-STAGING
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: On-device streaming native code generation and slot linking
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Frontend record metadata and typed Wasm emitter
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/board/patch.h
      Note: Two-entry guarded packet copy
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/board/staging_trial.c
      Note: Physical timing endpoints and byte verification
ExternalSources: []
Summary: How to derive native screen writers and when a compact layout or a cached template wins on ESP32-P4.
LastUpdated: 2026-11-20T12:32:37.34083208-05:00
WhatFor: ""
WhenToUse: ""
---

# Specialize PSIX screen encoders with the PicoCalc typed compiler

The ESP32-P4 generated, compiled and executed a writer for a declared Chess screen. Five encoder implementations emitted the same chronological packets. The fastest measured candidate on that stream validated the current state, reused a prepared byte layout and patched its values. The smaller layout interpreter won when a deliberate stream of changing layouts caused repeated misses.

## Start here

1. [Director report and physical comparison](analysis/01-compiling-the-screen-writer-on-a-handheld.md) covers the compiler, the wire protocol, the two board experiments and the next implementation milestone.
2. [Intern design and implementation guide](design-doc/01-a-staged-compiler-for-psix-screen-encoders.md) gives the APIs, pseudocode, invariants and implementation order.
3. [Reproduce the experiments](README.md) identifies commands, prerequisites, raw data and publication evidence.

## Independent studies

| Investigation | Design | Result | Diary |
|---|---|---|---|
| Declared semantic Chess writer and two cached layouts | [Declared layout](design-doc/02-static-emitter.md) | [Typed, table and cache implementations](analysis/02-static-encoder.md) | [Implementation diary](reference/02-static-diary.md) |
| Observing shapes in pre-existing application objects | [Observed plans](design-doc/03-observed-shapes.md) | [Host and device results](analysis/03-observed-shapes.md) | [Runtime diary](reference/03-runtime-diary.md) |
| Independent validation and deriving from actual type declarations | [Binding and qualification](design-doc/04-staging-and-binding.md) | [Dictionary counterexample and four derived writers](analysis/04-staging-and-binding.md) | [Reviewer diary](reference/04-review-diary.md) |
| Independent external experimental design and first-window interpretation | [Source-blind design](design-doc/07-independent-experimental-design.md) | [Opus results and audited scope](analysis/07-independent-specialization-results.md) | [Original notebook and source audit](reference/07-opus-research-diary.md) |

The [director diary](reference/01-director-investigation-and-reading-diary.md) records experimental decisions, negative results and both device windows. The [two-volume publication receipt](various/publication.txt) identifies the delivered reading set. The [rendering program](../PICOCALC-RENDER-NEXT--bounded-screen-snapshots-and-compiled-layouts-for-the-picocalc-compositor/index.md) places this producer experiment alongside reader and painter research.

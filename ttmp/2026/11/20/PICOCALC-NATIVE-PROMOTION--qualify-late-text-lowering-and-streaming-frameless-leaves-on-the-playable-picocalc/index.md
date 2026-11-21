---
Title: Qualify late text lowering and streaming frameless leaves on the playable PicoCalc
Ticket: PICOCALC-NATIVE-PROMOTION
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
LastUpdated: 2026-11-20T20:17:03.889168762-05:00
WhatFor: ""
WhenToUse: ""
---

# Qualify late text lowering and streaming frameless leaves on the playable PicoCalc

This ticket promotes two changes from the six-study native compiler wave. It follows typed source through RV32 generation, the fixed-slot ELF linker, the external-RAM loader and ordinary Chess and Editor input on an ESP32-P4.

- [Intern implementation guide](design-doc/01-from-the-typed-frontend-to-an-ordinary-psram-loaded-world.md)
- [Director's findings and measurements](analysis/01-promoting-two-native-compiler-changes-to-the-playable-picocalc.md)
- [Investigation diaries](reference) and [reproduction scripts](scripts)
- [Build attestation](various/release/build.json), [host differential results](various/host/combined.json) and [painter checks](various/compiler/mobile-painter.json)
- [Tasks](tasks.md) and [changelog](changelog.md)

## Outcome

Both changes shipped to the attached board in the ordinary playable image. Chess cold compilation fell 47.95%, Editor fell 8.77%, and Files rose 2.51%. The independently loaded Chess ELFs took 14.12–14.23% less search time on three fixed workloads, using the median paired reduction per position. Eight native worlds, keyboard input and the Chess painter passed after restoring and verifying the ordinary image.

- [Full-ELF search study](analysis/02-how-fast-does-the-chess-world-search-in-psram.md)
- [Compiler and painter study](analysis/03-from-typed-operations-to-smaller-rv32-functions.md)
- [Ordinary board qualification](analysis/04-what-changes-for-the-person-playing-chess.md)

[Director report in the published vault](https://github.com/go-go-golems/go-go-parc/blob/139fb1f4751c8e677302687350eeff58454f1240/Projects/2026/11/20/ARTICLE%20-%20PicoCalc%20Native%20Compiler%20Promotion%20-%20How%20two%20streaming%20compiler%20changes%20affect%20a%20playable%20handheld.md) · [Publication receipt](various/release/publication.json)

---
Title: Qualify late text lowering and streaming frameless leaves on the playable PicoCalc
Ticket: PICOCALC-NATIVE-PROMOTION
Status: active
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
LastUpdated: 2026-11-20T19:52:28.725709513-05:00
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

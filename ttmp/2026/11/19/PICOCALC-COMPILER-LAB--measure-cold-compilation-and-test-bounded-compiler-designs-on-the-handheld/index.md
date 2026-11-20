---
Title: Measure cold compilation and test bounded compiler designs on the handheld
Ticket: PICOCALC-COMPILER-LAB
Status: active
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Frozen frontend streaming boundary
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: Physical compiler invocation and allocator
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:19.538679464-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure cold compilation and test bounded compiler designs on the handheld

The four studies investigate cold frontend time, native code selection, bounded arithmetic facts and the cost of rebuilding after a source edit. The supervising experimentalist owns the single hardware schedule and independent comparisons.

- [Experimental design and baseline definitions](design-doc/01-experimental-design-for-cold-builds-and-bounded-compilation-on-the-esp32-p4.md)
- [Supervisor diary](reference/01-supervising-experimentalist-diary.md)
- [Original research brief](sources/research-brief.md)

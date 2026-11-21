---
Title: Infer and lower packed loop regions in unchanged Typed programs
Ticket: PICOCALC-PIE-LOOPS
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-pie-loops.js
      Note: Optional inferred loop transformation
    - Path: repo://picocalc-os/tools/typed-inspect.mjs
      Note: Inspect loop decisions and final native instructions
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T07:47:19.811905159-05:00
WhatFor: ""
WhenToUse: ""
---

# Infer and lower packed loop regions in unchanged Typed programs

An opt-in RV32 compiler pass infers a packed subtraction region from ordinary Typed source, retains the scalar hit continuation, and emits matched scalar and ESP32-P4 PIE schedules.

- [Intern design and implementation guide](design-doc/01-inferring-packed-halfword-subtraction-inside-scalar-typed-loops.md)
- [Experimental results, limitations and replay instructions](analysis/01-what-an-inferred-packed-subtraction-buys-on-the-esp32-p4.md)
- [Source, intermediate tape and native code side by side](various/host/comparison.md)
- [Personal implementation diary](reference/01-implementation-and-qualification-diary.md)
- [Scripts](scripts/) and [measurement evidence](various/)

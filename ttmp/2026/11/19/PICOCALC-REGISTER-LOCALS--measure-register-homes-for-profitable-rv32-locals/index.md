---
Title: Measure register homes for profitable RV32 locals
Ticket: PICOCALC-REGISTER-LOCALS
Status: complete
Topics:
    - picocalc
    - native
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Evaluate two policies for holding typed RV32 locals in registers.
LastUpdated: 2026-11-19T22:45:26.72222452-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure register homes for profitable RV32 locals

Scope A7 compares use counts with a loop-weighted, call-aware heuristic on top of the A6 condition backend. Register use and its ABI costs are measured on the host and on the ESP32-P4.

- [Preimplementation design](design-doc/01-choose-a-register-home-before-lowering-a-function.md)
- [Investigation diary](reference/01-register-homes-investigation-diary.md)
- [Result and explanation](analysis/01-what-register-homes-save-in-a-picocalc-function.md)
- [P4 measurement receipt](various/physical.json)
- [Published vault article](https://github.com/go-go-golems/go-go-parc/blob/713ee66/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20What%20Register%20Homes%20Save.md)

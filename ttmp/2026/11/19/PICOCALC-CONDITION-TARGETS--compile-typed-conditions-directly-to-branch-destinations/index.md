---
Title: Compile typed conditions directly to branch destinations
Ticket: PICOCALC-CONDITION-TARGETS
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
Summary: Test direct condition lowering on the Wasm and RV32 compiler targets.
LastUpdated: 2026-11-19T22:25:45.122788288-05:00
WhatFor: ""
WhenToUse: ""
---

# Compile typed conditions directly to branch destinations

Scope A6 compares the staged compiler with a shared frontend change that branches on short-circuit conditions. The study measures behavior and code size on both targets, and cold compiler resource use on the ESP32-P4.

- [Preimplementation design](design-doc/01-how-a-boolean-expression-becomes-a-branch.md)
- [Investigation diary](reference/01-condition-destinations-investigation-diary.md)
- [Result and explanation](analysis/01-when-a-boolean-becomes-a-branch-on-the-picocalc.md)
- [P4 measurement receipt](various/physical.json)
- [Published vault article](https://github.com/go-go-golems/go-go-parc/blob/e536819/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20When%20a%20Boolean%20Becomes%20a%20Branch.md)

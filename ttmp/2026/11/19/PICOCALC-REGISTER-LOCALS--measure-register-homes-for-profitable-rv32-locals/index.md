---
Title: Measure register homes for profitable RV32 locals
Ticket: PICOCALC-REGISTER-LOCALS
Status: active
Topics:
    - picocalc
    - native
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Evaluate two policies for holding typed RV32 locals in registers.
LastUpdated: 2026-11-19T22:00:33.514331221-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure register homes for profitable RV32 locals

Scope A7 compares use counts with a loop-weighted, call-aware heuristic on top of the A6 condition backend. Register use and its ABI costs are measured on the host and on the ESP32-P4.

- [Preimplementation design](design-doc/01-choose-a-register-home-before-lowering-a-function.md)
- [Investigation diary](reference/01-register-homes-investigation-diary.md)

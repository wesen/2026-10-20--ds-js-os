---
Title: Compile typed conditions directly to branch destinations
Ticket: PICOCALC-CONDITION-TARGETS
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
Summary: Test direct condition lowering on the Wasm and RV32 compiler targets.
LastUpdated: 2026-11-19T21:54:18.014185342-05:00
WhatFor: ""
WhenToUse: ""
---

# Compile typed conditions directly to branch destinations

Scope A6 compares the staged compiler with a shared frontend change that branches on short-circuit conditions. The study measures behavior and code size on both targets, and cold compiler resource use on the ESP32-P4.

- [Preimplementation design](design-doc/01-how-a-boolean-expression-becomes-a-branch.md)
- [Investigation diary](reference/01-condition-destinations-investigation-diary.md)

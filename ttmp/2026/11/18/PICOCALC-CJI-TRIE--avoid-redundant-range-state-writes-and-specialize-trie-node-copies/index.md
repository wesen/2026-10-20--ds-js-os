---
Title: Avoid redundant range-state writes and specialize trie node copies
Ticket: PICOCALC-CJI-TRIE
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T16:03:58.894365064-05:00
WhatFor: ""
WhenToUse: ""
---

# Avoid redundant range-state writes and specialize trie node copies

The experiments change the cost of range-state updates inside the CJI compiler that runs on the ESP32-P4. Each variant is built against the guarded schedule from PICOCALC-CJI-RANGES. The imported ordinary compiler remains the independent reference.

- [Intern implementation guide](design-doc/01-persistent-range-states-and-statically-typed-array-copies.md)
- [Detailed investigation diary](reference/01-implementation-diary.md)
- [Reproduction scripts](scripts/) and [experimental evidence](various/)

The combined opt-in compiler produced Agenda in 522.587 s and Files in 206.321 s, compared with 544.293 s and 209.770 s on the guarded control. The ordinary headless firmware was restored and smoke-tested. The report includes separate observations for path reuse, typed copying, heap measurements and exact x86 instruction counts. [Physical receipts](various/physical/physical-summary.json) · [Vault article](https://github.com/go-go-golems/go-go-parc/blob/7338625f1f903ba3c9317a2229fb8e5b2d62399c/Projects/2026/11/18/ARTICLE%20-%20When%20a%20Compiler%20Copies%20an%20Unchanged%20Fact.md)

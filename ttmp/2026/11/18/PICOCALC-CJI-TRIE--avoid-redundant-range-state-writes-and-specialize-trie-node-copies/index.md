---
Title: Avoid redundant range-state writes and specialize trie node copies
Ticket: PICOCALC-CJI-TRIE
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T15:11:53.459803707-05:00
WhatFor: ""
WhenToUse: ""
---

# Avoid redundant range-state writes and specialize trie node copies

The experiments change the cost of range-state updates inside the CJI compiler that runs on the ESP32-P4. Each variant is built against the guarded schedule from PICOCALC-CJI-RANGES. The imported ordinary compiler remains the independent reference.

- [Intern implementation guide](design-doc/01-persistent-range-states-and-statically-typed-array-copies.md)
- [Detailed investigation diary](reference/01-implementation-diary.md)
- [Reproduction scripts](scripts/) and [experimental evidence](various/)

---
Title: Preserve typed reads and predicates through streamed native lowering
Ticket: PICOCALC-STREAMED-TYPED-OPS
Status: active
Topics:
    - picocalc
    - compiler
    - research
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T21:54:00.247082555-05:00
WhatFor: ""
WhenToUse: ""
---

# Preserve typed reads and predicates through streamed native lowering

The staged RV32 compiler is the control for an experiment in retaining text reads and predicates through per-function lowering. The first candidate projects those operations back into the existing staged input. The second lowers text reads directly.

- [Frozen design](design-doc/01-a-per-function-stream-for-text-reads-and-comparison-branches.md)
- [Tasks](tasks.md)
- [Changelog](changelog.md)

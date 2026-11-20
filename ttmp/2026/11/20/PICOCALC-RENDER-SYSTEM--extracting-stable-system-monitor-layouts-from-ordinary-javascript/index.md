---
Title: Extracting stable System monitor layouts from ordinary JavaScript
Ticket: PICOCALC-RENDER-SYSTEM
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:35:28.960004744-05:00
WhatFor: ""
WhenToUse: ""
---

# Extracting stable System monitor layouts from ordinary JavaScript

Across 100 System frames a manual complete value vector saved 54.4% of changed SDK bytes while matching every reconstructed pixel. The frozen ordinary-constructor extractor saved 10.9% on System and 7.05% on held-out Keys, and increased producer and receiver time.

Five matched ESP32-P4 blocks put the median encoding and reconstruction cost at 101.960 ms (generic), 73.345 ms (manual) and 319.515 ms (automatic) per 20 attempts. All 15 expanded-tree checksums matched the host reference. [Physical receipts](various/physical-system.json).

- [Opus research article](analysis/01-what-stays-on-the-other-side-of-a-system-screen.md)
- [Blind design](design-doc/01-blind-system-template-design-and-predictions.md) and [protocol adaptations](reference/03-premeasurement-protocol.md)
- [Operator investigation diary](reference/01-operator-investigation-diary.md) and [Opus research diary](reference/02-opus-research-diary.md)
- [Reproduction](reference/04-reproduction.md), [host timing, bytes and parity](various/summary.json) and [predictions and restart audit](various/protocol-audit.json)

## Native binary research handoff

The 100 System semantic observations reproduce their original views. The manual template remains the control for evaluating a native byte path. [API, evidence and integration boundary](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md)

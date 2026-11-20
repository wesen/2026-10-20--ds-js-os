---
Title: Measuring Snake snapshots and damage against full frames
Ticket: PICOCALC-RENDER-SNAKE
Status: complete
Topics:
    - picocalc
    - ui
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:35:32.350281987-05:00
WhatFor: ""
WhenToUse: ""
---

# Measuring Snake snapshots and damage against full frames

The [project report](analysis/01-what-moves-when-a-snake-advances-one-cell.md) follows a game tick from a 22×18 board to the 320×320 RGB565 display. An unchanged application screen, two complete semantic encodings, and a motion-only partial repaint were compared on 234 real-input snapshots plus two capacity fixtures. Three independent full raster runs agree byte-for-byte in all 236 frames. On the physical ESP32-P4, complete semantic JSON took a median 621 µs per snapshot for production and receipt in the matched QuickJS capsule, against 1,734 µs for the generic tree and 739 µs for validated packed state. The separate native CJI control and SPI timings appear in the [physical receipt](various/physical-snake.json).

- [Pre-measurement Opus design](design-doc/01-independent-prospective-design-for-snake.md) and [frozen operator protocol](scripts/04-protocol.md)
- [Host data](various/summary.json) and [reproduction guide](README.md)
- [Researcher's diary](reference/02-opus-researcher-investigation-diary.md) and [operator's diary](reference/01-operator-investigation-diary.md)
- [Director's companion lab](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/index.md)

## Native binary research handoff

All 236 Snake semantic observations reproduce their original views. Include the compact Snake-specific encoding and semantic JSON as controls. [API, evidence and integration boundary](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md)

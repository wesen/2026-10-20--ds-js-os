---
Title: Compile complete PicoCalc screens into an indexed binary representation
Ticket: PICOCALC-RENDER-BINARY
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:58:12.26059791-05:00
WhatFor: ""
WhenToUse: ""
---

# Compile complete PicoCalc screens into an indexed binary representation

PSIX v1 adds direct array indexing and bounded object-key lookup to an immutable complete snapshot. The host raster reproduced all 427 traced JSON frames. On the physical ESP32-P4, a QuickJS PSIX encoder and Proxy painter were slower than JSON in each of four workloads. The complete native sender, checked reader and one late lookup were 71%–88% faster than the matched cJSON route. The director selected a native Chess integration pilot and retained JSON on the existing path.

- [Indexed format and experimental protocol](design-doc/01-a-binary-snapshot-with-direct-indexed-access.md)
- [Host and physical results by Opus High](analysis/01-what-an-index-on-the-wire-buys-a-picocalc-renderer.md)
- [Native Chess pilot handoff](design-doc/02-native-chess-integration-handoff.md)
- [Reproduction guide](README.md)
- [Operator investigation diary](reference/01-binary-screen-laboratory-diary.md)
- [Opus research diary](reference/02-opus-research-diary.md)
- [Native reader evidence](reference/04-native-reader-evidence.md)
- [Matched native producer measurement](scripts/producer/02-physical-appendix.md)

See [tasks](tasks.md) and [changelog](changelog.md) for the study record.

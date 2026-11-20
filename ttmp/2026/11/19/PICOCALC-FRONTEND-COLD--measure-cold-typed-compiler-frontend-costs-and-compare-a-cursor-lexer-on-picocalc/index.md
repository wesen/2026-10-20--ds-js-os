---
Title: Measure cold typed compiler frontend costs and compare a cursor lexer on PicoCalc
Ticket: PICOCALC-FRONTEND-COLD
Status: complete
Topics:
    - picocalc
    - performance
    - quickjs
    - esp32-p4
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: The cursor saved 290–298 ms in two cold Editor trials, used roughly 9 KB more peak QuickJS heap, and preserved native and Wasm output identity.
LastUpdated: 2026-11-19T20:52:53.507333933-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure cold typed compiler frontend costs and compare a cursor lexer on PicoCalc

The cold Editor compile fell by 290–298 ms in two clean ESP32-P4 trial boots. The cursor used roughly 9 KB more peak QuickJS heap. Every measured result matched its expected native output, and six paired native guest workflows reproduced the program behavior and executed instruction counts. The cursor remains experimental because the design called for 500 ms saved without a peak increase.

## Read the study

- [Article and phase measurements](analysis/01-where-cold-typed-compilation-time-goes-on-picocalc.md)
- [Experimental design](design-doc/01-measuring-the-cold-frontend-before-replacing-the-lexer.md)
- [Investigation diary](reference/01-frontend-cold-compilation-investigation-diary.md)
- [Physical receipt](various/board-phases.json)
- [QuickJS cold and differential results](various/quickjs-cold.json)
- [Native guest fixtures](various/guest-workflows.json)
- [Tasks](tasks.md) and [changelog](changelog.md)

The supervisor coordinates independent replay and Obsidian publication for the wave.

---
Title: Prove Editor text bounds through two guards with bounded search
Ticket: PICOCALC-BOUNDED-INDEX
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
Summary: ""
LastUpdated: 2026-11-19T22:00:56.576849142-05:00
WhatFor: ""
WhenToUse: ""
---

# Prove Editor text bounds through two guards with bounded search

This experiment measures whether an explicit lower guard and a two-edge upper proof can remove checks from a real Editor preview loop. The original checked loop remains available when the guarded span conditions fail.

- [Frozen design](design-doc/01-a-fixed-budget-proof-for-guarded-editor-text-reads.md)
- [Tasks](tasks.md)
- [Changelog](changelog.md)
- [Intern guide](analysis/01-proving-a-text-index-safe-in-a-streaming-compiler.md)
- [Investigation diary](reference/01-bounded-index-proof-investigation-diary.md)
- [Host qualification](various/host.json)
- [Firmware compiler oracle](various/board-oracle.json)
- [64 KiB native preview counters](various/preview-counts.json)
- [Physical qualification](various/physical.json)
- [Paired physical measurements](various/physical-summary.json)
- [Physical preview copy UART summaries](various/preview-copy-captures.json)
- [reMarkable cloud delivery](various/remarkable-delivery.json)
- [Standalone vault article](https://github.com/go-go-golems/go-go-parc/blob/31a17a798bc08af9f3a2a0378c561fab6b0a9cbe/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Two%20Guards%20Can%20Prove%20a%20Text%20Read%20Safe.md)

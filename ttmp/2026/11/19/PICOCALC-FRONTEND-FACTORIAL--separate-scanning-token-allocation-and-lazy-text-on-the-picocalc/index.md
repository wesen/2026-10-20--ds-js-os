---
Title: Separate scanning, token allocation and lazy text on the PicoCalc
Ticket: PICOCALC-FRONTEND-FACTORIAL
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T22:22:17.99110264-05:00
WhatFor: ""
WhenToUse: ""
---

# Separate scanning, token allocation and lazy text on the PicoCalc

Study 1 in the eight-study compiler wave measures the scanner and record lifetime independently on the ESP32-P4, then compares a parser that reads source offsets with the eager cursor parser. Files, Agenda and Editor provide full cold native compilations with byte-identical output as the validation gate.

- [Pre-implementation design](design-doc/01-measuring-scanning-and-token-lifetime-independently-on-the-picocalc.md)
- [Newcomer article and figure](analysis/01-what-made-tokenization-faster-on-the-handheld.md)
- [Reproduction guide](README.md)
- [Investigation diary](reference/01-frontend-factorial-investigation-diary.md)
- [Tasks](tasks.md)
- [Changelog](changelog.md)

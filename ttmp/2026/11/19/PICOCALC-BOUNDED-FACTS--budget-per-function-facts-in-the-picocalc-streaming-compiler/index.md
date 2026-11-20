---
Title: Budget per-function facts in the PicoCalc streaming compiler
Ticket: PICOCALC-BOUNDED-FACTS
Status: complete
Topics:
    - performance
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T21:18:59.256378594-05:00
WhatFor: ""
WhenToUse: ""
---

# Budget per-function facts in the PicoCalc streaming compiler

The PicoCalc emits and lowers one typed function at a time. This study compares production lowering, an arithmetic proof pass on every eligible function, and a policy that spends a bounded amount of analysis on functions containing division or remainder. Files and Agenda are training workloads. Editor was held out until the prediction was committed at `6e9a637`. Select preserved all 83 of Always’s omitted instruction words while charging 7.04% as many intermediate cells. On the physical device, Select compiled Editor about 400 ms faster than Always and about 50 ms slower than production. The exact Select image passed the 64 KiB runtime preview.

- [Newcomer report](analysis/01-when-does-a-handheld-compiler-need-more-facts.md)
- [Held-out prediction](reference/02-prediction-frozen-before-editor-results.md)
- [Intern design and preregistration](design-doc/01-when-a-streaming-compiler-should-remember-a-divisor.md)
- [Investigation diary](reference/01-bounded-divisor-analysis-investigation-diary.md)
- [Physical paired results](various/board-summary.json)
- [Native 64 KiB replay](various/board-preview.json)
- [Published article](https://github.com/go-go-golems/go-go-parc/blob/16a68eb/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20When%20a%20Handheld%20Compiler%20Needs%20More%20Facts.md)
- [Tasks](tasks.md)
- [Changelog](changelog.md)

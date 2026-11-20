---
Title: Measure cold compilation and test bounded compiler designs on the handheld
Ticket: PICOCALC-COMPILER-LAB
Status: active
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Frozen frontend streaming boundary
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: Physical compiler invocation and allocator
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:19.538679464-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure cold compilation and test bounded compiler designs on the handheld

The four studies investigate cold frontend time, native code selection, bounded arithmetic facts and the cost of rebuilding after a source edit. The supervising experimentalist owns the single hardware schedule and independent comparisons.

- [Experimental design and baseline definitions](design-doc/01-experimental-design-for-cold-builds-and-bounded-compilation-on-the-esp32-p4.md)
- [Supervisor diary](reference/01-supervising-experimentalist-diary.md)
- [Original research brief](sources/research-brief.md)

## Current four-study compiler program

- [Tokenization and frontend timing](../PICOCALC-FRONTEND-COLD--measure-cold-typed-compiler-frontend-costs-and-compare-a-cursor-lexer-on-picocalc/design-doc/01-measuring-the-cold-frontend-before-replacing-the-lexer.md)
- [Native instruction selection and code reservation](../PICOCALC-STAGED-RV32--a-staged-operand-stack-for-picocalc-rv32-compilation/design-doc/01-where-an-rv32-operand-lives-between-instructions.md)
- [Bounded arithmetic analysis and its held-out test](../PICOCALC-BOUNDED-FACTS--budget-per-function-facts-in-the-picocalc-streaming-compiler/design-doc/01-when-a-streaming-compiler-should-remember-a-divisor.md)
- [Incremental compilation after an edit](../PICOCALC-FUNCTION-REBUILD--rebuild-changed-typed-native-functions-on-picocalc/design-doc/01-compile-one-edited-function-and-rebuild-its-native-links.md)
- [Independent methods examination](../PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/design-doc/01-examining-the-four-compiler-experiments.md)

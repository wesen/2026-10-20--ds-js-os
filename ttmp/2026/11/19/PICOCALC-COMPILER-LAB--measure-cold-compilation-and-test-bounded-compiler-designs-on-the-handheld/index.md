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

## Published research and evidence

Start with the [supervisor’s technical chapter](analysis/01-which-compiler-work-pays-for-itself-on-a-handheld.md). The [common result table](various/01-cross-study-table.md) covers Files, Agenda and Editor. It includes the clean compile, peak QuickJS allocator use, emitted instruction bytes, and measured kernel execution times.

- [Why the scanner sped up Editor](../PICOCALC-FRONTEND-COLD--measure-cold-typed-compiler-frontend-costs-and-compare-a-cursor-lexer-on-picocalc/analysis/01-where-cold-typed-compilation-time-goes-on-picocalc.md)
- [How staged operands made the smaller native slot possible](../PICOCALC-STAGED-RV32--a-staged-operand-stack-for-picocalc-rv32-compilation/analysis/02-how-a-staged-operand-stack-made-room-for-picocalc-editor.md)
- [What a bounded divisor analysis predicted on held-out Editor](../PICOCALC-BOUNDED-FACTS--budget-per-function-facts-in-the-picocalc-streaming-compiler/analysis/01-when-does-a-handheld-compiler-need-more-facts.md)
- [Reusing a function after an edit](../PICOCALC-FUNCTION-REBUILD--rebuild-changed-typed-native-functions-on-picocalc/analysis/01-what-picocalc-can-reuse-after-editing-a-function.md)
- [Independent examination of the experiments](../PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/analysis/01-what-makes-a-compiler-measurement-travel.md)

The six design guides were delivered to `/ai/2026/11/19/PICOCALC-COMPILER-LAB/PicoCalc Compiler Lab - Six Research Design Guides.pdf` on reMarkable.

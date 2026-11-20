---
Title: Measure cold compilation and test bounded compiler designs on the handheld
Ticket: PICOCALC-COMPILER-LAB
Status: complete
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
Summary: Results, publication index and replay procedures for four physical compiler studies and independent review.
LastUpdated: 2026-11-19T21:38:53.56887006-05:00
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

## Go-go-parc articles

- [Synthesis](https://github.com/go-go-golems/go-go-parc/blob/5e62fa498c37bf5480f2f6c1cf338fc918166916/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Which%20Compiler%20Work%20Pays%20for%20Itself%20on%20a%20Handheld.md)
- [Frontend](https://github.com/go-go-golems/go-go-parc/blob/0f27aa9dbb50cb64d5044053b99398ce8cf70903/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Where%20Cold%20Typed%20Compilation%20Time%20Goes.md)
- [Native](https://github.com/go-go-golems/go-go-parc/blob/cd9068343729df710b826c45197ad7b779382238/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20How%20a%20Staged%20Operand%20Stack%20Made%20Room%20for%20Editor.md)
- [Bounded](https://github.com/go-go-golems/go-go-parc/blob/16a68ebdc28c0261d9e64ba1ab154132e2b4110b/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20When%20a%20Handheld%20Compiler%20Needs%20More%20Facts.md)
- [Incremental](https://github.com/go-go-golems/go-go-parc/blob/c4ce0ce0232cfb6c6cf908e793261596ae481b72/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Rebuilding%20Typed%20Native%20Functions%20After%20an%20Edit.md)
- [Examination](https://github.com/go-go-golems/go-go-parc/blob/d5b3cccab404d53b23e2ebea289e0ceb06fb76af/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Independently%20Examining%20Four%20Compiler%20Experiments.md)

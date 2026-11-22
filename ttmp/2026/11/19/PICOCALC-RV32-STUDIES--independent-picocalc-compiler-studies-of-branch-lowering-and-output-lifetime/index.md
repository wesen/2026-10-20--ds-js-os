---
Title: Independent PicoCalc compiler studies of branch lowering and output lifetime
Ticket: PICOCALC-RV32-STUDIES
Status: complete
Topics:
    - picocalc
    - native
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Production control for both experiments
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/scripts/board.py
      Note: Hardware qualification and restoration
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json
      Note: Primary paired physical receipt
ExternalSources: []
Summary: Entry point for the branch and output candidates, independent review, hardware evidence, and published reports.
LastUpdated: 2026-11-19T19:50:15.63772988-05:00
WhatFor: ""
WhenToUse: ""
---

# Independent PicoCalc compiler studies of branch lowering and output lifetime


Start with the [experimental design](design-doc/01-experimental-design-for-the-picocalc-compiler-studies.md). It defines the common control, separates compile and application measurements, and identifies the implementation entry points. The [supervisor diary](reference/01-supervisor-investigation-diary.md) records decisions and recovery steps. The [examiner diary](reference/examiner-diary.md) records independent checks.

## Results and reading order

| Read this | What it establishes |
| --- | --- |
| [Supervisor’s synthesis](analysis/01-how-a-handheld-compiler-spends-time-and-memory.md) | Compiler pipeline, worked examples, physical results, decisions and the next experiment. |
| [Branch intern guide](../PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/design-doc/01-intern-guide-for-fusing-rv32-integer-predicates-into-structured-branches.md) | Which intermediate comparisons can disappear when a branch consumes the result. |
| [Output intern guide](../PICOCALC-RV32-OUTPUT--write-streamed-picocalc-rv32-output-into-compact-buffers/design-doc/01-how-to-emit-picocalc-native-code-into-compact-storage.md) | How the word buffers, fixups and complete module overlap in memory. |
| [Independent examiner guide](reference/examiner-guide.md) and [report](reference/examiner-review.md) | Semantic oracles, cross-buffer cases and independent review of physical claims. |
| [First physical boot](various/p4-first-boot.json) | Clean and instrumented Editor builds, module hashes and all matched Files cycle pairs. |

The production compiler keeps the streamed frontend. Each candidate lives in its research ticket. See [tasks](tasks.md) and [changelog](changelog.md) for completion and publication.

The [replicate boot](various/p4-replicate.json), [native Editor replay](various/p4-branch-editor-replay.json) and [preview frame](various/p4-branch-editor-preview.png) extend the primary trial. Direct and compact improved cold time on both boots. Branch fusion reduced used RV32 code and long comparison cycles. Its cold compile time was close to the control on the repeat.

The four published vault reports are available together at revision `74aae77`. [How a Handheld Compiler Spends Time and Memory](https://github.com/go-go-golems/go-go-parc/blob/74aae7752c3029ab3f0f6ac91945b9bb22fd27d3/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20How%20a%20Handheld%20Compiler%20Spends%20Time%20and%20Memory.md) · [Fusing RV32 Comparisons and Branches](https://github.com/go-go-golems/go-go-parc/blob/74aae7752c3029ab3f0f6ac91945b9bb22fd27d3/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Fusing%20RV32%20Comparisons%20and%20Branches.md) · [Compact Native Output and Peak Allocation](https://github.com/go-go-golems/go-go-parc/blob/74aae7752c3029ab3f0f6ac91945b9bb22fd27d3/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Compact%20Native%20Output%20and%20Peak%20Allocation.md) · [Independent Examination of RV32 Branches and Output Storage](https://github.com/go-go-golems/go-go-parc/blob/74aae7752c3029ab3f0f6ac91945b9bb22fd27d3/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Independent%20Examination%20of%20RV32%20Branches%20and%20Output%20Storage.md)

Both application restores were verified and Files, Agenda and Editor reported healthy native state. [Restoration receipt](various/p4-restoration.json)

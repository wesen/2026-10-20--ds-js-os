---
Title: Qualify branch fusion with compact output in the streamed PicoCalc compiler
Ticket: PICOCALC-RV32-COMBINED
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Production instruction selection and output control
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: Device runtime allocator and time boundary
ExternalSources: []
Summary: Two-boot factorial qualification of branch fusion and compact RV32 storage across the three native apps.
LastUpdated: 2026-11-19T20:00:41.231574964-05:00
WhatFor: ""
WhenToUse: ""
---

# Qualify branch fusion with compact output in the streamed PicoCalc compiler


The [intern design and decision guide](design-doc/01-combining-predicate-fusion-and-compact-instruction-output.md) defines the four-cell comparison. The [diary](reference/01-combined-compiler-trial-diary.md) records design, verification and publication. The parent studies are indexed from the repository’s top-level AGENTS.md.

The [comparative report](analysis/01-what-happens-when-two-native-compiler-optimizations-share-the-same-output.md) explains the interaction for Files, Agenda and Editor. The [parent studies](../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/index.md) hold the original branch and output designs, individual reports and independent examination.

The combined candidate reduced Editor cold time by 88–95 ms and its peak by about 2.8 KB. Files and Agenda also compiled faster but required about 19 KB more compiler heap. All 96 timed ELFs matched the host oracle for their configuration. The [physical receipt](various/physical.json), [paired summary](various/paired-summary.json), and [host oracle](various/host-oracle.json) carry the measurements and exact artifact checks.

[Read the article in go-go-parc.](https://github.com/go-go-golems/go-go-parc/blob/ded463fd50ead0a38f6b7ff898f82ffdad423900/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Integrating%20Branch%20Fusion%20and%20Compact%20Output.md)

The original factory firmware was restored and all three native worlds booted cleanly. The [combined guide and report PDF](various/combined-compiler-trial.pdf) is also available locally.

---
Title: Write streamed PicoCalc RV32 output into compact buffers
Ticket: PICOCALC-RV32-OUTPUT
Status: complete
Topics:
    - picocalc
    - esp32-p4
    - performance
    - native
    - quickjs
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Compact and direct native output candidates, ELF identity and cold QuickJS high-water measurements on Linux and PicoCalc.
LastUpdated: 2026-11-19T19:48:41.503723188-05:00
WhatFor: ""
WhenToUse: ""
---

# Write streamed PicoCalc RV32 output into compact buffers

This study tests how the production streamed compiler stores emitted native instructions. An isolated generator reconstructs revision `6426798` and two alternatives. Compact stores 32-bit words in slabs and produces the same raw image. Direct sends those slabs to the ELF linker and omits the raw-image materialization during complete app compilation.

The three modes produced identical linked binaries. Cold Linux tests characterize Files, Agenda and Editor. On the PicoCalc, the physical Editor trial showed faster compilation while the whole-compile allocator peak stayed around 1.41 MB. Shrinking assembly exposed the cost of the final ELF copy.

- [Intern guide](design-doc/01-how-to-emit-picocalc-native-code-into-compact-storage.md)
- [Research report](various/compact-native-output-report.md)
- [Investigation diary](log/01-output-study-investigation-diary.md)
- [Candidate generator](scripts/01-prepare.py) and [host reproduction driver](scripts/05-cold.py)
- [Native identity](various/identity.json), [clean Linux runs](various/host-clean.json), and [host phase profiles](various/host-profile.json)
- [Primary device series](../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json), [replication](../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-replicate.json) and [derived summary](various/board-summary.json)
- [Tasks](tasks.md) and [changelog](changelog.md)

The experiments live under this ticket. Production adoption remains a separate decision.

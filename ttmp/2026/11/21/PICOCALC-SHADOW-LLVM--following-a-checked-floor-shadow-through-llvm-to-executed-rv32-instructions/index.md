---
Title: Following a checked floor shadow through LLVM to executed RV32 instructions
Ticket: PICOCALC-SHADOW-LLVM
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Verified LLVM pass transitions, six matched P4 compiler configurations and a persistent query workbook"
LastUpdated: 2026-11-21T18:16:18.571060494-05:00
WhatFor: ""
WhenToUse: ""
---

# Following a checked floor shadow through LLVM to executed RV32 instructions

The checked shadow predicate took 136.66 cycles per natural query with GCC, 144.31 with LLVM and 382.25 with Typed in one P4 experiment. This follow-up identifies what happens to capacity loads, stack traffic and bounds checks, and compares two alternative LLVM backend configurations.

- [Study report and newcomer guide](analysis/01-how-llvm-lowers-the-checked-floor-shadow-on-rv32.md)
- [Exact JS queries](scripts/05-cells.js) and [saved session with results](various/repl.json)
- [Per-PC counts from the original linked kernels](various/native/pcs.json) and [paired physical cycles](various/device/rows.json)
- [Detailed investigation diary](reference/01-llvm-shadow-investigation-diary.md)

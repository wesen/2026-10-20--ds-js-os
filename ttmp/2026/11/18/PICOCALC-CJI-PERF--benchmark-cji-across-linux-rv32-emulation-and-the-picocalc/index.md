---
Title: Benchmark CJI across Linux, RV32 emulation and the PicoCalc
Ticket: PICOCALC-CJI-PERF
Status: complete
Topics:
    - performance
    - esp32-p4
    - native
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Design and validation plan for comparable CJI performance measurements.
LastUpdated: 2026-11-22T17:20:41.859562306-05:00
WhatFor: ""
WhenToUse: ""
---

# Benchmark CJI across Linux, RV32 emulation and the PicoCalc

This ticket owns the design for reproducible compiler and generated-world measurements. Start with Files and Agenda at an 8 MiB compact heap. Use output identity as the admission criterion for timing comparisons.

- [Intern guide](design-doc/01-profiling-cji-from-the-linux-host-to-the-picocalc.md) covers the source map, verified Linux build, emulator, measurement contracts and physical experiments.
- [Investigation diary](reference/01-investigation-diary.md) records validation and delivery.
- [Implementation tasks](tasks.md) track the proposed benchmark work.

The PICOCALC-CJI-PORT ticket owns device compiler integration and historical hardware receipts.

The [illustrated performance analysis and optimization plan](analysis/01-performance-evidence-and-optimization-plan-for-the-picocalc-compiler.md) connects the Linux profiles, guest instruction counts, physical serial receipts and report figures.

---
Title: Forward checked operands and reuse buffer capacity in the streaming RV32 compiler
Ticket: PICOCALC-OPERAND-HOMES
Status: complete
Topics:
    - compiler
    - performance
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T18:42:54.659457847-05:00
WhatFor: ""
WhenToUse: ""
---

# Forward checked operands and reuse buffer capacity in the streaming RV32 compiler

The native compiler can forward a checked index, retain a proved buffer capacity, and allocate spare registers to frequently read locals. All policies are opt-in. This study covers correctness, matched physical timings and cold compiler cost.

- [Intern design guide](design-doc/01-value-locations-for-checked-operations-in-the-streaming-compiler.md)
- [Experimental report and reproduction instructions](analysis/01-what-a-checked-buffer-read-costs-after-operand-forwarding.md)
- [Implementation diary](reference/01-implementation-diary.md)
- [Benchmark scripts](scripts/) and [captured results](various/)

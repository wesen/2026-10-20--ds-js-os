---
Title: Cold compilation and bounded analyses on the PicoCalc
Ticket: PICOCALC-COMPILER-THESIS
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Three compiler experiments, two independent examinations, cold Linux QuickJS measurements and a physical P4 follow-up.
LastUpdated: 2026-11-19T15:40:44.454676403-05:00
WhatFor: ""
WhenToUse: ""
---

# Cold compilation and bounded analyses on the PicoCalc

## Overview

Three experiments test temporary placement in RV32 registers, per-function intermediate representations and demand-driven proofs at text accesses. The [design](design-doc/01-experiments-in-bounded-compiler-construction-for-the-esp32-p4.md) specifies their controls. The [supervisor diary](reference/01-supervisor-investigation-diary.md) records review decisions, qualification and publication.

## Studies and examination

Start with [the supervisor's synthesis](various/reports/synthesis.md). Each investigation has a report, its chronological record, working notes, scripts and measured evidence.

| Study | Report | Investigation diary | Notes |
| --- | --- | --- | --- |
| Supervisor | [Cold compilation on the handheld](various/reports/synthesis.md) | [Supervision and validation](reference/01-supervisor-investigation-diary.md) | [Evidence and decisions](reference/supervisor-notes.md) |
| RV32 code generation | [Keeping operands in registers](various/reports/lowering.md) | [Implementation and replay](reference/lowering-diary.md) | [Compiler and ABI](reference/lowering-notes.md) |
| Intermediate representation | [Packed and streamed functions](various/reports/representation.md) | [Implementation and benchmarking](reference/representation-diary.md) | [Representations and controls](reference/representation-notes.md) |
| Bounds analysis | [Proofs for text accesses](various/reports/bounds.md) | [Analysis and testing](reference/bounds-diary.md) | [Proof rules and limits](reference/bounds-notes.md) |
| Independent semantics examination | [Examining calls and bounds proofs](various/reports/examiner.md) | [Examiner's diary](reference/examiner-diary.md) | [Semantics review](reference/examiner-notes.md) |
| Independent methods examination | [Measuring compiler costs](various/reports/methods.md) | [Examiner's diary](reference/methods-diary.md) | [Measurement review](reference/methods-notes.md) |

The [lab scripts](scripts/) regenerate the [research receipts](various/). The [task list](tasks.md) tracks physical qualification and the [changelog](changelog.md) records delivery.

The vault edition is in `Projects/2026/11/19/` in go-go-parc at commit `f2a26ab`. Its entry article is *Cold Compilation on a Handheld*. The independent reviews are complete. Task c9vc tracks the target-side comparison.

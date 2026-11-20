---
Title: Prediction Frozen Before Editor Results
Ticket: PICOCALC-BOUNDED-FACTS
Status: active
Topics:
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:42:34.942300339-05:00
WhatFor: ""
WhenToUse: ""
---

# Prediction Frozen Before Editor Results

The training builds used frozen code and the three compiler pairs listed in the manifest. Files and Agenda passed their normal native wrapper checks. For every build, the raw instruction image and linked ELF agreed between observed, unobserved, streamed and buffered compilation within a policy. [Training measurements](../various/host-training.json) · [Compiler hashes](../various/compilers.json).

| Training app | Control words | Always and Select words | Always analyzed | Select analyzed | Always charged cells | Select charged cells |
|---|---:|---:|---:|---:|---:|---:|
| Files | 804 | 804 | 7 | 0 | 2,208 | 0 |
| Agenda | 4,058 | 3,898 | 34 | 9 | 10,558 | 4,284 |

Agenda emitted 16 divides and 17 remainders in each policy. Both candidates removed 31 zero guards and 14 overflow guards, for 160 words. Select recovered all of Always's savings at 40.6% of its charged work. Proofs through single-write locals did not contribute to that training result.

## Frozen forecast

I expect Always to remove at least one guard and up to 150 words in the pinned Editor. I expect Select to recover at least 75% of that savings with no more than half of Always’s charged work and to stay inside the preregistered 32,768-cell budget. If Always removes zero words, the positive opportunity forecast fails, and there is no recovery fraction. If Select removes fewer than 75% of Always’s savings, the selection forecast fails even if the compiler accepts the program. The size range is a prediction, not an acceptance criterion.

Files and Agenda put different numbers of relevant instructions in different numbers of functions. The parser indicator is exact for presence of the two arithmetic opcodes. The transfer question is whether Editor has enough fixed divisors in functions that satisfy the same cap and source-order budget. A function can contain division and still yield no proof if its divisor comes from an argument or a mutable slot. Because Editor’s allocation peak can occur outside the proof pass, I make no prediction that Select lowers peak heap below control. I expect less analysis work to favor Select over Always for cold elapsed time. Treat the direction as resolved only if the physical paired runs support it.

At this commit, I had neither inspected the held-out source nor generated results for it. The source is the pinned native Editor source-list concatenation. The hold-out guest workload is the existing native 65,536-byte formatted Markdown preview replay when available. [Design and full preregistration](../design-doc/01-when-a-streaming-compiler-should-remember-a-divisor.md).

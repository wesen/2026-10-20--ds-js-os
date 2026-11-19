---
title: "What the PicoCalc compiler experiments ruled out, and under what conditions"
aliases: ["PicoCalc compiler negative results"]
tags: [project-report, compiler, picocalc, performance]
status: complete
type: project-report
created: 2026-11-19
repo: /home/manuel/code/wesen/2026-10-20--ds-js-os
ticket: PICOCALC-COMPILER-THESIS
---

# What the PicoCalc compiler experiments ruled out, and under what conditions

This investigation studied the time and memory required to compile applications on a handheld ESP32-P4, and the cost of running the generated programs. Those objectives can favor different designs. A proposal that produces correct code can consume compiler time without improving an application. A slower compiler can still serve an application that would otherwise exceed its memory budget. Recording the comparison, the workload and the criterion for reconsideration preserves both kinds of engineering result.

## Longer bounds proofs found no additional removable application checks

**Question.** When a loop index is bounded by a local endpoint, can the compiler follow a chain of inequalities from that endpoint to the length of the text? A successful proof must also establish that the index is nonnegative and that the receiver and its length still describe the object being accessed.

**Test.** The bounds study instrumented the actual typed Wasm emitter at checks in Files, Agenda and Editor. It examined 161 functions containing 419 check sites. A direct mode used immediately available relationships. Chained mode could follow further relationships under a fixed search budget. Both modes saw the same unmodified application sources.

| Application | Baseline sites | Direct removals | Additional chained removals |
| --- | ---: | ---: | ---: |
| Files | 8 | 2 | 0 |
| Agenda | 35 | 1 | 0 |
| Editor | 376 | 0 | 0 |

**Decision.** Defer extending or shipping chained search on the strength of this corpus. Direct reasoning inspected 103 graph edges. Chained reasoning inspected 151 and produced the same three removals. Edge inspections count compiler operations. They do not supply a wall-clock estimate.

The result is sensitive to which facts the compiler receives. The Editor experiment added an explicit entry check to one helper to establish its span preconditions. On five inputs satisfying that contract, chained search could then remove four sites and reduce executed checks from 45 to zero. The source change and the input condition are essential parts of that result. For an unchanged Editor, the next experiment should begin with a frequently executed surviving site and identify its missing fact. A checkable caller contract or an induction rule with defined wrap behavior would change the inputs to the proof.

## Keeping more scalar facts across calls did not improve the corpus

**Question.** Does the pass miss real opportunities because it discards too much information when a call or a store can modify a header? The independent examiner retained relationships exclusively between scalar locals and zero across these effects. It still invalidated header facts and facts that an assignment or loop could change.

**Test and outcome.** The revised transfer rule removed a check in a constructed example. Across 24 fixture inputs the optimized and reference executions agreed, including eight expected traps. Across the three applications, the direct pass still removed three sites. Its edge inspections went from 103 to 127. Chained inspections rose from 151 to 191 for the same three removals.

**Decision.** Preserve the experiment and its counterexample to the hypothesis that broader scalar retention alone solves Editor's missing proofs. Reconsider the rule if a hot retained access can be traced to the particular scalar relationship killed at a call. The author and examiner also tested aliasing, signed arithmetic, branch evaluation order and budget fallback. Their separate reports explain the proof obligations a future implementation would inherit.

## Direct checks remain a deferred optimization with positive helper evidence

The direct pass removed a small fraction of static sites. That is insufficient grounds to dismiss it. In the selected Files helper replay, executed checks fell from 225 to 29. In Agenda they fell from 43 to 34, and in Editor they stayed at 22. These are counts on particular inputs in the instrumented host experiment. The board trials in this ticket measured Editor compilation with bounds elimination disabled.

**Decision.** Give direct elimination a separate application-runtime experiment before merging it. A comparison should run the same Files and Agenda inputs with direct elimination enabled and disabled, compare outputs and traps, and record both compiler cost and generated execution cost. Runtime benefit in a hot path is a different outcome from reduced time spent compiling Editor.

## Streaming lost on compile time and won on peak allocation

**Question.** Does releasing each function's operations immediately improve both metrics for a cold Editor build? On the P4, buffered numeric operands took 2.318 seconds and 1,735,524 peak allocator bytes at the medians. Streaming took 2.422 seconds and 1,387,004 bytes. The four paired builds favored buffering on time. Every buffered and streamed ELF matched byte for byte. A second physical series reproduced the ordering.

**Decision.** Prefer buffered numeric operands as the first native implementation for today's Editor. Preserve streaming as a lower-memory alternative. Reconsider it when another source fails the compiler heap budget, or when a caller assigns enough value to saving approximately 349 kB to justify approximately 0.10 seconds per compile on this board. The current Editor compile budget is 4 MiB.

An independent host experiment also tested whether maximum function size predicts the streaming peak. It fixed the function count, largest function size, total operation count and emitted code length. Moving the large function to the end raised the streaming peak from 601,344 to 766,624 bytes. The compiler was retaining other functions' output when the large input arrived. A capacity estimate for another application should therefore consider the order and overlap of allocations.

## Numeric cells did not retain all source types

Two accepted synthetic functions declared a local as `bool` and `i32`, respectively. The representation study showed that their compiled function records had the same lowered operation sequence. Direct operands remove repeated encoding work. Once a Boolean and an integer have both become the machine value one, the cells alone cannot distinguish those source declarations.

**Decision.** Use numeric cells for native emission. A future pass that consumes source-local types, mutability or source locations should explicitly retain the facts it needs before emission. Reopen this design when a particular optimization can specify which fact it consumes and how long that fact must live.

## Two measurements that required replacement

The first Linux cold-compile series linked five existing QuickJS objects. A subsequent audit found that one object differed from the current Makefile build even after stripping debug information. The team kept the original samples and repeated all four configurations with a freshly built, fingerprinted engine. The linked Editor hashes and peak byte counts repeated. The fresh run supplies the Linux timing cited in the synthesis. Both receipts and the object-fingerprint script are kept under `various/supervisor/` and `scripts/supervisor/`.

The first attempt to reuse those Linux ELF digests for the physical board also encountered a genuine input difference. The ordinary firmware build produces a different reactor from the earlier host benchmark. Its source link order and toolchain distribution differ. Two reactors can have the same file size without having the same bytes. The physical study kept the firmware reactor fixed and generated new host expectations from that exact input. All 32 device build hashes then matched their respective host expectations. The original hashes remain valid for their own reactor.

## Finding and reproducing the evidence

The source ticket is `ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc`. It retains the full reports, experiments and receipts, including alternatives that were left out of production.

| Question | Detailed ticket report | Reproduction and evidence within the ticket |
| --- | --- | --- |
| Direct and chained text checks, including the added span contract | `various/reports/bounds.md` | `scripts/bounds/run.mjs`, `various/bounds/results.json` |
| Scalar retention and soundness under effects | `various/reports/examiner.md` | `scripts/examiner/`, `various/examiner/scalar-facts.json` |
| Streaming versus buffering on the device | `various/reports/physical-editor.md` | `scripts/supervisor/p4-trial-run.py`, `various/supervisor/physical-editor.json` |
| Function order and compiler memory | `various/reports/methods.md` | `scripts/methods/function-shape.py`, `various/methods/function-shape.json` |
| Erasure of local source types | `various/reports/representation.md` | `scripts/representation/run.py`, `various/representation/quickjs-results.json` |

The [bounds study](bounds.md) and [independent semantics examination](examiner.md) trace the observed traps and individual proof rules. The [representation study](representation.md), [independent memory study](methods.md) and [physical P4 follow-up](physical-editor.md) explain the storage tradeoffs and include the measured positive controls.

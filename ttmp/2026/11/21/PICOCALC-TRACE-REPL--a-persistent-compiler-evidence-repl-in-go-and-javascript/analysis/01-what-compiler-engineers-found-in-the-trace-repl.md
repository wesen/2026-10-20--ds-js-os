---
Title: What compiler engineers found in the trace REPL
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T14:23:47.88367247-05:00
WhatFor: ""
WhenToUse: ""
---

# What compiler engineers found in the trace REPL

## Research questions and evidence

The analyzer has two kinds of input. LLVM's pass printer captures text after each invocation. This makes it possible to inspect static code at a particular point in the compiler pipeline. A separate execution study counts instructions while the ray tracer processes a fixed scene. That record can compare executed work across compiler variants. It lacks a per-instruction address histogram. Our participants needed to discover how far each type of evidence could support their assigned conclusion.

| Role | Task | Scoring evidence withheld from the participant |
|---|---|---|
| Compiler intern | Count events across the archive, split the checked run by phase, relocate a particular middle-end event | 4,133 headers overall, 195 checked middle end, 116 checked backend. Ordinal 74 is an EarlyCSEPass print on the function row. Its inflated byte interval is [240363, 248127). |
| Middle-end researcher | Find the first observed decrease in direct 32-bit loads from argument zero of the checked row, then determine whether the source lines can be identified | 11 sites at ordinal 73, six at 74, SROAPass then EarlyCSEPass. Both are full prints. The checked raw module lacks debug locations. A gap breaks a claim of adjacency. |
| Performance reviewer | Measure the loop-strength-reduction ablation and determine whether it identifies a hot PC | Checked llc with LSR disabled executed 1,275,560 instructions. With it enabled the count was 1,233,611 over 160 opening-scene rows. Difference −41,949, or −3.29% relative to the disabled baseline. Attribution to a particular PC requires observations absent from those totals. |

The judge holds the table separately from Pi. The JSON receipts record public user-facing replies and tool actions. A lexical checker independently inflates the checked compiler log and verifies its digest, reads the reported counters, and detects the expected literals in each answer. Manual inspection ties those literals to queries, resolves signs and denominators and checks the absence claims. The outcome of each run concerns one agent on this archive.

## Two failures with different engineering consequences

On the baseline, both researchers independently tried passing ready values to the plan evaluator. The performance reviewer called `q.run(profiles.arm("checked-llc-nolsr").describe())` and repeated the call for the enabled arm. Both failed with `[notAPlan]`. The suggested fix, `q.run(a.events().count())`, computes an unrelated archive count. Directly evaluating the two descriptors then worked. The middle-end researcher likewise tried `q.run(q.help("capabilities"))` and wrapped an argument selector. The schema of the returned value matters here. A plan describes future work. An immediate descriptor is already a JavaScript object. The observed failure is an interface discovery problem; the archive still returned the correct counters when asked through a suitable query.

The second failure made the researcher's final conclusion scientifically wrong. While looking for cases in which a whole-function comparison was impossible, the middle-end researcher counted loop-scope events in the checked stream. The API returned 0 and the final claimed that the checked archive contained zero loop-scope events. A fresh independent replay returned `{kind:"function",function:"for.cond"}` for ordinal 88. Its evidence pointer identifies inflated bytes [346976, 348729) in checked-middle SHA-256 `bbd3b983cff150aeb56d99e517331a1ea0b4af5afc86869c730b9dca2ac795b4`. Those bytes start with “IR Dump After LoopInstSimplifyPass on for.cond”; the first nonempty body line is `; Preheader:`. LLVM printed a loop fragment. Treating its basic-block label as a function identity let the query succeed with the wrong answer.

Our raw-data census found **at least 42 checked, 42 unchecked, and 437 firmware** middle-end observations with that explicit marker. A lack of the marker makes no further statement about scope. Correctly recognizing loop scope leaves a separate question of identifying the owning function. A useful repair must preserve the original ordinal, digest and byte bounds even when that owner is unknown. [Independent census](../scripts/26-source-loop-census.py) · [Baseline reproduction](../various/usability-loops-baseline.json)

The initial three participants all returned the independently verified numbers and identifiers on their cards. They made 41 tool attempts in total, of which the harness refused one after 14 actual evaluations in that session. Across all three, five `[notAPlan]` errors followed attempts to run an already materialized value or selector. The intern also tried a top-level JavaScript `return` and recovered using a parenthesized object expression.

| Baseline role | Calls attempted | Task finding | Further claim checked by supervisor |
|---|---:|---|---|
| Intern | 14 | Correct counts, phase split, pass, byte interval, and persistent query | Reported nine distinct functions after taking a set of projected function names that included missing values and loop block labels. Actual checked-middle definition names are `row` and `element`. Reporting nine functions was unwarranted. |
| Middle end | 12 | Correct 73→74 witness, 11→6 direct sites and missing source locations | The “zero loop-scope events” claim is contradicted by the raw print census. The actual direct-site change at adjacent 73 and 74 survives that defect. |
| Performance | 15 | Correct checked LSR counterfactual, denominator, workload and units; declined per-PC attribution | Requested a useful follow-up of per-PC samples for each arm and its matching image. Across binaries, corresponding work still has to be mapped before differences at a given address can be interpreted. |

Binding reuse was explicitly cued and was independently demonstrated in a session-isolation probe. The intern reported that a bound selected row lost a result wrapper. The captured subsequent evaluation found the selected row itself. The earlier and later evaluations projected different fields from the same result, so the receipt provides no evidence of a binding mutation. The public help offered some of the relevant query recipes and example ordinals. It contained none of the preselected aggregate totals checked by the leak audit. The exercises therefore establish that the agents used the public interface and interpreted replies; several signatures were available through worked examples. [Baseline controls](../various/usability-controls-baseline.json)

## Designing an optimization on the baseline

The separate optimization researcher found 936,328 direct stack loads and 353,778 stores in 3,608,697 executed Typed-stock row instructions. Their sum of 1,290,106 is **35.75%** of instructions. The researcher correctly classified that fraction as a pool to investigate. It gives neither the fraction attributable to operand-stack temporaries nor the number of instructions two registers would save. It proposed collecting slot/depth and code-location observations before assigning registers. Its candidate/control experiment preserved the scalar implementation, workload, inputs and emulator, varied register reservation, required matching outputs for all 160 rows and measured both direct accesses and total instructions. Its suggested stop rule included abandoning a candidate if total instructions rose or it eliminated fewer than about 20,800 accesses. These are prospective criteria.

| Decision property | Baseline assessment |
|---|---|
| Measured premise | Supported. Counts and stock share agree with the independent execution summaries. |
| Mechanism | Partial. The temporary-cache mechanism is plausible. Attribution of the existing scalar arm's saving solely to stack placement is unsupported. |
| Discriminating evidence | Supported. The response asks for stack accesses by temporary depth or code location. Register pressure and mandatory frame accesses could change the design. |
| Controlled validation | Partial. The source, rows and correctness control are appropriate. The response mistakes the C arm's `rowBytes` for output-byte evidence and proposes only emulation. Physical time remains necessary for a P4 speed claim. |
| Refutation | Supported as a proposed rule. The response states both an access-count threshold and an instruction-count guard, and explicitly says the new candidate has never run. |

Two denominators show how correct numbers led to an unsupported decision. Stock→matched scalar removed 250,942 direct accesses, which is 61.39% of the **408,787 instruction difference**, but only 19.45% of the **1,290,106 original accesses**. The former comparison cannot establish that the candidate already harvests most stock stack traffic. The matched scalar changes address handling and induction state together. Replacing its producer with PIE tests the vector instruction on that schedule. Both comparisons are valid measurements; neither isolates two-register temporary caching. The C collector's `rowBytes` is the row function's machine-code size, taken from its ELF symbol. The output-equivalence check is a different observation. [C measurement collector](../../PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/05-execute.py) · [Matched scalar and PIE trial](../../PICOCALC-PIE-LOOPS--infer-and-lower-packed-loop-regions-in-unchanged-typed-programs/analysis/01-what-an-inferred-packed-subtraction-buys-on-the-esp32-p4.md)

A second Opus High researcher received the four baseline action receipts and verification artifacts, with the initial assessments withheld. Its review independently found numerical recovery, the misleading loop and function claims, the distinction between a summary-file digest and a build identity, and the unsupported interpretation of the scalar and PIE arms. It graded the new optimization's mechanism more strictly. The primary reviewer credited the general temporary-register mechanism; the independent reviewer required an explanation of the specific accesses removed and interference costs when reserving registers. Both found the measurement evidence stronger than the inference about a new candidate. The independent review used a retrospective descriptive scale. We use its reasons and witnesses and do not combine those numbers into a score. Its suggested parent-function assignment for a loop must itself be justified by capture evidence. [Independent grade with query witnesses](../reference/10-independent-baseline-grades.md)

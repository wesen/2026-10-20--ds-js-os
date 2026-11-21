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

## Reproducing the repair

The repaired service ran alongside the frozen baseline. Its executable SHA-256 was `523f185499f3b3fb48d1a25f7792d1993294aa93695034babe153559652e5d71`. A fresh session's original `q.run(arm.describe())` expression succeeded. Raw objects such as help text, stream inventories and arbitrary objects still have distinct evaluation contracts. In the new help a dedicated plans topic explains those contracts. A nested bundle of eager descriptors is still rejected, as the later performance participant discovered.

Ordinal 88 retained the identical checked middle stream digest and byte interval. The returned scope changed to `kind:"loop"`, `loop:"for.cond"`, `function:null`. A separate tentative proximity hint names `row` at ordinal 87. A block label alone cannot support definite function ownership. Repeating the complete scope queries returned **42 checked, 42 unchecked and 438 firmware** loop-subject events. Our reconciliation selected every returned ordinal with an explicit row budget, checked the selected length against the full count, verified each stream's SHA and visited those bytes. Every explicit preheader survived. The additional firmware record at ordinal 584 is a `LoopFullUnrollPass` on a loop marked `(invalidated)`. Its replacement payload begins with a module header. “What unit the pass targeted” and “what part of the program the resulting text covers” have different answers on that record. [Full ordinal reconciliation](../various/usability-loop-reconciliation.json)

The first reconciliation script accidentally materialized the default maximum of 200 rows. Iterating the returned rows had silently changed the intended census into a prefix. The corrected operator script uses `maxRows` and asserts equality between unique materialized ordinals and a separate count. This was a supervisor measurement error, independent of the repaired classifier. [Reproduction script](../scripts/27-verify-loop-witnesses.py)

## Research decisions after the change

Five fresh DeepSeek Flash high participants evaluated the repaired build. Their recorded actions and terminal answers are under `various/personas/candidate-*.json`. All recovered their preregistered values. The held-out allocator verified both occurrences of the virtual-register rewriter and read `NoVRegs` as false at ordinal 74 and true at ordinal 78. The capture supplies a machine-function property, not a spill counter. Help had a worked example using both endpoints, so the result demonstrates correct retrieval and interpretation of real measurements; it does not establish unaided discovery of the two positions.

| Role | Baseline → repaired, attempts | Adjudicated repaired outcome |
|---|---:|---|
| Catalog | 14 → 11 | Recovered 4,133, both checked phases, original ordinal and byte range. It did not report nine functions. Agreement between two public query paths is a useful consistency check but cannot establish archive correctness independently. |
| Middle end | 12 → 14 | Recovered 73→74 and 11→6. It observed ordinal 88 as unavailable to a full-function metric, ordinal 106 as unknown after the partial predecessor, and 7→74 as a gap after prefiltering. The first observed decrease survives the revised coverage rules. |
| Ablation | 15 → 15 | Identified both checked llc arms, the 41,949 reduction, denominator and missing PC observations. A bundled ready descriptor still caused a type error. |
| Optimization | 15 → 12 | Identified the two-register proposal as unmeasured. It used treatment provenance to identify bundled mechanisms, and based its recommendation on the fraction of unattributed traffic. Its extrapolation to full-frame time exceeds the evidence. |
| Held-out allocator | — → 14 | Read the two witnesses for the machine flag. Distinguished a missing printed flag (false on a machine-function dump) from lack of dynamic spill attribution. |

The new optimization researcher calculated the correct stock traffic mix and the stock→matched scalar reduction of 19.451% in that pool. It identified that a direct load/store through `sp` can be a temporary, a local home, a save or a spill. The provenance description expressly states that the scalar option bundles loop and address treatment. The researcher proposed adding depth/slot attribution and introducing the two-register candidate only for eligible short-lived temporaries. It specified matched control, same inputs, byte-identical output, instruction and direct-access metrics, counterbalanced hardware pairs, and a threshold to abandon: less than 10% fewer direct accesses, less than 2% fewer instructions or any mismatch. This meets the measured-premise, mechanism, discriminating-evidence and refutation criteria. Its validation design is strong on control and correctness but needs revision on units.

Its illustrative estimate of a roughly 3.9% **frame** gain remains unsupported. It divided a median percentage saving from the physical **primary** phase over twelve poses by a dynamic instruction reduction from **one opening-scene emulation**. This is neither an estimate of clean-frame time nor a transferable clock-cycle cost per eliminated access. The participant marked its extrapolation as hypothetical, but describing the ratio as a validated “elasticity” overstates what it tested. A targeted follow-up would time the actual register-reservation variant with matched per-pose primary and clean frames, reporting those two outcomes separately and checking emitted instructions or execution counts for the same pose. No new register-reservation implementation was measured in these trials.

The paired counts in the table describe individual traces. Four repeated cards and a single participant per build do not establish an average gain in researcher efficiency. More importantly, the middle-end investigator reached the correct conclusion about partial coverage on the repaired build. The corresponding conclusion on baseline was false. That specific change is independently reproducible using the exact same archived bytes.

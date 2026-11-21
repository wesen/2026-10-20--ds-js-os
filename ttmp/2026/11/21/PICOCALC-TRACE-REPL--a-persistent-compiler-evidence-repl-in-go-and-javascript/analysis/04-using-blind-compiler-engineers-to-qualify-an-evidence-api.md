---
Title: How blind compiler engineers qualify an evidence API
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/analysis/01-what-compiler-engineers-found-in-the-trace-repl.md
      Note: Role-by-role adjudicated baseline and repaired outcomes
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/playbooks/01-running-blind-compiler-engineer-persona-sessions.md
      Note: Reusable experimental protocol revised after both rounds
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/scripts/28-reconcile-timeline-revisions.py
      Note: Final independent editorial replay on both frozen services
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Reading compiler evidence through a query REPL

This note teaches a new compiler student how to answer an optimization question from archived compiler evidence. It uses the PicoCalc trace REPL and the recorded sessions of the PICOCALC-TRACE-REPL usability round.

The participants were independent runs of one language model, `deepseek-4.1-flash`, called through the `lunaroute` provider at thinking level `high`. Each had one tool, `trace_eval`, which evaluates JavaScript against a read-only archive, and a budget of 14 evaluations.

Every number below comes from a recorded tool reply, a replay file or one of the supervisor's independent checks, and each is named where the number appears. The methods come from [[ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench]] and [[ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports]].

> [!summary]
> - Every number from the archive carries a unit. Static instruction sites, executed instructions and elapsed microseconds answer different questions, and the archive holds no data that converts one into another.
> - A query that succeeds can still answer the wrong question. On the baseline build a loop filter returned 0 while the raw stream held at least 42 loop prints, and a participant reported the 0 as a fact.
> - The repaired build reclassified loop prints and tightened the definition of adjacent prints. The middle-end card's answer survived the repair, but its justification changed.
> - Existing LLVM passes and existing Typed treatments were measured. The two-register stack-temporary cache was proposed and designed, but it was never built or run.

## 1. What the archive holds

The archive has two kinds of input. The first is LLVM's print-after-all output:

- three build variants: `checked`, `unchecked` and `firmware`
- two phases: `middle` for the IR optimizer and `backend` for `llc`

Each printed header is an **event**. Each (variant, phase) pair is a **stream**, with its own SHA-256 digest. An event's **ordinal** is its position in its original stream, counted from 0. `q.help("timeline")` states that filtering never renumbers, so ordinal 74 names the same event whether it is reached through `run.events("middle")` or through `row.timeline("middle")`. The archive holds 4,133 events. Of these, 195 are in the checked middle stream and 116 in the checked backend stream (`baseline-catalog.json`, step 3).

The second kind is execution summaries, reached through the global `profiles`. Each **arm** is one build of a row kernel, run over the workload `opening-160-rows`, which is the 160 rows of the opening scene. The `checked-*` and `unchecked-*` arms build a hand-written C model of the row. The `typed-*` arms build Typed compiler output. Both frozen services also expose paired ESP32-P4 timings through the global `hardware`. The repaired root help names that global explicitly.

The interface distinguishes two kinds of value:

- A **plan** describes work. It is evaluated with `q.run(plan)`.
- An **eager value**, such as `profiles.arm("checked-llc").describe()` or `q.help()`, is already a JavaScript value. Here the descriptor is an object and the help text is a string.

Confusing the two caused five failed calls in the three original baseline roles. Other failures on the repaired build included redeclaring a notebook variable and applying an array method to an object.

## 2. Three units

| Unit | Source | Example | What it cannot tell you |
|---|---|---|---|
| static instruction sites | lines that match a selector in one IR print | 11 direct i32 loads through `%work` after ordinal 73, and 6 after ordinal 74 (`candidate-pass.json`, step 11) | how often any line executes |
| executed guest instructions | an emulator counter summed over the 160 verified rows | 1,275,560 with loop strength reduction disabled, and 1,233,611 with it enabled (`candidate-ablation.json`, step 5) | which program counter did the work, or how long it took on the board |
| elapsed microseconds | paired board runs in `hardware.pairs(baseline, candidate, phase)` | `typed-stock` to `typed-scalar` in phase `primary`: 72 pairs over 12 poses, with `savedPct` between 7.029 and 8.114 (`candidate-optimization.json`, step 9) | which instructions the time went to |

The dynamic unit has two definitions in this archive:

- For the C arms, `describe().fields` defines the count as "QEMU guest instructions executed with PC inside the linked row symbol".
- For the Typed arms, the count is "RV32 interpreter steps". `countsCover.counter` adds that "the script applies no symbol-range filter".

The stack counters differ in the same way. The C predicate matches operand text containing `(sp)`. The Typed predicate decodes `rs1 = sp` and does not decode compressed encodings. A comparison of the 3,608,697 steps of `typed-stock` with the 1,233,611 instructions of `checked-llc` therefore crosses counters as well as compilers.

A ratio of a physical percentage to a dynamic percentage is not a cost per instruction. The repaired optimization participant divided its reported physical saving of 7.664 % by the 11.328 % instruction reduction and called the quotient, 0.68, an elasticity. It selected the upper middle of 72 values. A replay using the mean of both middle observations gives 7.664203% for stock→scalar and 8.999664% for stock→PIE. The participant reported 7.664% and 9.001%, respectively. The numerator comes from twelve poses measured on the board in the primary phase. The denominator comes from one emulated opening scene. The supervisor's analysis, `01-what-compiler-engineers-found-in-the-trace-repl.md`, records the frame-time extrapolation that the participant built on this ratio as unsupported.

Two smaller units also appear in the receipts:

- **Events** count print headers.
- A **machine-function property** such as `NoVRegs` is a boolean read from the line `# Machine code for function row:`, which lists only the properties that are set.

## 3. One question, worked through

This section follows the middle-end participant on the repaired build, in receipt `candidate-pass.json`, build `523f1854…`.

### 3.1 The input

The card `pass.md`, unchanged:

> You are an LLVM middle-end engineer trying to decide which pass to read before changing the Typed compiler. In the checked row function, locate the first observed decrease in the number of direct i32 loads through the first argument's address between consecutive whole-function middle-end prints. Report both pass positions, both counts, and how the query handles a partial print or skipped event. Explain the distinction between a static site and a runtime execution. Find out whether the archive also identifies the original source line for each eliminated load.

### 3.2 Building the query

The participant took its bindings from the worked example in `q.help()`, shown here one statement per line:

```js
run = a.variant("checked")
row = run.function("row")
middle = row.timeline("middle")
hdr = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count()
```

`hdr` is a metric definition. It names a selector and a reduction, and `q.help("metrics")` gives its unit as static instruction sites. `row.argument(0)` is resolved separately in each print, from that print's `define` line. In both prints that matter here, it resolved to `%work`.

A metric becomes a plan in one of two ways:

- placed at a state, as in `hdr.at(middle.at(74).after)`
- measured along a timeline, as in `middle.measure(hdr)`

### 3.3 The first failure and the recovery

The participant's third evaluation, `q.explain(hdr)`, received a `[notAPlan]` refusal. The refusal said that `q.explain` takes a plan and that it had received an object whose only key is `_spec`.

The refusal was correct, because `hdr` is not a plan. But it named an internal key and carried no `fix:` line, unlike this build's `q.run` refusals. The participant did not retry `q.explain`. Its fourth evaluation read `q.help("metrics")` and `q.help("params")`, which show how a metric becomes a plan. Its fifth evaluation ran the query that answered the card, taken from the help text:

```js
q.run(middle.measure(hdr).changes().where(c => c.status === "known" && c.delta < 0).first())
```

Five further evaluations failed before the participant had collected all of its evidence:

- One called `.slice` on a rows result, whose array is under `.rows`.
- Three redeclared or reassigned top-level `const` names, which persist for the whole session.
- One evaluated `q.run(hdr.at(74).after)` and received a `[badArgument]` refusal, because `metric.at` takes a state, not a number. The refusal included this fix:

```text
fix: metric.at(row.timeline("middle").at(74).after)
```

The same reply warned that the name `s74` was now unusable, because the failed cell had declared it before its initializer finished.

In total, six of the 14 evaluations failed. Three of the six concerned JavaScript binding lifetime in a persistent session, not the query vocabulary.

### 3.4 The evidence

The answering query returned one row: ordinal 74, `EarlyCSEPass`, `from: 73`, `fromPass: "SROAPass"`, `before: 11`, `after: 6`, `delta: -5` and `status: "known"`. The row also referenced bytes 240363 to 248127 of the checked middle stream `bbd3b983…`.

The participant then measured both states directly (step 11). It received eleven and six witness lines, each with its print line and basic block. The two print bodies span lines 3 to 215 and lines 3 to 199. A second filter for any negative delta returned exactly one row.

To cover partial prints and skipped events, the participant selected every row whose status was not `known`. It found three behaviours:

- **gap**. Ordinal 12 follows ordinal 7 in the `row` timeline. Its row has `delta: null`, `skippedOrdinals: [8, 9, 10, 11]` and an `endpointDelta`, which reports the net change over the interval without attributing it to a pass. Ordinals 22, 26 and 70 are gaps of the same kind.
- **unavailable**. Ordinal 88, `LoopInstSimplifyPass`, is a loop fragment, so no whole-function count exists there. Its row has `reason: "loopFragment"` and `after: null`.
- **unknown**. Ordinal 106, `SimplifyCFGPass`, has `after: 6` and `before: null`, with the reason "previous row 105 is unavailable (loopFragment)".

Filtering before differencing asks a different question. `middle.where(e => e.pass === "EarlyCSEPass").measure(hdr).changes()` compared ordinal 7 directly with ordinal 74 and returned a `gap` over 66 skipped ordinals.

For source lines, `run.initialModule().sourceLocations({ function: "row" })` returned `status: "unavailable"` and `reason: "missingDebugLocations"`, with `compileUnits: 0` and `diLocations: 0`. The reply stated that the result "is not an empty set of lines". The participant also declined to identify the eliminated loads by printed line number or block label, because the body shrank from 215 to 199 lines across the step.

To contrast static sites with runtime work, the participant read `profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions")`, which is 1,136,142 executed guest instructions. That number illustrates the dynamic unit. However, `checked-gcc` is a GCC build, so it is not an execution of the LLVM IR whose sites were counted.

### 3.5 The independent check, and what the baseline participant got wrong

The supervisor's raw verifier inflates the compiler log, checks its digest and never calls the service. It records the same first drop in `verified-facts.json`: ordinals 73 and 74, with counts 11 and 6, as cited in `10-independent-baseline-grades.md`.

The baseline participant, on build `d8a8b5ae…`, returned the same four numbers. It also concluded that the checked middle stream contains zero loop-scope events. It based this on a query that succeeded:

```js
q.run(a.variant("checked").events("middle").where(e => e.scope.kind === "loop").count())
```

On the baseline build this query returns 0 (`usability-loops-baseline.json`). The same file shows ordinal 88, with header `IR Dump After LoopInstSimplifyPass on for.cond`, classified as `{ kind: "function", function: "for.cond" }`. But `for.cond` is a basic-block label, not a function. The supervisor's census of the raw streams, `usability-raw-loop-census.json`, found at least 42 checked prints whose first nonempty body line is LLVM's preheader comment, which marks a loop print.

On the repaired build the same query returns 42. Ordinal 88 keeps the identical stream digest and byte interval [346976, 348729). Its scope becomes `kind: "loop"`, `loop: "for.cond"` and `function: null`, with a tentative `ownerHint` that names `row` from ordinal 87 (`usability-loops-candidate.json`).

The baseline defect also affected adjacency, which section 4 defines. The baseline `row` timeline had 99 change rows: one `first` and 98 `known`. Its listing jumped from ordinal 7 to 12, from 24 to 70 and from 87 to 106. Since the tally holds only `first` and `known`, every such pair was labelled `known`. The drop at 73→74 lies between consecutive ordinals, before ordinal 88, so it survives the repair. The baseline exposes the original ordinals, so an investigator could independently inspect the two adjacent records.

### 3.6 The scientific recommendation

Read the print after `EarlyCSEPass` at ordinal 74 beside the print after `SROAPass` at ordinal 73. The number of static load sites through the capacity pointer falls by five between them.

Before porting the transformation to the Typed compiler, list every store and call between each removed load and the load that replaced it. The design document, `02-research-questions-and-executable-queries-for-the-ray-row.md`, notes that any operation able to change the buffer header invalidates the reuse.

Two questions stay open:

- The source lines of the five loads need a capture built with debug locations.
- Their share of executed work needs per-PC execution counts for an identified image. `q.capabilities()` reports that the archive lacks these (`missingPCSamples`).

## 4. Reconstructing the change-row rule

The pseudocode below reconstructs the repaired build's classification from `q.help("changes")` and from the rows quoted in section 3. It is not the implementation. It describes an unfiltered function timeline.

```text
for each row r of the timeline, in original-ordinal order:
    p = the previous row in the selection, if any
    if p does not exist:
        status = first
    else if the print after r is a loop fragment:
        status = unavailable, reason = loopFragment, after = null
    else if p was unavailable:
        status = unknown, before = null
    else if any stream event lies between p and r:
        status = gap, delta = null
        skippedOrdinals = every original ordinal strictly between p and r
        endpointDelta = value(r) - value(p)
    else:
        status = known, delta = value(r) - value(p)
```

The rule reproduces the receipts:

- Ordinal 12 is a gap over ordinals 8 to 11.
- Ordinals 88 and 89 are unavailable.
- Ordinal 106 is unknown.
- Ordinal 74 is known, with delta −5.

The loop-fragment test must come before the unavailable-predecessor test. Otherwise ordinal 89, which follows the unavailable ordinal 88, would be classified unknown.

On the baseline build, the unavailable and gap branches never fired for the unfiltered `row` timeline. The loop prints were absent from it, and non-consecutive neighbours were labelled `known`.

## 5. What changed in the interface

The table lists observed behaviour that differs between the baseline build `d8a8b5ae…` and the repaired build `523f1854…`, with the record that shows each difference.

| Change | Record |
|---|---|
| `q.run(describe())` returns the descriptor unchanged, instead of refusing with `[notAPlan]` | first example in `usability-replay-baseline.json` and in `usability-replay-candidate.json` |
| A new topic, `q.help("plans")`, separates plans from eager values and lists what a refusal's `err.got` can name | `candidate-pass.json`, step 2 |
| Existing executable plans accept `bindings` and `maxRows` on both builds. The repair rejects unknown options and distinguishes a materialized value supplied with nonempty evaluation options (`alreadyMaterialized`). | `candidate-pass.json` step 2, and `q.help("errors")` in `usability-replay-candidate.json` |
| A refusal names what arrived, for example `got the string "hasFunctions"`, and gives a fix | `candidate-allocator.json`, step 10 |
| An eager descriptor inside `q.bundle` gets its own refusal message | `candidate-ablation.json`, step 4 |
| Loop prints have `scope.kind: "loop"`, `function: null` and a tentative `ownerHint` | `usability-loops-candidate.json` |
| `known` requires consecutive original ordinals, and change rows carry `skippedOrdinals` | `candidate-pass.json`, steps 2 and 11 |
| `describe()` adds `treatment`, `countsCover`, `fields`, `comparisons`, `cannotAttribute` and `units` | `usability-replay-candidate.json` |
| `q.help("profiles")` states that `rowBytes` is the static `nm -S` size of the C row symbol | `usability-replay-candidate.json` |
| `.text()` returns a `print` without its one-line `trailer`. On the baseline, the print length equalled the byte span | `candidate-catalog.json` step 10, and `baseline-catalog.json` step 11 |
| Root help advertises the existing `hardware` global. Both services return the six default clean stock→PIE pairs. | `usability-timeline-reconciliation.json` |

Several behaviours seen on the repaired build remain open:

- `.samples()` and `.ordinals()` return objects rather than arrays.
- A bundle of eager descriptors is refused.
- The `q.explain` refusal in section 3.3 has no fix line.
- A reply longer than 4,000 characters is abbreviated.

## 6. How the method changed during the round

The protocol, `01-running-blind-compiler-engineer-persona-sessions.md`, gained amendments during the round. Each one traces to an observation.

- **Extra claims are graded separately.** Claims outside the requested answer go under "primary response", "additional inference" or "raw witness or unresolved". On the baseline, correct primary answers coexisted with two false extras. One was the zero-loop claim. The other was the intern's "9 distinct functions", which counted parsed labels, including `for.cond` and missing values.
- **Falsehoods are replayed at the source.** A scientific falsehood is replayed in a fresh session at the public entry point. The replay keeps the returned stream digest and half-open byte interval, and the raw print is read at those bytes. Raw census counts are reported as lower bounds, because a print without the explicit marker is not thereby shown to be a whole function.
- **Help text is audited for disclosed answers.** No topic contained a preselected total. Help did name `EarlyCSEPass` and `checked-llc-nolsr`, and it gave example ordinals 74 and 78. A value reached through a worked example is scored as guided retrieval.
- **Blocked attempts are counted apart from delivered calls.** The baseline ablation participant made 15 attempts, and the harness refused the 15th after 14 evaluations.
- **Unasked properties are marked "not elicited".** Only the `optimization.md` card asks for the five scientific-decision properties, so earlier cards are marked "not elicited" for them.

The supervisor's analysis also records an error in the supervisor's own reconciliation. The first script iterated a result that had materialized only the default maximum of 200 rows, which turned the intended census into a prefix. The corrected script sets `maxRows` and asserts that the number of unique materialized ordinals equals a separate count.

The corrected script reproduced 42 checked, 42 unchecked and 438 firmware loop events. The firmware figure exceeds the raw census of 437 because of ordinal 584, a `LoopFullUnrollPass` on a loop marked invalidated. Its payload begins with a module header and so lacks the preheader line.

A second Opus High reviewer graded the four baseline receipts with the first grades withheld. It agreed on the numerical recovery and on the false extras. It graded the optimization participant's mechanism more strictly.

## 7. What the retest showed

Five fresh participants ran on the repaired build, one per card. They included the held-out `allocator.md` card, which ran only on that build. All five recovered their preregistered values.

The middle-end participant gave a correct account of partial coverage, where the baseline participant's account had been false. That difference is reproducible from the same archived bytes.

The allocator participant found both `virtregrewriter` events in the checked backend, at ordinals 74 and 78. It read `NoVRegs` as false at 74 and true at 78. Help contained a worked example with both ordinals, so the run shows correct retrieval and interpretation, not unaided discovery. The same participant credited the example to "LLVM's own help example", although the example is in the REPL's own help.

With one run per card per build, attempt counts describe individual sessions. They cannot estimate whether the repair made sessions more efficient on average.

## 8. Measured optimizations and proposed ones

| Optimization | Status | Evidence and unit |
|---|---|---|
| LLVM backend loop strength reduction, on the checked C model | Measured by a matched ablation | −41,949 executed guest instructions, −3.29 % of the disabled arm. All 160 rows matched `.gold` in both arms. No per-PC attribution exists. |
| LLVM `EarlyCSEPass` removing capacity loads | Observed in static prints | 11 to 6 static sites between ordinals 73 and 74. The runtime effect was not measured. |
| Typed region lowering with a scalar producer, `typed-scalar` | Measured, but bundled | −408,787 RV32 interpreter steps (−11.33 %) and −250,942 direct stack accesses against `typed-stock`. The treatment bundles admission and entry guards, lane scratch, checked-interval reuse and register-held induction state, so it isolates no single change. |
| Typed packed producer, `typed-scalar` to `typed-pie` | Measured | −68,475 steps (−2.14 %), with no change in stack loads. The design document reports a median saving of 242 µs (0.43 %) per clean default frame over six blocks. |
| Typed reuse of capacity loads, and a running address in Typed | Proposed in the design document | Not built. A memory-effects rule for the Typed language is needed first. |
| Two registers reserved for stack temporaries | Proposed and designed by both optimization participants | Never built or run, as both participants stated. |

The 250,942 removed accesses show how the choice of denominator changes a conclusion:

- They are 61.39 % of the 408,787-step difference.
- They are 19.45 % of the 1,290,106 direct stack accesses of `typed-stock`.

The baseline optimization participant used the first figure to argue that the scalar treatment already captures most of the stack traffic. The second figure shows that most of the stock pool remains. Neither figure shows which accesses are short-lived temporaries.

## 9. A falsifying experiment for the register cache

`typed-stock` executes 936,328 direct stack loads and 353,778 stores over the 160 rows. Together they are 35.75 % of its 3,608,697 steps. That fraction sizes a pool. The arm's `cannotAttribute` list states that the stack predicate cannot separate spills, prologue and epilogue saves, local stack homes and scratch. The pool therefore says nothing yet about which accesses two registers could replace.

The first observation should discriminate between mechanisms before anything is built. For every executed stack access, record the PC, stack offset, access kind and function, first in a stock run and later in any candidate run. If most of the pool turns out to be saves around calls or long-lived local homes, two reserved registers have little to replace, and the idea is dropped without a build.

If a large pool of short-lived temporaries remains, run this matched experiment:

- **Control:** `typed-stock`.
- **Candidate:** the same source, compiler options and inputs, with two registers reserved for short-lived temporaries in the row loop.
- **Correctness:** every one of the 160 rows must not trap, must return 1, and must reproduce `fixtures/<y>.gold`. Paired board runs must agree on `outputCRC` for each pose.
- **Dynamic metrics:** direct stack accesses (control: 1,290,106), executed steps (control: 3,608,697), and the per-access attribution described above.
- **Abandon if** any of these occurs:
  - fewer than 129,011 accesses (10 %) are removed
  - fewer than 72,174 steps (2 %) are removed
  - any output differs
  - stores rise by 10 % or more while loads fall, which would motivate examining spill attribution

  These thresholds come from the repaired optimization participant. They are decision rules fixed in advance, not values derived from the evidence.
- **Physical follow-up:** time the built candidate against the control in counterbalanced paired blocks. Report the `primary` and `clean` phases separately for each pose, with the number of pairs and every adverse pose.

## 10. Remaining limitations

- Each card ran once per build, so the results describe sessions, not a population.
- Help examples guided several retrievals, including both allocator endpoints.
- Board evidence was available to both optimization participants. Root help mentioned it only on the repaired build, and only the second participant used it. The difference confounds interpretation of the interface as a whole with the discoverability of this additional evidence.
- The function that owns a loop print is still unknown. `ownerHint` is only a proximity hint.
- The archive holds no MIR instruction metrics, no PC samples, no debug locations and no optimization remarks.
- The repaired checked `row` timeline contains all 99 original rows plus 45. All 42 loop subjects were added, as were module-subject events 23 and 26 and the function-subject event 144, `RequireAnalysisPass<llvm::ShouldNotRunFunctionPassesAnalysis,…> on row`. These three additional headers contain template arguments. A public-API set difference over the original ordinals identifies every added row.
- All grading was done by language-model reviewers and by the supervisor. No human grader calibrated the scale.

## Sources

The ticket contains the operator protocol, independently graded study and complete public query histories. [Operator playbook](../playbooks/01-running-blind-compiler-engineer-persona-sessions.md) · [Adjudicated results](01-what-compiler-engineers-found-in-the-trace-repl.md) · [Final two-build editorial replay](../various/usability-timeline-reconciliation.json)

- **Receipts** under `various/personas/`:
  - Baseline: `baseline-catalog.json`, `baseline-pass.json`, `baseline-ablation.json`, `baseline-optimization.json`
  - Repaired: `candidate-catalog.json`, `candidate-pass.json`, `candidate-ablation.json`, `candidate-allocator.json`, `candidate-optimization.json`
- **Editorial reconciliation:** `scripts/28-reconcile-timeline-revisions.py` and `various/usability-timeline-reconciliation.json` verify all 45 added timeline ordinals, re-evaluate the physical measurements on both frozen services and check the existing plan options.
- **Replays and census:** `usability-loops-baseline.json`, `usability-loops-candidate.json`, `usability-replay-baseline.json`, `usability-replay-candidate.json`, `usability-raw-loop-census.json`
- **Grades, analysis and diaries:** `10-independent-baseline-grades.md`, `01-what-compiler-engineers-found-in-the-trace-repl.md`, `04-usability-diary.md`, `08-usability-researcher-diary.md`
- **Protocol, cards and design:** `01-running-blind-compiler-engineer-persona-sessions.md`, `brief.md`, `catalog.md`, `pass.md`, `ablation.md`, `allocator.md`, `optimization.md`, `02-research-questions-and-executable-queries-for-the-ray-row.md`

---
Title: A preregistered comparison of bounded function selectors
Ticket: PICOCALC-ANALYSIS-SELECTION
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T22:00:13.83831688-05:00
WhatFor: ""
WhenToUse: ""
---

# A preregistered comparison of bounded function selectors

The existing divisor analysis can remove native checks when it knows a divisor is nonzero or can rule out signed overflow. Each function costs two passes over its numeric intermediate program. The prior selector considered eligible functions in source order. An earlier experiment arranged 37 equal-size functions in two orders. One function contained the useful divisors. Moving it from first to last changed the saved code from 720 to zero words under the same 32,768-cell budget. The new experiment asks what cheap measurements let the compiler spend a fixed amount of work on functions that will remove more code.

## What counts as cost and benefit

Freeze the production compiler at `40bcf850a5809ef6d839127869faa952596ed157` and use the existing bounded divisor pass. Keep its proof logic and 2,048-cell per-function cap. Running the pass costs `2 × numeric cells`, charged before entry. Measure benefit as RV32 instruction words removed versus the same ordered input with analysis disabled. Each qualifying remainder or division removes a two-word zero guard. Proving that a nonzero division divisor differs from minus one removes seven additional words. A remainder by minus one and a division by minus one therefore differ in which guard logic can disappear. A known zero retains the existing guard.

Compile a function in the actual numeric frontend and collect the summary at its completed-body boundary. The collector can retire that body immediately. Whole-module winners are chosen from a bounded metadata table and passed to a second compile through the real streamed lowering path. Source order remains a one-pass baseline. Report the selector’s own measured cost, including the extra frontend pass, and distinguish this from the charge that bounds proof work. Preserve full compile success and diagnostics across all policies. Execute surviving and required trap cases against Wasm semantics. Static words and dynamic behavior are separate measurements.

## Policies to freeze before seeing evaluation data

| Policy | Admission | Order sensitivity |
| --- | --- | --- |
| Source order | Consider each capped function with any division or remainder in declaration order. Admit when the remaining budget covers it. | May change with declaration order. |
| Literal only | Consider capped functions with an immediate nonzero divisor. Count feature visits, then consider candidates in stable name order. | Stable for a fixed function set within the metadata capacity. |
| Estimated words per cell | Use direct constant sites and local-divisor opportunities. Sort by estimated guard words divided by charge. Break ties by stable name. Fill with remaining eligible candidates that fit. | Stable for a fixed function set within the metadata capacity. |

Read only operations at decoded instruction boundaries. For the literal feature, inspect the producer directly before the divisor operation and the ordinary unary-minus representation. For the local feature, a local read can contribute if the slot has an earlier top-level literal initialization. A cheap summary sees evidence of later writes from local-set operations and discounts the candidate. The full analysis still establishes the proof and controls emitted guards. The scorer may overestimate mutable or unreachable opportunities or miss a useful value. Record both outcomes. Choose the exact integer weights only from training transcripts and freeze them with policy code, cost rules, generator and runner before creating held-out results.

The planned metadata limit is 256 functions with at most one summary per function. Measure explicit storage high-water and the number of overflow cases. If the input exceeds the limit, run the existing source-order policy and record the fallback. Report rank preprocessing visits, selection comparisons, total compile time, and peak metadata alongside the proof charge. The principal table compares equal proof budgets. A supplemental comparison reduces the ranked policies’ proof budgets by their measured feature visits, in the same decoded-cell units, to expose whether results rely on extra planning work.

## Input reservation and release

Record the source identities for training Files and Agenda at the pinned revision. Known previous Editor aggregate results are background information. No new Editor parser features, selected-function data or outcomes may be read during training. The held-out app is the Editor source built by the pinned source manifest. Only reorder synthetic modules for primary permutation tests since the language requires callees to be declared before use.

Training synthetic modules use generator seeds 1–8. Use independent leaf functions, direct positive divisors, dynamic argument divisors, and simple constant-local divisors. Training varies function size and the share of those three classes. Inspect and tune on those modules only.

The held-out generator uses seeds 501–520. Its three structural families are specified before policy training:

- **Concentrated benefit.** One small function contains many nonzero literal divisor sites. Many larger capped functions divide by unknown arguments.
- **Decoy writes.** Functions include literal assignments erased by a later or conditional write. Reserve repeated mixed remainder, division by a negative literal, and division by a required trap. A smaller set retains provable local divisors.
- **Distributed benefit.** Vary each function’s useful-site count independently from body length. Include long arithmetic stretches and modest literal opportunities so that a density heuristic has to trade several small functions against one large function.

For each family use the original order, reverse order, and 20 seeded Fisher–Yates orders. Leaf functions are independent, so every order has the same well-typed function bodies. The primary binding budget is 32,768 charged cells when it exhausts eligible cost. Report a deterministic sensitivity grid at a quarter, a half and the full eligible cost, rounded down to even cell counts. Report unconstrained workloads separately. Post-freeze audit verifies budget actually binds and states how many workloads or budgets did not meet that condition. Compare net module savings with an exact 0/1 knapsack dynamic program over guard words and per-function charges from an analyze-all receipt.

The runner must require the committed policy hash receipt on any held-out invocation. It must verify policy source, generator source and pinned compiler hashes before reading Editor or generating held-out modules. Generate only training inputs before the freeze commit. Record the holdout manifest and results in a later checkpoint. Any tuning after that point is a new experiment.

## Analysis plan

For a given program compare the fraction of knapsack words recovered, worst and median order, max-minus-min words over orders, proof charge spent on zero benefit, and wall-clock cost including planning. Record all held-out regressions greater than five percentage points of oracle recovery against source order in the corresponding order, including cases where a ranker does worse. A zero oracle gives zero available opportunity and a cost-only comparison. Treat generated families as distinct mechanisms and report each separately alongside Editor.

The independent Opus 5.5 High review proposed a stable ranking, a bounded summary collector, explicit planner cost, knapsack as an upper bound, and a decoy family. This design uses divisor checks rather than generic branch folding. It reports proof work and planning independently and tests a charged sensitivity rather than assuming a ten-percent planning reserve. The independent comparison does not dictate how development results will turn out.

---
Title: Independent baseline persona grades
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Baseline grades for the four observed cards

The receipts graded here are `baseline-catalog.json`, `baseline-pass.json`, `baseline-ablation.json` and `baseline-optimization.json`. All four used provider lunaroute, model deepseek-4.1-flash, thinking high, build `d8a8b5ae1c6f…` and a limit of 14 calls. Each card had one run, so these grades describe those runs only. They are not population estimates.

Step numbers are 1-based positions in each receipt's `steps` array. Reference values come from `verified-facts.json` and, for the stock mix, from the figures supplied with this review. `usability-controls-baseline.json` records no numerical value disclosed by any help topic. It does record `at(74)`, `EarlyCSEPass` and `checked-llc-nolsr` as terminology cues in help. `allocator.md` has no baseline receipt and is not graded. The task cards are unchanged.

The evidence units are as follows.

- **events** are print header records. Ordinals restart per (variant, phase) stream.
- **static instruction sites** are matching lines in one IR print.
- **executed guest instructions** and **executed direct stack loads or stores** are dynamic totals. Each is summed inside region `row` over the 160 verified rows of `opening-160-rows`.

The grade scale has three levels.

- **5**: every requested value is correct and witnessed, and the unsupported extras do not change a conclusion.
- **4**: every value is correct, but at least one false extra changes a stated conclusion about the archive or the API.
- **3**: the premise values are correct, but the decision rests on unsupported mechanism claims.

## Grade table

| Card | Correct numeric recovery | Source witnesses | False or unsupported extras | Grade |
|---|---|---|---|---|
| `catalog.md` | 4,133 events (verified 4,133). Checked middle has 195 events and checked backend has 116. Checked middle ordinal 74 is `EarlyCSEPass`, `when` after, scope function `row`, streamSHA `bbd3b983…`, bytes 240363 to 248127. An event is identified as a header record. The binding `mid74` returned the same row in a later call. | Step 3 `a.events().count()`. Step 4 per-phase counts. Step 5 `at(74).select(...)`. Steps 8 and 9 binding reuse. Step 13 `a.streams()` sums. | The claim that the envelope changes on reuse is false. Step 5 `at(74).select(...)` already returned a bare row. The `{kind, unit, count, rows}` envelope came from `where(...).select(...)` in step 7, so the improvement sentence misdiagnoses the API. `print-before-all` does not appear in `q.help("events")`. "9 distinct functions" counts parsed `function` labels, and those labels include loop labels such as `for.cond`. Binding survival shows only that the service works, because `brief.md` cued persistence. | 4 |
| `pass.md` | Ordinal 73 `SROAPass` has 11 sites and ordinal 74 `EarlyCSEPass` has 6, a delta of −5 static instruction sites with status `known`. `row.argument(0)` resolved to `%work`. These match `firstObservedDrop` [73, 74, 11, 6]. Source lines are reported unavailable with reason `missingDebugLocations` and 0 compile units. The participant correctly distinguished static sites from runtime executions. | Step 7 `.changes().table(...)`. Step 8 direct `hdr.at(middle.at(73).after)` and `hdr.at(middle.at(74).after)`, the filtered gap demo and `sourceLocations`. Step 12 full refusal text. | "The checked middle stream contains zero loop-scope events" is false. See the next section. The account of loop-fragment handling quotes help and was not observed on this archive. It is also not what the archive does, because loop prints are dropped from the `row` timeline rather than marked `unavailable`. | 4 |
| `ablation.md` | `checked-llc-nolsr` 1,275,560 and `checked-llc` 1,233,611 executed guest instructions, a change of −41,949 or −3.2887 %. The denominator is the before side, 1,275,560. Matched keys are workload, region, checked contract and unit. These match the verified totals and `savedWithLSR`. PC attribution was declined with `missingPCSamples` and `missingInput` finalImage. The participant named the missing observation: per-PC executed-instruction samples for both arms and a registered final image with imageSHA and address map. | Step 6 `describe()`. Step 7 total. Step 8 `q.compare` (delta and percent visible before the abbreviation). Step 11 arithmetic. Steps 10 and 12 capability and join refusal. Step 14 row samples keyed 0, 61 and 109. | "Differ only in the strength-reduction flag" rests on the arm names alone. The digest `42a8a43d…` identifies the execution summary shared by all ten execution arms. The diary says the abbreviation hid `percent`, but step 8 shows `percent` and `denominator.side` before the cut. The join probe used `checked-llvm` from the help example, not an LSR arm. The conclusion still holds because `q.capabilities()` reports the gap archive-wide. | 5 |
| `optimization.md` | `typed-stock` has 3,608,697 executed guest instructions, 936,328 executed direct stack loads and 353,778 stores. The sum is 1,290,106 (verified `typedStack`), and its share of 35.75 % is derived arithmetic. `typed-stock` to `typed-scalar` changes instructions by −408,787 (−11.33 %), loads by −206,775 and stores by −44,167. `typed-scalar` to `typed-pie` changes instructions by −68,475, loads by 0 and stores by +165. The execution arms match the verified checked totals. | Step 9 totals. Step 10 `describe()` and `q.capabilities()`. Step 12 `q.compare` with `percentChange`. Step 13 samples for rows 0, 61 and 109. Step 14 static sites at checked middle ordinal 194. | `typed-scalar` is called "stack-temp placement for hot live ranges" and `typed-pie` "a second mechanism aimed at the same traffic axis". The archive describes neither arm, and `packets` has no stated meaning. "32.48 % is a hard upper bound" is unsupported. A reservation removes two registers from allocation and can change other instructions, and the premise arm is `typed-stock`, not `typed-scalar`. "Static sites only bound how many temporaries exist" is false. The 13 loads and 4 stores are in checked-variant LLVM IR for `row`, through `%work` and i16 element pointers. They are not Typed stack temporaries, and that print has 0 allocas. The diary describes parallel calls and renumbers them C1 to C11, but the receipt shows 14 sequential steps. | 3 |

### Optimization card, five protocol dimensions

| Dimension | Score | Basis in the receipt |
|---|---|---|
| Measured premise | Met | Step 9 gives the stock totals with units, region `row` and workload `opening-160-rows`. Step 10 gives rowsVerified 160. The 35.75 %, 25.94 % and 9.80 % shares are arithmetic computed outside any tool call, and they are correct. |
| Mechanism | Partial | The participant names two preconditions: the share of accesses that are short-lived temporaries, and whether two registers are free. It does not explain which loads and stores two reserved registers would replace, or what removing them from allocation costs. The mechanisms it gives for the other arms are invented. |
| Discriminating evidence | Partial | It asks for stack loads and stores split into short-lived temporaries and addressed frame slots, or for PC samples joined to a final image. That split separates the hypothesis from ordinary frame traffic. The "depth" histogram is undefined, and saves around calls are not considered. |
| Controlled validation | Partial | The design has a single-change candidate and control, the same rows and emulator, and per-row output digest equality as the correctness criterion. It notes that typed `rowBytes` is null. The target metric is stack accesses per executed instruction, with total instructions as a guardrail. There are two defects. The control is identified by the summary digest `119750ba…`, which is shared by all three typed arms and does not identify a build. The base is `typed-scalar`, while the card asks about the stock mix. |
| Refutation | Met | The thresholds are concrete. Abandon if stack accesses fall by fewer than about 20,800 (2 % of 1,039,164), if executed instructions rise, or if the instruction saving is below 2.14 %. Revise when the reduction is between 2 % and 5 %. The 2.14 % threshold is borrowed from an arm whose mechanism is unknown. |

- **Actual proposed intervention.** The recommendation is to change stack-temporary placement for hot live ranges first and to defer the reservation. The designed experiment, however, tests two native registers reserved for stack temporaries on a `typed-scalar`-equivalent base. The recommendation and the experiment are therefore inconsistent.
- **Refuting result.** The reservation is abandoned if stack accesses fall by fewer than about 20,800, if executed instructions rise at all, or if the instruction saving is smaller than 2.14 %.
- **Validation status.** Neither proposal is a validated implementation. No reservation or placement build was executed in the session. The participant's own list of validated conclusions correctly excludes any win from the reservation.

## Strongest disputed claim

**The claim.** The `pass.md` participant states that the checked middle stream has zero loop-scope events. It reports a scope tally of module 20, function 161, cgscc 10 and unknown 4 (step 11). From this it concludes that partial-print handling was never triggered and that every `known` row compares adjacent full prints.

**The contrary evidence.**

- `usability-raw-loop-census.json` reports 42 prints with an explicit preheader in the checked stream with SHA-256 `bbd3b983…`. That is the stream the participant queried. The example is ordinal 88.
- `usability-loops-baseline.json` records the replay of ordinal 88. Its header is `IR Dump After LoopInstSimplifyPass on for.cond`, its scope is kind `function` with function `for.cond`, and the loop-scope count is 0.
- The `row` timeline in step 6 jumps from ordinal 87 to ordinal 106.

**Classification.** This is an archive or evaluator defect: loop headers are parsed as function scope, and the loop prints disappear from the `row` timeline. The participant then made an interpretation error by reporting the API count as a fact about the stream. The headline drop at 73 to 74 comes before ordinal 88 and agrees with `verified-facts.json`, so the numeric grade for `pass.md` stands. The same defect affects the "9 distinct functions" figure in `catalog.md`.

**How to verify.**

1. Run the independent verifier `01-check-evidence.mjs` outside the REPL. It should inflate the checked middle log, confirm SHA-256 `bbd3b983cff150aeb56d99e517331a1ea0b4af5afc86869c730b9dca2ac795b4` and count loop-pass headers whose label is a block name such as `for.cond` rather than a defined function. Compare that count with the census figure of 42.
2. In a fresh service session, evaluate `q.run(a.variant("checked").events("middle").where(e => e.scope.kind === "loop").count())` and `q.run(a.variant("checked").events("middle").at(88).select("ordinal","pass","header","scope","ref"))`. The defect is confirmed if the raw count is greater than zero while the API count stays at 0.
3. Evaluate `q.run(row.timeline("middle").measure(hdr).changes().table("ordinal","pass","fromPass","before","after","delta","status"))` with `hdr` defined as in `q.help()`. Read the row at ordinal 106. If its predecessor is ordinal 87 and its status is `known`, then the API labels a comparison as adjacent although loop prints of `row` at ordinals 88 to 105 lie between the two prints. Confirm in the raw log which of ordinals 88 to 105 are loop prints of `row`.
4. Add a regression case. Ordinal 88 must parse as scope kind `loop` with function `row`. Measuring a metric at that print must return `unavailable` with reason `loopFragment`. Measuring the `row` timeline must then mark 87 to 106 as `unknown` or `gap`, not `known`.

---
Title: "Bounded text access proof notes"
Ticket: PICOCALC-COMPILER-THESIS
Status: active
DocType: reference
Topics: [picocalc, native, performance]
Intent: long-term
---

# Bounds-check investigation notes

The bounded proofs assignment came from the PICOCALC-COMPILER-THESIS supervisor. The user request appears verbatim in [the supervisor diary](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments). The code and evidence checkpoint is `c1e3777`. The measurements use the original typed emitter from the `dd69a81` baseline. Its SHA-256 and the linked reactors' digests are in the receipt.

## Source audit

| Source | Observation | Consequence |
|---|---|---|
| `picocalc-os/compiler/typed-wasm.js:218–230,277–305` | A receiver's first word is loaded as length. The explicit check uses `i32.ge_u`; the source relational operators use signed comparisons. A buffer write performs its check before evaluating its value operand. | Prove signed nonnegativity separately. Place the query after evaluation of the index and before evaluation of the store value. |
| `picocalc-os/compiler/typed-wasm.js:311–333` | A nonempty `writeLiteral` checks both ends before writing. | Track both checks in baseline and dynamic totals. Leave both outside plain-local analysis. |
| `worlds/files/files.typed:13–26,32–42` | `filesName` takes its end from a header and calls a whitespace classifier inside leading and trailing loop conditions. `filesCompare` increments a zero-initialized scalar under two direct receiver-length guards. | The first is a legitimate syntactic candidate that loses header facts across calls. The second gives two proven sites. |
| `worlds/agenda/entry.typed:177–181` | `entryPut` returns early on either negative position or insufficient capacity. | The false path of the disjunctive test supplies both direct proof obligations for the store. |
| `worlds/agenda/reminder.typed:65–69,148–168` | `skipSpace` starts from a signed parameter. `scanTask` and `writeTitle` start from a record field. | Immediate direct upper comparisons leave the lower obligation open. |
| `worlds/editor/layout.typed:11–16,43–54` | `editorColumn` guards a cursor and delegates actual reading to `editorNext`. The fixed type signature does not express the caller's range contract. | Direct guard loop counts are different from proven check counts. |
| `worlds/editor/markdown.typed:7–11,50–60` | `editorMdSpace` and `editorMdMarker` use caller-provided endpoints as upper bounds. The marker check pattern is otherwise small and pure. | An isolated explicit span validation demonstrates that relational proof can use such facts when the function receives them. |

World paths in this table are relative to `picocalc-os/` unless they begin with that prefix. The receipt gives source digests and the map from concatenated source lines to original files.

## Questions and evidence

| Question | Measurement | Limit |
|---|---|---|
| Can the direct and chained proof modes run on identical language input? | Both adapt the existing parser and emitter. No-elision mode is byte identical to the real compiler output. | The adapter uses checked source anchors and lives inside the ticket. |
| Does searching further pay off in the three app sources? | Three direct removals, zero incremental chained removals. Edge inspections 103 versus 151. | A different fact source or profiling distribution could change the result. |
| Does the decision preserve faults and effects? | 1,071 synthetic cases plus 20 real or source-derived calls check return or trap and SHA-256 of all linear memory. | Tests expose counterexamples within the selected cases. The flow argument supplies the broader semantics reasoning. |
| Does the chain search pay off when the facts are present? | A six-edge proof takes 43 inspections. At a budget of 32 its test executes one check, at 64 it executes zero. Four guarded Editor marker proofs take 39 inspections total. | The added guard introduces runtime work. Counters only describe existing object checks. |
| Does a cold on-device compiler have enough memory for this analysis? | No usage measurement. The host adapter keeps a metadata tree and current bounded fact sets. | A target implementation needs a storage layout and measured high-water mark, even with bounded query steps. |

## Article review before handoff

The first draft’s example gives separate obligations and follows the induction fact into the read. The review identified three places that needed more explicit evidence boundaries.

- The module-size table needed to say whether reactor bytes were included and where the dynamic comparisons ran. The article now states that linked modules were validated, while counted calls ran in standalone host modules.
- A reader could conflate a sample's 196 eliminated executions with a Files-wide workload. The revised dynamic section names the equal-prefix input and the two sites that account for the entire reduction.
- The 45-check Editor result needed to account for where the new fact came from and the guard's own cost. The separate span-contract row, explicit source insertion, within-contract comparison and follow-up cost qualify the result.

Technical cross-checks used `various/bounds/results.json` for all table entries, `fixtures.typed` for overflow/effects, `proof.mjs` for the six-hop and 50,000-event limits, and the original emitter for the store-before-RHS order. The narrow inference rules deliberately avoid constant-index and affine arithmetic proofs. The next scientific comparison would require an event replay with site-level frequencies and a measured target compiler allocation budget.

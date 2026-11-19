---
Title: "Bounds proofs investigation diary"
Ticket: PICOCALC-COMPILER-THESIS
Status: active
DocType: reference
Topics: [picocalc, native, performance]
Intent: long-term
---

# Bounds proofs investigation diary

## Step 1 · Trace the current check before choosing an experiment

I traced a typed string read and buffer write from `FunctionEmitter.prefix` and `bufferWrite` to `codeUnitAddress`. The same helper emits the unsigned check at both sites. This answered what could be removed without changing index evaluation, address calculation, or memory operations. An initial audit located direct length tests and a larger group of local endpoint comparisons.

### Prompt Context

**User prompt (verbatim):** [Supervisor diary, Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).

**Supervisor assignment:** Implement and measure on-demand bounded relational bounds proofs, audit realistic app sources, retain checks when the proof is incomplete, and validate the resulting Wasm.

**Assistant interpretation:** Compare baseline, direct, and transitive proof modes on the existing typed source and emitter. Measure code removal and executed explicit checks separately.

**Inferred user intent:** Determine whether relational reasoning can improve a compiler that runs on the PicoCalc, and record the costs and assumptions precisely enough for a subsequent implementation.

### What I did

- Read Native Next Task E8 in `design-doc/05-scope-e-language-additions.md` and the actual typed Wasm compiler.
- Inspected Files’ `filesName` and `filesCompare`, Agenda’s `entryPut` and `skipSpace`, and Editor’s layout, Markdown and position helpers.
- Read the primary ABCD, difference-bound matrix and dependent-type bounds papers and the Wasm integer semantics.
- Sent the supervisor the signed proof obligations, proposed instrumentation, and intended distinction between candidate loops and eliminated checks.

### Why

The E8 proposal uses a new unsigned index type. The lab needed three variants that accepted the same real sources. A proof based on the existing signed comparison has to establish nonnegativity without changing the language.

### What worked

The audit identified the exact removable byte range and the endpoint for a proof query. It also explained how a negative index can pass a signed guard and why an address that lands inside linear memory still needs the explicit receiver check.

### What didn't work

A grep inventory alone could not determine when a guard survives a call, whether the guarded receiver matches the access receiver, or whether the loop even contains an inline read. It served as navigation before collecting typed emitter events.

### What I learned

A candidate loop, a static check site, and an executed check answer three different questions. The scope of the denominator changes the interpretation of every percentage.

### What was tricky to build

The check in a buffer setter occurs before the right-hand expression. Its proof applies at the pre-expression program point even if that expression changes a header before the final store.

### What warrants a second pair of eyes

The selected event boundaries should be checked against nested conditions, receiver aliasing and evaluation order.

### What should be done in the future

Establish site-specific frequencies before investing in analysis of cold Editor paths.

### Code review instructions

Start with `codeUnitAddress`, `bufferWrite` and `bufferLiteral` in `picocalc-os/compiler/typed-wasm.js`. Review the source audit in [bounds-notes.md](bounds-notes.md).

### Technical details

The standard check is `local.get position; local.get receiver; i32.load; i32.ge_u; if; unreachable; end`. For a plain signed index the sufficient condition is `0 <= i < length` at the original check point. The engine's linear memory check remains present in every variant.

## Step 2 · Attach metadata and conservatively analyze the original emitter

I used a local VM adapter with asserted source anchors to collect compact expression and statement descriptions while the repository compiler still parsed, typed and emitted the function. This avoided maintaining a second parser or changing the firmware compiler. I recorded each explicit check's byte interval and assembled the final body only after the analyzer decided which intervals to keep.

### Prompt Context

**User prompt (verbatim):** [Supervisor diary, Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).

**Assistant interpretation:** Add direct and bounded-chained decisions through an isolated Wasm compiler experiment.

**Inferred user intent:** Obtain executable evidence while preserving the project's production compiler.

**Commit (code):** `c1e3777` — “Prototype bounded relational text bounds proofs”.

### What I did

- Added `scripts/bounds/emitter.mjs` and `proof.mjs`. The adapter records checked index evaluation, condition structure, assignments, and calls or stores that may modify headers.
- Implemented signed relation edges, strict-path witnesses, exact local dependency kills, conservative side-effect barriers, join intersection and loop summaries.
- Added an induction rule for a syntactically required signed strict upper guard and a sole top-level increment by one.
- Added optional counter instructions for the standalone Wasm path. The counter uses a mutable global separate from app memory.

### Why

Metadata from the production emitter preserves treatment of lexical bindings and evaluation order. A checked edit anchor makes unexpected production-source drift visibly break the lab rather than silently change the experiment's meaning. Keeping the generated payload opcodes gives a direct comparison with existing behavior.

### What worked

The adapter instantiated inside Node's VM. The no-elision module and function bodies were later verified byte equal to the production compiler's outputs on the same source and reactor inputs.

### What didn't work

- The initial write-and-check shell call for `emitter.mjs` failed before writing the file with `bwrap: Can't bind mount /oldroot/ on /newroot/: Unable to apply mount flags: remount "/newroot/mnt/pico": No such device`. I recovered the exact source text from the recorded tool invocation and materialized it after the workspace mount became available.
- The first direct smoke command using `compiler({analyze(){}}).compile("function check(): i32 { return 0; }")` failed with `Error: compiler anchor occurrence mismatch` at the operator parse hook. The anchor searched for `lex.next()`, while the emitter calls `this.lex.next()` there. The corrected hook passed the smoke command.

### What I learned

The metadata needs either an explicit node for an expression's children and side effects or a conservative reason to discard facts. A terminal read and a setter check can share the same proof query, while their surrounding effect order differs.

### What was tricky to build

At a loop header, an invariant must hold before the first test and before every later test. Copying incoming relations through the loop can prove a false result on the second iteration after a local write or aliasing store. The loop overview scans the condition and nested body for writes and call/store barriers, clears affected facts, and restores a lower fact only through the restricted increment proof.

### What warrants a second pair of eyes

Verify that the intersection keeps the weaker relation when one path has a strict edge and the other a non-strict one. Check the order in which setter checks and RHS effects are traversed. Check the short-circuit fact flows independently on both outcomes.

### What should be done in the future

A production implementation could reuse structured source analysis around the emitter but needs measured bounded allocation and an explicit strategy for source/IR integration.

### Code review instructions

In `emitter.mjs`, compare the length and access anchors to the live emitter. In `proof.mjs`, read `condition`, `loopHead`, then `path` and `query`. Run `node "$ticket/scripts/bounds/run.mjs"` from the repository root after expanding the ticket path.

### Technical details

An environment has at most 64 edges. The chained mode searches up to six edges per path with one shared budget for lower and upper obligations. The queue keys include strictness. Comparison terms are zero, plain signed scalar locals and length loads. Arithmetic terms generally supply no proof, apart from a modeled upper bound for `Math.min` and the specialized nonoverflowing induction rule.

## Step 3 · Compare byte identity, returns, traps and memory

The full application survey gave a small direct yield and no additional chained yield. I added a clearly scoped Editor experiment in which a helper checks its argument span at entry. That tests whether the chain search contributes when real application code contains the necessary relations and preserves the unmodified corpus result as the primary estimate.

### Prompt Context

**User prompt (verbatim):** [Supervisor diary, Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).

**Assistant interpretation:** Validate exact application modules and demonstrate which hypotheses reproduce on generated Wasm.

**Inferred user intent:** Separate real workload evidence from a narrow experiment in which the proof preconditions have been made visible.

**Commit (code):** `c1e3777` — “Prototype bounded relational text bounds proofs”.

### What I did

- Added `fixtures.typed` and `run.mjs` with baseline byte equality, whole-module validation, per-site witness recording and per-invocation explicit-check counters.
- Created concrete fault cases for a negative index, insufficient strictness, stale local values, receiver rebinding, aliasing record and buffer writes, typed calls, calls in conditions, loop backedges, signed wraparound and a linear-memory trap.
- Diffed expected returns, exact trap messages and complete linear-memory SHA-256 between the original and clean/instrumented modes. Checked representative words directly for store and fault cases.
- Linked the exact three app scripts to their existing reactors and recorded the code and input digests. Ran independent standalone samples from their actual functions.
- Added a one-line entry validation to an isolated copy of Editor's `editorMdMarker`, then compared it to the exact original helper on five spans that satisfy the validation.
- Ran linked and standalone variants under Node v24.18.0. Saved linked output as `various/bounds/results.json`.

### Why

An optimized program can return the expected result and still corrupt memory. A code-generation test needs both a semantic oracle with deliberate faults and a structural comparison. A runtime counter determines how often an emitted check ran without attributing Wasm engine optimization or execution-time measurement to the experiment.

### What worked

- Files 8→6, Agenda 35→34 and Editor 376→376 explicit sites with either proof mode.
- The linked modules validated in all three modes. Baseline output matched byte for byte.
- All 1,071 synthetic cases and 20 app or source-derived calls matched expected behavior. The synthetic suite covered 19 deliberate traps. Files samples ran 225→29→29 checks, Agenda 43→34→34 and unmodified Editor helpers 22→22→22.
- In the isolated marker helper the chained mode removed four sites and the five samples ran 45→45→0 checks. Four successful queries inspected 39 edges, with a maximum of 11.
- A 32-inspection budget retained the six-edge synthetic example and it executed one check. A 64-inspection budget completed its 43-inspection proof and executed none.

### What didn't work

- The initial `node "$ticket/scripts/bounds/run.mjs"` reported `AssertionError [ERR_ASSERTION]: Values have same structure but are not reference-equal` on two byte-equal `Uint8Array(1342)` values. Node's deep equality compares typed arrays' realm prototypes. Comparing host `Buffer` copies established the intended byte equality.
- An intermediate `node "$ticket/scripts/bounds/run.mjs" --linked` returned `SyntaxError: 16:55: unknown function editorWhitespace` while compiling the standalone Editor contract probe. The function slice ended at `editorMdNextMarker` and included intervening `editorMdListEnd`, which calls `editorWhitespace`. Narrowing the slice to the intended `editorMdMarker` function corrected the test.
- No transitive proof removed an additional site from unchanged source. The measured obstacle was missing relations and conservative effect invalidation across app boundaries.

### What I learned

The Files comparison workload amplified two static checks into 196 removed executions. The Editor result needs an explicit representation of validated spans or relevant effect summaries before a larger proof budget can matter. Enlarging the search alone generated additional work with identical code.

### What was tricky to build

The alias tests had to keep the attempted read address within linear memory so engine bounds checking could not hide an erased object check. I used one shared address for a record and a text header and a four-byte offset alias for a buffer whose first payload unit overlaps the text header.

### What warrants a second pair of eyes

Review whether the induction invariant is valid when the loop condition contains a short-circuit call, and whether every callee, store and rebind that can invalidate metadata appears as a barrier. Confirm that source-derived results remain distinguishable from untouched app results.

### What should be done in the future

Measure per-site hotness through complete app replays and decide whether a direct typed proof or relational facts at selected helper boundaries justify their on-device cost. Real device compile latency and peak storage remain open.

### Code review instructions

Run `node "$ticket/scripts/bounds/run.mjs" --linked` with the existing reactors in `picocalc-os/build/`. The no-argument command runs the portable host cases and body survey. Compare `corpus`, `budgets` and `dynamic` in the receipt. Source line mappings are recorded for concatenated apps.

### Technical details

The standalone runs use one fresh Wasm instance and one 64 KiB linear memory per replay variant. The counter is a separate exported global. No proof depends on measuring wall-clock runtime. Linked validator success confirms binary structural validity, while direct app calls supply the recorded differential evidence.

## Step 4 · Prepare the research handoff

I drafted the article around a single signed index and exclusive endpoint, then rebuilt its examples and tables from the receipt. I used the skills' second reading pass to clarify the boundaries between linked validation, standalone dynamic measurements, and the deliberately guarded Editor probe.

### Prompt Context

**User prompt (verbatim):** [Supervisor diary, Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).

**Assistant interpretation:** Provide vault-ready research prose, detailed working notes and enough reproduction context for independent review.

**Inferred user intent:** Preserve a technical explanation that can stand on its own and report negative results as evidence.

### What I did

- Wrote `various/reports/bounds.md`, including the worked graph, pseudocode, primary sources, hypotheses, results and next compiler experiment.
- Cross-checked quantitative claims against `various/bounds/results.json`. Repeated the linked run and used `cmp` to verify byte identity of the new JSON receipt with the committed one.
- Saved the source audit and second-pass observations in [bounds-notes.md](bounds-notes.md).
- Sent the supervisor the exact linked bytes, dynamic counts, commit and contract experiment.

### Why

The article needed to explain the semantic obligation first so that a reader could interpret the later zero marginal yield without treating it as evidence that relations always fail.

### What worked

The handoff contains the original emitter references, data and reproduction paths. The report identifies the host scope and the additional guard in the contract probe.

### What didn't work

No additional documentation failures were observed. Hardware measurements remain outside the evidence of this experiment.

### What I learned

The clearest contrast in this corpus is between seeing `i < end` and having a valid proof about the same receiver header at the access. Solver depth only matters once those facts can flow through the existing program.

### What was tricky to build

The proof experiment and the proposed device adoption use different costs. Metrics for accepted proofs are compiler edge inspections and omitted Wasm checks. Actual target compiler allocation and runtime latency need their own experiments.

### What warrants a second pair of eyes

Check the sample derivation, table boundaries and proposed next experiment without relying on the diary. Compare the selected results with the saved receipt.

### What should be done in the future

The supervisor owns independent review and publication. Any additional findings should be appended as a later investigation entry.

### Code review instructions

Read the report's worked example, then inspect the implementation and the budget fixture. Recompute counts directly from the receipt when checking totals.

### Technical details

The vault-ready document is `various/reports/bounds.md`. The report contains Obsidian frontmatter, clear evidence boundaries, Mermaid source, independent primary links and repository-local reproduction commands.

---
Title: Investigation diary for streamed bounds admission
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: reference
Intent: long-term
Topics: [picocalc, esp32-p4, performance, native]
---

# Streamed bounds admission investigation diary

## 2026-11-20 — Step 1. Freeze the proof, policies and evidence

### Prompt Context

The operator was asked to measure an analysis decision made when one function completes, during ordinary streaming. The comparison must keep its proof engine fixed while changing the decision to run it. The director held a separate program until the policy froze. The request also required an independent Claude Opus High design, a working prototype, a technical report, and evidence from a physical PicoCalc.

### What I did

I sent a scoped tool-free design request with `claude -p --model opus --effort high --tools '' --setting-sources ''`. The user had approved these compiler materials for Anthropic. The invocation sent compiler design context and contained no UART transcript or credentials. I wrote the operator design and hashed it before the holdout. The completed independent response is preserved under `sources/01-bounds`.

### Why

The installed compiler owns only the current numeric function body while it lowers. It can decide whether to analyze a checked tape with its cell count and parameter types. The source-order comparison and the eligibility gate share exactly the same 640-cell budget. Altering either rule after seeing the held-out program would give a different experiment.

### What worked

The director recorded SHA-256 `eda8bea8164b6dd1365707ba397029bf979093326a28d86d4ba6f63572367a78` for the operator design before disclosing the holdout. Independently, Opus identified the same conservative effect barriers and separated proof opportunities from analysis charge.

### What didn’t work

The independent design proposed an exact upper bound on removable guards and proportional budget credit. The installed frontend supplied neither counter in its normal signature, and the fixed experiment used cheaper available inputs and a fixed cap. I kept the frozen gate. No outcome was used to modify it.

### What I learned

The signature asks whether a tape could use a string or buffer, whereas the proof asks whether it actually repeats a validated receiver/index pair. Those conditions are different, and the chosen feature enables false-positive analysis.

### What was tricky to build

The operand tape contains numbers in both opcode and immediate positions. A decoder must advance by each correct instruction width. Pattern matching at arbitrary numeric offsets could read an operand as an opcode.

### What warrants a second pair of eyes

Inspect the guard width, all side-effect barriers, the fresh value assigned after a local write, and the lifetime of an altered tape. Trace both a trapping first access and an intervening write to an aliased header.

### What should be done in the future

A separate experiment could install the exact upper-bound feature before admission and compare its unconditional counting cost to the saved proof work. This experiment never mutates the held-out thresholds.

### Code review instructions

Compare the frozen design to `scripts/01-bounds/analysis.inc`; compare `01-stage.mjs` to the ordinary RV32 function callback. Check that the altered tape is cleared immediately after lowering along with the compiler's original tape.

### Technical details

The SHA-256-locked held-out source is `98321148a3451e5574001fbc15d0e95ea161e66def826f421d67addf857a9d7f`. A neutral runner changes only compiler inputs, versioned interpreter choice, and receipt/export handling. The production tree is not changed.

## 2026-11-20 — Step 2. Qualify the pass and the earlier graph proof

### Prompt Context

The director asked to replicate the admission rules against the original two-guard Editor engine, while keeping the new straight-line proof and old relational fact search distinct.

### What I did

I staged the production backend in memory. I ran the exact director oracle and 243 directed differential states for each of eight arm compilations, with independent expected returns and byte buffers. I compiled current Chess, Editor, and the smooth painter in fresh Node JS contexts. For the old engine I kept its original expression and fact tracking and moved only each read's bounded search to the current function's finish callback. A read stores its immutable fact-array reference and its already versioned index and length IDs. The search marks the original operand so lowering can see the result.

### Why

The old engine learns relations while parsing. Its final tape size is available only after that function, so deciding before parsing would require an earlier estimate or a second pass. Moving only the search preserves the old compiler's access and lifetime model while applying the locked decision at a real emission boundary.

### What worked

All arms matched the 1,603 holdout expectations, including 101 traps. Every holdout output was byte-identical in bounds arms because none of its guards is redundant under this proof. The positive repeated-read fixture removed two guards with every enabled policy. On old guarded Editor, deferred always and never exactly match the original bounded/current native SHA-256. Always found one read in `editorPreviewAppend`, saving 16 bytes. Both budget policies passed over that opportunity.

### What didn’t work

The director's original RV32 interpreter did not support the SLLI used by the other lane. I used the already reviewed interpreter from the PIE study for all paired arms. The baseline interpreter step total still matches the original oracle receipt. The first hand-written directed fixture used unbraced assignment in an if arm and an incorrect intrinsic name. The Typed parser rejected it. I corrected only the operator-authored fixture.

### What I learned

The old Editor candidate spans 263 cells. Selected rejects it independently of available credit. Source order is also allowed to exhaust credit on earlier eligible functions. In that old-engine trial the budget gates only proof search. Fact collection, per-read snapshot capture, and the old local loop lookahead still run. Search counts cannot be treated as total analysis cycles.

### What was tricky to build

The recent checked tape and the old compact read opcode encode checks differently. The supplemental experiment uses the original compiler sources rather than trying to rediscover two-source-guard relations in today's checked tape.

### What warrants a second pair of eyes

Inspect `BoundsFacts.proves` and confirm it observes only the captured facts and passed IDs, along with counters. Verify the old engine uses persistent arrays, so snapshots remain valid when later assignments replace the current array.

### What should be done in the future

Keep the old loop lookahead in any reproduction of the original result. Replace the fact collection path only in a separately controlled study of more general control-flow proof costs.

### Code review instructions

Run `02-heldout.mjs`, `03-host.mjs` and `06-prior-engine.mjs` using the ticket's reproduction notes. Inspect `various/01-bounds/older-editor.json` for the exact current/always identity and proof-site counts.

### Technical details

The original guarded Editor source has SHA-256 `2931cb22790b7eebf1a29e9071b7e3b17a0ff31dd6e41bedbea7a68e7ed4626f`. It is distinct from the current 69,884-byte Editor build. The old engine's native sizes are 64,856 and 64,840 bytes. The new study uses the normal streamed path and never reaches back to a previous function.

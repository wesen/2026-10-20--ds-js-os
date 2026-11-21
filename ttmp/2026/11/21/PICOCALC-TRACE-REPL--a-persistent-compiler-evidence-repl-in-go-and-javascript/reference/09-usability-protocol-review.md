---
Title: Pre-registered usability protocol review
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Pre-registered usability protocol review

This critique reviews three sets of documents. The first is `01-running-blind-compiler-engineer-persona-sessions.md`, including the scientific-decision rubric in its section `Protocol revision after the task was clarified`. The second is the common brief `brief.md`. The third is the five task cards: `catalog.md`, `pass.md`, `ablation.md`, `allocator.md` and `optimization.md`. It reports no results, and no receipts were examined. The cards stay as written. Every amendment below changes the supervisor's key, the protocol or the harness, never a card. The participants are independent runs of one language model.

## Evidence units

| Unit | Meaning in this round | Cards |
|---|---|---|
| Compiler pass observation (event) | One archived record of one pass's print for one unit of work, identified by its original ordinal in the archive | `catalog.md`, `pass.md`, `allocator.md` |
| Static instruction site | One instruction in one printed function, counted once however often it executes | `pass.md`, `allocator.md` |
| Executed instruction | One instruction executed during emulation of the workload, counted on every execution | `ablation.md`, `optimization.md` |
| Receipt wall time | Elapsed time of a participant run, including model inference | None. It cannot measure the compiler or the service. |

## Sound as written

- Units are named, and the key must state the expected unit.
- A success applies only to one participant run, the shipped interface and this fixture.
- The compiler-log verifier `01-check-evidence.mjs` is independent of the service.
- A failed query is not accepted as evidence of absence.
- A prospective change stays a hypothesis until a matched experiment executes it, and design is scored separately from validation.

## Amendments required before the first scored session

### A. Filtering

1. For `catalog.md`, the key records the archive total and the checked-build total as separate numbers. It also records the per-phase counts and the rule that assigns an event to a phase. For ordinal 74 it records the ordinal space, the pass, the unit of work and the event's position after any phase filter. Test V4.
2. For `pass.md`, the key records the matching rule for a direct i32 load through the first argument's address and the rule that classifies a print as whole-function. It also records the two positions, their counts, and every event between them with its kind. A participant run names the responsible pass correctly only if it accounts for the intervening events. Test V4.
3. For `allocator.md`, the key lists every virtual-register rewriter occurrence in the checked row's backend. Each entry gives the original ordinal and the machine-function property as read from raw bytes. Test V4.
4. For `ablation.md` and `optimization.md`, the key states the region counted (row kernel or whole program), the denominator for the percentage change, and the rounding rule. It also lists the existing candidates the archive holds. Tests V4 and V5.

### B. Blindness

1. No key value or conclusion may appear in `q.help()`, in any help topic or in archive metadata. Test V7.
2. Bindings and any named-query registry must be scoped to the session within the shared in-memory archive. Test V8.
3. Record REPL binding behaviour as cued, not measured. Two passages point to it: the sentence in `brief.md` on reusing a name in a new evaluation, and the last sentence of `catalog.md`.
4. When versions are compared, strip build identifiers from receipts before scoring, so scorers do not know which version produced a receipt.

### C. Truth keys

1. Freeze the key and the rubric before the first session, then hash them and record the time. Test V3.
2. `01-check-evidence.mjs` must recompute every key value that comes from a compiler log. Test V4.
3. The protocol has no independent verifier for dynamic summary JSON. Record each JSON file's hash and the emulator command that produced it. A second supervisor then recomputes the `ablation.md` and `optimization.md` values from the JSON, outside the service. Tests V4 and V5.
4. Each request whose evidence may be absent needs a positive inspection, recorded in the key before the sessions. Test V6. The inspections are:
   - for `pass.md`, debug-location metadata in the raw logs
   - for `ablation.md`, per-PC counts and an image identity in the dynamic summaries
   - for `allocator.md`, runtime spill execution data
   - for `optimization.md`, any compiled build of the two-register cache

### D. Scope

1. Article claims are limited to the named participant run, the build revision and the archive hash.
2. Static site counts support no claim about executions. Executed-instruction counts support no claim about cycles or time.
3. One run per card is descriptive only. Pre-register the following:
   - the number of repeats
   - pairing by card
   - the comparison statistic, for example the paired mean difference per rubric property with a bootstrap interval over cards, as in the homolog-bench playbook (§16)
   - the unused scenario
   - the second model
4. State whether `allocator.md` is the unused scenario, and confirm that it is not read during fixing.

### E. Rubric

1. Define the scale as met, partly met, not met or not elicited. Write an anchor for each property on `optimization.md`.
2. Measured premise is met only when the number appears in a tool reply in the same receipt, together with its unit, region and workload. A correct number without such a reply scores not met.
3. Controlled validation scores the design. If no matched build exists in the archive, any claim that the change was validated in session is scored as an unsupported claim.
4. Freeze and hash the rubric before the first `optimization.md` session. Label rubric scores on the discovery cards as post hoc.
5. Two scorers score every receipt independently before reconciling. Test V13.

### F. Harness and classification

1. State the wall-time ceiling as a number, next to the 14-call ceiling.
2. Store in the receipt the full reply behind each abbreviated display. Test V11.
3. Split `evaluator defect` into `service evaluation defect` and `scoring defect`.
4. Add a `silent incorrect result` flag. It ranks above wasted calls, in line with the protocol's existing priority for demonstrated incorrect results, and it requires a reproduction at the normal entry point.
5. Hidden reasoning is discarded, so `erroneous persona interpretation` rests only on the final answer and the calls. State this limit in each such classification.

## Verification tests for the supervisor

| ID | Test | Pass condition |
|---|---|---|
| V1 | Before the round, record `git rev-parse HEAD`, `git status --porcelain` and the server executable's SHA-256 | The `--build` value in every receipt equals the recorded revision, and the executable hash covers any pending changes |
| V2 | At round start and end, record the archive file hashes, the tmux service PID and its start time | All values unchanged |
| V3 | Before the first session, hash the key and rubric files with a timestamp. Rehash them at scoring. | Hashes equal |
| V4 | Run `01-check-evidence.mjs` and compare every compiler-log key value. Recompute the dynamic-summary values with a separate script. | Every key value is reproduced, and SHA-256 checks are reported for every log |
| V5 | Compare the build commands and inputs of the two LSR arms and of any candidate used in `optimization.md` | They differ only in the intended setting, and output equivalence is recorded |
| V6 | Inspect the raw logs and summary JSON for each possibly absent observation listed in C4 | The result is recorded in the key before the sessions |
| V7 | In a disposable session, capture `q.help()` and every topic it lists. Search them and the archive metadata for key values and conclusion wording. | No match |
| V8 | Session A binds a variable and, if the API supports one, registers a named query. Session B checks for both. Then delete A and evaluate in B. | B sees neither, and B still evaluates |
| V9 | In one session, bind a value in one evaluation and read it in the next | The value is returned |
| V10 | Inspect Pi's tool declarations and working directory. Attempt a 15th evaluation in a disposable run. | Only `trace_eval` is declared, the directory is empty, and the 15th call is refused and recorded |
| V11 | Through the runner path, evaluate an expression whose reply exceeds 4,000 characters | The abbreviation message appears, and the receipt holds the full reply |
| V12 | Compare each receipt's reported provider, model ID and thinking level with the pre-registered values | Equal |
| V13 | Two scorers score all receipts against the key and rubric independently | Disagreements are recorded per property before reconciliation |

## Recommendation

Score no session until amendments A to F are recorded and tests V1 to V12 pass. V13 applies at scoring. Report any failed test with its exact output in the round record. Treat any session run before a failure was fixed as exploratory.

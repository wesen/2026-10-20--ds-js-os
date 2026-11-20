---
Title: Bounded Divisor Analysis Investigation Diary
Ticket: PICOCALC-BOUNDED-FACTS
Status: active
Topics:
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:24:07.913865469-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded Divisor Analysis Investigation Diary

## Step 1. Choose a measurable fact before looking at Editor

I traced numeric operation emission and the signed arithmetic lowering in the frozen compiler. I inspected Files and Agenda as training programs. The production AST-free frontend emits one array of opcodes and operands, then hands the function to the RV32 backend. The backend gives this study a result that can be counted exactly, since it emits explicit trap guards for signed division and remainder.

I launched the requested Opus high researcher with an isolated working directory, disabled tools, and the minimum relevant source-derived architecture and workload details. I sent the supervisor the planned Agenda and Editor board matrix. I held Editor out of source inspection and analysis.

### Prompt Context

**Research brief excerpt (verbatim):** “Prototype the three analysis policies on one useful class of facts. Record analysis time, peak bytes, and which generated instructions or dynamic checks actually disappear.” The brief’s deliverable reads “A comparison on a held-out workload. Preserve the negative result if selective analysis costs more than it saves.”

**Assignment context:** The supervisor relayed the user’s requirement that each researcher commit a detailed newcomer design before implementation. The design freezes the held-out app and workload, the policy and budgets, the comparison and the prediction.

**Assistant interpretation:** Use signed literal or provably constant divisors for a bounded per-function analysis experiment, with production, always and selective policies.

**Inferred user intent:** Establish whether a cheap function classifier predicts where analysis pays on a real unseen workload.

### What I did

- Read production arithmetic emission in `picocalc-os/compiler/typed-rv32.js` and the numeric emitter in `picocalc-os/compiler/typed-wasm.js` at `40bcf850a5809ef6d839127869faa952596ed157`.
- Read arithmetic sites in the training Files and Agenda sources. Agenda includes literal divisors, while its formatter also divides by a variable named `scale`.
- Ran `claude -p --model opus --effort high --safe-mode --restricted --strict-mcp-config --tools '' --no-session-persistence --output-format json` against an isolated empty directory with a narrow architecture and training-only prompt.

### Why

- A signed division always emits a divide-by-zero guard and an overflow guard for the one nonrepresentable quotient. A divisor proven to be neither zero nor minus one discharges both. Signed remainder requires only the zero guard.
- Earlier bounds work removed no Editor text checks. Signed integer arithmetic gives this comparison a separate opportunity to observe exact guard and word counts.

### What worked

- Established the control revision, normal native wrapper paths, and a training app with useful arithmetic sites before implementing.
- Identified a deterministic Editor preview fixture from the pinned workflow harness without reading Editor implementation or measuring new policy outcomes.

### What didn't work

- The initial default-sandbox Opus invocation had produced an empty result file when the supervisor asked me to interrupt it. Interrupting returned exit code 130. I requested and received automatic approval for a separate generic prompt about a fictional compiler with public instruction semantics and no project information.

### What I learned

- The zero guard emits two words. The overflow guard emits seven, including the two-word construction of INT32_MIN and the two words emitted by the branch helper. A division proof must distinguish known zero, known minus one, all other constants, and unknown values. The corresponding remainder semantics differ at minus one.
- A phase timer for host JS answers a different question from the P4 compiler allocation and elapsed-time counters.

### What was tricky to build

- Opcode boundaries must be decoded. Reading the immediately preceding raw array cell as an opcode could confuse an immediate with an instruction.
- Production streaming clears each operation array after lowering. The proposed facts must leave scope on the same path to preserve that lifetime.

### What warrants a second pair of eyes

- Check exact treatment of conditional writes and mutable locals. Verify a divisor proof describes the top operand at the arithmetic site and survives no assignment that invalidates it.
- Check that policy selection and outcome generation use separate CLI invocations and that Editor measurements first appear after the prediction commit.

### What should be done in the future

- Build and run the arithmetic fixture and training apps after the design commit. Stage qualified compiler assets for the supervisor’s board session.

### Code review instructions

- Read the eligibility and proof rules in the design. Compare them to the production `FunctionEmitter.expr` and `FunctionCode.binary` before following the implementation.

### Technical details

- Production gains from proving a nonzero remainder divisor remove two RV32 words at a site. A division by a known nonzero divisor other than minus one removes nine guard words at a site. Output sizing excludes the fixed reactor slot.
- The held-out source is the pinned Editor assembled by its existing source list. The held-out input comes from the existing long inline preview workflow.

## Step 2. Freeze the implementation and held-out protocol

The approved generic Opus high run returned 23,652 characters of substantive design. Its terminal summary reported an error after an interrupt landed at completion. I extracted the returned assistant text and applied its two-pass proof and root-write argument to the actual compiler. The pinned board runner, app choices, cost model and numerical caps are local adaptations.

### Prompt Context

**User prompt:** See Step 1. The design and held-out protocol precede implementation.

### What I did

- Read the returned generic design twice. In the second pass I added the actual numeric cell representation, guard word counts and exact held-out app source and device workflow.
- Replaced the generic proposal to optimize certain traps with a narrower rule. The experiment only removes guards proved impossible.
- Added a provenance receipt without proprietary content, chat data or account credentials.

### Why

- The proof needs no allocated instruction decode. The functions already provide numeric cells with known widths.
- The parser already recognizes signed division and remainder. Its one-bit indicator gives Select a cheap reason to admit a function before decoding.

### What worked

- Read Opus output with the two-pass proof, the legality argument and the edge-case battery from its completed assistant message.
- Docmgr found no open metadata validation problems after switching to existing vocabulary.

### What didn't work

- The CLI result ended with `error_during_execution` and a diagnostic recorded in the receipt. The assistant output is complete through the correctness section and cut off during measurement. I wrote the concrete measurement protocol locally. The generic design’s suggested trap-kind discrimination requires a different emulator exit interface, so the production comparison observes the required trap occurrence.

### What I learned

- The most consequential adaptation is separating static omitted words from dynamically executed guard instructions. The latter depends on the operand actually used and the conditional branch direction.

### What was tricky to build

- The generic proof’s suggested folding involved an allocated decoded representation. The PicoCalc versions must share the same original per-function numeric operation array, so the proof reads a three-operation window without rewriting it.
- Verify a root-level write precedes a read even though ordinary typed declarations already encode that order.

### What warrants a second pair of eyes

- Review both proof passes for slot and site bounds, and verify that the numeric-operation decoder can reject unknown encodings without affecting normal compilation.

### What should be done in the future

- Commit measured training results and the numerical prediction before unblinding Editor.

### Code review instructions

- Read the intern design from the introduction through the concrete measurement protocol. The source and device fixture in the preregistration are fixed.

### Technical details

- Always and Select both attempt the same two-pass proof after admission. Select charges twice the numeric cell length and may admit a later smaller function after an earlier skip.
- Two official instruction specifications confirm why guard predicates differ between signed division and signed remainder.

## Step 3. Qualify training builds and commit the prediction

After the study resumed, I ran the three overlays through the real Files and Agenda wrappers and separately counted raw instructions. Files produced identical binaries and selected no functions. Agenda preserved all divide and remainder instructions while dropping 45 guards and 160 total words. Select spent 4,284 charged visits against 10,558 for Always.

### Prompt Context

**User prompt:** See Step 1. The pause preserved the verified design commit and generated overlays. The resumption instruction authorized the named GPT researcher for the remaining experiment.

**Commit (design):** `6d4c512` — Preregister bounded divisor analysis on PicoCalc.

### What I did

- Constructed isolated control, always and select compilers from pinned production bytes with `scripts/01-stage.py`. Added a width-aware two-pass proof and streamed scratch ownership.
- Isolated control, training and held-out inputs in the harness. The training input invocation copies Files and Agenda only.
- Validated exact wrapped hashes, observed and clean mode equivalence, streamed and buffered equivalence, static instruction counts, and the charge limit with `scripts/03-qualify.mjs`.

### Why

- The emitted machine word and trap counts independently validate the proof observation callback. The linked ELF verifies the normal linker and wrappers still accept the output.
- Recording the prediction in a separate commit makes the test date and frozen code independently inspectable.

### What worked

- All three Files hashes were identical. Both proved Agenda images matched and preserved all 33 arithmetic instructions.
- The static word differences reconciled exactly as two words per zero guard and seven per overflow guard.

### What didn't work

- The first training harness used Node `execFileSync('git', ...)`. The sandbox returned `spawnSync git EPERM` despite an exit status of zero. I moved source extraction into the repository’s existing Python-and-Git staging approach.
- The optional authorized project-specific Opus follow-up exited 124 at its time limit. The original Opus-derived design commit remained the experiment contract.
- The default Git sandbox would not create `.git/index.lock` and reported `Read-only file system` when committing the design. The approved retry committed the intended ticket files.

### What I learned

- The workload-independent parser predicate excluded all 25 Agenda functions containing no divide or remainder. Both enabled policies spent proof time on the same nine potentially useful functions.
- Guard words and run-time instructions have different units. The correct arithmetic still runs at every reached site.

### What was tricky to build

- A previous operation can end at an immediate cell whose numeric value equals an opcode. The candidate advances by decoded width and compares a proof offset to the exact backend cell index.
- Repeated writes invalidate a slot even when the second write happens in a branch a particular test does not take.

### What warrants a second pair of eyes

- Verify the input extraction matches CMake concatenation.
- Review the pre-result prediction against the recorded source and compiler hashes.

### What should be done in the future

- Open the held-out workload and hand the separate output hashes to the board supervisor.

### Code review instructions

- Run `scripts/00-inputs.py OUT training`, `scripts/01-stage.py LANES`, then `node scripts/03-qualify.mjs LANES REACTORS OUT training` from the repository root using the ticket-relative paths.

### Technical details

- The arithmetic proof scratch uses 1,280 explicit array bytes per admitted function. The host profile hook records charged cells and elapsed helper time separately.

## Step 4. Open Editor and reconcile exact guard removals

After committing the prediction I staged the pinned Editor and checked that its concatenation matched the native CMake build byte-for-byte. Control emitted 21,886 words and both analysis policies emitted 21,803. Always admitted 118 of the 120 functions. Select admitted seven and charged 4,278 cell visits, 7.04% of Always’s 60,740.

### Prompt Context

**User prompt:** See Step 1. The held-out result decides whether the frozen selector transfers.

**Commit (pre-unblinding):** `6e9a637` — Freeze bounded-analysis training and the Editor prediction.

### What I did

- Ran `scripts/00-inputs.py OUT held-out` and `node scripts/03-qualify.mjs LANES REACTORS OUT held-out` through the native typed-world wrapper.
- Compared instruction-image hashes, linker outputs and buffered versus streamed output. Counted all div, rem and trap words independently from the analysis log.
- Sent the supervisor exact candidate lane paths and the three app ELF digests for separate physical measurement.

### Why

- An ELF with a fixed-size code section can conceal a change in generated words. The raw instruction image exposes that change while the digest validates the full bundle.
- Each arithmetic site records its own guard removals. A count mismatch would indicate a compiler or harness fault.

### What worked

- Always and Select omitted the same 17 zero guards and seven overflow guards. The measured reduction of 83 words equals `2 × 17 + 7 × 7`. Both matched their own streamed and buffered builds.
- The observed 83 words fell within the forecast range of 1–150. Select captured 100% of the reduction within its 32,768-cell budget.
- The source hash and fully linked ELF hashes are recorded in `various/host-editor.json`.

### What didn't work

- No causal end-to-end timing estimate followed from the rotating host timings. The per-block differences varied in both directions. Device trials are a separate part of the experiment.

### What I learned

- The complete typed Editor has 120 functions, including two over the cap. Only seven contained signed division or remainder. Those seven accounted for every supported omission in the hold-out.
- The larger app offered fewer static savings than Agenda. With these workloads, site mix predicts useful proofs better than module size alone.

### What was tricky to build

- The native build appends one newline to every entry in Editor’s source list, including the last. The host test asserts identity with the prior native build’s assembled input.
- The raw image hash changes even though the reactor length remains fixed.

### What warrants a second pair of eyes

- Compare the committed forecast to the source staging and output receipts in Git history.
- Verify board output against the wrapper-produced ELF digests for its compiled reactor assets.

### What should be done in the future

- Qualify the arithmetic semantics with a different executable path and compare physical end-to-end cold metrics.

### Code review instructions

- Look at `outputs.editor` and `samples.editor` in `various/host-editor.json`. Use `stats` to attribute the raw word savings to functions and arithmetic guard types.

### Technical details

- Control Editor link SHA-256 is `aaf6a21421643c5dbbd9c24379c404698dcf5633f18a9883a3c7906ccefa1f50`. Always and Select link SHA-256 is `06a85ff63c94a9d193a9136f92a2250e6725c5f9df830e9c00aa643d96503944`. All linked files are 240,452 bytes.

## Step 5. Exercise returns, traps and proof limits in emulation

I linked the generated RV32 programs into a minimal ELF harness and ran them in the project’s CJI RV32 emulator. A separate WebAssembly execution established the expected arithmetic values. All policies agreed on 733 returning inputs and the required trap at each of 16 isolated vectors. All eight Agenda dates returned the same weekday as the WebAssembly instance.

### Prompt Context

**User prompt:** See Step 1. Verify ordinary program behavior and measure guest instructions where possible.

### What I did

- Added an arithmetic fixture with positive and negative literals, signed overflow, division and remainder by zero, runtime divisors, bounded loops, local mutation and nested control.
- Generated a separate cap fixture for the 128-local and 128-site limits, 2,048-cell function cap and 32,768-cell module budget.
- Generated Wasm expectations and native assembly with `scripts/05-guest-inputs.mjs`. Linked and ran each entry with `scripts/06-run-guests.py`.

### Why

- Native image acceptance alone does not establish that the zero and overflow traps behave correctly. Giving each expected trap its own guest invocation ensures an early trap cannot satisfy a later case.
- A signed divide produces the same mathematical result with and without provably dead guards. A mutation or control-flow bug can lead to a false proof, so the fixture includes those conditions.
- `entryWeekday` executes an actual Agenda calendar kernel with different month-loop paths and nearby leap-year boundaries.

### What worked

- Each policy matched the arithmetic and Agenda result digests. Every separately launched trap produced an emulator breakpoint report.
- The fixture confirmed direct literal, negative literal and single-write local proofs. It also confirmed safe fallback when a local exceeded the table, a function exceeded the scan cap, and a later smaller function could fit after repeated budget skips.
- The Agenda emulator retired 3,719 instructions across the eight calls with Control, and 3,328 with either candidate. The count includes the same harness across all variants.

### What didn't work

- The first fixture declared an inner local with the same name as an enclosing local. Production rejected it with `SyntaxError: 19:25: duplicate local d`. I gave the inner local a distinct name. The earlier design assumed legal nested shadowing. This is a fixture correction, and the compiler overlay and prediction commits were unchanged.
- The emulator signals both arithmetic traps through the same machine breakpoint. The receipt records the WebAssembly cause separately and validates the observed native trap occurrence.

### What I learned

- The local-slot proof is exercised by the fixtures. Every guard omission in the three shipped applications came from a literal producer.
- An omitted guard can save a different number of retired instructions from its static length because the guard contains a conditional branch. `entryWeekday` saved between 23 and 81 retired instructions per date.

### What was tricky to build

- The negative literal matcher recognizes a local window of two integer pushes and subtraction. The actual arithmetic retains the wraparound semantics and is still executed by the guest.
- Slot limits and work limits are independent. The limit fixture exercises each one separately and asserts remaining work never becomes negative.

### What warrants a second pair of eyes

- Inspect `parameterThenConst`, `conditionalWrite`, `loopWrite`, `nestedLocal` and `valueControl` in the fixture to confirm that each case exercises the intended proof boundary.
- Review that the Agenda instruction counts include exactly the same measurement harness for Control and both candidates.

### What should be done in the future

- Add the physical measurements and state the exact candidate replay scope once the supervisor returns them.

### Code review instructions

- The per-varying-policy comparisons and emulated dynamic counts are in `various/rv32-guests.json`. Run the fixture generator and then the verifier using the SDK’s RV32 GCC and CJI emulator.

### Technical details

- The arithmetic output digest was `8ac3600584cdac84590055039b5fc2462160fafbc9560f9fbfb719c52cb03e05` under all three policies.
- Agenda’s eight return values, in preregistered date order, were 5, 5, 2, 3, 4, 2, 1 and 5.

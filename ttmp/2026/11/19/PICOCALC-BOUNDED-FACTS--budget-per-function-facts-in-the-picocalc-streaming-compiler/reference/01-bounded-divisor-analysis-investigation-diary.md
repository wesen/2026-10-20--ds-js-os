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

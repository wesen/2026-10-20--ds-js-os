---
Title: Editor await investigation diary
Ticket: PICOCALC-EDITOR-AWAIT
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Chronological compiler, host and device investigation for one real Editor await.
LastUpdated: 2026-11-19T22:11:51.637166756-05:00
WhatFor: ""
WhenToUse: ""
---

# Editor await investigation diary

## Step 1: Trace the real file-read wait and preregister the trial

I traced Editor Open from the Files ask to the native read and through the settlement dispatcher. The experiment covers that read in typed source and resumes into the existing normalization policy. I designed a physical cancellation stimulus after finding that the kernel serializes the Editor's normal mailbox while its first turn remains open.

### Prompt Context

**Study specification (verbatim):** “Compile one real await end to end. Scope G. Take Editor Open from typed source through suspension and native resumption. Determine which locals must survive the wait, generate the continuation, then compare it with the hand-written implementation on success, failure and cancellation. Record saved fields, frame bytes, code size and compile time. One complete workflow is a substantial result; Find supplies a later independent test.”

**Assistant interpretation:** Compile the real `typedSdkFileRead` in an isolated firmware and qualify the emitted native continuation when normal file events arrive.

**Inferred user intent:** Measure a single vertical slice while preserving enough evidence to judge whether the same mechanism is suitable for later normalization and Find waits.

### What I did

- Traced `editorOpen`, `editorReadDone`, `nw_on_event`, `native_call`, `fs_defer` and `nat_settle`.
- Read the larger scope G design and the independent Opus High review. I adopted its stale-completion and buffer-lifetime checks. The pilot uses the kernel's existing positive tokens and epoch gating.
- Wrote the [preimplementation design](../design-doc/01-compiling-a-typed-editor-open-into-a-start-and-a-native-continuation.md), including the injected cancel boundary and runtime assumptions.

### Why

The actual disk-control path and imported SDK operations need to execute through the generated code. A mock backend alone cannot establish that a cold device compile preserves that integration.

### What worked

The architecture trace found a single source-level suspension point before the existing normalization slices. The five state values that drive normalization remain in place, leaving the experiment's liveness inference to choose the continuations' saved handle and title length.

### What didn't work

No implementation or trial ran in this design step. The source inspection showed that a normal second mailbox message cannot race a suspended Open turn: `kernel.c` excludes that mailbox while `W->in_turn` is true. The test explicitly injects a cancel event at the loaded native handler boundary.

### What I learned

A positive token identifies one kernel file request and occupies the generated frame. The kernel checks the destination world's epoch before delivering a later result. A file handle is a scalar used after the wait, whereas an event buffer is supplied fresh on the resumed turn.

### What was tricky to build

Cancellation must release the offered grant and clear the frame while allowing the already prepared file operation to settle harmlessly. Changing the normal scheduler merely to make the test easier would prevent a fair comparison of the two app paths.

### What warrants a second pair of eyes

Inspect how the generated code distinguishes immediate failure from a failed settlement and how the native probe ensures one cancellation stimulus cannot select a user file.

### What should be done in the future

Use the observed frame and compile costs to determine whether another study should lower normalization's loop waits and Find.

### Code review instructions

Start at the sequence diagram, then read the linked foreground `editorOpen` and `typedWorldEvent` implementation and the kernel's conditions for choosing a world event.

### Technical details

The existing `WorldState` has 71 fields and the runtime allows 80. The prospective generated frame is 12 bytes. It is separate from the still hand-written normalization continuation.


## Step 2: Generate the Editor file continuation and reproduce both target behaviors

I implemented a one-function source rewriter for a top-level `const ok = await typedSdkFileRead(handle);`. The emitted functions use the existing typed emitter, linker, and reactor ABI. I staged the real Editor source and a matching manual reference for the native firmware and host replay fixtures.

### Prompt Context

**Study specification:** See Step 1.

**Commit (design):** `6f815af` — Preregister the typed Editor Open await experiment.

### What I did

- Added structural parsing, backward liveness, storage layout, and generated start, resume, pending, and cancel functions in `scripts/02-typed-async.js`.
- Used `sources/editor-read-task.typed` to split the real Editor read from the existing bounded newline normalization. The same successful and failed read handlers run after the await.
- Built two physical images with the same staged lowerer, shared await helper, native ELF linker and reactor. The source bytes embedded in the candidate include the original await syntax.
- Added a probe that asks from the ordinary Files world, allocates a real narrowed file grant, and uses the actual filesystem service's read and settlement. At the selected tests it injects a cancel event and an old settlement into the native handler. It suppresses persistent position reads and writes only during its own Editor fixture turns.
- Used the protocol fixture to compare full observable memory against separate controlled expected outcomes in Wasm and the staged RV32 interpreter.

### Why

The file read's successful resume needs the current event payload. A generated continuation that saved the previous phase's references could produce a structurally valid ELF with incorrect effects. The protocol fixture assigns different buffer addresses to the two segments.

### What worked

The rewriter saved `handle` and `size` and used three words including the token. A definite write after the wait kept `overwritten` out of the frame. Both targets agreed over success, immediate failure, negative settlement, wrong and duplicate tokens and cancel followed by reopen. The candidate passed all 24 original host replay checks. Its complete ELF was the same fixed allocation, with 181 more native instruction words.

### What didn't work

- The first build using `scripts/04-stage-board.py` failed with `native_elf_p4.c:239:10: fatal error: mbedtls/sha256.h: No such file or directory`. The probe is compiled under the optional native ELF component, so adding mbedtls only to the main component did not expose its header. I added the private dependency to the optional component and rebuilt both images.
- The first focused run of `scripts/05-verify.mjs` failed at `SyntaxError: 15:65: expected identifier`. The fixture put `return` inside a brace-form `if`. The existing typed grammar uses a single-statement `if (condition) return expression;` for early return. I factored the fixture's write into a typed helper and reran both encoders.
- The physical fixture serializes its cancel injection at the exact post-suspend boundary to avoid relying on a mailbox interleaving the current kernel cannot deliver. It tests observed cleanup and stale suppression with a real file worker, and isolates prior user positions from fixture calls.

### What I learned

A single wait can use its token as the frame occupancy field. The two live scalars still have to survive it. Around that cut, the title's buffer contents have a stable reactor slot while the alias used to fill it can die and needs no stored pointer.

### What was tricky to build

The manual Editor reuses its read token for downstream normalization. The candidate keeps that path while using a separate generated token for the read. Dispatch calls the normalization code before checking the generated task on each kind-4 event, and a matched generated resume can schedule the next normalization turn.

### What warrants a second pair of eyes

Review the tracked `__await` fields and the generated test assembly paths. Confirm the host receives new event and output references in the test, and that app state changes still happen only after an accepted read completion.

### What should be done in the future

Run both fully compiled images on a shared P4. Compare actual normalized success frames, real UTF-8 errors, cancel cleanup, stale suppression and restored factory health.

### Code review instructions

Run `node scripts/05-verify.mjs <study> <firmware-pair> picocalc-os/build/typed-world-reactor.wasm`. Compare the lifetime diagnostic and the buffer-address witness. For the physical source, inspect the read fixture's actual file request and the native probe's narrow injection boundaries.

### Technical details

The state records contain 71 and 74 scalar fields. The full linked Editor ELF occupies 240,452 bytes in each lane. The tested shared compiler is staged A5 and only the candidate typed source contains an async declaration.


## Step 3: Check the real await source with the combined compiler

I staged the final program's scanner and native backend with the same raw Editor source from the independent await experiment. The world wrapper runs the one-await source rewrite before it calls either combined emitter.

### Prompt Context

**Study specification:** See Step 1.

**Supervisor steering:** Check that real await still composes with the final combined compiler and run the full workflow suite if practical.

**Commit (code):** `674f1e6` — Generate and qualify a typed continuation for Editor Open.

### What I did

- Added `scripts/08-compose-host.py` to assemble and hash the shared async front end and the final combined compiler.
- Linked the same physical reactor on the host and counted 12,791 native instructions. The Wasm module was 89,010 bytes.
- Replayed all 24 original checks through the composed compiler and preserved the selected library fingerprints.
- Reconstructed the standalone board overlay in a fresh directory and compared the changed native probe, CMake files and loading wrappers byte for byte against the built tree.

### Why

The await pass runs before the shared operation emitter. Running the real continuation through the combined compiler exercises that boundary beyond the isolated A5 comparisons.

### What worked

All 24 checks passed. The generated frame retained two live scalars and the token. The fresh standalone stage exactly reproduced the source overlays used to build the paired P4 images.

### What didn't work

No failures were observed in the composition run.

### What I learned

The source rewriting pass composes with the new scanner and emitter without depending on the numeric operation encoding or register home policy.

### What was tricky to build

The two host targets share the same world wrapper. The check applies only the await driver to the combined wrapper and passes the same raw async Editor source to each backend.

### What warrants a second pair of eyes

Use the attached input hashes to distinguish the independently measured board comparison from this host composition.

### What should be done in the future

Retain the independent board comparison for measured await costs and use this host composition as evidence about the current integration boundary.

### Code review instructions

Inspect `various/combined-inputs.json` and `various/host-replays-combined.json`. The latter includes every Files, Agenda and Editor case from the fixed replay suite.

### Technical details

The composed Editor kept 74 state fields and a 12-byte asynchronous frame. It produced 12,791 native instruction words and the same 240,452-byte native reactor allocation.

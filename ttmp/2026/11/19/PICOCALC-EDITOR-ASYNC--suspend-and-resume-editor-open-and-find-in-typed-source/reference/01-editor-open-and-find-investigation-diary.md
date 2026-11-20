---
Title: Editor Open and Find investigation diary
Ticket: PICOCALC-EDITOR-ASYNC
Status: active
Topics:
    - picocalc
    - editor
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Record the Editor language and continuation changes and their qualification from revision 289281c.
LastUpdated: 2026-11-19T23:31:00.516106279-05:00
WhatFor: Trace implementation decisions, failures and measurements.
WhenToUse: To review or reproduce the Editor work.
---
# Editor Open and Find investigation diary

## Step 1 — Trace both continuations and predict the state layout

I read the production scope, the single-read pilot and the current Editor sources before changing the app. Open's pending title uses the same buffer as status rendering, so the planned Open flag protects both key handling and rendering. For Find, using an absolute folded offset and an absolute anchor makes it possible to remove two relative coordinates while retaining the current physical line end across waits.

### Prompt context

**User prompt (verbatim, relayed by the supervising agent):**

> do E1-E7 and G1-G4. 
>
>
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation.** Implement the Editor application work in E6, E7, G3 and G4. Coordinate the compiler APIs and hardware qualification with the other contributors. Maintain an evidence-backed account for the final report.

**Inferred user intent.** Use the language features in the complete production workflows and explain their runtime effects to a newcomer.

### What I did

- Traced the source at `289281c` through `editorOpen`, `editorReadDone`, `editorFindStep`, `editorShow` and the native event handoff.
- Used `docmgr ticket create-ticket` and `docmgr doc add` to make the workspace and draft the design before editing application code.
- Coordinated the enum and distinct integer forms with the frontend author and confirmed the actual ambient names and types with the continuation author.

### Why

The 71-field prediction depends on which state the rest of Editor observes. The only external search-continuation dependency is the rendering check for a positive token. The renderer can obtain the same pending information from the generated task, leaving the query and editing UI state in ordinary app fields.

### What worked

The current source and worked examples explain the expected read/yield cadence and all four search ranges. The code inspection found no consumer of the search positions outside the search implementation. The display mark generator independently scans query matches on the visible rows.

### What didn't work

The initial path lookup `rg -n 'typedSdkYield|case NW_SETTLE|next_promise|NW_LATER' picocalc-os/kernel` failed with `picocalc-os/kernel: IO error for operation on picocalc-os/kernel: No such file or directory`. Reading `picocalc-os/nucleus/native.c` found the native turn implementation.

### What I learned

An opening turn needs its own guard even when the compiler has the waiting token. The guard continues to identify ownership while the continuation itself runs. By contrast, rendering a search result only when it is no longer waiting is expressible with the generated pending query.

### What was tricky to build

Search counts U+0130 as two folded units for coordinates consumed by one input unit. The old folded coordinate is relative to the line start. Keeping it as an absolute offset permits the same clamped cursor calculation while requiring one fewer live coordinate. The planned wrap test uses the physical end of each line against the anchor because the anchor cannot lie between lines.

### What warrants a second pair of eyes

Check trailing-newline handling and the case where a wrapped prefix match starts before the anchor and ends after it. Check the title against intervening frames while the normalizer waits, since buffer 2 is shared.

### What should be done in the future

Test direct event injection as well as ordinary kernel workflows. The kernel serializes mailbox messages during the asynchronous turn, so the extra race fixtures must identify their stimuli as direct reactor calls.

### Code review instructions

Start with the [implementation design](../design-doc/01-opening-and-searching-a-document-across-typed-editor-turns.md). Compare the paths in `editor.typed`, `find.typed` and `document-view.typed` at `289281c` before reviewing the migration commits.

### Technical details

The baseline has 71 declared fields and the reactor has room for 80. The prospective combined layout has 71 fields. Open replaces seven with one declared flag, five saved scalars and two generated control fields. Find replaces eight with five saved scalars and two generated control fields.

## Step 2 — Preserve byte identity for cursor coordinates and name the search phases

I landed the distinct coordinate types before the enum so that the E7 checkpoint could be compared directly against the original 88,255-byte Wasm. E6 then changed the representation the source exposes for Find and added one exhaustive match for both active-phase guards.

### Prompt context

See Step 1. **Code commits.** `ed86ba9` — Distinguish UTF-16 offsets and stored code-point columns in Editor. `1357545` — Name Editor Find phases and check every search state.

### What I did

- Declared `Unit` and `Point` in `state.typed` and typed `positionColumn` as a code-point count. Typed the line bounds used by `editorPositionApply` as UTF-16 offsets.
- Replaced Find's numeric states with the six `FindPhase` members. `editorFindActive` uses an exhaustive match to share the range decision.
- Measured each checkpoint under the same compiler and reactor. Ran the original position and search workflows using the pinned E compiler `4eb08cb`.

### Why

The cursor restore operation accepts a code-point column and line bounds in UTF-16 units. Both values take one 32-bit word at runtime, but interchanging them can put the cursor after the wrong character. The Find enum keeps its previous numbers and makes missing phase handling a compile error.

### What worked

E7 produced identical hashes for the Wasm module and raw RV32 instructions at 88,255 bytes and 21,886 instructions. E6 added 47 Wasm bytes and 36 RV32 instructions. Each checkpoint has 71 fields. The positions replay passed with four matching Wasm framebuffers and the same RV32 frames. Short Find, dense miss and tail search also passed on both targets.

### What didn't work

- The first raw instruction measurement called `typedRv32.compile(source, typedWorld.imports)`. It failed with `SyntaxError: input limit exceeded` because the small-program default was in force. The measurement now supplies the same 96 KiB source limit as the world linker.
- Importing the active compiler in the original positions replay initially failed at `typed-async.js:532` with `SyntaxError: Unexpected end of input` while the concurrent compiler implementation was incomplete. I ran the E replay against repository revision `4eb08cb` with the same reactor and host wiring.
- The same Node replay inside the sandbox returned `spawnSync .../build/picocalc-host EPERM` after the child process emitted its capture paths. Running under approved execution allowed the harness to collect its child outputs.
- The first checkpoint design commit attempt returned `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. A scoped approved Git command recorded the checkpoint as `f62cb68`.

### What I learned

Current generated output uses the same four-byte slot for distinct types and for plain integers. The two hashes give stronger evidence of E7's zero-cost conversion promise than matching module lengths alone.

### What was tricky to build

The declaration `type Unit = distinct i32;` makes the old `newline` integer a typed code-unit offset. An explicit `Unit(-1)` preserves the no-newline sentinel at the same boundary as the SDK-produced offset.

### What warrants a second pair of eyes

Check that the column field is converted only at the SDK call, that the row or cursor coordinates do not acquire a distinct type belonging to another domain, and that the enum groups include all four active ranges.

### What should be done in the future

Use the same frozen per-checkpoint corpus when measuring the async app so the enum's additional instructions are accounted for before comparing Open.

### Code review instructions

Review `ed86ba9` for the coordinate declarations, then `1357545` for the phase function. The [measurement script](../scripts/01-measure-editor-checkpoints.mjs) accepts source commit references and compiles them against a single current compiler.

### Technical details

E7's Wasm SHA-256 is `274946940de536b018952c29fd6b9d786d42a13e1961c83ff54a668116745d82`. Its raw RV32 SHA-256 is `f9d5420fea0eb56a2024515204a3babc92389c4f5d81c38f692fe91e1eb2fa25`. Both match the source at `289281c`.

## Step 3 — Suspend Open through the read and every normalization slice

I combined the file read and newline-conversion loop in one typed async task. A successful read remembers the old view before using slot 0 for the new document. The task owns the file grant until it either installs the prepared document or reports a failure and releases it. The application retains the opening guard so input and the renderer stay clear of the buffers while the task runs.

### Prompt context

See Step 1. Open follows the two-phase production scope and keeps the first-frame reply rule from the existing Editor.

### What I did

- Added two static wait sites in `editorOpenTask`, one for the actual file service and one at the top of the normalization loop for large reads. Removed the manual normalizer's read token, mode, offsets and saved offered grant.
- Kept the initial yield before each large slice and the extra timer for the first large frame. Moved the title length to the unused final unit of the pending title buffer, which already has single ownership while opening.
- Used `editorEqual` to test the read error's `no file` prefix with the output buffer, avoiding a chain of repeated code-unit bounds checks.
- Added deterministic direct reactor fixtures for reentrant key input, duplicate completions, early and late failures, empty missing files and an exact normalized save. The fixtures check identical per-event calls and statuses from the emitted Wasm world and native RV32 world.

### Why

The kernel resumes a wait with a fresh event and buffer addresses. The file handle and normalization offsets remain needed, while the typed task can reacquire its document buffer through the SDK. The renderer must wait until the title is copied out of slot 2 because it uses that slot to assemble status text.

### What worked

The Open-only checkpoint passed all 13 original workflows on both targets. It compiled to 88,852 Wasm bytes and 22,186 RV32 instructions, 264 more instructions than the same app immediately before Open. Its `editor.typed` has 177 lines and its state contains 65 declared plus six generated fields. The file-read wait saves the handle, and each normalization wait additionally saves the source length and both offsets.

### What didn't work

- The first draft compiled to 72 state fields and 22,321 RV32 instructions (+399). Keeping the title length in its owned buffer, reducing repeated prefix checks and incorporating the compiler author's state-step improvements produced the accepted measurements.
- During integration, baseline Editor temporarily failed `108:38: expected identifier` at the existing `start` parameter and later `1602:11: expected pending()` on `const pending`. I sent both diagnostics to the compiler author. Making those operators contextual restored baseline byte identity.
- The first per-slice assertion expected the last slice to emit only `sleep 2017` and `return 1`. Both runtimes also issued `release 23` there because this slice installs the new document before requesting the final frame. The last-slice assertion now verifies that exact call order separately from slices 1 through 15.
- The initial generated-source inspection used an unescaped parenthesis in `rg -n '__typed_async_.*('`. It failed with `error: unclosed group`. I used a fixed line window to inspect the generated functions.

### What I learned

The pending-name buffer's unused unit is cheaper than spilling another word before each await and loading it again after every resume. This independently lets the Open-only checkpoint meet the 71-word target. The final frame timer has a different role from the normalizer timer. It covers restore and render after the new grant is installed.

### What was tricky to build

The last source unit allowed by a slice can be CR. The normalization loop checks the full source length before consuming the following LF, so the pair collapses correctly even on the slice boundary. The direct fixture puts CR at zero-based input offset 4,095, splits the first 4,096-unit slice there and checks the entire eventual snapshot.

### What warrants a second pair of eyes

Review the period from `state.opening = true` to the success or failure branch. Each branch must relinquish ownership without exposing slot 2 to a key event or rendering before the title is copied. Review the late timer and duplicate read assertions separately from the normal host replay.

### What should be done in the future

Run the combined Open and Find implementation against the old and generated device images. The injected events establish direct reactor behavior during a suspended operation. Measurements of ordinary P4 input use the physical kernel's own scheduler.

### Code review instructions

Read `editorOpen`, `editorOpenTask` and `editorShow`. The [Open fixture](../scripts/03-check-editor-event-interleaving.mjs) drives the exact same case through the linked Wasm reactor and a separate native RV32 reactor.

### Technical details

The 65,536-byte direct fixture has 851 CRLF pairs. The expected save contains 64,685 bytes. The app receives an ignored key at the read wait and at the first normalization wait, a duplicate successful read settlement, 16 normalization timer settlements and the separate first-frame timer. The test checks the normalized bytes at the syscall boundary.

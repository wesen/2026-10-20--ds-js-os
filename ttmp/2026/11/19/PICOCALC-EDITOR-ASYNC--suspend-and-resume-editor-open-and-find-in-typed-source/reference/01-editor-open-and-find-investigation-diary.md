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

## Step 4 — Replace Find's saved positions and cancel obsolete searches

The final search retains the old candidate filter, four-range order and 1,024-unit work counter. It stores absolute scan and folded positions and one anchor. An accepted replacement Open or a new query clears the old Find frame before reusing the document or query slots.

### Prompt context

See Step 1. **Code commits.** `eb4ef81` — Await the Editor file read and bounded CRLF normalization. `7b321a9` — Await bounded Editor Find and discard replaced search timers.

### What I did

- Gave the async Find task five live scalar locals. Used a separate acquisition of the document and query buffers for each slice and retained the line end across waits.
- Replaced the last manual Find timer test in the event handler with the generated resume call. Used `pending()` in `editorShow` to defer rendering while the search still waits and called it from the dispatcher after a matched Find completion.
- Sent the same synthetic timer to the replacement Open with and without a prior search. Compared every replacement effect, including its reply, previous grant release, frame and hints.
- Added an independent replaced-query fixture. The old dense search waits on a timer, a new Find enters `x` and shows the first match at `large.txt  1:3`, and the old timer arrives without changing the screen.
- Saved the [checkpoint replay logs](../various/05-combined-host-replays.txt), [per-event fixture receipts](../various/04-combined-event-fixtures.jsonl) and [exact state layouts](../various/06-checkpoint-layouts.jsonl).

### Why

The original renderer reads the query and the pending status, but no longer needs a separate field for a Find token. Cursor navigation remains a different deferred operation and can need its own timer after the search finds a match. Keeping the physical line end across waits avoids repeatedly scanning a long imported line.

### What worked

The final source passed all thirteen original Editor workflows and five direct both-target fixtures. It emits 88,969 Wasm bytes and 22,292 raw RV32 instructions, with 57 declared plus 13 generated fields. The matched tail-search image at line 852 is byte-identical to the original JS workflow's host framebuffer. The prior enum-only checkpoint also passed all thirteen workflows.

### What didn't work

- An attempt to put the first text borrow inside a standalone block in the async body failed with `SyntaxError: 573:5: expected ;`. The current dialect accepts blocks owned by control statements. I used an ordinary local whose last read precedes the first wait, which allows the liveness pass to leave it out of the frame.
- The first replaced-query fixture expected a query for `x` to move to line 852, but both runtimes returned `large.txt  1:3`. That is the first `x` in `text`. A two-letter query encountered many `x` candidates before the tail and the test incorrectly expected a synchronous frame. Reserving a unique letter for line 852 gave a different immediate trace, `["sleep 2019","return 1"]`, because the viewport must traverse over 64 rows. The replaced-query fixture now checks the original nearby `x` match. The full replay tests the independent delayed rendering for the tail match.

### What I learned

The task can finish a search while the view still has layout work to do. A pending Find frame and a pending renderer timer are distinct. A scope test should assert either the final frame after settling both or a known match close enough to display immediately.

### What was tricky to build

On wrapping, a physical line end at or beyond the anchor identifies the original line. The prefix limit checks absolute folded candidate positions against the same anchor. Replacing one coordinate system while preserving the other would change the position after U+0130 and the result of a prefix overlap.

### What warrants a second pair of eyes

Check that `editorFindAdvance` never follows a second physical EOF after wrapping. Check that the cursor-clamp rule still protects a split surrogate even with an expanded fold. Compare the two replacement traces at specific events rather than comparing the initial Find-entry screens with the control.

### What should be done in the future

Compare the host evidence with physical cold compile and Editor CPU results. Both host direct-event drivers expose rejection of canceled tokens without relying on P4 message timing.

### Code review instructions

Trace `editorFindNext` to `editorFindTask`, then `typedWorldEvent` and `editorShow`. Run `03-check-editor-event-interleaving.mjs` with the P4 compiler and the CJI RV32 emulator. Check the `replace-search`, `replace-control` and `replace-query` receipts and the `--dense-search` and `--tail-search` workflows.

### Technical details

The final Open frame has two control fields and saves one value at the read or four at a timer. The final Find frame has two control fields and saves `at`, `end`, `anchor`, `foldedAt` and `phase`. Editor's static C reactor still reserves 80 slots. The result changes used slots, from 71 to 70.

## Step 5 — Review the device observer and recheck the final host modules

The physical observer records elapsed time beginning in the Editor segment that handles Enter and stops after Editor publishes the expected retained status. I followed that event from the P4 keyboard injection through the compositor and the native renderer before the board run. I also rechecked all five direct host receipts after the final continuation optimizer changed compiler execution.

### Prompt context

See Step 1. The user asked for independent Opus High research. The [independent design](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/opus/editor-design.json) proposed deterministic early hit, late hit and miss cases with frame-size and time measurements.

### What I did

- Read the Opus design and applied its three outcome classes to the production Editor workload. The proposed synthetic 512-byte budget and pointer-based interface do not describe the application's 1,024-work-unit limit and native world ABI.
- Checked the observer against `run_segment` and the compositor. The compositor sends mail of type `key`, with a JSON `key` of `enter`. The retained frame is updated before the observer's final hook, which runs after the Editor CPU counter increments.
- Ran the five direct fixtures against the compiler at `2e4fee1` or newer and compared the resulting JSONL bytes with the [earlier receipt](../various/04-combined-event-fixtures.jsonl).

### Why

A time bracket based on command issuance includes the serial console and compositor's work before the app receives Enter. Starting at the actual Editor segment removes that latency. The end boundary includes the renderer's necessary traversal for a late hit, which is part of when the completed result becomes available to the user.

### What worked

The five direct receipts matched byte for byte. The continuation author independently compared G4's linked Wasm and RV32 outputs against compiler revision `9fd1744` and found both byte-identical. The stage that opens the document establishes the expected status for the first `ext` match at column 2 and the tail `needle` match at line 852, column 1.

### What didn't work

The device script originally derived the trial's name prefix from `args.kind[0]`. Both `control` and `candidate` start with `c`. This defeats the stated isolation of persisted position records even when the previous trial removes its temporary file. I reported the collision to the device owner.

### What I learned

There are two independent timing units for late Find. Search uses a count of eligible candidates and lines. The renderer needs to walk rows once that cursor position changes. The observer deliberately includes both when the result is published.

### What was tricky to build

The retained frame holds the raw serialized screen. A completion match can check only the status expected for the search class. The fixture text has neither the complete status labels nor the file name, so the matched text identifies the app's status field in this workload.

### What warrants a second pair of eyes

Confirm that the device receipt records the distinct filenames actually used. When reporting wall time, distinguish the first Editor segment from the earlier physical key injection and the later panel transfer.

### What should be done in the future

Use the observer output to compare the same handler and retained-frame interval across both targets.

### Code review instructions

Read `05-find-observer.inc` and `07-time-find.py` in the [qualification scripts](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/scripts). Follow their hooks against `run_segment` in `picocalc-os/nucleus/kernel.c`.

### Technical details

Each direct fixture passes through a linked reactor. The physical observer runs in separate images to avoid including its matching and serial printing in the uninstrumented full-workflow timing.

## Step 6 — Account for the physical cold-compile regression

The fixed-clock device trials reproduced Edit, Find and Preview for each engine. The combined workflow uses nearly the same measured Editor CPU. The native cold compile median exceeds the prospective limit despite fitting the static state and native code reservations.

### Prompt context

See Step 1. The production scope compares the complete Editor with the before-G compiler on the physical PicoCalc. The supervising ticket performed and archived all hardware operations.

### What I did

- Checked three complete trials per engine for each of before-G and generated Editor. Took the median of each trial's final cold bundle compile and compared workflow outcomes, screenshot digests and CPU through the supervisor's receipts.
- Added the cold time, peak QuickJS heap and workflow CPU comparison to the Editor article.
- Read `p4_typed_compile` to verify the cold time includes creating the QuickJS context, evaluating compiler sources, executing the compile/link function and releasing the context.

### Why

The generated program and its compiler have different cost limits. Extra compiler work during boot can increase latency even when handler execution remains within its forecast. The full-workflow CPU delta and cold time capture those intervals separately.

### What worked

All six candidate device workflows passed. Every candidate screenshot digest matched its control within the same engine on each trial. Native Editor CPU was 34.80 ms against the before-G value of 35.03 ms. Wasm Editor CPU was 144.30 ms against 144.35 ms. The supervisor confirmed restoration to the starting firmware and original native app world set.

### What didn't work

The predicted native cold compile increase of at most 10% failed. Median cold native time rose from 2,645,557 µs to 3,816,925 µs, an increase of 44.3%. Wasm increased from 2,028,286 µs to 3,121,485 µs. The native QuickJS peak increased from 1,493,644 bytes to 2,256,776 bytes.

### What I learned

A single removed state field and a small increase in emitted instructions say little about the compile pass's own allocation and running time. The device spends time loading and executing the transformation in QuickJS. The aggregate receipt alone does not assign that increase among passes.

### What was tricky to build

The app source checkpoint is `7b321a9`. The tested candidate compiler bundle uses `2e4fee1`, which emits the same app module bytes with reduced compiler work. The before-G comparator is `1357545` with the fixed-clock instrumentation. Comparing cold times directly with the earlier `289281c` receipt answers the wider E plus G question instead.

### What warrants a second pair of eyes

Confirm a displayed frame's digest is compared within its engine and with the fixed wall clock. Use the newer compiler build's own native cold receipt in the 10% comparison.

### What should be done in the future

Use isolated compiler phase timing to attribute the increase. Complete the separate on-device full-size search run and compare the observer's elapsed time with its accumulated Editor CPU.

### Code review instructions

Inspect the [workflow comparison](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/workflow-comparison.json) and the [candidate trial receipts](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/physical-final.json).

### Technical details

The native counter meets the 10% workflow CPU ceiling. The application meets the 71-field limit with 70. The native cold compile forecast is a distinct failed performance prediction.

## Step 7 — Observe early, dense-miss and tail searches on the device

The isolated observer completed the three search classes on each physical engine and version. It uses the normal Editor key handler and waits for the app's reported result to enter the kernel's retained frame. A separate serial command transfers the screen after the observer captures that elapsed interval.

### Prompt context

See Step 1. The paired search phase follows the independent experiment's early, late and absent-result classes through the application's actual SDK seek and drawing code.

### What I did

- Reviewed the abandoned setup and shot captures and reported two recoverable harness failures to the supervisor.
- Verified the restored control and candidate receipts, then incorporated the exact elapsed values and equal segment counts in the Editor article.
- Distinguished the screen reported at the end of the measured interaction from the subsequent CRC-checked UART screenshot.

### Why

Normal kernel delivery and publication establish that physical application behavior matches the expected status. A serial screenshot transfer can take seconds and serves as visual evidence after the timed operation. The same command window does not need to cover both.

### What worked

The dense physical miss used 297 Editor segments and 296 timer settlements in all four version and engine combinations. The tail hit used 27 segments and reached line 852, column 1 on both targets. The candidate RV32 elapsed intervals were 4.086 ms for the early hit, 171.667 ms for the dense miss and 55.810 ms for the late hit. The candidate Wasm intervals were 41.608 ms, 1,656.603 ms and 738.086 ms. These are single observations per class, separate from the three-trial stock workflow.

### What didn't work

- The first timing attempt asserted that the directory listing contained the leaf immediately after Files opened a missing name. The captured setup ended with `#OK ls` and no leaf. An empty Editor document does not write its path until a save. The recovered harness stages the file in the test directory, verifies exactly 65,536 bytes and opens it through Files.
- The next attempt observed `EGFIND early 4138 4112 3717 1 0` but `[p4cap] shot 1: - (BAD: 0 px)`. The 19.5-second capture issued the shot at 14 seconds, logged `#SHOT 320 320` and stopped before the footer. The surviving RLE payload decoded to 76,009 pixels. The supervisor moved each CRC-checked shot to its own 22-second capture, after the state and timing receipt.

### What I learned

The work counter can make a dense miss much more expensive than a unique hit near EOF. A late hit also has a display cost. The search observer times the user's result through completion of that display, so segment counts include viewport timers as well as timers used by the scan.

### What was tricky to build

The initial proof of an expected frame comes from the observer's status match. The sample screenshots have different scratch filenames between the control and candidate, which keeps persisted cursor records isolated. Byte-for-byte screenshot comparison belongs to the fixed-name stock workflow.

### What warrants a second pair of eyes

Read the elapsed and Editor CPU measurements from the same row. Avoid treating either clock as the transport time from the serial console to the LCD. Check that the script verifies the expected status and clean scratch removal in each arm.

### What should be done in the future

The cold-compile result motivates the separate source-inspection experiment. Each new compiler optimization can reuse the proven application module outputs and compare the reduction at the compiler stages that make up the 897 ms rewrite mean.

### Code review instructions

Start with the [paired search measurements](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/search-comparison.json), the [physical tail capture](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/editor-physical-tail.png) and the [Editor article](../analysis/01-what-editor-keeps-across-a-file-read-and-a-search-pause.md).

### Technical details

The search classes use `ext`, `text text z`, and `needle` in order. The observer brackets the Editor's Enter handling through the first retained expected status. The initial status check sees `Find: <query>_`. The miss sees `Not found: text text z`. The two hit cases see a file label with coordinates `1:2` and `852:1`.

## Step 8 — Publish the tested Editor report and close the app ticket

The Obsidian report includes the complete workflow and full-size search comparisons, the cold-cost attribution and an actual physical capture of the tail match. The source report remains beside the reproduction scripts and receipts.

### Prompt context

See Step 1. The user asked each author for a textbook-style report in the go-go-parc vault and explicitly authorized committing and pushing the vault.

### What I did

- Used the supervisor's `15-publish-note.py` helper to create the dated note and copy the physical tail image. Added the source repository to the vault frontmatter.
- Verified that the embedded image matched the source capture, staged only the new report and its figure, committed them and pushed `HEAD:main` to the vault's `origin`.
- Verified the project ticket's Markdown links and ran `docmgr doctor --ticket PICOCALC-EDITOR-ASYNC`.

### Why

The dated note keeps the report readable outside the application workspace. The source revision, exact check commands and device receipts provide a reproducible record of the successful behavioral gates and the native boot-time forecast miss.

### What worked

The push advanced vault `main` from `f75a58f` to `e2cd8bf0d82ce4c92ae4e49d44b3902c8fcaa365`. The vault working tree reported clean and synchronized with `origin/main`. The [published Editor report](https://github.com/go-go-golems/go-go-parc/blob/e2cd8bf0d82ce4c92ae4e49d44b3902c8fcaa365/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20What%20Editor%20Keeps%20Across%20a%20File%20Read%20and%20a%20Search%20Pause.md) includes the physical RV32 tail screenshot, SHA-256 `41b9081dee90df39f2a1bfd73da9de995f89bad02bebbd6a1ef46decb5fa94e1`.

### What didn't work

No publication failures observed.

### What I learned

An embedded capture needs to accompany the standalone report itself. The vault conversion copies it to the dated folder and preserves the separately tracked source references as repository-relative paths.

### What was tricky to build

The report compares fixed-name workflow screenshot bytes across versions. Its full-size search figure uses an isolated trial name, which keeps its state independent of previous measurements.

### What warrants a second pair of eyes

Verify the table's full-size rows against the paired receipt and the 10% prediction against the before-G native medians.

### What should be done in the future

The separate compiler source-inspection study owns work to reduce the measured boot cost.

### Code review instructions

Read the [source article](../analysis/01-what-editor-keeps-across-a-file-read-and-a-search-pause.md) and the published commit. The application checkpoints are `ed86ba9`, `1357545`, `eb4ef81` and `7b321a9`.

### Technical details

The published note is in `Projects/2026/11/20`. Its sole new figure is `_assets/editor-physical-tail.png`.

## Step 9 — Audit the original G1–G4 acceptance criteria

I mapped the professor's four sets of acceptance criteria to the compiler and Editor tests and the recorded board results. The original host harness already exercised the cross-target dispatch and failure cases. I added the literal worked layout example, the exact diagnostic, and a comparison with the original Editor's normalization routine. The prescribed host commands are now available from a clean checkout.

### Prompt context

See Step 1 for the original request. The supervising agent requested an independent audit of G1–G4 and authorized remaining host checks. This audit used the existing physical receipts and serial logs.

### What I did

- Extended the [canonical continuation fixtures](../../PICOCALC-CONTINUATION-G--compile-typed-await-into-static-picocalc-continuations/scripts/14-check-async-layout.mjs). The exact G1 example emits a five-field frame with no saved scalar at the initial read and `length`, `read` and `written` at the timer. The illegal-buffer variant reports `12:9: text is live across the wait at line 12; obtain it again after the wait`. Its single prepended record moves the example's relative wait line 11 to file line 12.
- With an original checkout pinned to `289281c`, loaded `editorNormalize` and the original state layout from the Editor source files. Invoked the historical slice routine for the three copies and verified equality of all 10,000 UTF-16 units after each expected token `1, 2, 3, 4`, including the final normalized length. This supplements the fixture's separate expected-text oracle.
- Verified the original-source location of a diagnostic at `5:40` after rewriting `pending()`. Ran the original 29 event sequence, whole-record comparisons, busy and failed starts, frame overflow, rejected await and lifetime cases, and synchronous Files, Agenda and Editor byte identity on the baseline source. Both linked target paths report the same Editor layout.
- Confirmed that the frozen `01-run-host-replays.sh` hashes to `21551108d25fff0b4a6390dbb25b27773f675a1cfece45458d7f6076b4080d29`, the recorded digest at the historical checkpoints. Ran it again and observed 24 passes, including all thirteen Editor cases. Placed the same layout command under the professor's requested path with one shared fixture implementation.

### Why

The old G2 fixture compared the completed buffer with a JavaScript normalization expression. That verifies the expected content. The professor explicitly required an additional comparison against the hand-written routine under the fixture's exact settlement sequence. Checking the whole buffer immediately after each token also catches lost progress at a slice boundary.

### What worked

| Scope | Acceptance evidence |
| --- | --- |
| G1 | The exact example, diagnostic and two waits now print. The existing tests cover dead-before-wait values, values used only in the loop condition, waits inside branches and loops, overlapping saved sets, independent shared-helper frames and malformed programs. Original synchronous applications emit identical bytes on both targets. |
| G2 | The mini reactor issues tokens `1, 2, 3, 4`; the historical and generated buffers agree after each one. The existing tests run nested awaits, out-of-order roots, busy starts, failed requests, cancellation, unrelated tokens and the 80-field rejection on both targets. |
| G3 | The archived Open checkpoint `eb4ef81` passed 24 checks, including the thirteen original Editor workflows, and reduced the entry file from 204 to 177 lines. It uses 71 fields and adds 264 native instructions from the pre-Open checkpoint. The direct fixture protects a 64 KiB document and observes the full normalized save at the actual SDK call. |
| G4 | The combined app uses 70 fields and passes the historical replays. Replacement Open and replacement query tests ignore stale search timers. The fixed-clock `2e4fee1` device images passed all six workflows with byte-identical matching Find and preview captures within each engine. Native CPU remained within tolerance. Both physical targets reproduced the 64 KiB tail match at line 852, column 1. The early, miss and late logs for all four version/engine combinations contain no `crashed`, `timed out`, budget rejection or observer error lines in the search interval. |

### What didn't work

- The unoptimized `2e4fee1` native cold build took 3,816,925 µs against the before-G median of 2,645,557 µs and a 2,910,113 µs ceiling. The later composed source-span candidate's screening median of 2.725 s clears that ceiling. The screening boots alone do not qualify the exact final production images for the full paired workflow. This audit leaves that device campaign to the supervising agent.
- The planned G3 50 ms and G4 100 ms interleavings are covered by forced delivery phase in the direct reactor fixtures. The supplied test has no literal wall-clock delay. At `picocalc-os/nucleus/kernel.c:663`, a pending Editor turn only accepts settlements; ordinary keys and Open requests queue. The direct fixtures deliver the conflicting events at the exact states that the acceptance examples intend to probe.
- The supplied roadmap documents were initially untracked. Commit `5d7e0e0` preserved the plan, task list, all scope documents and baseline evidence. The Issue articles referenced by G were also initially outside Git. Commit `65129c7` preserved the companion course, including Articles 08 and 10.

### What I learned

There are two useful equivalence checks for a rewrite. Final-content comparison verifies normalization. A snapshot after every settlement verifies that the rewrite stores progress at the correct time. Both checks can run against the old routine even though the production Open workflow has additional timers to prepare its initial frame.

### What was tricky to build

The professor's illustrative normalizer copies its first slice when the read settles. The historical Editor's application dispatcher uses an initial timer before the first slice of a large read. The G2 comparison invokes the original slice function on the illustrative sequence. G3's production fixture checks the separate application timer ordering and the reply after the first frame.

### What warrants a second pair of eyes

The final integration validator at `PICOCALC-EG-QUAL/scripts/28-check-qualified-integration.py:22–42` gates source hashes, 24 workflows, clock limits, matching frames and restoration. It does not independently assert the compile-time state count or bind the full-size EOF receipt to new module bytes. For a promoted compiler, run the original 14-check command on the final production sources and compare the complete linked Wasm and RV32 outputs with the physically checked `2e4fee1` modules. If those bytes differ, rerun the EOF case on the changed image.

### What should be done in the future

Finish recording the exact optimized physical workflow and preserve its distinct receipt.

### Code review instructions

Run `node "$NEXT/scripts/14-check-async-layout.mjs" /path/to/289281c-checkout` from the project root and inspect the [audit output](../various/08-professor-g-host-audit.txt). The path argument enables the historical-normalizer comparison and baseline byte-identity checks. Running without it still exercises the shared compiler tests and prints the G1 and Editor layouts.

### Technical details

The expanded fixture receipts agree under the shipped compiler and the composed compiler's JavaScript fallback. I then used the C-backed QuickJS compiler used by the span study to compare the actual bundled Editor source and linked module bytes. The reference ran the physically qualified `2e4fee1` compiler without the index. The source-span and portable-parser rehearsal directories ran with the installed lexical index. The Wasm module, RV32 ELF and each layout are byte-identical on the common inputs. The audit receipt records the compiler source, reactor and output hashes. This establishes a host artifact identity bridge to the physical EOF test for those compiler inputs. It does not replace the supervisor's measurement of cold compile and workflow timings on new images.

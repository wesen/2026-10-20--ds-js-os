---
Title: Frontend cold compilation investigation diary
Ticket: PICOCALC-FRONTEND-COLD
Status: active
Topics:
    - picocalc
    - performance
    - quickjs
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:01.220617027-05:00
WhatFor: ""
WhenToUse: ""
---

# Frontend cold compilation investigation diary

## Step 1 — Locate the interval and pin the control

The historical output-storage trial put about 1.38–1.43 seconds of Editor time in a label that reappeared between function callbacks. I read the production call chain before designing the new trace. The wrapper's timer starts before it reads sources and reactors. A fresh QuickJS context evaluates the compiler files, copies native compiler inputs, and calls the streamed compiler entry point. The frontend and backend alternate inside that call every time a function finishes.

The experiment uses commit `40bcf850a5809ef6d839127869faa952596ed157` throughout. It uses the normal app wrappers for timing. Only the research fixture selects the compiler variant, and the board operator owns flash access.

### Prompt context

The verbatim frontend assignment in the attached brief reads as follows.

> Break down the 1.4-second interval on the P4. The current lexer runs a regular expression with named captures and constructs a token object on every successful match. Compare it with a cursor-based scanner if the trace shows scanning or allocation is material.

Its deliverable reads as follows.

> A time breakdown that reconciles with the clean build, plus one controlled implementation comparison preserving diagnostics and output.

The brief also requests an ambitious half-second Editor improvement under the current peak heap budget. I interpret cold as repeating the full bundled-input compile with a new QuickJS runtime and context every time.

### What I did

- Read the independent phase study, production runtime wrapper, lexer, and streaming callback.
- First requested a design and operator handoff from Claude Code with `claude -p --model opus --effort high --restricted --safe-mode --strict-mcp-config --tools '' --no-session-persistence --output-format json`. The prompt contained selected compiler excerpts and the design brief and ran from an empty scratch directory.
- Coordinated the first device slot with the supervising operator. It will run after host checks and a reproducible isolated firmware build.

### Why

Exclusive time is essential because frontend calls into backend lowering. Charging the whole `compileFunctions` call to the frontend would count each lowering callback twice.

### What worked

I traced the earlier residual label to the start of the JavaScript call and the intervals between callbacks. Production's Editor wrapper allows six seconds and four MiB, but the promotion thresholds are the observed control peak and the 0.5 second target.

### What did not work

The combined study scripts are numbered. My initial command `sed -n '1,200p' ttmp/2026/11/19/PICOCALC-RV32-COMBINED*/scripts/stage.py` produced `zsh:1: no matches found`. Listing the directory revealed `01-stage.py`, which documents the isolation and on-device bundle-selection pattern.

### What I learned

A complete module identity check must include the actual bundled reactor because the slot size is fixed. Raw native bytes and metadata remain independently useful. The current lexer reports invalid text at the offset before skipped trivia on a match failure.

### What was tricky to build

The lexer accepts JavaScript whitespace, LF-terminated comments, and JSON string escapes. Error preservation must include malformed strings and surrogate code units as well as ordinary programs.

### What warrants a second pair of eyes

Check the accounting boundaries against the C wrapper and streamed JavaScript callback. In particular, distinguish startup of the compiler realm, evaluation of the files, argument copies, frontend parse and emit, assembly, link, and cleanup.

### What should be done in the future

Record clean and instrumented timings independently. Report instrumentation cost before interpreting any per-token result.

### Code review instructions

Start at `Lexer.next` and `compileFunctions` in `picocalc-os/compiler/typed-wasm.js`, then `typedRv32.compile` and `linkSlot` in `picocalc-os/compiler/typed-rv32.js`. The outer timing and heap live in `picocalc-os/port/esp32p4/main/typed_p4.c`.

### Technical details

The pinned wrapper observes QuickJS allocation high water via `port_heap_usable`. Native result copying uses a separate C allocation. Native module identity is checked after each measured compile, outside the wrapper's elapsed time.

## Step 2 — Separate clock categories and preserve comment backtracking

I committed the initial design as `646e7d9` before creating the experimental compiler variants. I staged a copy of the pinned project and the pinned CJI tree in `/tmp/p4-frontend.20261119`. The isolated port selects four combinations of the original and cursor frontends with and without trace markers. Every trial uses a fresh realm initiated through the original helper and app wrapper.

Claude Code then returned an approved no-data design from `claude-opus-5-5` with high effort. Its design emphasized the exclusive callback boundary, validating every code-unit position and comparing measured totals across levels of instrumentation. It proposed a lex-only run as a way around observer effects. I implemented a trace against the production call path with an independent clean comparison because lex-only execution would change allocation lifetimes and omit parser interactions. The initial request with compiler excerpts was interrupted in the default sandbox with exit 130 and an empty reply after the supervision update. The approved generic input contained a fictional scenario and public ECMAScript terminology.

### Prompt context

See Step 1 for the frontend assignment. The code design fixes the control source at the supervisor's chosen revision and leaves project sources alone.

### What I did

- Added a scratch-tree stage program, scanner source, C phase switch, native trial wrapper and ESP-IDF build script.
- Created a differential oracle that compares all UTF-16 values in token context, randomized token concatenations, valid and invalid whole programs, and the linked modules from all three application wrappers.
- Kept token and lowering counters alongside timestamps. The board reader requires total phase and maximum phase heap equality with the outer result, exact output hashes and the expected phase visit relationships.

### Why

The ordinary lexer allocates a match result with named captures and a token object. The cursor writes one reusable object on successful common-path matches. Lexer-only host variants keep the option of constructing fresh tokens so the combined change can be interpreted.

### What worked

The corrected cursor matched the control through all Node differential cases and produced the same native output for the previously built application reactors. The subsequent board oracle uses the actual firmware build's reactor bytes.

### What did not work

- `git add` initially returned `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. A scoped escalation staged and committed only the ticket's design and diary.
- The first oracle run, `node scripts/06-oracle.mjs /tmp/p4-frontend.20261119 /tmp/p4-combined.2kZZ9ZqW/build/esp-idf/main` from the ticket path, failed on `x  // ignored<U+2028>still ignored<LF>   @`. Cursor scanning returned `1:2: invalid token`. The original lexer returned two slash tokens and comment words before reporting `1:28: invalid token`.

### What I learned

The sticky regex makes the comment repetition optional. If greedily skipping all trivia leaves no legal token, the engine can backtrack to a slash in an earlier comment. The cursor's no-token path now delegates to the original matcher. This also preserves the no-token diagnostic anchor and the prior EOF behavior.

### What was tricky to build

A scanner error and the original regex's failure are distinct states. Treating both as EOF or an invalid token changed the grammar at the end of comments. The corrected fallback executes only when ordinary cursor classification does not produce a token.

### What warrants a second pair of eyes

Per-token callbacks make both traces slower and can move where the allocator sees a peak. Capture raw observer overhead. Keep the clean result authoritative for the decision.

### What should be done in the future

Run the packaged firmware and reconcile visits, times, peaks and output hashes. Run the existing RV32 workflow tests on the frozen base and cursor output.

### Code review instructions

Open `scripts/01-stage.py`, `scripts/02-cursor.js.inc` and `scripts/06-oracle.mjs`. The lexer fallback is a renamed copy of the original `next()` body. Review `scripts/07-board-receipt.py` for phase invariants and output identity checks.

### Technical details

The control and cursor share identical clean `typed/rv32.js`. Their traced variants share identical marked backend bytes. Phase entry queries the same monotonic port clock as the production outer measurement. The firmware emits accumulated phase totals after capturing the outer end timestamp.

## Step 3 — Park the firmware and host oracle before the board slot

The operator requested a resume checkpoint when the broader lab paused. The isolated ESP-IDF build completed and the Node oracle matched every variant using the firmware's actual bundled reactor inputs. The board has no observations for this ticket at pause.

### Prompt context

Continue with the frontend assignment in Step 1 when the supervising operator reopens the lab. At pause, preserve an exact artifact identity and a reproducible route to the first physical capture.

### What I did

- Built the research app under ESP-IDF 5.4.2 with the existing agent-ELF configuration and streaming enabled. Verified the partition table matched the earlier known firmware build and all four bundled compiler byte sequences matched the manifest.
- Ran 71,814 lexical differential cases and 535 whole compiler cases across all frontend variants in Node. The native app wrappers produced identical instruction bytes, metadata, and linked images. Editor emits 87,544 instruction bytes inside a 240,452-byte linked module.
- Built the vendored QuickJS runner and generated its lexical and whole-compile fixture. These two host preparations completed before the pause. QuickJS fixture execution, cold host comparison and native guest qualification remain open.
- Started the explicitly approved project-specific Opus high review outside the sandbox from an empty directory with no tools. Its CLI init resolves to `claude-opus-5-5`. The request was interrupted at pause before a successful result event, so the design has no completed project-specific Opus review to claim. The generic review succeeded.

### Why

The checkpoint lets the board operator reproducibly verify firmware and compiler provenance before starting timed boots. Preserving only digests and aggregate host results keeps the ticket small.

### What worked

The app binary has SHA-256 `07d98dee8dbacc4fe261629eed338c322ea8ae42eb896be5ed2ebe6f755aef8a`. The exact built files are under `/tmp/p4-frontend.20261119`. The oracle and compiler identities are under `various/`.

### What did not work

The phase fixture has no physical receipt at pause, so the phase attribution and half-second claim remain untested.

### What I learned

The Node test contains a compact comparison for all UTF-16 code units, but the Phase and heap claims need the vendored QuickJS runtime on the P4.

### What was tricky to build

The initial IDF component registry check could not connect in the sandbox. The staged build had all seven locked components already available and completed using the cached sources.

### What warrants a second pair of eyes

Inspect the first phased run for exact boundary reconciliation and verify the scanner and control produce equal phase visit counts per app. Check that the serial capture includes the full kickoff and post-trial world state.

### What should be done in the future

Resume with the QuickJS differential fixture and the previous native workflow tool. Run the two physical captures through the supervisor. Review the clean pair, then charge the measured overhead to the interpretation of the marks. Ask Opus high to write the measured article from the approved summarized inputs.

### Code review instructions

Run `scripts/01-stage.py WORK --board-assets PORT_ASSETS` and `bash scripts/05-build.sh WORK /home/manuel/esp/esp-idf-5.4.2/export.sh` to rebuild. Use `node scripts/06-oracle.mjs WORK WORK/build/esp-idf/main WORK/quickjs-fixture.js` for the oracle and fixture. Parse two complete captures with `python3 -B scripts/07-board-receipt.py WORK WORK/oracle.json BOOT1.log BOOT2.log`.

### Technical details

Capture 90 seconds per boot and issue `worlds` at 87 seconds. Each complete run has 48 `FRONT begin` and `FRONT end` lines and a `FRONT complete` marker. Firmware and partition digests are in `various/firmware-identities.json`. The supervisor retains authority over the board window and restore.

## Step 4 — Run the actual QuickJS and native guest oracles

The research wave resumed with the production sources, disposable build, and fixed artifact identities from Step 3. I ran the complete serialized diagnostic and compiler fixture in the vendored QuickJS engine and compared the resulting bytes across all three clean variants. I also reused the established application workflow drivers against exact paired guest modules.

### Prompt context

The lab resumed after the user approved the Sol 6.2 High researchers. The supervisor requested a local article and independent host workflow checks while operating the board. See Step 1 for the assignment.

### What I did

- Replayed 71,814 lexical and 535 compile cases in the vendored QuickJS. The three result records shared SHA-256 `ea929440c91d8d7d225a3c038a8fc6766f36cfb415d2f3e6a850c00628834d64`.
- Verified public Files, Agenda and Editor Wasm link entry points against local Wasm reactor builds. The byte-identical modules passed `WebAssembly.validate`.
- Ran a cold host comparison using 12 complete orders per app. The follow-up recorded both monotonic wall and process CPU time, and all 108 generated native modules matched the corresponding host oracle digests.
- Compared six native emulated workflows through the prior driver script. The scratch reuse changes its expected relationship from unequal native outputs for a backend treatment to equal outputs for the frontend treatment.

### Why

The regular expression and memory allocation behavior depend on the JavaScript engine. Node helps detect parser and artifact equivalence, and the vendored QuickJS replay checks the same grammar and errors in the runtime used on the handheld. Executing matched RV32 images verifies the app workflow contracts.

### What worked

All six guest work counts and result digests matched. Editor control and cursor executed 2,543,239 instructions for edit, 7,621,786 for large input, 22,853,317 for dense-inline preview, and 42,316,056 for late navigation. Agenda and Files executed 2,193,310 and 88,823 instructions. The native guest used its local test reactor for Editor, with exact board-reactor identity checked separately.

The paired Editor process CPU medians were −4.62 ms for the cursor with reuse and −1.26 ms for the cursor that creates a fresh object, both relative to the original lexer. Comparing the two cursor variants within each block measured +3.73 ms for the fresh object version.

### What did not work

- The first command `python3 -B /tmp/p4-frontend.20261119/guest/scripts/05-guest.py P4_GCC RV32EMU /tmp/p4-frontend.20261119/guest/pair` returned `Error: spawnSync .../picocalc-os/build/picocalc-host EPERM` while running the Editor simulator. Its subprocess started and produced frames. Repeating under scoped approval reproduced the complete workflows.
- The initial wall-only host comparison overlapped other builds and had Editor within-block times ranging from −285 ms to +515 ms. I added process CPU timing and repeated the result independently. The first noisy comparison did not drive the conclusions.

### What I learned

The host can attribute part of its own timing to token reuse because it isolates the allocation shape with a third variant. The firmware result changes tokenization and token reuse as one treatment. Quantitative attribution needs the same isolation on the ESP32-P4.

### What was tricky to build

The old guest harness asserts that a meaningful RV32 backend candidate changes the generated image. A frontend study requires byte identity. The scratch wrapper changes that one assertion while retaining the workflow drivers and result checks.

### What warrants a second pair of eyes

Check that host timing boundaries exclude process launch and output writes and that the case test validates per-engine identity. The test intentionally does not require identical engine-specific JavaScript diagnostic internals across Node and QuickJS.

### What should be done in the future

Use a board treatment that separates the changes to match allocation and token object allocation if the remaining lexer time justifies another test.

### Code review instructions

Inspect `scripts/08-quickjs.c` and follow `scripts/09-host.py` for the two host clocks. The scratch guest harness is created by `scripts/10-guest.py`. The evidence is in `various/quickjs-cold.json`, `various/host-oracle.json`, and `various/guest-workflows.json`.

### Technical details

The process CPU clock removes scheduler wait time. The monotonic clock covers the same inputs and QuickJS lifecycle so its relative differences can be compared. Neither includes the ELF write used for fingerprinting.

## Step 5 — Close the paired P4 result and write the report

The supervisor acquired and qualified two full boots of the phase experiment. I replayed the capture parser against its serial logs and reproduced the physical receipt byte for byte. I preserved the parsed records in the ticket and prepared the measured article and figure for the vault.

### Prompt context

See Step 1 for the requested physical attribution and half-second target. The supervisor's independent follow-on replay remains tracked in the wave rather than claimed as an extra observation in this article.

### What I did

- Compared cold time and maximum retained heap using the clean base and cursor arms, with four balanced blocks in each boot.
- Verified that each of the 48 marked app runs reconciled every exclusive duration and the largest phase peak to the outer reported figures. All 96 clean and marked linked images matched their app oracle SHA-256.
- Compared the Files effect with the supervisor's byte-identical control calibration and preserved the relevant matched samples.
- Plotted clean medians and mean exclusive phase totals and regenerated the standalone vault article with the same figure.

### Why

The clean arms quantify how much quicker the actual entry point becomes. The marked arms partition its work and expose observer overhead. The maximum heap across each boot establishes whether the candidate can fit under the exact control high-water budget.

### What worked

The Editor cursor reduced clean compile time by 289.8 and 297.9 ms in the two boots and increased paired peak by 9,036 and 9,020 bytes. Agenda saved 66.0 and 62.3 ms and the Files effect overlapped the calibration. Boot two's marked Editor lexer went from 1.021 s to 0.720 s for match and token handling together. Every Editor run visited the lexer 16,793 times and lowered 120 streamed functions.

### What did not work

The cursor missed the 500 ms improvement target and exceeded the clean control heap maxima. It remains an experimental option. Phase timings do not isolate which scanner or allocator subchange causes the global peak growth.

### What I learned

The control spent roughly 167 ms on marked input reads and setup. The major change was in token handling, about 372 to 141 ms in the second marked boot, and matching declined from about 649 to 579 ms. The typed compiler load's marked heap peak increased from 313,156 to 333,644 bytes before lexing, while the argument-stage Editor peak increased by about 5.2 KB. These early readings support testing the additional scanner code footprint separately from later allocation changes.

### What was tricky to build

The marked timings include 139–171 ms of trace overhead per Editor variant. The overhead difference changes the marked speedup by about 26 ms. The clean matched result remains the time estimate. Using mean phase totals in the chart lets their sum equal the mean whole duration exactly, while the result table preserves paired medians.

### What warrants a second pair of eyes

Verify the release decision against both clean maxima and compare the scanner result with the supervisor's separate independent replay. Publication must preserve the relative asset link beside the vault note.

### What should be done in the future

Consider a plain capture layout, independently reusable token, and compact fallback in a separate factorial comparison, with the completed lexical corpus held fixed.

### Code review instructions

Read the measured article and `various/board-phases.json`. Recompute evidence with `scripts/07-board-receipt.py` and regenerate the figure with `scripts/11-figure.py`. Compare the identity-control time and heap deltas in `various/aa-calibration.json`.

### Technical details

The article reports wall-clock changes in milliseconds and peak heap changes in bytes. Trace groups include phase timestamps from the same ESP timer and hash only returned app images after the timed sample. The firmware SHA matches the frozen checkpoint in Step 3.

## Step 6 — Publish the report and finish the frontend lane

The supervisor published the standalone article and its chart to `go-go-parc/main` at `0f27aa9`. I checked that the commit contains both the Markdown note and the colocated plot, and replayed the documented host workflow script. The replay was byte-identical to the saved guest receipt.

### Evidence

- Vault note `Projects/2026/11/19/ARTICLE - PicoCalc Compiler - Where Cold Typed Compilation Time Goes.md`.
- Vault figure `Projects/2026/11/19/_assets/picocalc-frontend-editor-timings.png`.
- Two acquisition boots, 96 validated native builds, and six emulated workflows complete the frontend lane. The supervisor separately owns the wave's independent replay.

### Review

Read the article for the measured result and the phase limits. Start at `various/board-phases.json` for a paired timing review and at `various/guest-workflows.json` for execution identity.

---
Title: Implementation diary
Ticket: PICOCALC-AGENDA-PARITY
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T20:33:40.864380424-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1 — Specify the parity workflow and host boundary

### What I did

I created the parity implementation ticket and described the original JavaScript behavior, a typed action boundary, asynchronous file-edit sequencing, Editor capability transfer, and backend validation. The design preserves both original milestones and uses the current reminder viewer as the built baseline.

### What worked

Docmgr validated the ticket. reMarkable reported `OK: uploaded Typed Agenda Feature Parity.pdf -> /ai/2026/11/18/PICOCALC-AGENDA-PARITY`.

### What warrants a second pair of eyes

Review the separation between typed app decisions and SDK I/O before adding kernel calls. The fixed native program region already has less capacity than the new emitted code.

## Step 2 — Normalize complete Agenda entry prompts in typed source

### What I did

I refactored the date and time helpers to read spans of the original UTF-16 input. The typed entry parser can now tokenize the full prompt, reject duplicate dates and malformed tokens, preserve free text, and format the civil date and optional time into a bounded output buffer. The return value is a length or a diagnostic category. The runtime will still need to provide localized today, display the errors, and sequence filesystem mutations.

### Why

The original Agenda normalizes prompts before it writes a checkbox line. A token-only test does not cover bad times after valid dates, whitespace, lead placement, or a prompt with no title. Full-prompt normalization gives the future editor a deterministic typed operation.

### What worked

The shared fixture runner compared 3,924 isolated token and civil-date cases and 292 complete prompt cases using Wasm and RV32 execution. Complete successful prompts matched the original JavaScript text byte for byte in the UTF-16 buffers. Invalid prompts matched the original error categories. Four boundary cases also checked exact-size and insufficient result buffers. The receipt is various/entry-prompt-both-targets.json.

### What I learned

The combined parser, calendar helpers, and prompt normalizer emit 30,388 RV32 bytes before the reactor. That figure is evidence for revisiting the native template boundary. Host tests establish the source behavior and exercise real RV32 instructions under emulation. No running world calls the prompt normalizer yet.

### Code review instructions

Read normalizeEntry in worlds/agenda/entry.typed alongside agExpand in js/apps/agenda.js. Run scripts/16-check-entry-tokens.mjs from the parent Agenda compiler ticket with the ESP RV32 GCC and rv32emu. The C runner checks the return value and every output code unit.

The companion milestone write-up, “PicoCalc Agenda — Normalizing typed task entry,” was pushed to go-go-parc main at d88b30a.

## Step 3 — Wire task creation through the actual world runtime

### What I did

I linked both parseTask and normalizeEntry into the same prebuilt reactor. The Wasm linker appends the compiled bodies once and rewrites both stub bodies after checking their signatures. The native linker fills two entry jumps, using a capacity and entry count read from the executable template. The parity checkpoint reserves 48 KiB in RV32 so the 30,388 bytes of typed code fit without relocating any existing ELF sections. The board's compiler combines the reminder source with the bundled entry rules for both its boot and editable-source commands.

I added local-date and filesystem-write calls to the world SDK. The calendar call uses the same configured local clock as the host, and the write call uses the existing filesystem capability check and queued write. In the app, F2 opens the prompt. Enter calls the typed normalizer, reads the current file, appends the valid line through the notes capability, and refreshes after the write settles. The request path invalidates earlier refresh tokens so late reads cannot republish an older snapshot. Failed normalization leaves the note untouched.

### What worked

The real host simulator used its keyboard, compositor, Wasm runtime and an isolated notes directory. It saved the exact expected line for a weekday and 12-hour shorthand, preserved the pre-existing heading and task bytes, left the file unchanged on an invalid prompt, and created a previously missing todo.txt. The existing reminder and restart tests still pass. The linked Wasm world is 49,806 bytes.

The native test loaded the P4 ELF into rv32emu and exercised the same compiled normalizer after real reactor key dispatch. It checked the write payload and post-write refresh alongside existing reminder deduplication. That test uses filesystem, clock and storage stubs at the SDK boundary. The ELF is 59,528 bytes, including the reserved region. The assembled build fits its 4 MiB app partition with 0x4ce0 bytes of room.

### What didn't work

An early refactor dropped the previous diagnostic when the notes claim is absent. The Wasm regression caught it, and I restored the diagnostic. The shorthand test initially configured the wall clock using an unsupported simulator command and now uses the simulator's normal -w and -z options.

### What should be done in the future

The live app now adds a task. Full grouping, selection, toggling, editing, deletion and the Editor handoff still need to be ported. The prompt currently displays diagnostic categories. A complete port should retain the original offending-token messages and fit the prompt into the grouped task screen. The board's tight application flash budget also needs to be tracked as the parity code grows.

### Code review instructions

Run the parent ticket's scripts/04-check-wasm-world.mjs for the real simulator and scripts/09-check-rv32-world.mjs with the current P4 reactor ELF for native execution. The receipts in various/ distinguish simulator integration from the native SDK emulation boundary.

## Step 4 — Run the enlarged native reactor on the powered P4

The newly linked native image loaded and published the real notes view after 3.277 s on full boot. Its compile took 719 ms and peaked at 695,364 B. The following editable build published after 2.158 s with 1.128 s in its compiler. The native world counter was 160,328 bytes. The I²C and SPI counters had no errors. These are single read-only boot and rebuild samples. They do not certify a real keypress, note write, or visible LCD timing. The new complete source exceeds two seconds in this powered session. Compare like-for-like activity before assigning that change to code size alone.

The original application was restored and verified by the flash writer and cji status. The milestone report was pushed to go-go-parc main at 5641c3f.

## Step 5 — Port the grouped view and selection to both reactors

The parser and task-entry work had reached both targets, but the running app still displayed only the first twelve open items. I replaced that view with a compact index of the parsed file. The keyboard now moves among task rows and F4 exposes completed tasks. The original app and the Wasm reactor produced the same ordered rows and selection changes on the comparison fixtures.

### Prompt Context

- See Step 1 for the feature parity request. This checkpoint addresses the original grouped screen and the selection that upcoming edit actions will consume.
- The intended outcome is the same visible task ordering and keyboard behavior on typed Wasm and native RV32.

### What I did

- Extended the Agenda entry contract in `worlds/agenda/compile.js`. The typed source supplies the date ordering key and exposes its existing civil-calendar helpers to both reactors. The five entry points use the same function ordering in the Wasm and ELF templates.
- Kept a notes snapshot and a compact array of tasks in `wasm-world.c`. Each entry stores a byte offset, date ordering key, time and logical row. The sort compares date and time for dated open tasks, then uses the byte offset for file-order ties. Dated tasks precede the undated and completed buckets.
- Assigned group headers and selection positions after sorting. Up and Down operate on task entries, so headers are never selectable. F4 toggles the visible range and preserves the original app's row-position rules, including an unselected list when a previously empty view reveals completed tasks.
- Kept the selected task and its neighbors in a bounded 25-row frame. The PicoCalc compositor receives the window start and full list count to draw its scrollbar against the whole list. The F2 input uses the same screen as the list.
- Ran the original app and the Wasm reactor with identical notes fixtures, simulated key presses, wall clock, zone and compositor. Extended the native harness to check selection and both states of F4 through the loaded P4 ELF.

### Why

Keeping the index separate from screen serialization gives the keyboard access to all indexed tasks while respecting the 16 KiB screen-message limit. Retaining each line by byte offset also gives the upcoming edit operation the exact selection text for its reread-and-match check. The same C reactor and typed calendar code serve both targets.

### What worked

- Wasm matched 14 grouped frames and four completed-only frames against the original. The comparison covers row labels, adornments, selection, stable equal-time ordering and F4. The 48-task fixture navigated every task, including the last, using the real simulator keyboard and compositor. The existing create, reminder and restart cases passed.
- The native harness passed grouping and navigation alongside task creation and durable reminder restart. The final Wasm world is 60,615 bytes. The loaded RV32 ELF is 63,076 bytes and the assembled firmware is 0x3fc360 bytes, leaving 0x3ca0 bytes (15,520) in its app partition.
- `make -C picocalc-os test-apps test-native` passed outside the sandbox, including 34 native integration tests. The simulator screenshot and both linked-world receipts are in this ticket's `various/` directory.

### What didn't work

- `node "$n/scripts/04-check-wasm-world.mjs"` initially expected an unset wall clock while the simulator defaulted to a set clock. The clock-off fixture now passes `-w unset`. The first comparative monitor also crashed with `the channel "frames" takes the claim frames.read, which the manifest does not give focus`. Its fixture manifest now grants the already-established read claim.
- The first frame comparison shifted the serialized window as soon as selection passed its midpoint, even when the entire list fit. It exposed a difference in the near-end window calculation. Clamping the window to the full list bounds keeps the whole short list in the payload.
- The RV32 emulator reported `it links to strcpy, which picocalc-os does not give a module`. The P4 already exposes that libc symbol and GCC emitted the call, so I added it to the emulator's import fixture. Node also reported `spawnSync … EPERM` after the emulator printed a pass. The final emulator test used an approved run outside the sandbox.
- I found no USB serial interface for the board during this checkpoint. The hardware test remains open.

### What I learned

The display position needs a logical row index that counts headers. The selection needs a task index that skips them. Keeping both preserves the original keyboard behavior when F4 changes the list and lets the compositor calculate the same scrollbar while receiving a bounded window.

### What was tricky to build

A window can end on a group header before that group's first task. The serializer includes that header without adding the task outside the window. Selection after an empty view also required keeping the original unselected state until the next navigation key.

### What warrants a second pair of eyes

Review the reload peak, where the retained index and notes text coexist with the replacement. Large notes files remain bounded by the app's per-world memory and time budgets. The Wasm check exercises 48 tasks, and the native harness resolves SDK calls through local stubs. Neither measures peak memory or input-to-panel latency on the assembled board.

### What should be done in the future

Use the selected line to implement Enter/Space toggling, F3 editing and F5 confirmed deletion, with a conflicting file edit in the regression fixture. The F6 Editor handoff, exact free-form prompt diagnostics, powered board timings and physical keypress-to-visible-panel timing are still open.

### Code review instructions

- Start in `worlds/agenda/wasm-world.c` at `layout_items`, `render_file`, and `publish_view`. The typed date key is in `worlds/agenda/entry.typed` and window placement is in `js/system/compositor.js` at `drawList`.
- Run the parent ticket's `scripts/04-check-wasm-world.mjs` with the host simulator and optional screenshot outputs. Run `scripts/09-check-rv32-world.mjs` with the ESP RV32 GCC, the CJI emulator and the newly built `esp-idf/main/agenda-reactor.elf`.
- Inspect `various/grouped-agenda-simulator.png` for the real simulator capture and `wasm-grouped-view.json` and `rv32-grouped-view.json` for the validation boundaries and binary identities.

### Technical details

The renderer clips labels after 80 UTF-8 code points, beyond what fits on the 320-pixel-wide screen. The retained text is available at its original line widths. The SDK's clock-zone wrapper uses the existing wire operation. The RV32 slot stays at 48 KiB with five entry jumps instead of two.

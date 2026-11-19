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

## Step 6 — Publish the grouped-view milestone

The grouped view implementation, differential fixtures, and screenshot are in `4f4ebf6`. I added the technical walkthrough “PicoCalc Agenda — Grouping and scrolling a file-backed task list” at `Projects/2026/11/18/PROJ - PicoCalc Agenda - Grouping and scrolling a file-backed task list.md` in go-go-parc. The vault push advanced `origin/main` to `08e95e1`. The report relates file offsets, logical rows and window-local indices through a concrete example, and records the simulator, emulator and firmware build evidence.

## Step 7 — Expand the PicoCalc application partition to 8 MiB

The 4 MiB partition had 15,520 bytes free after the grouped Agenda build. The device was connected again and replied to `cji status`. The installed flash chip reported 32 MiB, while the current layout already used all of the first 16 MiB. I increased the factory app allocation and placed the fresh world-store and files partitions directly after it within that same 16 MiB range.

### Prompt Context

The user asked “how much room do we have in total? can we make the app partition bigger?” and then authorized the reset with “it's fine we can erase it all, nothing of import”. I chose 8 MiB for the application, leaving the installed bootloader, credentials NVS and PHY data addresses unchanged.

### What I did

- Updated `port/esp32p4/partitions.csv` and the current storage layout in `docs/picocalc-agent-implementation.md`. The factory app remains at `0x10000`. The 128 KiB world store moves to `0x810000`. The files partition moves to `0x830000` and ends at `0x1000000`.
- Added a migration script in this ticket. It checks the chip's detected size and both partition tables, holds the keyboard bus before resetting the board, and reads the previous partition table and data range to a private local directory. It computes a rollback checksum manifest before erasing the relocated partitions. It writes and verifies the new table and app separately.
- Built the panel-enabled RV32 Agenda profile and installed its verified image at the unchanged application address. ESP-IDF accepted an 8 MiB partition and reported 4,209,824 bytes free for this image.

### Why

The 4 MiB capacity was a partition table choice. The main firmware contains system code, libraries and the built-in world bundle. The CJI compiler ELF alone is 660,255 bytes in the grouped checkpoint. Doubling the factory allocation provides room for the existing system and lets current Agenda work proceed with the same bundle. Keeping the partition ending below 16 MiB avoids changing flash addressing assumptions.

### What worked

- The bootloader reported the three expected applications and data ranges. The fresh FAT volume mounted with 7,900 KiB usable and free after metadata. `cji status` returned `#OK cji`.
- The grouped RV32 Agenda compiled in 718.933 ms, published its first response at 2.545 s on the first migrated boot, and reported 164,093 world bytes. The first boot formatted an empty filesystem, so this is an operational check rather than a like-for-like cold-start benchmark with the previous notes and settings.
- The rollback set is local under `/tmp/picocalc-p4-app8m-20261118`, with private permissions. The source repository only contains the filtered verification receipt.

### What didn't work

- The sizing CLI is installed as a Python module in the ESP-IDF environment. The attempted `esp_idf_size --archives` executable reported `command not found`. Running the matching SDK Python with `-m esp_idf_size --archives` produced the linker map attribution.
- Boot still logs the preexisting `nat-import crashed: it links to path_open, which picocalc-os does not give a module` error from the developer probe. The same error appears in pre-migration traces.

### What I learned

The flash capacity, partition length, and filesystem's reported usable size are different measures. The app receives 8 MiB at a fixed address. The FAT partition receives 8,000 KiB raw and reports 7,900 KiB after initialization. The upper 16 MiB of the detected flash remain outside this table.

### What was tricky to build

The old table's store and files share the region into which the app allocation grows. The new data ranges had old filesystem bytes from higher offsets, so I erased the relocated store and FAT area before the first mount. The lower credentials region was outside the readback and write ranges.

### What warrants a second pair of eyes

Review the backup ranges and offsets before reuse on a different device. The script deliberately accepts the old four-mebibyte layout only. Applying just the app image to an unmigrated unit leaves its old table active.

### What should be done in the future

Use the new layout for subsequent app-only flashes. Retain the rollback set while this device is being qualified. Further increases would need a new allocation decision, especially if using the chip addresses past the current 16 MiB table.

### Code review instructions

- Read `port/esp32p4/partitions.csv` and `scripts/01-expand-p4-app-partition.sh`.
- Inspect `various/p4-app-partition-8m.txt` for the decoded tables, the image and table hashes, and the firmware's boot-time observations.

### Technical details

The app size grew from `0x400000` to `0x800000`. The migrated image for the grouped checkpoint is `0x3fc360` bytes. The relocation erased `0x7f0000` bytes starting at `0x810000`. The backup reads `0xff0000` bytes from `0x10000`, plus the separate 4 KiB partition-table sector at `0x8000`. The installed bootloader was retained.

## Step 8 — Apply selected-task changes to the current file

The grouped view now supports the original Agenda's checkbox toggle, F3 edit and confirmed F5 deletion. I verified the write bytes in the simulator and native emulator, then installed and exercised the new native firmware on the resized PicoCalc. The partition change and its first boot are in `7c405c4`.

### Prompt Context

See Step 1 for the user's full parity goal. These operations bind the normalizer and rendered selection to the real notes file while preserving the behavior when another world changes it.

### What I did

- Added the typed `agendaMark` entry, and validated it in the Wasm and RV32 reactor contracts. The original stored-line parser supplies completion state and the text start. F3 initializes the prompt with the raw task text. Backspace uses a UTF-8 boundary and counts supplementary code points as two UTF-16 units for the existing append limit.
- Ran all changes through a fresh `nw_fs_read` and the matching settlement. An operation on an existing task copies its raw line from the retained snapshot. `find_line` chooses the first unchanged copy in the current file, matching the original app. The byte splices preserve indentation, other lines and the file's separator behavior. A missing exact match updates the view and emits the conflict status with no write.
- Bound F5 confirmation to the raw selected line. A different key cancels confirmation. Valid prompt edits pass through the typed normalizer before requesting a fresh file.
- Added original-versus-Wasm byte comparisons and RV32 emulator checks. Added `scripts/02-check-p4-agenda-mutations.sh` for the board check. It leaves an empty notes file after the verified fixture run, and keeps the new app image on the PicoCalc.

### Why

The notes file is shared by multiple worlds. An index from an older snapshot cannot identify the current line. The exact-line match preserves intervening edits to other lines, while a changed selected line forces a reload. The typed normalization and checkbox rules are shared by both generated targets, and the reactor continues to own capability authorization and async tokens.

### What worked

- The original-versus-Wasm simulator check matched six cases, including a bare task with a Unicode title, F3 with Unicode backspace and date normalization, first-match deletion of duplicate lines, deletion of a final line, clearing confirmation on navigation, and an external write during an edit. Creation, grouping and durable reminder checks also passed.
- The native ELF loaded under the emulator and produced the expected text writes and conflict status. The app tests and all 34 native integration tests passed.
- On the ESP32-P4, the same native image changed a disposable file through Space, F3 and two F5 presses. The first F5 left the exact bytes unchanged. The captured compositor framebuffer showed the edited completed task and the deletion status. The synthetic key input went through the keyboard driver and compositor on the live board. The bus counters reported zero I²C and SPI errors during the run.
- On one boot after filesystem initialization, the bundled native compile took 718.218 ms and peaked at 700,312 bytes in its compiler allocator. Agenda published its first response at 2.137 s with 183,437 world bytes. The first frame-producing turn was 1.458 ms. Eighteen frame-turn samples during the synthetic edit sequence ranged from 0.760 to 1.012 ms. The final panel-enabled firmware uses 4,180,208 of its 8,388,608 bytes.

### What didn't work

- Earlier shell reads missed the returned serial port inside the sandbox. The direct USB check outside the sandbox identified the CH343 and the live console replied to `cji status`.
- The two-second target is still slightly above threshold in this single mutation-build boot. The fresh filesystem differs from earlier timing fixtures. These measurements cannot establish a speedup over the earlier hardware runs.

### What I learned

An edit to an existing task involves both a parsed record and the original raw line. The record resolves the checkbox and text boundary. `parseTask` also normalizes the cooked title for rendering. For writes, the raw line preserves indentation and tokens that the title intentionally omits.

### What was tricky to build

Deleting the final unterminated line must consume the preceding separator, while deleting a line followed by a newline consumes that newline. Repeated identical tasks resolve to the first byte-identical match, even when selection was on the second. The simulator differential checks both cases.

### What warrants a second pair of eyes

The runtime can detect edits made before the fresh read. The existing filesystem API leaves a separate window between that read and the queued write. The fixed buffers for the prompt, selected line and normalized result also account for most of the increase in the native world footprint.

### What should be done in the future

Finish the F6 Editor capability handoff and exact prompt diagnostic text. Retest cold startup with comparable notes across targets. Capture a physical key and a visible LCD frame so that input-to-panel latency can be measured independently from the Agenda event turn.

### Code review instructions

- Review `worlds/agenda/wasm-world.c` at `request_change`, `change_file`, and `key_event`. The typed glue and checkbox function live in `compile.js` and `entry.typed`.
- Run the parent ticket's `04-check-wasm-world.mjs` and `09-check-rv32-world.mjs`. See the linked JSON receipts in `various/` for results.
- Inspect `various/p4-task-mutations.txt` and `p4-task-mutations.png` together. The serial snapshot is a compositor framebuffer capture, and the test used injected keys.

### Technical details

The filesystem writes cross the existing notes directory capability. Write and read tokens are distinct and the reactor ignores invalidated refresh responses. No ELF slot capacity increase was needed for the sixth typed entry jump. The 8 MiB flash partition leaves 4,208,400 bytes for this firmware's future system and app changes.

## Step 9 — Publish the task-mutation and flash-layout milestone

The implementation and powered PicoCalc evidence are in `09bee0c`. The technical report “PicoCalc Agenda — Editing a task in a shared text file” explains the byte-level splices, read/write conflict boundary, typed runtime contract and powered measurements. Its push advanced go-go-parc `origin/main` to `a7714a2`. The resized board remains on the verified panel-enabled native Agenda image.

## Step 10 — Open the selected task file in Editor

F6 now uses the same single-file permission model as the original Agenda. The real Wasm and RV32 worlds opened Editor, saved through the derived file handle, and displayed the result again after focus returned. A separate lifetime fixture held references after refusal, timeout and replacement to verify that the kernel enforced each revocation.

### Prompt Context

See Step 1 for the complete original workflow requirement. This checkpoint covers the capability handoff from Agenda to Editor, then back to the updated Agenda view.

### What I did

- Added `nw_fs_at`, `nw_ask_file`, and `nw_revoke` to the common native SDK. File derivation uses the existing `fs_at` checks. File asks accept a valid, held, passable, narrowed filesystem file and construct the usual message marker in the kernel. The public plain-JSON ask remains subject to its established validation rules.
- Added F6 handling in `worlds/agenda/wasm-world.c`. It stores the pending grant and request token separately from the previous successful grant. An accepted request revokes the old grant before opening Editor. Refusal, timeout or synchronous failure revokes the pending grant and keeps the accepted one.
- Added end-to-end simulator coverage using the existing Editor with no notes directory claim. Added a separate probe to retain received handles and assert their access and lifetime. Extended the RV32 emulator checks and added a firmware flash and smoke test in `scripts/03-check-p4-agenda-editor.sh`.

### Why

The receiver already implements a capability-scoped open protocol. Reusing it means Editor can directly read and write the document while the Agenda directory stays with its owner. Restricting the SDK operation to a narrowed file keeps the scope explicit and shares the existing kernel delivery and authorization paths.

### What worked

- The simulator saved `- firstX` in `todo.txt`, left a sibling file unchanged, and showed the saved text in Agenda after return. It independently demonstrated that the recipient could read the one file, could neither name a second path nor forward the grant, and could not use grants revoked after refusal, timeout or replacement. The prior grant remained usable across both failures.
- RV32 emulation checked the request arguments, timeout, accepted handle, revocation order, compositor focus and error statuses. The application and 34 native integration tests all passed.
- The assembled P4 compiled the bundled RV32 image and opened its real bundled Editor. Two CRC-checked framebuffer captures show Editor reporting a successful save and Agenda displaying the updated title after reopening. The FAT readback confirms the changed line. The test restored the previously empty task file. I²C and SPI reported zero errors.
- This single cold boot compiled in 722.012 ms with a 701,264-byte compiler allocator peak. Agenda's response was at 2.139 s with 184,419 world bytes. Its first publication turn was 1.515 ms. The linked Wasm world is 65,459 bytes and the native ELF is 65,300 bytes. The firmware uses 4,182,208 bytes of the 8 MiB app partition.

### What didn't work

No new test failures occurred in this checkpoint. The boot sample still exceeds two seconds. The board experiment used injected input and captured compositor memory, so a physical keyboard-to-LCD measurement remains open.

### What I learned

The message payload and the actual grant travel together. The marker is just a serialized handle ID. The kernel records the attachment and grants it on delivery. A receiver may retain the marker or wrapper after revocation, but subsequent uses go through the handle table and fail.

### What was tricky to build

The accepted and pending capabilities must remain distinct across asynchronous turns. Dropping the accepted grant when opening a new request would make the original Editor file unusable on refusal. The timeout test also lets the receiver return a late success and checks that the late reply does not open Editor.

### What warrants a second pair of eyes

Check sender ownership, the child-file requirement and the revocation branches together. The SDK's private CJI operations share the same kernel dispatch switch. Existing callers still use their previous message validation. A focused hardware run tests one successful handoff, and timeout/refusal are covered by the host environments.

### What should be done in the future

Match the original status text for invalid prompt tokens and check timer and refresh semantics against the original. Measure a powered Wasm/RV32 cold series with equivalent notes files and capture physical input and LCD response.

### Code review instructions

- Follow `NW_FS_AT`, `NW_ASK_FILE`, and `NW_REVOKE` in `nucleus/native.c`; see `sdk/nw.h` and `nw_wire.h` for the API.
- Follow `open_editor` and `editor_reply` in the shared reactor. Run the parent ticket's Wasm and RV32 harnesses. Their receipts and the two hardware screenshots are under this ticket's `various/`.
- The board script checks for an empty or absent task file before setting up its fixture. It flashes the application at the existing offset in the 8 MiB layout and leaves the tested build on the board.

### Technical details

The ask uses a three-second timeout and sends the same `{file, name}` payload that the original Editor receives. The wire additions are appended after the existing public operation numbers. No typed parser signature or executable slot size changed in this checkpoint.

## Step 11 — Publish the Editor handoff milestone

The SDK and reactor changes, simulator and emulator checks, and powered board evidence are in `39ebfa7`. I pushed “PicoCalc Agenda — Passing a single file to Editor” to go-go-parc main at `4b946f1`. The report explains the file scope, kernel authorization, request and grant lifetimes, and the verification boundary of the two framebuffer captures.

## Step 12 — Match prompt diagnostics and calendar refresh

The Agenda port now reports the failing date or time token in the original diagnostic style. The 15-second timer also follows the original distinction between checking known reminders and refreshing notes from storage. The Wasm simulator and RV32 harness cover those behaviors, and the powered board displayed both token errors while leaving the notes file untouched.

### Prompt Context

See Step 1 for the feature-identical typed Agenda goal and Step 10 for the remaining prompt and refresh work.

### What I did

- Added `EntryError` in the combined typed source prelude and checked its two offsets and field types in `compile.js`. The generated `normalizeEntry` takes the record by address and writes a half-open UTF-16 span only for invalid dates and invalid times. The C reactor renders the original message around the failing span.
- Preserved the open prompt and file contents on parse errors. Restored the original app's title, description and calendar icon. The visible status uses the display's established clipping for long messages.
- Split the timer from storage polling. At each 15-second tick, update clock-derived grouping if the calendar day changed, then check reminders against the current snapshot. Reread an external file when the snapshot is more than five minutes old or the app receives focus. A coalesced stale read checks newly loaded reminders once. For cached evaluation, scan the retained source lines in file order.
- Keep fired identities in process memory even if the persistent-store write fails. This lets the notification through and suppresses duplicate alerts in the current process. Successful storage still supplies restart persistence.

### Why

A typed parser has the source positions when a diagnostic is produced. Passing the span avoids looking for a repeated token or treating UTF-8 byte offsets as UTF-16 positions. Separating the storage clock from the reminder and calendar clocks lets a timer update the view and deliver alarms without allocating a replacement notes snapshot every 15 seconds.

### What worked

- The generated Wasm and RV32 fixtures passed 3,924 calendar/time combinations and 319 full prompts, including exact half-open error spans after surrogate pairs and on repeated time tokens. The native typed instructions use 30,840 bytes.
- The live host simulator matched the six original prompt error texts and checked that the prompt and file bytes were preserved. The original and Wasm apps showed the same midnight grouping and reminder order. Both ignored an external edit until the 315-second tick, then displayed its task and emitted its due reminder.
- The RV32 world harness checked the exact five-minute boundary, cached notification, diagnostics, grouping, writes, Editor handoff, and reminder restart. The app and 34 native integration tests passed.
- The PicoCalc frame captures show the offending date and time. The board's before and after reads show the empty notes file is unchanged. Both snapshots passed CRC and the I²C and SPI counts show zero errors in that test.

### What didn't work

- Running `node "$n/scripts/04-check-wasm-world.mjs"` with the record declared in `entry.typed` reported `SyntaxError: 409:1: expected function` because the combined source had already started its function section. I moved the record next to `Task` before the first function.
- The next test reported `SyntaxError: 437:17: expected identifier`. A nested block ended with a bare return, which the typed grammar does not accept. An unconditional helper now writes both fields and returns the passed status. Each error branch uses a supported conditional return.
- The first virtual-time fixture asserted `frames[0][0] < 2000`; the observer was still waiting in its own two-second writer turn when the retained initial frame arrived. The adjusted bound checks that frame before the first tick. The later wall-time and reload assertions keep their one-second bounds.

### What I learned

There are three relevant time representations. Kernel monotonic microseconds measure the relative age of the snapshot, the wall clock measures elapsed time relative to an absolute due instant, and a packed local civil date determines the grouping. They can change independently, so the timer checks each on its own terms.

### What was tricky to build

The cached snapshot uses NUL terminators in place of line feeds and the task index is sorted for display. Tracking the snapshot's byte length lets the reminder walk span empty lines and preserve source order. Maintaining a reminder flag alongside the asynchronous file token prevents an ordinary focus read from delivering an extra notification and lets an overlapping stale tick ask for a reminder check on settlement.

### What warrants a second pair of eyes

The cached path still parses due-date candidate lines at each tick. The test covers timing and behavior, while a dense notes fixture is needed for a meaningful device CPU and memory comparison. Very long status strings are clipped for the native screen budget. The powered screenshots came from a compositor framebuffer and the keys were injected.

### What should be done in the future

Run the same powered cold series on Wasm and RV32 with equivalent notes. Measure the time between Agenda initialization and the first filesystem request, which appears substantial in the current native trace. Measure physical keyboard input and the visible LCD response independently.

### Code review instructions

- Start at `EntryError` in `worlds/agenda/reminder.typed`, then follow `normalizeEntry` and `start_save`. Run the parent ticket's `16-check-entry-tokens.mjs`.
- Read `refresh_tick` and `check_reminders` in `worlds/agenda/wasm-world.c` and run the parent ticket's Wasm and RV32 world harnesses. Read the JSON receipts and board snapshots under `various/`.
- For a board smoke run, use `scripts/04-check-p4-agenda-diagnostics.sh` with the panel-enabled profile and an empty or absent notes file.

### Technical details

The linked Wasm world is 67,434 bytes and the RV32 ELF is 66,348 bytes. The RV32 reservation remains 48 KiB. A powered diagnostic smoke boot measured 723.799 ms for compilation, 709,796 peak compiler bytes and 2.136 s through first publication with 185,519 world bytes. Its first publication turn took 1.496 ms. The assembled firmware is 4,183,824 bytes in the 8 MiB partition.

## Step 13 — Record the powered native baseline and publish the report

The implementation checkpoint is `88f9e63`. I rebooted the installed image three times using the parent ticket's `scripts/10-measure-agenda-boot.py --port /dev/ttyACM0 --trials 3 --world-profile`. Cold first response was 2,141,472 µs, 2,130,166 µs and 2,138,179 µs. The compile median was 723,693 µs and the compiler peak was 709,796 bytes in all three runs. The first response reported 185,519 world bytes each time. The raw per-world timing is in `various/p4-prompt-refresh-cold-rv32.json`.

The first file request followed Agenda initialization by 539,078–539,581 µs. Sixteen world startup attempts that began inside that interval account for about 332 ms of measured execution. The notes request itself took 113–126 ms to return. This separates the compiler from a specific post-initialization delay for future comparison. The report “PicoCalc Agenda — Keeping prompt errors and reminder refresh consistent” includes the typed record contract, the timer flow and the observed boot profile. The vault push advanced go-go-parc main to `4b91803`.

## Step 14 — Prepare the identical powered images and diagnose the keyboard fault

I built the full typed Agenda application into two powered P4 images with the same source, SDK configuration and 8 MiB partition table. The matching manifest check permits only the Agenda engine to differ. The first full hardware comparison reached the Wasm workload, then the keyboard controller stopped acknowledging I²C. The harness restored RV32 and the original zero-byte notes file.

### Prompt Context

The active goal asks for powered Wasm and RV32 measurements, feature parity and an independent physical keypress-to-panel measurement. This attempt uses the same nonempty disposal fixture and checks each resulting file state.

### What I did

- Added `scripts/05-build-powered-targets.sh` to build and retain both variants from one configured ESP-IDF tree and compare the emitted SDK configurations and partition tables.
- Added `scripts/06-qualify-powered-targets.py` to assert equal manifests, require an existing empty task file, seed the same three tasks, sample cold startup and settled rebuilds, and exercise toggle, edit, two-step deletion, creation and Editor save. It records the results and preserves the final RV32 configuration and empty notes file.
- Added per-trial I²C and SPI counters to the parent boot harness, and changed the workflow harness to retain timings even when the keyboard phase fails.

### Why

A common fixture and power state are needed to compare compile and publication times across targets. A working keyboard and framebuffer capture are stronger evidence for workflow acceptance than simply observing that the compiled module booted. Recording the bus health with each trial distinguishes those conditions.

### What worked

The two images built and matched on their SDK configuration and world inventory. Wasm completed four cold and four settled compilation/publication runs. The initial Wasm flash probe answered `cji status`. Recovery flashed a verified RV32 image, obtained the same console response, and confirmed the empty task file. The failed attempt's measurements and observed bus errors are in `various/powered-wasm-peripheral-fault.json`.

### What didn't work

- The first qualification invocation stopped with `This fixture requires an existing empty notes/todo.txt.` The independent serial `ls notes` and `cat notes/todo.txt` confirmed a zero-byte file. I changed the guard to match the named zero-byte directory entry and its successful response.
- The Wasm workflow emitted `I2C transaction unexpected nack detected` and all 1,231 observed I²C transfers failed. No keyboard action changed the file. The framebuffer capture reported `BAD: 45839 px` amid serial output interleaving. The hardware fault also appeared on the subsequent RV32 boot, so the Wasm timings alone cannot establish a healthy powered comparison.
- I requested a full PicoCalc power cycle. The ESP32 was still reachable over serial and no user data was overwritten. The device bus source documents that the attached keyboard controller can remain stuck across an ESP32-only reset.

### What I learned

A successful compile and Agenda publication can coexist with an unresponsive keyboard controller. A console reply confirms the processor link, and the bus counters and actual notes writes establish separate parts of the acceptance test.

### What was tricky to build

The normal cleanup must run after a failed workflow without treating the failure as a programming or timing result. The updated harness retains both the requested timing evidence and a per-target workflow verdict even when input is unavailable.

### What warrants a second pair of eyes

Watch the boot buses across the full reset series. The existing `hold` command reduces the risk of resetting mid-transaction, and a full handheld power cycle may still be required. Treat any trial with bus errors as a different hardware condition.

### What should be done in the future

Retry with the keyboard controller responding. Retain the actual powered workflow comparison and repeat the cold series for the scheduler candidate. Obtain a camera sequence for physical latency.

### Code review instructions

Read `scripts/05-build-powered-targets.sh`, `scripts/06-qualify-powered-targets.py`, and the parent compiler ticket's `scripts/10-measure-agenda-boot.py`. Use the 8 MiB layout and verify a zero-byte fixture before running either profile.

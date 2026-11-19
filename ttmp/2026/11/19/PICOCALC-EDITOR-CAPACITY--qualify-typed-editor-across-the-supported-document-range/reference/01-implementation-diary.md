---
Title: Implementation diary
Ticket: PICOCALC-EDITOR-CAPACITY
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T00:42:56.645842254-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Identify large-document capacity failures and fix sparse searches

Editor had already completed the normal Wasm and RV32 hardware workflows. The full-size host fixture isolated two independent failures. An absent query ran over its 200 virtual ms turn allowance. Preview stopped adding content when the next block could exceed its screen buffer.

I wrote the capacity design before implementing the bulk scan. The Wasm fixture now completes the previously failing absent query and preserves the file bytes. The preview fixture still reproduces its original truncation.

### Prompt Context

**User prompt (verbatim):** "I want them to be 100% typed javascript"

**Assistant interpretation:** Keep Editor application decisions in typed source and validate behavior at the supported file size. Shared OS resources and generic UTF-16 operations are provided by the SDK.

**Inferred user intent:** Make typed application source sufficient to maintain and build the real Editor for the device.

**Commit (code):** `3b355cc` — "Accelerate full-size typed Editor searches with bounded UTF-16 scans"

### What I did

- Created `PICOCALC-EDITOR-CAPACITY` and wrote the analysis and implementation guide. The reMarkable upload returned `OK: uploaded PicoCalc Editor Full Size Search and Preview.pdf -> /ai/2026/11/19/PICOCALC-EDITOR-CAPACITY`. A second check reported that the document already existed.
- Added `typedSdkSeek` and registered it in the compiler signatures and RV32 import table.
- Replaced per-unit newline traversal and sparse candidate traversal with bounded range seeking. The typed find implementation still owns folding, interval order, matching, highlighting, and cursor placement.
- Ran `make -C picocalc-os typed-world-reactor` and the existing three-way workflow driver with `--find`, `--markdown`, and `--large --keep-fixture`.
- Recorded the replay in `scripts/01-check-search-capacity.sh` and the stress output in `various/editor-large-host-seek.json`.

### Why

The previous loop crossed the typed character-access boundary for each UTF-16 code unit. The scanner can skip directly to a character that matters while keeping the application's Unicode policy explicit and testable.

### What worked

- The 65,536-byte absent-search fixture completed in Wasm under the 200 virtual ms profile with zero faults. The normalized save also completed.
- The 50 virtual ms find fixture matched four Wasm/reference framebuffer captures and the RV32 frame trace. The Markdown fixture matched five framebuffer captures and its RV32 trace.
- The updated app measured 80,169 bytes for Wasm and 239,684 bytes for the RV32 ELF.

### What didn't work

- The initial sandboxed Node run reported `spawnSync /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/build/picocalc-host EPERM`. The same invocations completed with the local child-process restriction lifted.
- The preview test still ends before the last paragraph of the 21,614-byte fixture. The SDK saw no app fault. The app clipped the tree while building it.
- The generated diary header was initially extracted from the body. `docmgr doctor` reported `invalid_frontmatter` and `cannot unmarshal !!str`. I restored valid ticket metadata and reran the checker.
- The physical board serial device was absent during this pass.

### What I learned

An absent first character benefits from bulk scanning even in a large document. A repeated first character can still force many typed comparisons. Frame serialization and late-file visual layout have separate costs.

### What was tricky to build

Case-insensitive ASCII search must also consider Kelvin sign and dotted I. A skipped dotted I would move the folded coordinate of later matches. The scanner returns every dotted I to typed code even for queries that cannot start with its folded form.

### What warrants a second pair of eyes

Review the RV32 import order and seven-argument call path alongside `editorFindSpan`. Compare reported match positions after dotted I and at UTF-16 surrogate boundaries.

### What should be done in the future

Measure dense candidates and matches near the end of the file. Implement bounded preview windows so the last paragraph is reachable and physical frame size remains independent of file length.

### Code review instructions

Start with `editorFindSpan`, `editorLineEnd`, then `typedSdkSeek`. Run `scripts/01-check-search-capacity.sh P4_GCC RV32EMU OUTPUT_DIRECTORY` from the repository. The script checks full-size search and save, and reports the preview failure as a separate result.

### Technical details

`typedSdkSeek` accepts a live SDK string view, a half-open UTF-16 span, and four exact unit values. It returns the span end for a miss or an invalid span. Its allocation and active-length checks happen once per call. The typed program supplies all four values.

## Step 2: Stream wrapped Markdown preview rows through the screen budget

Preview could only show the prefix that fit in one frame. I moved wrapping to the typed preview state machine and used a ring for rendered rows. Downward scrolling advances the parser, and backward scrolling only reparses if the requested row is older than the ring. This lets the original 21,614-byte reproducer display its final paragraph with the same pixels as the JavaScript Editor.

### Prompt Context

**User prompt (verbatim):** See Step 1.

**Assistant interpretation:** Preserve preview behavior in the typed Editor, including reading beyond one frame of source content.

**Inferred user intent:** Keep the Editor feature usable under the PicoCalc display and runtime constraints.

**Commit (code):** `3d98d20` — "Stream typed Editor Markdown previews as bounded display rows"

### What I did

- Replaced the preview serializer in `preview.typed` with a typed source cursor, word wrapper, 36-row ring, and 17-row frame window.
- Routed deferred preview work through `typedWorldEvent`. Exit clears its pending token, and a valid completion rechecks the currently requested viewport.
- Reused the compositor's line drawing with its new `wrapped` option. The shared C SDK provides one row scratch allocation and a larger existing text scratch buffer.
- Extended the cross-target test driver to compare compositor-visible rows, identical Wasm framebuffers, and RV32 output. The large preview cases scroll past EOF, then back far enough to exercise reparsing.
- Updated the original stress script to navigate to the last preview rows before looking for the EOF marker.
- Wrote the implementation walkthrough and included `various/preview-end-wasm.png`. Remarquee returned `OK: uploaded PicoCalc Editor Search and Preview Implementation.pdf -> /ai/2026/11/19/PICOCALC-EDITOR-CAPACITY`.

### Why

The frame limit applies to each publication. The display can show 17 rows at a time and has no need for the full document. A typed forward continuation avoids reparsing on each Page Down. A bounded ring also supports local backward movement without storing every rendered row.

### What worked

- The mixed Markdown case matched five reference framebuffers and the RV32 trace at 50 virtual ms.
- The 21,614-byte preview matched six framebuffers and the RV32 trace at 50 virtual ms. Its viewport includes `END OF PREVIEW` after Page Down and matches the reference after Page Up.
- The 18,047-byte single-line Unicode fixture matched six framebuffers and the RV32 trace at 200 virtual ms.
- The stress script reported zero faults and matching file bytes for both JS and Wasm across 65,536-byte save, 65,536-byte absent search, and 21,614-byte preview.
- The end-of-preview PNG matched the JavaScript capture byte for byte. Its SHA-256 is `0291bbb52f694243b20492ccc70015f53e4effff8af0b924123d24f578c0e6e7`.

### What didn't work

- `make -C picocalc-os typed-world-reactor picocalc-host` reported `No rule to make target 'picocalc-host'`. The working target is `build/picocalc-host`.
- The first `02-check-editor-world.mjs --markdown` compile reported `SyntaxError: 613:9: expected identifier` because the typed grammar supports single-statement early returns and does not accept a return as a statement inside a braced block. I separated the guard from the returned call. An ad hoc Node compile command also escaped the input newlines incorrectly and raised `ENOENT`. The ticket script reads the source list correctly.
- The 18,047-byte Unicode fixture initially logged `editor crashed handling open: ran past its turn budget of 50 virtual ms` before preview ran. The passing qualification uses the 200 virtual ms profile already selected for typed Editor on PicoCalc.
- The initial ESP-IDF invocation used `/home/manuel/esp/esp-idf/export.sh`. It selected 5.1 and reported `Toolchain file /home/manuel/esp/esp-idf/tools/cmake/toolchain-esp32p4.cmake not found`. The prior qualification logs identify `/home/manuel/esp/esp-idf-5.4.2/export.sh` as the P4 toolchain.
- `/dev/ttyACM0` and `/dev/ttyUSB0` were absent during this step, so the latest preview was not installed on the handheld.

### What I learned

A source line, a Markdown block, and a row on the LCD have distinct lifetimes. Paragraphs keep their current display row across source lines, while indentation and text color belong to each resulting row. The display frame can be bounded independently of both a source line's length and the file size.

### What was tricky to build

Splitting a long word at 49 code points must keep the last full-width fragment pending when the next unit is a delimiter or EOF. A preceding nonempty row must finish before emitting pieces of an overlong word. The ring must reserve its current write slot even before that row is finished. Otherwise backward navigation can display stale headers with partially overwritten text.

### What warrants a second pair of eyes

Review EOF clamping when the requested row is past the end, cancel and reopen while a timer is pending, and scratch slot 7's lifetime across a delayed save completion. Verify font and geometry constants against the PicoCalc compositor's small font and app margins.

### What should be done in the future

Qualify both new firmware artifacts on the board. Validate dense search and near-EOF cursor movement separately. An imported physical line with inline Markdown still passes through the 4,096-unit formatter buffer, and adversarial delimiter runs can make its conversion expensive. Plain text and fenced code stream directly from the document.

### Code review instructions

Read `editorPreviewSource`, `editorPreviewWord`, `editorPreviewReady`, and `editorPreviewFrame`, then the settle branch in `typedWorldEvent`. Replay `scripts/02-check-preview-capacity.sh P4_GCC RV32EMU`. The harness retains each capture directory and evaluates the original app's frame with the compositor's actual wrapping function.

### Technical details

The ring uses 3,600 UTF-16 units. Each of 36 entries holds one length unit, one style unit, and space for 49 surrogate pairs. The generic compositor receives at most 17 already wrapped row items. The frame bounds therefore depend on viewport geometry rather than document length.

## Step 3: Separate the two remaining large search workloads

The full-size absent query passed after the UTF-16 scan change because the first query code unit was also rare. I added two fixtures to isolate a search with thousands of first-unit candidates and a successful search whose cursor lands at the end of the file. Both reproduce a turn overrun under the device's simulation profile.

### Prompt Context

**User prompt (verbatim):** See Step 1.

**Assistant interpretation:** Verify full-file operation before calling the typed port qualified.

**Inferred user intent:** Editor should remain responsive to realistic searches across an entire supported document.

### What I did

- Added `--adversarial` to `PICOCALC-TYPED-WORLDS/scripts/05-measure-large-editor.mjs`. It preserves exact input size and runs both variants with the same navigation sequence.
- Used a repeated `text ` document with the absent query `text text z`. For the late-hit case, replaced the final nine bytes with `needlezzz` and searched for `needle`.
- Preserved the fault summaries in `various/editor-search-traversal-host.json`.

### Why

Candidate comparison and late viewport construction affect different execution paths. The original `zzz` fixture skipped most repeated input after the bulk seek change. It was too narrow to detect either of these costs.

### What worked

Both JavaScript runs completed. The dense query produced the expected miss status. The sparse query moved to line 852, column 1. All four test runs preserved exact file bytes.

### What didn't work

Both Wasm runs logged `editor crashed handling key: ran past its turn budget of 200 virtual ms`. The marker was missing in each final frame. The fault identifies the event but does not distinguish matching from frame generation.

### What I learned

A case where the first query unit is rare does not qualify full-document search. A successful sparse query also requires positioning, viewport generation and highlights to finish within the turn budget.

### What was tricky to build

The late-hit test keeps the same file size as the absent-query tests, and the expected marker is a source coordinate rather than the presence of the token in the input. This avoids treating a preexisting row or an unchanged screenshot as a successful match.

### What warrants a second pair of eyes

Check `editorFindNext` and `editorDocumentFrame` independently before attributing all cost to either path. `editorLocate` and `editorFindMarks` can each repeat a walk over preceding display rows.

### What should be done in the future

Slice typed search on a matching completion token and keep enough row position metadata for a late viewport. The kernel starts a fresh budget per segment in `nucleus/kernel.c:run_segment`. An `NW_LATER` search can keep later keyboard events ordered while allowing other worlds to run. Handle unrelated settles without prematurely finishing the pending keyboard turn.

### Code review instructions

Build the usual `--large --keep-fixture` cross-target fixture, then run `05-measure-large-editor.mjs FIXTURE OUTPUT --adversarial`. Inspect `wasm-find-tail/out/uart.log` and `wasm-find-dense/out/uart.log` under that output.

### Technical details

Each file has 65,536 bytes. Source position 852:1 identifies the final nine-byte line after carriage-return normalization. The dense absent query has a repeated prefix that matches at multiple positions per physical line.

## Step 4: Rebuild and qualify both Editor backends on the physical PicoCalc

I built matched PicoCalc firmware with source SHA-256 `7c9d1b7bfdf78678354cf023b31d59acec28b24054c60cb52f1761d5508a4837`. The standard edit, save, find, preview and discard workflow passed on Wasm and RV32. The board compiled the source from its bundle during each boot.

### Prompt Context

**User prompt (verbatim):** See Step 1.

**Assistant interpretation:** Verify that the preview work runs on the handheld through the actual compiler, keyboard path, display, and filesystem.

**Inferred user intent:** Maintain a working device image and keep repeatable evidence for later iterations.

### What I did

- Ran the typed-worlds ticket's `03-build-editor-firmware.sh` for both targets with `/home/manuel/esp/esp-idf-5.4.2/export.sh` and the existing matched profile.
- Compared the application manifests and confirmed that only the expected Editor engine entry differs. The hardware runner matched each partition table with the saved board table, used app-only flashing, and checked flash hashes.
- Ran `04-qualify-editor-on-p4.py --port /dev/ttyACM0` against the paired artifacts. Saved the structured receipt in `various/p4-preview-build-workflow.json`.
- Added a separate physical long-preview fixture using the installed RV32 build and the console file-transfer path.

### Why

Host Wasm framebuffer comparisons and an RV32 emulator establish functional parity at their respective test boundaries. The board run also exercises bundle generation, local compilation, native or Wasm loading, the P4 scheduler, storage, keyboard driver, and RGB565 framebuffer.

### What worked

- The paired images were 4,257,360 bytes for Wasm and 4,450,848 bytes for RV32. Their app partition is 8 MiB.
- Wasm compiled in about 1.78 s and loaded in 161 ms. RV32 compiled in about 2.86 s and loaded in 12.7 ms. Compiled modules measured 81,773 and 239,732 bytes respectively.
- Both standard runs preserved the exact 20 saved bytes, discarded a later edit, removed the test directory, and produced two CRC-verified screenshots apiece. I visually inspected the preview screenshots. Both display the heading and two list items.
- Both standard runs reported zero I²C and SPI errors. The final installed profile is RV32.
- The paced transfer acknowledged all 21,614 bytes. The RV32 preview accepted 57 Page Down events and produced two verified framebuffers with no Editor faults. I inspected the final PNG and verified that it shows `END OF PREVIEW` on the last displayed row. The scratch work directory was deleted after the run.
- The long hardware result and visual evidence are in `various/p4-preview-end-rv32.json` and `various/p4-preview-end-rv32.png`.

### What didn't work

- The sandbox hid the serial device nodes. A tool invocation outside the sandbox confirmed `/dev/ttyACM0` and the expected USB serial adapter. The board had remained connected.
- The first long-preview preflight stopped with `RuntimeError: scratch document was not created by Files`. The captured Editor showed the correct path. Opening a missing file yields a clean buffer, and the file is written only after save. I removed the empty scratch directory and changed the script to create the fixture via `put`.
- The first bulk stage ended at 20,494 bytes instead of 21,614. The console twice logged `unknown command putsYW5rIGxpbmUuCgpBIHJlYWRpbmc (try help)`. I changed the transport to pace writes within each console command and wait for the exact acknowledged offset before proceeding.

### What I learned

A missing-file capability can open Editor with an empty document before the corresponding filesystem entry exists. The board's console accepts append chunks, but application-level offset receipts are required to catch UART input loss from back-to-back larger writes.

### What was tricky to build

The test keeps firmware flashing separate from fixture staging and only operates on its own scratch directory. The main standard workflow uses a backup for recovery. The long run reuses the current RV32 firmware and avoids a third flash.

### What warrants a second pair of eyes

Review the exact-byte checks, the clean Editor precondition for `--resume-staging`, and the ordering of navigation and cleanup. Compare the CRC-verified screenshots with the source marker. The script checks transport and capture integrity, and the diary records the visual check of the final row.

### What should be done in the future

Keep the hardware profile and source hash paired with the next search and viewport changes. The dense and late-match regressions from Step 3 remain open.

### Code review instructions

Read the structured paired receipt and the test entry points `03-build-editor-firmware.sh`, `04-qualify-editor-on-p4.py`, and `scripts/03-check-large-preview-on-p4.py`. The last script expects one known typed backend already running.

### Technical details

The firmware application starts at `0x10000`. The generated board bundles contain typed source and a generic reactor. The Editor compiler fills that reactor on boot. The standard profile selects a 200 ms Editor turn budget and a 768 KiB world memory limit.

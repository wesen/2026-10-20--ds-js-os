---
Title: Implementation diary
Ticket: PICOCALC-EDITOR-INLINE
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T01:45:38.469747527-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Measure long formatted lines and unmatched delimiter work

The preview viewport can stream many rows, but its inline path still copies one source line into 4,096 UTF-16 units. I put an inline bold marker after the staging boundary and observed silent loss of the final text. A separate line of unmatched link openers exhausted the preview turn.

### Prompt Context

**User prompt (verbatim):** "I want them to be 100% typed javascript"

**Assistant interpretation:** Preserve the typed Editor's Markdown preview for imported lines across the supported document size.

**Inferred user intent:** Keep complete preview behavior without delegating Markdown policy to another language.

**Commit (backfilled from Git):** `44dcbf9` — "Measure and design full-line typed Markdown formatting"

### What I did

- Added the `--long-inline` group to the existing full-size Editor stress script.
- Ran matched 200 virtual ms host profiles with the navigation build. Archived `various/long-inline-before.json`.
- Created this ticket and wrote the typed compaction and uppercase-stream guide before implementation. The uploader returned `OK: uploaded PicoCalc Typed Editor Full-Line Markdown.pdf -> /ai/2026/11/19/PICOCALC-EDITOR-INLINE`.

### Why

The same preview path needs to handle both staging capacity and delimiter runtime. One test asserts that ordinary text after 4,096 units remains reachable. The other distinguishes unmatched delimiter processing from viewport clipping.

### What worked

The JavaScript reference shows the marker in both valid cases. The source remains byte-identical in all six runs. The two valid Wasm cases complete without an app crash.

### What didn't work

The valid Wasm heading and paragraph both miss `EOF INLINE`. In an initial comparison the malformed link line overran at 50 virtual ms on the JavaScript profile and 200 virtual ms on Wasm. Repeating under matched 200 virtual ms profiles logged `editor crashed handling key: ran past its turn budget of 200 virtual ms` on both.

### What I learned

A bigger scratch area would address truncation but leave repeated lookahead over unmatched link markers. The typed implementation can preserve the reference replacement order and skip literal stretches whose possible openers share the same failed close.

### What was tricky to build

The preview case puts the marker on a full new visual row after a 4,900-character word, so the instrumentation can search for the exact visible phrase. Pagination reaches the final row under the original renderer and under a future bounded-window implementation.

### What warrants a second pair of eyes

Review delimiter edge cases and pass composition. Validate uppercase expansion on the linked Unicode implementation and measure the added world memory on both targets.

### What should be done in the future

Implement the per-line scratch and resumable typed compaction, then exercise all three baseline cases and high-density inputs.

### Code review instructions

Read `editorMdPlain` and `editorMdStrip` in `worlds/editor/markdown.typed`, then `editorPreviewStage` in `preview.typed`. Run `scripts/01-measure-inline.sh RETAINED_LARGE_EDITOR_FIXTURE OUTPUT_DIRECTORY`. The expected pre-fix outcomes are stored alongside the guide.

### Technical details

The heading has 4,917 input bytes, the paragraph has 4,915 and the unmatched-link line has 4,911. All use 7 Page Down presses after entering preview. The UART frame marker checks output content separately from file preservation and faults.

## Step 2: Compact complete lines and stream heading expansion

The inline formatter now uses one full-size staging buffer and three resumable passes. It identifies complete replacements in typed code and copies the selected spans toward the beginning of the same buffer. The former truncation and unmatched-link overrun fixtures now pass on Wasm. The two 65,536-byte valid inputs also match the original Editor's visible rows on both compiled backends.

### Prompt Context

**User prompt (verbatim):** See Step 1.

**Assistant interpretation:** Carry the existing formatted preview through the supported file size and keep application decisions in typed JavaScript.

**Inferred user intent:** Run the real Editor on PicoCalc with predictable memory and faithful output.

**Commit (code):** `f828a63` — "Format full-size Markdown lines in typed Editor"

### What I did

- Added a generic 65,536-unit scratch slot, a checked cross-buffer copy, and ranged uppercase conversion to the shared typed SDK. Registered matching imports in both linkers.
- Replaced whole-line inline matching in `markdown.typed` with bounded opener and closer probes. Kept bold, code, and link passes in the same order as the JavaScript reference.
- Kept only the next word-length heading expansion and residual text in the small preview buffer. `preview.typed` continues to publish the existing visible row window.
- Stored line endings in the row checkpoint cache and optimized equality-only SDK seeking, eliminating repeated raw scans for a 64 KiB physical line.
- Used generic code-point counting and indexing for the logical cursor. Split the long-open snapshot work from its restore and frame step. A clean Esc records the current cursor and switches to Files without producing an additional Editor frame.
- Added a full-size expanding heading fixture, a full-size nested-markup fixture, and explicit cancel and cold-open scripts.

### Why

Formatting and row wrapping operate at different boundaries. The formatter needs a source line and a fixed semantic pass order. Row wrapping only needs a small window into the resulting text. Chunked formatting and bounded lookahead keep those lifetimes separate.

### What worked

- The 4,917-byte heading, 4,915-byte paragraph, and 4,911-byte unmatched opener fixture all complete in the Wasm 200 virtual ms profile, with exact input bytes and zero faults.
- The maximum-size heading includes Unicode expansions, a surrogate pair, nested bold and code inside a link, and its marker beyond a long link destination. The maximum-size dense input exercises repeated valid replacements. Wasm matches four and five reference framebuffers respectively, and RV32 reproduces both frame traces.
- The final preview regression also passes the 571-byte mixed Markdown example, the 18,047-byte plain Unicode line, the 21,614-byte preview, and the full-file late navigation workflow.
- Cancelling and reopening the dense preview produced matching edit and final-preview framebuffers. The cold-open test persisted and restored 1:65473 on the maximum-size physical line and matched the reference framebuffer.
- The implemented guide and simulator screenshot were uploaded to reMarkable. The uploader returned `OK: uploaded PicoCalc Typed Editor Inline Formatting Implementation.pdf -> /ai/2026/11/19/PICOCALC-EDITOR-INLINE`.
- The final typed outputs measure 88,255 bytes for Wasm and 240,452 bytes for RV32 ELF. The test's Wasm world uses the board profile's 768 KiB limit.

### What didn't work

- The full-line JavaScript reference initially logged `editor crashed handling open: ran out of memory (its limit is 2048 KB)`. The differential harness uses 8 MiB and 1,000 virtual ms for the reference alone on its two maximum-line workloads.
- The initial typed full-line open logged `editor crashed handling open: ran past its turn budget of 200 virtual ms`. Caching the line end and using a cheaper exact-unit scan fixed that open.
- The cold-open extension initially logged `editor crashed handling key: ran past its turn budget of 200 virtual ms` during clean Esc. The new Unicode scan by itself still left the redundant Editor frame. Avoiding that frame completed the close and exposed a separate open overrun when restoring the far column. Splitting snapshot capture and restore across receipts completed the cold open.
- The first cancellation harness searched UART text for a contiguous `EOF INLINE` phrase. The matched framebuffer showed the phrase across two rows. The harness now decodes the frame and joins its row text before checking the phrase.

### What I learned

Input staging, delimiter matching, uppercasing and viewport wrapping have separate bounds. Malformed link openers can share a failed ending and be preserved together. A Unicode uppercase expansion can outgrow its source width, so the wrapper needs converted text and real whitespace lookahead.

### What was tricky to build

The in-place write cursor cannot advance beyond unread input. A pass completes before its shortened length becomes the next pass's input. Heading conversion carries the unconsumed expansion across chunks, including while wrapping a single long word. UTF-16 cursor persistence counts supplementary characters as one position.

### What warrants a second pair of eyes

Review malformed closer handling and stream output at width 49, particularly adjacent backticks, delimiters at a 1,024-unit probe boundary, and expansions involving supplementary characters. Review cache invalidation of both saved line boundaries and the frame receipt that resumes a long-file open.

### What should be done in the future

Finish the physical memory and full-inline replay gates for these artifacts.

### Code review instructions

Start with `editorMdEmit`, `editorMdMatch`, `editorMdStep` and `editorPreviewUpper`. Run the ticket's `02-check-full-inline.sh`, then its cold-open and cancellation scripts using the indicated retained fixtures.

### Technical details

The formatting scratch uses 128 KiB of counted UTF-16. Each probe inspects up to 1,024 units, and a preview iteration charges eight work units for one probe. The typed-world record supports 80 scalar words and Editor uses 71. The row cache holds 36 records of nine UTF-16 units each.

## Step 3: Verify the final physical build and audit the port

The final Wasm and RV32 firmware both passed the physical standard workflow. I then staged the maximum-size formatted heading on RV32, opened its preview, and captured the final output before and after Page Down. The LCD contains `STRASSE` and the final `END EOF INLINE` marker. The tested RV32 firmware remains installed.

### Prompt Context

**User prompt (verbatim):** See Step 1.

**Assistant interpretation:** Validate the complete typed Editor on its real hardware entry point and preserve evidence that connects the firmware to source and behavior.

**Inferred user intent:** maintain a real PicoCalc Editor whose application logic is typed JavaScript.

**Commit (backfilled from Git):** `60a38f0` — "Qualify the complete typed Editor on the physical PicoCalc"

### What I did

- Verified that `worlds/editor/source.list` contains 11 typed sources and that the packaged 70,859-byte concatenation has SHA-256 `f37f60f3b0c646cd35f13c41bc893a136732ebe769e328cfb906b0fe7531a6ed`. Both firmware bundles contain that source and select `editor/compiled.bin` with the requested runtime engine.
- Ran the paired standard qualifier and the capacity ticket's `03-check-large-preview-on-p4.py --engine native --long-inline` on `/dev/ttyACM0`. Checked flash hashes, source compilation receipts, staged byte counts, the captured final output and scratch cleanup.
- Preserved the physical screenshots, paired results, and exact Editor startup world records in `various/`.
- Reviewed the prior capacity and navigation evidence, rechecked the original Editor's ten unit tests, and verified the final cross-target fixtures.

### Why

The host comparison verifies exact source bytes, workflow decisions and framebuffer parity. Physical tests independently verify that the selected typed entry compiles from source on the device, fits the world allocation, and reaches the hardware display and filesystem.

### What worked

- The final board compiled Editor in 1.99 s on Wasm and 3.14 s on RV32. Loader times were about 176 ms and 14.1 ms. The standard captures and exact 20-byte save fixture passed on both engines, alongside zero I²C and SPI errors.
- The boot world records show 528.0 KiB on Wasm and 710.1 KiB on RV32 against 768 KiB for each. RV32 reported 710.1 KiB before the maximum-line fixture and completed its preview with zero recorded faults.
- The staged file reached exactly 65,536 bytes. Both physical framebuffer captures passed CRC and show the heading with the final marker. Scratch cleanup confirmed that its directory was gone.

### What didn't work

Some glyphs in the Unicode workload appear as question marks in the PicoCalc font. The host frames and JavaScript oracle use the same display fallback. The frame trace verifies the Unicode expansion before drawing, and the physical capture verifies that the whole rendered heading reaches the final marker.

### What I learned

The active board app can stay fully typed while storage, file capabilities, Unicode tables and graphics live in shared runtime layers. Board memory usage and simulator process memory are separate measurements. The native world retains about 58 KiB of reported startup headroom.

### What was tricky to build

The full board run uses binary UART staging for a file that is too long to type conveniently. Validating each acknowledged offset guards against transfer loss. It verifies the display and cleanup separately from merely seeing the compiler return.

### What warrants a second pair of eyes

Match the source SHA with the pair receipts, the active world entry with the selected engine, and the final screenshot with the 65,536-byte fixture. For Unicode validation, inspect the parity frame trace in addition to the LCD font fallback.

### What should be done in the future

The Editor implementation and verification work in this ticket is complete.

### Code review instructions

Read `various/p4-inline-builds.json`, `p4-editor-worlds-at-boot.json`, and `p4-full-inline.json`, then inspect `p4-full-inline.png`. Replay the host steps in the design guide to regenerate the compositor comparisons.

### Technical details

The images are 4,270,720 bytes for Wasm and 4,461,472 bytes for RV32. The existing factory application partition is 8 MiB. The typed firmware option selects the bundled app. The original JavaScript source is used by the differential fixtures.

### Completion audit

| Requirement | Checked evidence |
| --- | --- |
| Editor policy lives in typed JavaScript | Eleven files in `worlds/editor/source.list`, the manifest's `editor/compiled.bin` entry and the freshly compiled artifact receipts |
| Real editing and file handoff | Cross-target grant, read, refuse, write, discard, and cursor-store traces. The paired standard hardware smoke exercised the same Editor apps. |
| Device-scale operation | Full-file normalizing save, absent and dense searches, EOF match, scrolling, page movement, reopen and two maximum-size formatted preview cases in the capacity, navigation, and inline tickets |
| Hardware validation | Final Wasm and RV32 standard runs, and the full-size RV32 LCD preview with normal scratch cleanup |
| Requested records | Focused Git commits, detailed diaries, replay scripts in tickets, simulator and handheld captures, and confirmed reMarkable delivery |

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

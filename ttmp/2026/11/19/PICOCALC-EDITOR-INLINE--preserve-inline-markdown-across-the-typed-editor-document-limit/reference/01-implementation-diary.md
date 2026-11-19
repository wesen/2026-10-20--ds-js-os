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

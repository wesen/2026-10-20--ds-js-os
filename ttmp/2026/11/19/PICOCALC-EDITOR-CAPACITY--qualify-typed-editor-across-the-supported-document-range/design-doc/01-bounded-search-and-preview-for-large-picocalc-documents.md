---
Title: Bounded search and preview for large PicoCalc documents
Ticket: PICOCALC-EDITOR-CAPACITY
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T00:42:56.645842254-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded search and preview for large PicoCalc documents

## Scope and observed failures

Editor is a typed JavaScript world. The files in `picocalc-os/worlds/editor/source.list` compile together into either a Wasm or an RV32 program. They own the document model, key bindings, file lifecycle, search, Markdown and views. The shared typed SDK connects compiled programs to the operating system. The old `picocalc-os/js/apps/editor.js` supplies reference behavior for parity tests.

The host stress check at commit `208076a` opened a 65,536-byte file on both implementations. The full-size save completed and the saved bytes matched the reference. A search for `zzz` exceeded 200 virtual milliseconds in Wasm. A 21,614-byte preview displayed the beginning but discarded the end at serialization time. The evidence is in `various/editor-large-host-after.json` under the PICOCALC-TYPED-WORLDS ticket. A virtual millisecond is a host test budget unit. Board timings and CPU use require a separate measurement.

## Execution path

```mermaid
flowchart TD
    K[Key event] --> E[typedWorldEvent]
    E --> T[Typed Editor state and document]
    T --> S[Typed search and cursor placement]
    T --> P[Typed Markdown preview]
    S --> V[Typed frame encoder]
    P --> V
    V --> U[Shared typed SDK]
    U --> C[Compositor]
    C --> D[Display]
```

The OS delivers keys and operation completions to `typedWorldEvent` in `editor.typed`. State contains scalar fields that survive across events. `typedSdkBuffer(0)` acquires the world’s document allocation. `typedSdkView(buffer, length)` sets its active UTF-16 length and returns a readable string view of that allocation. Code should reacquire the view in each incoming event. Typed Editor uses logical UTF-16 offsets in the document and code-point columns on the display.

`editorShow` in `document-view.typed` publishes a JSON tree with `typedSdkScreen`. The SDK converts UTF-16 into UTF-8 before calling `nw_screen`. The frame buffer holds 16,384 UTF-16 units, and the transport also limits bytes. Six bytes per input unit is a conservative upper bound for JSON escaping a control character, so sizing only by unescaped text length is unsafe.

## Search

F3 accepts printable ASCII, Enter finds the next match at or after the cursor, and F4 starts after the cursor. Search visits the current physical line suffix, subsequent lines, earlier lines, then the current line prefix. Matches never cross newlines. Highlighting checks visible display rows and retains overlapping matches. Preserve both traversal orders and the distinction between physical lines and wrapped rows.

The implementation compares against the reference’s lowercased strings without allocating them. U+212A (Kelvin sign) folds to lowercase k. U+0130 (dotted I) folds to lowercase i followed by combining dot. The latter adds one UTF-16 unit to the folded coordinate, even when the search candidate does not begin with i. The reference converts the folded position to a cursor in original text. `editorSetFound` applies this conversion and preserves surrogate boundaries.

A generic SDK operation `typedSdkSeek(text, start, end, a, b, c, d)` returns the first position in a half-open range that equals one of the four exact UTF-16 units, or `end` on a miss. Repeated unit arguments are allowed. The SDK validates the span against the live view and the allocation. The search policy remains in `find.typed`. Pass the lowercase first query unit, its uppercase equivalent, the Kelvin sign only when the first unit is k, and U+0130. Use a repeated unit when there is no alternate. Newline scanning passes four copies of U+000A. Using one bulk operation per span removes per-unit typed function calls on the common path.

```text
while at < lineEnd:
    candidate = seek(text, at, lineEnd, lowercase, uppercase, alternate, dottedI)
    folded += candidate - at
    if candidate == lineEnd:
        break
    if folded >= minimum and typedMatch(candidate, query):
        return folded
    folded += 1 + (text[candidate] == dottedI)
    at = candidate + 1
return -1
```

This pattern bounds work for stretches with few candidates. A dense candidate set or a long repeated prefix can still consume a full turn. If measured, move the matching loop to a resumable typed job. Each job step consumes a bounded number of candidate comparisons, stores its physical and folded offsets and remaining line ranges, and schedules `typedSdkYield`. With prefix-function matching, retain the matched prefix length and reconsider a unit after following a failure edge. Keep the dotted-I expansion visible to that matcher. Rendering after a match near EOF has a separate cost because `editorLocate`, the viewport, and marks can each walk wrapped rows from the beginning.

## Preview

The original typed renderer serialized one item list until it approached the frame limit. The compositor wrapped only the items it received, so scrolling could never recover the omitted content. The current implementation owns Markdown recognition and wrapping in typed Editor. The generic `lines` node accepts `wrapped: true` and draws the provided strings as rows.

```mermaid
flowchart LR
    A["Document and source offset"] --> B["Classify one source line"]
    B --> C["Borrow text or stage formatted text"]
    C --> D["Consume one word or word fragment"]
    D --> E["Ring of finished rows plus pending row"]
    E --> F["Serialize the selected 17 rows"]
    D --> G["Yield and resume if the step budget expires"]
    G --> D
```

`editorPreviewSource` classifies a source line, handles fences, and configures the next input span. Plain paragraphs without inline markers, literal quotations, and fenced code borrow a view directly from the document. Other lines use the existing typed inline formatting, and headings call the shared Unicode uppercase primitive. The 12,288-unit scratch buffer at slot 7 holds up to three output units for each staged input unit. The 4,096-unit formatter input is at slot 5. Slot 5 can be reused by position persistence after formatting completes. Only slot 7 persists a staged span across turns. Opening another file and leaving preview discard the continuation.

The display draws a 304-pixel-wide body and keeps 8 pixels for horizontal insets. At 6 pixels per small-font cell this fits 49 code points. An indented row holds 47. The body is 270 pixels tall. The status row uses 12 pixels, the column gap uses 4, and `lines` holds 4 for vertical padding. The remaining 250 pixels fit 17 rows at 14 pixels per row. The existing editor viewport has separate measurements.

`editorPreviewWord` consumes either one space-delimited word or a full-width piece of a long word. It counts code points, copies UTF-16 units, and never splits a surrogate pair. Separating ordinary physical lines at a space and keeping the pending row produces the same layout as wrapping a joined paragraph. A blank or special block finishes the paragraph before emitting its own rows.

```text
on preview request:
    if requested row precedes the cache, restart at source offset zero
    while the viewport is missing rows and the current slice has work left:
        stage one source line, advance one word, or finish one row
        stop at document end or when the viewport is ready
    if more work remains, schedule a timer and resume on its matching token
    otherwise clamp to the last full viewport and publish only those rows
```

A ring of 36 entries retains the last 35 complete rows and reserves enough room for the pending row. Each entry uses two UTF-16 header units plus up to 98 text units. Backward movement within the ring reads only cached rows. A longer jump restarts parsing in bounded slices. EOF clamps the display to the last visible window, while the requested scroll offset retains the reference app's behavior. At most 17 rows cross the SDK on each update. Even a conservative six bytes of JSON output per UTF-16 unit, plus row metadata, fits inside the screen budget.

A slice advances up to 96 units of scheduling work. Ordinary steps cost one unit, and staging adds a cost based on source length. This limits how often the app returns to the event loop. Inline stripping still runs as one step per formatted source line with the existing 4,096-unit input cap. A large imported line with inline markup can therefore need further work, even though a long plain line can stream directly without that cap.

![Preview at EOF in the host Wasm build](../various/preview-end-wasm.png)

## Implementation and verification

1. Add the generic seek API to `sdk/typed/world.c`, `compiler/typed-world.js`, and `sdk/typed/rv32-slot.S` in a single change. The import order must match the RV32 trampolines. Update `find.typed` and `view.typed`, and compare exact frames and captures against the reference across both backends. Verify a full-size absent search in the host harness.
2. Replay the viewport tests with `scripts/02-check-preview-capacity.sh`. The 21,614-byte document reaches its end and navigates backward while matching the JavaScript reference. A separate fixture streams an 18,047-byte line with supplementary Unicode characters at the 200 virtual ms profile.
3. Verify cursor placement late in the document, dense overlapping candidates, and a long repetitive absent query. Measure initial display, each search or preview key event, and longest scheduler slice using a reproducible corpus. Test both backends on the board when connected. Keep scripts in this ticket and record exact artifacts, build flags, and measured times in the diary.

## Code and evidence

| File | Entry point or responsibility |
| --- | --- |
| `picocalc-os/worlds/editor/editor.typed` | `typedWorldEvent`, file normalization and deferred operations |
| `picocalc-os/worlds/editor/find.typed` | `editorFindNext`, `editorFindSpan`, `editorFindMarks` |
| `picocalc-os/worlds/editor/view.typed` | `editorLineEnd`, `editorLocate` and JSON quoting |
| `picocalc-os/worlds/editor/preview.typed` | `editorPreviewSource`, `editorPreviewWord`, `editorPreviewFrame`, navigation |
| `picocalc-os/js/system/compositor.js` | `wrapText`, `drawLines`, renderer layout constants |
| `picocalc-os/sdk/typed/world.c` | Counted strings, screen transport and event marshaling |
| `PICOCALC-TYPED-WORLDS/scripts/02-check-editor-world.mjs` | Matched JS, Wasm and RV32 regression fixtures |
| `PICOCALC-TYPED-WORLDS/scripts/05-measure-large-editor.mjs` | Full-size save and search plus preview capacity reproducer |

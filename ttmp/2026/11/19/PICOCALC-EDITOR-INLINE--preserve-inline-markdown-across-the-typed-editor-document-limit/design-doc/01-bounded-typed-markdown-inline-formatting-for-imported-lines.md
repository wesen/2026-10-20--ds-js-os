---
Title: Bounded typed Markdown inline formatting for imported lines
Ticket: PICOCALC-EDITOR-INLINE
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T01:45:38.081751502-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded typed Markdown inline formatting for imported lines

The typed Editor can open a 64 KiB file and stream preview rows through the screen budget. Preview first recognizes the block on each physical line. Ordinary text and fenced code can borrow a range from the document directly. Headings, lists, quotes, and paragraphs containing inline markers pass through `editorMdPlain` before row wrapping. That staging step uses a 4,096-unit buffer. An imported line can be longer than the 4,000-character edit insertion limit, so the current path can silently omit valid formatted text.

The baseline keeps the source bytes intact. A 4,917-byte heading and a 4,915-byte paragraph each put `**EOF INLINE**` after 4,900 bytes on the same line. The original Editor displays the marker after paging. Typed Wasm omits it without a fault. The same replay includes a line with repeated unmatched link openers. See `various/long-inline-before.json` for outcomes and the exact sizes.

## Follow the preview from disk to a wrapped row

```mermaid
flowchart LR
    D["Document buffer"] --> C["Classify physical line"]
    C --> S["Copy formatted line to scratch"]
    S --> B["Compact bold markers"]
    B --> K["Compact code delimiters"]
    K --> L["Compact link destinations"]
    L --> U["Expanding uppercase stream for headings"]
    L --> V["Word wrapper for other text"]
    U --> V
    V --> R["17-row viewport"]
```

`editorPreviewSource` establishes the style and text interval, including block prefixes. `editorMdPlain` applies three inline replacements in order. The JavaScript reference uses consecutive regular expression replacements. Compaction must finish each pass before starting the next, since deleting one delimiter can make earlier-separated characters adjacent for a later pass. The compositor receives finished rows with color and indentation. It has no knowledge of these Markdown rules.

The plan leaves the document buffer at SDK slot 0 intact. Give formatting one 65,536-unit scratch buffer. A generic `typedSdkCopySpan` can stage the selected source range. Validate the source and destination windows in the SDK and use the existing same-buffer move for in-place spans. The scratch content is active only while its matching preview job owns it. Preserve preview detachment rules across F6 and a successful file replacement.

## Bound matching and compaction by work

Each pass uses a monotonically advancing input offset and output offset. A selected span is copied to the output offset and the input offset skips past the whole match. The output stays at or behind the input, so sliding a span never overwrites future input. An unmatched stretch can be copied as one span after the next interesting delimiter is located.

```text
copy the source span to scratch
for each pass in bold, code, links:
    while the next cursor and its candidate fit the current slice:
        find the earliest possible opener
        if a closing match exists:
            move the literal prefix and captured text to the write cursor
            continue after the match
        else:
            emit the range whose openers share the failed close
    if unfinished:
        save the input and output positions and yield
    else:
        set the active length to the compacted size
wrap the formatted text into the existing preview window
```

The typed code decides how to recognize matches.

- Bold requires two opening asterisks, a nonempty body, and the earliest eligible closing pair. The reference's dot excludes U+2028 and U+2029 within an imported physical line. Where a closer is absent before that boundary, preserve the remaining literal range to that boundary.
- Inline code takes the next backtick after a nonempty body. Adjacent delimiters need a one-unit retry because the second delimiter may begin a valid longer span. When there is no following delimiter, copy the rest of the physical line in bulk.
- A link uses the next close bracket, an immediately following open parenthesis, and the next close parenthesis. If that close bracket lacks the parenthesis, intervening opening brackets cannot make the same ending valid. Preserving this whole literal prefix avoids one full-tail scan per unmatched opener. The destination syntax remains the reference's simple delimiter rule.

Use the existing checked `typedSdkSeek` for common delimiter scans and `typedSdkMove` for contiguous spans. If an operation can exceed the scheduler budget on observed content, cap the scanned interval and retain its lookahead position across a settle. Measure unmatched and dense delimiters separately from a long string of ordinary letters.

## Preserve bounded heading expansion

The reference uppercases heading text after the three formatting passes and before wrapping. Some Unicode characters expand to multiple code points, so source widths cannot stand in for rendered widths. Extend the generic uppercase service to accept a checked source interval. Keep the next width-limited group and any remainder in the existing small preview staging buffer. A long word can cross conversion chunks. Keep a separate word-boundary flag so a chunk edge does not introduce a space, a short row, or a second match. Verify case expansion from the same Unicode tables already used by the device.

The extra full-size scratch is about 128 KiB. Measure the actual Wasm memory pages and RV32 mapped-world size against the 768 KiB Editor profile. Dedicated small counters, a record-size change, or a reserved metadata range are all implementation choices. The current typed Editor uses all 64 state fields, so any extra state needs an explicit layout and a test of the compiler/runtime agreement.

## APIs, files, and gates

| Source | Responsibility |
| --- | --- |
| `picocalc-os/js/apps/editor.js` | Reference block matching, inline replacement order, and uppercase behavior |
| `picocalc-os/worlds/editor/markdown.typed` | Typed block rules, inline matcher and compaction |
| `picocalc-os/worlds/editor/preview.typed` | Physical-line stream, cooked text, word wrapping and cached rows |
| `picocalc-os/sdk/typed/world.c` | Checked counted-string windows, scratch memory, moves, Unicode uppercase |
| `picocalc-os/compiler/typed-world.js` | Shared import signatures and scalar state bounds |
| `picocalc-os/sdk/typed/rv32-slot.S` | Ordered RV32 runtime entry jumps |
| `PICOCALC-TYPED-WORLDS/scripts/05-measure-large-editor.mjs` | Reproducible `--long-inline` cases |

Begin with the existing small Markdown fixture. Compare final rows for the two imported long lines and malformed delimiters. Then add marker-density cases across the full supported input length, expansion and chunk-boundary cases, preview cancellation, and backward navigation. Use Wasm simulator and RV32 emulator comparisons before the physical check. Verify file bytes and the visible viewport separately. Keep scripts, memory evidence, results, and the implementation diary here.

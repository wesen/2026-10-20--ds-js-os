---
Title: Implementation diary
Ticket: PICOCALC-EDITOR-NAV
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T01:33:23.547000664-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Reuse checkpoints across keys and align the LCD viewport

After a successful full-size find, the following Right or Up could overrun while rewalking wrapped rows. The port also published a valid match at index 17 even though the LCD shows only indices 0 through 16. I made the row checkpoint window reusable, added bounded recovery for older rows, and aligned the viewport with the display.

### Prompt Context

**User prompt (verbatim):** "I want them to be 100% typed javascript"

**Assistant interpretation:** Continue the active Editor port until ordinary editing works after finding a match at the end of a supported document.

**Inferred user intent:** Keep the real Editor usable on the PicoCalc, with its application logic in typed JavaScript.

### What I did

- Created `PICOCALC-EDITOR-NAV`, documented the row cache and scheduler design, and uploaded `PicoCalc Typed Editor Cursor Navigation.pdf` to `/ai/2026/11/19/PICOCALC-EDITOR-NAV`.
- Expanded the existing typed row ring to 36 checkpoints in slot 9. Tracked a contiguous valid interval across keyboard events. Invalidated the suffix beginning at the affected logical line before text changes.
- Made a backward request outside the ring use the existing 64-row frame slices. The move and its final viewport complete in the same key turn.
- Set both typed and reference Editor viewports to 17 rows. Kept the page increment at 16 and left the preview viewport geometry unchanged.
- Delayed successful open replies until the first frame can be published. Added a generic occurrence lookup for position restoration so a late reopen avoids thousands of per-line calls.
- Raised the complete typed-world input ceiling to 96 Ki code units. The standalone compiler still uses 64 Ki. Both targets use the same parser limit from the world entry point.

### Why

The earlier row ring served only repeated passes within one frame. Keeping valid checkpoints across keys makes the common late movement case local. The last visible row needs to follow the compositor's actual pixel capacity because a correct cursor position alone did not put the match on screen.

### What worked

- The original `--after-match` examples reached 852:2 after Right and 851:46 after Up, with no faults and unchanged file bytes.
- The `--late-navigation` replay found the EOF match, moved a column and a row, paged above the cache, returned to the match, merged and restored a logical line, appended `!`, and saved the exact 64,686 normalized bytes. The restart capture shows 852:11.
- The six Wasm framebuffers match the JavaScript reference. The RV32 emulator validates its full-frame trace, exact write bytes and completion behavior, including foreign timer receipts.
- All ten original Editor unit tests passed. Direct compiler checks still reject a program above 64 Ki code units in both standalone backends.
- The first matched viewport has 17 rows. The query highlight and cursor both sit at index 16 on the `needlezzz` row. The saved screenshot is `various/eof-visible-wasm.png`.

### What didn't work

The first extended replay matched all interactions through save but failed the reopen assertion. Its Wasm UART log contained `editor crashed handling open: ran past its turn budget of 200 virtual ms`. The saved coordinate on both engines was line 851, column 10 in zero-based storage. Replacing the per-line restore scan with `typedSdkNthIndex` made the restart pass.

### What I learned

An edit near EOF does not invalidate every earlier row. Invalidation starts at the logical line affected by the change because its earlier wraps can depend on the changed text. A Backspace on the next line's first column can affect the previous line. The first post-open frame also needs bounded work even when the file read has already settled.

### What was tricky to build

The previous cache can contain rows after the current cursor following a backward move. Storing a row at a lower index must preserve the true upper bound. Truncating the cache after a mutation must preserve the actual lower bound rather than infer a full ring from the new high index.

### What warrants a second pair of eyes

Review cache invalidation before an insertion or a newline deletion, the initial anchor when the cursor moves before the oldest retained row, and the completion path that publishes before replying to a deferred open. Check the standalone compiler bound and the runtime's 64 state words separately.

### What should be done in the future

Qualify the updated artifacts on the physical board. The long imported Markdown inline formatter is still a separate capacity issue.

### Code review instructions

Start with `editorInvalidateRows`, `editorRowAnchor`, `editorFrameLocate`, and `editorMoveRow`. Run `scripts/01-check-late-navigation.sh P4_GCC RV32EMU OUTPUT_DIRECTORY`. The persistent restart uses the actual saved cursor record from the first host run.

### Technical details

The 36-entry ring consumes 252 UTF-16 units out of the existing 256-unit slot. Cursor and scan offsets use two units per coordinate. The textarea publishes and searches highlights across 17 rows. The compositor draws the same 17 rows at the current 320 by 320 geometry.

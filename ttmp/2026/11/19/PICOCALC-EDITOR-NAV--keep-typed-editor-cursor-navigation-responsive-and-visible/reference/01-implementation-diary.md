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

**Commit (code):** `08fbae8` — "Keep typed Editor navigation bounded and the cursor visible"

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

## Step 2: Verify full-size navigation, save and reopen on the handheld

The new board images passed the ordinary workflows on both Wasm and RV32. The RV32 trial then staged the exact 65,536-byte fixture, photographed the visible match, edited after paging backward, saved 64,686 bytes, and reopened with the cursor at 852:11. I inspected both physical screenshots and verified the highlighted result and cursor stay inside the LCD area.

### Prompt Context

**User prompt (verbatim):** See Step 1.

**Assistant interpretation:** Verify the typed implementation on the actual PicoCalc and preserve the build and workflow evidence.

**Inferred user intent:** Use the handheld's real edit path with a predictable build and reproducible results.

### What I did

- Built both matched firmware variants. The shared typed source SHA-256 is `073e2690f1c0f76d35914be2c5fb17f5d150b6bbd793774909206c045368d620`.
- Ran the paired firmware qualifier on `/dev/ttyACM0` with byte-matched partition tables. Both flashed application images passed the hash check and standard workflow.
- Ran the capacity ticket's `scripts/05-check-large-search-on-p4.py --navigation --engine native`. The script acknowledges every UART write offset, tests late movement and file replacement, then checks scratch cleanup.
- Archived the two structured receipts and physical screenshots under `various/`.

### Why

Frame parity in the simulator establishes semantics and visible rows. The board replay also exercises the bundled compiler, real display, keyboard, serial transfer, and storage.

### What worked

- The standard board workflows reported zero I²C and SPI errors. The reboot receipts show compilation in 1.93 seconds for Wasm and 3.09 seconds for RV32, with loader times of 170 ms and 12.9 ms respectively.
- The long RV32 run logged zero Editor faults. Its filesystem listing reports the expected 64,686 saved bytes. The four framebuffer captures passed CRC checks and the scratch directory was removed.
- `various/p4-eof-visible.png` shows the match highlighted on the last visible row. `various/p4-reopened-eof.png` shows the appended exclamation point and position 852:11. The board retains this RV32 image.

### What didn't work

No failures occurred in the final hardware replay. The navigation change leaves the separate inline formatting capacity issues described in `PICOCALC-EDITOR-INLINE`.

### What I learned

The correct 17-row geometry verifies the last match visually. The host replay verifies byte identity, while the console provides exact total file length on hardware. The two checks complement the saved cursor screenshot.

### What was tricky to build

The physical script spaces capture and keyboard commands so the UART transfers a full framebuffer before the next capture. It separately opens the saved document before inspecting its persisted cursor state.

### What warrants a second pair of eyes

Review the first match and reopened screenshots against the command sequence and source hash. The long workflow uses the RV32 image, and the paired standard smoke used both images.

### What should be done in the future

Implement full-line inline Markdown compaction from the separate ticket and run the same preview capacity checks.

### Code review instructions

Use `various/p4-navigation-builds.json`, `various/p4-navigation-full-file.json`, and the two screenshots. The host replay entry is `scripts/01-check-late-navigation.sh`.

### Technical details

Image sizes are 4,265,584 bytes for Wasm and 4,457,968 bytes for RV32. Compilation produced an 85,549-byte Wasm module and a 240,056-byte RV32 ELF. No firmware partition changes were needed.

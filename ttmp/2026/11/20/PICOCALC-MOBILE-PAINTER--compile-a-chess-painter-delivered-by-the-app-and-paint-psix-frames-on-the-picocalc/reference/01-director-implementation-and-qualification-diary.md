---
Title: Director implementation and qualification diary
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T15:47:47.203789109-05:00
WhatFor: ""
WhenToUse: ""
---

# Director implementation and qualification diary

## Step 1: Establish the missing application-to-display path

I opened the lab from project revision 4465ef7. The earlier research had executed a receiver-compiled Wasm view and an on-device RV32 PSIX writer in separate experiments. This experiment makes a publisher send its own source to an actual compositor and asks whether the resulting RV32 program can draw the same position twice without reinstalling.

### Prompt Context

**User prompt (verbatim):**

> Ok, let a research lab do this, as usual.
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

The preceding five-step design asks the running app to send typed source, the compositor to compile native code and run it on PSIX state, and the display driver to blit the resulting image. I interpreted the request as an implementation and hardware experiment, followed by independent teaching articles and a director synthesis.

### What I did

I created PICOCALC-MOBILE-PAINTER with docmgr and commissioned three Opus High research lanes with local compiler, transport and board operators. The board operator has exclusive serial access. I traced the normal compositor's layout, authenticated events, framebuffer calls, graphics commit and display request. I specified a bounded list of geometry, text and hints which is validated in full before it can replace an accepted view. Experiments and evidence remain below the ticket's scripts and various directories.

### Why

Compilation had previously exceeded the compositor's ordinary turn budget. Its worker must be able to compile once while the kernel continues scheduling ordinary UI events. The game owns the pieces, cursor, legal-move marks and game outcome. The compositor owns painting order, status bar and presentation.

### What worked

Production CJI accepted the changed compositor world via `node cji/cji.js picocalc-os/js/system/compositor.js --world-unit --emit`. All eight pre-existing compositor event tests passed. The physical operator verified the ordinary release and saw SPI transactions complete. Two independent research operators agreed on a counted native data message and a 90-cell decoded input contract.

### What didn't work

The baseline physical keypad continued to return I²C errors. The operator started the previously qualified isolated input substitution to deliver keys while keeping both the game's native key handling and real panel transfers. During parallel design two ABI proposals crossed. We froze one variable-length word stream in nucleus/mobile_painter.h before integrating the core implementation.

### What I learned

Rendering a tile uses a centered 228-pixel canvas. A coordinate in the painter is relative to the rectangle below the 22-pixel status strip. The compositor retains responsibility for its own clock and hints. Incorrectly using screen coordinates twice would move every cell by 22 pixels.

### What was tricky to build

Publishing the source and the first frame can complete before the worker returns its executable. The compositor needs the most recent valid frame at that point. A new game epoch invalidates its predecessor's state. The installed file is a single pinned program and may only be reused after the current publisher supplies the approved source.

### What warrants a second pair of eyes

Independently verify command clipping, bit/byte order, live pixel equality, producer/receiver restart behavior and hardware image identity. Check for any benchmark which accidentally runs an installed alternative to the source that arrived in the message.

### What should be done in the future

Finish the device acceptance, record both successes and limitations, and publish each lane's article plus the director's synthesis.

### Code review instructions

Follow the ordinary world from worlds/chess through nucleus/native.c, port/esp32p4/main/painter_service.c and js/system/compositor.js. Use ticket tasks for current implementation state.

### Technical details

The input is 64 pieces, eight move masks and nine 32-bit integers stored in 90 little-endian 16-bit cells. A program computes at most 4,096 16-bit output words. The allowed operations are fill, outline, ASCII text and one final hints record. The target is the physical P4 with the existing 320 × 320 RGB565 buffer.

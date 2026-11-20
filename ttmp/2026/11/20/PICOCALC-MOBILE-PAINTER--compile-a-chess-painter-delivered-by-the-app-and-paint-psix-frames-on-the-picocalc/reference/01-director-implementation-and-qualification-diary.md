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

## Step 2: Prove the drawing contract and separate compilation from installation

I followed a pixel from the historical Chess replay into the actual gfx implementation and compared the resulting bytes across every archived position. In parallel we discovered a device-specific lifetime rule during the build. Compiling can use a large PSRAM stack, but installing the executable briefly disables caches. I moved installation onto the existing internal-stack kernel task.

### Prompt Context

See Step 1 for the research commission. The requested outcome was a source message, a native function, a state message and visible pixels, all on the normal compositor path. Commit 681f855 introduced the compositor integration, 8be499c included the shared syscall changes, and 9b7e8c3 introduced the two compiler entry points.

### What I did

I implemented native list validation and drawing, source admission and a private compilation request, two swappable output lists, authenticated ready notifications, and the compositor's framebuffer call. I added a C raster harness and an independent Python driver under scripts/director. After the compiler researcher checked ESP-IDF, I changed compile_worker to return an owned mobile_painter_image and changed p4_painter_poll to consume it through mobile_painter_load. I linked the new CJI framebuffer method into the generated prelude export table.

### Why

The native program determines paint order and geometry. The existing gfx layer provides production font metrics and clipping. Running the production raster on the host lets us test all historical positions even though moving physical controls through every promotion and castling sequence takes much longer. Keeping relocation on the kernel task preserves the cache/stack contract without reserving another 80 KiB of internal memory.

### What worked

All 47 archived positions matched the prior body pixels at 320 by 280, with identical hint strings and zero writes to chrome. Fourteen malformed output streams failed before drawing. Nine compositor authentication tests passed. The ordinary app suite passed with make -C picocalc-os test-apps. The board operator independently matched e2, e3 and f3 on the legacy integration and read the same app CRCs from completed panel transfers.

### What didn't work

The first CJI prelude build after adding fb.paintView failed until I regenerated cji/src/prelude-exports.js with tools/gen-prelude-exports.mjs. Cross-review of the first PSRAM-worker design found that esp_elf_relocate invokes the ESP-IDF cache-disabling path. The installed IDF cache_utils.c asserts internal stack placement there. We changed the design before that image was used. The device lane also found a stale incremental object after source synchronization and checked the split symbols in the replacement build.

### What I learned

The return from compile is an owned ELF image. Its bytes can travel on a queue. The return from load is a callable entry and a relocated module allocation with a longer lifetime. Either operation can fail. The service reauthorizes an installed entry when a new Chess publisher epoch starts, and keeps the last accepted display list intact until a later command sequence validates completely.

### What was tricky to build

The compiler needs the original message bytes after the consuming turn releases its mailbox node. start_compile makes a private copy before it starts the task. The worker can finish after new game data has arrived. The kernel selects the newest accepted state when it processes completion. The compiler and raster each use counted 16-bit arrays, but their header and ownership conventions differ. The host harness checks the exact return count before interpreting data.

### What warrants a second pair of eyes

Trace every early return out of mobile_painter_compile and mobile_painter_load. Verify that exactly one owner frees each source, linked image and output buffer at each boundary. Recheck the compiled CJI exports and the running image's install counters whenever changing the method table.

### What should be done in the future

Collect matched P4 screenshots and counters, check restart, distinguish the ordinary input-driver result from SPI observations, and deliver the four reports. The user also requested a separate Sol Medium PIE compiler study and independent Astra review. The 3D experiment will depend on a qualified mobile path.

### Code review instructions

Read picocalc-os/port/esp32p4/main/painter_service.c starting at compile_worker and p4_painter_poll, then the validation/painting pair in picocalc-os/nucleus/painter_commands.c. The address and length checks run before the draw callback. Compare various/director-raster.json against the earlier RENDER-CHESS pixel witness.

### Technical details

The 47 positions exercise 4,211,200 body pixels. The 22-row header and 18-row hints strip are owned by the compositor. The host checks the hints text separately, while the physical comparison includes the rasterized hints. The actual SPI trace can include clock pixels from the top strip which vary independently of Chess.

## Step 3: Qualify the installed screen and publish four accounts of the experiment

The original two-core compilation experiment produced a correct image but missed a foreground draw deadline. I kept the failure in the report and changed the compiler worker to lower priority on the kernel core. The follow-up verified the whole mobile program from delivery to completed panel writes. I published the three independent studies and a director synthesis after the ordinary release readback.

### Prompt Context

See Step 1. During qualification the user proposed an asynchronous compiler service. I wrote the separate service design with a compilation job, a loader-owned executable handle, receiver generations and distinct turnaround/CPU clocks. This is a proposal alongside the measured single-painter service.

### What I did

Coordinated a matched control and candidate, checked the per-position counters and stopped us accepting a cold boot with a compositor fault. Reviewed the screen comparison at rows 22–319, the SPI observer's completed transfers and the restart/reopen case. Added the scheduler adjustment in 5316cc2. The board operator preserved both the rejected candidate and the qualified runs in 8ccdc21. Rebuilt vault notes from the four frozen articles and supplied all five designs plus the four articles as a single reMarkable packet.

### Why

Building on one core while drawing on the other still shares memory and instruction resources. Giving the firmware scheduler the ability to preempt compilation on the foreground core is a direct experiment. Retaining the UI's 80 ms deadline lets the board test distinguish satisfying a deadline from weakening it.

### What worked

F3 recovered after compositor restart with the same SPI CRC 478e7dea, zero rejects, one compile, three native calls and four paints. The final ordinary release readback confirmed 75c94df7b1aa565c8cb7858bea628aa2c9c644ef64cc885b96e1d80088f8af56 and the expected partition. Eight native worlds booted with zero restarts and no last error. The vault publisher verified remote main e06d5823a77b662040fa7a347e7ab6ff15887d5f and compared all five published blobs to the staged bytes. The cloud uploader reported OK: uploaded PicoCalc Mobile Painter Research.pdf -> /ai/2026/11/20/PICOCALC-MOBILE-PAINTER.

### What didn't work

The first native candidate's recorded fault was “compositor crashed handling draw: ran past its turn budget of 80 ms”. Its compilation had completed correctly but that build failed the integration gate. The final ordinary image still reported keyboard I²C failure on 24 of 24 sampled operations. The three actual screen observations therefore use a substituted keyboard status. Draft publishing initially found a missing observed-mobile.json before the physical study copied its frozen evidence. The final publisher validated it successfully.

### What I learned

The warm native procedure took 189–192 µs in the two cursor samples. Producing body pixels cost about 2.23 ms. Eliminating geometry computation alone has a bounded effect on these specific frames. The strong result is a tested separation of application state, drawing policy, compilation and presentation, including exact output and a no-recompile restart.

### What was tricky to build

There are separate observations at the native output list, committed framebuffer, and completed SPI payload. The panel crop deliberately includes hints but excludes a changing clock. In the restart case the retained list can be reused without another native call, so an increased paint count and an unchanged call count are correct.

### What warrants a second pair of eyes

A repeat with a working physical keypad and a dedicated key-to-panel timer would complement the observer image. The same-core trial and rejected second-core boot are individual measurements and do not establish a general contention distribution.

### What should be done in the future

The PICOCALC-CHESS-3D ticket exercises a richer drawing vocabulary; PICOCALC-TYPED-PIE asks which projection loops can be compiled to packed instructions. Both need separate hardware evidence. The proposed general job/handle service has its own lifetime and scheduling tests.

### Code review instructions

Trace the completed implementation using the ticket index, then compare various/device/first-candidate-trace.json, observed-mobile.json, mobile-pixels.json and ordinary-install.json in that order. Use various/publication.json to locate the exact reports delivered.

### Technical details

The compile interval on the accepted instrumented build was 1,029,397 µs, load 721 µs, and the compiled image 17,456 bytes. The ordinary build measured 1,022,094 µs and 872 µs. The successful 2D firmware is the recovery reference for subsequent temporary benchmark images.

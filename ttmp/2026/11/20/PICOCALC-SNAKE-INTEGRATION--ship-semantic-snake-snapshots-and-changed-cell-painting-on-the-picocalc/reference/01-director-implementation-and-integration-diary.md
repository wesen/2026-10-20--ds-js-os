---
Title: Director implementation and integration diary
Ticket: PICOCALC-SNAKE-INTEGRATION
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Production integration decisions, failed attempts, evidence and publication history.
LastUpdated: 2026-11-20T13:31:12.681578089-05:00
WhatFor: ""
WhenToUse: ""
---

# Director implementation and integration diary

## Step 1: Put the semantic position on the existing screen channel

Snake already computes all the information the compositor needs in its 110 ms timer callback. I moved the description of its pixels into the compositor and made the ordinary screen callback publish one complete position. The production change runs through the same JS source for both QuickJS and the CJI-built native world.

### Prompt Context

**User prompt (verbatim):** “ok, then do snake.”

**Follow-up (verbatim):**

> write a report when done for snake, delegate to the usual combo.
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Interpretation and intent.** Implement the previous recommendation for semantic JSON and changed-cell painting, test through normal game entry points and report the results. The physical board should finish on the latest qualified playable firmware.

### What I did

- Inspected the ordinary world, framebuffer commit and invalidation code, CJI firmware bundling, and the prior 236-position Snake experiment.
- Opened a separate implementation ticket. Assigned physical measurement to the board operator and independent replay to the correctness examiner. Each commissioned Opus High on its own research question. The two teams own separate diaries, qualification scripts, and articles.
- Implemented the compact state, admission checks, full compositor paint, and an ordinary one-step movement path. Other activity that can change pixels invalidates the compositor's remembered Snake composition.
- Added a reproducible check of the native SDK event transcript. It decodes game positions from the old golden and checks the semantic writer independently before updating the native fixture.

### Why

A timer might produce several complete frames before a draw. The last received frame and the last frame actually painted can therefore differ. A narrow fast path can prove from its two positions that a legal head/body/tail shift explains every changed pixel. All other positions remain independently paintable.

### What worked

Node accepted both files and the existing compositor authentication tests passed. The SDK already permits a complete JSON object and an independent hints string. The new producer requires no kernel or SDK change and the hardware study can compare the ordinary native applications.

### What didn't work

No implementation failure was observed at this checkpoint. Host visual qualification and physical execution were still pending.

### What I learned

The earlier research writer reconstructed a full widget tree in the receiver, and its C painter compared all 396 cell roles. This implementation retains the actual validated head-first list, proves an ordinary one-step shift, and emits two or three fills. Full drawing uses the original header row layout, primitives, palette and font metrics directly.

### What was tricky to build

If the head enters the departing tail cell, clearing that cell introduces a redundant write. Its final color is accent. An old and a new head must also receive different colors. A tooltip or crash banner can cover those pixels, and the clock and power state may change independently of the game. Ordinary compositor invalidations cancel the fast path even if a draw is already queued.

### What warrants a second pair of eyes

Confirm that the CJI-native compiled worlds agree with QuickJS on Boolean and integer fields, that the game-over text blends identically, and that a skipped transfer can recover using the original framebuffer invalidation and complete frame. The timed interval labeling should distinguish the Snake timer, frame receipt, draw and physical transfer.

### What should be done in the future

Finish the independent replay, build and measure the normal physical path, publish the three reports after evidence review, and record the final device state.

### Code review instructions

Start in picocalc-os/js/apps/snake.js at the screen callback. Follow frames and draw in picocalc-os/js/system/compositor.js, then gfx_commit and gfx_invalidate in picocalc-os/nucleus/gfx.c. The historical reference commit is e339b6a.

### Technical details

The cell number is 22 times the row plus the column. This separates game geometry from pixels. Each interior body mark is 11 by 11 pixels inside a 13 by 13 cell. Full drawing remains responsible for the header, game-over overlay, compositor status and hints. A change outside an ordinary board move selects that full path.

## Step 2: Replay the compiled game and qualify the host framebuffer

The compiled native producer emitted all six expected game positions in the CJI SDK regression transcript. Independently, the replay examiner ran the production screen and compositor callbacks and compared every pixel against the prior revision and archived frames. The 236-frame corpus passed.

### Prompt Context

See Step 1. The intended deliverable is an integrated, working game on the device, with a new documented performance and correctness result.

### What I did

I built a native Snake module against the shared CJI prelude and loaded it into the repository's RV32 emulator. I changed the existing Snake event golden to the new screen schema only after independently decoding the game positions and food from the old drawing commands. The examiner tested the separate complete host pipeline with focus, overlay, coalescing and failure cases.

### Why

The old golden protects the native SDK call sequence and the hints in addition to pixels. A producer and receiver rewritten together can agree on an error. The independent reference game, original framebuffer primitives and an archived pixel digest give stronger checks.

### What worked

The normal CJI frontend and linker produced a 62,064-byte Snake module for the emulator. All six SDK screens, hints and non-screen actions matched. The independent host run found exactly two fills on a legal tail-entry move and three on an ordinary move. A skipped or timed-out display transfer repaired all 102,400 pixels in the host panel model.

### What didn't work

The first emulator run of scripts/01-native-fixture.py failed with exit 70 and “not an rv32 relocatable object”. The emulator selects its dynamic loader by the path suffix. I used its documented .so suffix for the temporary shared module; the module bytes and target architecture did not need to change.

### What I learned

The full snapshot does not create a dependency on the immediately previous publication. The shortcut only depends on the last frame actually painted. When the compositor observes more than one movement between draws it can reconstruct the latest complete position without retaining intermediate states.

### What was tricky to build

Framebuffer commit updates its front copy before display acknowledgment. A skipped hardware transfer means that the copy can differ from the real panel. Existing gfx_invalidate preserves the backbuffer while forcing a subsequent complete transfer, including when only a small area needs repainting in that backbuffer.

### What warrants a second pair of eyes

The independent host examiner is checking malformed-input behavior and repeated retries. Qualification on real CJI includes allocation limits and native coercion behavior that a Node-hosted replay cannot establish.

### What should be done in the future

Measure the newly built image, verify that opening the game visibly changes the panel, and compare draw CPU to actual SPI timing. Report the result separately from the pixel proof.

### Code review instructions

Run scripts/01-native-fixture.py from the checkout root with the CJI RV32 test tools built. The baseline game transcript comes from e339b6a; the stored candidate transcript is cji/tests/native/snake.out.

### Technical details

The first native module's shared unit, allocator and fake-kernel event API match the CJI emulator regression harness. The physical Espressif ELF loader is exercised separately. A correct SDK transcript alone does not render a single pixel.

## Step 3: Compile the compositor and verify the displayed image through the ordinary OS

The first board build exposed a difference between host JavaScript execution and the CJI frontend. I changed the compositor's short-lived validation scratch to a fixed bitset, rebuilt the native world unit, and replayed the application through the Linux PicoCalc simulator. All five captures remained identical to the previous release.

### Prompt Context

See Step 1. Each independent research lane keeps its own diary. This is the director's production integration investigation.

### What I did

The failing command was `node cji/cji.js picocalc-os/js/system/compositor.js --world-unit --emit`. I called the same compiler entry directly to preserve a stack trace, replaced the typed array with thirteen ordinary integer words, and recompiled. I added a normal compositor callback test spanning bit 31, a duplicate cell, a row-wrap adjacency error, a new version and a forged sender. I also ran the complete simulator twice through the same virtual keyboard input, timer schedule, display service and panel model.

### Why

A typed array in this CJI world introduces a class with a method named fill. The compositor already makes many calls to a dynamically dispatched framebuffer method with that name but a different signature. Admission requires 396 Boolean values. A bitset represents them in 13 words and avoids the class-method ambiguity.

### What worked

The new CJI compositor emitted 518,492 bytes of intermediate assembly. The native Snake transcript still matched six expected screens. The compositor test suite passed all eight tests. In the system simulator all RGB pixels matched in the moving, dead, restarted, autopilot and launcher captures. The candidate's virtual trace concluded with zero world crashes.

### What didn't work

CJI reported `Cannot read properties of null (reading 'includes')`. The direct traceback pointed to support() in cji/src/library.js called from dispatch(). The host replay had passed because its JS engine can dispatch those receiver types without the compiler's specialization step. The earlier emulator filename failure is documented in Step 2.

### What I learned

Each resource has a distinct unit. The bitset has 416 bit positions for 396 valid cell IDs. Their physical storage in a particular JS runtime includes the array and element representation. The saved static algorithm does not establish peak world heap. The device report measures what the firmware exposes.

### What was tricky to build

One bitset word can have a negative signed representation when setting bit 31. The duplicate test uses bitwise intersection and tests its truth value. It does not compare that intersection with a positive number.

### What warrants a second pair of eyes

Physical device trials must verify CJI output and state through the actual parser and device drawing. Simulator screenshots cover the product's QuickJS configuration. The board operator owns image identity, UART measurements and post-test health.

### What should be done in the future

Read the physical results and reconcile the observed cost with the expected reduction in pixel writes. Publish the final articles, including evidence that might contradict the expected CPU gain.

### Code review instructions

Run the commands in scripts/01-native-fixture.py and scripts/02-simulate-game.py. For the standalone compositor call, pass --world-unit --emit to the CJI driver. Independent replay tests compare both the received state and the back and presented buffers.

### Technical details

The screenshots are 320×320 unscaled RGB images of the simulated display controller. various/simulator.json stores a SHA-256 of decompressed pixels for each capture. The research-design Opus request used a source-free brief. Automated approval review held a separate request to provide measurements; I requested specific consent and continued locally rather than disclosing internal data.

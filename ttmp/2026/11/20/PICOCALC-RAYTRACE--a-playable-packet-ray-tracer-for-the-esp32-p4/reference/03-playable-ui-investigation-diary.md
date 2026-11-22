---
Title: Playable UI investigation diary
Ticket: PICOCALC-RAYTRACE
Status: complete
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: apps/js/picocalc/system/compositor.js
      Note: Scene admission and composition
    - Path: apps/tours/picocalc/raytrace.txt
      Note: Repeatable launcher and keyboard inputs
ExternalSources: []
Summary: Control design, direct framebuffer integration, and end-to-end host verification.
LastUpdated: 2026-11-20T23:26:00-05:00
WhatFor: Review the path from the launcher through the simulator panel.
WhenToUse: When changing scene coordinates, UI inputs or viewport geometry.
---

# Playable UI investigation diary

## Step 1. November 20, 23:19–23:23 EST. Connect the keyboard and display

The director requested an app a user could enter through the normal launcher. I coordinated the four scene coordinates with the renderer author and a precise viewport with the physical qualification owner. The app uses the existing screen publication and focus lifecycle. Rendering takes place in the compositor's framebuffer on both Linux and the handheld.

### Prompt context

The director's diary quotes the user’s request as “Ok, create it.” The director delegated the following implementation task verbatim.

> Own playable user-facing raytracer UI/interaction (moving sphere/light, launching on normal PicoCalc). Coordinate with pie_supervisor who owns board/port and pie_lowering who owns renderer. Author runnable host preview if appropriate. Commit, diary, report in PICOCALC-RAYTRACE ticket. Work now.

I interpreted this as permission to register the app in the ordinary catalog and implement both framebuffer bindings. The designated board owner handled firmware installation and target operation.

### What I did

Added the Ray Tracer launcher entry, shortcut and input handlers. Added a semantic screen and a checked native graphics operation to the CJI and QuickJS framebuffer implementations. Generated the prelude export record again with `node cji/tools/gen-prelude-exports.mjs`. Code commit `3a67c10` covers the app, integration and normal host script.

### Why

A complete screen of four numbers preserves a known scene across focus changes. A separate pixel image or pixel list in a world message would consume substantially more memory. The 240-pixel square leaves usable room for controls and OS status.

### What worked

`node cji/cji.js picocalc-os/js/system/compositor.js --world-unit --emit` generated its world unit. The QuickJS host linked with `make -C picocalc-os -j8`. Opening V through the launcher showed the expected spheres, instructions and coordinates.

### What didn't work

A 2× enlargement would occupy all 320 display rows. The standard header and footer leave only 280 rows for content. I selected 3:2 nearest-neighbor enlargement and gave the physical measurement owner the coordinate mapping before capture.

### What I learned

The release uses a compiled CJI compositor. Updating the QuickJS handle alone would only exercise the Linux simulation. The native prelude already has a four-coordinate packet primitive; the new operation reuses it and checks its length.

### What was tricky to build

The renderer writes source and expanded pixels in one buffer. Bottom-to-top row order protects pending source rows. Right-to-left column order protects the source on shared rows. The renderer accepts a stride greater than its active width, which allows the compositor to avoid allocating a second image.

### What warrants a second pair of eyes

Check the native packet operation number (1023) against the CJI prelude, the writable framebuffer handle and the compositor sender. The scene’s integer bounds must agree with those accepted by the renderer.

### What should be done in the future

Compare the P4 front-buffer crop after launcher events with the same scalar reference. The board owner has the exact scene and geometry.

### Code review instructions

Read the app state and controls in `picocalc-os/js/apps/raytrace.js`, then follow `drawRayScene`, `CJI_RAYTRACE` and `gfx_raytrace`. The hardware and simulator use separate entry bindings to the same drawing routine.

### Technical details

The viewport at (40, 32) uses 240×240 display pixels. Its source is 160×160 RGB565. For a 320-pixel framebuffer stride the destination pointer is `back + 32*320 + 40`. Each displayed pixel uses source (⌊2x/3⌋, ⌊2y/3⌋) relative to the viewport origin.

## Step 2. November 20, 23:23–23:26 EST. Verify the panel after real key dispatch

I exercised the Linux host as an operator would. Six PNG captures followed the key sequence F1, V, Right, W, R, F1. The resulting comparison also establishes a reproducible host preview. Physical measurements belong to the board owner’s separate report.

### Prompt context

See step 1. The user-facing goal was to move both controls, launch normally and see the result.

### What I did

Added `scripts/ui/verify-host.py` in the ticket. It builds the simulator and a copy of the C scalar reference, sends keys through the simulated keyboard, and compares every viewport pixel. Archived one full-panel screenshot and the compact numerical receipt.

### Why

A render function returning successfully cannot establish that a user can find the app, that a key reaches the intended control, or that the composed image has the expected scale and color.

### What worked

All 57,600 display pixels matched for each of four poses. The successive changes affected 6,156, 8,885 and 12,257 pixels. The initial and reset crops had identical SHA-256 values. F1 restored the original launcher title. All 67 tests in `make -C picocalc-os test-apps` passed, along with all 12 in `node picocalc-os/tests/compositor-auth.test.mjs`.

### What didn't work

No pixel or admission checks failed. I reserved diary number 03 when the physical study took number 04.

### What I learned

The simulated panel expands a 5-bit channel using integer division, `component*255/31`, and a 6-bit channel using `component*255/63`. Testing these exact values distinguishes a framebuffer mapping issue from a PNG conversion difference.

### What was tricky to build

A different launcher tile may remain selected on return. Comparing the app-independent title region before and after F1 verifies the focus change while allowing the selected tile to remain Ray Tracer.

### What warrants a second pair of eyes

The PNG and oracle share the C scalar shading implementation. This receipt establishes the UI-to-panel integration and geometry of the crop. The physical scalar/PIE tests supply target evidence. Simulation waits do not measure handheld input latency.

### What should be done in the future

Use the same reference gate when changing the scene default, control step or viewport. Coordinate any mapping change with the hardware capture script.

### Code review instructions

Run `python3 ttmp/2026/11/20/PICOCALC-RAYTRACE*/scripts/ui/verify-host.py /tmp/picocalc-raytrace-ui`. Compare its summary with [the recorded results](../various/ui/host-ui.json).

### Technical details

The opening image hash covers the RGB888 bytes of the displayed 240×240 crop in row-major order. It is `9c1926540bf1c8df1f75b1816081ea62666a6bdb3ff05133ddf0768f4e44e02e`. UI unit tests separately exercise coordinate clamps, mixed-case controls, ignored key-up events, sender identity and malformed scene rejection.

---
Title: Investigation diary
Ticket: PICOCALC-CANDELA-GALLERY
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of building the on-screen Candela gallery: host preparation of presets, the firmware renderer, device measurements, agreement checks and installation."
LastUpdated: 2026-11-22T08:45:00-05:00
WhatFor: "What was done, in what order, what failed and why, with the commands and evidence of each step"
WhenToUse: "When resuming the ticket, reviewing its commits, or reproducing a measurement"
---

# Investigation diary

## Step 1: Read the three Candela tickets and the firmware's display path

The goal is to put real Candela path-traced scenes on the PicoCalc's own screen. Before writing code I read the three tickets this work builds on (CPU-KERNEL, SECTIONS, WORLD), the FIRST-LIGHT stub that planned this integration, and the parts of the firmware that decide what reaches the panel. The outcome is a plan that touches the playable firmware only behind a new build option, and reuses the compositor's existing native-image call.

### Prompt Context

**User prompt (verbatim, as relayed by the supervising session):** "can i see more scenes running on the device itself?"

**Assistant interpretation:** The supervising session turned this into a brief (summarised, not verbatim): render CPU-KERNEL's six measured presets and as many of SECTIONS' 20 verified presets as fit, on core 1 in a worker task, with progressive accumulation, tone mapping and a 160 to 320 upscale; advance scenes on their own because the user has switched the keyboard and display off on purpose; put it behind a new option that leaves the playable firmware unchanged when off; measure time to first image, seconds per pass, samples per second and peak heap per scene; compare a device frame digest with the host build; decide the FP-contraction policy; leave the gallery installed if every other world stays healthy; update `/tmp/picocalc-current-playable.txt`. Milestone B, if time remains: connect WORLD's front end to the real renderer.

**Inferred user intent:** See a variety of physically based scenes rendered by the handheld itself, on its screen, without having to operate it.

### What I did
- Fast-forwarded the worktree branch from `ad48b80` to `main` at `627d608` (311 commits, including the three Candela tickets).
- Read CPU-KERNEL's design and analysis, SECTIONS' design (Sections 7, 12, 13), WORLD's design (Sections 8-10), FIRST-LIGHT's stub, and the P4 port: `build-smooth-chess.sh`, both CMake files, `main_p4.c` (task layout), `painter_service.c` (core-1 worker pattern), `nucleus/gfx.c` (`gfx_raytrace`), `js/system/compositor.js` (`drawRayScene`, focus, `open`), `js/prelude.js` (`app()`), Candela's `src/viewport.js` (frame uniforms, metering, display uniforms D).
- Extracted `~/Downloads/candela-workspace(1).zip` (SHA-256 `873b2dd4...df5d`, the pinned version) into the scratchpad and made a Node run directory (`src/`, `content/`, `package.json` with `"type": "module"`), as SECTIONS did.

### Why
- The compositor owns the framebuffer; apps publish trees. The only native-image path a JavaScript or CJI compositor has is `fb.raytrace(sx, sy, lx, ly, selection)` (`gfx_raytrace` in C), already used by the Ray Tracer app. Reusing it with a new selection value under the option avoids a new system call.

### What worked
- The pieces exist and fit: CPU-KERNEL's `NS_bind`/`NS_render_span`/`NS_post_bind`/`NS_display_px`, SECTIONS' `cdl_vm` and its `Sections` adapter, Candela's viewport rules for the frame index (`U(0).z`: 0, then spp + 1) and exposure (meter at 2, 8 and 32 spp, `D(0).w = 1 / (1.2 * 2^ev)`, initial ev 12).
- SECTIONS' RV32 digests without contraction (`rv32-nofma`) equal the x86-64 host digests for R-01, E-02, W-02, G-02, X-04 and S-02, and differ for B-01, L-03, G-01, F-01 and K-04 (scenes with a Preetham sky: the sky table is built with libm `acosf`, which glibc and newlib round differently).

### What didn't work
- No failures in this step.

### What I learned
- The kernel task runs on core 1 at priority 5; the painter's build worker runs there at priority 2 with a PSRAM stack, "in the kernel's idle time". The task watchdog does not check CPU 1's idle task (`CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU1=n`).
- The compositor is compiled to a native ELF by CJI in the playable build (`CJI_WORLDS` includes `compositor`), and CJI supports `fb.raytrace`.
- A bundled world can bring itself to the front with `send("compositor", "open", {app})`. With the keyboard off, that is the only way the gallery can be seen.
- SECTIONS' adapter keeps a 16 KB register file in static storage, which in the firmware would be internal RAM (about 87 KB free at run time per WORLD's measurement).

### What was tricky to build
- Nothing built yet.

### What warrants a second pair of eyes
- The plan patches the compositor's source at build time (only with the option), instead of editing `js/system/compositor.js`, so the playable firmware's compositor is unchanged when the option is off.

### What should be done in the future
- N/A

### Code review instructions
- N/A (no code in this step).

### Technical details
- Restore target at the start: `/tmp/picocalc-current-playable.txt` = `/tmp/picocalc-playable-smooth-chess-676ae95/build b22a807d7c1e72227847b7762de09b927b5a86f537d8a1f434c77d618a69f62c`.
- Toolchain for host RV32 references: `esp-14.2.0_20241119` (the one ESP-IDF 5.4.2 selects).

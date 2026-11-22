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

## Step 2: Prepare 18 presets on the host and reproduce the earlier tickets' digests

I wrote the host side first, so that every later device number has a reference: a Node script that turns presets into the firmware's scene table, a vendoring script for the kernel and interpreter, the renderer core as plain C, and a reference driver that runs that core on x86-64 and in the RV32 counting interpreter. The scene data and the renderer reproduce the frame digests that CPU-KERNEL and SECTIONS recorded, so the gallery renders the same scenes those tickets measured.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Prepare the presets (packed arrays plus section bytecode) on the host, starting with CPU-KERNEL's six and adding SECTIONS' verified presets as the budget allows.
**Inferred user intent:** A gallery that shows real Candela output, verifiably the same as the earlier tickets' renders.
**Commit (code):** 9d53673 — "candela-gallery: ticket, host preparation of 18 presets, vendored kernel and interpreter"

### What I did
- `scripts/01-prepare-scenes.mjs`: imports CPU-KERNEL's `lib/candela.mjs` (`exportScene`, pin check) and SECTIONS' `translator/index.js` (`translateProgram`) read-only; packs each preset at 160 or 80 pixels; reads tone map, post passes, exposure mode, EV and tan(fov/2) as `src/viewport.js` does; checks the fixed-kernel digest `8925739795c7...942d`; writes `candela_gallery_scenes.c` and `scenes.json`.
- `scripts/02-vendor.py`: copies `cdl_kernel.{h,cpp}`, `cdl_post.cpp`, `manifest.json`, the `cpu/` headers, `cdl_vm.{h,c}`, `cdl_vm_isa.h`, `cdl_vm_ck_math.h` into `picocalc-os/third_party/candela/{kernel,vm}`, records each SHA-256 in `VENDOR.json`, writes `kernel/cdl_fixed_kernel.c` after checking that the scenes were prepared with the kernel.js the kernel was generated from (`253d242d...`). `--check` verifies.
- `picocalc-os/nucleus/candela_gallery.{h,c}` (renderer core) and `candela_gallery_instance.cpp` (one per kernel instance: SECTIONS' adapter with the caller's register file).
- `scripts/03-gallery-ref.c` and `scripts/04-build-ref.py`: the core, the table and two instances (`cg` RGB, `cgs` spectral) built with `-O2 -ffp-contract=off -fno-math-errno -fwrapv` for x86-64 and for RV32 (`esp-14.2.0_20241119`, the counting interpreter from SECTIONS' `harness/`).

### Why
- The device's digests need references from the same sources; building the firmware's own core on the host gives that without a second implementation.

### What worked
- 18 presets prepare in 3.8 s; 39,644 bytes of scene data and bytecode in all.
- x86-64 frame-0 digests equal SECTIONS' host records: B-01 `df6d3f85`, R-01 `e8421c97`, L-03 `585a3f2f`, G-01 `211878db`, E-02 `de9e22b5` (160 x 160), X-04 `2b9af109`, S-02 `e32b0f6b`, V-04 `02677786`, R-04 `aa40e023` (80 x 80). So the packed data equals CPU-KERNEL's `exportScene` output and the interpreter path equals SECTIONS'.
- RV32 frame-0 digest of B-01 `e2ba6956` equals SECTIONS' `rv32-nofma` record; the 1-pass display digest `bcf3a8e8` is the same on x86-64 and RV32.
- The table-based AgX display differs from CPU-KERNEL's generated `displayPx` in at most 282 of 25,600 pixels (F-01), each by one RGB565 step, over all 18 scenes at 4 passes.

### What didn't work
- K-04 and K-08: `exportScene` produced 18,171,296 and 17,057,600 bytes. Their meshes pack into 1,135,111 and 1,065,550 static SD rows; that does not fit the 8 MB app partition, so both are left out (comment in `GALLERY`).
- First table: `invalid suffix "f" on integer constant` for `0f` (JavaScript prints `0`); fixed with a float-literal helper (`flit`).
- `04-build-ref.py rv32`: `ValueError: invalid literal for int() with base 10: ' sphere"'` — the title "Hello, sphere" has a comma; sizes are now parsed with a regular expression.
- A C comment containing `--*/scripts` closed itself; reworded.

### What I learned
- At 4 and 64 passes (host contact sheets in the scratchpad) every scene is recognisable; the spectral S-02 and R-05 stay visibly noisy at 64 spp.
- RV32 instructions per sample of pass 0 with the 1/16 sub-passes are 5,810 for B-01 against 4,954 for SECTIONS' row-major frame 0: per-pixel `render_span` calls cost about 15% in pass 0 only.

### What was tricky to build
- The sky-table workspace must start zeroed: `cdl_sky_bind` compares a tag and the uniform rows to decide whether to rebuild, so a fresh allocation with stale bytes could skip the build. `cg_begin` zeroes it when it allocates it.

### What warrants a second pair of eyes
- `cg_meter` counts only sampled pixels during pass 0, and the gallery meters the first coarse image in addition to Candela's 2, 8 and 32 spp. Both are deliberate deviations from `viewport.js`, so that the first image is not shown at EV 12.

### What should be done in the future
- N/A

### Code review instructions
- `node scripts/01-prepare-scenes.mjs <candela-run> <out>`; `python3 -I scripts/02-vendor.py --check <out>/candela_gallery_scenes.c`; `python3 -I scripts/04-build-ref.py host <work> 4 <imgdir>`.

### Technical details
- Gallery order: B-01, R-01, L-03, G-01, E-02, W-02, F-01, V-02, G-02 (160); X-04, S-02, R-05, V-03, V-04, R-08, X-03, R-04, G-03 (80).
- Host microseconds per sample at 4 passes: B-01 0.70, R-01 1.65, W-02 2.83, X-04 4.66, V-04 10.5, R-08 14.4, X-03 31.9, G-03 63.2, R-04 71.3.

## Step 3: Put the renderer in the firmware behind PICOCALC_CANDELA_GALLERY, and prove the playable build unchanged without it

The gallery is one build option. With it, a worker task on core 1 renders the presets, `gfx_raytrace` draws its frames for a new selection (1000), a build-time copy of the compositor shows the gallery world full screen, and the console gets a `gallery` command. Without it, every source of the playable build preprocesses to the same bytes as main's, and the CMake configuration is the same.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Make the gallery reachable in the playable firmware behind a new option that is off by default, and show, as WORLD's scripts 13 and 14 did, that the option-off build is exactly the playable one.
**Inferred user intent:** Scenes on the handheld's screen without risk to the everyday firmware.
**Commit (code):** f3ef8fa (rebased from c417f9f) — "candela-gallery: renderer on core 1 behind PICOCALC_CANDELA_GALLERY"; 7e5d1ea (rebased) — digest variants and run-script fixes.

### What I did
- `port/esp32p4/main/candela_gallery_p4.c`: the worker (core 1, priority 1, below the kernel task's 5; 24 KB stack in PSRAM, as the painter's build worker), commands through a queue, a triple buffer of 320 x 320 RGB565 frames, CGAL records, the console command. The first `p4_gallery_take` (the compositor's first draw of the gallery) starts it, so a firmware whose gallery is never opened allocates nothing.
- `nucleus/gfx.c`: `gfx_gallery()` copies the newest frame and draws a two-part caption over a darkened bottom strip; called for selection 1000 inside `gfx_raytrace`, both under `#if PICOCALC_CANDELA_GALLERY`.
- `tools/candela-gallery-compositor.py`: four anchored edits to a build-tree copy of `worlds/compositor.js` (draw the gallery full screen when it has focus; validate its frames). The compositor source itself is not changed.
- `worlds/candela-gallery/`: a 40-line world, key `p` in the launcher; Left/Right (or n, space, enter / b) change the scene.
- CMake: the option, two kernel instances (`cg` RGB, `cgs` spectral) through `file(CONFIGURE)` wrappers with `CDL_NS`, `-ffp-contract=off -fno-math-errno -fwrapv` on kernel, interpreter and core.
- `scripts/05-same-without-option.py` (preprocessed sources) and `scripts/08-same-build-files.py` (compile commands, build graph, manifests).
- Rebased onto main 5c01d81 (the ray tracing app's "kernel" policy, 3353264) before the image to install, as the coordinator asked.

### Why
- A full-screen early return in a copy of the compositor keeps the playable compositor's bytes as they are; the option decides which copy is compiled.

### What worked
- First build with the option: 4,910,640-byte app, no errors.
- `05-same-without-option.py <wt> 5c01d81 /tmp/picocalc-candela-gallery-off-5c01d81/build`: 19 of 19 sources the change reaches (gfx.c, main_p4.c and the 17 others that include p4.h) preprocess byte-identically. With the option, gfx.c differs in 19 preprocessed lines and main_p4.c in 3.
- `08-same-build-files.py` against a fresh configure of main 5c01d81: compile commands, build.ninja and all five world manifests the same (paths, app version string, Python environment and git HEAD watch files set aside, and listed).

### What didn't work
- First proof: `DIFFERENT without the option: picocalc-os/port/esp32p4/main/main_p4.c`. The diff was one `ESP_ERROR_CHECK(uart_driver_install(...))` line: `__LINE__` had moved because I inserted lines above it. Fix: no added lines in main_p4.c. The console case is a macro (`P4_GALLERY_CONSOLE`, empty without the option, defined in p4.h) appended to an existing line, and the worker starts lazily, so `main()` needs no call.
- The base copy's `__FILE__` named the temporary directory; mapped back with `-fmacro-prefix-map`, and the base p4.h is written next to the base source so quote includes find it.
- `build.ninja` differed in `TARGET_PDB` lines when the option-off directory had been configured twice; two fresh configures agree. So both sides of the comparison must be first configures.
- The first smoke run failed in the health check: `native worlds unhealthy with peripherals off: [('snake', {... 'state': 'restarting', 'restarts': 0, 'last_error': ''}), ...]`, 13 s after the reset, during the boot compiles (Candela 2.2 s, Agenda 0.7 s, Files 0.4 s, Editor 3.2 s, Chess 3.9 s). The run script now waits up to 90 s while worlds are only "restarting" with no restarts and no error (8 s were needed).
- The second run reached the gallery (first image of B-01 233 ms after it opened) and then timed out in the screen capture: `TimeoutError: b'KpwBAKukAQ'`. A path-traced frame has almost no equal neighbours, so the framebuffer's RLE is about 400 KB; 2,203 lines of base64 had arrived in the shared helper's 15 s. The run script has its own capture with a 180 s deadline and pauses the gallery meanwhile. Both runs restored the playable image, healthy.

### What I learned
- B-01 on the device in the worker: 0.9 s per 160 x 160 pass, about 13,100 cycles per sample, against 5,744 RV32 instructions per sample at 4 passes (CPU-KERNEL's CPI of 1.28-1.72 would give 7,400-9,900). Step 4 measures where the difference goes.

### What was tricky to build
- Anything that adds a line to main_p4.c shifts `__LINE__` in the playable binary. The macro on an existing line is the smallest change that keeps it.

### What warrants a second pair of eyes
- The compositor patch is anchored on four exact strings; if compositor.js changes, the tool fails the build (each anchor must occur once), which is intended.

### What should be done in the future
- N/A

### Code review instructions
- `bash picocalc-os/port/esp32p4/build-smooth-chess.sh BUILD -D PICOCALC_CANDELA_GALLERY=ON`; then `python3 -I scripts/05-same-without-option.py WT 5c01d81 OFF_BUILD` and `python3 -I scripts/08-same-build-files.py BASE_SRC BASE_BUILD WT OFF_BUILD`.

### Technical details
- Smoke and first full run: `various/device-01-smoke/`, `various/device-02-full/` (candidate d099ee7a..., restored b22a807d...).

## Step 4: Find where the device's cycles go: stack placement, the kernel task, the display

The worker took about 13,100 cycles per sample for B-01 where CPU-KERNEL's standalone benchmark would predict 7,400-9,900. I added digest variants that run the same digest on a helper task with a PSRAM stack, an internal-RAM stack, or above the kernel task, and ran five scenes on one boot. The stack's placement is worth 1-3%; sharing core 1 with the rest of the firmware is worth 28-36%. All 15 digests equal the RV32 references, whatever the variant.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Measure per scene and explain the numbers; a real number for each claim.
**Inferred user intent:** Know what the gallery costs and why, before it stays installed.
**Commit (code):** 7e5d1ea — digest variants; a396d3b — probe, display bound, fewer repaints.

### What I did
- `gallery digest ID PASSES psram|internal|quiet`: the digest on a helper task on core 1, priority 1 with a PSRAM or internal stack, or priority 6 (above the kernel task's 5, which waits the 2-9 s the digest takes).
- Ran `06-run-device.py --scenes B-01,R-01,W-02,X-04,S-02 --variant-scenes ... --skip-scenes` (`various/device-03-placement/`), restored main's 8acb94cc (healthy).

### Why
- PSRAM stacks, the kernel task and cache pressure were all plausible; one boot with three variants separates them.

### What worked
- Cycles per sample at 4 passes (PSRAM / internal / above the kernel task): B-01 13,545 / 13,219 / 8,622; R-01 20,687 / 20,429 / 14,662; W-02 31,592 / 31,016 / 21,861; X-04 77,983 / 77,204 / 55,934; S-02 51,775 / 50,360 / 35,769.
- Above the kernel task, B-01 runs at 8,622 / 5,744 = CPI 1.50, inside CPU-KERNEL's 1.28-1.72: the kernel code and the interpreter run on the device as counted.
- Frame-0, accumulation and display digests equal the RV32 interpreter's for all five scenes and all three variants. Against x86-64: equal for R-01, W-02, X-04, S-02; for B-01 (a Preetham sky) frame 0 and the accumulation differ, as expected from libm, and the display digest is the same.

### What didn't work
- N/A (the experiment answered its question).

### What I learned
- The internal heap has about 70 KB free while the gallery runs (`internalFree0` 70,479-71,283). A 24 KB internal stack would buy 1-3%; not worth a third of the free internal heap. The stack stays in PSRAM.
- One display (tone map 160 x 160, upscale to 320 x 320, publish) costs 131-145 ms on the worker (`displayCyclesMean` 47.3 M for B-01). With a display after every pass, B-01 spent 7.5 s of its 60 s on 52 displays. a396d3b shows a pass only when ten display durations have passed since the last.
- The gallery world repainted four times a second, and each repaint copies the 200 KB frame into the compositor's back buffer and compares it with the front buffer on the kernel task. a396d3b repaints four times a second only for two seconds after the gallery opens or a key changes the scene, then twice a second.

### What was tricky to build
- The helper task must not delete itself while the worker waits on it: it notifies and suspends, and the worker deletes it (`vTaskDeleteWithCaps`, since its stack came from `xTaskCreatePinnedToCoreWithCaps`).

### What warrants a second pair of eyes
- The `quiet` variant starves the kernel task for the digest's duration (2.5-6.2 s here). It is a measurement, not something the gallery does.

### What should be done in the future
- `gallery probe MS` (a396d3b) measures what a priority-1 task on core 1 loses directly to other tasks and interrupts; the difference between that and the 28-36% is cache and memory interference. Step 5 records it.

### Code review instructions
- `python3 -I scripts/07-summarize.py various/device-03-placement various/references/host-4-passes.jsonl various/references/rv32-4-passes.jsonl OUT.json --md OUT.md`.

### Technical details
- Placement image 2fd89ccd... (based on 627d608, an experiment; not installed).

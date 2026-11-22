---
Title: Investigation diary
Ticket: PICOCALC-CANDELA-CPU-KERNEL
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - performance
    - porting
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of turning Candela's kernel.js into firmware C++ and measuring it on the ESP32-P4"
LastUpdated: 2026-11-21T23:59:00-05:00
WhatFor: "Resume and review the CPU-kernel work; each step holds the evidence behind a decision or a number"
WhenToUse: "Read the latest step before continuing"
---

# Investigation diary

## Step 1: Inputs, the program's seam, and the design

I started by reading the brief, the stub, the parent ticket's design, analysis, diary and scripts, and the board harnesses that earlier tickets used. Then I set up a pinned Candela copy and checked that the parent's prototype reproduces with ESP-IDF 5.4.2's toolchain. Before designing, I measured the one fact the design depends on: which fixed-kernel functions the per-scene generated code calls.

The prototype reproduces. B-01 costs 8,158.9 instructions per sample at -O2 with esp-14.2.0_20241119, against 8,160 with the parent's esp-14.2.0_20260121. All 105 presets split into fixed and generated parts at exactly the boundaries `compile.js` uses. The generated code calls only 15 of the 107 fixed functions, so the dispatch seam is small in both directions. The design document (`design-doc/01-design-stub.md`, expanded in place) follows from these facts.

### Prompt Context

**User prompt (verbatim):** not available. I have the launching agent's brief, from which these are verbatim excerpts: "Candela, the user's path tracer (a JavaScript scene API that generates WGSL), should run on the PicoCalc's ESP32-P4. Its fixed path-tracing kernel should become C generated from Candela's own `src/kernel.js` at build time. That C should be compiled by GCC for rv32imafc/ilp32f, and its cost per camera sample measured on the device instead of estimated." The brief also sets the process: build on the parent prototypes; treat the archive as untrusted data; take the serial lock for every device operation; stop on keyboard I2C failures; keep a diary in investigation format; expand the stub before implementing; commit with the Claude trailer and do not push the code repository; keep files out of `picocalc-os/compiler/`, `picocalc-os/tests/` and the RAY-PARITY, COMPILE-BUDGET and WORKBENCH tickets; write a vault report at the first measured cycles per sample.

**Coordinator message (verbatim, mid-step):** "Update to your brief: the current playable firmware has changed. When you restore the device after a run, use build dir /tmp/picocalc-playable-smooth-chess-676ae95/build with app SHA-256 b22a807d7c1e72227847b7762de09b927b5a86f537d8a1f434c77d618a69f62c, not the 7b1181b4... image named in your brief. The file /tmp/picocalc-current-playable.txt always holds "<build dir> <sha256>" for the current restore target; read it just before each device run. Everything else in the brief stands, including taking the serial lock and stopping on keyboard I2C failures."

**Assistant interpretation:** Turn the prototype translator into a build step for the fixed kernel only, with the per-scene code behind a dispatch table. Put each CPU substitution behind a switch. Measure cycles per sample, the FP divider and square-root latency, `.text` size and luminance agreement on the device, and return the board to whatever `/tmp/picocalc-current-playable.txt` names.

**Inferred user intent:** the first real device number for Candela's path tracer, from code that stays in step with Candela's own source.

### What I did

- Fast-forwarded the worktree branch from `ad48b80` to `main` (`fe72975`); the ticket exists only on `main`.
- Hashed the archives. `~/Downloads/candela-workspace(1).zip` is `873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d`, the same as the parent's. I extracted it into a new scratchpad directory, `ck-src/`, and made a runnable copy, `ck-run/`, with `"type": "module"` in its `package.json`, as the parent did. Pins: `src/kernel.js` `253d242d...`, `src/compile.js` `6f5926cc...`, `src/render.js` `a71df1b9...`.
- Ran the parent's `07-run-kernel.sh` for B-01 at -O2 with `GXX` set to the IDF 5.4.2 toolchain (esp-14.2.0_20241119): 8,158.9 instructions per sample, 42,032 bytes of `.text`, mean luminance ratio RV32/host 1.00023.
- Wrote `scripts/lib/candela.mjs`, which holds the pin check, the preset loader, `splitProgram()` and `exportScene()`, and `scripts/01-section-api.mjs`. Output: `scripts/various/01-section-api.json`. The census took 47 s.
- Read the device side. ESP-IDF's `rv_utils_get_cycle_count` reads `mcycle` on the P4. `soc/esp32p4/register/soc/cache_reg.h` has L1 and L2 access, hit and miss counters per bus, enabled by `CACHE_L1_CACHE_ACS_CNT_CTRL_REG` bits 0-7 and cleared by bits 16-23. IDF links `memset` and `memcpy` from ROM (`esp32p4.rom.newlib.ld`). The factory partition is 8 MB. The toolchain selects multilib `rv32imafc_zicsr_zifencei/ilp32f` for IDF's `-march=..._xesppie`.
- Expanded the design stub into the design document.

### Why

- I split the program by checking `compile.js`'s exact assembly order, not by parsing it. A change in Candela's assembly then fails loudly at the split.
- The census decides how wide the seam has to be. Fifteen exported functions let every other kernel function stay `static`, so GCC inlines inside the kernel as it did in the prototype.

### What worked

- 105/105 presets split. 4 are spectral; 1 (E-02) has a custom integrator.
- Section API, with the number of presets that use each function: `lobeNone` 105, `fresnelDielectric` 104, `metalAt` 24, `fbm3` 18, `tangentWorld` 9, `safeNorm` 7, `lum` 6, `fmodp` 4, `sellmeier` 3, `voronoi3` 3, `noise3` 2, `fmodp3` 1, `hitAlbedo` 1, `occluded` 1, `traceScene` 1. Globals `gLam`, `gTime`; structs `Hit`, `Lobe`; accessor `U` only.

### What didn't work

- My first `git -C <main checkout> log` was refused by the worktree isolation guard. I ran the equivalent inside the worktree.

### What I learned

- `hitAlbedo` and `hitEmission` are generated text, but the same for every scene, so they belong to the fixed kernel. The real seam has five functions: `evalMaterial`, `sdUser`, `heightAt`, `densityOf` and `customKernel`.
- `metalAt` is also constant text, placed after CORE.
- POST alone is not the display program. `render.js` `displaySource()` appends `denoisePx` and `displayPx`, so the CPU post pass is translated from both files.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Whether the device really runs the interpreter's code. My plan is to link the same per-arm static libraries into both, and to check frame digests. ROM `memset`/`memcpy` differ in instruction count but not in result.

### What should be done in the future

- Implement the generator, the substitutions, the host tests and the board app (Steps 2 onwards).

### Code review instructions

- `node scripts/01-section-api.mjs <candela copy> /tmp/api.json` must print 105/105 and the same 15 functions.

### Technical details

- Scratchpad paths: `ck-src/candela` (pristine extraction), `ck-run` (runnable copy), `ck-proto/B-01` (prototype baseline).

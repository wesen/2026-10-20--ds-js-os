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

## Step 2: The generator, the section table, and 18 arms counted

I turned the prototype translator into `lib/wgsl2c.mjs` (strict tokenizer, select and zero-initialisation macros, override points) and wrote `02-gen-kernel.mjs` (fixed kernel and post pass), `03-gen-scene.mjs` (a preset's sections behind `struct Sections`), the CPU substitution headers in `cpu/`, the shared driver `06-driver.c`, the interpreter with counted regions (`05-rv32imfc-count.c`) and the arm builder `04-build.py`. Eighteen arms on six scenes build in 34 s and count in about 3 minutes.

The generated kernel computes exactly what the prototype computed. For B-01, my `proto` arm's RV32 frame is byte-identical to the parent's `07-run-kernel.sh` frame, and the `lazy` arm, with its sections behind the dispatch table, is byte-identical to `proto`. Instruction counts differ by 4.2% (8,503 against 8,159), which is GCC inlining: `finishHit` no longer folds into a constant-propagated `traceScene`.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** implement the build step, the substitutions and the measurement arms.
**Inferred user intent:** a kernel that firmware can link, with each substitution measurable.
**Commit (code):** 63e6997 — "feat(candela-cpu-kernel): generator for the fixed kernel, section tables, 18 measurement arms"

### What I did

- `02-gen-kernel.mjs`: 107 functions, 9 structs, 15 exported as `api::` wrappers; post 12 functions. Outputs and the exact WGSL go to `scripts/generated/`.
- `03-gen-scene.mjs` for B-01, R-01, L-03, G-01, E-02 at 160 x 160 and W-02 at 80 x 80.
- C API: `NS_bind`, `NS_sky_bytes`, `NS_render_pixel`, `NS_render_span`, `NS_post_bind`, `NS_display_px`, `NS_denoise_px` (`cpu/cdl_api.h`).
- Chased the gap to the prototype with controlled builds: `-fwrapv` (no effect), trivially default-constructible vectors (no effect), no API wrappers (no effect), static globals (worse by 38-43 instructions per sample).

### Why

- A span entry point, so that `renderPixel` inlines into the pixel loop; it is also what a render service calls.
- `T x CDL_ZI` (value-initialisation) rather than `memset`: GCC can drop the zeroing of fields written later only for the former.

### What worked

- Instructions per sample at -O2 (`various/02-interpreter-counts.txt`): B-01 `wgsl` 9,338, `lazy` 8,524, `cpu` 4,419; W-02 79,715 against 13,890; R-01 11,023 against 9,534.

### What didn't work

- `CDL_DECLARE_INSTANCE(CDL_NS)` declared `CDL_NS_bind`: `##` stops expansion. Fixed with a second macro level.
- An explicit `memset` for zero-initialisation and a 48-byte `memcpy` of `PixOut` in `render_pixel` added about 120 instructions per sample (`memcpy` +69, `memset` +54 in the profile).
- Adding `render_span` beside `render_pixel` gave `renderPixel` two callers, so it stopped inlining (8,612). `render_pixel` now calls `render_span` (8,503).

### What I learned

- `-ffp-contract=fast` makes RV32 digests depend on code shape. Digest equality is a valid test only between builds of the same code (device against interpreter), or between host builds, which have no FMA.

### What was tricky to build

- Keeping the kernel's inlining intact with a seam. The 15 section-API functions get external wrappers and everything else stays `static`; the wrappers did not change the counts.

### What warrants a second pair of eyes

- `-fdata-sections` alone moves B-01 by 26 instructions per sample (8,584 against 8,610): address materialisation of globals. Small effects of this size are layout, not semantics.

### What should be done in the future

- N/A for this step.

### Code review instructions

- `python3 -I scripts/04-build.py <dir> rv32 && python3 -I scripts/04-build.py <dir> count && python3 -I scripts/08-counts-table.py <dir>/counts.jsonl`.

### Technical details

- Compile flags: `-march=rv32imafc_zicsr_zifencei -mabi=ilp32f -O2 -fno-math-errno -fwrapv -msmall-data-limit=0 -mno-relax -std=gnu++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics`, esp-14.2.0_20241119.

## Step 3: Eager select returned a dangling reference; host tests

The first full count showed the two eager-select arms (`wgsl`, `cpu-lazy`) rendering black frames at a third of the lazy arms' instruction count. The cause was my `select` template: `-> decltype(c ? t : f)` is `T&` when both arguments are lvalues of the same type, so it returned a reference to a by-value parameter. At -O0 the stack slot happened to survive; at -O2 `safeNorm(vec3f(1, 2, 3))` returned zero. The lazy arms used the same template for the one random-number select (`gTau`, only read with motion blur). A plain `auto` return type fixed it. The eager arms now cost more than the lazy ones, as they must (B-01 9,338 against 8,524).

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** make the host tests that the stub's acceptance relies on.
**Inferred user intent:** device numbers that rest on a verified kernel.
**Commit (code):** f65c225 — "feat(candela-cpu-kernel): host tests, board benchmark app and runner"

### What I did

- Traced one pixel through the eager kernel on the host (`hdriTexel`'s `x0 % W` patched to RISC-V semantics, because x86 traps on integer division by zero): `tracePath` was sensible, `renderPixel` returned `-inf` at -O2 only.
- On the host (no FMA), eager and lazy builds give bit-identical frames for B-01 and W-02 (`b6b4939a`, `52b7a12f`).
- `09-host-tests.py poison`: 18/18 frames bit-identical between 0xA5-poisoned and zeroed builds (`cpu`, `noinit`, `hash`, six scenes).
- `09-host-tests.py sky` with `07-sky-error.cpp` (400,000 directions): N = 16, 32, 64, 128 give a mean upper-hemisphere luminance error of 0.96%, 0.23%, 0.057%, 0.014% for B-01 (49 KB at N = 64; 12 KB at N = 32).
- `09-host-tests.py frames` at 64 spp: mean luminance `cpu`/`lazy` B-01 1.00021, R-01 1.00000, L-03 0.99995, G-01 0.99997, E-02 1.00000, W-02 0.99987. B-01's change is all the sky table's (`cpu`/`hash` 1.00021).
- All 105 presets' sections translate and match the dispatch signatures (`03-gen-scene.mjs --check-only`).

### Why

- Poisoning and comparing makes a skipped initialisation that matters visible on the host, where results are reproducible bit for bit.

### What worked

- See the numbers above.

### What didn't work

- `07-sky-error.cpp` lacked `<math.h>`. The first poison run raced on shared object names across parallel scenes (`file format not recognized`); fixed with one directory per scene.

### What I learned

- The substitutions do not change the random stream, so a 64 spp comparison against the exact build is paired: the differences are rounding effects, not Monte Carlo noise.

### What was tricky to build

- Telling a semantic difference from a code-generation difference between arms: the host build without FMA is the arbiter.

### What warrants a second pair of eyes

- The sky table's lower-hemisphere error (0.7% mean at N = 64) comes from clamping at the table's horizon texels; it is multiplied by Candela's 0.25 x exp(3 y) ground factor, so its effect on images is small, but a horizon ring would remove it.

### What should be done in the future

- N/A.

### Code review instructions

- `python3 -I scripts/09-host-tests.py <dir> poison` must exit 0.

### Technical details

- `various/03-sky-error.jsonl`, `various/04-poison.jsonl`, `various/05-host-frames-64spp.jsonl`.

## Step 4: First device cycles per sample

The timing app (CDL_BENCH_MODE 1, 18 arms x 6 scenes linked into one factory image) ran on the ESP32-P4 for 305 s. Every one of the 108 device frame digests equals the counting interpreter's digest for the same library, so the device executed exactly the instructions that were counted, and cycles per instruction can be read straight off the two tables. B-01 at 160 x 160 costs 15,114 cycles per sample with WGSL semantics and 6,853 with every CPU substitution: 52,500 samples per second on one core, about twice the parent's estimate of 28,500-41,000. The board was restored to the playable firmware `b22a807d` and passed its health check (eight worlds, painter installed, keyboard I2C 0 errors).

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** measure on the device: cycles per sample with and without each substitution, fdiv/fsqrt latency, cache behaviour.
**Inferred user intent:** replace the parent's cycle estimates with measurements before FIRST-LIGHT chooses resolutions.
**Commit (code):** d50dc3e — "data(candela-cpu-kernel): first device cycles per sample, 18 arms x 6 scenes"

### What I did

- `09-run-board.py --probe` first: health only, nothing flashed. It passed on `b22a807d`.
- `09-run-board.py --app ck-board-1/build/candela-bench.bin` (app `b48d3cc5…a5ef`, 1,681,136 bytes): verify playable, write and verify the app at 0x10000, collect UART to CANDELA END, write and verify playable, health.
- `10-score-board.py` (cycles per sample, CPI, digest check, substitution tables, post pass, placement), `12-cycle-fit.py` (the parent's model, a microbenchmark bracket, a least-squares budget).
- Results in `various/06-board-timing/` (bench.log, score.json, score.md) and `various/07-cycle-model.txt`.

### Why

- One image with every arm, rather than one image per arm: a single flash cycle, and the board spends five minutes away from the playable firmware rather than an hour.

### What worked

- Warm frames of the same arm and scene differ by at most 0.24%; cold and warm frames are equal (a frame is 25,600 samples).
- Substitutions in cycles for B-01 (ladder / leave-one-out): lazy select 1,261 / +1,537; no zero-init 510 / +538; floor 58 / −8; polynomial sin/cos 1,147 / +709; polynomial exp 1,789 / +98; integer hash −80 / +62; sky table 3,577 / +3,577. W-02: polynomial sin/cos −76,958 of 102,960.
- Microbenchmarks: add 1, mul 2, lw 2, taken branch 3, fadd/fmul/fmin 4, fmadd 5, fdiv.s 19 (6 for 1/1), fsqrt.s 19, two fdiv chains 17 each (one unpipelined divider), fdiv plus 8 addi 19 (integer work overlaps).
- CPI 1.35-1.73. L1 instruction-cache misses 6-17% of fetches (B-01 cpu 852 of 5,377 per sample); L2 serves them (about 8 L2 misses per sample).
- Post pass: display 4,350 cycles per pixel; one à-trous iteration 23,287 (wgsl) → 11,843 (cpu).

### What didn't work

- The scorer crashed on a partial log (only cold frames, no warm median); it now falls back to the cold frames and marks `coldOnly`.
- The first image-run launch waited on the board lock held by a SIMD-LAB run. My runner had already read `/tmp/picocalc-current-playable.txt` before blocking. I stopped it (TaskStop; it had not taken the lock or touched the board) and changed the runner to read the pointer only after the lock is held.

### What I learned

- `cpu-iram` (kernel `.text` in internal RAM) is 0.8-1.5% slower than flash: its L2 misses disappear but its L1 misses do not, and L1 refills from internal RAM are no faster than from L2.
- The parent's cycle model brackets every measurement, but the device sits at 0.79-0.98 of its pessimistic end: FP latency of 4 cycles on dependent chains matters more than division.

### What was tricky to build

- Separating code-generation noise from substitution effects: the digest check against the interpreter is what makes CPI per arm trustworthy.

### What warrants a second pair of eyes

- The least-squares coefficients are correlated (integer and FP counts move together across arms); they are a budget, not latencies.
- `CKMINSTRET 1002 43178`: `minstret` counts, so the probe did not trap; the 43,178 cycles are 63 cold flash lines.

### What should be done in the future

- An `-Os` or hot-path-placed kernel to reduce L1 instruction misses (13% of B-01's cycles).

### Code review instructions

- `python3 -I scripts/10-score-board.py scripts/various/06-board-timing/bench.log scripts/various/02-interpreter-counts.jsonl /tmp/s.json` regenerates `score.txt`.

### Technical details

- Timing app SHA-256 `b48d3cc5f22d4b0b5791930121f9fccb3cec4d87e895dc94fd9e45958ce8a5ef`; restore `b22a807d7c1e72227847b7762de09b927b5a86f537d8a1f434c77d618a69f62c` from `/tmp/picocalc-playable-smooth-chess-676ae95/build`.

## Step 5: The image run, and an evaluation-order bug in the translation

The 64 spp image run passed the acceptance numbers at once. Mean luminance agreed within 0.05% for B-01, R-01, L-03 and G-01, and 99.996% of E-02's pixels agreed within 1%. Per pixel, however, only 42-59% of the path-traced scenes' pixels agreed within 1%, which a deterministic port should not show. I first attributed this to FMA contraction (RV32 contracts `a * b + c` into `fmadd.s`; the host build has no FMA). That was wrong: two host builds differing only in FMA contraction agree on 99.1-100% of pixels. The real cause was a translation bug. WGSL evaluates function arguments left to right; C++ leaves the order unspecified, and GCC evaluates them in a different order on x86-64 than on RV32. One statement in `tracePath`, `sampleLobe(L, woL, rnd2(), rnd())`, therefore drew its three random numbers in a different order on the host. The translator now hoists such calls into temporaries in WGSL's order. With the corrected host reference, device and host agree per pixel to f32 rounding.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the luminance acceptance test: RV32 frames at 64 spp against the host build of the same C++.
**Inferred user intent:** evidence that the device renders what Candela renders, not only at the same speed.
**Commit (code):** 4c10512 — "fix(candela-cpu-kernel): sequence side-effecting calls in WGSL order; device acceptance"

### What I did

- Image app (CDL_BENCH_MODE 2, SHA-256 `ea10ef88…9144`): `cpu` arm, B-01, R-01, L-03, G-01, E-02 at 160 x 160, 64 spp, frame indices 0-63. 316 s on the board, then restore to `b22a807d` (health: eight worlds, painter installed, I2C 0 errors). The first launch waited on the board lock behind a SIMD-LAB run (see Step 4).
- `11-compare-images.py`: mean luminance ratios 1.00021, 1.00037, 1.00032, 1.00046, 1.00000; per-pixel within 1%: 0.449, 0.511, 0.595, 0.424, 0.99996.
- Hypothesis 1, FMA. `09-host-tests.py fma`: the `cpu` arm built twice on the host, with and without `-mfma -ffp-contract=fast`. Per-pixel within 1%: B-01 0.99996, R-01 0.99992, L-03 1.0, G-01 0.991, E-02 0.99996. Refuted.
- Measured the divergence per sample instead of guessing. The RV32 driver already writes each row's RGB to stdout, so `rv32imfc-count rv32/cpu-B-01.elf > rv32.rgbf` gives the device's 1 spp frame (the device and the interpreter digests are equal). Against the host 1 spp frame, 58% of pixels differ by more than 1%. Rows 0-38 (sky only) agree to about 1e-6; from the first surface rows down, whole samples differ. So the paths diverge at the first bounce.
- The kernel's random streams are identical by construction (same `pcgH`, same frame indices, same accumulation). What differed was the order of draws. `14-unsequenced-rnd.py` lists every statement that calls two functions which draw random numbers (`rnd`, `rnd2` and their callers, transitively). There is one: `let bs: BS = sampleLobe(L, woL, rnd2(), rnd());` in `tracePath`.
- Fix in `lib/wgsl2c.mjs` (translation rule 5): `effectful()` computes the functions with side effects on module state (they assign a `var<private>` global, directly or through a call). `sequence()` hoists those calls, in a declaration that has two of them, into temporaries in textual (WGSL) order. Any other statement shape with two such calls fails the build, and so does a one-line function header that has two. The eager-`select` rule uses the same set. `manifest.json` records the set (`sideEffects`: 13 functions) and each sequenced statement. The generated kernel changed in exactly that line.
- Rebuilt all 18 arms (`ck-build2`). All 108 RV32 digests are unchanged, and so are the instruction counts of 15 of the 18 arms: RV32 GCC had already evaluated the arguments left to right. The `cpu` kernel's disassembly is identical before and after, so the image run had already rendered the code that is now committed. Three arms (`trig`, `cpu-exp`, `cpu-O3`) changed by 2-10 instructions per sample through register allocation; their digests are unchanged. The timing run was repeated with the rebuilt app (Step 6).
- New host references: device against host, mean ratio 0.99999959 (B-01), 1.000000013 (R-01), 0.9999999923 (L-03), 0.99995 (G-01), 1.00000009 (E-02); per pixel within 1%: 0.99996, 0.99996, 1.0, 0.991, 0.99996.
- `15-device-vs-frames.py` against the host build *with* FMA contraction: every pixel within 1.8e-6 relative for B-01, R-01, L-03 and E-02; G-01 99.8% within 1e-6, all but 0.02% within 1%.
- Poison test on the rebuilt arms: 18/18 bit-identical.

### Why

- A port that is meant to stay in step with Candela must compute Candela's samples, not samples with the same distribution. Mean-luminance acceptance alone would not have caught this.

### What worked

- Dumping the RV32 frame at 1 spp from the interpreter: a single sample per pixel separates "different decisions" from "accumulated rounding" at once.

### What didn't work

- The FMA explanation, which I wrote into a draft before testing it. The test refuted it within minutes.
- Two heredoc commands to edit `wgsl2c.mjs` were refused by the worktree guard; the edits were made with the Edit tool.

### What I learned

- GCC evaluates call arguments in different orders on x86-64 and RV32 at -O2. RV32 happened to match WGSL here; x86-64 did not.
- With evaluation order fixed, the only remaining device-host difference is FMA contraction. A host build with `-mfma -ffp-contract=fast` reproduces the device frames to f32 rounding, except in G-01's sphere tracing, where contraction is placed differently.

### What was tricky to build

- Deciding which functions have side effects. Random draws are the visible case; intersection functions (`hitObj`, `traceAll`, `traceScene`) write the hit globals `gTri` and `gBary` and are in the set too. Hoisting is safe only in a declaration's initialiser. A condition, a loop header or a lazy select would change semantics if hoisted, so the translator refuses those.

### What warrants a second pair of eyes

- `sequence()` assumes that textual order of the outermost calls is WGSL's evaluation order. That holds for left-to-right operand evaluation, provided no hoisted call contains another call with side effects. The translator checks the latter.
- The survey's prototype (`04-wgsl2cpp.mjs`) has the same bug. Its host and RV32 frames were compared only by mean luminance (within 0.7%).

### What should be done in the future

- SECTIONS' bytecode compiler must evaluate arguments left to right. The `sideEffects` list in `manifest.json` is the set to respect.

### Code review instructions

- `python3 -I scripts/14-unsequenced-rnd.py scripts/generated/kernel.wgsl` lists the statement; `grep -n cdlSeq scripts/generated/cdl_kernel.cpp` shows the fix.
- `python3 -I scripts/15-device-vs-frames.py scripts/various/08-board-images/bench.log.gz <build>/host-fma fma-` reproduces the f32-level agreement.

### Technical details

- Results: `various/08-board-images/compare.json` (against the corrected host), `compare-against-unsequenced-host.json` (the first comparison), `various/09-host-fma-64spp.jsonl`.

## Step 6: The timing run again, from the committed code, and what it says about layout

I repeated the timing run with an image built from the generator that includes rule 5, so that every committed device number comes from committed code. The board was restored to `b22a807d` afterwards and was healthy (eight worlds, painter installed, I2C 0 errors). All 108 digests again equal the interpreter's. B-01 `cpu` costs 6,832 cycles per sample (6,853 in the first run), and `wgsl` 14,976 (15,114). The comparison between the two runs turned into a measurement of its own. Thirteen arms have byte-identical kernel code in both images, yet their cycles moved by up to 2.27%, tracking their L1 instruction misses. Code placement sets the precision of arm-to-arm comparisons.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the device numbers in the ticket must come from the code in the ticket.
**Inferred user intent:** reproducible evidence.
**Commit (code):** 4c10512 — "fix(candela-cpu-kernel): sequence side-effecting calls in WGSL order; device acceptance"

### What I did

- `09-run-board.py --app ck-board2-1/build/candela-bench.bin` (SHA-256 `9913c612…f163`): 304 s, CANDELA END, restore verified.
- Moved the first run's log to `06-board-timing/bench-before-rule5.log` (and its score) and scored the new one into `score.json`/`score.txt`; regenerated `07-cycle-model.txt` and `b01-ladder.png`.
- Renamed the generated tables `score.md` and `07-cycle-model.md` to `.txt`: docmgr doctor validates every `.md` in the ticket as a document.
- Disassembled each arm's kernel object in both builds: identical for 13 of 16 multi-unit arms (all except `trig`, `cpu-exp`, `cpu-O3`).
- `16-layout-noise.py score.json score-before-rule5.json <13 arms>`: 78 cells, median |change| 0.36%, largest 2.27% (`cpu-floor` L-03, +123 cycles, +100 L1I misses). Changes in cycles and in L1I misses correlate with r = 0.60, at about 1.5 cycles per extra miss. `lazy` has its `render_span` at the same address in both images and still moved 1.6% on L-03, because its scenes' section code and the libm functions moved.
- Interpreter profile of section code in the `cpu` arm: `sec_evalMaterial` is 1.2% of B-01's instructions, 1.0% of R-01's and 0.8% of G-01's. This replaces an unsupported estimate I had drafted for SECTIONS.

### Why

- Whether a substitution is worth keeping depends on effects that can be smaller than the layout noise. Without the second run that noise would have stayed invisible, and the conversion `floor` would still read as "−8 cycles" instead of "below resolution".

### What worked

- The rerun reproduced every headline number within 1%: B-01 cpu −0.3%, R-01 −0.2%, G-01 −0.1%, L-03 +0.3%, E-02 0.0%, W-02 +0.1%.

### What didn't work

- My first draft of the SECTIONS paragraph scaled the survey's 4.5% material share by the interpreter slowdown. That share was measured against the 8,160-instruction prototype, and I could not source a "20 instructions per node" figure I had quoted. Measured directly, the section share is 0.8-1.2%.

### What I learned

- L1 instruction misses on this core cost about 1-1.5 cycles each in this code (the fit and the layout comparison agree). The L1 refill is fast, which is why moving code into internal RAM gains nothing.
- The leave-one-out cost of the small substitutions (`floor`, hash, `exp` with the sky table in place) flips sign between builds. They are below resolution.

### What was tricky to build

- Nothing new. The comparison needed the disassembly check to separate "same code, new address" from "different code".

### What warrants a second pair of eyes

- The microbenchmarks and the post pass did not change between runs (fdiv.s 19.02 in both). That supports reading the run-to-run changes as layout and not as a thermal or clock effect.

### What should be done in the future

- An experiment with a deliberately placed hot path (kernel, sections and the libm functions it uses, contiguous) to see whether the ±2% becomes a stable gain.

### Code review instructions

- `python3 -I scripts/16-layout-noise.py scripts/various/06-board-timing/score.json scripts/various/06-board-timing/score-before-rule5.json wgsl,lazy,noinit,floor,exp,hash,cpu,cpu-lazy,cpu-noinit,cpu-floor,cpu-trig,cpu-hash,cpu-iram`

### Technical details

- Timing app `9913c612f163…` (1,681,184 bytes); image app (not rerun) `ea10ef88…`; restore `b22a807d…` from `/tmp/picocalc-playable-smooth-chess-676ae95/build`.

## Step 7: Vault report published

Milestone. The deep-dive report went to the vault, with the regenerated substitution ladder and the device frames as figures. The vault push was first rejected (non-fast-forward); `git pull --rebase` then `git push` succeeded.

- **Report:** `go-go-parc/Projects/2026/11/22/PROJECT REPORT - PicoCalc Candela - The Fixed Path-Tracing Kernel as Firmware C++, Measured on the ESP32-P4 - A Technical Deep Dive.md`, with `_assets/picocalc-candela-cpu-kernel-b01-ladder.png` and `_assets/picocalc-candela-cpu-kernel-device-frames.png`.
- **Vault commit:** `adb4d60` on go-go-parc `main` (rebased onto `0cd2a18`).
- **Code commit it cites:** `4c10512`.
- **Validation:** `docmgr doctor --ticket PICOCALC-CANDELA-CPU-KERNEL` passes. The board was left on the playable firmware `b22a807d` and is healthy.

---
Title: Investigation diary
Ticket: PICOCALC-CANDELA-P4
Status: active
Topics:
    - picocalc
    - compiler
    - rendering
    - esp32-p4
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Chronological record of surveying Candela and designing a subset that runs on the ESP32-P4
LastUpdated: 2026-11-21T22:05:56.320295937-05:00
WhatFor: "Resume and review the Candela-on-ESP32-P4 survey and design"
WhenToUse: "Read the latest step before continuing; earlier steps hold the evidence behind each design decision"
---

# Investigation diary

This diary records the survey of the Candela path tracer and the design of a Candela subset for the PicoCalc's ESP32-P4. Each step states what was attempted, what the evidence was, and which decisions followed. The work is research and design only: no compiler, test or firmware file outside this ticket is changed, and the device is not used.

## Step 1: Open the ticket and fix the inputs

The launching agent asked for a survey of Candela, a design for running a subset of its JavaScript API on the ESP32-P4, a split into follow-up tickets with design stubs, and a vault report once the design is complete. Before reading any Candela code I opened the ticket, recorded the identity of the archive I was given, and checked whether earlier work in this repository had already used the name Candela.

It had. The ticket `PICOCALC-CANDELA` (2026-11-20, status complete) built Candela-inspired material graphs in Typed, but it did not run Candela's own API or its kernel: C kept visibility and lighting, materials were a 303-cell Q8 graph, and the scenes were two hand-specified fixtures. That ticket is an input to this design, not a predecessor that already solved the problem.

### Prompt Context

**User prompt (verbatim, as relayed by the launching agent):** "once you feel confident you can step up to more advanced stuff / raytracing wise, feel free to look at ~/Downloads/candela* which is our latest hyper advanced raytracer, and take over ideas from there / make it possible to run candela programs on the esp32p4 / subset of the JS API. You can use subagents if you want, but each subagent needs to keep at least a diary, and things have to be split up in tickets and have design docs." And: "you can go nutty mode in the experiments you do as long as things are properly organized, and work once a milestone is reached, gets a vault report."

**Assistant interpretation (summary of the launching agent's brief, not verbatim):** create ticket PICOCALC-CANDELA-P4 with an investigation diary; write an end-to-end analysis of Candela with a cost model; write a design that settles the API subset, the numeric model (Typed f32 vs i32 fixed point vs a native C IR interpreter), where each stage runs, and what is reused; create follow-up tickets with design stubs; publish a vault report and push the vault. Constraints: do not modify `picocalc-os/compiler/`, `picocalc-os/tests/` or the RAY-PARITY ticket; do not use the device, flash or run ESP-IDF builds; keep Candela copies out of the repository; deletes and kills go in checked Python scripts.

**Inferred user intent:** move the handheld's rendering work from a hand-written integer ray tracer toward running real Candela scene programs, with the work organized so that independent agents can pick up well-scoped tickets.

### What I did

- Read `AGENTS.md`, the memory notes, and the docmgr, diary, textbook-authoring and obsidian-vault-writing skills.
- Hashed the archives:
  - `~/Downloads/candela-workspace(1).zip` (the archive under study): SHA-256 `873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d`, 2,576,783 bytes, dated 2026-11-21 19:13.
  - `~/Downloads/candela-workspace.zip` (older, ignored unless a diff is needed): SHA-256 `ec996d250ef4b463975d42eec12733e657a8024cef40d60f8753241d809d52e9`, 1,361,582 bytes.
- Listed the extracted tree at the scratchpad path given in the brief. `src/` holds about 6,000 lines of JavaScript; the largest files are `kernel.js` (1,513 lines), `compile.js` (899), `scene.js` (593), `fx.js` (494) and `render.js` (486). The spec `spec/candela-pbr-api.md` has 1,816 lines. `content/presets/` holds 211 files (105 presets as `.md` notes plus `.js` scenes, and a few `lib/` folders).
- Found the earlier ticket `ttmp/2026/11/20/PICOCALC-CANDELA--programmable-handheld-scenes-with-typed-builders-and-staged-materials/` and read its director report and frozen graph contract.
- Created the ticket and three documents:
  - `docmgr ticket create-ticket --ticket PICOCALC-CANDELA-P4 --title "Run a subset of Candela on the ESP32-P4" --topics picocalc,compiler,rendering,esp32-p4,performance`
  - `reference/01-investigation-diary.md`, `analysis/01-how-candela-turns-a-scene-program-into-pixels.md`, `design-doc/01-a-candela-subset-for-the-esp32-p4.md`.

### Why

- Hashing first lets every later claim name the exact archive; the archive itself stays out of the repository.
- Reading the earlier Candela ticket first avoids designing a second, incompatible scene format and tells me which numeric questions were already measured (Q8 tile predicates disagreed with binary32 at 33% of plane locations).

### What worked

- docmgr created the workspace under `ttmp/2026/11/21/` with the standard layout.

### What didn't work

- No failures in this step.

### What I learned

- The earlier PICOCALC-CANDELA work measured a 160 x 160 frame at 18-29 ms with C visibility and Typed material evaluation, and showed that Q8 scalars change the result of fractional-coordinate predicates at about a third of sampled locations. Both numbers bear on the numeric-model decision.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Whether the relayed user quote is complete; I only have the launching agent's copy.

### What should be done in the future

- Read Candela end to end (Step 2), then the Typed compiler's numeric state (Step 3).

### Code review instructions

- `docmgr doc list --ticket PICOCALC-CANDELA-P4`

### Technical details

- Extracted tree (read-only, outside the repository): `/tmp/claude-1000/-home-manuel-code-wesen-2026-10-20--ds-js-os/8cb22ffd-b9b3-49d6-975e-44f61fbbbf0b/scratchpad/candela-src/candela`.

## Step 2: Read Candela end to end, and the two earlier Candela ports

I read the Candela sources in the order a scene travels through them, then the two vault reports the coordinator pointed to mid-step. The goal was to know, with file and function names, what the front end produces and what the kernel computes per sample, before deciding anything about the ESP32-P4.

The main result is that Candela is already split like a compiler. The front end (`src/candela.js` `build`, `src/scene.js` builders, `src/fx.js` expression DAG, `src/compile.js` `compile` and `pack`) produces two things: a WGSL program (`compiled.shared`, about 1,470-1,510 lines for small presets, made of the fixed kernel in `src/kernel.js` plus one generated function per material, SDF, density and custom integrator) and flat Float32 buffers (`U`, `O`, `LI`, `BV`, `SDs`/`SDd`). The DGX Spark report keeps that front end unchanged and adds a target (WGSL to CUDA, `traceAll` replaced by `optixTrace`); the embedded-V8 report hosts the whole front end in a native process because scene code keeps running after the build (`animation(t)`, `.behavior`, derived params, static params). Both decisions transfer to the P4: the front end belongs in on-device QuickJS, and the kernel needs a new target.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** understand the pipeline before designing.
**Inferred user intent:** a design grounded in Candela's actual structure, reusing what earlier ports learned.

**Coordinator message (verbatim, mid-step):** "Additional context for the Candela survey: the Obsidian vault already holds two reports on earlier Candela ports, which you should read before designing the P4 path and cite where relevant: /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/PROJECT REPORT - Candela on the DGX Spark - From a JavaScript Scene API to OptiX Ray Tracing - A Technical Deep Dive.md, and /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/PROJECT REPORT - Candela Render Runtime - Running Candela Scenes in Embedded V8 - A Technical Deep Dive.md. They likely describe how the scene API was separated from the GPU kernels elsewhere; reuse that split if it fits. Also: the Typed compiler's current state is summarized in RAY-PARITY's diary Step 13 (commit 2712684): versioned loops, split locals, pointer homes; the Typed ray tracer is now 16.26 ms per 160x160 frame on the P4 against 7.72 ms for GCC -O3 C."

### What I did

- Read `content/docs/10-architecture.md`, `20-renderer.md`, `22-gpu.md`, `01-tour.md`, the spec's Part I and lessons L0-L5, and the sources `candela.js`, `scene.js`, `fx.js`, `compile.js`, `stdlib.js`, the start of `params.js`, `ir.js`, `wgsl2glsl.js`, and the kernel sections `PRELUDE`, `CORE` (`hitObj`, `finishHit`, `traceAll`, lobes, lights), `PATH` (`neeAt`, `tracePath`, `cameraRay`, `renderPixel`).
- Read both vault reports (pipeline, buffers, the OptiX target design, the V8 runtime, determinism and the golden digest gate).
- Read the device evidence that bears on numerics: the PICOCALC-SCI diary ("A fuel unit costs about 5 µs on the P4, whose FPU is single-precision, so doubles are done in software"), and RAY-PARITY Steps 11-13 (C -O3 frame 2,450,039 instructions in 7.72 ms: 1.13 cycles per instruction; Typed 16.26 ms, 2.11x C).
- Found a host-to-device calibration for QuickJS: PSIX-STAGING ran the same PSIX writer on nine System frames on the P4 (287.93 ms, `analysis/03-observed-shapes.md`) and on host QuickJS on this same i7-1165G7 (4.698 ms, `scripts/runtime/results/board-capsule-host-smoke.json`, arm `generic`): 61.3x; the Keys frames give 60.7x.

### Why

- A subset decision needs to know which features are fixed kernel code, which are generated per scene, and which are data. That split is visible only in `compile.js` and `kernel.js`.

### What worked

- The code matches the docs: one material function per distinct material body (`lowerMaterial`, deduplicated by text), the BSDF algebra lowered to stochastic selection (`genSurface`: `mix`, `add` and `layer` become `if (u < t)` branches that pick one lobe), shape types 0-13 in `hitObj`, and all scene geometry queries funnel through `traceAll`.

### What didn't work

- `node test/validate.js` cannot run here: it needs esbuild, which is not installed (`build/build.js` line 4 requires it at load time). I wrote my own preset loader instead (Step 3).

### What I learned

- `material.pbr()` is not a primitive: `stdlib.js` defines it as `mix(layer(dielectric f0=0.08*specular, lambert baseColor), conductor.schlick, metallic)` with optional transmission, sheen and coat. With constant `metallic = 0` and `coat = 0` the compiler folds it to one Fresnel-weighted choice between a reflect-only GGX dielectric lobe and a Lambert lobe.
- `compile()` calls `ggxTableWGSL()`, which recomputes a constant 16 x 16 GGX albedo table by 2.1 million inner iterations on every compile. On a 360 MHz QuickJS this could dominate the build; I asked the QuickJS subagent to time it separately.
- Candela's photometric units span a wide range: the packed sun radiance is about 1.35e9 for B-01 (Step 3 measures it for all presets).

### What was tricky to build

- Nothing built yet; the SVG diagrams inlined in the docs overflow a terminal read, so I filtered `<svg` lines when reading docs.

### What warrants a second pair of eyes

- The 61x QuickJS calibration rests on one host smoke run per application; it is a ratio for object- and string-heavy JS, and Candela's front end also does double arithmetic, which the P4 does in software.

### What should be done in the future

- Census of all presets (Step 3); per-sample cost measurement (Step 4); QuickJS front-end cost (subagent).

### Code review instructions

- Start with `src/compile.js` `compile` (lines 165-553) and `src/kernel.js` `tracePath` in the archive copy.

### Technical details

- Packed layouts (from `compile.js` `pack` and `kernel.js`): objects 6 vec4 rows (type, material, light, flags; world-to-object 3x4; shape params; irand, id, motion block, bound); lights 6 rows; BVH 2 rows per node; uniforms: rows 0-4 frame and camera, 5 integrator, 6-7 sun, 8-16 environment and Preetham coefficients, 17-18 fog, 19 counts, 20-24 misc, 32+ params.

## Step 3: A census of all 105 presets and a tier split

I built every preset with Candela's own front end in Node and recorded what each asks of a renderer. Then I sorted the presets into tiers by the smallest kernel that renders them unchanged. This turns "which subset is realistic" into a count.

All 105 presets build (9.3 s in Node). 28 need only the T0 kernel (analytic quadrics, Lambert, GGX conductor, reflect-only coats, point/spot/area/sun lights, simple environments and the Preetham sky, RGB, every material value constant or a uniform); 57 need no per-scene generated code at all (T0 plus fixed-code features such as sphere-traced primitives, refraction, media and spectral sampling); 95 need at most per-scene field code; 10 need triangle meshes, HDRIs or 10,000 objects.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** decide "which lessons/presets are realistic" with evidence.
**Inferred user intent:** a subset that covers real Candela programs, not a toy.

### What I did

- Copied the archive's `src/`, `content/`, `build/` and `package.json` to `scratchpad/candela-run` and set `"type": "module"` in the copy, so Node imports `src/candela.js` directly.
- `scripts/01-census.mjs`: builds each preset, reads `compiled.objects`, `lightsMeta`, the generated material WGSL (lobe kinds from `L.kind = N`, refracting dielectrics from `L.flags = 0`, surface-varying SSA values that read `h.P`, `h.uv`, `h.lp`, `h.N`, `wo` or `gTime`), fx helper calls (`noise3`, `fbm3`, `voronoi3`, `bumpN_`, `filmR`, `tangentWorld`, `sellmeier`), engine settings, and the magnitude range of the packed buffers. Output: `various/01-census.json`, `various/01-census.txt`.
- `scripts/02-tiers.mjs`: tiers T0-T3 as defined in its header. Output: `various/02-tiers.json`, `various/02-tiers.txt`.
- Commands (from the scratchpad): `node .../scripts/01-census.mjs $S/candela-run .../various/01-census.json > .../various/01-census.txt` and `node .../scripts/02-tiers.mjs .../various/01-census.json .../various/02-tiers.json`.

### Why

- A first classification counted every sphere-traced primitive as "generated code"; that was wrong (torus, capsule, cone, rounded box and prism are fixed kernel code in `sdLocal`), so I reworked the tiers around what must be generated per scene.

### What worked

- 105/105 presets built. Tier counts: T0 28, T1 29 (cumulative 57), T2 38 (cumulative 95), T3 10 (105).
- Presets needing each feature (any tier): surface fields 39, refraction 18, torus 16, rounded box 16, media 13, anisotropy 9, meshes 9, HDRI 9, capsule 7, SDF 6, sheen 6, cone 5, spectral 4, motion blur 4, density fields 4, heightfields 3.
- Largest packed magnitudes: sun radiance 1.83e9, largest light record value 7.4e4.

### What didn't work

- My first `fieldLets` regex also needed checking against false positives; spot checks (`A-04` `h.P.xz`, `S-04` `h.lp.y`, `M-14` `h.P * vec3f(3, 3, 30)`, `R-04` bump) confirmed real surface-varying fields.

### What I learned

- Every Candela material is generated code on the GPU, but 57 presets' materials are only constants and uniforms. On a CPU those can be data (a lobe record per material), so a fixed native kernel renders them with no per-scene compilation at all.
- The dynamic range rules out a single fixed-point format for radiance: 1.83e9 does not fit Q16.16 (maximum 32,767), and reflectances near 0.03 times 1/pi need fractional precision at the same time.

### What was tricky to build

- `build/build.js` requires esbuild at load time, so its `loadPresets` cannot be imported; `01-census.mjs` reimplements it (front matter `id`, `<base>.js`, optional `<base>/` lib folder).

### What warrants a second pair of eyes

- The tier boundaries are judgment calls; `02-tiers.mjs` lists every reason per preset (`allReasons`) so a different split can be recomputed from `01-census.json`.

### What should be done in the future

- Measure what a sample costs (Step 4).

### Code review instructions

- `node scripts/02-tiers.mjs various/01-census.json /tmp/t.json` reproduces the tier lists from the committed census.

### Technical details

- T0 presets: A-03 B-01 B-03 B-04 B-05 C-02 C-03 C-04 D-01 D-02 E-03 E-04 G-06 L-01 L-02 L-03 L-04 L-05 L-06 L-07 L-08 M-01 M-02 M-03 M-09 M-12 R-01 R-07.

## Step 4: Candela's own kernel as C++ on RV32, counted per sample

To give the cost model real numbers I ran Candela's generated program, not a re-implementation, on the ESP32-P4's instruction set. A small translator turns `compiled.shared` (WGSL) into C++, the same move the DGX Spark report designed for CUDA; the ESP GCC compiles it for `rv32imafc/ilp32f` (the multilib the PicoCalc firmware links); a new counting interpreter executes it and attributes instructions to functions. The same C++ also builds natively, which gives a reference image.

It works on the first ten presets tried. B-01 costs 8,160 RV32 instructions per camera sample at -O2 (7,100 at -O3); the range over nine path-traced presets is 6,170-11,290 at -O3, plus W-02 at 78,800 because its wood pattern's sine-based hash calls newlib's exact argument reduction for large arguments. Host and RV32 frames agree in mean luminance to within 0.7% at one sample per pixel (they differ pixel by pixel because single-precision libm results differ and steer random choices differently).

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** a measured or estimated cost model, with operations per sample for a representative preset.
**Inferred user intent:** numbers strong enough to choose a resolution and a numeric model.

### What I did

- `scripts/03-export-scene.mjs`: builds a preset in Node, sets uniform rows 0-5, 20-21 as `src/viewport.js` does before a dispatch, and writes `kernel.wgsl`, `scene.bin` (U, O, LI, BV, SD rows; SD merges `SDs` and `SDd` at `dynBase` like `render.js` `uploadSD`) and `scene.json`.
- `scripts/04-wgsl2cpp.mjs`: the translator (rules in its header). It hoists structs, prototypes every function, turns struct parameters into `const&`, rewrites declarations, arrays and loops, appends `f` to float literals, turns multi-component swizzles into methods, generates a vector prologue with only the swizzles used, and wraps everything in `namespace cdl`.
- `scripts/05-harness.cpp`: binds the buffers to `U`, `objF`, `litF`, `bvhF`, `sdF` and calls `renderPixel` per pixel; host and bare-metal RV32 variants.
- `scripts/06-rv32imfc-count.c`: RV32I+M+F+C interpreter (C expanded to 32-bit encodings), CSRs fflags/frm/fcsr, write/exit system calls, counts by instruction class and per function from the ELF symbol table.
- `scripts/07-run-kernel.sh`: export, translate, host build and run, RV32 build (and a `-DBASELINE` build subtracted), count, PNG preview and host-versus-RV32 comparison; one JSON line per run.
- `scripts/08-tonemap-png.py` (preview and comparison) and `scripts/12-profile-groups.py` (per-sample profile by kernel part).
- Runs: ten presets x {-O2, -O3} at 160 x 160, 1 spp: `various/04-kernel-counts.jsonl`; profiles grouped in `various/06-profile-groups.txt`; previews rendered with the translated kernel on the host at 64 spp (Cornell box, primitives, patterns, the wood table, metals, toon).

### Why

- Hand-porting a "representative" kernel would measure my port. Translating the generated WGSL measures Candela's actual work, including its material code, and it is also a prototype of one implementation path (a firmware C kernel produced from `kernel.js` at build time).
- rv32emu rejects F and C instructions, so it cannot run this code; the counting interpreter fills that gap. Counts are not cycles; Step 6 turns them into a time range.

### What worked

- Per-sample instructions (-O2 / -O3): B-01 8,160 / 7,100; R-01 9,525 / 9,354; L-03 7,250 / 6,136; M-02 8,472 / 8,378; G-01 11,287 / 10,289; F-01 8,924 / 7,892; A-01 6,267 / 6,173; M-04 7,465 / 7,374; E-02 (toon, one bounce) 3,608 / 3,503; W-02 78,776 / 78,624. Code size: 42-47 KB of `.text` including newlib's libm.
- B-01 at -O2 by kernel part: libm sin/cos 27% (cosine-hemisphere and cone sampling call `cosf`/`sinf` with arguments up to 2 pi, which take newlib's `__ieee754_rem_pio2f` path), traversal 23%, exp (the Preetham sky's Perez function) 16%, path loop and camera 11%, environment 9%, materials 4.5%, light sampling 4%. R-01 (Cornell box): traversal 67%.
- Mean-luminance ratio RV32/host: 0.9928-1.0017 over the ten presets; E-02 (deterministic toon) agrees on 100% of pixels within 1%.

### What didn't work

- First native run: `Exit code 136` (SIGFPE). gdb: `cdl::hdriTexel (x0=0, y0=0) at kernel.cpp:1273: const i32 x = ((x0 % W) + W) % W;` called from `hdriPdf` from `tracePath`. Cause: WGSL's `select(f, t, c)` evaluates both arguments, so the kernel computes `hdriPdf(rd)` even without an HDRI (W = 0); a GPU does not trap on integer division by zero, x86 does. Fix: translate `select` into a conditional (as wgsl2glsl does), except when an argument calls `rnd()`, where the eager template keeps the GPU's random stream (one case: `gTau` in `renderPixel`).
- First translation left `let` inside one-line functions (`rnd2`, `safeNorm`, `misW`): the function-header branch skipped declaration rewriting for the rest of the line. Fixed with a shared `decl()` rewrite.
- Swizzle methods in `vec2f` returning the incomplete `vec3f` failed to compile; declarations now stay in the struct and definitions follow all three structs.
- Host build: `conflicting declaration of 'int abs(int)' with 'C' linkage` once `stdio.h`/`stdlib.h` were included; fixed by the `cdl` namespace.
- The ESP link warns `__getreent is not implemented and will always fail` (newlib's errno); no run reached it.

### What I learned

- A CPU target should not inherit GPU idioms blindly: eager `select`, zero-initialized structs (`memset` was 3.5% of B-01), and sine-based hashes (`hash3`, `hash13`) are cheap on a GPU and expensive on an in-order CPU with a software libm.
- Transcendentals, not intersections, dominate the outdoor presets. The kernel's own geometry and shading are a minority of the work.

### What was tricky to build

- The compressed-instruction expansion: newlib's libm for this multilib is built with C, so the interpreter must decode C.FLW/C.FSW and the SP-relative forms; immediates were cross-checked bit by bit against the specification's tables (comments in `expand`).
- Making the RV32 counts comparable: a `-DBASELINE` build with no pixel loop is subtracted, so startup and output are excluded.

### What warrants a second pair of eyes

- `06-rv32imfc-count.c` is new code. Evidence that it executes correctly: ten complete path-traced frames whose mean luminance matches the host build, and a deterministic preset (E-02) that matches pixel for pixel within 1%. FMA rounding uses the host's `fmaf`; rounding modes for `fcvt` follow the rm field.

### What should be done in the future

- Quantify the numeric models on kernel fragments (Step 5) and the effect of CPU-specific math (Step 6).

### Code review instructions

- `scripts/07-run-kernel.sh <candela-copy> <work> B-01 160 160 1 -O2` reproduces the B-01 line; the work directory holds the C++, ELF, profile and PNGs.

### Technical details

- Toolchain: `riscv32-esp-elf-g++` from esp-14.2.0_20260121, `-march=rv32imafc_zicsr_zifencei -mabi=ilp32f -fno-math-errno -fno-exceptions -fno-rtti -msmall-data-limit=0 -mno-relax -nostartfiles -static -Wl,-Ttext=0x10000`, linked with newlib `-lm -lc -lgcc`.
- B-01 frame: 208,885,265 instructions for 25,600 samples; 46% of instructions are floating-point (loads/stores included); 93 `fdiv.s` and 17 `fsqrt.s` per sample.

## Step 5: Five numeric models on three kernel fragments

The design must choose between an f32 type in Typed (RV32F code), fixed point in Typed's existing i32, and interpreting Candela's IR in C firmware. I took three fragments of Candela's kernel (the object-space sphere test from `hitObj`, the GGX term from `evalLobe`, `safeNorm`) and implemented each five ways: f32 on the FPU, the same source as soft-float, Q16.16 with 64-bit intermediates, Q16.16 restricted to 32-bit operations (what Typed's i32 can express), and a C interpreter for a register bytecode with one instruction per fx node. Each runs on 2,000 deterministic inputs; RV32 counts come from the interpreter, accuracy from host runs against double precision.

The answer is not close. f32 on the FPU costs 14-49 instructions per call with relative errors around 1e-7. The 32-bit-only fixed point is cheaper than 64-bit fixed point but wrong (median relative error 38-94%, and 153 of 481 sphere hits disagree about hit or miss). 64-bit fixed point is 9-50x the f32 cost, and for GGX its 99th-percentile error is 16x the true value because D overflows at small roughness. Soft-float is 90-130x. The bytecode interpreter is 7-20x.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** "include a small host experiment if it settles the question (for example, timing one Candela kernel's math in fixed point vs f32 in C compiled with the ESP32-P4 GCC ...)".
**Inferred user intent:** settle the numeric model with evidence rather than preference.

### What I did

- `scripts/09-numeric-bench.c` (arms REF/F32/SOFT/Q16/Q16T/VM, kernels SPHERE/GGX/NORM), `scripts/11-libm-cost.c` (newlib per-call costs), `scripts/10-numeric-bench.sh` (builds: F32 and VM for rv32imafc/ilp32f; SOFT, Q16, Q16T for rv32imc/ilp32; all -O2; baselines subtracted; accuracy from host builds). Result: `various/05-numeric-bench.jsonl`.

### Why

- Fragments isolate the arithmetic: the full-kernel counts in Step 4 already show which work dominates, but only fragments let five numeric models run the same computation.

### What worked

- Instructions per call (RV32, -O2) and host accuracy:

| Kernel | F32 | SOFT | Q16 (64-bit) | Q16T (32-bit) | VM |
|---|---:|---:|---:|---:|---:|
| SPHERE | 23 | 2,121 | 215 | 95, median error 94%, 153/481 hit/miss wrong | 338 |
| GGX | 49 | 6,277 | 2,439, p99 error 16x | 848, median error 77% | 958 |
| NORM | 14 | 1,793 | 799 | 427, median error 38% | 99 |

- newlib (rv32imafc) per call: expf 101, logf 89, powf 325, cosf/sinf on [0, 2 pi) 111-112, sinf of a large argument (hash13) 1,961, acosf 91, atan2f 142, floorf 25, tanf 72; sqrtf is one `fsqrt.s`.

### What didn't work

- First run reported `SPHERE F32 817.35` instructions per call with only 0.04 `fdiv.s` per call. Cause: in the `-DBASELINE` build GCC removed the unused input generation, so the subtraction counted the inputs' soft-double arithmetic as kernel work; and most rays missed the sphere. Fix: the baseline keeps the inputs live (`out[i] = I[i][0]`), and rays now aim near the sphere (about a quarter hit). The libm baseline had the same defect (`r = a + b` now).

### What I learned

- Typed cannot reach Candela's arithmetic through i32: 32-bit fixed point loses the answer, and 64-bit fixed point needs operations Typed lacks while still overflowing on physically ordinary inputs (GGX's D peaks at 1/(pi alpha^2): 1.2e5 at roughness 0.04 and 1.3e6 at Candela's minimum alpha of 0.0005; sun radiance is 1.8e9 in the census).
- An interpreter is viable only for a small share of a sample's work (a material field evaluated once per hit), not for the kernel.

### What was tricky to build

- Fair fixed point: products and quotients in Q16 use `int64_t` (mul/mulh and `__divdi3`), the square root is digit-by-digit on a 64-bit radicand; Q16T pre-shifts operands. A table-driven reciprocal square root would cut Q16's sqrt cost, but not its range problem.

### What warrants a second pair of eyes

- The VM's per-node cost (about 20 instructions) reflects a plain `switch` interpreter over global register arrays; a threaded interpreter might halve it. It would still be several times the compiled f32 code.

### What should be done in the future

- Turn instructions into a time range (Step 6) and check CPU-specific math (fast sin/cos/exp and an integer hash).

### Code review instructions

- `scripts/10-numeric-bench.sh <work> <out.jsonl>` (about three minutes).

### Technical details

- Inputs: origins in [-8, 8]^3 aimed within 1.6 radii of the sphere centre, radii 0.3-2; unit wo, wi in the upper hemisphere; alpha = 0.05 + 0.95 u^2.

---
Title: Investigation diary for the complete scalar Typed ray renderer
Ticket: PICOCALC-TYPED-RAY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/raytrace_demo.c
      Note: Original C scene and matched audit phases
    - Path: repo://picocalc-os/worlds/raytrace/raytrace.typed
      Note: Complete ordinary Typed render, trace and shade entry points
    - Path: repo://ttmp/2026/11/20/PICOCALC-TYPED-RAY--compare-complete-typed-and-c-ray-tracers-on-the-picocalc/scripts/renderer/03-qualify.sh
      Note: All supported host replay and bitwise verification entry
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Investigation diary for the complete scalar Typed ray renderer

## Step 1. Carry the maintained ray scene through ordinary Typed

The new emitter comparison needed real source that computes the whole image. I froze the maintained C scene, then wrote the complete Typed frame with equal geometry, integer lighting and floor rules. The clean frame and the audit frame share the same halfword scratch data and row operations.

### Prompt Context

**Implementation brief:** “Complete scalar renderer […] fixed original scene first: sphere geometry/nearest IDs and depth, sky/floor/lighting/shadows/RGB565 all Typed, reusable scratch, one renderFrame call. Build reproducible C vs real Typed Wasm differential across all pixels/IDs/depths, options/view changes.”

**Assistant interpretation:** Port the frozen camera and scene to ordinary Typed with production compiler semantics. Expose an image-only call for matched timings, and separate audit, primary and shade interfaces for diagnosis. The maintained orthographic camera fills its misses with the checker plane.

**Inferred user intent:** Get a concrete existing-language workload for current and candidate compiler lowering, with whole-frame equivalence evidence before performance claims.

**Commit (code):** `223e017` — “Implement the complete Typed ray renderer and matched C audit phases”.

### What I did

- Defined the fixed scene, input ranges and reusable scratch in [the design](../design-doc/02-scalar-typed-ray-renderer-and-bitwise-differential.md).
- Implemented `typedRayFrame`, `typedRayRender`, `typedRayTrace`, and `typedRayShade` in `picocalc-os/worlds/raytrace/raytrace.typed`.
- Shared exact work offsets, prepared row functions, lighting helpers and scene bounds with the director's graph and row-span experiment and with the board and compiler owners.
- Added matched C audit, trace and shade paths to the original native renderer. These call the existing geometry and shading helpers. The original image-only and PIE entry points remain available.
- Pinned the source before the board owner began the isolated target build.

### Why

- Comparing a clean image-only C frame to a Typed frame with depth and ID writes would charge different observable work. Separate entry points make those allocations and stores explicit.
- Reusable small scratch is a more realistic interface than rebuilding a new memory object for each pixel. The scratch stores horizontal squares and exact integer roots for the existing coordinate and radius limits.
- The scene's output stride is an input contract. Keeping it in scratch config avoids a ninth native argument in the audit entry and keeps the tested padded rows visible.

### What worked

- The maintained implementation compiles through the ordinary Typed targets without changing the compiler. It occupies 10,438 source bytes, 4,650 Wasm bytes and 9,564 RV32 instruction bytes.
- Strict C11 compilation passed with the original renderer and the new audit functions in the same translation unit.
- The initial C host runner matched the clean and audited outputs to independently timed trace-plus-shade outputs, including padded rows.

### What didn't work

- No Typed source compiler or C syntax failures were observed in this step.

### What I learned

- A shared helper can read prepared geometry without knowing whether fixed scene or graph construction supplied it. That is why the director's graph experiment can reuse the geometry and shade-scale contracts.
- The original C view has no distinct sky region. Plane shading covers every primary miss.
- The sample light normalization uses a floor square root. This differs from the exactly normalized vector in the public Opus design example, so the production clamp and integer order matter.

### What was tricky to build

- Depth IDs are one-based in the public audit but zero-based when indexing a sphere. Clearing each scratch row and only replacing a strictly more distant winner preserves tangency and tie behavior.
- The projected shadow center can be negative in valid scenes. Work cells encode it with a 4,096 bias, and the pixel-side comparison uses the same bias before subtraction.
- The shade-only path reads existing audit planes. The contract requires traces from the same sphere positions.

### What warrants a second pair of eyes

- Review work offsets `520`, `1545` and `1705` against the largest indexed root and the declared row widths.
- Check the z-facing sign and the original division order in the light and shadow implementations.
- Compare whole-frame timings only against the corresponding C output boundaries.

### What should be done in the future

- Requalify modified geometry or camera sampling rules against their own C or mathematically independent oracle before reusing these timings.

### Code review instructions

- Read `typedRayComputeRow`, `typedRayInShadow` and `typedRayPixel` beside the corresponding original C routines.
- The [design](../design-doc/02-scalar-typed-ray-renderer-and-bitwise-differential.md) lists all scratch offsets and external signatures.

### Technical details

- Work requires 2,048 halfwords. Cell 0 accepts zero for stride 160 or explicit stride in 160 through 320. Output minimum is `159*stride+160` cells.
- Ordinary clean and primary entry points take six and five native word arguments. Combined and standalone shade each take eight.
- Scene controls accept sphere centers 32 through 127 on x and y and lamp controls zero through 159.

## Step 2. Compare executable Wasm and C with protected memory

The host harness executes compiled code for all four Typed entries. It compares complete output planes to production C, including memory outside the active 160 output columns. It keeps the test memory accommodation visible in its receipt.

### Prompt Context

The brief in Step 1 requires whole-frame differential evidence. The director also asked for an optional source and output path so an independent compiler or geometry variant can use the same raw C fixtures.

### What I did

- Captured complete little-endian color, depth and ID buffers from the C renderer for 12 legal scenes. Included moved lamp, sphere overlap, corner controls, strides 165 and 320 and a padded case using exactly the minimum active capacity.
- Ran the ordinary Typed Wasm outputs for clean frame, audited frame, primary trace and separate shade. Compared complete outputs and canaries, and verified all audit inputs remain unchanged through shade-only.
- Verified ten invalid calls return zero without modifying the entire guest memory. Tested the default zero stride encoding and real strides.
- Added exact tangent, miss and center-pixel landmarks plus an equal-depth control using two identical prepared objects.
- Added optional source and result parameters in the host driver, then reproduced the baseline receipt from two fresh output directories.
- Checked the independent public technical memo written by Claude Opus High and included its applicable methodology in the [textbook article](../analysis/02-a-complete-ray-tracer-in-typed.md).

### Why

- The three output planes have different explanatory roles. ID errors expose wrong winners even when quantization or lighting would hide the difference in the final pixel.
- A light-only movement should change the image while preserving the depth and ID planes. This tests the frame's dependency structure separately from the numerical byte agreement.
- Full-buffer comparison and explicit padding checks detect invalid writes that an aggregate color checksum alone could miss.

### What worked

- The 12 host frames matched real Typed Wasm and production C for RGB565, nearest IDs, and nearest depths. Separate clean, trace and shade paths reproduced the corresponding audited results.
- At the movable sphere's center, the default scene produced ID 1, depth 30 and RGB565 `0xca27`. The exact tangent had ID 1 and depth 56. The adjacent miss had ID and depth zero. The synthetic tie kept ID 1.
- The default FNV-1a output was `2f75a8a5` and the lamp-only output was `97296759`. Both had 6,123 sphere pixels with identical complete depth and ID hashes. Shadow counts were 4,793 and 3,923 respectively.
- The repeat run and explicit source/result override produced byte-identical aggregate receipts.

### What didn't work

- The first attempt used `WebAssembly.Memory.grow()` and failed with `RangeError: WebAssembly.Memory.grow(): Maximum memory size exceeded`. The standalone compiler fixes both minimum and maximum memory to one page. I updated the host harness to check and expand just those two fields to eight pages. The normal module and emitted code remain unchanged, and the receipt distinguishes the original and test module SHA-256.

### What I learned

- A host module can preserve exact emitted instructions and regular checked-buffer behavior while a harness provisions more linear memory for observation. The memory-layout change still belongs in the evidence.
- The Opus public proposal's exact-geometry and overflow discussion helps pick boundary cases. Its sample ambient level, lamp normalization and sphere-to-sphere shadow model differ from the frozen application. We tested the existing exact C rules.

### What was tricky to build

- Audit pads and immediate boundary canaries must be checked without overwriting the Typed buffer's 32-bit capacity header.
- The two standalone phase calls require different preparation. Primary work builds root and x-squared tables without a lamp. Standalone shade builds only sphere records and lamp tables and reads the supplied audit planes.

### What warrants a second pair of eyes

- Confirm that the benchmark calls use matching clean, audited, trace-only and shade-only boundaries.
- Confirm the physical runs use the same scene inputs and C reference and that their board timing claims stay separate from host byte agreement.

### What should be done in the future

- Keep compiler specialization, row-span recognition, and complete Typed C parity as independently replayable evidence.

### Code review instructions

Run from the repository root.

```sh
P=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-TYPED-RAY--*')
bash "$P/scripts/renderer/03-qualify.sh" /tmp/typed-ray-verification
cmp /tmp/typed-ray-verification/receipt.json "$P/various/renderer/host.json"
```

To test a variant while keeping the archived receipt unchanged, pass a Typed source and result pathname to `02-wasm.mjs` after the reference directory.

### Technical details

- [Complete host receipt](../various/renderer/host.json)
- [Scalar renderer textbook article](../analysis/02-a-complete-ray-tracer-in-typed.md)
- [Independent public methodology memo](../various/commission/01-scalar-design.md)

---
Title: Compiler investigation diary
Ticket: PICOCALC-TYPED-RAY
Status: complete
Topics: [picocalc, compiler, performance]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological compiler experiments, failures and reproducible host gates."
LastUpdated: 2026-11-21
WhatFor: Compare source-equivalent ray-tracing code generators.
WhenToUse: Reproducing the compiler portion of the complete-frame study.
---

# Compiler investigation diary

## Step 1. Bind a scalar optimization to one provable IR pattern

I started with the arithmetic at the end of each frame. The emitter inserted exceptional-case checks where the neighboring numeric IR already fixed the divisor. I isolated a research backend and established signed behavior before taking frame measurements.

### Prompt Context

The direct investigator assignment from the director was “Inspect and compare generated scalar code in real port; design/try at least one lowering optimization or matched signed-width/PIE kernel, honest limits/rejection, validate machine semantics, count static/dynamic work, interface with scalar and physical agents quickly for an optional hardware candidate.” The director records the user's broader commission in [the shared diary](01-director-investigation-diary.md). The intended deliverable was an independently qualified substitute compiler, reproducible evidence and an article. Code commit `2a2fe41`.

### What I did

Read the ordinary RV32 operand-stack and frameless-leaf emitters. Added `positive-divisors.mjs` to recognize a positive literal followed by signed division or remainder. Tested 19 divisors with 53 signed dividends plus spills, trapping reads and ordered calls.

### Why

Every choice about skipping a guard should follow from the IR semantics. A positive divisor excludes zero and the signed quotient overflow case, while a constant dividend alone would not rule out those conditions.

### What worked

The suite reports 2,014 arithmetic results, 161 guard cases and 106 additional effect checks. The buffered and streamed native images match. The generated backend ran in the existing compiler realm and retained its ordinary API.

### What didn't work

The first `node scripts/compiler/edge-cases.mjs OUT.json` harness run compared values created in different VM realms with deep equality. It reported “Values have same structure but are not reference-equal.” Switching this cross-realm byte check to SHA-256 preserved the actual identity requirement.

### What I learned

The guard removed in the known-positive case changes direct retirement even when the application never encounters a trap. A source-level division count alone cannot predict the change.

### What was tricky to build

The divisor-of-one case must still evaluate the dividend exactly once. Pulling the already evaluated operand off the compiler stack and leaving the prefix untouched also preserves prior memory effects and traps.

### What warrants a second pair of eyes

Verify that `T5` can service an operand spill and `T6` is available for the divisor, including frameless callers. Confirm that adjacency is tested in decoded numerical IR.

### What should be done in the future

Treat code-size and complete-frame execution evidence as separate controls before considering integration.

### Code review instructions

Start at `FunctionCode.binary` and `FunctionCode.step` in the ordinary backend. Compare `scripts/compiler/positive-divisors.mjs` and rerun `edge-cases.mjs` with a new output path.

### Technical details

The arithmetic oracle uses signed BigInt. The actual Wasm engine and independent RV32 model run the same fixture. The stock suite occupies 2,496 code bytes and the specialized suite 1,504 bytes. See [the receipt](../various/compiler/edge-cases.json).

## Step 2. Trace a complete renderer through the emitted machine image

I compiled the scalar port as soon as the author released its first complete frame. On the final frozen revision the positive-divisor program passed comparison of each pixel, depth and ID at three poses. I handed the backend and image sizes to the physical operator.

### Prompt Context

See Step 1. The scalar author supplied the source through the normal compiler pathway. Code commit `e01a681`.

### What I did

Built ELF wrappers that retained the original function layout and added individual symbols for profiler attribution. Used `RV32_PROFILE=2` in the CJI host interpreter and kept only Typed function counters. Built Wasm once from the same source, enlarged its test memory declaration to fit the audit planes, and checked capacity headers and trailing canaries.

### Why

A single scalar helper does not reveal its call frequency or contribution to the finished frame. The clean entry measures display work. The diagnostic entry also copies independent intermediate planes.

### What worked

On the default clean scene, stock retired 15,532,624 instructions and positive-divisor code retired 14,723,751. The absolute difference survived adding the two audit planes. The default RGB565 packer supplied 614,400 of those saved instructions.

### What didn't work

Initial real-port numbers used a 10,423-byte source file and images of 9,536 and 9,132 bytes. The scalar author added an exported shade-input guard. I reran the full matrix after the physical owner notified me. The 10,438-byte final source produces 9,564 and 9,160 bytes with the same complete-frame retirement totals.

### What I learned

A newly added check in an exported diagnostic entry can alter image size without changing the execution count of either complete-frame path.

### What was tricky to build

Three output planes use 153,600 payload bytes before scratch. Enlarging the test Wasm memory limits at the section boundary retained the original function bytecode. The native wrapper uses raw image slices in unchanged order to preserve every relative control transfer.

### What warrants a second pair of eyes

Check that the firmware assembler wrapper, exit code and profiler exclude host I/O. Inspect the sorted function offsets and table attribution in the JSON before comparing with board cycle accounting.

### What should be done in the future

Run matched toolchains on one physical clock and code placement. The physical investigator owns those comparisons.

### Code review instructions

Use `full-frame.py` and `frame-images.mjs` as described in [the intern guide](../design-doc/03-qualifying-a-guarded-ray-row-and-positive-divisors.md). Verify the primary row and shadow counts are identical between arms.

### Technical details

Each of three clean poses compares 51,200 bytes of pixels. Each audit pose compares 153,600 bytes. The matrix executes both native compilers independently against the frozen Wasm outputs. [Full-frame evidence](../various/compiler/full-frame.json)

## Step 3. Admit an actual packet row and isolate the SIMD increment

I specialized the primary row with an explicit and an inferred entry selector. I then compiled a third program that expands only the packet arithmetic into scalar instructions, preserving the new schedule and guards. This exposed how much of the apparent baseline acceleration came from ordinary scalar work.

### Prompt Context

See Step 1. The director supplied an independent Opus high scanline memo and asked that its proof obligations be distinguished from real complete-frame evidence. The device operator offered isolated compiler slots. The host artifacts first landed in `e01a681`.

### What I did

Assembled a checked xesppie prefix for the frozen 318-cell IR template. Verified exact image equality for explicit and inferred paths, scalar rejection on a one-cell mutation, admission of a renamed clone only by inference, and an explicit source-spelled intrinsic. Tested 480 scene rows, ten directed runtime calls and complete frames in the independent vendor-decoded instruction model. Enumerated every u16 cell under each admitted nonnegative row.

### Why

The P4 implements signed saturating subtraction, while Typed reads unsigned halfwords. The sink needs an i32 index and must read a table only on hits. These details determine where vectorization is safe. A matched scalar schedule identifies changes that have nothing to do with vector width.

### What worked

The width check exhausted 67,174,400 input pairs with zero discrepancies. Three full clean and three full audit calls for each machine image matched Wasm. Default complete frame retirement was 12,464,201 on the hand-scalar control and 12,354,971 on PIE. The inferred and explicit paths emitted byte-identical images. The physical owner received the generated backends and all three image fingerprints.

### What didn't work

The first vendor assembly invoked through `make-row.mjs` rejected `esp.vld.128.ip q1,t0,16` with “illegal operands.” The extension accepts a restricted address-register encoding. Moving the cursor to the encodable `t4` before the load and copying its incremented value back fixed the assembly. The independent objdump and simulated register side effects exercise the corrected encoding.

### What I learned

Each nonnegative active sphere row starts with an arbitrary payload alignment. At the usual 16-byte aligned header the first payload square is four modulo 16. An aligned vector read needs the peel, and a 160-pixel width can still leave a scalar tail after that peel.

### What was tricky to build

A signed-vector interpretation of cell 65,535 can appear to create a hit. An unsigned post-subtraction comparison with the bounded original row term rejects wrapped and saturated false hits, while keeping real discriminants exact. The proof requires both the row guard and correct consumer comparison.

### What warrants a second pair of eyes

Trace early fallback before any clearing, and inspect partial output memory after short-input traps. Check exact IR equality despite renamed functions. Review modified jump offsets and local label rebasing, and confirm every packet store targets the aligned scratch slot.

### What should be done in the future

Use equal code placement and timing boundaries to measure how much of the host retirement change survives on the P4. The compiler specialization is deliberately narrow. Broader inference must establish an equivalent proof before admitting other row shapes.

### Code review instructions

Compare `guarded-row.S` with the frozen `typedRayComputeRow` and run every command in the [intern guide](../design-doc/03-qualifying-a-guarded-ray-row-and-positive-divisors.md). See [row and mutation cases](../various/compiler/rows.json), [full packed-frame execution](../various/compiler/packed-frames.json) and [the exhaustive width check](../various/compiler/lane-domain.json).

### Technical details

Only q0, q1 and q2 are touched. The fast entry consumes 32 bytes of aligned stack space, uses a scalar peel and tail, then restores SP at return. This is a whole-function template match with explicit scalar fallback. Fresh-realm host compiler timings and application source sizes are available with [all 75 samples](../various/compiler/apply-cost.json).

## Step 4. Compare the registered images on the physical fixture grid

The device operator completed all 324 pose blocks across nine programs and notified me after the third repetition. I independently recomputed the comparisons for the five compiler configurations from the finished rows and load records. I had no serial session.

### Prompt Context

See Step 1. The director requested device evidence in the article once the physical owner released the measurements. The prior host narrative is at commit `4fb4589`.

### What I did

Keyed the five arm observations by fixture and repetition. Verified identity of pose, stride and all three plane checksums across each key and verified guest cycle/time consistency for all four operations. Calculated per-pair fractional time reductions and separate default-scene medians. Recomputed per-arm compiler time and peak tracked QuickJS memory from the three loads.

### Why

An all-program average would mix different source transformations. Pairing explicit against matched isolates the incremental packed implementation while retaining its new scalar schedule. The byte-identical inferred image supplies a control for timing spread.

### What worked

The explicit packed arm improved all 36 matched complete-frame comparisons, by a median 0.8178%. The primary improvement was 5.2389%. The divisor arm improved all 36 complete frames against stock, with a median reduction of 4.7353%. The program-4 and program-5 clean differences straddled zero, as expected for equal images.

### What didn't work

The first device message contained one complete block. I postponed quantitative publication until all three repetitions were available, then required the script to reject incomplete inputs.

### What I learned

The host primary direct-count saving cannot numerically predict the physical primary phase because the latter includes geometry preparation and diagnostic output copies. Full-frame boundaries support a cleaner comparison of the two measurement types.

### What was tricky to build

The matched scalar control is program 8. Programs 6 and 7 belong to a different rendering variant. I checked the runtime's backend mapping and the text SHA values before pairing the sets.

### What warrants a second pair of eyes

Check direction of each percentage against the named baseline, especially explicit versus matched. Review the small positive and negative differences between byte-identical explicit and inferred programs before attributing a sub-percent difference to the selector.

### What should be done in the future

A deployment decision can include the frequency of recompilation and the expected number of frames rendered per build. Current evidence covers one board and one specialized row contract.

### Code review instructions

Run `physical-ablation.py` on the physical operator's final `rows.json` and `loads.json`. Compare [the paired receipt](../various/compiler/physical-ablation.json) with [the article](../analysis/03-what-eight-lanes-save-in-a-complete-typed-ray-tracer.md).

### Technical details

Each pose block contains C scalar, C PIE and Typed guest observations with clean, audit, primary and shading values. This comparison reads guest index 2 and indices 0 and 2 for frame and primary respectively. The three default medians are measured separately from the median of the 36 pairwise time reductions.

---
Title: Director investigation diary
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:24:59.997217018-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary


## Step 1. Establish the controls

Attribute the physical row speedup to guard hoisting, register retention and empty-row rejection with the same scene and matched controls. I opened this ticket before altering compiler behavior and assigned owners for frontend observation, native lowering, scalar experimentation and physical qualification.

### Prompt Context

User prompt (verbatim): “Alright, implement that an then the scalar breakdown. Diary and design doc and all that. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”

Follow-up (verbatim): “also regarding wasm / rv32 emission, etc...”

### What I did

Read the existing compiler frontend and backend and the prior native frame profiler. Created the two linked research tickets and defined the measurements before implementing changes.

### Why

Instruction counts and hardware time answer different questions. Matching code and observable outputs is necessary before measuring the overhead of a compiler decision.

### What worked

The current frontend exposes a function callback before its operation storage is released. Previous research preserved full-scene references and runnable backends.

### What didn't work

The first login-shell commands produced no output for ten seconds. Running Bash without login initialization immediately returned the working directory, so I continued with that shell.

### What I learned

Function assembly patches relative jumps after lowering. Profiling an earlier instruction buffer would risk mismatched offsets.

### What was tricky to build

The Wasm encoder emits variable-length instructions, while RV32 consumes numeric operand cells. Their offsets need independent coordinate systems.

### What warrants a second pair of eyes

Verify the mapping for optimized operations that consume multiple frontend instructions and the timing denominator for each trial.

### What should be done in the future

Implement the controls, run the differential gates and update this record with the actual results.

### Code review instructions

Start with this ticket’s design and the production typed-wasm.js and typed-rv32.js compiler entry points.

### Technical details

Host instrumentation runs in the ordinary JS compiler. Only the device researcher uses the shared ESP32-P4 during physical qualification.

## Step 2. Hold the iteration domain fixed and predict a second kernel

I reviewed the matched experiment, reconciled its frontend and emitted machine ranges with the inspector, and requested an independent paired hardware test of the shadow prediction.

### Prompt Context

The implementation follows both user requests transcribed in Step 1.

### What I did

Froze the controlled arms and the separate empty-row arm. Read the generated standalone backends, their host image digests and the actual fast/fallback range annotations. Recorded a second test on the shadow routine after the forecast was committed at 9d43fba.

### Why

A faster row implementation can execute fewer horizontal tests or pay less per test. Only the latter answers the compiler question at fixed coverage.

### What worked

All four fixed-domain arms visited 76,800 positions in the default frame. Hoisting removed 311,624 guest instructions and register placement removed 662,081 at either setting of the other factor. The held-out shadow prediction matched all 412,994 removed instructions.

### What didn't work

A direct diff of physical addresses would compare unrelated functions after an earlier body changes size. We instead compared per-function operation groups and joined profiles separately against each image.

### What I learned

For the default primary routine 1,290,106 stack accesses fell to 370,265 after changing local homes. Guard hoisting alone did not change that count. Skipping provably empty rows saved another 1,108,770 instructions.

### What was tricky to build

The admission path must transfer to the old checked code before writing any output. Distinct admission conditions apply to the shadow function. Unsupported source edits must keep the ordinary compiler path.

### What warrants a second pair of eyes

Inspect the pre-registered shadow forecast, malformed-input cases, C RGB/depth/object-ID oracle and paired time differences. Check which timers include audit writes.

### What should be done in the future

Retain the specialized implementations as experimental controls while evaluating an inferred proof and a general local allocation rule.

### Code review instructions

Read design-doc/02-reproduce-the-scalar-factorial.md, various/compiler/rows.json, inspection.json and shadow-forecast.json. The physical protocol is in design-doc/03-protocol-for-the-paired-physical-scalar-trial.md.

### Technical details

Host pipeline commits b6cf97c, 9d43fba and dbfb5c4. The physical supervisor reserved the single board, froze the linked images and checked on-device output independently.

## Step 3. Reconcile executed code with physical timing

The first P4 trial completed 588 blocks. I used the five independently qualified images to replay a whole default frame with the new inspector, then compared the function-level counts with the isolated-row results. The measurements show where counting instructions predicts the right direction and where it misses a timing interaction.

### Prompt Context

See Step 1. The purpose of inspecting emission on both targets was to make a performance explanation reproducible.

### What I did

Ran the profile join in `scripts/director/01-join-inspector.py` and checked the final stock, controlled and hand-scheduled primary and clean-frame times. Compared raw counts and per-block paired medians. Published the two compiler-inspection articles while the device researcher ran release checks on the benchmark firmware.

### Why

A percentage depends on its denominator. I report primary time, complete-frame time and guest fetch counts separately. The fast path's fallback also needs to be accounted for in static bytes even when it executes zero operations in a particular frame.

### What worked

All five observed compilers emitted the images in the physical manifest; isolated-row and whole-frame primary counters agreed exactly. P4 default clean time was 57.691 ms for stock, 53.942 ms with both factors, 50.436 ms with skipping added and 46.915 ms with the prior hand-scheduled row. The physical interaction across the two fixed-domain factors was −0.657 ms for the primary call. Twelve pose medians had the same sign.

### What didn't work

The physical operator's post-matrix Right-key playability check reported `compositor crashed handling draw: ran past its turn budget of 80 ms`. A previous first-frame-only check could miss it. The initial timings had already been independently recorded with checked RGB, depth, object IDs and guard bytes. The operator rolled back to the verified release before additional diagnosis. Rechecking earlier UART captures also found a draw fault during first-use compilation.

### What I learned

On these kernels, replacing stack traffic and hoisting bounds checks have additive effects on retired instructions but overlapping effects on wall time. An approximately 430 ms first-use compile cannot fit in an 80 ms compositor turn. A completed correct image by itself does not establish that the ordinary UI survives the following input.

### What was tricky to build

The source-mapping experiment measures the same frontend operations twice when they exist in fast and fallback copies. Grouping by source alone would hide that the fallback was never taken. The director replay retains explicit segment totals and checks image identity before comparing with the other researcher's counters.

### What warrants a second pair of eyes

The physical effects use the median of within-repetition differences. Confirm the numbers using the raw rows, rather than subtracting rounded per-arm medians. For the UI, check compositor health after a movement and re-entry into the fourth mode.

### What should be done in the future

Close out the shadow AB/BA measurement, verify the latest playable firmware or its rollback, and record the outcome in the director article.

### Code review instructions

Start with `various/director/profile-join.json` and `various/device/summary.json`. The first trial's cold compilation, heap and static image sizes are separately available in the device evidence.

### Technical details

The common-guard primary took 17.818 ms. The median paired savings for the joint primary change was 3.766 ms. Comparing the two clean medians for ordinary and combined gives a 6.5% shorter rendered frame. The new source and evidence were committed in 06c69ca.

## Step 4. Check the held-out prediction on the ESP32-P4

The board completed every block of the independently ordered shadow trial. A correct prediction of guest instructions explained the direction of the physical result, while the size of the timing effect had to be measured separately.

### Prompt Context

See Step 1 for the original request. This step tests whether the inspector supports a falsifiable optimization prediction outside the primary routine.

### What I did

Compared eight paired stock and candidate measurements for each of twelve poses. Checked the primary-only negative control, separate shade timings, exact native and ELF identity of both stock builds, new cold compiler receipts and all scene checks. Regenerated the paired primary chart with the legend outside the plotting area.

### Why

Doubling the number of timing samples on a single pose would provide little evidence about a proposed change of scope. A second kernel and twelve inputs let us test what transfers beyond the first row. The primary-only control tests whether unrelated code moved in wall time.

### What worked

The held-out clean default went from 57.6815 to 55.4780 ms. The paired saving was 2.2085 ms (3.829%); the eight paired values ranged from 2.197 to 2.236 ms. The paired primary-only saving was 0.0070 ms and individual differences crossed zero. All 192 blocks matched the C controls. The frontend and native reports distinguish a 2.659% reduction in guest instructions from a 3.829% reduction in physical time.

### What didn't work

The first physical image was unsuitable for an ordinary post-reset handoff. The separate fix in 4a86f07 schedules the fourth Ray Tracer mode’s cold compilation and frame computation in the existing ray-specific kernel poll. The delivered native program, controls and global compositor budget remain the same.

### What I learned

The cross-build stock compiler medians changed from 430.016 ms to 452.3825 ms, and the stock compiler peak changed from 645,724 to 679,950 bytes. The linked stock ELF was identical. Multiple firmware inputs changed. An isolated build pair would be required to measure the marginal cost of carrying the optional observer on-device.

### What was tricky to build

A valid viewport checksum alone had missed an ordinary compositor failure after the draw. Final qualification must combine flash readback, matching complete RGB565 viewports and world health checked after ordinary UI events.

### What warrants a second pair of eyes

The original shadow forecast was committed at 9d43fba. The control and held-out results are separate firmware matrices. Keep comparisons within the same image wherever the experiment provides a matching control.

### What should be done in the future

Try automatic loop-local register placement on a new kernel and qualify it against these explicit controls. Track on-device compiler cost as well as whole-frame time.

### Code review instructions

Start with the director article and the compiler article frozen at 37bb2b5. Reproduce the shadow summary from the 192 raw rows using scripts/device/05-shadow-summary.py. Confirm that the paired saving uses within-block differences.

### Technical details

Design bundles for both tickets were delivered to the dated reMarkable cloud directories. The device work uses the 360 MHz ESP32-P4. Full guest code images and generated executables are reproducible from the ticket scripts and exact hashes.

## Step 5. Verify the installed build and publish

The board operator read back the final app and partition, performed a cold UI launch, moved a sphere, changed lighting and returned to the opening pose. Four complete viewports matched their frozen controls and all eight checked native worlds reported healthy after the last event. The board remains on the verified build.

### Prompt Context

See Step 1. This milestone completes the requested measurements, newcomer reports, publications and detailed diaries.

### Evidence and commits

- Physical addendum and release result frozen at aceacf9. The app flash SHA-256 is e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5. See `various/device/handoff-audit.json`.
- `remarquee upload bundle` returned `OK: uploaded PicoCalc Scalar Breakdown Guides.pdf -> /ai/2026/11/21/PICOCALC-SCALAR-BREAKDOWN`. The inspector guide was delivered separately.
- Three scalar articles and their chart were committed and pushed to go-go-parc. The publisher verified remote main at 2b353648102f5223a5a0cf511d80d8cfa78c69e2 and checked the committed bytes. The two inspector articles were published in da38c92.

### Noteworthy decisions or failures

All candidate compiler optimizations remain selectable research treatments. The ordinary Typed Ray Tracer still selects the stock guest. The production change scoped to its fourth mode fixes the compositor handoff discovered during release qualification. The physical code-generation experiments measure runtime; promoting any candidate into a general compiler requires another decision.

### Remaining requirements and next action

Both tickets are complete. The reports identify prospective research on register selection, proof discovery and isolated cold-compiler overhead.

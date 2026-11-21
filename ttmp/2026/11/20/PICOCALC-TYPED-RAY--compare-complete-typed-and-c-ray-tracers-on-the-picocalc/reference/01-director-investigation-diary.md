---
Title: Director investigation diary
Ticket: PICOCALC-TYPED-RAY
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
LastUpdated: 2026-11-20T23:51:27.413194279-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1. Separate the renderer experiment from scene authoring

The commission says “My first milestone would be one complete all-Typed scalar frame on the board, before adding any language feature.” I established a separate ticket and a single hardware queue behind the ongoing Candela trial.

### Prompt Context

The [verbatim commission](../sources/commission.txt) records the complete original request. The user asked to launch another research lab comparing the C implementation with Typed and exploring compiler improvements. The expected output is a complete renderer and measured physical comparison, with individual research diaries and published reports.

### What I did

Defined equal-work gates, memory ownership, four comparison classes and exact intermediate and final image checks.

### Why

Changing both the algorithm and compiler would make a difference in elapsed time hard to attribute.

### What worked

The preceding trials supply reproducible C scalar and C+PIE controls and a checked Typed material evaluator.

### What didn't work

There is no physical all-Typed timing at ticket creation.

### What I learned

The signed discriminant requires an explicit representation whenever it crosses the buffer boundary.

### What was tricky to build

The physical board is shared with an already-running experiment, so host implementation and code-generation studies start independently.

### What warrants a second pair of eyes

Check geometry, shading and rounding independently of the final RGB565 image.

### What should be done in the future

Execute the research matrix and preserve each arm's behavior and costs.

### Code review instructions

Start with the frame contract and the original ray tracer's C and assembly code.

### Technical details

The render target is 160×160 RGB565. The UI/enlargement/display transfer stays outside the timed frame.

## Step 2. Allocate independent researchers and test the intersection domain

I commissioned three separate Opus High studies through the authenticated CLI with tools disabled. The prompts cover differential correctness, code generation and matched physical experiments. The three existing local researchers own integration and the audit trail in those lanes. I tested a fourth question independently. How many scalar iterations does the geometry actually require?

### Prompt Context

See Step 1. The requested milestone compares the complete existing algorithm in both languages. A different iteration domain constitutes a separate optimization arm.

### What I did

I compiled a standalone C experiment that calls the production row kernel and compares every depth and winning sphere with a candidate loop. The candidate uses the integer square root of the row discriminant to restrict the x interval. The experiment also checks the rendered colors and includes an exact depth tie with distinguishable materials.

### Why

A compiler improvement and a change in the underlying algorithm answer different questions. A broad scalar-versus-SIMD comparison could hide a cheaper way to avoid testing empty space.

### What worked

All 102,400 pixel comparisons passed across four scenes, including changed positions, lights, an equal-depth tie and a radius-one sphere. Each of the three ordinary scenes took 6,983 sphere/pixel visits under exact spans, compared with 76,800 for a full scan. This is a 90.91% reduction in candidate pairs. The kernel still clears 160 depth rows and shades all 25,600 pixels.

### What didn't work

An unprivileged shell lookup of the serial port returned `zsh:1: no matches found: /dev/ttyACM*`. The physical owner confirmed access through the approved host context and retained the board reservation for Candela.

### What I learned

For integer coordinates, the condition dx² ≤ r² − dy² can be converted to an inclusive interval using the same root table that computes hit depth. Exactly 165 sphere/row pairs have a nonempty interval in an ordinary frame. The number of visits equals all front-surface intersections, including those later occluded by another sphere.

### What was tricky to build

The C renderer leaves the winning object byte unspecified on a miss. The differential checks the depth first and compares IDs only when a winner exists. Equal depths keep the earlier sphere because the replacement comparison is strict. Color uses the winning sphere under the existing lighting code.

### What warrants a second pair of eyes

These counts describe work, not elapsed time. Sphere scene limits and the root-table maximum matter. A camera model with perspective projection would require a different derivation.

### What should be done in the future

Time exact spans separately from a like-for-like scalar port. Inspect whether the emitted Typed code benefits from fewer loop iterations or is dominated by lighting.

### Code review instructions

From the project root, compile `scripts/director/row-domain.c` inside this ticket with `cc -std=c11 -Wall -Wextra -Werror -O2 -fsanitize=undefined -fno-sanitize-recover=undefined -Ipicocalc-os/nucleus`. Run the resulting binary and compare its JSON with `various/director/row-domain.json`.

### Technical details

For row y and sphere center (cx, cy), let h = r² − (y − cy)². Skip negative h. For nonnegative h iterate from cx − floor(sqrt(h)) through cx + floor(sqrt(h)), clipped to the frame. Keep sphere order, strict depth ordering and integer rounding. The experiment includes the production implementation in the test translation unit so private routines stay private.

## Step 3. Profile the generated frame and port programmable rendering

The host scalar port at 223e017 allowed me to measure the generated program at instruction granularity. I implemented a separate complete programmable renderer and used the profile to choose a second traversal experiment. The compiler researcher independently reduced redundant division guards and built a matched scalar/packed primary row.

### Prompt Context

See Step 1. The scientific question is how close compiled Typed can get to C on a P4 while retaining the rendering decisions in Typed.

### What I did

Added the fourth ordinary UI scene at a396e31. I reused the existing Candela scanline shader, added the complete Typed frame and created six exact independent oracle images. In 669f242 I wrote two independent traversal candidates. I subsequently cross-compiled a hardware comparison TU and linked the real generated programmable shader in the existing four-entry ELF slot (4776158).

### Why

The profile identified floor shadows as a larger consumer of guest instructions than primary sphere intersections. Reordering shadow queries by sphere and scanline lets the program reject whole rows and move invariant calculations out of the innermost loop.

### What worked

The default clean scalar frame executed 15,532,624 instructions and matched C RGB565 FNV 2f75a8a5. Exact primary spans plus a shadow mask reduced it to 8,729,318. Adding the literal-divisor compiler reduced it further to 7,918,645. All 12 scalar oracle cases with all four rendering boundaries passed separately for spans, shadows, and both. Six independent material images matched both Wasm and real emulated RV32, including the entire caller memory after each frame at stride 163. The four-entry programmable ELF occupied 66,816 bytes in the preallocated slot container.

### What didn't work

The first version of the material harness called `api.memory.grow(1)` whenever the module had fewer than 70,000 bytes. Node reported `RangeError: WebAssembly.Memory.grow(): Maximum memory size exceeded`. Adding the actual allocation sizes showed that all six buffers already fit in one 65,536-byte page. Removing the unnecessary growth operation preserved the compiled module without expanding its memory type. The physical builder also tried to run an uncommitted traversal generator from an earlier archived revision. I committed the dependency and the operator selected the complete source revision.

### What I learned

Changing the primary intersection domain removes 90.9% of candidate visits but only 13.6% of full-frame instructions. The baseline also spends 5,115,562 instructions on loads/stores addressed from the stack pointer. Guard removal cuts control flow without changing those accesses. Whole-frame instruction counts by function and opcode class make these distinctions visible.

### What was tricky to build

The projected horizontal shadow bounds use ceiling division at the left and floor at the right. Typed uses truncation toward zero for signed division. The variant first clamps the lower bound to zero and rejects negative upper bounds, so only nonnegative numerators are divided. Equality at the right edge stays inclusive. Each projected sphere may mark the same shadow cell; the union operation remains idempotent. The mask occupies cells 1865 through 2024 in preexisting scratch.

### What warrants a second pair of eyes

Check mixed versus Typed frame setup, the cost of input validation in each public entry, PSRAM placement, and the effect of installing different variants. The profile is exact guest instruction count on one scene. A clock result requires the board.

### What should be done in the future

Finish controlled physical timings and summarize the accelerator's marginal value separately from scalar scheduling, image semantics, and ordinary screen presentation.

### Code review instructions

Run the director profiler with baseline, both source generators, and the positive-divisor backend. Compare `various/director/profile-*.json`. Use `material-oracle.py SCRATCH`, then `material-check.mjs SCRATCH [SOURCE]` against all material fixtures. Inspect the exact sample images by SHA-256 in the JSON.

### Technical details

The programmable interface takes six buffer pointers and two integers, which exhaust the target's eight direct argument registers. The native mixed reference uses C geometry with PIE and the same material graph semantics. Both arms warm up outside each recorded pair. The qualitative Opus High design inputs are in various/commission, with the exact public-topic prompts under scripts/commission.

## Step 4. Reconcile actual hardware clocks, isolate two phases, and review the reports

The fixed-color trial finished 324 observations. I reviewed each class of result and compared default-pose medians with the paired estimates over all 12 poses. A second qualified image added isolated phase clocks without changing the clean fixed-color program. The board owner alone flashed and queried the hardware.

### Prompt Context

See the complete commission linked in Step 1. The user explicitly requested separate intersection, shadow, material and full-frame measurements and individual researcher reports.

### What I did

I cross-compiled the mixed/full material benchmark, checked the closed ELF against its four exact signatures, and implemented the shadow and unlit-material diagnostics at eebb722. Separate Python code predicts each complete shadow mask and unlit RGB stream. In cd4c084 I archived the per-function profiles, three new Opus High final discussions, an independently inspected GCC disassembly, the chart and the director's synthesis. I incorporated the technically reviewed discussions in the three lane articles.

### Why

The clean frame must call the generated program once. Reading a timer on each pixel or retaining additional intermediate frames in that entry would change the comparison. The diagnostic first constructs the actual visibility and material rows. It times the two phases independently and retains their outputs for validation.

### What worked

The ordinary scalar Typed image took 57.674 ms on the default pose. Scalar C took 9.521 ms and C+PIE took 8.350 ms. The exact-span and shadow traversal with constant-divisor proof took 29.975 ms. The paired explicit-versus-matched scalar row reduced complete frame time 0.818% over 36 fixture/repetition pairs. All 36 programmable frame pairs matched. The 36 isolated phase trials also matched the independent mask and color CRCs, with 3,339 visible shadow pixels each. Phase medians for shared/tile were 24.570/24.573 ms for shadows and 20.327/9.720 ms for material evaluation.

### What didn't work

A research directory received Python's generated bytecode between review and staging, which included one .pyc in cd4c084. I removed it and excluded script caches at 0d2b12f. The publication script's trial run verified all relative article links before publishing.

### What I learned

Almost all the default-pose improvement of the packed row over the ordinary compiler was already available in the matched specialized scalar row. The programmable scene study gave a complementary result. Because both fixtures shared geometry, the measured 10.607 ms difference in unlit material evaluation tracked their 10.641 ms difference in complete frame times.

### What was tricky to build

The ordinary material frame and diagnostic share a fixed four-entry linker contract. I combined scene construction and the initial parameter edit into one checked builder, making room for independently callable visibility/shadow and material routines. C code allocates and presents buffers. All geometric decisions and both measured shading algorithms remain in Typed. Timed calls in the diagnostic are per-row. Timed calls in the complete Typed arm remain per-frame.

### What warrants a second pair of eyes

The 48.0% frame reduction compares two implementations with three simultaneous changes. Do not assign that gain to packed instructions or to the general compiler alone. The study has three repetitions for each default-pose treatment on one board. Moved and extreme inputs provide extra evidence of consistency, not extra identical-board replicates.

### What should be done in the future

Trial the positive-divisor rule on the application catalog. Study register retention and proven accesses in a second hot loop. Keep the ordinary implementation selectable for matched tests and use the current handheld gate for future candidates.

### Code review instructions

Open the director report's chart, then compare with the medians in various/device/summary.json and the paired compiler comparisons in various/compiler/physical-ablation.json. Use scripts/director/phase-check.py to replay the separate arithmetic model without a device. Its collect function is called only by the device owner during a physical qualification.

### Technical details

The compiler consultant's suggested blend demonstrates why signed lane narrowing requires proof of the intermediate width. The measurement consultant corrected denominator ambiguity. The scalar consultant highlighted inclusive silhouette and depth-tie tests. All three were actual Claude Opus High jobs with tools disabled. They received abstract questions first, then aggregate outcomes. Local implementation researchers retained source access, execution and physical device responsibility.

## Step 5. Verify physical handoff and publish four reports

The device owner confirmed final readback of the phase-enabled firmware, a successful reboot, eight native worlds, healthy I²C and SPI, and the Typed scene visible with its exact viewport. I published the four final project reports and three figures in the go-go-parc vault. The publication process verified all seven committed blobs and compared remote main to the new revision.

- Final qualifying firmware SHA-256: db17ab6adbcfa32e6a64a311b434562b1f35c12aa415f1ba8a4e838b6386764c.
- Research article freeze: physical investigator d9977e8. See various/device/handoff.png for the capture.
- Vault main: 1440d663ab467ba9c5e0a83a475c4468d2dfaa2c. Each article appears in Projects/2026/11/21 with links to its three companion studies.
- Publication receipt: various/director/publication.json.

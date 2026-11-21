---
Title: Physical complete-frame comparison investigation diary
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

# Physical complete-frame comparison investigation diary

## Step 1. Reserve the serial lane and specify distinct frame observations

### Prompt Context

**User prompt (verbatim)** See the director's first diary entry. **Delegated assignment (verbatim)** “Once Candela ordinary UI and physical report+diary done, take exclusive board for new PICOCALC-TYPED-RAY. Coordinate scalar ABI/source with pie_lowering NOW so scaffold compile/load/native measurement ahead. Need same-input original fixed C and Typed full frame, exact all depths/IDs/colors, varied scenes, matched instrumented phase and clean frame samples, flash qualified latest playable, no native rendering decisions for Typed.” **Assistant interpretation** Establish a physical stock scalar baseline with identical exported pixel, depth and identity results. **Inferred user intent** Separately measure each compiler or algorithm change. **Commit (code)** Design checkpoint before implementation.

### What I did

Coordinated eight-register audit ABI, separate clean-frame ABI, fixed reusable workspace and two compiled backend variants. Reserved the normal guarded presentation interface with the director. The preceding Candela physical suite holds the board throughout its run.

### Why

Writing an extra 102,400 bytes for every frame can distort comparisons. A real clean path and a paired audit path let the reader distinguish renderer performance from diagnostic traffic.

### What worked

The renderer owner specified scalar axes, geometry bounds, packed or padded strides, scratch capacity and fixed object identifiers. The compiler owner supplied a complete generated backend with the unchanged QuickJS API and an independently reproducible digest.

### What didn't work

The shell sandbox does not expose the USB device node to default commands. The established scoped physical runner can request serial and flash access; its previous physical readback succeeded. Lack of default sandbox access does not imply a disconnected board.

### What I learned

The original C convenience call returns RGB only. Direct access to the private row geometry is required for a good audit and phase control. The renderer owner will supply these native helpers from the original engine.

### What was tricky to build

The baseline's row-stride convention, one-based object IDs and zero miss value have to be shared by all compilers and rows without moving arithmetic into host code.

### What warrants a second pair of eyes

Check the C and Typed clean entry functions neither write the two diagnostic planes nor take a different scene argument. Check that source scheduling and code generator changes can be selected independently.

### What should be done in the future

Complete the previous physical trial, then time the qualified new image. Collect the whole framebuffer and preserve the verified rollback image.

### Code review instructions

Start with [the physical protocol](../design-doc/04-measuring-a-whole-typed-ray-frame.md) and follow the native module entry signatures into the complete Typed source.

### Technical details

The ELF follows ilp32f. On RV32 the eight audit arguments can occupy a0 through a7. All four Typed arguments that represent buffers point to a capacity header followed by little-endian 16-bit cells.

## Step 2. Pair C and native guest work at every stage

### Prompt Context

**User prompt (verbatim)** [Director's diary](01-director-investigation-diary.md). **Assistant interpretation** The same input, output and instrumentation obligations must hold independently for each implementation. **Inferred user intent** Establish where the compiler and handheld spend time and keep the playable display path entirely in the tested module. **Commit (code)** 15c3a06, 38d617b.

### What I did

I implemented an eight-register guest audit call, a clean frame call, a primary-only call and a shade-from-two-planes call. A closed Typed module returns four addresses to the trusted loader. The benchmark first produces an untimed scalar C reference with all three planes. It then rotates C scalar, C PIE and guest order, timing each operation on the same output pointers. I freeze the three input variables separately: baseline source, span/ray algorithm and compiler backend. The build accepts locally generated closed backend variants as optional bundles.

### Why

The physical framebuffer and both the C and Typed audit planes live in ordinary PSRAM. Moving source evaluation or lighting into the native wrapper would understate the guest cost. Four independent entry clocks can be audited without subtracting a checksum run from an unrelated time.

### What worked

The independent qualification data covers a lamp-only change, overlapping objects, legal near/far corners and an output stride as wide as 320. The test puts opposite byte patterns in the C and guest outputs, checks every visible word, checks each untouched pad, checks the end canary and compares the physical C model to a separately compiled host C model.

### What didn't work

The first archived build named a newly created generator file that existed in the working tree but was absent from commit 223e017. The stage generator failed before any board write. The director promptly committed both algorithm transformations at 669f242. I began a clean ordinary candidate from the complete scalar production commit while preserving the Candela rollback tree.

### What I learned

The proposed independent [Opus High research design](../various/commission/03-measurement-design.md) explains that terminal checks and differing buffer traffic are central measurement confounders. The physical protocol takes its matched-input, independent intermediate and rotated-order suggestions. It records hardware core-cycle deltas and elapsed microseconds on a pinned kernel task. All variants share a fixed data layout within a block. The study samples a single binary placement per configuration.

### What was tricky to build

Classic C and complete Typed render the exact same visible scene. A pixel match alone could occur if a switch request never selected the Typed renderer. The ordinary UI now increments a success counter only after its guest frame returns and its pixels have been copied. The runner checks the observed pose and counter movement at each step and again after the final reboot.

### What warrants a second pair of eyes

The fixed algorithm precomputes per-row scratch in every entry call. The shade-only clock includes relevant setup and copying geometric inputs. The sum of isolated phase times need not equal a clean-frame observation. The C watchdog and input scheduler continue their ordinary work outside these calls.

### What should be done in the future

Compare both semantically identical packed backends at their first successful physical build. Preserve negative outcomes if a new backend fails any intermediate or pixel gate.

### Code review instructions

Review [the ordinary build helper](../scripts/device/01-build.py) and [physical tests](../scripts/device/02-device.py). Compare the checked number of returned pixel words with the dimensions of each physical phase; the extra guard after the last row is outside the reported CRC.

### Technical details

Cold compile uses a fresh 4 MiB-bounded QuickJS allocator and an 8 s deadline. Fixed output surfaces each reserve a 4-byte header, 2*(159*stride+160) output bytes and one final guard. Scratch reserves 2,048 words plus header and guard. A separate material program uses the 303-cell scene graph and existing native Candela row control.

## Step 3. Execute the fixed and programmable frame matrix on the physical P4

### Prompt Context

**User prompt (verbatim)** [Original measurement brief](../sources/commission.txt). **Assistant interpretation** Compare clean whole-frame timing on the physical board before attributing any speedup to PIE, then run like-for-like programmable materials. **Inferred user intent** See which investment helps actual frames while maintaining a stable playable firmware. **Commit (code)** 03db803 build, a4bf5fa archived image hashes.

### What I did

Ran nine closed programs at twelve poses, three repetitions each. For every block I timed four separate operations in each of three arms, checked output bytes, guards and host reference CRC, and verified the core counter against the microsecond clock. I ran 36 separate programmable shader pairs. I exercised F1,V,G,G,G,Right,W,R with five state checks including boot handoff. The baseline frame counter advanced through 1, 2 and 3 as the scene entered, moved and was relit. It remained at 3 when reset switched away from the guest.

### Why

Identical pictures can be produced by different paths. The state counters target that specific failure mode. Preserving an equivalent scalar row detects whether a speedup truly comes from vector instructions. Host and native reference planes independently check the byte layout of the audited data.

### What worked

All 324 blocks passed; each contained 12 successful timed calls. The tracked cycle frequency ranged from 359.72 to 360.01 cycles/µs. Clean opening times were 9.521 ms for scalar C, 8.350 ms for PIE C, and 57.674 ms for stock Typed. The strongest source/compiler combination used 29.975 ms. Explicit vectorization saved 0.383 ms of clean time compared with the matched scheduled scalar primary row.

### What didn't work

The broad conclusion that eight packed lanes explain the entire stock-to-optimized difference failed the matched scalar test. Both forms improved substantially from the original source; only part of the remaining difference belongs to the packed instructions. Complete Typed still took more time than C on every tested pose.

### What I learned

The slowest isolated region in the baseline was shading, including shadow resolution. Changing shadow traversal reduced more time than further refining the already improved primary row. Two guarded recognition policies generated identical machine code and produced slightly different sample times; image identity does not remove ordinary timing variation.

### What was tricky to build

The actual ordinary display consumed the guest under compositor control. The active program had to be switched back to the unmodified source before testing the daily-use UI. The physical three-plane oracle includes sentinel-filled padding and the raw C host oracle deliberately used another fill, so only active native pixels were copied into the normalized host CRC buffer.

### What warrants a second pair of eyes

Check median denominators and compare each performance conclusion to its intended control. Retired instructions came from an interpreter in the compiler report; this investigation uses core cycles and elapsed time from the real P4. Packed and inferred produce identical text digests.

### What should be done in the future

Collect separate shadow-mask and material-evaluation clocks on the same accepted visible geometry. Keep those diagnostics out of the measured ordinary frame. Do not change the firmware file under the active physical suite before its final readback.

### Code review instructions

Read [all raw fixed clocks](../various/device/rows.json), [the median reducer](../scripts/device/03-summarize.py), [the hardware screenshot receipts](../various/device/screens.json) and [the programmable paired measurements](../various/device/materials.json).

### Technical details

The first accepted matrix used exact production revision 03db803388c88fe51a78cfd534777b8590d4ffdc and application fc4f0302259a533a4c5ad75a791ebf2735db19e4059e93cce15ba987f043513c. The previous Candela binary was preserved independently. All three candidate RGB565 viewports and the classic reset matched the same references used for the original release.

## Step 4. Isolate shadows from material evaluation on the same visible hits

### Prompt Context

**User prompt (verbatim)** “Then measure intersections, shadows, material evaluation and the whole frame separately.” **Assistant interpretation** Supply the same real winning materials and visibility masks to two isolated kernels. **Inferred user intent** Distinguish shadow geometry from expression evaluation without disturbing the clean unit. **Commit (code)** eebb722 contains phase entries and independent oracles; 2b00101 wraps the physical release and regressions.

### What I did

I preserved the verified prior fixed-matrix app as an independent rollback binary, built the director's four-entry diagnostic module and flashed only the application. The test prepared row geometry once, warmed each phase, executed the device-timed shadow and material kernels, and compared the resulting full-mask and unlit-color CRCs to an independent Python oracle. After collecting all 36 samples it repeated six complete material frames and all nine fixed programs at the default pose.

### Why

The warm frame includes lights, material shading, shadow geometry, pixel quantization and stores. Separate clocks with real visible masks make the contributions intelligible. Reusing the full fixture graph avoids creating a probe in which the shadow or color decision is artificially trivial.

### What worked

Both fixture families and all six weights produced the reference mask: 3,339 shadowed visible floor pixels. The shadow pass medians were 24.570 ms (shared) and 24.573 ms (tile). The actual Typed unlit material medians were 20.327 and 9.720 ms. All 36 shadow and material checks passed, as did all six complete-frame regressions and all nine fixed clean/audit/primary/shade regressions.

### What didn't work

It would be incorrect to treat these independent pass times as a literal decomposition of clean frame latency. They execute 160 module calls per pass, materialize intermediate rows and omit downstream illumination and packing. Their cache access pattern differs from the streaming clean program.

### What I learned

Changing only the material weight preserved the diagnostic shadow stream across all six combinations. The shader's optimized canonical tile row produced substantially lower material-clock times under identical geometry.

### What was tricky to build

The first full matrix used a prior ordinary image. Updating a reused build tree while the first runner still needed its final flash readback would break the release audit. The second build ran only after the first verified reboot and handoff. The prior app and table were copied to independent paths before any build directory reuse.

### What warrants a second pair of eyes

The phase receipt covers all unlit channels via a CRC on the P4 and direct complete-byte host checks. The full frame probes use on-device byte-for-byte comparison before hashing. Preserve that distinction when interpreting agreement probabilities.

### What should be done in the future

Repeat on a second board or with different code placement before interpreting sub-percent effects. A more general material graph can test whether row-specialization speedups persist with composed or user-defined operators.

### Code review instructions

Read [phase guest entries](../../../../../../picocalc-os/worlds/raytrace/material-phases.typed), the [independent CRC construction and serial replay](../scripts/director/phase-check.py) and the [release and regression runner](../scripts/device/05-phase-device.py).

### Technical details

Physical probe revision 2b001015f21fac8314e942298e65cbdd31d30b78. The 4,633,344-byte application is db17ab6adbcfa32e6a64a311b434562b1f35c12aa415f1ba8a4e838b6386764c. Both builds retained the partition table with SHA-256 72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30. No client filesystem file was changed by these tests.

The final runner exited successfully, verified the 4,633,344-byte application and unchanged partition by readback, rebooted and left the actual complete Typed opening scene visible. The actual guest display counter was 1, program 0, pose (68,61,31,25); the 57,600 viewport pixels matched the accepted prior image byte for byte. [Final handoff](../various/device/final.json) [Unaltered physical screen](../various/device/handoff.png)

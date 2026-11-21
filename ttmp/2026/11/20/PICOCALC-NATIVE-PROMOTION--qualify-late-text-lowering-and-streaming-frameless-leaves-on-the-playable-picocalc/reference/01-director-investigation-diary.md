---
Title: Director investigation diary
Ticket: PICOCALC-NATIVE-PROMOTION
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
LastUpdated: 2026-11-20T19:54:36.755249728-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1. Identify the pair and preserve the control

The preceding wave isolated two improvements that could travel together through the existing streaming compiler. I opened a promotion ticket so the verdict could depend on an ordinary release build, functional tests of the apps and a fresh measurement of guest code running in external RAM.

### Prompt Context

**User prompt (verbatim)** “ok, advance both.”

**Assistant interpretation** Promote the late checked-text lowering and frameless leaves named in the preceding wave and test the ordinary end-to-end path.

**Inferred user intent** Keep the latest qualified firmware playable and give future researchers enough evidence to reproduce the decision. The deeper inlining experiment is a separate research treatment.

**Commit (code)** 8052db7 — Promote late text lowering and frameless leaves in the Typed RV32 compiler.

### What I did

- Created PICOCALC-NATIVE-PROMOTION with docmgr and assigned implementation, independent host validation and serial ownership to different researchers.
- Identified prior code control 5f77855, the published playable app digest 134f3a24… and the partition 72721dc3… in the release-lab receipt.
- Used the previous complete Editor and Chess linked images as independent expected outputs for the pair.

### Why

Checking a single synthetic trace would not show that the changed compiler can still build the mobile painter, or that the resulting Chess world can process an actual input event.

### What worked

The independent fixture reproduced the 2,332-byte prototype and full-memory behavior over 1,603 held-out calls per lowering mode. The integration researcher separately verified 160 distinct position/rotation painter outputs.

### What didn't work

The archived generic Chess host driver initially lacked helper symbols for the current generic reactor. The host researcher added the registrations only in the replay driver. The ticket's host diary explains the inputs and recovery.

### What I learned

A hash comparison can qualify the identity of a linked product before execution. It cannot establish timing after placement in external RAM.

### What was tricky to build

The ordinary Chess source includes a writer for a second source file. Source, reconstructed painter, reactor template, executable instruction extent, and final linked ELF are distinct objects. I recorded their identities separately.

### What warrants a second pair of eyes

Review the fail-closed rules in lowerLeaf and confirm destination trap order before the write RHS, including aliased buffers and calls.

### What should be done in the future

Compare the installed compiler with the control in ordinary boots and use a separate fixed-work measurement for the guest.

### Code review instructions

Start with the two production compiler files in 8052db7, then read reference/02 and reference/04. Run make -C picocalc-os test-apps and consult various/host/combined.json for fixtures and output identities.

### Technical details

The typed frontend supplies numeric tape cells 0xf1 and 0xf2 on the native path. Eligibility for the frameless attempt is bounded at 128 tape cells and includes only allowlisted operations with a known operand width.

## Step 2. Build an attributable firmware and a separate PSRAM experiment

I built the exact committed compiler in an isolated tree with the smooth Chess release profile. In parallel I prepared a test firmware with the old and new complete Chess worlds. The two pieces of firmware exercise different boundaries, so they have separate entry points and receipts.

### Prompt Context

See Step 1. I chose to alternate the two Chess treatments in one test binary because the normal console reports accumulated world CPU time.

### What I did

- Added scripts/release/01-build-firmware.sh and 02-attest.py. Built revision 8052db721eda91720010867915b70064b33912f0 under /tmp/picocalc-native-promotion-rev1 with ESP-IDF v5.4.2.
- Wrote scripts/psram/01-export.mjs, 02-build.sh and the test-only IDF project. Located the two search entry addresses from exact real linked ELFs. Used the same pinned ESP ELF loader and PSRAM setting as the release.
- Verified the ordinary image contains both promoted compiler sources, the standard native compositor package, mobile and world templates and the exact 61,022-byte Chess source. Preserved its original partition map.
- Passed the new application and SHA to the sole serial operator. Commissioned the independent qualifier to run the PSRAM comparison after the ordinary A/B test.

### Why

A firmware built from a working directory can incorporate another researcher's edits. An archived commit and a matched-image check make the intended compiler change attributable. A second fixture separates search execution from UI processing.

### What worked

The playable application is 4,331,776 bytes and has SHA-256 33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813. The complete Chess ELF matches the independent late-leaf result 8487d9b6… exactly. The source writer reconstructs all 16,316 painter bytes. Before uploading the private image to the board, the ordinary gate checks the two entry jumps, import call positions, slot capacity, external loader setting, clock and partition.

### What didn't work

- The first supplementary export inside the sandbox encountered “spawnSync git EPERM”. Retried the same build under the managed permission mechanism in a new probe directory /tmp/picocalc-native-promotion-psram-b, which completed.
- The first assertion in 02-attest.py produced “AssertionError: esp-idf/main/natives/compositor.elf”. The uncompressed ELF hash matched the prior release. CMake runs pack_elf.py before embedding the compositor. I corrected the test to verify both the decompressed content and presence of the actual packed bytes, then reran it successfully.

### What I learned

The firmware grew by 3,408 bytes because the firmware embeds compiler code and other build metadata. The generated Chess code is 75,540 bytes smaller. These observations refer to different products. The retained Chess slot itself is fixed at 256 KiB.

### What was tricky to build

The loader relocates the entire ELF. Deriving a guest entry requires identifying its executable file segment and making the same file-offset-to-virtual-address conversion as the linker. The timed program reconstructs each pointer from the returned segment base and ELF virtual address, and checks that the offset falls inside the segment. Test code and board/state are checked for PSRAM residence.

### What warrants a second pair of eyes

The two-arm timing trial times start plus all slices and excludes image loading, initialization of the fixture and painting. Verify exact result tuples, equal slice size, root board restoration, and treatment order before interpreting elapsed time.

### What should be done in the future

Record cold compiler times, normal move CPU, fixed-work search and final ordinary health together. Use the measured spread when interpreting UI differences.

### Code review instructions

Run scripts/release/02-attest.py STAGE OUTPUT against a completed release build. Inspect scripts/psram/main/bench.c and the two hashes from scripts/psram/01-export.mjs. Never run two serial owners concurrently.

### Technical details

The probe runs two arms × six blocks × three positions. The opening and Kiwipete cases search to depth three. The live after-e2e4 fixture uses the game's 1,600-node budget and takes 78 slices. Registers used by the search obey the ordinary RV32 ABI.

## Step 3. Check product behavior independently of its clocks

I reran the normal host tests and build attestation while the device researcher ran matched cold and UI trials. Faster startup changed which UI event was still visible when the capture began. The difference was visible in the actual frame and triggered rollback. We kept the original reference pixels.

### Prompt Context

See Step 1. The ordinary image is meant for everyday use. The interval between a key and an observed frame is a useful separate result from compiler and search time.

**Commit (code)** cb03601 — Build the ordinary compiler promotion and prepare paired PSRAM execution trials.

### What I did

- Ran make -C picocalc-os test-apps and reproduced all 66 successful tests across five suites. Reran scripts/release/02-attest.py and compared the second receipt byte for byte with the committed version.
- Preserved the local playable application, partition and SHA256SUMS under picocalc-os/build/native-promotion, an ignored build folder. Verified both sums.
- Delivered the finished implementation guide through the reMarkable service. The upload returned “OK: uploaded PicoCalc_Native_Compiler_Promotion_-_Implementation_Guide.pdf -> /ai/2026/11/20/PICOCALC-NATIVE-PROMOTION”.
- Reviewed the first UI failure with the device researcher. After shortening compilation, a stock boot notification remained onscreen during the first opening capture. The operator left the timed key sequence and reference comparisons intact and moved the wait into untimed setup.

### Why

A regression in painting and a real change in startup scheduling can both change a screenshot. Comparing the differing pixels with the independently known opening identifies which hypothesis explains the observation.

### What worked

The old firmware was restored and read back by the failure handler. Its app and partition were verified before trying the corrected collector. The device lane acquired three independent cold boots even in the sample discarded for UI qualification. Only the complete subsequent runs count toward the final verdict.

### What didn't work

The first candidate comparison did not match the frozen opening. The device investigator found all differences inside the 312 by 61 boot notification rectangle at x=4, y=26. After this diagnosis, the collector continued to require equality across the full app area before accepting a starting screen.

### What I learned

The UI polling interval bounds what can be said about response latency. Two observed paints and matching pixels can demonstrate a completed move even when the exact time the final pixel reached the display is unknown.

### What was tricky to build

Health checks, screenshots and event timing consume serial bandwidth. The operator records the last pre-completion observation and first successful observation separately, then compares the independent screenshot after the timing interval.

### What warrants a second pair of eyes

Check that the qualification scripts verify full app pixels, preserve the scratch-file contents, and release the serial lock before the supplementary study.

### What should be done in the future

Complete the full-ELF PSRAM comparison and independently publish raw paired values with the final ordinary-image identity.

### Code review instructions

See scripts/device/workflows.py for the untimed opening check and timed move path. Consult the ordinary device diary for the actual commands and receipt names.

### Technical details

The reference app region starts at row 22 of the 320 by 320 framebuffer. The clocks and dynamic system status in the top bar are outside this region. The accepted final reply is compared again against an independent frozen frame.

## Step 4. Measure the actual output, restore the playable release and publish

The physical operator handed off the ordinary board after three successful candidate boots, three matching Chess replies, and an Editor edit, save, reopen and cleanup. The independent qualifier then ran the six-block crossover. The normal device and the standalone test gave consistent improvements on the 1,600-node workload. I accepted the combined change for this board.

### Prompt Context

See Step 1. I treated the promotion as a release to the attached device and publication of the research material to the authorized vault.

**Commit (code)** 75ccb43 — Qualify the playable firmware and document its on-device compile and move times.

### What I did

- Reviewed various/device/comparison.json and independently recomputed the changes from the three cold boots per image and three moves per image. The candidate screenshot showed the board after b8c6 and the expected turn indicator.
- Checked the PSRAM collector's clock, treatment order, loaded entry addresses, tuples and six pairs per position. Confirmed that every pair favored the candidate. Used scripts/release/03-plot.py to draw the per-pair reductions directly from various/psram/physical.json.
- Verified the physical receipt records a readback of the ordinary application and partition and a fresh startup with eight native worlds, a working keyboard and a painter installed with zero rejects.
- Reviewed the three researchers' articles and wrote the director article. Staged four articles and three figures through scripts/release/04-publish.sh. Published them to go-go-parc main, verified the remote ref and every committed article/figure, and linked the results from the project research index. The publication manifest is various/release/publication.json.

### Why

The everyday firmware, the guest ELF, and the CPU counter each have different measurement boundaries. Pairing a deterministic search benchmark with an actual played turn and exact UI behavior lets a reader assess both product value and what the evidence establishes about the compiler.

### What worked

The median cold Chess compile fell from 3.638 s to 1.894 s, and Editor fell from 2.585 s to 2.358 s. The ordinary Chess world used 246.665 ms before and 212.009 ms after. In the supplementary trial, median paired time reductions were 14.16% for the opening, 14.12% for Kiwipete and 14.23% for the ordinary reply after e2e4. All 36 searches matched the Wasm oracle and the 135 checked root cells. The go-go-parc push was verified at 139fb1f4751c8e677302687350eeff58454f1240.

### What didn't work

Files cold compilation rose 6.880 ms, from 273.617 to 280.497 ms. Its peak tracked compiler heap grew by 10,384 bytes. Cold tests run sequentially by firmware, and the design does not identify which of the two optimization implementations accounts for that small change. We retained the result and accepted this tradeoff.

### What I learned

On the ordinary move, the world CPU saved 34.656 ms. The separate search saved 34.288 ms at the median. That agreement supports the search as the main measured contributor on this position. It does not partition a single turn into perfectly additive components. Recorded paint completion brackets overlap, precluding a precise claim about panel timing.

### What was tricky to build

The test had two different return paths to an ordinary firmware. Failure during candidate qualification restored the previous release. Finishing the later temporary timing probe restored the newly qualified release. Attesting each image by its full hash and serializing board ownership ensured the final device state followed that order.

### What warrants a second pair of eyes

Physical evidence covers one board, three selected search positions and the joint compiler treatment. Existing slots continue to reserve the original memory. The design and articles document these restrictions, plus the absence of clock-level timestamps for the last displayed pixel.

### What should be done in the future

To isolate the contribution of frameless leaves to real search time, add the two single-change complete Chess ELFs to this same fixed-work PSRAM harness. The six-arm predecessor supplied static counts. The present release trial supplies real paired timings for the combined treatment.

### Code review instructions

Read analysis/01 for the synthesis and the other three articles for the mechanisms, oracle and ordinary UI evidence. Run scripts/device/04-summarize.py against various/device, inspect various/psram/physical.json, then reproduce the plotted points with scripts/release/03-plot.py. Vault and reMarkable delivery identities are in various/release/publication.json.

### Technical details

All twelve ELF loads used 0x48008fc0 as their PSRAM segment base on core 0 at 360 MHz. Both images were verified at the normal app offset 0x10000 and the production partition map at 0x8000. The promoted app SHA-256 starts with 33b439d0a7bcdf85. The ignored local image and its SHA256SUMS are under picocalc-os/build/native-promotion.

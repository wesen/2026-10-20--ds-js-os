---
Title: Physical ray tracing investigation diary
Ticket: PICOCALC-RAYTRACE
Status: complete
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://firmware/port/esp32p4/main/raybench_p4.c
      Note: Runs coupled scalar and PIE frame and nearest-depth measurements
    - Path: repo://ttmp/2026/11/20/PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/scripts/device/02-qualify.py
      Note: Qualifies normal launcher controls, matching pixels and board readback
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:24:27.428170556-05:00
WhatFor: ""
WhenToUse: ""
---

# Physical ray tracing investigation diary

## Step 1. Choose the image, two timer boundaries and a physical reference

The previous playable release contains the promoted Typed compiler, normal startup, smooth Chess and Files and Editor. I treated that exact binary as the rollback image. I measured real programs by adding a native console command to the ordinary release and kept the UI route available for a separate display check. Full rendering and primary-intersection timing answer different questions, so they have independent outputs and equality checks.

### Prompt Context

**User prompt (verbatim)** “Ok, create it.” [Director's investigation](01-director-investigation-diary.md)

**Delegated assignment (verbatim)** “Own ordinary hardware integration and physical measurements for new raytrace demo. Coordinate kernel API with pie_lowering and UI with wave_review. Add serial command for matched scalar/PIE frame/intersection timing, equality, occupancy; build/flash latest playable normal firmware and capture demo, commit and diary. Own port and physical board. New ticket PICOCALC-RAYTRACE.”

**Assistant interpretation** Demonstrate that the actual P4 executes the target instructions, qualifies their pixels against scalar, and still runs the preceding playable applications.

**Inferred user intent** Deliver an interactive ray tracer with a fair physical measurement that separates where packed arithmetic helps from work shared by both paths.

**Commit (code)** a049420 — Measure matching scalar and PIE ray-traced frames and depth on the playable P4.

### What I did

Verified the previous release at offset 0x10000 and its partition table at 0x8000, then observed its native services, painter and keyboard. Registered the P4 renderer and assembly in the normal port and added `raybench 0..17`. Each command measures both execution modes on one scene and returns control to the scheduler. The host qualification runner exercises F1, V, Right, W and R and exports the normal composited framebuffer. [Native benchmark](../../../../../../picocalc-os/port/esp32p4/main/raybench_p4.c) [Device harness](../scripts/device/02-qualify.py)

### Why

Whole-frame timing includes primary traversal, hit selection, shading, the checker plane and shadows. The intersection-only function writes the nearest depth for every ray and skips shading and RGB packing. An all-zero depth means the ray missed every sphere. Depth equality can detect errors that final colors hide.

### What worked

The prior physical firmware SHA-256 was `33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813`. Its partition table matched `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. The preflight observed eight healthy native worlds, the installed painter, live keyboard transfers and zero I²C/SPI errors. The portable scalar reference emitted exactly 51,200 bytes for the initial pose. [Preflight](../various/device/preflight.json)

### What didn't work

The sandboxed filesystem did not expose `/dev/ttyACM0`. The authorized physical process found the attached serial device at that path and acquired the established serial lock. An early `ruff check` on the new harness identified multiple statements on a single line; formatting the code and renaming the two local mismatch bytes cleared the diagnostics.

### What I learned

The supported moving sphere centers are 32…127 in each dimension. With radius 26 the minimum legal center leaves six pixels visible between the image boundary and the silhouette. This board trial measures the legal endpoint. A viewport-clipped primary sphere is outside the implemented controls.

### What was tricky to build

A measurement that stores scalar and PIE results into different addresses can mix memory placement with arithmetic differences. Each timed mode uses the same 64-byte-aligned PSRAM destination. The first result is copied into a second buffer outside timing. Alternating the order offsets the first or second call's cache advantage. The runner initializes the destinations with different byte patterns so an omitted write does not silently agree.

### What warrants a second pair of eyes

PIE groups and active lanes are reported separately from visible surface pixels. A ray can hit two spheres before depth selection. Counters come from a separate instrumented draw, and the full instrumented frame is compared byte-for-byte to the corresponding untimed reference copy.

### What should be done in the future

Use the eligible image only after the native kernel, CJI compositor and UI are in the same committed build and the full device experiment completes. Preserve numerical regressions as well as improvements.

### Code review instructions

Read `sample_pair`, `run_bench` and `capture`. The golden UI view uses floor(2x/3) and floor(2y/3) for each of the 240×240 display pixels. Check the packed kernel and host scalar stride and endianness against the public contract. The app-only writer always verifies both images and the partition before replacing the previous application.

### Technical details

The physical design has three scenes and six pairs per scene. Each scene has three scalar-first and three PIE-first pairs. The scratch allocations are 51,200 bytes each in external RAM. UART printing, allocation, explicit warmups, equality, CRC and optional counters lie outside timed calls. Kernel per-call geometry setup remains inside its respective timed API. The display crop is (40,32) with width and height 240. Full 320×320 captures have independently checked dimensions, run lengths and CRC.

## Step 2. Exercise PIE, move the scene and leave the qualified firmware running

I built the complete ordinary image at revision `3a67c10e998914c6fd6c036e25ce71f40a19b8a1` with the installed ESP-IDF v5.4.2. Its container includes the previous normal apps and a new Ray Tracer launcher entry. The P4 gate compares actual scalar and PIE frame and depth outputs at the device and the four visible application poses against the portable scalar implementation. The board finishes each successful run on the tested release after flash readback and a fresh boot.

### Prompt Context

**User prompt (verbatim)** See Step 1.

**Assistant interpretation** Deliver an ordinarily launchable demonstration, with measured target instructions, reproducible hardware figures and framebuffer evidence.

**Inferred user intent** Let a person open and manipulate the scene after the investigation, and show whether the optimization paid for the measured work.

**Commit (code)** a049420 records the production integration. e46223b records the research protocol. The integrated source revision includes the prior kernel and UI changes.

### What I did

Used the existing ordinary release recipe to construct a fresh isolated stage. Applied only committed production-source differences in that tree, rebuilt the complete bundled CJI compiler and compositor, checked source digests against Git, and disassembled the final linked firmware to find its broadcast, vector load, signed subtract and vector store. Verified the previous image on the board, wrote the new application only, and checked the application and unchanged partition table after installation and again after the 18 paired trials. [Build attestation](../various/device/build.json) [Device health](../various/device/final.json)

### Why

A host emulation can verify ranges and output agreement. It cannot reveal cache cost or the relative cost of a packed instruction and scalar fallback on the target. Running both implementations inside the same ordinary firmware also preserves the same application placement and normal OS background activity for each pair.

### What worked

Frame medians were 8.5615 ms scalar and 7.4475 ms PIE. Primary-depth medians were 4.107 ms and 2.990 ms. Every paired measurement favored the actual PIE implementation, and the median time saved in both workloads was approximately 1.11 ms. All 18 scalar and packed depth planes and RGB565 frames matched exactly. The screen capture after resetting the scene reproduced the initial viewport, and both intermediate controls visibly changed it. After the last firmware verification and reboot, the ordinary launcher reopened Ray Tracer and the visible body hash again matched the opening. The handheld was left displaying this interactive demo. [Handoff receipt](../various/device/handoff.json)

Four unaltered physical framebuffer captures are indexed with their hashes and view coordinates. [UI evidence](../various/device/screens.json) [Paired measurements](../various/device/summary.json)

### What didn't work

The physical qualification completed on its first attempt. The primary-stage ratio of 1.372× did not carry over to the complete frame, whose paired median ratio was 1.150×. Only 6,983 of 76,800 candidate ray–sphere lanes survived in each scene (9.09%). The legal control endpoint still leaves a margin around the movable sphere.

### What I learned

Only the primary discriminants are computed eight at a time. Material selection, depth, shading and shadow generation continue to execute scalar work. A packed subtract speedup therefore does not predict the ratio of full frame times. Direct timing of both entry points gives each result its correct denominator.

### What was tricky to build

The kernel uses short-lived aligned vector scratch rows and standard row-strided RGB output; the ordinary compositor renders directly into its own back buffer and enlarges the image in place. The independent display check verifies the enlarged result against a tightly packed scalar reference and catches differences caused by either renderer stride or enlargement. The bench's two tightly packed buffers separately isolate rendering from that display procedure.

### What warrants a second pair of eyes

Check that each reported scene groups six pairs with three orders of each kind, that checksums stay constant within a scene, and that moving only the light leaves the primary-depth digest untouched. The timer surrounds geometry preparation as well as traversal inside each tested call. It excludes the SPI panel’s scanout. An exact framebuffer comparison does not independently validate an optical LCD.

### What should be done in the future

A study of the next optimization could introduce row or tile culling and measure the reduction in candidate tests before comparing with this exact release. This particular result leaves about 4.46 ms per packed frame beyond the primary-depth measurement (difference of medians). The two APIs write different outputs, so that difference is a guide to profiling, not an isolated shading timer.

### Code review instructions

Run the host-only summary without hardware from the ticket directory.

```sh
python scripts/device/04-summarize.py various/device/rows.json > /tmp/ray-summary.json
diff -u various/device/summary.json /tmp/ray-summary.json
```

For an authorized physical replay with the prior release installed, use the ordinary build script in PICOCALC-NATIVE-PROMOTION, revision `3a67c10`, ESP-IDF 5.4.2 and the pinned managed components. Then call the checked runner with the resulting SHA and a fresh output directory.

```sh
python scripts/device/05-attest.py /tmp/picocalc-raytrace-release /tmp/ray-build.json
/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/python -B scripts/device/02-qualify.py \
  /tmp/picocalc-raytrace-release/build efc938724492f1de8f2a0911abd05d09e8692b80872f5da707da1f92dd08a0c9 /tmp/ray-physical-replay
```

A rebuild can have a new firmware digest because of embedded build identity. Verify the resulting digest with the first command and pass that value to the second command. The prior release has its own fixed SHA and partition check, and both must match before any write. Build the scalar CLI from the same revision as the firmware. The system serial lock is held for the whole qualification.

### Technical details

A `RAYROW` is emitted per block, with the same scalar-first, PIE-second field order irrespective of execution order. An `intersectionUs` entry times primary traversal plus writing its 51,200-byte nearest-depth plane. A `frameUs` entry times the full RGB565 frame. The scratch buffer setup period is separately reported. The frame/depth CRCs are compared against the host and the scalar/PIE arrays are compared byte for byte directly on the board. Serial logs and raw full-screen buffers remain local. The PNGs are the actual decoded framebuffers, including the operating system border and labels. [Measurement report](../analysis/04-measuring-a-packet-of-eight-rays-on-a-playable-esp32-p4.md)

---
Title: Physical ray tracing investigation diary
Ticket: PICOCALC-RAYTRACE
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/main/raybench_p4.c
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

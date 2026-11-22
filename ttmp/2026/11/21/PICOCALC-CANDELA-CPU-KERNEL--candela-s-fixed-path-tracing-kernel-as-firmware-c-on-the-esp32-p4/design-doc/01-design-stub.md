---
Title: Translate Candela's fixed kernel to firmware C and measure it on the P4
Ticket: PICOCALC-CANDELA-CPU-KERNEL
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - performance
    - porting
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: generate C from Candela's kernel.js (PRELUDE, SPECTRAL, CORE, PATH, POST) at firmware build time, add CPU-specific math, and measure cycles per sample on the ESP32-P4."
LastUpdated: 2026-11-21T23:02:27.081848042-05:00
WhatFor: "Scope, dependencies, risks and acceptance measurement of this follow-up of PICOCALC-CANDELA-P4"
WhenToUse: "Before starting implementation work on this ticket"
---

# Translate Candela's fixed kernel to firmware C and measure it on the P4

## Goal

Candela's fixed path-tracing kernel runs as C inside the PicoCalc firmware, generated from Candela's own `src/kernel.js` when the firmware is built, and its cost per camera sample is measured on the ESP32-P4 rather than estimated.

## Context

The parent design (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`, Sections 3, 4 and 9) decides that the fixed part of Candela's WGSL program (`PRELUDE`, `SPECTRAL`, `CORE`, `PATH`, the GGX table, and `POST`) becomes C compiled by GCC, in f32 on the RV32F unit. The prototype `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/scripts/04-wgsl2cpp.mjs` translates the whole generated program for ten presets; the counting interpreter (`scripts/06-rv32imfc-count.c`) measured 6,100-11,300 RV32 instructions per sample for ordinary presets, and the cycle model (`scripts/14-cycle-model.py`) turns that into an assumed 20,000-47,000 samples per second per core.

## Scope

- A build step that reads `kernel.js` from a pinned Candela version, extracts the fixed sections, and writes C (or C++) with the vector prologue; the per-scene dispatch functions (`evalMaterial`, `hitAlbedo`, `hitEmission`, `sdUser`, `heightAt`, `densityOf`, `customKernel`) become calls through a table that PICOCALC-CANDELA-SECTIONS fills.
- CPU substitutions, each behind a switch and each measured: lazy `select` (already in the prototype), no zero-initialisation of large structs, polynomial `sin`/`cos`/`exp` and a conversion-based `floor` (`CDL_FAST_MATH` in the prototype), an integer hash in place of `fract(sin(...))`, a direction-indexed sky radiance table rebuilt when the sun moves, `pow(x, 32)` as squarings in the denoiser.
- The GGX albedo table computed once on the host and embedded as data.
- A bare-metal or firmware benchmark entry that renders B-01, R-01, L-03 and G-01 at 160 x 160, 1 spp and reports cycles (`rdcycle`) per sample, `fdiv.s`/`fsqrt.s` latency from a microbenchmark, and the instruction-cache behaviour of a 42-55 KB kernel.

Out of scope: the QuickJS world, the bytecode interpreter, display integration.

## Dependencies

- None to start: the scene buffers for tests come from `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/scripts/03-export-scene.mjs` on the host.
- The device is needed for the acceptance measurement; it must be returned to the current playable firmware afterwards (AGENTS.md).

## Risks

- Cycle cost per instruction may be far from the assumed 1.13 (iterative divider, FP stalls, I-cache misses in PSRAM-backed code).
- Fast math changes `sin`-hash noise values; goldens must compare image statistics, not pixels.
- Translator drift when Candela's kernel changes; the build step must fail loudly on unrecognised syntax.

## Acceptance measurement

- B-01 at 160 x 160, 1 spp: measured cycles per sample on the P4, reported with and without each CPU substitution.
- RV32 frames of B-01, R-01, L-03, G-01 at 64 spp within 1% mean luminance of the host build of the same C, and E-02 (deterministic) within 1% on at least 99% of pixels.
- `.text` size of the kernel and its share of the firmware image.

---
Title: Run Candela's unchanged JavaScript front end as a QuickJS world on the PicoCalc
Ticket: PICOCALC-CANDELA-WORLD
Status: active
Topics:
    - picocalc
    - esp32-p4
    - quickjs
    - rendering
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: bundle Candela's modules as QuickJS bytecode in a world with raised memory and turn budgets, memoise the constant GGX table, keep animations and parameters running, and hand programs and packed buffers to the firmware renderer."
LastUpdated: 2026-11-21T23:02:30.544998105-05:00
WhatFor: "Scope, dependencies, risks and acceptance measurement of this follow-up of PICOCALC-CANDELA-P4"
WhenToUse: "Before starting implementation work on this ticket"
---

# Run Candela's unchanged JavaScript front end as a QuickJS world on the PicoCalc

## Goal

A PicoCalc world loads Candela's front end (`candela.js`, `scene.js`, `fx.js`, `compile.js` and their imports) unchanged, runs a scene file from storage, and hands the compiled program's generated sections and the packed buffers to the firmware renderer; animations, behaviors and dynamic parameters keep running in the world.

## Context

The parent design (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`, Section 5) and the QuickJS study (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/reference/02-quickjs-front-end-diary.md`, `various/03-quickjs-front-end.json`) found: all 105 presets build in the firmware's QuickJS with WGSL and diagnostics identical to Node's; `ggxTableWGSL()` is 26.7 million QuickJS steps per compile and must be memoised; loading needs 1.40 MB of heap (32-bit) against a world default of 1 MB; B-01's build is 4-15 ms in host QuickJS, roughly 0.25-0.9 s on the device at the measured factor of about 61; QuickJS ignores `//# sourceURL=`, so user line numbers in diagnostics need the host to compile scene files with a file name.

## Scope

- A bundle of Candela's modules compiled to QuickJS bytecode at firmware build time, read with `JS_ReadObject` as `nucleus/vm.c` does for the prelude.
- The world manifest entry: memory limit (start at 4 MB), turn budget for build turns, stack; the boot-segment or worker pattern for builds longer than a turn.
- Shims: `atob`; a memoised `ggxTableWGSL` (the table is also embedded in the firmware kernel); a scene loader that compiles user files with a file name.
- Host functions: start a render with a program and buffers, update buffers after `pack`, stop; frame-ready events back to the world.
- A subset check that rejects scenes using features outside the verified subset with a Candela-style diagnostic.

## Dependencies

- Firmware host-function plumbing in the nucleus; PICOCALC-CANDELA-SECTIONS for the translator that runs in this world.

## Risks

- The factor of 61 was measured on mostly integer code; Candela's builds are float-heavy and the device's doubles are soft-float.
- `fx.js` `Gen` recursion depth: the 64-bit host overflowed a 56 KB stack on K-09.
- Heap growth across rebuilds (a user editing a scene repeatedly).

## Acceptance measurement

- On the device: module load time from bytecode, B-01 build, compile and pack times, peak heap, and C stack high-water mark.
- All T0 presets build within the world's limits on the device; WGSL and packed-data digests equal Node's.
- A dynamic parameter change re-packs and reaches the renderer within one 50 ms turn for B-01.

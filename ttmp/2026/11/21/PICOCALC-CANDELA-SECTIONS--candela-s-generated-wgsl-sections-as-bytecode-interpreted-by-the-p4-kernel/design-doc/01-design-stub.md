---
Title: Translate Candela's generated WGSL sections to bytecode and interpret them in the P4 kernel
Ticket: PICOCALC-CANDELA-SECTIONS
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: an on-device JavaScript translator from the per-scene WGSL sections (materials, SDFs, heightfields, densities, custom integrator) to a register bytecode, and a C interpreter behind the kernel's five dispatch functions."
LastUpdated: 2026-11-21T23:02:28.504624458-05:00
WhatFor: "Scope, dependencies, risks and acceptance measurement of this follow-up of PICOCALC-CANDELA-P4"
WhenToUse: "Before starting implementation work on this ticket"
---

# Translate Candela's generated WGSL sections to bytecode and interpret them in the P4 kernel

## Goal

Every scene's generated code (Candela's `matCode`, `sdfCode`, `hfCode`, `densCode` and `customKernel`) runs in the firmware kernel through a register bytecode produced on the device from the WGSL text that Candela's unchanged compiler emits.

## Context

The parent design (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`, Section 6) separates Candela's program at the five dispatch functions that `compile.js` generates. A material is evaluated 0.8-1.7 times per camera sample (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/various/10-entry-calls.txt`), and a bytecode interpreter costs about 22 RV32 instructions per bytecode instruction (`various/05-numeric-bench.jsonl`), so materials and fields cost a few percent to about 10% of a sample when interpreted. Translating the WGSL text instead of adding a back end to `compile.js` keeps Candela's sources unchanged, as both earlier Candela ports did.

## Scope

- A JavaScript translator (runs in the Candela world after `compile`) for the WGSL subset the generators emit: function headers, `var`/`let`, assignments to `Lobe` fields, `if`/`else` selection on `u`, calls to kernel functions, vector constructors, swizzles, arithmetic; constant folding; super-instructions `CHOOSE` (stochastic selection) and `LOBE` (write a whole lobe).
- The bytecode format, versioned, with a verifier in C (register bounds, call targets, jump targets) so that a malformed program is rejected before the kernel runs.
- The C interpreter, with built-in operations that call compiled kernel functions (`fresnelDielectric`, `noise3`, `fbm3`, checker, stripes, voronoi) instead of interpreting them node by node.
- A host agreement test over all 105 presets: translate each generated section, interpret it, and compare per evaluation with the C++ translation of the same WGSL on recorded hit records.

## Dependencies

- PICOCALC-CANDELA-CPU-KERNEL for the dispatch table in the firmware kernel (the host test can start without it, on the prototype translation).

## Risks

- User SDFs are called up to 220 times per ray by sphere tracing; interpreted they may cost several samples' worth per ray. Measure, and hand them to native code generation (PICOCALC-TYPED-F32 or a direct emitter) if so.
- Candela's generators may emit new syntax in later versions; the host test over all presets is the guard.
- `fx.js` `Gen` output can be deep for field-heavy scenes; register pressure and program size need limits with clear diagnostics.

## Acceptance measurement

- All generated sections of the T0 and T2 presets translate (list failures by construct).
- Interpreted and compiled sections agree per evaluation to 1e-5 relative on recorded hits; whole-frame mean luminance within 1% at 64 spp.
- Interpreter instructions per sample measured for B-01, F-01, W-02 and one SDF preset, against the compiled translation.

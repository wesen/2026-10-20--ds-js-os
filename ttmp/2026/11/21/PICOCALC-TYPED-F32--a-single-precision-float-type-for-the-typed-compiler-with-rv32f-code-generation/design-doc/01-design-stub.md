---
Title: Add an f32 type to the Typed compiler with RV32F code generation
Ticket: PICOCALC-TYPED-F32
Status: active
Topics:
    - picocalc
    - compiler
    - esp32-p4
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: a single-precision float scalar in Typed (types, literals, arithmetic, comparisons, conversions, Math functions), FP register allocation and RV32F emission, measured against GCC on Candela kernel fragments."
LastUpdated: 2026-11-21T23:02:36.150951578-05:00
WhatFor: "Scope, dependencies, risks and acceptance measurement of this follow-up of PICOCALC-CANDELA-P4"
WhenToUse: "Before starting implementation work on this ticket"
---

# Add an f32 type to the Typed compiler with RV32F code generation

## Goal

Typed programs can declare and compute with `f32` values, and the RV32 back end emits RV32F instructions for them, so that per-scene floating-point code can be compiled to native code on the PicoCalc.

## Context

Typed today has `i32` and `bool` scalars (`picocalc-os/compiler/typed-wasm.js`, `typed-rv32.js`); after RAY-PARITY Step 13 its integer ray tracer runs at 2.11x the time of GCC -O3 C. The parent design (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`, Sections 4 and 6) keeps Candela's fixed kernel in GCC-compiled C and interprets per-scene code; this ticket is the path to native per-scene code where the interpreter is too slow (user SDFs are called up to 220 times per ray). Fixed point in i32 is not an alternative: on Candela fragments it is either wrong (32-bit) or 9-50x slower than f32 and still out of range (64-bit) (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/various/05-numeric-bench.jsonl`).

## Scope

- Language: an `f32` scalar type; float literals; `+ - * /`, comparisons, unary minus; explicit conversions to and from `i32`; `Math.sqrt`, `Math.abs`, `Math.min`, `Math.max`, `Math.floor` (others as calls to firmware routines); `f32` fields in records and buffers.
- Back end: FP registers in the allocator (the split-locals and pointer-home work of RAY-PARITY applies), RV32F encodings, the ilp32f calling convention for calls into firmware, FMA formation where exact.
- The Wasm target as well, or an explicit decision that `f32` is RV32-only.

## Dependencies

- Coordination with whoever is changing `picocalc-os/compiler/` and `picocalc-os/tests/` at the time; this ticket must not start while those trees are being changed by another task.

## Risks

- Register-allocator complexity with two register files.
- Rounding semantics: QuickJS evaluates JavaScript numbers in double precision, so a Typed program that also runs as JavaScript must specify where rounding to f32 happens (`Math.fround` semantics).
- Code size of soft-float fallbacks if any target lacks F.

## Acceptance measurement

- The three fragments of `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/scripts/09-numeric-bench.c` (sphere test, GGX term, safeNorm) written in Typed: results equal to C's f32 results, RV32 instruction counts within 1.5x of GCC -O2.
- A Candela SDF section (from PICOCALC-CANDELA-SECTIONS) compiled through Typed f32 and measured against its interpreted form.

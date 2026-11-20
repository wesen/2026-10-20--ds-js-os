---
Title: Typed PIE investigation diary
Ticket: PICOCALC-TYPED-PIE
Status: active
Topics:
    - compiler
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:09:31.26001152-05:00
WhatFor: ""
WhenToUse: ""
---

# Typed PIE investigation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1 — Match checked numeric operations and emit a guarded vertex prefix

The director assigned this investigation as part of the requested 3D chess painter. I followed the checked buffer operations from the Typed frontend to the RV32 emitter and built a candidate that compiles the same scalar fixture in stock, guarded scalar and PIE modes.

### Prompt Context

**Prompt provenance** — The implementation began from the director's assignment in this conversation. The assignment summarized the user's request for automatic PIE SIMD lowering of a normal scalar Typed 3D Chess vertex loop, and for using it in a delivered painter. The exact top-level prompt was unavailable in this investigation's context.

**Assistant interpretation** — Demonstrate automatic target-specific instruction selection and report its boundaries and measured costs.

**Inferred user intent** — Keep the app source portable and find out where the handheld gains from automatic vectorization.

### What I did

- Read the emitter's checked length/address sequences and scalar control flow.
- Wrote the independent scalar projection, the opt-in backend pass and the experiment staging adapter.
- Added a guarded RV32 comparison with the same proof and runtime preflight.
- Assembled load, store, broadcast, and add/subtract/logical examples using the ESP-IDF 5.4.2 Espressif GNU assembler with `-march=rv32imafc_xesppie -mabi=ilp32f`.
- Cooperated with an independent reviewer on the emitted byte oracle and holdouts.

### Why

The numeric stream has enough information to establish buffer access, loop structure and integer operand ranges without parsing a second language. The guard-and-continuation design keeps the original short-buffer trap behavior and permits a scalar tail.

### What worked

The fixture compiled to 628 bytes stock, 1,416 bytes guarded scalar and 1,384 bytes with PIE. The two optimized modes accepted the same intervals. The PIE body occupies 29 static words per eight vertices, while the guarded scalar body occupies 40 static words per vertex. These include the loop-back sequence. Dynamic instruction and cycle evidence belongs to the qualification steps.

### What didn't work

- `node 03-compile.mjs compile 01-vertices.typed /tmp/typed-pie.bin` first returned `ReferenceError: typedWasm is not defined` at `typed-async.js:15`. The adapter now loads `typed-wasm.js` before `typed-async.js`.
- Espressif GNU assembler rejected `esp.vldbc.16.ip q7,sp,0` and `esp.vldbc.16.ip q7,a6,0` with `Error: illegal operands`. The broadcast uses the encodable s0 register, preserved through an existing stack slot.
- Independent review found that the first matcher admitted writes to the induction slot through a read assignment. It now rejects assignments at or below the induction slot. Independent review also found that two extra stack slots could exceed the scalar frame limit. The prefix now borrows two dead position slots and keeps the stock frame.

### What I learned

Typed's buffer operations trap on unsigned position against the capacity and store by truncating. An apparently simple check for full count can change prior writes if it traps before the original loop. Returning to the existing loop at its original induction position preserves the failure.

### What was tricky to build

A branch to the scalar loop must occur before any vector store or relevant scalar-local change. The plan is constructed before emitting the guards. The ineligible path proceeds through the stock emitter.

### What warrants a second pair of eyes

The proof depends on the exact stack instruction sequence, non-concurrent buffer contents, and strict preservation of the numeric loop's remaining locals. Target review also needs the real PIE task-state path.

### What should be done in the future

Measure the selected bytes on the board and retain the scalar and guarded RV32 baselines.

### Code review instructions

Run the three commands in the design guide. Start at `scripts/02-pie-lowering.js` and compare its matcher to the checked operation sequence in `picocalc-os/compiler/typed-wasm.js`.

### Technical details

The prototype selects up to six buffer parameters, uses an eight-element prefix unit, checks all output-related range pairs including headers, and performs no CSR writes in generated code.

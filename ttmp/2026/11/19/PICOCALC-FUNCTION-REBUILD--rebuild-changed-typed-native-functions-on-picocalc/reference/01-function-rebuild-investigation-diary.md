---
Title: Function rebuild investigation diary
Ticket: PICOCALC-FUNCTION-REBUILD
Status: active
Topics:
    - picocalc
    - performance
    - quickjs
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:54:18.8864934-05:00
WhatFor: ""
WhenToUse: ""
---

# Function rebuild investigation diary

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

## Step 1: Trace source-order resolution and native jumps

I traced frozen typed source from the Files app wrapper into the lexer, function emitter, and native assembly. The production backend already stores unresolved jumps during lowering. The session can retain that intermediate native representation and let the final assembler resolve jumps with the new function order.

### Prompt Context

The verbatim authored brief is preserved in the [lab research brief](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/sources/research-brief.md), under its fourth research question. The supervising experimentalist assigned this lane after the frontend study and asked for a standalone prototype with independent clean oracle, Files or a larger real app, host and device results, diary, design commit first, and explicit edit cases. The intended outcome is a measured result about editing latency and dependencies on a handheld.

### What I did

- Read the research brief, active lab design, frontend results, frozen compiler sources and Files entry points.
- Inspected the prior lab's flash staging, UART parser and guest execution harness.
- Wrote the [intern design](../design-doc/01-compile-one-edited-function-and-rebuild-its-native-links.md) and notified the supervisor about a separate two-boot device image.

### Why

An exact function source span can skip the body lexer safely only when the prior type and layout assumptions still hold. A cached resolved jump can become stale while the callee signature is unchanged. Those facts require separate data in the cache.

### What worked

The compiler cleanly separates source-order declaration validation, structured operations, and RV32 lowering. Files offers a short helper whose real behavior can be observed through the unchanged filename normalization entry.

### What didn't work

No implementation had run at this point.

### What I learned

The parser calls `lex.next()` when accepting a closing brace, so a reused function must perform that same lookahead. This can surface an invalid token immediately after a previously good body. The production streaming backend delays emission errors until after frontend validation, so the production diagnostic oracle remains authoritative if the optimistic path fails.

### What was tricky to build

The frozen frontend accepts only earlier declarations at call sites. Building a full declaration map and using it for all functions would silently permit forward calls. The prototype must produce candidates using the equivalent visibility at each function.

### What warrants a second pair of eyes

Review the lookups made while checking type annotations, field access and calls. Every dependency that changes the original emitter's result must be reflected in the reused fragment's validation.

### What should be done in the future

Implement the staged adapters and run the unchanged and edited cases against the frozen wrapper. Leave physical flash scheduling to the supervisor.

### Code review instructions

Start with `compileFunctions` in `picocalc-os/compiler/typed-wasm.js`, `FunctionCode.call`, `compile`, and `linkSlot` in `picocalc-os/compiler/typed-rv32.js`, then read the staged design and Files wrapper.

### Technical details

The control is `40bcf850a5809ef6d839127869faa952596ed157`. Native calls and local jumps encode a signed 21-bit byte delta in a JAL word. A word in the old image can therefore become stale when only a function's size changes.

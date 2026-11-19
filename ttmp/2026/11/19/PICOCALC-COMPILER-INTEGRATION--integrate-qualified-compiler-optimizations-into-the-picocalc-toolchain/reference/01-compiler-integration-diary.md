---
Title: Compiler integration diary
Ticket: PICOCALC-COMPILER-INTEGRATION
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T17:20:47.426925037-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiler integration diary

## Step 1: Trace the requested merges to the normal compiler entry points

The physical trial established an operand representation using generated research-only compiler bundles. The production firmware shares its frontend between Wasm and native worlds. I traced the actual callers and opened a separate integration ticket to retain that distinction.

### Prompt Context

**User prompt (verbatim):** “ok, merge the first two. Does each have a report?”

**Assistant interpretation:** Integrate the qualified changes, identify their individual reports, and verify the real entry points. I asked which second change the user intended while beginning the common native work.

### What I did

Inspected `FunctionEmitter`, `compileFunctions`, `FunctionCode`, the public exports and the physical trial oracle. Identified unsigned immediates emitted for calls, locals, field offsets and literal stores, as well as signed i32 constants.

### Why

Changing only integer constants would leave other variable-length operands incompatible with the native consumer. Replacing the whole frontend with the generated benchmark file would break Wasm linking.

### What worked

The production source has a common function parser and separate target entry points. The research ticket already contains detailed individual reports and an independently verified physical baseline.

### What didn't work

No implementation failure at this checkpoint. The phrase “the first two” has multiple possible antecedents; I began the shared work while checking the intended pair.

### What I learned

The default `typedWasm.compileFunctions` output also has diagnostic and research consumers that expect Wasm bytes. The native caller can explicitly select a separate representation.

### What was tricky to build

The source scanner must still complete checking all functions before RV32 lowering can reject one. This is one reason to retain buffering.

### What warrants a second pair of eyes

Check how field offsets above 127 and signed 32-bit extremes cross the new interface. Verify mixed native/Wasm firmware remains functional.

### What should be done in the future

Qualify the real merged compiler and record its output and timing separately from the prototype.

### Code review instructions

Start at `typedRv32.compile` and follow its call to `typedWasm.compileFunctions`. Compare the native and byte-mode emitters for every variable-length operand.

### Technical details

The revision at intake is e202e94. The two prior board compilers produced 240,452-byte Editor executables. The numeric-operand experiment held the reactor and register backend constant.

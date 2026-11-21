---
Title: Director investigation diary
Ticket: PICOCALC-SCALAR-BREAKDOWN
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
LastUpdated: 2026-11-21T00:24:59.997217018-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary


## Step 1. Establish the controls

Attribute the physical row speedup to guard hoisting, register retention and empty-row rejection with the same scene and matched controls. I opened this ticket before altering compiler behavior and assigned owners for frontend observation, native lowering, scalar experimentation and physical qualification.

### Prompt Context

User prompt (verbatim): “Alright, implement that an then the scalar breakdown. Diary and design doc and all that. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”

Follow-up (verbatim): “also regarding wasm / rv32 emission, etc...”

### What I did

Read the existing compiler frontend and backend and the prior native frame profiler. Created the two linked research tickets and defined the measurements before implementing changes.

### Why

Instruction counts and hardware time answer different questions. Matching code and observable outputs is necessary before measuring the overhead of a compiler decision.

### What worked

The current frontend exposes a function callback before its operation storage is released. Previous research preserved full-scene references and runnable backends.

### What didn't work

The first login-shell commands produced no output for ten seconds. Running Bash without login initialization immediately returned the working directory, so I continued with that shell.

### What I learned

Function assembly patches relative jumps after lowering. Profiling an earlier instruction buffer would risk mismatched offsets.

### What was tricky to build

The Wasm encoder emits variable-length instructions, while RV32 consumes numeric operand cells. Their offsets need independent coordinate systems.

### What warrants a second pair of eyes

Verify the mapping for optimized operations that consume multiple frontend instructions and the timing denominator for each trial.

### What should be done in the future

Implement the controls, run the differential gates and update this record with the actual results.

### Code review instructions

Start with this ticket’s design and the production typed-wasm.js and typed-rv32.js compiler entry points.

### Technical details

Host instrumentation runs in the ordinary JS compiler. Only the device researcher uses the shared ESP32-P4 during physical qualification.

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

## Step 2. Hold the iteration domain fixed and predict a second kernel

I reviewed the matched experiment, reconciled its frontend and emitted machine ranges with the inspector, and requested an independent paired hardware test of the shadow prediction.

### Prompt Context

The implementation follows both user requests transcribed in Step 1.

### What I did

Froze the controlled arms and the separate empty-row arm. Read the generated standalone backends, their host image digests and the actual fast/fallback range annotations. Recorded a second test on the shadow routine after the forecast was committed at 9d43fba.

### Why

A faster row implementation can execute fewer horizontal tests or pay less per test. Only the latter answers the compiler question at fixed coverage.

### What worked

All four fixed-domain arms visited 76,800 positions in the default frame. Hoisting removed 311,624 guest instructions and register placement removed 662,081 at either setting of the other factor. The held-out shadow prediction matched all 412,994 removed instructions.

### What didn't work

A direct diff of physical addresses would compare unrelated functions after an earlier body changes size. We instead compared per-function operation groups and joined profiles separately against each image.

### What I learned

For the default primary routine 1,290,106 stack accesses fell to 370,265 after changing local homes. Guard hoisting alone did not change that count. Skipping provably empty rows saved another 1,108,770 instructions.

### What was tricky to build

The admission path must transfer to the old checked code before writing any output. Distinct admission conditions apply to the shadow function. Unsupported source edits must keep the ordinary compiler path.

### What warrants a second pair of eyes

Inspect the pre-registered shadow forecast, malformed-input cases, C RGB/depth/object-ID oracle and paired time differences. Check which timers include audit writes.

### What should be done in the future

Retain the specialized implementations as experimental controls while evaluating an inferred proof and a general local allocation rule.

### Code review instructions

Read design-doc/02-reproduce-the-scalar-factorial.md, various/compiler/rows.json, inspection.json and shadow-forecast.json. The physical protocol is in design-doc/03-protocol-for-the-paired-physical-scalar-trial.md.

### Technical details

Host pipeline commits b6cf97c, 9d43fba and dbfb5c4. The physical supervisor reserved the single board, froze the linked images and checked on-device output independently.

---
Title: Director investigation diary
Ticket: PICOCALC-COMPILER-INSPECT
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
LastUpdated: 2026-11-21T00:24:58.894267256-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary


## Step 1. Establish the controls

Explain how a source expression becomes target instructions and identify repeated work using measured execution counts. I opened this ticket before altering compiler behavior and assigned owners for frontend observation, native lowering, scalar experimentation and physical qualification.

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

## Step 2. Record final backend ranges and test artifact identity

The native observer runs around the selected emitter instance. I joined it to the real assembly and wrote the portable host CLI. The first measurement identified a pair of frequently reloaded named locals.

### Prompt Context

The implementation follows both user requests transcribed in Step 1.

### What I did

Implemented final image mapping, instruction decoding, sparse PC profile joining, diffing and hot stack ranking. Committed frontend support in 4709796 and native support in 112c4f1. Added a reproducible, checksummed frame capture.

### Why

Fixups can change a branch or call after the instruction was first emitted. Reading final bytes and validating the image SHA-256 anchors every count to a single machine instruction.

### What worked

The ordinary and observed products matched on both targets. The pinned corpus covered five programs and three diagnostics. A tiny native import retained the original relocation table. The default RGB565 byte checksum was 2f75a8a5.

### What didn't work

The CLI integration test initially failed in the restricted Node child-process harness with spawnSync EPERM. Reran node picocalc-os/tests/typed-inspect.test.mjs with permission to launch its child Node CLI. Both tests passed.

### What I learned

An instruction operating on the stack pointer may store a named local, save a return address or spill a transient expression. The first two shadow loads each executed 67,601 times and refer to sphere and count.

### What was tricky to build

Consecutive source operations can fuse and a fallback can duplicate an operation. I changed diff grouping to preserve every boundary crossed by an actual fused range across either listing. Synthetic regions receive their own group.

### What warrants a second pair of eyes

Source coordinates point to the emitter token. Inspect generated source coordinates when an async rewrite is involved. Dynamic counts apply only to the particular native image and workload.

### What should be done in the future

Use the filter for one function before collecting a whole application. The current design can later accept additional count providers with the same image identity convention.

### Code review instructions

Run bash scripts/02-replay-inspection.sh from the repository root with its full ticket-relative path and an output directory, then inspect the compact receipts in various/director.

### Technical details

The six division groups each fall from 44 to 8 native bytes. Total packer executions fall from 1,740,800 to 1,126,400, while its Wasm body remains 61 bytes.

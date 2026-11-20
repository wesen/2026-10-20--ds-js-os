---
Title: Condition destinations investigation diary
Ticket: PICOCALC-CONDITION-TARGETS
Status: active
Topics:
    - picocalc
    - native
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Chronological evidence for study 2 of the PicoCalc compiler program.
LastUpdated: 2026-11-19T21:54:31.129829354-05:00
WhatFor: ""
WhenToUse: ""
---

# Condition destinations investigation diary

## Step 1: Trace typed condition emission and freeze the experiment design

I traced the Files space-trimming loop through the shared typed parser and the staged native lowerer. I drafted a single-pass parser change that keeps a transient plan for the condition and makes scalar operands use the existing value emitter.

### Prompt Context

**Study specification (verbatim):** “Compile conditions directly to their destinations. Scope A6. For if (ready && hasData()), generate the branches directly. For let flag = ready && hasData(), produce a Boolean value. Verify that calls and traps on the right side occur only when required. Run both backends and test the professor’s ceilings of 547 / 2,611 / 16,210 native instructions for Files, Agenda and Editor.”

The text comes from the user-provided study table. The supervising task assigns this study first, followed by a separate A7 experiment using the measured A6 control.

**Assistant interpretation:** Preserve the typed grammar and direct code generation. Put one transient condition plan into the shared frontend so both output targets receive the same short-circuit structure.

**Inferred user intent:** Establish correctness and measure the tradeoff before combining condition lowering with other frontend and backend experiments.

### What I did

- Read the A6 roadmap, staged compiler artifact and current `FunctionEmitter` and `NumericFunctionEmitter`.
- Identified the statement condition and scalar operands as the only boundaries at which the result-use decision is needed.
- Wrote the proposed parser, branch structure and measurements in the [intern design](../design-doc/01-how-a-boolean-expression-becomes-a-branch.md).

### Why

The current typed frontend uses one expression parser and selects the operation encoding in subclasses. A single change there exercises both targets and retains the parser's current type-checking order.

### What worked

The code trace showed that the staged native backend already understands the necessary Wasm control operations. The proposal leaves the compiler callback and lowerer contract unchanged.

### What didn't work

No implementation or tests were run during this design step.

### What I learned

The outermost position alone does not determine every child use. An equality, computed index, or call argument in a condition can still consume a Boolean value. The test matrix needs witnesses for each.

### What was tricky to build

The Pratt parser's operator loop accepts long left-associated chains, while its recursion limit bounds parentheses and recursive operand parsing. A recursive tree walk would inadvertently introduce a different nesting limit. The design selects iterative output traversal.

### What warrants a second pair of eyes

Check the false destination's depth inside an extra skip block and the handling of a planned left operand that becomes a value at a scalar operator.

### What should be done in the future

Use the measured A6 compiler as the control for both A7 local-placement policies.

### Code review instructions

Start at the design's Files example. Read `FunctionEmitter.expr`, then `FunctionEmitter.statement` and the staged backend's structured branch handler. Follow the test plan for type checking, evaluation order and native size.

### Technical details

The candidate touches `typed/wasm.js` in a disposable compiler lane. The scope-A thresholds are 547 Files words, 2,611 Agenda words and 16,210 Editor words.


## Step 2: Preserve Boolean values and qualify both branch paths on the host

I implemented the transient logical plan in the shared emitter. The plan calls the same numeric-or-byte index emitter for each branch target. A separate replay runner overlays the changed frontend in a copy of the qualified staged checkout so the main and baseline trees can keep serving the other studies.

### Prompt Context

**Study specification:** See Step 1.

**Assistant interpretation:** Verify both targets at the operation level and through the normal Files, Agenda and Editor entry points.

**Commit (design):** `14c544d` — Design the typed condition destination experiment.

### What I did

- Implemented `captureCondition`, `emitCondition` and condition-aware Pratt parsing in `scripts/02-condition-destinations.patch`. Built `scripts/01-stage.py` to reproduce the frozen A5/A6 pair.
- Wrote `scripts/03-verify.mjs` with independent expected results and ordered mutations across nested logical forms, two distinct trap paths and value uses. Added a chain with 2,048 operators and compared the complete retained byte stream of an ordinary Boolean assignment.
- Used `scripts/05-host-replays.py` to run the original 24 cases. Staged the matched P4 image and checked the embedded guest text against independently linked Files and Agenda.
- Read the independent Opus High review. Its suggested one-sided branch rules agree with the implementation and its guidance to record side effects before a potentially trapping operation informed the fixture. The study preserves the existing value materialization and introduces no speculation.

### Why

Checking the result alone cannot show whether a skipped operand executed. Recording digits in a typed record distinguishes exact call order and differentiates aborting inside the selected operand from skipping it.

### What worked

The focused oracle covered 802 cases and 3,208 comparisons between two compiler lanes and two targets. It found 112 cases that correctly trapped. Both streamed and buffered native programs agreed byte for byte. The original host suite passed 24 of 24 checks, and the native instruction counts met all three ceilings. Editor's linked Wasm was 88,025 bytes.

### What didn't work

- The initial scratch `typedRv32.compile(src, [], 256*1024)` invocation hit `SyntaxError: 184:31: unknown function typedSdkView` for Editor. I used the matching 28 imported signatures from the frozen `typed/world.js` for the first host counts and the ordinary world wrapper for the board oracle.
- The first sandboxed run of `scripts/05-host-replays.py` reported 18 failures. Re-running `node ttmp/2026/11/18/PICOCALC-TYPED-APPS--*/scripts/01-check-files-wasm.mjs` in that checkout exposed `spawnSync .../picocalc-os/build/picocalc-host EPERM`; the child actually produced its captured frame and exited with status 0. The same replay script, compiler hashes and disposable checkout recipe qualified all 24 checks with local child execution approved outside the sandbox.

### What I learned

Almost the entire difference between the Stage 3 model and actual A6 code is in Editor. The model predicts 15,969 and the linker emits 15,954 native instructions. Counting bytes in the complete Wasm reactor would have missed which logical values remained, so the receipt preserves the separate `if (result i32)` count.

### What was tricky to build

The current frontend writes ordinary operations as it parses an operand. A raw fragment must be taken from the current tail before parsing the next logical operand. If an enclosing equality needs that fragment's value, the planned Boolean has to write its own structured value before the equality parser emits the right operand. Both branches of the value block must still leave one operand for the equality.

### What warrants a second pair of eyes

Trace an OR nested inside a negated AND next to an early return. Review final relative branch depths and confirm the run-time stack heights match at each void block exit.

### What should be done in the future

Measure the same pinned candidates on the P4, then use the qualified A6 lane as the control in register-home experiments.

### Code review instructions

Run `node scripts/03-verify.mjs <staged-A6-root> picocalc-os/build/typed-world-reactor.wasm`. Inspect the `branch10` and `value10` witness rows for both selected and skipped bounds checks.

### Technical details

A6 produced 516, 2,496 and 15,954 words in the three native programs. The result-producing Wasm if counts were 19, 26 and 61. The compiler input receipt records hashes for both encoders and the world wrapper.

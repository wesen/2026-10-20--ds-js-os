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

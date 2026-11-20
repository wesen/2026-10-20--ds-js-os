---
Title: Register homes investigation diary
Ticket: PICOCALC-REGISTER-LOCALS
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
Summary: Chronological implementation and measurement evidence for study 5.
LastUpdated: 2026-11-19T22:01:20.551098436-05:00
WhatFor: ""
WhenToUse: ""
---

# Register homes investigation diary

## Step 1: Design the assignment policies against the measured A6 code path

I followed a deferred local through the expression stack, a call and a register-returning assignment in `FunctionCode`. The first design establishes two ranking policies and one placement mechanism. That keeps frame layout, the call ABI and result forwarding comparable across candidates.

### Prompt Context

**Study specification (verbatim):** “Keep profitable locals in registers. Scope A7. Start from the qualified A6 backend. Compare a cheap local-use count with a policy that also considers loops and calls. Count the loads removed and the save/restore instructions introduced. Judge the result on physical guest cycles, cold compile time and peak heap. The professor’s Editor ceiling is 14,581 instructions.”

The text comes from the user-provided study table. The A6 application replays were in progress when this design was drafted.

**Assistant interpretation:** Measure two policies on top of the same A6 instruction selection, with register and frame mechanics held constant.

**Inferred user intent:** Determine whether less native stack traffic is worth planning and calling-convention overhead on the handheld.

### What I did

- Read the A7 roadmap and the pinned staged `FunctionCode`.
- Examined the independent Opus review. I incorporated its call-clobber canaries and return-path checks, and used its capped loop weighting with a fixed save/restore charge.
- Proposed a host-only accounting lane plus two compiler variants in the [intern design](../design-doc/01-choose-a-register-home-before-lowering-a-function.md).

### Why

Candidate output should differ by home placement alone. The same lowering machine can run either policy, and a byte-identical instrumented frame lane provides an independent accounting cross-check.

### What worked

The A6 host code accounting supplied a control and an independent model for all three workloads. The backend already has a single exit label and 16-byte frame alignment.

### What didn't work

No A7 code was implemented or executed during this design step.

### What I learned

The staged division-overflow code uses `a0` as scratch. A leaf register assignment makes that assumption invalid. The plan reserves an argument register when the check needs scratch and assigns any affected parameter to a frame slot.

### What was tricky to build

A computed local assignment can skip an instruction only while no pending descriptor still expects the overwritten value. Settling such a descriptor after loading current operands could clobber the scratch registers. The design treats the old read as a reason to keep the ordinary assignment path.

### What warrants a second pair of eyes

Check callee-saved state on every returning branch and argument preservation through nested calls. Review whether any raw operation path bypasses local copy-before-write.

### What should be done in the future

A separate study could compare callee-saved homes with spilling live caller-saved homes only on executed call paths.

### Code review instructions

Read the ABI table from the A7 task, the register plan and the single-epilogue rules. Inspect the import clobber and eight-argument division witnesses before comparing timing.

### Technical details

Stage from A6. The scope-A application instruction ceilings are 517, 2,660 and 14,581. Both candidate policies use `a0–a7` as available in leaves and `s1–s11` in non-leaves, while the existing temporary-register allocation remains fixed.

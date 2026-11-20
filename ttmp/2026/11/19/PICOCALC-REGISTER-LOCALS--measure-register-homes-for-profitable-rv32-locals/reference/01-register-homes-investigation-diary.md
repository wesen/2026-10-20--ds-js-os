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


## Step 2: Preserve pending local values across native writes and calls

I added a pre-scan over one function at a time, plus local register and frame homes. I kept the staged backend's operand registers and call spilling. A separate frame-only instrumentation lane proves the counter attachment does not affect the original A6 machine code.

### Prompt Context

**Study specification:** See Step 1.

**Assistant interpretation:** Apply both policies after the observed A6 host qualification and measure register placement with the same instruction selection and ABI.

**Commit (design):** `772100e` — Design the RV32 register home comparison.

### What I did

- Added the pre-scan, local read/write helpers, assignment forwarding and save/restore frame slots in `scripts/02-register-locals.patch`.
- Added host comparison of compiled functions, frame accounting and emulator checks in `scripts/03-verify.mjs`. Verified return-address and callee-saved state for every internal native call, with a hostile external import and raw deferred local reads.
- Created a three-lane board fixture with the existing Files and Agenda kernels plus Editor's `editorFindMatch`. It walks call edges starting at that operation and confirms only `editorFold` is reachable. It embeds the entire corresponding app image so layout and call displacements are unchanged.

### Why

A separate register policy should change assignment choices while sharing the same ABI mechanics. The frame-only lane gives exact reference load counts. The Editor guest fixture measures an original hot function with its real offsets and internal calls.

### What worked

The focused RV32 fixture matched 29 Wasm cases per lane, including two traps. It preserved the caller state, handled both raw old-value cases and both paths of the hostile import, and produced five and seventeen instructions in `bump` and `countUnit`. The frame-only bytes and import relocations matched A6 on all three apps. Both policies met all app word ceilings.

### What didn't work

No compiler or fixture failures were observed during the targeted A7 verification. The replay wrapper required local child execution outside the sandbox, as discovered in A6.

### What I learned

The policy with the fewest static local loads has more save and restore instructions. Agenda's loop-weighted policy removes 31 additional static instructions overall even with 24 more local loads, which shows why raw local counts and native size are distinct outcomes.

### What was tricky to build

The old `a0` overflow scratch was not a free register in leaf functions after placement. The pre-scan reserves a different argument scratch for division. Separately, checking for older deferred reads before selecting a new output destination avoids consuming the two temporary registers needed by already loaded operands.

### What warrants a second pair of eyes

Verify the one-opcode lookahead still runs after each immediate has been read. Check that the embedded Editor operation uses only the confirmed import-free call closure.

### What should be done in the future

Use physical guest cycles to assess how the extra save pairs balance dynamically against removed frame loads. Preserve the same fixed executable reservation across physical candidates.

### Code review instructions

Run `node scripts/03-verify.mjs <A7-stage-root>`. Compare the instrumented `frame` lane's SHA-256 against unmodified A6, then examine the `staleSpill`, `signedLeaf` and `hostile` witnesses.

### Technical details

The static Files, Agenda and Editor counts were 395, 2,130 and 12,725 with use counts, and 392, 2,099 and 12,748 with loop weighting. The emitted register save and restore instructions total 1,278 and 1,112 in Editor.

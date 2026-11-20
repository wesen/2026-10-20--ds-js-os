---
Title: Register homes investigation diary
Ticket: PICOCALC-REGISTER-LOCALS
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


## Step 3: Compare the RAM and cycle results on the same ESP32-P4

The supervisor ran the three-lane firmware after the earlier board studies. Both independent register policies compiled and ran the original Files and Agenda guest functions and the import-free Editor search closure. The ordinary native launcher loaded the loop-weighted Editor lane.

### Prompt Context

**Study specification:** See Step 1.

**Commit (code):** `df67c87` — Compare two RV32 register placement policies against A6.

### What I did

- Validated two boots, 108 cold compiler builds, and 288 checked guest batches using the firmware digests, independent ELF oracles and expected values.
- Compared the Editor operation's raw app text and the exact embedded firmware payload. The closure is `editorFindMatch` and `editorFold`.
- Recorded per-boot paired differences for time, QuickJS peak allocation and guest cycles in [the results](../analysis/01-what-register-homes-save-in-a-picocalc-function.md).

### Why

Holding locals in registers has compiler and execution consequences. Both policies were timed against the same A6 source, native reactor and CPU clock.

### What worked

All three guests ran faster under both policies. Editor's checked match went from about 9,780 cycles to 5,740. The use-count compiler added 199–201 ms to cold Editor builds and reduced the peak by 196,806–196,812 bytes. The loop-weighted policy added 213–217 ms with a similar peak reduction. Both policies stayed below all three native ceilings and restored the original app after the board run.

### What didn't work

The loop-weighted policy did not establish a meaningful Editor guest-cycle advantage on the checked operation. Its Agenda weekday cycles fell an additional several percent relative to A6 when compared with the use-count change.

### What I learned

Editor search selected effectively the same repeated locals with both rankings. Most of its gain comes from moving the hot loop's loads and stores into registers. A low-use parameter in the weighted candidate still lives in its frame.

### What was tricky to build

The application image has imported call placeholders, but the selected Editor operation must execute unchanged raw instructions. The host verifier follows its direct call edges and rejects any reached relocation. That permitted retaining all app offsets and emitting only word-aligned exact text.

### What warrants a second pair of eyes

A reader should distinguish matched physical cycle batches from the emulator's instruction and load counts. The Agenda win measures weekday calls on eight fixed dates and should retain that denominator.

### What should be done in the future

Use both the stable Editor code-size result and the measured compile-time difference when selecting the placement policy for a combined compiler.

### Code review instructions

Read `various/physical-summary.json` and check the paired keys against `various/physical.json`. The P4 build wrapper stages data in an isolated tree and `scripts/07-board.py` verifies the embedded Editor bytes before flashing.

### Technical details

Two boots, six three-lane compiler blocks per boot, three 128-call kernels in 16 measured blocks per boot at 360 MHz.

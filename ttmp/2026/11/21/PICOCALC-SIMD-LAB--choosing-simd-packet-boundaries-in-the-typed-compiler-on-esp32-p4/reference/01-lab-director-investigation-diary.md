---
Title: Lab director investigation diary
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T16:32:45.906588103-05:00
WhatFor: ""
WhenToUse: ""
---

# Lab director investigation diary

## Step 1: Freeze the workload and assign measurement ownership

I divided the study into ray kernels, trace evidence and physics workloads. One operator owns the board. I own the preregistered selection study and publication review. Every lane has a separate scratch checkout and its own stateful REPL session.

### Prompt Context

**User prompt (verbatim):** [Research commission](../sources/research-commission.txt). The subsequent six numbered experimental assignments are tracked individually in the design and task list.

**Assistant interpretation:** Run the experiments, build usable compiler evidence and test on actual hardware. Commission actual Opus High investigators and independent review.

**Inferred user intent:** Determine how effectively the compiler chooses a boundary between vector and scalar operations, including on a previously untimed workload, and preserve reviewable methods for students.

### What I did

Created the docmgr ticket, assigned isolated researchers, checked the existing emitter and public API, and froze a cost rule and a held-out collision workload before any new timing data. The implementation and preregistration are under scripts/director and design-doc/05 respectively.

### Why

Comparing two source algorithms, memory layouts or different iteration orders would conflate the compiler with the algorithm. Identical-output controls and a held-out benchmark make the scope of each result explicit.

### What worked

The board operator identified the board outside the restricted device namespace. Prior captures and source explain the existing aligned eight-lane producer, scalar consumers and signed boundary.

### What didn't work

A shell expansion in the initial sandbox probe produced `zsh:1: no matches found: /dev/ttyACM*`. The board operator checked the actual host node and USB identity; this failed probe was insufficient evidence about device availability.

### What I learned

A packed emitter already exists behind explicit compile options. Its per-function operation stream has enough information to test a small selection rule without duplicating the parser.

### What was tricky to build

The cost rule needs a prior for an unknown trip count. We fix it to 32 and deliberately include inputs of length three that can never fill a packet. The experiment can expose the consequence of that decision.

### What warrants a second pair of eyes

Board file identity, trap prefix, the range where signed saturation preserves meaning and whether packet population measurements describe real dynamic execution.

### What should be done in the future

Implement the frozen selector and run its generated images, qualify the evidence provider and the three independent reports before publishing.

### Code review instructions

Check the cost weights and unknown-bound convention in scripts/director/selector.js against the premeasurement commit. Check each study’s fixture and timing boundary independently.

### Technical details

The current ray code has a contiguous input producer but irregular table consumers. The original board physical observations are six matched blocks per pose. New measurements use independent trials. Sources consulted include LLVM VPlan, Espressif’s PIE introduction and Erin Catto’s SIMD Matters.

## Step 2: Compile the held-out experiment and measure two packet boundaries

The frozen cost rule now drives the native backend through an opt-in per-loop callback. The first experiment on the held-out collision function compiles each ordinary, grouped scalar, grouped PIE and selected image independently. The host compares selected and forced output bytes. The board checks the result of every timed call and separately recompiles the same sources in fresh QuickJS runtimes.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Decide how much of a proved loop should execute as packed operations and verify the choice with identical inputs. **Inferred user intent:** Treat host predictions and P4 outcomes as separate research evidence.

**Commit (code):** `acbb1ec` freezes the selector; `9a1ff99` adds the streaming compiler hook and fixture builder.

### What I did

- Added a selector callback after the original structural proof. Applied it before constructing the packet emitter. A rejected predicate or a stock selection leaves an ordinary native body. Tested both streaming and buffered frontends and equality with every forced image.
- Wrote a squared interval penetration function. Compiled three versions with distinct compile-time knowledge of the number of bodies. Generated the exact assembly for direct physical calls and independent Wasm expected values. Measured fresh on-device compile time with the production QuickJS source, an SPIRAM allocator and a separate runtime for every observation.
- Checked the vendor assembler spellings for horizontal unsigned minimum and maximum and an immediate lane extraction. Implemented experimental emitters that skip all-miss packets and keep eight full-hit results in a vector register until their scalar checked continuation consumes them in order.
- Independently ran the 160 opening rows and pathological capacity, tail, upper-half and observable write cases. The evidence researcher independently instrumented the actual emitted addresses. On opening, 2,111 empty packets predicted 16,888 avoided scratch loads; the measured reduction was exactly 16,888. The 742 full packets predicted a further 5,936 removed scratch loads, also observed.
- Supplied physical frame and dynamic length follow-up harnesses after the first data. The new gate returns directly to the ordinary scalar routine for input lengths below eight. Its thresholds and new lengths were chosen after the preregistered result and belong to a separate experiment.

### Why

Guest counters and a source proof establish mechanism and semantics. Full-frame timing checks application relevance. The exact same register extraction can improve a hot inner loop yet cost enough instruction memory to lose on a larger workload.

### What worked

For the three held-out source variants the selected raw images matched forced PIE byte for byte. The first physical selector trial agreed with its expected mathematical result across all 270 timed observations. Every one of the 48 cold compiles produced the expected fingerprint and length. At three dynamic iterations, full packets could not execute and the static prior chose a slow path.

### What didn't work

The first assembly probe used `esp.min.u16.a t6,q1` and gave `illegal operands`. The accepted spelling places the vector first. A first assembly export emitted an unmatched `.option pop`; the operator balanced it while staging and I corrected the generator. Both versions generated identical row instruction bytes. The first protocol reviewer client received a list of CLI events and attempted to read it as a single result; it failed with `TypeError: list indices must be integers or slices, not str`. The commissioning script now selects the final public result and records a copy for recovery.

### What I learned

The frozen policy picked PIE on every evaluable collision fixture, so agreement on 12 of 15 cells gives it the same predictive power as always asking for PIE here. Its worst observed excess was 24.08% over the fastest median. The same result provides a concrete, separately testable runtime versioning hypothesis.

### What was tricky to build

In the fully hit path the loop body may read the current source induction variable and may trap after a visible write. Duplicating the continuation requires storing each new induction value before the next copy and preserving the order of individual checked accesses. Testing only final pixels would miss incorrect partial state on a trap.

### What warrants a second pair of eyes

Check that each pose comparison pairs by block and reports physical units. Check effects hidden in a solver batching change. Check the distinction between physical time for a held-out collision kernel and the complete time required by the full application.

### What should be done in the future

Verify actual full frames and the runtime length sweep, and preserve the negative selector result even if the follow-up succeeds.

### Code review instructions

Start with the fixed selector and its unit tests, then the ticket's director image and scoring programs. Study the separate evidence collector when reproducing PC totals. The classification trial patch is preserved against a specific base revision.

### Technical details

The baseline, empty and full opening rows execute 3,131,435, 2,983,602 and 2,954,486 guest instructions respectively. The row occupies 1,688, 1,712 and 4,064 bytes. Full uses immediate extraction for eight known active lanes. The full-frame follow-up has independent output-plane hashes generated by WebAssembly on the original twelve inputs, including two nontrivial strides.

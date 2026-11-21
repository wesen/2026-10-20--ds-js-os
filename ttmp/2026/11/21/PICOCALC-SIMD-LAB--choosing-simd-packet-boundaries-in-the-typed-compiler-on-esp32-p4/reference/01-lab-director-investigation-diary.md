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

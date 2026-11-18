---
Title: Implementation diary
Ticket: PICOCALC-CJI-TRIE
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T15:11:54.064674293-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1 — Define the independent experiments

The STATIC investigation measured repeated stores and dynamic reads in the compiler. I created a separate ticket before changing the compiler and specified the identity-preserving and typed-copy experiments.

### Prompt Context

> Ok, write up a detailed document and research algorithms if necessary or whatever, then implement and benchmark and write up and report conclusion  when done.
>
> New subagent:
> - research and plan
> - write a design doc
> - implement and benchmark
> -  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
>  Commit and push the bsidian vault when done (go-go-parc vault).
> - report back to main

**Assistant interpretation.** Measure incremental improvements over guarded scheduling. **Inferred user intent.** Reduce the real wait on the board and publish a reproducible technical account.

### What I did

- Read the existing guarded bootstrap, printed SLIR and source for range-state operations.
- Studied persistent data structures and the direct array specialization obligations. Added a diagram, design, algorithm and validation protocol before implementing changes.

### Why

An unchanged path can be reused in full. A changed path still needs a node copy and can benefit independently from knowing its array layout.

### What worked

The research ticket already provides independent caller counts, source counts and reference IR for both target applications.

### What didn't work

No experiment has failed at this checkpoint.

### What I learned

The root-holding state record must stay mutable for exception handling. Reusing immutable nodes is a separate decision.

### What was tricky to build

A private dense copy may materialize missing slots as undefined. The trie observes slot values by reading. A general array implementation would need to preserve other observations as well.

### What warrants a second pair of eyes

Verify that every reachable node is an ordinary 32-slot array and that the compiled loop actually uses a typed element read.

### What should be done in the future

Bootstrap the three variants and compare them with the exact guarded baseline.

### Code review instructions

Review trieSet and tableOf in the imported ranges.js, then read the design's two independent proof obligations.

### Technical details

The fixed fanout is 32 and five bits choose each slot. The control is the 8 MiB guarded headless compiler. Other agents own current board captures.

### Step 1 follow-up — Observe persistent states

Commit 400b484 records the pre-implementation design. Script 01 now creates isolated edits for reuse, typed copying and both in the guarded source. Script 02 bootstraps each with the unchanged stage 0. Script 03 directly exercises the real trie closures at one, two, and three levels, checks both original and divergent branch snapshots, then compiles Agenda and checks every emitted byte. All three candidate sources passed. On Agenda, path reuse eliminated 197,158 copies along changed or unchanged paths, from 496,705 to 299,547. The underlying workload still performed 490,367 writes. Copies count tree nodes touched, which can exceed one per store. The typed-only variant performed all 496,705 original copies.

## Step 2 — Bootstrap, inspect and qualify the executable variants

Commit 486a4a5 contains the controlled source modifications. All three variants bootstrapped with unchanged stage 0. I inspected the generated loop and timed the actual Linux stage 1, then built three images for the board.

### Prompt Context

See Step 1. The goal is a reduction in elapsed physical compile time while retaining identical emitted application modules.

### What I did

- Used scripts 02–04 to create and time four images with identical input and caps. Added script 08 to extract both the compiled clone and its typed read helper and verify that neither contains a dynamic subscript or numeric boxing call.
- Linked the actual device prelude against the combined compiler's output for every supported catalog source. Ran the existing capped control check for the two rejected sources. Replayed the existing Files sidecar in strict mode.
- Rebuilt each candidate's P4 app image by substituting its stage-1 object into the ordinary verified tool link. Restored the ordinary local CMake build and kept immutable copies of the three application images.
- Published the initial intern guide as “CJI Intern Guide - Persistent Range States and Typed Array Copies.pdf” under /ai/2026/11/18/PICOCALC-CJI-TRIE.

### Why

The compiler source may look typed while its bootstrap emits a generic helper. Inspecting the actual generated access and comparing the independently linked modules validates both the intended mechanism and application behavior.

### What worked

All combined catalog modules matched their 20 independent ELF hashes. Calc and Sandbox retained the expected capped failures. Strict Files proof replay checked all three entries. The P4 Flaky smoke passed on the combined image. All native timing specimens matched reference SLIR.

### What didn't work

Compact native frontend medians vary with workstation activity. Some individual guard and candidate measurements overlap substantially. Deterministic instruction counts and board measurements are needed before selecting a variant.

### What I learned

The typed read calls a specialized helper with bounds checks and direct eight-byte addressing. The checked helper is the code that matters, even though it is outside the short clone body itself. A single optimized Agenda run can have a higher recorded live peak despite fewer collections: the peak metric samples live objects at collection boundaries, whose positions change with allocation patterns.

### What was tricky to build

Firmware image construction changes the working ESP-IDF configuration while substituting the compressor payload. Script 06 verifies the original tool identity, takes immutable snapshots and resets the local build directory on exit. Its changes are independent of the serial flashing script.

### What warrants a second pair of eyes

Compare the accepted program digests, cap and condition on each physical receipt. Revisit the control if a future run enables peripherals. Native and P4 metrics cover different processors and code generators.

### What should be done in the future

Inspect each physical result, the original harness and the fixture differential. Measure exact host instructions for all four builds.

### Code review instructions

Start with `various/typed-copy.slir` and compare the reference generic slice in STATIC's guide. Inspect the four separate per-round measurements in `various/native-trials.json`. Run the linked catalog checks with script 05.

### Technical details

Compared with guarded Agenda, reuse reduced the number of collections from 255 to 240 while the sampled live peak increased from 5,728,200 to 6,096,360 bytes. The typed-only run preserved the original counts and peak. The board control was the parent's same-session guarded headless build; it produced the verified Agenda module in 544.293 seconds.

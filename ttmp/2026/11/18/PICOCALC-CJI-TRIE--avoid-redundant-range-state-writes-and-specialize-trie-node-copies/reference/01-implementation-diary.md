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

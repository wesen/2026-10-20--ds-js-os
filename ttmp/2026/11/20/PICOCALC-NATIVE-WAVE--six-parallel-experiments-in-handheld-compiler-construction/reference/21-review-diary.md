---
Title: Independent scientific review diary
Ticket: PICOCALC-NATIVE-WAVE
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/reference/20-independent-scientific-review.md
      Note: Findings and release-trial decisions from the independent audit.
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/scripts/director/heldout/01-burst-oracle.mjs
      Note: Original numerical oracle replayed from the maintained compiler.
ExternalSources: []
Summary: Chronology of the raw-timing recomputation, control comparisons and review of the six decisions.
LastUpdated: 2026-11-20T19:24:21-05:00
WhatFor: Reproduce the audit and identify which future device measurements could change the decisions.
WhenToUse: When revisiting this independent review.
---

# Independent scientific review diary

## Step 1. Establish which hardware clock each result uses

I began with the director’s synthesis and the raw receipts, then followed the clock call sites into the maintained firmware. The same `p4_typed_compile` function serves the experiment and the ordinary apps. The callers supply different start times and deadlines. I relayed this distinction to the director before writing the memorandum.

### Prompt context

The user’s research-organization question, as recorded in the [director’s original entry](01-director-investigation-diary.md), was “can we parallelize the research?” Their subsequent instructions in that entry included “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill”. This role was delegated by the director. The direct assignment began “Act as independent scientific supervisor for six Opus High compiler studies, not a seventh implementation researcher (user requested independent Astra supervision).” I interpreted it as a request to audit the claims and send actionable factual corrections from the existing evidence. The review used repository material and a local host replay.

### What I did and why

I read `scripts/01-bounds/board.c`, `typed_p4.c`, `editor_p4.c`, `chess_p4.c` and the native probe drivers. I checked the actual start and stop sites because “cold compile” can include boot, opening an app, reading assets, creating an engine, generating code or launching the result.

### What worked and what I learned

The probe gives each call a fresh QuickJS engine and a 9 s timeout, with the app source and reactor already read. The app loaders start before those reads and use 6 s. The experimental stock arm also loads the enlarged compiler bundle. The allocator hook reports live usable allocation bytes at its high-water mark. I recorded these boundaries alongside the effect estimates.

### What did not work and what was tricky

An initial directory search, `rg -n 'MALLOC_CAP_EXEC|heap_caps_aligned_alloc|port_exec|heap_caps_malloc.*EXEC|executable (memory|heap|allocation)' picocalc-os/port/esp32p4/main picocalc-os/native`, returned `rg: picocalc-os/native: No such file or directory (os error 2)`. I located the actual component with `rg --files picocalc-os`. Its header describes loading ELF code into PSRAM and the playable profile enables `CONFIG_ELF_LOADER_LOAD_PSRAM=y`. The native benchmarks instead call flash-mapped functions directly.

### Review instructions and follow-up

Compare the callers’ `started` argument with the placement of `p4_bundle_read`; inspect the native loader configuration when transferring runtime claims to hardware. The ordinary loader and first usable app response are the remaining integration endpoints.

## Step 2. Recompute block-level effects and review the six decisions

I grouped the original rows by their recorded experiment, matched arms within blocks and compared the two semantic treatments directly. A comparison against a common stock arm can obscure a tie between two treatments. I then replayed the frozen stock oracle and reconciled the numerical results with the coverage and stop decisions of each study. The first substantive corrections and the direct-pair result went to the director as they were established.

### Prompt context

See Step 1. I treated the reported effects as descriptive measurements of this workload and kept the independent decision separate from the original investigators’ interpretations.

### What I did and why

From the ticket root, a local Python calculation indexed `various/director/physical.json` by `(block, endpoint, arm)`, required 231 unique keys and checked each timed checksum against stock in the same block. For each of the 21 arm/endpoint cells I compared the recalculated median time and median percentage change with `paired-results.json`. For the cold results I verified the observed six-arm rotation from file order, checked all 59 recorded status values, and analyzed the first four complete blocks per app. For Chess search I recalculated each frameless comparison from the three repetitions per configuration.

### What worked

All 21 telemetry cells reproduced. Across 11 blocks the median of selected time minus all-late time was 0, 0 and +10 µs for parse, count and label. Cold reductions for all-late were 8.685% and 43.017% for Editor and Chess. Using the surviving fifth pair gives 9.031% and 43.094%. For search, the five frameless reductions rounded to 7.108%, 7.115%, 6.857%, 7.793% and 7.371% in receipt order. A fresh run of `node scripts/director/heldout/01-burst-oracle.mjs` from the repository root using the ticket-relative script path and a temporary JSON output reproduced the complete `control` object in `heldout-lock.json`. I separately hashed all five committed input files.

### What did not work and what was tricky

The first cold capture lacked the fifth Editor bounds-selected sample and its combined completion marker. No numerical replacement was needed. Restricting the main table to four complete blocks leaves both stock/all-late fifth pairs available for a sensitivity check. The seven-arm telemetry receipt has its own explicit completion and hardware identity. Its stock-repeat control did not justify pooling the two experiments or extrapolating the physical speedup to a relocated PSRAM world.

### What I learned

The current Chess selector misses a profitable 1,139-cell function because the entire budget is 640 cells. A different proof engine on an older Editor supplies a second counterexample. The fragment oracle independently agrees on six reuse sets. The stack checker breached a registered admission criterion. Lifetime inferences require the actual world validator’s type restriction. These findings merit different actions even though all came from the same set of project studies.

### What warrants a second pair of eyes and future work

The physical edit study times a resident compiler call. Confirm its timer and same-block comparisons independently when the receipt arrives. The exploratory combined-arm experiment will need a new physical comparison against its own stock arm and a separate statement about performance in the ordinary loader. The original counts and claim limits appear in the [review memorandum](20-independent-scientific-review.md).

### Review instructions and technical details

For timing, compute `median(100 * (stock_us - candidate_us) / stock_us)` on matched blocks. For the direct treatment comparison, use `median(selected_us - all_late_us)`. Use the ordered first-capture rows to identify the six-arm round per app. Compare the frozen host summary as a parsed object, including code, source and ordered-case hashes. Use the study receipts linked beside each decision in the memorandum.

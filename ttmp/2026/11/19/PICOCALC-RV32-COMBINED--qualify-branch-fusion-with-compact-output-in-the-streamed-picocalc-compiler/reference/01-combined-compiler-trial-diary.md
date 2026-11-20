---
Title: Combined compiler trial diary
Ticket: PICOCALC-RV32-COMBINED
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
Summary: ""
LastUpdated: 2026-11-19T20:00:41.909133773-05:00
WhatFor: ""
WhenToUse: ""
---

# Combined compiler trial diary


## Step 1: Freeze the integration question

The earlier work measured individual candidates on Editor and kept the production backend intact. This trial adds the missing combined cell and exercises all three ordinary native compile entry points. I chose a single experimental firmware and two independent boots for a controlled replication.

### Prompt Context

**User prompt (verbatim):**

> My recommendation is to advance branch fusion and compact output to a combined integration trial, consistent with your preference for memory savings. Their interaction is still unmeasured. Production continues to use streaming. The original board firmware was restored and Files, Agenda, and Editor all booted natively.
>
> ^-- and we want to do that, and I guess it's otherwise all written up, right?

**Assistant interpretation:** Perform the joint trial and identify whether prior writing already covers the separate mechanisms.

**Inferred user intent:** Make an evidence-based integration decision for the physical device while preserving streaming.

### What I did

Created the integration ticket. Read the two generator implementations and the existing physical receipts. Traced the real Files, Agenda and Editor C wrappers before specifying the experiment. Started a new read-only factory backup.

### Why

Reusing the earlier board digest as the only backup would assume that the board had not changed. Evaluating only Editor would hide a possible fixed storage cost for smaller programs.

### What worked

Both individual experiments expose deterministic generators against revision `6426798`. Compact’s transformation accepts RV32 compiler source as input. This supplies a direct composition point for the branch candidate.

### What didn't work

No failure observed in this design step. Previously measured direct-output numbers describe a different linker path and cannot answer this trial.

### What I learned

Agenda already owns the correct source concatenation and compiler budget. Calling its bundled compile implementation preserves both.

### What was tricky to build

A complete ELF can differ legitimately between branch settings. The storage setting must preserve byte identity within each branch setting.

### What warrants a second pair of eyes

Check that ordinary native loads use the combined configuration and that all timed measurements exclude verification hashes.

### What should be done in the future

Measure both boots and record a disposition per workload.

### Code review instructions

Read the four-cell table in the intern guide before inspecting the runner or aggregating observations.

### Technical details

The experiment’s code baseline is the same as the independent wave. The project checkout starting this trial was `fc817d6`.

## Step 2: Compose the two transformations and qualify the integration on host

The combined RV32 source has SHA-256 `98bbf02d394d81dd9b4dedc4bf5409c120d0d2ab238b11a56e06b801ec8eebfb`. I applied the earlier compact generator to the actual fused backend. The remaining compiler and linker scripts are identical across all four treatments.

### Prompt Context

**User prompt:** see Step 1. **Assistant interpretation:** Validate the integration itself. **Inferred user intent:** The combined compiler should preserve both ordinary app behavior and the storage-only identity guarantee. **Commit (design):** `a04c35a`.

### What I did

- Staged frozen compiler sources and created a new isolated IDF port. The experimental C selector changes only the path used to evaluate the backend. All four script paths have equal length. The default selector in this image points to the combined backend.
- Ran both differential suites, six complete guest workflows and the previous independent storage-boundary and diagnostic suite with fusion held constant. Built a separate oracle against the actual IDF reactor ELF for each application.
- Verified raw program bytes, raw metadata and complete ELF identity between base/compact and branch/both, including the buffered option on host and immutable input templates. Created an inclusive wall-time and QuickJS usable-byte comparison using the production wrappers.

### Why

Fusion legitimately changes the program’s machine words. Comparing compact output against an unfused byte oracle would reject correct changes for the wrong reason. Freezing fusion on both sides tests the storage transformation with its new instruction layout.

### What worked

The combined compiler passed 1,343 differential cases, including 24 traps. The independent examiner exercised 637 normal cases plus six trapping executions with Wasm as an oracle. All six guest workflow outputs matched. The cross-chunk test placed a prologue at word 1,023, crossed word 1,024 and preserved 139 relocations and ordered diagnostics.

### What didn't work

No qualification failure occurred. The earlier boundary harness hard-coded the unfused reference. I parameterized that one reference in a disposable copy, preserving its generator, assertions and diagnostic expectations.

### What I learned

The combined and fusion-only configurations emit identical ELFs for all three apps. Added storage costs or savings therefore affect the compiler; the generated application has the same instructions.

### What was tricky to build

The three app wrappers set up their inputs differently. The scratch C hook calls existing implementations, including Agenda’s internal bundled compilation, and leaves allocation limits in those wrappers. The public raw API still hands the linker a contiguous image.

### What warrants a second pair of eyes

Check the factor ordering in the interaction contrast, and compare individual physical rows with same-block controls. Shared CPU time and a fixed Files→Agenda→Editor order can influence very small timing changes.

### What should be done in the future

Complete both physical runs, check native loads and framebuffer replay, and report effects per application.

### Code review instructions

Read `scripts/01-stage.py`, `scripts/02-trials.c` and `scripts/05-oracle.mjs`. The recorded differential, examiner, boundary and guest results live under `various/`. `scripts/04-host.sh` and `scripts/07-boundaries.py` reproduce those checks.

### Technical details

The six guest inputs cover Files, Agenda and four Editor workflows. The branch and combined raw outputs occupy 738, 3,784 and 20,507 words for Files, Agenda and Editor. Full linked size stays fixed within each app.

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

## Step 3: Measure the interaction across three app sizes

The four configurations ran in the same firmware using the current physical reactor for each app. Four matched blocks on each of two boots yielded 96 timed builds. All 96 ELF digests agreed with their host oracles. The largest workload benefited most in latency, while the smaller two increased in peak allocation.

### Prompt Context

**User prompt:** see Step 1. **Assistant interpretation:** Evaluate the combination under the current memory preference. **Inferred user intent:** Establish what a production default would cost across apps. **Commit (implementation and host evidence):** `86ab560`.

### What I did

Validated every serial start/end marker, streamed-mode announcement, timer/heap record and output digest. Calculated the two-by-two interaction within each block. Plotted matched differences for the two boots. Re-ran evidence inspection after the assistant server restarted and found the detached firmware job still running on boot two.

### Why

A second boot helps distinguish stable resource differences from timing variability. Peak heap can move between compiler phases, so comparing sums of separate savings can give a poor prediction.

### What worked

The combined candidate completed faster in all eight paired comparisons per app. The two boots showed about 2.8 KB less peak allocation for Editor and about 18–19 KB more for the smaller apps. Each was within its original production compile limits.

### What didn't work

An interim ad hoc regex that required three consecutive UART lines found 42 first-boot measurements and raised `AssertionError` when passed to the summarizer. Independent OS log lines may arrive between the markers. The committed board parser associates lines between explicit begin/end markers, matched all 48 first-boot and 48 second-boot rows, and verified every digest. The restart needed no board intervention.

### What I learned

For Editor, the memory interaction was about +25 KB relative to the prediction that the separate savings would add. The clean data identify the total peak; they cannot locate its cause within the combined runtime. Files and Agenda had the lowest peaks with the production control.

### What was tricky to build

Checking a combined branch/storage change gives two valid digests per application. Grouping receipts by instruction-selection setting is essential. Each block must contain every lane and each lane must occupy all four positions over a boot.

### What warrants a second pair of eyes

Keep the signs explicit. The summary JSON expresses savings as control minus both. The figure uses candidate minus control on both axes. Median paired savings and differences of medians need not agree.

### What should be done in the future

For a memory-first rollout, evaluate the smaller-app fixed overhead before adopting a global default. Frontend attribution is the next cold-latency investigation.

### Code review instructions

Trace each `rows` entry from `scripts/06-board.py` through `scripts/08-summarize.py`. Use `scripts/09-figure.py` to regenerate the plot. Compare complete hashes within each storage pair.

### Technical details

Each full block measured Files, Agenda and Editor on all four compiler variants. Boot 1 and boot 2 median times saved for Editor were 95.126 and 88.267 ms respectively. The corresponding peak reductions were 2,768 and 2,888 usable allocator bytes.

## Step 4: Verify restore, publish the article and retain a portable guide

The native 64 KiB Editor replay completed, removed its scratch document, and yielded two matching reference captures outside the status clock. The flasher verified the restored factory contents, and the production machine reported Files, Agenda and Editor running natively with an empty last error. I published the combined results in the vault and preserved the exact hardware receipts and a standalone reader PDF in the ticket.

### Prompt Context

**User prompt:** see Step 1. **Assistant interpretation:** Complete the trial, restore the machine and make it readable alongside the individual studies. **Inferred user intent:** Keep a learning and decision record that is accessible from the project index and the vault.

### What I did

- Preserved the full measurement receipt and two measurement-only UART extracts. Rebuilt the paired summary from the finalized receipt and compared it byte for byte to the plotted input.
- Published the article and its two figures to go-go-parc main at `ded463fd50ead0a38f6b7ff898f82ffdad423900`. Updated top-level `AGENTS.md` and the project-wide research index.
- Rendered a nine-page local guide/report bundle. Checked its text, embedded figures and the layout of the physical data figure.

### Why

The research result and the machine state are separate completion conditions. The result requires matched builds. Restoration requires both successful flash verification and a clean post-restore native-world query.

### What worked

Both screen CRCs passed. Pixel differences from the reference fit the half-open clock rectangle `[548,10,626,30]`. The operator’s saved factory firmware was restored from its fresh 8 MiB backup. The research index checker verified 41 roadmap task IDs across 24 dated tickets and 13 pinned vault documents.

### What didn't work

The reMarkable client could not resolve the cloud host from the sandbox. Automatic approval review rejected the requested external upload because it requires explicit approval of the two potentially private inputs and the exact cloud destination. A request for that exact authorization was issued. The vault push was successful, and the local PDF is independently readable.

### What I learned

Paper publication and a reproducible device measurement can be completed independently of a particular reader-delivery service.

### What was tricky to build

The final restore check happens after successful flash write and a fresh boot. Copying the measurements before that last step would omit the restore outcome. I waited for the `original_restored` marker and verified the three individual records.

### What warrants a second pair of eyes

The small workloads each have more than a megabyte of headroom at their configured caps. How that headroom should be budgeted across future programs is a product decision. The experiments ran on one device and used bundled source and current native reactors.

### What should be done in the future

Record the reader delivery outcome when the user decides on the exact transfer. Use the integration decision to define a memory budget before changing the default.

### Code review instructions

Open the local PDF or go-go-parc report. Inspect `various/physical.json` under each boot and under `restored_worlds`. Re-run `scripts/08-summarize.py` for the estimates. The local PDF can be rebuilt with `scripts/10-publish-inputs.py` and `scripts/11-reader-pdf.sh`.

### Technical details

ELF sizes for the three physical builds were 24,424 B (Files), 66,364 B (Agenda), and 240,452 B (Editor). All 96 timed module digests matched their control or fused group’s independently built host digest. The replay image checksum starts with `635a3d7a`.

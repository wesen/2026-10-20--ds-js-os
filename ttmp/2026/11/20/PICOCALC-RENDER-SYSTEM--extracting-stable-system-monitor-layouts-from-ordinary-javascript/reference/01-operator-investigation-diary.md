---
Title: Operator investigation diary
Ticket: PICOCALC-RENDER-SYSTEM
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:37.566492665-05:00
WhatFor: ""
WhenToUse: ""
---

# Operator investigation diary

## Step 1. Commission a blind design and freeze the inputs

The department asks whether fixed portions of a live System display belong in the receiving process. I scheduled a blind Opus High design before collecting candidate data. The director supplies the pixel oracle and controls the single physical board.

### Prompt Context

**User prompt (verbatim, as forwarded by the director)**

> research all this, also do chess, snake, system.
>
>
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation.** Study manual specialization of the ordinary System app and test any released extractor on a held-out ordinary app. **Inferred intent.** A reader should be able to reproduce the separation of costs and understand the limits of the measurements.

### What I did

Created the child ticket with docmgr, read the parent briefs, the current System app and the SDK constructors. Invoked the authenticated Claude CLI at Opus High from /tmp with tools disabled and a generic commission. Recorded the incoming operator revision 80cc251. Kept Keys source sealed.

### Why

The existing monitor has bounded row windows and graph encoding. Comparisons must use that already improved control. The kernel owns deduplication by encoded publication, so unchanged inputs must incur producer work while contributing zero queued bytes on every arm.

### What worked

The real SDK constructors are in picocalc-os/js/prelude.js. The production screen and ordinary JavaScript callbacks can run against deterministic kernel samples without changing the app.

### What didn't work

The first CLI invocation ran inside the default workspace sandbox. Subsequent steps record its actual result.

### What I learned

The SDK paragraph wrapper contains both tree and hints. A table's selected row is relative to its centered window. The graph has a real alternate floating-point path near half-pixel ties.

### What was tricky to build

A reproducible capture needs the same callback state in each arm and real constructor details, including flattening, property defaults and string conversion. Pixel equality is independently checked by the director using complete frames.

### What warrants a second pair of eyes

The publication envelope and retained-state assumptions. This child harness can price an isolated stage and exact logical bytes; the kernel and panel have their own ownership boundaries.

### What should be done in the future

Qualify the manual treatment and freeze any extractor before the holdout replay.

### Code review instructions

Read scripts/01-design-commission.txt, then inspect the source around worldsTab, handlesTab, busesTab and the SDK __render callback.

### Technical details

Study identifier PICOCALC-RENDER-SYSTEM. At the beginning of the run the worktree had unrelated staged renames. Only child-ticket paths enter this study's commits.

## Step 2. Measure a complete independent manual screen

The Opus design arrived successfully from the authorized networked CLI. Its additional generic path-diff control needs the previous screen, while the project's baseline can redraw from a single retained packet. I kept that comparator as S1 and preregistered a 30% released-byte threshold for the manual prototype against the production-style generic snapshot before running the first candidate.

### Prompt Context

See Step 1. The designated researcher authored the predictions. My operator role was to make them testable on the actual app.

### What I did

Committed the design, explicit control decisions and frozen input hashes at 508dee2. Replayed generic versus generic and wrote a manual producer that reuses the real formatter/window/quantizer code. Wrote a resident receiver and validated the 100-state trace.

### Why

The original graph falls back to floating point near a particular half-pixel condition. Moving its quantization or evaluating it with different operands would jeopardize graph parity. The manual keeps the producer on the same path in both branches.

### What worked

Each treatment published 82 envelopes. The generic enqueued 141,662 bytes and the manual enqueued 64,566. Trees and hints matched after a fresh decode. The observed 54.4% reduction released the exploratory extractor.

### What didn't work

The first sandboxed Claude command in Step 1 ended with “API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)”. The permitted network run succeeded. The first corpus digest command addressed a directory one level above the repository; shasum reported “No such file or directory”. The final frozen manifest uses repository-root paths. Initial git staging failed with “Unable to create .../.git/index.lock: Read-only file system”. Reran the scoped commit through the approval mechanism.

### What I learned

The trace alternates tabs during the long refresh sequence. This strongly affects the cost of an incremental baseline. Selection within a table window and refreshing a different tab warrant separate groups.

### What was tricky to build

The manual must retain the same fallback graph maximum, selected detail text, revoked handle coloring, empty Buses state and UTF-8 data while emitting only the dynamic values. The outer title belongs to the compositor.

### What warrants a second pair of eyes

Version checking here belongs to the harness. The boot catalog and the production durable slot have different lifetimes. Review the point at which the old version is released in any real integration.

### What should be done in the future

Advance manual specialization to a physical stage comparison and qualify end-to-end before making a firmware decision.

### Code review instructions

Read scripts/05–07 with worldsTab and handlesTab. Compare various/sysmon-generic-wire.ndjson and sysmon-manual-wire.ndjson at worlds-last.

### Technical details

At bottom selection 27, the first visible record is 20 and the local index is 7. Complete SDK bytes fall from 1,882 to 725 on that state. The mailbox envelope and queued copies lie outside this count.

## Step 3. Freeze a semantics-preserving extractor and face Keys

The actual SDK stores the column array on the returned table object. Replacing all fresh literals with one shared instance could change observable writes. I chose a conservative source-guided wire optimization: leave the producing JS intact, harvest eligible serialized fragments at build time, then substitute those fragments in the completed JSON.

### Prompt Context

See Step 1. The departmental brief asks for dynamic evaluation preservation and independent scoring on the frozen ordinary-JS Keys application.

### What I did

Implemented the literal walker and a versioned whole-value dictionary codec, plus explicit guard and effect fixtures. Committed the extractor and the original sealed Keys driver at 958d760. The director executed the held-out runner.

### Why

The post-serialization boundary preserves argument evaluation, property getters, string conversion, exceptions, fresh identities and pre-serialization mutation. It necessarily incurs producer construction and a second scan. Measuring that cost is part of the experiment.

### What worked

System contributed nine catalog-producing sites out of seventeen. Keys contributed two out of eight. The automatic enqueued 126,278 bytes in System and 24,379 in Keys. The generic Keys control enqueued 26,227. Version mismatches and invalid slots were refused. Seven effect cases, ten rejection cases and a postconstruction mutation exercised the intended boundary.

### What didn't work

The first independent invocation of scripts/11-keys-holdout.cjs failed before scoring: “ReferenceError: ask is not defined”. The harness lacked the keyboard stats service, the actual event is called “keys”, and callbacks can return promises. I supplied deterministic ask/now and awaited dispatch. The director reran with the original frozen actions and extractor. Original and repaired driver digests are kept side by side.

### What I learned

Static column descriptors cover only part of what the manual representation compresses. The manual can also omit field names and move row formatting structure to the receiver. The automatic returned original generic packets throughout Buses when its header and references brought no saving.

### What was tricky to build

Plain substring matching on JSON can replace text inside a quoted application string. The encoder consumes full quoted tokens while matching only composite dictionary values outside them. A collision with the reserved reference key triggers generic fallback before any substitution.

### What warrants a second pair of eyes

This experiment's extractor specializes the wire representation. A residual producer that omits constructor invocations would need a different proof and benchmark. Late object mutation and SDK access should stay in its tests.

### What should be done in the future

A direct residual producer with an explicit non-escape condition could be tested independently on another sealed producer. This frozen version failed its economic gates.

### Code review instructions

Read scripts/08-extract.cjs and 09-auto-runtime.js, then compare the call-site decisions for both apps under various/auto-catalog-*.json.

### Technical details

Automatic candidate sends 15,384 fewer System bytes than G, or 19.95% of the manual saving. Keys saves 1,848 bytes and increases the paired host time by a median factor of 3.33.

## Step 4. Verify pixels and memory, then commission the article

I sent the director a self-contained QuickJS runner and tested the retained envelopes against the director's host compositor and native RGB565 code. 100 System frames and 26 Keys frames matched their controls byte for byte. Another 176 states driven by the real System callbacks produced equal screen trees.

### Prompt Context

See Step 1. The researcher owns the article and empirical diary. The director owns the board and the vault.

### What I did

Used the common pixel oracle for each of five arms (including both controls), a matched control rerun, 30 rotating timing blocks, a generic diff comparator and a separately metered host QuickJS process. Preserved exact wires, decoded frames, per-frame pixel hashes, raw blocks, catalogue manifests and warm/cold cost evidence.

### Why

The full screen is self-contained. Deduplication costs depend on *attempted* outputs while network/cache benefits depend on *changed* outputs. A renderer that rematerializes the tree may pay for shorter wire at the next stage.

### What worked

All candidate buffers matched complete 204,800-byte RGB565 frames. Reference checks cover a dropped flush, the transient banner and its removal. Medians across 100-frame Node blocks were 1,772/984/5,027 µs combined producer + receiver for G/M/A. One fully initialized host QuickJS realm held all treatments and input data in 343,904 charged bytes. Per-arm increases during the isolated 20-case boundary run were 32,016/22,992/62,848 bytes.

### What didn't work

The first invocation of the director's oracle failed “spawnSync git EPERM”. An approved local run then returned native “status: 7” at frame 14. The fixture exporter supplied a banner string and the compositor expected an object with color, text and subtitle. Fixed the export adapter without changing application wire inputs and reran all arms. A combined request for report and diary from the remote CLI returned “safeguards flagged this message” with reason “reasoning_extraction”. Requested the public technical article and a separate empirical activity log, based only on recorded facts.

### What I learned

Time is sensitive to the runtime and scope. Control-vs-control noise was small relative to the automatic slowdown. The design's S1 receiver p95 comparison lacks paired confidence evidence even where other thresholds are met. An estimate for source payload does not establish linked product-image size.

### What was tricky to build

G, M and A place work differently. Each receiver uses a fresh decoded view, including when recovering while the producer is idle. The physical stage capsule excludes tallying bytes and generating its checksum from the timed windows but the host allocator high-water includes that bookkeeping.

### What warrants a second pair of eyes

Check that comparisons with S1 are labeled as the separate stateful comparator, the repeated installs are priced hypothetically, and the physical capsule is an isolated workload. Raw aggregate allocation excludes a proof about per-owner peak, queued subscribers and production panel deadlines.

### What should be done in the future

The director will use the same capsule across controlled physical blocks. End-to-end screen queue, runtime isolation, painter and physical delivery would be separate integration work.

### Code review instructions

Run scripts/18-reproduce.sh from the repository root. See reference/04-reproduction.md for prerequisites, outputs and artifacts.

### Technical details

The portable physical runner exposes renderLabRun(arm,1), prices 20 attempts and 17 publications, and returns a canonical-screen checksum of 2164593678. It occupies 23,710 source bytes including all controls, corpus and measurement glue.

---
Title: Representation researcher experiment diary
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:33:10.882376838-05:00
WhatFor: ""
WhenToUse: ""
---

# Representation researcher experiment diary

## Step 1: Freeze predictions and representation alternatives

## Prompt Context

I was asked, as the representation researcher, to write a blind prediction and experimental design about replacing full JSON materialization with a bounded token index for full-screen snapshots on a single-core 320×320 RGB565 handheld. The renderer keeps the last accepted screen per app for restart. The workloads are a string/number table, a chess canvas made of many primitive tuples, and a small moving Snake game. A generic parse runs before every event dispatch. I have no access to source code or the benchmark device. An operator will run the study and return data, and I will write the article afterwards.

## What I did

- Wrote down what I know about the system and listed what I do not know as explicit **UNKNOWN** items for the operator to fill in.
- Defined the two representations, including a concrete index record layout in two widths.
- Wrote fairness rules: shared lexer, shared conversion routines, same caps, two allocator configurations, output hash equality, deferred work counted.
- Defined seven operations, covering full traversal, repeated traversal, sparse lookup at three key positions, discard, restart, and small events.
- Wrote memory budget formulas and lifetime rules.
- Listed Unicode and overflow corpus cases.
- Described how coalescing and idle-sender restart affect each representation.
- Made 14 directional predictions with confidence levels and identified four cost reversals.
- Defined a negative result before any data exists.
- Listed claims that must not be made.
- Specified the files the operator returns.

## Why

- A prediction written after seeing data cannot be checked. Fixing the predictions, the noise threshold, and the negative criteria now makes the article falsifiable.
- The most common error in parser comparisons is counting the index's parse time while ignoring the decoding it moves into the traversal. Several rules exist only to prevent that.
- The three workloads differ in tokens per byte and in document size. I expect those two properties to decide the result, so the design keeps them separate instead of averaging them together.

## What worked

- Separating "bytes scanned" from "allocations" made it clear where the index can and cannot help. It cannot reduce bytes scanned during validation. It can reduce allocations, frees, and visited tokens.
- Writing the retained-memory formula showed that the index requires retaining input bytes plus a candidate slot. That cost is easy to leave out.
- Treating record width as a variable exposed a likely reversal in the chess memory result.

## What didn't work

- I could not produce numeric predictions with high confidence. I do not know the allocator, the node size, the token density, or the CPU. The ranges in §8 are wide, and several are marked low confidence.
- I could not settle the coalescing design. It depends on whether app id and sequence number are in the transport header and on the current acceptance policy, and both are unknown. The design tests both cases instead.
- I could not estimate the total memory budget, because RAM size and app count are unknown.

## What I learned

- The sparse-lookup advantage of the index is smaller than it first appears. The index is built by a full scan, so a lookup still costs a full scan; it only avoids allocation. Real early exit requires that the document is not fully validated, which is a policy choice, not a property of the representation.
- The restart path reverses the acceptance-time advantage. The index is cheaper to accept and more expensive to redraw from.
- Escaped keys are a correctness problem specific to index designs. A materializer decodes keys up front; an index that compares raw spans does not.

## What was tricky to build

- **Defining fairness.** If the two backends use different lexers, a speed difference may come from lexer quality rather than representation. A shared lexer fixes this but requires the harness author to restructure the existing parser. That is extra work and a possible source of new bugs in the baseline.
- **Defining "negative".** The index can lose on full traversal and still be the correct choice for dispatch. I added partial-result categories so that a mixed outcome is reported accurately and not reduced to win or lose.
- **Choosing a noise threshold** without any variance data. I used the larger of 5% and twice the interquartile range. That is a judgment call, written down before data so it cannot be adjusted afterwards.

## What warrants a second pair of eyes

1. The token-density assumptions behind predictions 5 and 6 (about 3.5 bytes per token for chess, about 15 for the table). These are not measured. If they are wrong, the memory reversal may not occur.
2. The proposal to retain raw bytes only and rebuild the index on restart. This trades restart time for memory. Someone who knows the restart frequency should judge whether that trade is acceptable.
3. Whether a shared lexer changes the materializing baseline enough that it no longer represents production behavior. If it does, also run the unmodified production parser as a third reference row.
4. The 16-bit record limits. Someone should confirm that current maximum message sizes fit within 65,535 bytes and 65,535 tokens.
5. The re-entrancy test for the decode scratch buffer. I do not know whether a dispatch handler can trigger a nested parse in this system.

## What should be done in the future

- The operator fills in `environment.txt` before running anything. Several predictions depend on those values.
- After the data returns, write the article with predictions and outcomes side by side, including every failed prediction.
- If the result is a partial adoption (index for dispatch only, or a per-app retained form), design a follow-up study for that specific configuration. This study does not measure the combined pipeline.
- If retention is persisted to flash, run a separate study on flash write cost and wear. That is outside this study.

## Code review instructions

Review the operator's harness with these checks:

1. **Shared code.** Both backends call the same lexer, the same unescape function, and the same number-conversion function. Search for duplicate implementations.
2. **Limits.** All caps come from `limits.h`. No backend has a hard-coded limit of its own.
3. **Deferred work in timing.** In the timed region for the index, traversal decoding happens inside the measured interval. Verify the timer start and stop positions for every operation.
4. **Equal output.** Hash comparison runs for every measured cell. A mismatch marks the row invalid in the CSV; the row is kept, not dropped.
5. **Rejection.** After a rejection, the retained slot is compared byte-for-byte with its prior contents.
6. **Index initialization.** Confirm whether it clears the full array, and report which.
7. **Offset width.** With 16-bit records, bounds checks occur before narrowing offsets, not after.
8. **Escaped keys.** Lookup code checks `has_escape` before comparing a key.
9. **Arena configuration.** The arena resets between repetitions, so peak-heap figures do not accumulate.
10. **Corpus.** Generated with a fixed seed and checked into the deliverable, so the run can be repeated exactly.

## Technical details

**Index record, 8-byte variant:**
```
struct tok8 {
  uint8_t  type_flags;   // low 4 bits: type; high 4 bits: has_escape, negative, frac_or_exp, spare
  uint8_t  pad;
  uint16_t start;        // byte offset into retained input
  uint16_t len;          // byte length of token text
  uint16_t subtree_end;  // index of first token after this value
};                       // requires B_max <= 65535 and T_max <= 65535
```
The 16-byte variant uses `uint32_t` for `start`, `len`, and `subtree_end`.

**Framebuffer:** 320 × 320 × 2 bytes = 204,800 bytes.

**Retained budget per app:**
- Index: `2 × (B_max + T_max × r)`.
- Raw bytes only: `2 × B_max` plus one shared scratch index.
- Materialized: measured.

**Noise threshold:** `max(0.05 × baseline_median, 2 × baseline_IQR)`. It is fixed before data.

**Operations:** P, F1, FK (K ∈ {1, 2, 4, 8, 16}), S1/S2/S3, D (Case A and Case B, both acceptance policies), R (app restart, renderer restart if applicable), E.

**Configuration matrix:**

```
backend {materialize, index8, index16} × allocator {system, arena} × workload {table, chess, snake}
× size {small, typical, max} × op × cache {cold, warm}
```
Cold cells are marked UNKNOWN if cache flush is not possible on the target.

**Repetitions:** ≥ 200 per cell, or the number actually run, recorded.

**Output files:** `results.csv` (schema in §11), `conformance.txt`, `environment.txt`, `budget.txt`, harness source, generated corpus.

## Step 2: Compare canonical trees, drawing operations and retained bytes

### Prompt Context

The lab commissioned the representation researcher to interpret public aggregate measurements. An operator ran the code and retained the evidence. The commissioned report concerns screen representation on the host and the P4.

### What I did

| # | Test | Observation | Outcome |
|---|---|---|---|
| 1 | Blind prediction of the indexed/materialized time ratio (table 0.6–0.9; Chess 0.8–1.1; Snake within noise) | Observed ratios: Keys 3.1, System 3.8, Editor 4.2, Chess 4.4, Snake 4.9 | Predictions not supported. Descriptive only: 25 warm trials, unrotated order, one 75th-percentile state per application |
| 2 | Control/candidate full command equivalence | 453 of 453 states identical | Pass |
| 3 | Independent raw RGB565 verification of Editor | 44 of 44 states verified; skipped delivery and retry exercised | Pass |
| 4 | Same-thread caches, 96 entries each per paint | Hits: Keys 48, all other applications 0 | No benefit observed without repeated calls |
| 5 | QuickJS heap increment, input text resident | ix fixed at 45056 B; base 8176–60768 B; used 13728–20672 B | Host figures only; not live application memory |
| 6 | Six-slot admission model | 196608 B index + ≤98304 B wire; six refusal classes; full coalescence over 160 replacements; epoch and sender mismatches refused; A retained after restart, C accepted later | Model only; production still replaces before the receiver runs |
| 7 | Scope | Timings exclude raster and SPI | No physical board timing claimed |

### Why

Charge both validation and the deferred conversion needed to paint. Measure actual retained memory on the same inputs across all representations.

### What worked

The corpus and the isolated retained-generation model supplied deterministic outputs and meaningful failure cases.

### What didn't work

The fixed generic index exceeded the control's retained memory on several applications. Lazy field access increased full painting time on each host specimen.

### What I learned

Token density, index capacity and the renderer's access order jointly determine the result.

### What was tricky to build

The renderer revisits arrays through JavaScript property accesses and iteration. Multiple correct representations can have very different costs.

### What warrants a second pair of eyes

Collector overhead, placement of the ingress boundary and use of native parsing in the optimized baseline all affect interpretation.

### What should be done in the future

Compare a binary reader with direct offsets at the same measured producer and consumer boundaries.

### Code review instructions

Inspect scripts 10–12, 15–17 and the cross-workload results under various.

### Technical details

The input string was resident before the host allocator comparison. The fixed index reserves 32 KiB even for the smallest fixture.

## Step 3: Read the physical replay

### Prompt Context

The operator supplied matched physical measurements for parse plus full scalar access and sparse widget-kind lookup.

### What I did

The entries below follow procedural order. Wall-clock timestamps are not part of the supplied record. The order of the live trace relative to the QuickJS trials is not recorded.

1. **Bench.** ESP32-P4 running QuickJS.
2. **Workloads.** `sysmon`, `snake` and `chess`, one representative screen each.
3. **Arms defined.**
   - native: `JSON.parse` plus a recursive JS scalar checksum;
   - index: JS bounded scanner plus a sequential walk of every stored scalar with conversion;
   - both: the same scanner plus tree materialization and checksum;
   - key: `JSON.parse` plus a read of the widget kind;
   - sparse: index construction plus decoding of that top-level key.
4. **Timing boundary set.** Excluded: index array reservation, lifecycle, paint, wire transfer and panel output.
5. **Schedule.** Five rotating blocks, two repetitions per block.
6. **Gates.** All checksum gates passed on all workloads.
7. **Outcomes recorded.** Median milliseconds per screen for each arm, as listed in the table above. Median paired index/native full-cost ratios: 5.878 (sysmon), 4.497 (snake), 5.371 (chess).
8. **Comparisons derived from the medians.**
   - both − index: 5.530, 4.779 and 17.421 ms.
   - sparse/index: 0.77, 0.80 and 0.79.
   - sparse/native: 4.50, 3.57 and 4.23.
   - key/native: 0.39, 0.47 and 0.48.
9. **Separate live trace on the shipping compositor (compiled CJI).** One Chess publication of 4935 bytes. Frames handler 44.984 ms; draw 26.794 ms, including a 4.273 ms commit; pixel SPI 1.019 ms.
10. **Limitations.**
    - Trials ran in QuickJS, not in the CJI production path. No production speedup or regression is inferred.
    - Only the index/native comparison is paired. Other differences come from medians of separate arms.
    - No dispersion measures or intervals are recorded.
    - Each workload used one representative screen, and the byte lengths of those screens are not in the record.
    - Index array reservation is excluded from all timings.
    - Heap was not measured.
    - The live trace covers a single publication.

### Why

Receiver CPU matters on a serial event dispatcher. Native CJI event traces put the controlled QuickJS experiments in their system context.

### What worked

Every scalar checksum matched across five blocks on the P4.

### What didn't work

Paying to index every token outweighed deferred conversion even when the receiver read only one root field.

### What I learned

The same JavaScript scanner benefits from skipping tree materialization. The existing native JSON parser remains faster for this implementation.

### What was tricky to build

A comparable scanner control must charge field conversion on both sides. Array reservation was outside the physical time interval.

### What warrants a second pair of eyes

Deploying a C or binary reader changes both representation and execution cost. Supply a materializing control behind the same boundary.

### What should be done in the future

Give the binary study a complete sender-to-reader contract and independently replay a held-out screen.

### Code review instructions

Match the tested operations in scripts 12 and 20 to the physical-blocks and physical-summary receipts.

### Technical details

The public article and both experiment logs were written by Opus High. The operator arranged the log in the project's diary format.

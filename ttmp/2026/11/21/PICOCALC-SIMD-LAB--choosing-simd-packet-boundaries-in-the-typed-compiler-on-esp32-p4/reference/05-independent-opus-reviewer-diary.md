---
Title: "Independent Opus reviewer investigation diary"
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
---

# Independent Opus reviewer investigation diary

The reviewer recorded a protocol visit before the new application measurements and a separate outcome visit after the measurements. Commands and observed values below come from the reviewer.

## Step 1: Verify the device paired timings

I opened the trace-repl session and confirmed the device study is loaded. I rebuilt every comparison/phase pair set and recomputed the document's opening-scene table, the scene ranges, sign counts and counterbalancing. All published figures reproduce. The output-CRC field turned out to be fixture-level, not per-run.

### Prompt Context
**User prompt (verbatim):** "Independent scientific review of the PicoCalc SIMD study. You have your own local session via mcp__review__eval. Use it to check original board comparisons. Assess whether proposed choices and measurements identify compiler effects. At protocol phase identify concrete pre-measurement controls and failure conditions for six studies: hand ray row, packet boundary, range/trap safety, particle layout, conflict-free contacts, and held-out regret/cold compile. At outcome phase audit supplied evidence, units, omissions and engineering claims. Write markdown review and your own investigation diary using supplied format. Cite actual observations, distinguish recommendations, no analogies. Return a JSON object with string fields review and diary only."
**Assistant interpretation:** Check the board results against the archive, critique the protocol and selector, propose controls for six studies, and write the review and diary.
**Inferred user intent:** Get an independent check on whether the performance and compiler claims hold before they run further measurements.
**Commit (code):** N/A (no code changed)

### What I did
- `q.help()`, `hardware.help()`, `hardware.metadata()`, `q.capabilities()`.
- `hardware.pairs(b,c,ph)` for 3 comparisons x 4 phases. Each set has 72 records, 12 poses and 6 blocks.
- Medians, paired medians of `savedPct` and `savedUs`, pose ranges, sign counts, position deviations, block-to-position map, CRC triples by pose and phase.

### Why
- To confirm the table from raw pairs rather than trusting the summary.

### What worked
- Default clean: 57.692, 56.3395 and 56.069 ms; paired 2.801% and 0.430%; scalar-to-PIE savings 217, 221, 307, 260, 299 and 224 us.
- Ranges 2.659% to 2.888% and 0.410% to 0.466%. All 72 pairs positive for clean, audit and primary; shade split 38/33/1, 37/35/0 and 38/30/4.
- Six blocks equal six permutations; position deviations between -7.25 and +6 us.

### What didn't work
- No failures in this step.

### What I learned
- `outputCRC` holds one triple per pair and is identical across all four phases for a pose. It cannot show per-run output agreement.

### What was tricky to build
- `savedPct` is relative to the baseline; the medians of paired percentages differ from the ratios of medians (median-of-differences 242 us vs difference-of-medians 270.5 us). I used paired values to match the document.

### What warrants a second pair of eyes
- Whether the raw `rows.json` contains a CRC for each run that this API does not expose.

### What should be done in the future
- Expose per-run and per-treatment CRCs.

### Code review instructions
- Re-run `hardware.pairs('scalar','pie','clean').filter(r => r.pose === 'default')` and take the median of `savedUs`.

### Technical details
- Unit: P4 us. `savedUs = baselineUs - candidateUs`.

## Step 2: Audit the cold-compile loads

I pulled `hardware.loads()` to check the compile-cost claims. Only the first trial is present, so the prefilter follow-up cannot be verified. I also found that the device ELF sizes are identical across treatments.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Check the cold-compile evidence and break-even arithmetic.
**Inferred user intent:** Confirm the engineering cost claims.
**Commit (code):** N/A

### What I did
- Per-treatment medians, within-block differences, position deviations and `elapsedUs - compilerUs`; recomputed the break-even arithmetic.

### Why
- The 44-frame claim depends on numbers from two separate trials.

### What worked
- Medians: stock 454.1325 ms, scalar 658.5085 ms, PIE 658.027 ms. PIE minus stock within each block: 201.843 to 206.79 ms. One ELF CRC per treatment, matching the metadata.

### What didn't work
- No query failures. The prefilter data is absent from the archive (programs 0, 8 and 5 only).

### What I learned
- `elfBytes` 66,816 and `segmentBytes` 66,092 are the same for all three treatments.
- The overhead (`elapsedUs - compilerUs`) is 5,401 to 5,551 us.
- Break-even is 43.5 frames with the prefilter compiler, 126.2 frames with the first-trial compiler, and 290.6 frames if only the producer gain is counted.
- Compile SD is 1.2 to 2.2 ms.

### What was tricky to build
- In the follow-up, program 8 means a different compiler than in the first trial. I kept the two apart.

### What warrants a second pair of eyes
- What the device `elfBytes` field actually measures.

### What should be done in the future
- Load the prefilter result directory into the device study.

### Code review instructions
- `hardware.loads()`, grouped by `treatment` and `block`.

### Technical details
- Unit: `compilerUs` and `elapsedUs` in P4 us; `peakJSBytes` in bytes.

## Step 3: Host counts and the LLVM capture

I checked the typed profile totals and samples, compared counters with the C arms, and measured vector IR in the C `row` across the vectorizer passes. The counts reproduce, but two labelling and arithmetic anomalies came out of it.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Audit the host evidence and units.
**Inferred user intent:** Make sure the host claims use correct units and comparable counters.
**Commit (code):** N/A

### What I did
- `profiles.arm(...).describe()`, `.totals()` and `.samples()` for the typed and C arms.
- `a.variants()` and the middle-pass headers.
- At ordinals 165, 166, 171 and 174 of the checked and unchecked `row`, counted all instructions, `shufflevector`, `<8 x i16>` and `<4 x i32>` sites.

### Why
- To verify the table's units and whether the C comparison involves auto-vectorization.

### What worked
- 3,608,697, 3,199,910 and 3,131,435 instructions; 3,135 packets.
- Stack loads 936,328, 729,553 and 729,553.
- Row 0: stock 20,103 steps vs 20,130 for scalar and PIE, with 0 packets.
- C `row`: 122 instructions (checked) and 73 (unchecked) unchanged across LoopVectorize, and zero vector sites.

### What didn't work
- `q.run(q.ir.instructions().where ? 'w' : 'nw')` failed with `QueryError: [notAPlan] q.run expects a plan or an object of named plans; got the string "nw"`. I removed that probe.
- `q.ir.instructions().where(...)` failed with `TypeError: Object has no member 'where' at <trace-cell>:3:38(34)`. I used `opcode()` and `resultType()` filters instead.

### What I learned
- `packets` counts packed scratch stores, not groups.
- 3,300 exceeds the 3,200-group maximum for 160x160.
- The C and Typed counters differ: QEMU instructions within the row symbol vs interpreter steps over the whole call.
- Remarks are unavailable.

### What was tricky to build
- The timeline `at(ord)` must use an ordinal belonging to `row`; I used the vectorizer ordinals taken from the headers.

### What warrants a second pair of eyes
- The cause of the 3,300 count.

### What should be done in the future
- Capture LLVM remarks for the C row.

### Code review instructions
- `profiles.arm('typed-pie').describe().fields`.

### Technical details
- The vector-type check covered only `<8 x i16>`, `<4 x i32>` and `shufflevector`. An unchanged instruction count is weak evidence that nothing changed.

## Step 4: Exercise the frozen selector

I evaluated `selector.js` verbatim and swept trip counts and write streams. The policy always picks PIE for the planned variants and never picks scalar. I then measured the shade-control noise to set margins.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Test whether the held-out protocol can tell the policies apart.
**Inferred user intent:** Get a protocol that can fail informatively.
**Commit (code):** N/A

### What I did
- `simdChoose` for trips 8, 96, dynamic, 3, 17, 7, 9 and 16 at writeStreams 0, 1, 2 and 4; a sweep over n = 1 to 200 at writeStreams 0 to 8.
- SD of the shade and clean paired savings.

### Why
- An all-PIE policy makes frozen-versus-constant-PIE uninformative.

### What worked
- PIE for all planned variants. The first trip count where PIE wins is 8 for writeStreams 0 to 4 and 16 for writeStreams 8. Scalar is never chosen.
- Shade SD is 37 to 42 us; the clean within-pose residual SD is 26.4 us.

### What didn't work
- No failures in this step. A later response was interrupted, and I gathered no further data after this cell.

### What I learned
- scalar minus pie = 21 x groups - 3.
- The model has no alignment or density terms.

### What was tricky to build
- An undefined `constantTrips` falls back to the prior of 32, so the dynamic case is evaluated at 32.

### What warrants a second pair of eyes
- Whether `writeStreams` is 0 for the accumulator loop.

### What should be done in the future
- Hash-commit a revised selector, and include variants it predicts as stock or scalar.

### Code review instructions
- Load `selector.js` and call `simdChoose({constantTrips: 8, writeStreams: 1})`.

### Technical details
- Scores are model issue slots, not measured cycles.

# Lab notebook: SIMD packet-boundary review, 2026-11-21

## API calls performed

1. `mcp__review__eval`, source: `["pie","empty","full"].map(k => simd.executions(k+"-row",k+"-opening","scalar-lane-load").executions)`. Result: `{"ok":true,"value":[26070,9182,3246]}`.
2. `mcp__review__eval`, the same three `simd.executions` calls, this time projecting imageSHA, workload, traceSteps, staticInstructions, executedPCs and unit. Results:
   - pie: 8420b7361973fac2053d95e45f90ed699fbb92dae19f0a64cab16da23776310a, 3,131,435 steps
   - empty: 9a4a2356a86beee281fb79dcc199bc2369b819ef9b0a5f5c28d444ff4719f26f, 2,983,602 steps
   - full: 55b350ea2753e506adcae0aeee6d609a7c59905f1b6ae17952fc9911c99372fa, 2,954,486 steps
   - All three: workload opening-160-rows, staticInstructions 1, executedPCs 1, unit = retired RV32 guest instruction executions.

## Measurements checked

- Lane loads, image digests and step totals match candidate-workbook.json for all three arms.
- 26070 − 9182 = 16888, which equals predicted[0]. The full image's extracts, 5936, equal predicted[1]. 3246 + 5936 = 9182.
- Recomputed the step change relative to pie steps: empty −4.7209%, full −5.6507%. Both match the workbook.
- Frame, default pose: recomputed pct = saved/before for the empty, full and incrementalFull rows in the clean and primary phases. Noted that saved (508.5) differs from the difference of medians (506.0). Scanned all 24 pose-phase rows: incrementalFull wins = 0 in every row, with a range of −102.0 to −138.5 (clean) and −120.0 to −150.5 (primary).
- Ceiling: read the control field of each row. Computed the unpaired full-minus-empty median differences: opening −5,959, dense −7,763, sparse +624 cycles.
- Selector: predicted = pie in 15/15 cases. Recomputed regret for dynamic n=3 reach 0: (186.4453125 − 150.2578125)/150.2578125 = 24.08%.
- Gate: recomputed n=0 gateOverBestFixedPct = 8.45% and gateVsPie pct = 6.94%.
- Physics cells and the packedArithmetic cell were read from workbook.json and not re-queried.

## Not performed

- No hardware.* calls. All device cycle figures come from the supplied JSON tables.

## Tool failures

- None. Both calls returned ok:true.

---
Title: Guarded PSIX shape study diary
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/03-run.mjs
      Note: Fixture freeze and host runner configuration
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/05-build-board.mjs
      Note: Select and validate physical calibration payloads
ExternalSources: []
Summary: Implementation decisions and chronological evidence for the prefix-trained and adaptive runtime writers.
LastUpdated: 2026-11-20T12:20:00-05:00
WhatFor: Reconstruct the runtime shape experiment from its source and results.
WhenToUse: When auditing guard correctness, wire parity, timings or cache limits.
---

# Guarded PSIX shape study diary

## Step 1. Define the success boundary

I inspected the original indexed-screen writer and selected its same logical payload, `{app, title, frame:{tree,hints}}`, for all producer arms. The complete corpus contains 427 production application renders from deterministic transition replays. I reserved a chronological System suffix, per-app suffixes, and the independent Keys replay. The physical System trace contained SPI event timing, so it could not supply input payloads for this test.

### Prompt context

The verbatim user request appears in [Director diary, Step 1](01-director-investigation-and-reading-diary.md). My delegated portion was to model runtime observation, compare a frozen training bank with adaptive guarded execution, preserve exact PSIX bytes, and measure setup, hit, fallback and churn costs. The typed ahead-of-time study owns the declared-schema encoder.

### What I did

- Read the predecessor's `02-binary-screen.js`, the preceding System replay generator, and the source fixture manifests.
- Chose eight cached plans, up to four guard probes per route, a 98,304-byte cache ledger and a 49,152-byte plan ledger.
- Chose the first 55 System rows, 23 Chess rows, 118 Snake rows and 22 Editor rows as chronological prefixes. Used no Keys input for training. The report uses payload hashes to flag repeated bytes across the boundary.

### Why

The experiment isolates the effect of moving field ordering and body offset decisions to an earlier visit. Generic fallback shares exactly the format implementation that defines canonical bytes. Ordered keys make the guard straightforward on JSON-materialized trees. The separate Keys replay and the same-route churn control challenge two different ways this policy can be wrong for performance.

### What worked

The four original streams were available with stable source hashes. The graph refresh, navigation and tab switch IDs gave a recognizable chronology for the System examples.

### What didn't work

The saved physical System trace was a JSON array of log lines such as `LAB TRACE 15605483 281 60 spi pixel-send`. Those lines lack the source tree needed to specialize a new PSIX packet. I kept the host and on-board input traces tied to the deterministic renderer replay.

### What I learned

A complete shape specifies the body only up to a packet-dependent start. The string directory also controls numeric IDs for fixed keys. Scalar changes therefore require more than patching the corresponding leaf slots.

### What was tricky to build

Keys traverse in UTF-8 order for wire purposes. JavaScript key enumeration has its own order, including integer-looking keys, and JS default string ordering uses UTF-16. The plan keeps two views of the key order. It checks the incoming order, then visits child fields in the canonical order that positions body records.

### What warrants a second pair of eyes

Check that the guard establishes every assumption used by the writer, and ensure that input values cannot change between guard and emit. The inert JSON domain matters. Review key/value deduplication and UTF-8 byte ranking.

### What should be done in the future

Explore the same separation of shape and packet binding with an input descriptor emitted by the typed compiler.

### Code review instructions

Review `compile`, `guard`, `encode` and `write` in [the observed-shape prototype](../scripts/runtime/01-observed-shapes.js). Check the original payload wrapping logic in [the predecessor's capsule](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/04-capsule.mjs).

### Technical details

PSIX inline numbers occupy a three-byte reference field on both branches of its layout, but non-inline finite floats additionally reserve eight bytes in the body. A change across the boundary must trigger a miss. The guard treats both Boolean values as one class and reads their current value on emission.

## Step 2. Execute parity checks and two host engines

I implemented the plan compiler as integer records with relative offsets and explicit key permutations. The runtime builds a cache entry after a generic miss has produced a valid packet. I ran exact-buffer checks on Node and the vendored host QuickJS runner. They also exercised renamed or reordered fields, Unicode dictionary ordering, numeric class changes and explicit refusal paths.

### Prompt context

See Step 1. The director additionally requested a small board capsule with a timer supplied by the calling firmware. That capsule reuses the host candidate logic.

### What I did

- Added an untimed byte comparator, seven rotated one-pass timing blocks and a separate diagnostic pass with per-stage timers.
- Defined a 40-payload same-shape control and a 72-frame control cycling through twelve shapes with the same discriminator.
- Adapted the earlier host QuickJS meter to report post-GC live bytes in addition to the high-water mark.

### Why

A guard hit answers a correctness question. Timing the whole producer call answers the cost question. Rotating the order makes it less likely that scheduling or runtime warm-up always affects one arm. A separate meter pass keeps per-stage probes and heap diagnostics out of the primary timing windows.

### What worked

Every original candidate packet matched, including 581,602 bytes across the 427-frame tape. The selected System suffix contained 40 occurrences of payloads absent from the prefix. The fixed candidate hit 42 times in 45 frames. Cold adaptive hit 39 times and compiled six plans. The independent Keys stream and churn control produced many more misses.

### What didn't work

The first `node 03-run.mjs node /tmp/psix-runtime-node.json` failed at `limits.values` with `TypeError: Cannot read properties of undefined (reading 'values')`. The three exported pure helper functions were nested under the experiment export, while the existing limits lived on `binaryScreen.limits`. The candidate now imports these from their respective objects.

The initial QuickJS invocation through Node `execFileSync` reported `Error: spawnSync /tmp/psix-runtime-quickjs EPERM` with exit status 0 and the C meter's JSON on stdout. I changed the harness to emit the pure QuickJS capsule and invoked the C runner directly through the shell. The source build itself succeeded using the checked-in engine files.

### What I learned

An end-to-end re-encode can preserve correctness while spending more time than the original on each miss. Cache retention and build throughput require distinct bounds. A tenfold change in cardinality frequency can matter more than the program's ability to discover and compile a layout.

### What was tricky to build

The cap includes an explicit size for compiled integer records and keys. The JS engine's real objects have headers, backing stores, atoms and allocator charges outside this portable count. I avoided deriving an allocator bound from the plan ledger and ran separate fresh-runtime resident measurements.

### What warrants a second pair of eyes

Compare whole-stream medians and matched-frame profiles separately. The diagnostic calls have extra probes and their totals approximate stage costs. Interpret the short Node timings as samples from V8 under this harness.

### What should be done in the future

Measure the cost of decoding or frame creation in a different timed boundary when proposing this path for production. Use a live producer interface if testing full device event-to-display latency.

### Code review instructions

Run [the reproduction recipe](../scripts/runtime/README.md). Use the `complete`, `failures`, `results` and `sensitivity` sections of the receipts. The stored FNV-1a digest checks that the compared input ordering gives the same sequence across engines and does not replace the byte comparator.

### Technical details

The compiled integer tape and field names survive a call. The scalar scratch array is cleared after success and after a miss. The portable plan charge counts 16 bytes per record, 8 bytes per object key occurrence, 24 bytes per distinct key plus UTF-16 and UTF-8 data, and 64 bytes per plan.

## Step 3. Prepare a physically replayable calibration

The board capsule embeds eight prefix frames, nine held-out System frames and six Keys frames. The host generator calls the same independent byte-comparison commands exposed to the board runner. The minified capsule is 50,925 bytes.

### Prompt context

The director asked for a pure JS capsule taking a monotonic `stageMicros()` and accepting the four policies through `stageAdaptiveRun`.

### What I did

- Added `05-build-board.mjs` and `06-board.js`, then built with esbuild 0.25.0 and the ES2020 target.
- Recorded the snapshot IDs and independently verified generic expected output in the generated manifest.

### Why

The smaller calibration keeps serial command runtimes short and supplies a physical timing counter. Selected host holdout frames remain outside training. Exact verification is explicit so packet comparisons do not contaminate producer timing.

### What worked

The nine System payloads produced 15,074 bytes with FNV-1a `3e515422`. The six Keys payloads produced 5,797 bytes with FNV-1a `98452397`. The host checks matched all three candidate policies against the reference on both sets. The minified capsule SHA-256 is `7ca18552b222d412fa5736b95acb604db9b74e8644411a2d63ccb8b58a4841e0`.

### What didn't work

The system PATH had no esbuild executable. I used the cached Linux x64 esbuild 0.25.0 binary. An initial message to the director included unverified digest numbers. I sent the manifest values immediately after reading the generation receipt.

### What I learned

The same candidate fits a short board replay with no framework-specific imports other than the supplied timer.

### What was tricky to build

Each board encode is timed before digest collection. Hashing consumes every packet but sits outside the clock window. The settings prime only the requested arm, and the same finite prefix is available to both fixed-bank training and warm-adaptive setup.

### What warrants a second pair of eyes

Check the physical receipts against the fixture manifest. The shortened tape is a separate experiment from the full chronological host split. A trained prefix sampled for board fit can favor different shapes from the full prefix.

### What should be done in the future

Measure a full on-device System event with its real timer and explicit queue and paint boundaries if the prototype is considered for integration.

### Code review instructions

From [the reproduction recipe](../scripts/runtime/README.md), follow the optional board capsule section. Run both `verify-*` modes before comparing trial timings.

### Technical details

The board capsule returns count, bytes, FNV-1a, per-arm setup time, producer time, hit count, fallback count, builds, evictions, guard attempts and resident charged bytes. A single invocation creates a fresh policy state. Its first timed update is cold for the online arm.

## Step 4. Check actual QuickJS retention and replay timing

The fresh x86 QuickJS runner produced full-stream timing and per-phase counts. I added a release control before drawing a memory conclusion. The same adaptive run now retains either the final encoder closure or only its returned state numbers. I also analyzed all 42 receipts from the director's physical P4 run.

### Prompt context

See Step 1 for the original research request. The director ran the hardware and asked me to integrate physical evidence with the host studies.

### What I did

- Replayed the same 100 System inputs three times in fresh QuickJS processes to compare generic, adaptive with the encoder retained, and adaptive with the encoder released.
- Wrote `07-summarize-board.py` to compare every receipt with the static byte manifest and produce medians and ranges for each physical arm.
- Revised the report after checking the first draft against the actual System snapshots, the two clock boundaries and the engine-specific results.

### Why

The allocator may retain state after running the program. Comparing generic and adaptive after a GC alone would fold engine work into the measured lifetime of the plan. Releasing the encoder after the same adaptive calls isolates the live difference more directly.

### What worked

The QuickJS release control measured 58,832 bytes above baseline after GC, compared with 382,544 bytes when retaining the encoder. The difference was 323,712 bytes for the final eight-plan cache whose ledger charged 33,559. All physical System and Keys receipts matched the manifest. The original, fixed, cold adaptive and warm adaptive System writer times were 287.926, 260.598, 358.567 and 271.496 ms across nine frames. Fixed training took 102.444 ms and warm setup took 326.304 ms. Readers can independently regenerate the physical receipt summary. [Host memory](../scripts/runtime/results/resident-released.json) · [Physical summary](../scripts/runtime/results/physical-summary.json)

### What didn't work

The board calibration did not reproduce the host System cold-adaptive lead. Its nine-frame suffix incurred five builds and gave four hits with which to recover them. Keys produced zero fixed hits and one online hit. Neither bench justified charging setup to one short tape. The broader host tape remains the evidence for amortization when more repetitions arrive.

### What I learned

The actual JavaScript heap retention differs substantially from a plan's logical payload size. Moving the same tape and keys to packed storage would make a physical-byte budget measurable in the implementation. Host and board streams answer distinct questions because their horizons differ as well as their engines and processors.

### What was tricky to build

The board operated on a smaller trace and charged setup and compilation at different points for each arm. A combined time needs to be calculated on each original row before taking a median. The summarizer also reports within-block encoding ratios so that comparisons can use paired runs.

### What warrants a second pair of eyes

Check the distinction between 42 receipts, the 40 timing samples and the two exact verification runs. Each tracked hash establishes agreement with the deterministic fixture manifestation, while the explicit verification compared the full bytes on the device. Inspect the independent memory release run before assigning the complete generic/adaptive heap difference to the plans.

### What should be done in the future

Use packed plan storage and measure the policy's actual heap bounds. Try rate-limited admission on the same chronological tape before changing the runtime producer.

### Code review instructions

Run the final section of [the reproduction guide](../scripts/runtime/README.md). Check the generated JSON against the archived [physical summary](../scripts/runtime/results/physical-summary.json). The director owns firmware installation and restoration evidence.

### Technical details

The device runs the raw 77,269-byte source inside a fresh QuickJS runtime configured with a 6 MiB limit, an eight-second interrupt deadline and the platform clock. Probe timing excludes loading and evaluating the script. Exact per-frame verification executes in a separate board command.

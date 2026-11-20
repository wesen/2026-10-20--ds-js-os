---
Title: Operator investigation diary
Ticket: PICOCALC-RENDER-SNAKE
Status: active
Topics:
    - picocalc
    - ui
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:00.633680543-05:00
WhatFor: ""
WhenToUse: ""
---

# Snake operator investigation diary

## Step 1. Freeze an independent design and a reproducible host scope

The real Snake source distinguishes a timer gated by focus from the autopilot toggled with p. I commissioned the prospective study from an authenticated Opus High CLI in /tmp, with no enabled tools. Its public design arrived before candidate implementation or measurements. Its proposed grid origin was an assumption, and one suggestion treats a complete template state as a delta. The operator protocol records how the actual experiments will test both points.

### Prompt Context

**User prompt (verbatim, forwarded by the director)**

> research all this, also do chess, snake, system.
>
>
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Interpretation and intent.** Run Snake as an independent research project, with Opus designing the test and writing the finished publication. The director coordinates the device and vault.

### What I did

Read the parent design and source, created the docmgr ticket, commissioned the independent design and preserved its public output and model receipt. Pinned application input to the production prelude, including its seeded xorshift RNG. Seed 5172 places the first food one cell in front of the reset head.

### Why

A full semantic snapshot allows receiver restart and coalescing. A substituted game model could silently change tail-entry, reversal, or scoring behavior.

### What worked

The isolated commission ran with `claude -p --model opus --effort high --tools ""` and returned one result from claude-opus-5-5. The design predates the first result and has a digest.

### What didn't work

First import via `python3 scripts/03-import-opus.py ...` raised `AttributeError: 'list' object has no attribute 'get'`. The authenticated binary returned an event list. The importer now selects its final result, verifies the model, and excludes account metadata from the repository.

### What I learned

The current kernel retains the producer's serialized screen, then embeds it directly under the frame field in a second JSON envelope. Report sizes at both boundaries. The compositor already performs band-based differences for full paint, so fewer brush writes need not reduce panel transfer.

### What was tricky to build

Control and candidate need the same mutable state before the next timer event. Instrument only the prelude's test harness copy, then use the existing callbacks.

### What warrants a second pair of eyes

The original Opus plan's proposed timer status, full redraw link cost and prediction of template keyframe requests require separate interpretation against the source. Its host timing gates need device qualification.

### What should be done in the future

Run the frozen host protocol and send qualified frames to the director's shared raster harness.

### Code review instructions

Read `scripts/04-protocol.md`, the Opus design, `scripts/01-opus-design.txt`, the exact commissioning command and `various/opus-design-receipt.json`.

### Technical details

Base source revision at orientation was `80cc2512f2605da5dae5108703a88c1eb8aaee53`. Screen byte comparisons use UTF-8. The display dimensions are 320 by 320 and pixels are two-byte RGB565 values.

## Step 2. Run source callbacks, qualify the receiver, and paint the changed cells

I recorded 234 real input observations, including 200 autopilot ticks, followed by two separately labeled near-capacity fixtures. The private prelude hook exposes the same state to the ordinary screen and the semantic producer. Running the source again from the same seed reproduced every action, state and frame. Twelve observations left the serialized screen unchanged and would be suppressed at the kernel comparison.

The incremental painter executes actual production C raster and diff code. Every candidate frame was compared in full with the output of the independent shared oracle. Paint, commit and the subsequent delivery have separate correctness and cost boundaries.

### Prompt Context

See Step 1 for the user prompt and assignment. **Prior commit** `72555fb` contains the design and operator's pre-measurement protocol.

### What I did

- Exercised the actual prelude, reset, real RNG, keys and timer. Generated byte-for-byte reproducible source and semantic NDJSON with `07-measure.mjs`.
- Compared general JSON and V8 binary trees against semantic JSON and validated 10+2n binary records. Kept the authenticated design's specialized command encoding distinct from the implemented V8 general serializer. Switched the candidate codec from Node buffer helpers to portable Uint8Array and DataView, reran its host timings, and packaged the same codec for the director's QuickJS board harness.
- Ran three separate instances of the common full compositor and native raster oracle. Verified raw 204,800-byte files across A/A and semantic arms for all 236 rows. Executed 12 alternating-order instances of the native partial-paint comparison, plus publication gaps, a cold start at row 75 and lost display transfers on movement, growth, collision and restart.

### Why

The source's original view was the reference. Keeping the partial painter independent of the full-frame buffers means a mistaken origin, stale head or incorrect tail would appear as a pixel difference. Kernel equality happens before display flush and cannot establish panel recovery by itself.

### What worked

The whole corpus passed tree and RGB565 equality. Every one of the 196 changed ordinary movement observations in the timed population moved exactly 363 pixel values. Transferred areas in those draws ranged up to 4,008 pixels despite identical changed-pixel counts. The drop during the manual downward turn left 363 stale panel pixels. The simulated driver repaired all 102,400 panel pixels at the next explicit draw, even though its expected image stayed constant.

### What didn't work

The first `git add` in this workspace failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. With approved Git metadata access I staged and committed this ticket alone. The first sandboxed invocation of `node …/04-screen-oracle.mjs …` failed with `Error: spawnSync git EPERM`. Approved local subprocess access allowed its fixed C driver to compile and execute. With `-Wall -Wextra`, the existing font table emitted missing-initializer warnings for optional advance tables; the C fixture and checked raster results passed.

### What I learned

The measured (17,52) board origin, real 11-pixel interiors, over-transfer and implicit full-frame recovery corrected prospective assumptions. The compact receiver has enough information to paint after ten lost publications or without any old application state. It does not need a separate application keyframe. Native raster timings do not include the JS construction/layout stage.

### What was tricky to build

A filled body segment changes color when the head advances. Updating only the new head and removed tail leaves the old head red. The procedure compares visual roles across all 396 cells and sends changing cells to production fill operations. It falls back to the full production command stream on header, score or overlay changes. Old and new occupancy consume 396 bytes each.

### What warrants a second pair of eyes

Ordinary source frames, constructed capacity frames, draw requests and deduplicated publications have different denominators. Every simulation draw explicitly requests paint, including the next draw after a skipped flush. The scope excludes battery/clock/banner changes and the neighboring app shown after an actual focus switch. Two full pixel planes and a host-only simulated panel are outside semantic decoder scratch.

### What should be done in the future

The director received a bounded 12-state capsule that uses the actual screen and shared candidate implementation. Any result returned from that capsule is limited to producer/receiver CPU and memory at its measured boundary. A device timing of the photo-visible interaction is a separate experiment.

### Code review instructions

Start in `05-replay.mjs`, `06-semantic.mjs`, `09-damage.c` and the shared compositor oracle. Run this ticket's `scripts/11-run.sh /tmp/snake-rerun` from the repository root. Diff the resulting replay hashes and summarize timing distributions rather than expecting clocks to reproduce exactly.

### Technical details

Two independent maps of 396 cells cover all board roles. Admission reserves a disjoint cell for food, so cap 395. Two raw records can occupy 1,600 bytes; the validation occupancy array adds 396 bytes and the reconstructed JS objects cost additional host/runtime-specific memory. Full source-body totals over 222 publications were 164,581 bytes; the complete raw candidate transmitted 7,732. Wrapped candidate bytes, which matter on the existing JSON channel, were 26,790 against 173,461 for the enveloped control.

## Step 3. Reproduce the full run, measure host QuickJS heap and review the article

I ran the published command in a fresh directory. The resulting original-source hashes, event trace and RGB565 identities matched the archival run byte for byte. The separate System study had built an allocator meter for precisely the QuickJS runtime used by the shared board capsule, so I repeated the 12-state capsule comparison on that host meter while the director prepared the physical image.

### Prompt Context

See Step 1. **Commit (code)** `0c42703` contains the reproducers, raw observations and full-pixel checks.

### What I did

Ran `bash scripts/11-run.sh /tmp/picocalc-snake-independent` from the repository root using the full ticket path. Compared `events.json`, `replay.json` and `pixels.json` with the first run. Ran `15-host-quickjs.sh` to launch five fresh 64-bit host QuickJS processes per arm (one complete 12-state block per process). Captured Opus's report and diary, checked each against the receipt, source and stage boundaries, and prepared specific factual corrections for final editing.

### Why

A whole-arm high-water observation is distinct from a bound on the decoder's private buffers. Running identical fixture code in each fresh runtime holds fixture residency constant. The 12 cases match the physical capsule, while the V8 experiment samples a wider moving trace.

### What worked

The same resident charge, 260,992 bytes, was present after capsule initialization and GC for all arms. Above this baseline, the host allocator charged 12,864 bytes at peak for J and 3,888 for either complete semantic form. Each arm returned checksum 463. The full host replay reproduced the original three durable identity files exactly.

### What didn't work

The host draft described the framebuffer commit and display SPI delivery in one step, and used placeholders for the food and best words in the worked binary record. Source review separated the operations. Reading the exact seeded turn supplied food index 112, best zero and the full 20 bytes `0101050070000a000000cd00b700b600b500b400`. The researcher's diary also received a correction to the turn order leading into self-collision: down, left, up.

### What I learned

The current playable configuration compiles Snake and the compositor with CJI. The physical QuickJS capsule will evaluate the source-side algorithm and its candidate receiver on the board. It does not reproduce the native CJI app-to-compositor delivery.

### What was tricky to build

Measured peak includes the benchmark call and receipt in one runtime. The 9,231-byte capsule and its 27,964-byte host QuickJS bytecode carry all three arms and their fixtures; these are not the marginal install costs of an application view. Peak applied to the specific 12-state fixture, not to a worst-case 395-segment record.

### What warrants a second pair of eyes

Fresh-runtime allocation accounting is Linux malloc usable size plus eight bytes per block. The reported median is above a measured all-arms resident heap. Neither that resident baseline nor its peak is an on-device heap measurement.

### What should be done in the future

Incorporate the director's independent board timing and reconcile the article's scope and worked example before handing over the publication.

### Code review instructions

Compare `15-host-quickjs.sh`, the System ticket's `14-host-heap.c`, `various/host-quickjs.json` and the Snake capsule. Verify that each initial state hashes to the committed reference and use the original report and diary receipts to distinguish authored text from later amendments.

### Technical details

The host timing results in this step use one fresh QuickJS process per arm/trial. The paired raster results in Step 2 use the actual C fill and commit routines. Both are independent of the Node timing series.

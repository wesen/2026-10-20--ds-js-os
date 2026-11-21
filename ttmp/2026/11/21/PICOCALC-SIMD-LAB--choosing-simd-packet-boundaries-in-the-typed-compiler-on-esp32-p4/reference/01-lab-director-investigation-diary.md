---
Title: Lab director investigation diary
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T16:32:45.906588103-05:00
WhatFor: ""
WhenToUse: ""
---

# Lab director investigation diary

## Step 1: Freeze the workload and assign measurement ownership

I divided the study into ray kernels, trace evidence and physics workloads. One operator owns the board. I own the preregistered selection study and publication review. Every lane has a separate scratch checkout and its own stateful REPL session.

### Prompt Context

**User prompt (verbatim):** [Research commission](../sources/research-commission.txt). The subsequent six numbered experimental assignments are tracked individually in the design and task list.

**Assistant interpretation:** Run the experiments, build usable compiler evidence and test on actual hardware. Commission actual Opus High investigators and independent review.

**Inferred user intent:** Determine how effectively the compiler chooses a boundary between vector and scalar operations, including on a previously untimed workload, and preserve reviewable methods for students.

### What I did

Created the docmgr ticket, assigned isolated researchers, checked the existing emitter and public API, and froze a cost rule and a held-out collision workload before any new timing data. The implementation and preregistration are under scripts/director and design-doc/05 respectively.

### Why

Comparing two source algorithms, memory layouts or different iteration orders would conflate the compiler with the algorithm. Identical-output controls and a held-out benchmark make the scope of each result explicit.

### What worked

The board operator identified the board outside the restricted device namespace. Prior captures and source explain the existing aligned eight-lane producer, scalar consumers and signed boundary.

### What didn't work

A shell expansion in the initial sandbox probe produced `zsh:1: no matches found: /dev/ttyACM*`. The board operator checked the actual host node and USB identity; this failed probe was insufficient evidence about device availability.

### What I learned

A packed emitter already exists behind explicit compile options. Its per-function operation stream has enough information to test a small selection rule without duplicating the parser.

### What was tricky to build

The cost rule needs a prior for an unknown trip count. We fix it to 32 and deliberately include inputs of length three that can never fill a packet. The experiment can expose the consequence of that decision.

### What warrants a second pair of eyes

Board file identity, trap prefix, the range where signed saturation preserves meaning and whether packet population measurements describe real dynamic execution.

### What should be done in the future

Implement the frozen selector and run its generated images, qualify the evidence provider and the three independent reports before publishing.

### Code review instructions

Check the cost weights and unknown-bound convention in scripts/director/selector.js against the premeasurement commit. Check each study’s fixture and timing boundary independently.

### Technical details

The current ray code has a contiguous input producer but irregular table consumers. The original board physical observations are six matched blocks per pose. New measurements use independent trials. Sources consulted include LLVM VPlan, Espressif’s PIE introduction and Erin Catto’s SIMD Matters.

## Step 2: Compile the held-out experiment and measure two packet boundaries

The frozen cost rule now drives the native backend through an opt-in per-loop callback. The first experiment on the held-out collision function compiles each ordinary, grouped scalar, grouped PIE and selected image independently. The host compares selected and forced output bytes. The board checks the result of every timed call and separately recompiles the same sources in fresh QuickJS runtimes.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Decide how much of a proved loop should execute as packed operations and verify the choice with identical inputs. **Inferred user intent:** Treat host predictions and P4 outcomes as separate research evidence.

**Commit (code):** `acbb1ec` freezes the selector; `9a1ff99` adds the streaming compiler hook and fixture builder.

### What I did

- Added a selector callback after the original structural proof. Applied it before constructing the packet emitter. A rejected predicate or a stock selection leaves an ordinary native body. Tested both streaming and buffered frontends and equality with every forced image.
- Wrote a squared interval penetration function. Compiled three versions with distinct compile-time knowledge of the number of bodies. Generated the exact assembly for direct physical calls and independent Wasm expected values. Measured fresh on-device compile time with the production QuickJS source, an SPIRAM allocator and a separate runtime for every observation.
- Checked the vendor assembler spellings for horizontal unsigned minimum and maximum and an immediate lane extraction. Implemented experimental emitters that skip all-miss packets and keep eight full-hit results in a vector register until their scalar checked continuation consumes them in order.
- Independently ran the 160 opening rows and pathological capacity, tail, upper-half and observable write cases. The evidence researcher independently instrumented the actual emitted addresses. On opening, 2,111 empty packets predicted 16,888 avoided scratch loads; the measured reduction was exactly 16,888. The 742 full packets predicted a further 5,936 removed scratch loads, also observed.
- Supplied physical frame and dynamic length follow-up harnesses after the first data. The new gate returns directly to the ordinary scalar routine for input lengths below eight. Its thresholds and new lengths were chosen after the preregistered result and belong to a separate experiment.

### Why

Guest counters and a source proof establish mechanism and semantics. Full-frame timing checks application relevance. The exact same register extraction can improve a hot inner loop yet cost enough instruction memory to lose on a larger workload.

### What worked

For the three held-out source variants the selected raw images matched forced PIE byte for byte. The first physical selector trial agreed with its expected mathematical result across all 270 timed observations. Every one of the 48 cold compiles produced the expected fingerprint and length. At three dynamic iterations, full packets could not execute and the static prior chose a slow path.

### What didn't work

The first assembly probe used `esp.min.u16.a t6,q1` and gave `illegal operands`. The accepted spelling places the vector first. A first assembly export emitted an unmatched `.option pop`; the operator balanced it while staging and I corrected the generator. Both versions generated identical row instruction bytes. The first protocol reviewer client received a list of CLI events and attempted to read it as a single result; it failed with `TypeError: list indices must be integers or slices, not str`. The commissioning script now selects the final public result and records a copy for recovery.

### What I learned

The frozen policy picked PIE on every evaluable collision fixture, so agreement on 12 of 15 cells gives it the same predictive power as always asking for PIE here. Its worst observed excess was 24.08% over the fastest median. The same result provides a concrete, separately testable runtime versioning hypothesis.

### What was tricky to build

In the fully hit path the loop body may read the current source induction variable and may trap after a visible write. Duplicating the continuation requires storing each new induction value before the next copy and preserving the order of individual checked accesses. Testing only final pixels would miss incorrect partial state on a trap.

### What warrants a second pair of eyes

Check that each pose comparison pairs by block and reports physical units. Check effects hidden in a solver batching change. Check the distinction between physical time for a held-out collision kernel and the complete time required by the full application.

### What should be done in the future

Verify actual full frames and the runtime length sweep, and preserve the negative selector result even if the follow-up succeeds.

### Code review instructions

Start with the fixed selector and its unit tests, then the ticket's director image and scoring programs. Study the separate evidence collector when reproducing PC totals. The classification trial patch is preserved against a specific base revision.

### Technical details

The baseline, empty and full opening rows execute 3,131,435, 2,983,602 and 2,954,486 guest instructions respectively. The row occupies 1,688, 1,712 and 4,064 bytes. Full uses immediate extraction for eight known active lanes. The full-frame follow-up has independent output-plane hashes generated by WebAssembly on the original twelve inputs, including two nontrivial strides.

## Step 3: Qualify a supported compiler option and ask the board which boundary actually pays

In the full application the smallest positive change won. The larger candidate eliminated exactly the predicted scratch traffic, yet took more time. The independent examiner also noticed that two pairs of named poses differ only in their light, which the primary pass never sees. I corrected the interpretation to twelve distinct complete-frame inputs and ten distinct primary inputs.

### Prompt Context

**User prompt (verbatim):** “Measure empty, mixed and full packet frequencies, scratch traffic and cycles per packet.” [Full lab commission](../sources/research-commission.txt)

**Assistant interpretation:** Trace the executed operations, measure isolated packets and the whole application separately, and promote a candidate only with its precise scope of qualification. **Inferred user intent:** Make the researcher able to reproduce the decision from source and measurements.

**Commit (code):** `502113b`; precursor fixture and scored collision trials in `9b02231` and independent evidence presentation in `db499de`.

### What I did

- Scored all 432 complete or primary device observations and the 234 length-dispatch records from the second image. Exported the raw records, the scorer and the per-condition tables. Started another isolated Opus outcome review and an independent Astra examiner. They each received a fresh stateful REPL.
- Added `pie-empty` to the optional public compiler interface and to the per-loop policy return grammar. The source of the trial generator still uses `git show 9a1ff99:...`. Changed the new test to compare the *entire* measured machine image. Left the larger full-hit mechanism in the reproducible historical patch. Neither choice changes which compiler the playable firmware runs.
- Repeated the production Typed test suites using `node --test picocalc-os/tests/typed*.test.mjs` outside the restricted subprocess environment. All 16 tests passed. `go test -race -count=1 ./...` and `go vet ./...` passed. Running the historical image and held-out generators in a fresh directory reproduced both committed manifests byte for byte.
- Loaded the full timing datasets in batches into a persistent sandbox, connected image identities to the per-loop cost prediction, and evaluated the physical and emulated cells myself. Checked median, paired statistic and number of wins. Created a figure with separate axes and denominators for complete frames and primary passes.
- Reviewed the physics recognizer's recorded positive and negative source fixtures, its fallback path and the binding of its machine code to the actual flashed firmware. Asked the hardware researcher to isolate the individual costs of empty, mixed and full packets. Supervised the return to playable firmware after the physical trials.

### Why

Eliminating a scratch read trades against other operations. Independent verification by three different routes—counts per machine address, rotated paired device measurements and a separate calculation on raw trials—helps identify which conclusion depends on which route.

### What worked

The default frame improved in every paired block and the candidate won at every pose. The full variant lost to the smaller one in every comparable complete-frame block. In the separately identified follow-up a runtime gate reduced excess cycles over best fixed from 23.03% to 1.92% at length three. The separate examiner's mixed-lane probe forced substantial register spills and a trap following two observable changed bytes; the optional compiler preserved both behavior and memory.

### What didn't work

The first final-review Claude session executed its authorized query but returned a provider error tagged `reasoning_extraction` instead of a manuscript. I narrowed the request to measured project tables, a short public REPL operation log and a technical results article in a new isolated session. In a separate local test, sandbox subprocess restrictions caused `typed-inspect.test.mjs` to fail as a top-level suite; allowing the CLI subprocesses produced a full pass without changing the test. The observed size of the shared QuickJS allocation high-water mark does not resolve incremental policy allocations below that maximum.

### What I learned

The physics compiler can recognize a meaningful fragment and select a measured, profitable implementation when arrays already have the required layout. The ray compiler has an even larger scalar code-generation problem. The hand scalar control used about one twelfth as many cycles as generated skip-empty on the opening rows. The experiment changes too many variables to attribute that ratio to one transformation.

### What was tricky to build

The host and hardware see different program addresses after linking. Raw function code and matching relocation targets established physics identity. In the ray experiment, old and new complete image SHA-256 values bind the emitted instructions to the counters; board instrumentation executes the same compiled arrays at relocated addresses. Median marginal times also do not subtract to the paired median: the opening six frame differences were 595, 502, 465, 561, 515 and 467 microseconds, whose median is 508.5.

### What warrants a second pair of eyes

Code placement in flash is fixed within an arm. Very small timing differences can reflect cache or alignment. The strongest claim about the held-out cost model is its failure to beat always-PIE; the post-hoc length experiment is a follow-up, not independent evidence for a model chosen in advance.

### What should be done in the future

Independently vary code placement. Isolate the scalar effect of row-wide admission and register-held invariants. Bring the experimental particle recognizer into streaming compilation and evaluate its cold cost and a fresh simulator.

### Code review instructions

Review `typed-pie-loops.js` with the byte-locked regression test, then compare `scripts/director/08-score-frames.py` and the independent examiner's REPL cells against the raw rows. Start the shared workbench using the commands in the evidence study. The live director session is recoverable from `scripts/director/09-open-lab-session.py --keep`.

### Technical details

The best integrated choice adds 24 bytes to the measured row. The complete image digest is `9a4a2356a86beee281fb79dcc199bc2369b819ef9b0a5f5c28d444ff4719f26f`. The whole-frame witness checks a 32-bit FNV-1a per output plane and end sentinels; host tests compare complete visible memory. The frame timer excludes output validation, workspace initialization, serial logging and display presentation.

## Step 4: Publish the research and answer the direct C comparison

The director, three Opus High researchers, an independent Opus reviewer and an Astra examiner produced six articles. The examiner independently repeated the paired frame calculations and generated a separate Typed input with live values, spills and a trap following a write. I added runnable report-specific JavaScript and requested a fourth physical experiment when the user asked for the current C comparison.

### Prompt Context

**User prompts (verbatim):** “do the reports include the repl commands JS scripts?” and “how fast is our raytracer compared to the C version?” The user also confirmed “Upload the five guides”.

**Assistant interpretation:** Include a usable command, a complete query and its saved source with each article. Obtain a directly paired answer for the compiler's current image and publish the actual measurements. **Inferred user intent:** Enable researchers to rerun each result, learn from the compiler work, and understand the current product gap.

**Commit (code):** `140b2a9` records the ray research; `548348b` adds six tested in-article cells; `3d40a97` records the new C comparison in the report and live worksheet. The vault's verified remote commit is `c0180a68473d660448dd76492acefb7b3efdd596`.

### What I did

1. Reviewed the departments' articles against their scripts and independent measurements. Recorded the failed attempt at the outcome-review article and recovered the successful resubmission's public JSON correctly even though it included introductory and trailing prose. The protocol and results review each retain the author's verifiable queries.
2. Commissioned a separate examiner and corrected the number of distinct primary inputs. Made the units explicit on each frame and length summary record. Summed matched class-microbenchmark timings by scene and block. Counted the opening 50,400 negative-row iterations from board fixture bytes. Replayed the numerical researcher's 458,752-case saturation oracle.
3. Added one standalone JS file per article. The shell command opens a fresh stateful workbench and feeds the file into `go run ./cmd/trace-repl eval`. Executed every cell against a separate session and checked its result. I also fed all six through the actual CLI and compared their JSON values with the saved replies. After adding the C treatment I repeated the six session checks and explicitly ran the updated director file through the CLI. The final director sandbox is `session-b0cfa51a-1d3d-45e5-b069-4795fd7bddb0` on `127.0.0.1:3794`.
4. Published all articles, the actual JS sources and the chart to `go-go-parc`. Verified the remote main hash using `git ls-remote origin refs/heads/main` and confirmed a clean vault. The five design guides were separately uploaded to the user's authorized reMarkable folder. The service returned `OK: uploaded Choosing SIMD Packet Boundaries on the ESP32-P4 - Design Guides.pdf -> /ai/2026/11/21/PICOCALC-SIMD-LAB`.
5. Compared the exact supported Typed image with optimized production C and hand-PIE C in six treatment orders, on twelve fixture labels, with complete-frame and primary entry points. The operator verified each actual output byte against the scalar reference, including padding and guards; the independent Wasm output checks were also applied. I independently parsed the 432 raw rows and obtained identical medians and ratio ranges. The final diagnostic was replaced with the verified playable application and partition table.

### Why

Historical C timings differ across builds. Dividing the most recent Typed time by a C time from a previous firmware gave an approximate answer that understated both directly paired ratios. Same-run controls answer the user's actual question.

### What worked

On the opening frame the new unmodified-source Typed image took 55.718 ms, scalar C took 7.9015 ms and C with the PIE row took 6.806 ms. The median paired Typed/C ratios were 7.0523 and 8.1874. On the primary entry they were 3.3063 and 4.2950. The final health check saw the original playable image SHA-256 `e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5` and all eight worlds.

### What didn't work

The initial reMarkable upload was held by automatic review because the current lab commission named the vault; the user explicitly requested the five-guide upload and the next attempt succeeded. The standalone class-cost model also failed to predict the sign of the whole hand-row comparison on opening and dense. The article publishes those failures alongside the positive results.

### What I learned

The compiler-only experiment and the fastest earlier rewritten-Typed program answer different questions. The earlier combination of projected sphere spans, scheduled shadow rows and specialized division produced 29.975 ms and needs its own paired C controls. The full C gap includes workspace and control-flow differences. The next compiler study should isolate a general, legal way to skip sphere rows or retain loop invariants.

### What was tricky to build

Benchmark counts, ratios, reciprocal throughput and end-to-end display times have different units. I kept the raw phase and arm in each programmatic result and tested the JS cells against the published values. The example code in the vault is also linked as a separate local asset. Both the ticket and the vault can be read independently.

### What warrants a second pair of eyes

The single physical target and fixed placement of each linked arm bound the conclusions. Current C scratch uses its normal stack and Typed scratch uses its usual external buffer. This comparison measures those real implementations together. It does not identify one isolated cause of the difference.

### What should be done in the future

Add a separate proof for whole-row elimination and test it against plain scalar, empty-packet and hand-scheduled controls, including a first-invalid-access case. Freeze a second physics or collision workload before fitting a new cost model.

### Code review instructions

Open the published synthesis first, then run the included `01-boundary.js` cell in a fresh session. Verify source and code fingerprints, compare physical raw records in `various/ray/typed-vs-c-rows.json` with the matched scorer, and follow the separate operator and reader diaries. All ephemeral firmware and publication staging can be regenerated from the checked-in sources.

### Technical details

The design delivery is a single cloud PDF containing the five guides in order. The Git publication contains six Markdown files, six standalone JavaScript files and one PNG. Scalar C and C PIE preserved their own scratch behavior, sharing PSRAM output and timed output contract with Typed. The final report distinguishes on-device compile milliseconds, render-to-memory microseconds, cycles per packet, executed guest instructions and static code bytes.

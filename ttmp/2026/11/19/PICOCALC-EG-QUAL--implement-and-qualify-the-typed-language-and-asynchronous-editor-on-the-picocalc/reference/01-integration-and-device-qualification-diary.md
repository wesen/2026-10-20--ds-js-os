---
Title: Integration and device qualification diary
Ticket: PICOCALC-EG-QUAL
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:26.213776286-05:00
WhatFor: ""
WhenToUse: ""
---

# Integration and device qualification diary

## Step 1: Freeze the shipping compiler and start the control builds

I separated the public language from the application that will exercise it. The unmodified Editor and its compiler must be available for a direct comparison after other researchers edit the production sources. I pinned a detached build to revision `289281c`, which closed the previous research program.

### Prompt Context

**User prompt (verbatim).**

> do E1-E7 and G1-G4.
>
> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
> Chose opus high for researchers
> Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
> analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation.** Implement the production code and test all eleven named tasks against the professor’s specifications. Commission Opus High independent researchers, use the established Sol implementation team, and publish individual reports and my synthesis after results.

**Inferred user intent.** A new intern should be able to reproduce why the compiler accepts a program, how continuations translate to machine code, and what a user of the Editor actually waits for.

**Commit (code).** The control is `289281ccf97ebe83196ab3c2c38845b99a24a7be`.

### What I did

- Read the acceptance sections in both professor documents and compared them with the earlier Open pilot, which only transforms the initial file read.
- Assigned the production frontend, general continuation compiler and application migration to separate implementers. Commissioned independent high-effort Opus researchers for all three questions.
- Checked the serial device on the physical host, started a fresh read of its factory partition, and launched matched baseline firmware builds from the pinned checkout in isolated scratch space.

### Why

The normal host replays load scripts relative to their checkout. A test run with links into a mutable production compiler could silently exercise a different version from the physical control. The restored 8 MiB factory image is also independent of the firmware rebuilt for this study.

### What worked

The USB Single Serial adapter is present at `/dev/ttyACM0` on the physical host. The baseline image build selected the installed ESP-IDF 5.4.2 toolchain. Production sources, thresholds and target order are recorded in the integration guide.

### What didn't work

A sandboxed `ls /dev/ttyACM*` returned `no matches found`. The authorized physical-host check showed the requested port. The Claude Code default Opus alias twice returned a provider safeguard error for the compiler design sessions. The CLI offered a model change. I launched the same three ordinary software engineering research questions on explicit Opus 4.6 High with the same inputs and settings.

### What I learned

The E5 call graph is shared by forward calls and asynchronous call checking. The three awaitable SDK calls are already present in the production import table. Their metadata can be extended without adding a new kernel interface or a second source of truth.

### What was tricky to build

Radio and filesystem state must survive hardware experiments. The backup reads the partition table and factory program only. The mounted device belongs to the physical host rather than the sandbox’s device view.

### What warrants a second pair of eyes

Check that both ELF and Wasm world entry points use the same SDK descriptors. Compare state lifetimes, including scratch views and scalar fields, at each suspension.

### What should be done in the future

Gather baseline return values, frames and timing before switching firmware. Exercise both compiler targets and both complete application workflows, then publish source-qualified measurements.

### Code review instructions

Start with `scripts/01-opus-research.py`, `scripts/02-prepare-images.sh`, the normal typed-world linker, and the `PICOCALC-NATIVE-NEXT` acceptance tables.

### Technical details

The physical port is independent from the USB UART at `/dev/ttyUSB0`. Board scheduling uses the same shared serial lock as the previous wave.

## Step 2: Qualify the checkpoints and define a whole-search clock

The independently rebuilt control, the language-only Editor and the Editor with asynchronous Open each passed the 24 historical host workflows. The production continuation compiler can now compile real application code that issues a file read, waits for normalization or yields during a search. Its first full-source token array used more than the target QuickJS heap. The replacement retains source spans for ordinary functions.

### Prompt Context

**User prompt (verbatim).**

> what about measuring the performance of teh generated code, are we covering any of it?

**Assistant interpretation.** A generated Editor can take many kernel turns to complete one Find. Measure a whole operation on the handheld and measure the CPU charged to the Editor separately.

**Inferred user intent.** Compare two working programs on the same input and make the cost of suspension visible to a reader who does not yet understand the kernel.

**Commit (code).** The application control is `289281c`. The language-only application is `1357545`. Open first passed at `eb4ef81`, the compiler span change is `0f23617`, and the first complete Open and Find source is `7b321a9`.

### What I did

- Integrated the compiler script in the ESP-IDF typed world and in the host Editor workflow. Ran the 24 historic workflows on three separate frozen checkouts. Preserved the language and Open receipts in the ticket.
- Used the original physical workflow unchanged for application actions and inserted a starting `stats` command to read the Editor CPU counter. Prepared a separate instrumented kernel for whole-document searches and built both observer images. It starts its clock when Enter in the prepared Find prompt reaches the Editor. It stops when that same Editor returns a frame containing the expected position or miss status.
- Read the complete 8 MiB factory partition and compared each experimental partition table with the device backup. Recorded SHA-256 `6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f` for the saved factory application. Confirmed the four design guides were accepted together in the reMarkable folder `/ai/2026/11/19/PICOCALC-EG-QUAL`.
- Examined differing control screenshots with Pillow's RGB difference bounding box. Changed the matched pre-G and G4 comparison firmware to fix only the wall-clock input returned by the port. Scheduling and all reported durations use the hardware monotonic clock. The standard product and unmodified control continue to obtain the actual wall time.

### Why

A guest cycle count for a short literal comparison cannot determine the total time spent on a 65,536-byte document. A user may wait while the Editor is sleeping. Conversely, the serial tool spends seconds moving a compressed screenshot, well after the Editor computed the answer. Starting and stopping inside the kernel excludes that transport.

### What worked

The frozen language checkpoint preserves the original native text under distinct integer annotations. The E6 enumeration adds 36 native words. Open alone passed the 13 Editor workflows and used exactly 71 persistent words. The combined language and app passed five additional direct reactor fixtures, including a canceled timer delivered while the replacement operation is active. The first control native runs took 34.39 and 35.15 ms of total Editor CPU during the small interactive workflow.

### What didn't work

Two captures on identical native control firmware had different SHA-256 values. Both the preview and Find differences fell inside rectangle (612, 10) to (626, 30), in the live clock. An image digest from two different wall times cannot test Editor output. I kept these real-clock samples and made the matched captures share a time input. I also reviewed the first general continuation implementation and flagged whole-file token retention. The original compiler at `62d829f` exceeded 4 MiB under vendored QuickJS on the full staged Editor. Its span-based replacement compiled the same source under the cap.

### What I learned

`WorldState` holds app data and generated frame fields after the compiler itself exits. The compiler heap can shrink by megabytes while the app frame shrinks by a single word. A measure of one tells the reader little about the lifetime of the other.

### What was tricky to build

The physical driver checks successful file reads, normalized bytes, bus error counters, and screenshot transfer CRCs. These validate different properties from a pixel comparison. The new search clock also checks that Enter belongs to the intended prompt and the final status names the actual file. A short-circuit in the clock must not mistake the initial 1:1 status for the later 1:2 match.

### What warrants a second pair of eyes

Inspect the monotonic timestamps in `05-find-observer.inc`, the placement in `run_segment` and the engine counter. The engine interval includes the reactor and its SDK work. Compare the starting and ending published statuses for all three search cases.

### What should be done in the future

Complete matched physical runs on both targets, repeat any failed qualification after diagnosis, and compare the whole search with the small workflow. Document any failed prediction separately from partial or missing data.

### Code review instructions

Start with `03-board-qualification.py` for normative workflows. Read `07-time-find.py` for diagnostic searches, and `09-fixed-wall-images.py` to see the only clock change. `08-host-replays.py` checks the exact Git revision and requires 24 successes.

### Technical details

The dense fixture is 851 copies of 75 printable characters plus CR LF, followed by the nine bytes of `needlezzz`. Its last line is 852 and its total size is 65,536 bytes. An early match for `ext` ends at displayed position 1:2. The final unique `needle` starts at 852:1. A miss for `text text z` forces the search to exhaust its candidate positions.

## Step 3: Recheck source-level claims and qualify the production compiler revision

The seven frontend features and both Editor tasks are in the actual compiler and app source. The first combined rewrite passed the complete historical host suite. Independent profiling then exposed two additional costs, and review exposed a correctness edge case when the program calls `start` on a busy task. I selected the corrected compiler revision for physical qualification. The emitted Editor images remain identical.

### Prompt Context

**User prompt (verbatim).**

> going back to the professor phases, say E1-E9 etc... What's the next big chunk we could tackle?

**Assistant interpretation.** Recommend a coherent follow-up with concrete dependencies, evidence and a device finish line. Continue the approved E/G campaign and its publications.

**Inferred user intent.** Prioritize a substantial compiler construction result and track the difference between a measured prototype, an implemented compiler and a physically qualified application.

**Commit (code).** The initial combined app is `7b321a9`; the final continuation and busy-start correctness fix is `2e4fee1`. The isolated header reuse experiment is `4a054d7`. The research index update and first intern synthesis are `b9a308d`.

### What I did

- Read all 41 tasks in the original professor roadmap and reconciled current E/G work with the measured A, bounded-proof and integration studies. Added a proposed D1/D2 → E9/F1/F2/F3 sequence and defined how E8 could be tested on the new source.
- Ran the 24 historical host cases again on final compiler `2e4fee1`. The continuation implementer checked all three emission modes with 29 deliveries. The Editor implementer repeated five adversarial delivery fixtures and compared the resulting records. The full Wasm and RV32 images still match the first combined source.
- Recorded the E5 physical series separately from the earlier host frontier. The device medians rose from 2,475,846 to 2,539,880 µs, within the agreed 5% target. The absolute 31.4 ms host threshold was missed.
- Compared independent authors' claims against actual `FunctionEmitter.call`, native call fixups, the `WorldEvent` ABI and the exact 10,000-unit fixture. Returned written corrections to the same named Opus researchers. Preserved their original outputs and responses. Compiled and executed the corrected forward-call example; the Wasm export returned 42.
- Published the implementer's language report at vault commit `8689108`; the continuation implementer published `000fa2a`. Published the independent language research at `522f646`. Verified the remote design bundle listing from reMarkable.

### Why

The chip's latency gate applies to the actual compiler interval. A numerical measurement with a correct value but an incorrect interval definition teaches a reader the wrong technique. The same applies to native versus Wasm call resolution and to a completion event's payload type.

### What worked

All 24 workflows passed on the corrected code. The same-Editor host comparison of the two compiler revisions preserved exact linked Wasm and native output. The final compiler avoids evaluating side-effecting start arguments when a task already has an active frame. Reusing discovered signatures in an isolated linked host prototype saved approximately 5–7 ms but left it well above its matched 10 percent host target, so the prototype stayed out of the shipping path.

### What didn't work

The first independent language draft described two simultaneous output streams, a Wasm relocation and a clock measuring full device boot. The implementation selects an engine, encodes a known Wasm function index immediately, and measures the cold compiler call. The first continuation draft treated the Boolean success flag as a handle or byte buffer. I sent precise corrections and requested a rewritten article. The first author's revised example still used `fn`; I changed it to the actual `function` syntax and ran it before publication.

### What I learned

For this compiler, generated-code identity can settle a correctness question about one source program while leaving a substantial question about the compiler's own wall time. The register contents, runtime instructions and persistent app state can all stay the same while a different analysis makes their construction cheaper.

### What was tricky to build

A frozen board job must name the compiler revision selected for the measurement. I replaced only waiting jobs after a check that neither had started using the physical port. The pre-G and final images use the same deterministic wall time and monotonic scheduler. Both search observer builds use that same pre-G or final checkout to keep measurement conditions matched. The test file's name distinguishes both firmware arms and engines.

### What warrants a second pair of eyes

Compare the distinct integer byte identity with the E6 enumeration increase and the physical E5 setup cost. They are three different comparisons. Recompute percentage denominators from the raw series. Inspect receipt `various/host-final.json` and the exact language evidence and author review in `sources/verified/`.

### What should be done in the future

Publish the complete independent search article once the paired physical results are available. Use the ordinary Find, preview and tail-search measurements to decide which resource is the next bottleneck on the device.

### Code review instructions

Start at `scripts/11-compare-workflows.py` for the standard workflow, `14-edit-independent-reports.py` for the peer-review history and `16-compare-search.py` for measured search queries. The report explicitly identifies queries, eyes-on-screen scope and timing boundaries.

### Technical details

The final production Editor has the frozen Wasm module digest `5dfeb5713680bc2c475ed5c530209a98cea40ce152faae5fb11c7de1fff04c65`. The linked RV32 digest for the fixed reactor used by the compiler researcher is `7c182547f28e7e6d9921f2a7df7472c6a44df184b7e5eb0543b40c523e6253bd`. Each digest identifies a particular reactor as well as the typed program.

## Step 4: Separate the physical Editor regression into compiler passes

The matched small Editor workflow finished across twelve boots, six for each source and compiler pair. A second firmware series measures the time each compiler pass takes. We can now identify the part of the compiler that accounts for most of the additional time.

### Prompt Context

**User prompt (verbatim).** See Step 1. The user also asked “what about measuring the performance of teh generated code, are we covering any of it?” **Assistant interpretation.** Measure execution on the board separately from compilation and investigate the addition to compile time. **Inferred user intent.** A compiler change must leave the resulting Editor practical to use on the PicoCalc.

### What I did

I matched the ordinary workflow counters and screenshot hashes with `scripts/11-compare-workflows.py`. I ran the compiler-phase firmware on three explicit cold boots per arm, then replayed `scripts/20-summarize-phases.py --last-per-log` against the corresponding `boot-[123].log` files. I started two independently tested lexical-index hardware builds and a separate measurement of the complete 64 KiB search.

### Why

Equal behavior on the host cannot predict device compilation or execution time. The instrumented compiler gives elapsed microseconds for all passes. The separate, ordinary firmware supplies the actual qualification times.

### What worked

Native workflow CPU changed from 35.03 to 34.80 ms. Wasm changed from 144.35 to 144.30 ms. Both screenshots matched within each target across arms. Native cold compilation rose from 2.646 to 3.817 s. In the instrumented run, 896.5 ms of the 1,179.7 ms difference was inside the asynchronous source rewrite, about 76%. Reading the original program consumed 440.8 ms, scanning operations 181.4 ms and analyzing tasks 160.7 ms. The ordinary frontend added 127.5 ms and runtime setup added 115.5 ms. The eager JavaScript cursor alone reduced native compile time to a 3.503 s median, above the 2.910 s gate.

### What didn't work

The initial whole-document Find setup stopped before uploading the fixture. The Files app's F2 action opened a new unsaved Editor document. Its directory listing correctly contained no file. I replaced the setup with a verified empty directory, a paced serial upload and a separate listing that checks the file's exact size. The first failed trial was restored and archived. The collector now checks the number of completed trials as well as the restore flag.

### What I learned

Printed source generation itself accounted for 57.1 ms. Improving that stage alone could recover only a small fraction of the 906.8 ms needed to satisfy the qualification threshold. The measured cost of reading, revisiting and analyzing the source makes those earlier operations worth studying.

### What was tricky to build

The first capture after flashing can contain an automatic boot immediately before our explicit reboot. I retained the final paired compiler row in each separate capture and verified that the phase durations sum to the normal stopwatch. The host terminal's capture-status logs do not contain serial measurements.

### What warrants a second pair of eyes

Review exact app frame correspondence per target in `various/workflow-comparison.json`. Review the phase call-site boundaries and whether alternate firmware reproduces the same configuration. The short workflow's CPU changes are smaller than the spread of the measurements.

### What should be done in the future

Complete the full Find clocks, compare both tested lexical-index arms on hardware and qualify the selected compiler with the complete app workflows. The chess research ticket now holds separate, independently checked inputs for a fourth app.

### Code review instructions

Start with `various/g4-compile-phases.json`, then read `scripts/20-phase-qualification.md` for where the probe executes, and `scripts/07-time-find.py` for the three complete Find cases. The raw standard physical receipts are `various/physical-before-g.json` and `various/physical-final.json`.

### Technical details

Native peak compiler heap rose from 1,493,644 bytes to 2,256,776 bytes in the clean comparison. Wasm peak rose from 1,545,892 to 2,263,468 bytes. These are compilation allocations. The combined app's 70 persistent state fields refer to its execution-time frame.

## Step 5: Rehearse each faster compiler against the current application catalog

The physical index study recovered 822 ms of the native cold-build regression. Two subsequent host candidates then reduced repeated work in asynchronous compilation. I verified that each candidate can be applied to the current shared project without overwriting the intervening Chess integration.

### Prompt Context

See Step 1 for the E/G objective. The user also requested a substantial typed Chess workload to exercise generated code. I interpreted this as a requirement to preserve the new catalog configuration when integrating compiler work measured on the earlier Editor firmware. The separate Chess ticket holds its own implementation and evidence.

### What I did

I created a clean checkout at 9b6a2f2 for each candidate, staged its measured source changes and compared hashes with the firmware input manifests. I reviewed the CMake change separately because the current file also registers Chess. The only required change was to add the scanner source to the existing typed compiler target. I ran all 24 historical host workflows in each checkout, started both integrated firmware builds, and changed the scheduled acceptance replay to use those builds. I indexed the studies and added the independent device article to the go-go-parc vault.

### Why

The benchmark firmware was based on the earlier G4 checkpoint. Copying its CMake file into the shared tree would remove later catalog work. Reapplying the single build-system change to the newer file preserves both features.

### What worked

All 24 application replays passed twice. The native scanner C source, its header, the compiler port and both modified JavaScript files matched the benchmark source digests. The source-span patch has SHA-256 0862b9a61714ca6992704c8f86cf7ef347b718601ffc3f50ec2e077ddd1b1ddb. The narrow prepass patch has SHA-256 5df3e5876bbbe7d2c26abb5b8ba12c90c00f472ccd665cc961afb3a245bad12a. Vault commit daad20e published the physical index study; f75a58f published the implementer's separate source-span study.

### What didn't work

The first sandbox clone with git clone --local failed to hardlink an object across mounts, reporting “Invalid cross-device link”. A shared local object store worked. The sandbox then denied running picocalc-host with EPERM from Node's spawnSync. Running the same integration workflow in a fresh checkout under authorized host execution produced the successful receipts.

### What I learned

The manual native search on the 65,536-byte fixture completed the early, miss and late cases in 4.516, 183.880 and 54.230 ms. The corresponding Wasm times were 41.515, 1,762.060 and 732.409 ms. The dense miss took 297 editor segments on both engines. Program progress across yields can agree exactly even when each segment has a very different execution cost.

### What was tricky to build

The host replay, physical compiler benchmark and final workflow exercise three different paths. The ordinary replays check the fallback compiler and apps in the shared checkout. The QuickJS native oracle checks token records, diagnostics and emitted bytes. The physical workflow will measure the integrated firmware in a fresh context with the real allocator and event loop.

### What warrants a second pair of eyes

Verify the two receipts against the staged physical manifests. Review the spelling index and source-span lifetimes, especially when parsing fails. Compare the winning physical candidate against the unchanged pre-G manual control.

### What should be done in the future

Complete the generated 64 KiB search series. Select a candidate by the prespecified native cold threshold, then run all six integrated firmware workflows and preserve the verified restore. Complete the final report and publish only the compiler configuration supported by those results.

### Code review instructions

Start with scripts/25-rehearse-integration.py, then read the source digests and the 24 replay results in various/host-integration-prepass.json and various/host-integration-spans.json. The physical index controls are archived in the lexical-index ticket.

### Technical details

Chess remains an opt-in firmware world. Its physical bench has a reserved serial-bus slot after the Editor validation jobs. The separate parser-dispatch experiment kept the language and artifacts intact but did not establish the historical 31.4 ms host gate.

## Step 6 — Verify complete searches on the physical board

I collected all six paired Find cases after restoring the original firmware. The verifier matches each serial completion marker to the recorded counters, recomputes the archived screenshot hash, and checks the capture log's transfer checksum. This matters for long searches because timing only the first turn omits up to 296 later settlements.

### What I did

Ran scripts/19-collect-physical.sh and checked the six rows in various/search-comparison.json. Checked task 62t1 and released the measured evidence to the independent report authors.

### What worked

The native generated Editor scanned the dense miss in 171,667 µs versus 183,880 µs by hand. Wasm took 1,656,603 µs versus 1,762,060 µs. The late native hit took 55,810 µs versus 54,230 µs. Each implementation used one, 27 and 297 segments for the early hit, late hit and miss respectively.

### What warrants a second pair of eyes

Each query has one paired observation per backend. Exact work counts and final screen content can be reproduced. Timing variability needs separate repetitions before drawing a general speed conclusion.

### What should be done in the future

Check the composed compiler candidates against the native cold compilation gate and replay the selected candidate's workflows.

### Code review instructions

Read scripts/16-compare-search.py alongside sources/verified/editor.md and various/search-comparison.json. The physical tail screenshot and timing chart are in various/.

## Step 7 — Screen two complete compiler designs on the PicoCalc

The first generated Editor missed its native cold limit by 907 ms. Reusing tokens brought the gap to 84 ms. I paired two further designs to determine whether an indexed body scan and reuse of original source spans could close it. Both compile the same generated Editor, use the same streaming RV32 backend and include index construction in the measured interval.

### What I did and why

I recorded three fresh boots for each design, verified the firmware image digests, and compared the medians to the handwritten Editor's frozen 2.910113 s ceiling. I added a check that links the eventual production source digests, all 24 host replays, both physical firmware images and all five final device gates. Each final workflow receipt now includes the two flashed image digests.

### What worked

Indexed body inspection took 2.805457 s and 2,701,352 bytes of peak compiler allocation. Adding original source spans took 2.725262 s and 2,528,448 bytes. The source-span version saved 80.195 ms and 172,904 bytes against its nearest competitor. It earned the full six-workflow device qualification.

### What did not work and what I learned

The independent first draft called the physical native engine emulated and treated a fixed native module size as evidence that generated instructions did not grow. I returned the draft to its author with the actual measurement boundaries and the instruction counts for both revisions. A module envelope, the instructions occupying its slot, and the guest's executed instructions answer three separate questions.

### What warrants a second pair of eyes

Check the regenerated comparison against all six raw samples. Check the integrated images against the board receipt before merging the candidate. A new compiler option, runtime binding or host timing input requires its own explicit identity.

### Code review instructions

Read scripts/28-check-qualified-integration.py and the lexical-index ticket's scripts/13-compare-physical-index.py. The final report distinguishes cold screening from full UI qualification and from the historical frontend-only host gate.

## Step 8 — Execute the register instruction-count criterion and qualify a portable frontend

I audited the E4 comparison against the professor's wording. The stock emitter had emitted 18 versus 19 instructions, and only a cost model had predicted equality for a register implementation. I connected the typed frontend to the staged register backend and executed both programs for all four combinations of operand type and result consumer.

### What I did and why

Added the missing inequality branch predicate and value materialization to the staged experiment. A comparison producing a value followed by Boolean negation can reverse the comparison directly. Ran LANGUAGE-E/scripts/20-execute-register-inequality.mjs with signed extremes, zero and Boolean values. The experiment changes the archived register-backend variant and leaves the historical stock emitter measurement reproducible.

### What worked

Each value-producing spelling emitted ten RV32 words. Each branching spelling emitted eleven. The RV32 emulator returned the expected results in 116 executions across both spellings. These are emitted machine words, independently of the earlier cost model.

### What did not work and what I learned

The source-span compiler that cleared the P4 cold limit still took 34.09–35.06 ms in the unmodified professor host harness without its optional native binding. The parser researcher tested the combined direct parser and portable lexer fallback with this exact harness. Its six medians were 24.99, 24.89, 25.25, 25.34, 25.68 and 25.55 ms. This experiment directly tested the portable fallback that a plain QuickJS runtime uses.

### What warrants a second pair of eyes

Check the difference between the unchanged C harness and the optional native index registration. The final combined candidate's frontend digest is d6dc04692d29596a43b6c15414745023aaa8fa4280353a434b8820e65dab9a0b. It needs a new matched physical workflow because the indexed path also changed.

### What should be done in the future

Run that six-workflow device comparison after the reserved Chess trial. Check its firmware digests and current host replay before integrating the exact source or reporting both gates as satisfied.

### Code review instructions

Start with the language ticket's scripts/19-stage-register-inequality.patch and scripts/20-execute-register-inequality.mjs. The parser patch is in PICOCALC-PARSER-DISPATCH/sources/03-parser-and-portable-fallback.patch. Qualification scripts 25, 26, 28 and 29 reproduce the combined candidate and compare the actual artifacts.

## Step 9 — Tie the acceptance criteria to source and firmware identities

I reviewed the professor's exact E4, E5 and G4 wording. For E5 I linked the shipping candidate to the historical timing harness by comparing the actual compiler and C/JS harness digests with the timing experiment's input manifest. For G4 I queued a second full physical Find series using the final candidate. The original generated Editor's results provide an independent functional reference for both engines.

### What I did and why

Recovered the supplied roadmap and course sources that previously existed only in the local working tree. Added a final-audit mode to scripts/28-check-qualified-integration.py. It checks the host clock source and each fifteen-sample session, the 71-word layout ceiling, all six physical Find observations, their counters, framebuffer records, shared input bytes and the two observer image digests. scripts/30-run-portable-search.sh uses the same long-search runner after the short workflow and Chess board windows.

### What worked

The exact host candidate passed 24 existing workflow replays with digest d6dc0469… for the typed frontend. The candidate and controls also passed execution and artifact comparison across 13 compiler combinations. The verified output included 70 persistent fields, SHA-256 5dfeb571… for Wasm and 7c182547… for the linked RV32 ELF. The professor harness source matched both archived digests.

### What did not work

The first final-audit rehearsal reached the missing final search receipt and stopped there, as designed. A comparable test of an earlier source revision cannot fill that receipt. The revised normalizer test was needed because a text-replacement oracle had only compared the terminal state. The independent audit now checks all 10,000 units after each of four settlements against the actual preceding Editor implementation.

### What warrants a second pair of eyes

The fixed wall-time fixture stabilizes the displayed clock. Performance samples use the hardware's monotonic clock. Compare native firmware on physical P4 and RV32 emulation on the host separately. Count sampled turns and final screen checks according to the fixtures that observed them.

### What should be done in the future

Finish the queue, review each final gate, apply the exact qualified compiler patch, and publish the measured synthesis and archival bundle.

### Code review instructions

Read the original Scope E and Scope G documents in PICOCALC-NATIVE-NEXT and the independent reports linked from this ticket index. The professor source roadmap is in project commit 5d7e0e0, and the companion course is in 65129c7. The portable host replay, source hashes and research index are in 75a8bf9.

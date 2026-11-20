---
Title: Supervising experimentalist diary
Ticket: PICOCALC-COMPILER-LAB2
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
LastUpdated: 2026-11-19T21:53:48.752500474-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervising experimentalist diary

## Step 1: Separate the eight questions and test the old baseline through its normal entry points

I allocated the first three Sol researchers to scanning, condition destinations and preserving typed operations. Each wrote a design before changing the compiler. The earlier wave established a fast native candidate and an incremental Files experiment. This protocol asks whether the candidate preserves the broader application suite and which changes help an actual edit on the handheld.

### Prompt Context

**User prompt (verbatim)** “use the same sol/opus subagent config.” Earlier clarification (verbatim) “heap usage is not vitally critical, it's good to keep an eye out but we can definitely trade things off in either direction.”

**Assistant interpretation.** Use GPT-6.2 Sol High for independent implementation and actual Claude Code Opus High for separate design input. Give the board one operator. Evaluate memory jointly with latency, output and application behavior.

**Inferred user intent.** The newcomer should be able to distinguish a measured effect, a compiler model and a failed hypothesis. Preserve negative outcomes and exact replication inputs.

**Commit (code).** Initial protocol and qualification harness; the three study preregistrations are `b6a29e1`, `14c544d` and `3a1acc2`.

### What I did

- Copied the complete assignment into `sources/eight-studies.txt` and pinned the previous wave at `dbe26be`. Wrote the replay wrapper and a separate, tools-disabled Opus CLI dispatcher, one study per prompt.
- Staged the research compiler in a detached checkout, copied the host runtime, ran the professor’s replay suite, and isolated the cause of apparent failures by executing an individual failing Files replay.
- Started the same unmodified replay suite with permission to launch its host subprocesses. Started a fresh current partition-table and factory-image read using the existing backup script. The device is visible at `/dev/ttyACM0`.

### Why

Host replays resolve their compiler imports relative to the checkout. A candidate sitting in a different directory would let a green test exercise ordinary production code. Independent model proposals require separate input before seeing each other’s recommendations.

### What worked

The source digest matched the staged lowerer, and the first replays on the unrestricted local host produced expected Files and Agenda results. Three Sol researchers recorded their designs while the single board was still free. Opus returned separate model-identified responses.

### What didn't work

In the sandbox, Node reported `spawnSync .../picocalc-host EPERM` even though the host child produced its frames. The omnibus runner prints only each failing command’s last two lines. Rerunning one command directly exposed the actual exception.

### What I learned

A replay receipt needs its source identity and its process execution status. A generated screenshot alone did not establish that the parent process accepted the run.

### What was tricky to build

A shared worktree would permit unrelated study patches to contaminate qualification. An isolated checkout needs the existing compiled host runtime and external RISC-V toolchain, while its JavaScript compiler must come exclusively from the pinned trial.

### What warrants a second pair of eyes

Review the pinned digest in the replay wrapper, read any FAIL before accepting the baseline, and ensure the board backup identifies the same partition map as the firmware driver. Check that study 3 reports the observation-only control even if its direct consumer is faster.

### What should be done in the future

Finish native qualification and the physical comparisons, then compose compatible interventions and replay the complete combined compiler.

### Code review instructions

Read the protocol beside `scripts/01-qualify-staged.py`. Compare the original script’s 24 invocations with the recorded outcome. Read `scripts/02-independent-opus.py` for the precise material available to each reviewer.

### Technical details

Staged RV32 SHA-256 `532c5ed74ac6105b98c6a4609bae7f9c551f89e5a19ab36cd0e6faba91745e5b`. Scratch directory `/tmp/pico-lab2-wave`. Raw firmware and serial captures stay there. The committed evidence should contain compiler and output identities, timing rows, and restoration checks.

## Step 2: Freeze two baselines, choose the integration arms and challenge the selection policy

The staged compiler passed all 24 original application replays. The physical board was available, and a new read of its factory region matched the prior backup. Three researchers produced host-qualified study compilers while the board ran two frontend campaigns. A separate Opus High session answered each of the eight research questions before the supervisor combined any data.

### Prompt Context

**User prompt (verbatim)** “what's the editor compile time currently? the best?” and “and files?”

**Assistant interpretation.** Give separate physical measures for cold compilation and editing-session rebuilds, including across-boot variability. **Inferred user intent.** Place architectural experiments in the context of how long the actual programmer waits for an app.

**Commit (code).** `8a73866` freezes the replay result and model proposals. `744efe2` contains the independent held-out generator. `705c3af` adds bounded fragment retention to the incremental Editor study.

### What I did

- Compared a fresh 8 MiB factory backup and partition table, acquired a single serial lock, and ran the scanner factorial and source-span trial for two full physical boots each. Both restored all three native worlds. Passed eight independent Claude Code Opus High proposals to the researchers.
- Wrote and committed a held-out 72-function fixed-point arithmetic kernel generator after the original policy freeze. Evaluated three declaration orders using the frozen policies. Captured each actual compiler output against the admission model.
- Composed the eager cursor scanner, A6 destination lowering, direct typed reads and A7 raw-use register homes. The combined compiler passes the complete 24-replay suite. The four-arm firmware contains production, staged, native-only and combined. Its Editor search kernel uses the exact app text, and the native-only and combined arms emit identical machine words.
- Set up a separate implementation ticket and physical ELF-to-return harness for the 120-function Editor. Uploaded the supervisor and incremental study designs together as *PicoCalc Compiler Lab II - Trial Protocol and Bounded Editor Rebuilds* to the wave's reMarkable folder.

### Why

The final experiment needs two fixed comparison points. Production establishes product impact, while the staged emitter isolates later research changes from its earlier code-size gain. Including native-only separately measures the scanner’s effect on the same final backend. Use counts provide a preregistered simpler register-policy choice for the principal integration test. Loop weighting, bounds proofs over edited source, incremental edits, analysis admission, and await retain their own reference programs and metrics.

### What worked

First-wave staged qualification passed 24/24 and combined qualification also passed 24/24. All eight model returns identify `claude-opus-5-5`; command-line effort was high. The scanner factorial measured 2.157–2.158 s for Editor and 232–233 ms for Files using cursor scanning and token reuse. Independent selection needed 38,016 eligible proof visits across the held-out 72 functions against a primary budget of 32,768. The simple literal and ranked policies both recovered 1,386 RV32 words on each order; source-order recovered 407–1,386.

### What didn't work

My first backup command used a stale documentation path; the script actually lives under `scripts/supervisor/`. I corrected the filename before opening the board. Lazy token text increased Editor build time by about 213 ms relative to eager cursor/reuse, despite reducing source slicing. The extra ranking pass costs 19,008 visits on the independent workload and exhausts a 9,504-visit inclusive budget before proof can start. The loss matters as much as the wins.

### What I learned

The paired scheduler's setup cost dominates small Files differences, while the Editor scanner difference repeats across independent studies. Charging a ranking scan to the same visit budget as the actual analysis reverses the result for small budgets. A reduced instruction count can coexist with a slower compiler because QuickJS runs the lowering algorithm.

### What was tricky to build

Node's sandboxed process-launch error and a real compiler failure produce the same FAIL in the professor’s abbreviated driver. An exact ELF digest and actual guest effects are separate correctness tests. Field reordering needs a guest that observes two different state offsets. Source spans and retained instruction words contribute to different memory measurements.

### What warrants a second pair of eyes

An independent Astra High examiner has been assigned host replay, physical accounting, retention and held-out scrutiny. The eight Opus proposals are advisory. Only independently reproduced claims enter the results tables.

### What should be done in the future

Measure the two backend phases, the incremental Editor and the final four-arm combination, and qualify the remaining suspended workflow. Collect and link every study's published article and guide.

### Code review instructions

Check `various/staged-replays.json`, `various/combined-host-replays.json`, and `various/combined-compiler-inputs.json`. Inspect the three independent orders and their cost-inclusive columns in `various/independent-selection.json`. The numerical source for the previously quoted 43–44 ms Files edit is the first COMPILER-LAB supervisor report, section “An edit through native return.”

### Technical details

The device factory digest begins `6b0e3ba4`. Code for the native-only and fully combined Editor is 12,444 RV32 words in the raw-use policy, against 16,541 staged and 21,886 production. These are static measures; the physical integrated cold times and guest cycles remain separate open observations.

## Step 3: Execute the Editor change and separate bit-identical output from useful work

The four-way scanner trial and its lazy alternative restored the device. Conditions and typed operations then ran through independent physical boots. The Editor fragment image reached a genuine native return, so we can now distinguish a source change that affects runtime behavior from a change whose final ELF merely differs in its layout.

### Prompt Context

**User prompt (verbatim)** “and files?” followed the request for Editor’s current and best compile time.

**Assistant interpretation.** Answer the direct numerical question while continuing the research. **Inferred user intent.** Keep denominators comparable. A new editing session, an already-warm session and a cold boot have different costs.

**Commit (code).** `08ba013` added the pipeline figure and vault renderer. `e351ca6` recorded native execution for the original and all four edited Editor revisions.

### What I did

- Gave the user the verified device cold times for Files and Editor, and the previous 43–44 ms Files edit result. Corrected an incorrect link to the original report.
- Ran the combined compiler on the host. The examiner separately ran the preceding ELF with the new data layout as an independent correctness control. The wrong field assignment was observably different. The upstream data and call sequence remained the actual Editor preview function.
- Checked physical A6 rows against the staged oracle, confirmed both restorations, and submitted the bounded-fragment Editor test to the same board. First body edit generated the expected full ELF, native return and buffer change.
- Retrieved the scanner, condition and selection vault publication receipts. Queued the A7, E8, await, planner transfer, and integrated measurements behind per-study restoration. On the integrated host, all three APIs generated the expected native text and all 24 historical replays passed.
- Uploaded all eight intern guides plus the supervisor protocol onto reMarkable. The provider acknowledged the nine-document bundle in the new ticket folder.

### Why

The native-only and combined arms share the same compiled text. A faster scanner changes the cold build interval, while native execution times for those exact bytes supply a machine/measurement noise check. The matched production and staged arms answer different comparisons. Each is preserved in the integrated firmware.

### What worked

Independent verification confirms the original 120-function Editor body edit can run on the board. The first physical pair measured 2.293 s for a warm full build and 0.487 s with full fragment retention. An independent examiner regenerated all five clean ELFs and validated first-boot mutation effects. A new 72-function selection module exposed proof-budget order sensitivity and the cost of charging the screening pass.

### What didn't work

The lazy scanner produced fewer lexeme slices yet took longer. Two successful techniques can also conflict economically: direct typed reads produced smaller Editor code but paid roughly 0.1 s of additional cold work against staged. The original three study apps cannot by themselves validate general prediction across outside workloads.

### What I learned

An end-to-end delay can fall even with higher resident memory. The cached full-source spelling is unbounded by the separate retained-word cap. The independent negative control enlarged retained text by 8,192 units without changing emitted instructions.

### What was tricky to build

The port is shared between firmware images whose boot-time instrumentation differs. Reusing the same operating-system endpoints, expected image digests and a single serial lock allows different metrics to run without sharing a single benchmark program or corrupting the source of a measurement.

### What warrants a second pair of eyes

For each class of edit distinguish the public artifact parity test from the internal guest procedure. Preview does not refer to the first file-handle fields, so the additional preview-field edit supplies the stronger layout witness. The native workload probes only its specified inputs.

### What should be done in the future

Verify the remaining board intervals and final restoration; complete the relative-versus-absolute comparisons, report all negative results and publish the supervisor synthesis.

### Code review instructions

Inspect the loop ordering in `scripts/03-board-queue.py`, the specialized study drivers invoked in `scripts/04-next-device-studies.sh`, and the gates in `scripts/08-after-bounds.sh` and `scripts/11-final-device.sh`. Each terminal measurement needs two valid boots and a restoration receipt.

### Technical details

Editor’s integrated host output is 12,444 RV32 instructions (−43.14% relative to the 21,886-word production control). Files is 380 (−52.74%) and Agenda’s parser and reminders occupy 2,044 (−49.63%). Their cold times are measured independently. The design delivery record is `various/remarkable-guides.json`.

## Step 4: Validate the physical cost of two guards and publish the negative controls

The research program distinguishes time spent compiling, time spent running the generated program, and time saved between two edits. A candidate can improve one of these measures and worsen another. I checked two studies whose conclusions depend on keeping those clocks and their denominators separate.

### Prompt Context

**User prompt (verbatim).** “what's the editor compile time currently? the best?” and “and files?”

**Assistant interpretation.** Report the best repeatable on-device cold times for both applications. Give the running-session edit measurements separately and identify their full rebuild controls.

**Inferred user intent.** A user choosing a compiler for a physical handheld needs an absolute time and a reproducible configuration. A 43 ms edit and a 232 ms cold compile can both describe Files accurately.

**Commit (code).** Bounded proof measurements and exact kernel verification landed at `c942c3e`, with the completed ticket at `169880c`. The editor edit experiment and its report are at `1ada796`. Register placement receipts and closed study are at `734366a`.

### What I did

- Read the standalone two-guard manuscript against the two-boot results, reviewed the distinction between a full preview replay and the isolated physical copy, and published the exact manuscript in go-go-parc. The remote tip was `31a17a798bc08af9f3a2a0378c561fab6b0a9cbe`. The study author verified the article's byte digest independently.
- Added the real compiler API boundaries and a short version of the experimental protocol to the newcomer report. Added both compile-cost observations for the direct and bounded analyses and the original-source comparison.
- Asked the await investigator to validate the boot boundary before accepting the physical data. The flash auto-boot and explicit reboot both wrote valid compile messages into the same serial capture. The restart uses a tagged reboot, the same compiler firmware and the same serial lock.

### Why

The missing bounds check removes work inside a loop. The extra facts must still be built when no check can be removed. The direct candidate emitted exactly the same complete Editor image as ordinary compilation and isolates that overhead. Using the same guarded source for all three lanes measures the compiler rule. Recording the original source separately accounts for the cost of exposing the guards.

### What worked

The bounded candidate removed 202 or 3,129 dynamically executed checks in the two complete host-loaded previews. On hardware it reduced the measured copy cycles per UTF-16 unit by 9.49% and 9.46%, and increased cold compile time by 8.08% and 10.10%. Hardware firmware was restored and all three native worlds booted. The split between compile and guest time also explains the cost of the register experiment.

### What didn't work

The direct-only proof added about 9–10% to compile time and saved zero instructions on this Editor source. A valid await experiment initially failed serial accounting because the first capture also included a preceding automatic boot. Its parser required exactly one compile event and correctly declined to report the mixed interval.

### What I learned

One check can be hot even in an application with few proven sites. Exposing the extra relation in typed source added a fallback loop. The guarded optimized program is 36 words larger than its unmodified direct-read ancestor despite being four words smaller than its guarded control. Reusing the retained fragments of the whole Editor paid for a different class of user action.

### What was tricky to build

Checking a complete ELF establishes artifact identity. It does not prove that a measured routine used that native text or that the application traversed that particular path. The evidence includes separate code-digest verification, expected state, and dynamic count or cycle observations for each corresponding workload.

### What warrants a second pair of eyes

Inspect the normal and fallback loops, and confirm the memory effects that invalidate the receiver-length identity. Recheck the explicit reboot boundary in the original await capture alongside the receipt before accepting the final four-boot result.

### What should be done in the future

Complete the selector transfer and integration clocks after the await comparison releases the board. Present all eight studies together with their different control lanes, and preserve the restoration receipt.

### Code review instructions

Read the bounded proof ticket's design, normal compiler and argument checks, and the full `various/` evidence at `c942c3e`. Review the same-source counters alongside the pre-intervention code size. The supervisor's `scripts/12-integration-table.py` reports paired changes from the device without pooling separate boots.

### Technical details

The copy benchmark uses 65,536 UTF-16 units per pass. The physical evidence contains 108 checked ELF returns. Complete preview dynamic counts are emulator event counts, and the P4 copy measurements are cycles per unit. All eight study design guides had already been delivered in the supervisor bundle.

## Step 5: Complete the four-way hardware trial and publish the comparison

The final comparison joined the scanner, condition destinations, direct typed reads and use-count register placement. All eight individual experiments had already completed at their own entry points. The integration measured the price of putting the selected decisions into a single compiler and protected the guest comparison by checking complete ELF identity.

### Prompt Context

**User prompt (verbatim).** “how far have we gotten now?” followed by “since the last time i asked you”. For the separately authored physical selector follow-up the user answered “Publish the extra article and chart”.

**Assistant interpretation.** Identify what changed since the prior timing update, verify the combined measurements, and publish the original set of articles and the additional approved supplement.

**Inferred user intent.** The compiler research should identify which changes make waiting for the device shorter, explain where measurements disagree across workloads, and leave useful reports for new engineers even when an approach costs more than it saves.

**Commit (code).** The receipt checks and reproduction instructions landed at `c50e5f1`. The physical selector report is at `58897c8` in this project. The isolated await retry is at `306a987` and its closed ticket is at `4bc4cfd`.

### What I did

- Supervised the await retry. The researcher preserved a validated explicit-reboot trace, captured the second manual boot and two await boots, then restored all three native worlds. Compared complete native output digests, screens, UTF-8 error, canceled read and reopen.
- Ran the preregistered selector transfer for two boots. The archive covers 144 cold compiles across the three actual applications and a binding synthetic program. Compared the true setup, summary pass, sorting and peak allocator values against the independent host measurements.
- Ran the four-arm firmware for two complete boots. Captured 192 cold compiles and 384 batches of 128 native guest calls. Recomputed the paired summaries using `scripts/07-combined-results.py`, compared the files byte for byte, generated the comparison tables via `scripts/12-integration-table.py`, and inspected the chart.
- Wrote and published the supervisor report with two figures, verified the real vault remote, and uploaded the final report plus revised technical protocol to reMarkable. Regenerated the complete publication ledger using `scripts/13-publications.py`.

### Why

A new backend can increase a cold build's elapsed time even when the generated program contains fewer instructions. The native-only arm and the same backend with a different scanner let us attribute the frontend timing on identical code. Restoration matters because subsequent application experiments use the user's normal firmware.

### What worked

The integrated Editor contained 12,444 words against 21,886, used 155.9 KiB less peak QuickJS heap, and reduced search cycles by 65.5% on both boots. Its cold compiler took 2.995 and 3.002 s. The original image digest matched the saved factory image, and Files, Agenda and Editor each started natively after restoration. All eight individual reports, the independent methods article, the supplementary selector article and the supervisor article are present on the verified vault remote.

### What didn't work

The fully combined compiler took more cold time for all three applications. Files paid 31–32% and Editor paid 21–22%. Editor’s selector ranking cost about 1.29 s for identical output. The first await capture mixed an automatic pre-boot compile with the explicit measured reboot. After the audit was corrected, the extra lines were preserved and excluded by the observed reboot boundary.

### What I learned

The largest measured interactive saving comes from keeping compiler work alive between edits. The strongest cold improvement came from tokenization. The strongest measured native execution improvements came from changes to code generation. Their relative value can only be decided using the actual activity a user repeats. A nominal analysis budget much larger than the program's total proof demand gives a selector no work-allocation choice.

### What was tricky to build

Crossing from the compiler's measured footprint into the running application's memory changes which allocator and reservation one should observe. Static words, file bytes and live memory are three measures. Native and combined ELFs were identical for each app although the scanner changed. The final comparison uses equal reservations.

### What warrants a second pair of eyes

The USB board is one ESP32-P4. Both runs use the same physical unit. Guest kernels test directory comparison, weekday and literal search with specified input. Full end-user operations and token reuse after counter wrap need their own evidence.

### What should be done in the future

For cold builds qualify the eager cursor on the production path. For edits refine dependencies on specific record offsets. For scheduled analysis collect cheap eligibility facts during the first parse and measure every visit before claiming a budget or hardware saving.

### Code review instructions

Start at `analysis/01-what-a-compiler-can-afford-on-the-picocalc.md`. Recompute the two-boot arithmetic from `various/combined-physical.json` following the supervisor guide. Check full outputs, source and reactor hashes, the required number of samples, retained guest calls and restored native worlds. Use `various/vault-publications.json` to locate the eight study articles, the methods review, the selector supplement and this report.

### Technical details

The published supervisor commit is `57ea1bcad00326137e3a10a28f56aa7607d1cca4`. An automatic review held the separate supplemental article. A dedicated worktree based on the actual published main allowed the requested supervisor report to ship independently. After explicit approval, the only new remote content was the supplement and its PNG. The final verified go-go-parc main is `777dcfa4ae32f0b037608a67edf574cb641c2ee6`. The reMarkable service acknowledged the report plus guide under `/ai/2026/11/19/PICOCALC-COMPILER-LAB2`.

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

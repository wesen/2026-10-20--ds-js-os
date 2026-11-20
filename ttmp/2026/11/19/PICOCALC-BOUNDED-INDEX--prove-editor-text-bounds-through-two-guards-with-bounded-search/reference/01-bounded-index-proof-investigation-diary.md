---
Title: Bounded index proof investigation diary
Ticket: PICOCALC-BOUNDED-INDEX
Status: complete
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological compiler experiment and qualification evidence."
LastUpdated: 2026-11-19T22:14:06.461688027-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded index proof investigation diary

## Step 1. Freeze a versioned proof and isolate the source change

The Editor's preview code contains an (i < end) loop over UTF-16 text. The compiler needed two more claims to prove its read safe. The assignment asked whether a small bounded search could apply them while emitting one function at a time.

### Prompt context

> Prove bounds through more than one guard. Scope E8. Give the compiler the real Editor case 0 <= i, i < end, and end <= text.length. Can it prove text[i] safe before its fixed search budget runs out? Compare existing checks, direct guard recognition and bounded proof search. Exercise reassignment and control-flow joins. Count checks executed during the 64 KiB preview, alongside emitted bytes and compile cost.

The sixth study supplies the request. The frozen pre-implementation design commit is `35c3047`. I interpreted the task as retaining the old checked copy for rejected spans and holding the guarded source fixed across all lanes. Native proof runs atop the frozen direct text-read compiler from the previous study.

### What I did

- Identified `editorPreviewAppend` as the active copy function, read the E8 proposal, and opened the independent Opus High design review.
- Preregistered an eight-edge query with 24 live relations and separate direct and bounded policies.
- Kept the ordinary signed source types. The concrete proof itself supplies the nonnegative premise that the unsigned check requires.

### Why

Changing the source to make the guard explicit and adding an optimizer in one lane would confound the source change with the proof. Every measured lane uses the guarded source, and the original unmodified Editor is reported separately.

### What worked

The versioned design permits conservative assignment and join handling without a separate whole-function IR. The existing replay detects behavior changes in the complete preview and can drive a native-loader counter.

### What did not work

No compiler failures occurred during the design step. The independent review suggested assuming that some loop induction variables remain nonnegative across increments. This experiment has no wrap analysis, so it tests an explicit lower guard each iteration instead.

### What I learned

`typedSdkView` can update a counted buffer header. Even immutable receiver bindings can refer to memory whose header changes after a call.

### What was tricky to build

Facts entering a loop can be invalid on a second iteration after a call or a record write that follows the read. A bounded lexical scan of the loop prevents using inherited length relations when such an effect is present.

### What warrants a second pair of eyes

Read the treatment of header aliasing, nested loops and effects in logical expressions. A development fixture intentionally overlaps a string header and a record to observe the conservative fallback.

### What should be done in the future

E8's proposed unsigned index syntax and general induction reasoning warrant separate implementation and acceptance gates.

### Code review instructions

Read the design and follow `BoundsFacts.beginLoop()`, `BoundsFacts.join()` and `BoundsFacts.proves()`.

### Technical details

The matched source retains a validated hot loop and the original loop to preserve malformed-span effects. The proof records strict signed upper edges and a lower relation from zero.

## Step 2. Qualify the compiler on safe and trapping paths

The bounded lane eliminated the target Editor read check. Current and direct had byte-identical images for the same guarded source, which offers no directly provable Editor read. A separate fixture with both direct guards verified the policy removes its safe check.

### Prompt context

See Step 1. The verification tests source/control eligibility, machine output and runtime behavior separately.

### What I did

- Tracked local value versions and length terms. Added short-circuit fact scopes and call and record-store invalidation.
- Added static check markers and measured clean word counts alongside them.
- Tested 357 vectors against Wasm, with 94 expected traps. The suite covers version changes, join paths, effects, non-strict upper chains, missing lower bounds and budget exhaustion.
- Composed the analysis with A6 using its branch-plan emission rather than replacing it with the original value-form conditions. The nested conditions fixtures continued passing.
- Generated the clean P4 trial image and verified the copied guest code appears verbatim in the firmware.

### Why

A static proof result by itself cannot qualify safe fallback. Comparing both memory and trap outcomes catches incorrectly hoisted reads or mutations that occur after the first invalid access.

### What worked

Editor has 116 static read sites in current and direct, and 115 under bounded search. Machine words fall from 16,214 to 16,210 on the matched source. The bounded query at `editorPreviewAppend` examines five edges. Test cases that need a ninth edge leave the check in the image.

### What did not work

The first `node scripts/04-verify.mjs /tmp/picocalc-index-final-lanes /tmp/picocalc-typedops-lanes` run reported `SyntaxError: 9:121: expected identifier`. A fixture used a bare `return` inside a braced body. The grammar permits a final function return and an unbraced `if (condition) return`. The updated fixtures use `if (true) return` inside the outer block while preserving the intended reaching facts.

### What I learned

The direct policy needed its own affirmative fixture. Image identity on the real corpus shows none of the queries found a usable direct proof there.

### What was tricky to build

Predicate inference on the right of `&&` can use facts established by the left. If the right side calls a function that mutates a header, later code must lose those facts even when some paths short-circuit. The join and effect counter preserve that invariant.

### What warrants a second pair of eyes

Compare the pre-scan's intrinsic classifications with the actual supported parser grammar and SDK layout. Inspect paths where a receiver local changes or a call can update a header.

### What should be done in the future

Any future length-changing intrinsic needs to participate in effect invalidation. An arithmetic index policy also needs a wraparound proof.

### Code review instructions

Run the host verifier and inspect `fixture.checksByFunction` for each lane. Compare `loopEffect` and `loopRecord` to the effect-free loop.

### Technical details

Whole Editor guarded linked ELF length is 240,452 bytes for all lanes under the same reservation. The clean firmware SHA-256 is `4ccf01fa40af2a8517b0f9c4a1eb62c70bae556bf9e06631e655dfff535c4cd2`.

## Step 3. Count executed checks in two 64 KiB previews

A single eliminated static read was executed often enough to change the dynamic count. The sparse replay avoided 202 checks and the dense replay avoided 3,129. The native stdout digest was identical across policies for each workload.

### Prompt context

See Step 1. Counts cover code compiled into the Editor reactor during the preview action sequence.

### What I did

- Extended the host emulator to count a specific immediate marker. The native lowerer places it beside a read check only in separately instrumented variants.
- Delimited the existing native Editor preview driver with begin and end markers.
- Replayed the existing 64 KiB sparse and dense inline scenarios. Kept the original JS/Wasm and native frame comparisons.
- Preserved the complete output receipt with checked source length, digest, native check count and instrumented instruction count.

### Why

Static sites count how many machine locations contain a check. They say nothing about how often each location executes as the preview advances. The instrumented replay answers that second question.

### What worked

Sparse preview executed 4,740 checks in each control and 4,538 in bounded. Dense preview executed 47,105 in each control and 43,976 in bounded. The same story holds for native retired instructions after removing the instrument markers from the accounting.

### What did not work

The default sandbox run of `python3 -B scripts/05-preview-count.py <work> <output> <P4-GCC>` produced `Error: spawnSync .../picocalc-os/build/picocalc-host EPERM`. The native host process had produced the frame captures despite the error. The approved local-tool retry ran the same script with a fresh temporary output and completed both scenarios.

### What I learned

The actual preview operations exercise spans beyond the copies used to render the first screen. The preview drivers differ in actions and visible data while each policy sees the same document and keys within one scenario.

### What was tricky to build

Counting branches by mnemonic would count unrelated unsigned branches. The reserved no-op marker belongs only to the direct `charCodeAt` check path and the driver markers restrict the profiling window.

### What warrants a second pair of eyes

Inspect the receipt's boundary. It includes all compiled `charCodeAt` checks in the preview workflow and excludes SDK internals and buffer writes.

### What should be done in the future

Measure the real read-site distribution on additional documents before changing Editor source or optimizing more sites.

### Code review instructions

Run `scripts/05-preview-count.py` with a local GCC and examine its saved per-lane stdout and stderr. Compare `semanticSha256` across each workload.

### Technical details

Four instrumented instructions disappear per removed dynamic check. The counted word itself accounts for one of those four.

## Step 4. Qualify cold compilation and the actual copy kernel on the physical board

The current and direct lanes produced the same Editor native output on both boots. The bounded analysis paid a cold compiler cost but reduced the cycles per copied code unit in the clean guest benchmark.

### Prompt context

See Step 1. Host qualification and the dynamic native-loader counters were committed at `5ef7051`.

### What I did

- Compared all 108 complete first- and second-boot return hashes to the host oracle and verified restored native world status.
- Recomputed cold time and heap pairings and checked 24 preview copy timing rows per boot. Each row copies 65,536 code units and validates the results.
- Compared the clean timing routines to the corresponding slices of the full compiled application and confirmed their raw bytes in flash.

### Why

A full preview measurement answers how often the check executes. Timing the clean representative routine separately measures the effect of removing it apart from the instrumentation, display and host workload.

### What worked

Bounded Editor compile time changed +8.08% / +10.10% and peak QuickJS heap changed +1.11% / +1.11%. The paired preview copy effect was −9.49% / −9.46%. Both boots ran at 360 MHz.

### What did not work

The first new whole-app byte check looked for `world.js` in the board harness's two-file compiler lane. Node raised `ENOENT: no such file or directory, open .../lanes/base/typed/world.js`. The check now reads the shared frozen world contract from the original clean compiler bundle. The emitted timing bytes were identical to those in the existing board build.

### What I learned

The removed static site was part of a hot kernel. Its isolated improvement and the full preview check reduction answer different questions. Whole-preview device latency was outside this kernel comparison.

### What was tricky to build

Cycle inputs are native `uint16_t` units. The screen replays instead feed real Markdown documents of 65,536 UTF-8 bytes. Their size labels describe different inputs and both must be preserved with the evidence.

### What warrants a second pair of eyes

Check that the failed-path emitted sequence is still present in the complete application. Use the fixture counters and exact linked ELF hashes to identify the accepted release image.

### What should be done in the future

An unguarded production-source comparison would be needed to judge shipping this particular source intervention. The current study keeps the guarded source matched to isolate the proof.

### Code review instructions

Compare `various/physical-summary.json` to `various/physical.json` and read the exact native preview benchmark boundaries in `scripts/09-copy-trial.c`.

### Technical details

The standard reserved Editor ELF is 240,452 bytes. In that reservation bounded proof changes the occupied native image by four words.

## Step 5. Deliver the guide and verify the standalone publication

The finished guide contains both the full-preview native check counts and the clocked on-device copy trial. The guide was accepted in the lab's reMarkable folder. The supervisor reviewed and published the separate vault article under the user's authorization.

### Prompt context

See Step 1. Project commit `c942c3e` records the physical evidence and reMarkable receipt.

### What I did

- Uploaded `Proving_a_Text_Index_Safe_in_a_Streaming_Compiler.pdf` to `/ai/2026/11/19/PICOCALC-COMPILER-LAB2` and retained the exact cloud acknowledgment.
- Verified the exact article blob at `31a17a798bc08af9f3a2a0378c561fab6b0a9cbe`, its SHA-256 and its reachability from the vault's tracked remote main.
- Recorded the stable links and closed the ticket.

### Why

The immutable article link and PDF acknowledgment tie each output to the completed experiments.

### What worked

Both deliveries succeeded and the article blob matches the reviewed manuscript byte for byte. [Published article](https://github.com/go-go-golems/go-go-parc/blob/31a17a798bc08af9f3a2a0378c561fab6b0a9cbe/Projects/2026/11/19/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Two%20Guards%20Can%20Prove%20a%20Text%20Read%20Safe.md).

### What did not work

The completed delivery checks reported no failure.

### What I learned

The article can report guest cycles and dynamic checks together when it names their distinct measurement boundaries and inputs.

### What was tricky to build

The copy trial feeds 65,536 UTF-16 units per pass. Each complete preview replay uses a 65,536-byte Markdown document. The article keeps both units explicit.

### What warrants a second pair of eyes

Verify the date, destination and exact article revision in the two delivery receipts.

### What should be done in the future

No publication follow-up remains.

### Code review instructions

Read `various/vault-publication.json` and `various/remarkable-delivery.json` alongside the completed guide.

### Technical details

The reMarkable receipt verifies cloud delivery. The vault receipt identifies the externally published Git blob.

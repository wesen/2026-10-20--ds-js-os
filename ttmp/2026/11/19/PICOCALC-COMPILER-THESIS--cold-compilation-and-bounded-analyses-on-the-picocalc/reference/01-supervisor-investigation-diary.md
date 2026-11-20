---
Title: Supervisor investigation diary
Ticket: PICOCALC-COMPILER-THESIS
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T15:44:04.191948911-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary

## Step 1: Commission three controlled compiler experiments

The question is how much compile time and storage the target can afford to spend improving code. I divided the work by compiler boundary so the experiments can measure independent effects on the same inputs.

### Prompt Context

**User prompt (verbatim):**

> we want to focus on compiler improvements vs "systemic" improvements, it's really about novel compiler construction

> ok, launch subagents, each should write extensive diary (see diary format) + take notes +  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).      
>  Commit and push the bsidian vault when done (go-go-parc vault).    once they are done.
>
> Run sol agents or so and supervise them as the thesis supervisor, in fact use astra agents to review their work and help them be innovative and effective and progressive and deep researchers and great implementers. We want to save on tokens so we want to use cheaper agents to implement and work, but really the research should be stellar and as such we need some big intelligence to tie it together.
>
> Yu keep a diary too, everybody should. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

**Assistant interpretation:** Run three implementations, independently examine them, qualify results and publish each researcher's technical article.
**Inferred user intent:** Preserve the derivation and limits of genuinely informative compiler experiments.

### What I did

- Opened PICOCALC-COMPILER-THESIS with docmgr. Assigned three Sol researchers to register placement, reversible changes to the compiler's intermediate representation, and guarded text accesses.
- Asked the leads for independent tests of argument shuffling, mutable aliases, signed indices, output metadata identity and equal-work timing.
- Located the existing host QuickJS objects and the actual firmware compile function. Checked available board transport without resetting hardware.

### Why

A fresh compiler runtime, the running app and the padded linked module all answer different performance questions. Semantic equivalence is an independent gate for every timing claim.

### What worked

The baseline revision is dd69a81. All three workers submitted a design. The proposed correctness cases refer to actual compiler operations used by Files, Agenda's typed parser and Editor.

### What didn't work

My first independent Astra launch returned `collab spawn failed: agent thread limit reached` with three Sol workers active. I provided first-pass review immediately and scheduled the independent examination for the next free slot. The shell sandbox intermittently reported `bwrap: Can't bind mount /oldroot/ on /newroot/: Unable to apply mount flags: remount "/newroot/mnt/pico": No such device`. Scoped host inspection worked. A read-only worlds query on /dev/ttyUSB0 returned zero bytes. The previously qualified /dev/ttyACM0 was absent.

### What I learned

A USB bridge does not establish the identity of its attached board. The existing workstation phase benchmark also preloads a runtime and a compiler, which changes the meaning of cold compilation.

### What was tricky to build

Different researchers consume the same compiler sources while the RV32 lead changes one of them. Pinned control sources and recorded blob identities make the comparisons auditable.

### What warrants a second pair of eyes

Review whether all control-flow paths agree on register homes, whether old length facts can survive alias changes, and whether each representation measurement includes equivalent work.

### What should be done in the future

Independently rerun the candidate and obtain target measurements if the PicoCalc transport becomes available.

### Code review instructions

Start with the experiment design in this ticket and the prior NATIVE-NEXT Scope A plan. Follow each researcher’s diary to the scripts generating their receipts.

### Technical details

The corpus comprises 7 Files, 34 Agenda and 120 Editor functions. Scope A static counts refer to RV32 words in the app, excluding reactor padding. A measured peak must name the allocator and the machine.

## Step 2: Compare cold compilations and execute both modules with one guest driver

The code-size change in f0846ba was large enough to test through the complete native link. I compiled the original ESP32-P4 Editor entry on Linux and supplied the four host services it actually uses. This reuses the firmware's parsing, lowering, linking, allocator accounting, copy-out and teardown paths. The host supplies a monotonic clock, Linux allocation, a JS stack limit and directory-backed bundle reads.

### Prompt Context

**User prompt:** See Step 1.
**Assistant interpretation:** Test each worker's central claim against independent evidence.
**Inferred user intent:** Determine what is credible about handheld compiler architecture while explicitly tracking device availability.
**Commit (code):** f0846ba — Keep shallow typed RV32 operands in registers. Supervisor design milestone b1e128e.

### What I did

- Wrote `scripts/supervisor/cold-entry.c` and `cold-compiler.py`; built the same real RV32 Editor reactor as the existing replay. Alternated the two compiler revisions across 20 pairs, each invocation in a fresh OS process. Checked repeatable ELF hashes per compiler.
- Wrote `scripts/supervisor/editor-steps.py`. For each of four workflows the original replay generates one driver and checks JS/Wasm and RV32 outputs. Reused each driver and the same module pathname across two link products. Used the emulator's built-in RV32_STEPS counter, compared full stdout hashes and checked that the fresh candidate ELF exactly matched the replay's.
- The research guide upload returned `OK: uploaded PicoCalc - Experiments in Bounded Compiler Construction.pdf -> /ai/2026/11/19/PICOCALC-COMPILER-THESIS`.

### Why

Instruction counts in a file weight a cold branch as highly as a loop that executes thousands of times. Guest instruction counts include traffic from both the app and its reactor. Complete-compile measurements account for allocations or work that a backend-only benchmark can omit.

### What worked

- All 20 timing pairs favored the integrated change. The baseline median was 82.678 ms and the candidate 74.701 ms. Median paired savings were 7.660 ms. The Linux allocator peaks were 3,910,760 and 3,402,944 bytes.
- Four guest-driver outputs matched. Late navigation took 73,408,388 and 42,316,056 guest instructions respectively. Occupied code shrank while the resulting ELF remained 240,452 bytes.

### What didn't work

No supported P4 console answered on the host's USB UART. The older 3.14-second Editor board result describes the baseline only. An early two-pair host pilot ran substantially faster than the recorded 20-pair series. I retained all formal samples and used paired comparisons. The onboarding commit's whitespace check flagged spaces copied literally from the user prompt; following entries omit incidental trailing spaces.

### What I learned

Instruction reduction directly changes guest workload cost in these four fixtures. A host allocator counts glibc usable bytes on a 64-bit machine; it cannot supply the P4 compiler heap peak. Neither an emulator step nor a guest instruction predicts a fixed number of ESP32-P4 clock cycles.

### What was tricky to build

The `editor.so` loaded by a fixture must be byte-identical to the ELF produced by the timed compiler in the candidate lane. Fixed reactor inputs, complete output hashes and an identical guest pathname prevent differences between the timing artifact and the replay artifact.

### What warrants a second pair of eyes

Check the timing interval in `p4_editor_compile`, including runtime cleanup, and the guest interval that counts driver setup as well as app and reactor execution. Every run uses a new JS runtime with existing Linux page cache state.

### What should be done in the future

Repeat the same source-and-reactor A/B on identified hardware and report the device's own receipt and allocator totals.

### Code review instructions

Run `python3 scripts/supervisor/cold-compiler.py <RV32-GCC> --candidate f0846ba --pairs 20 --modules-out <tmp>` using the ticket script path from the repository root, then `python3 scripts/supervisor/editor-steps.py <RV32-GCC> <rv32emu> <tmp>`. Compare both receipts in `various/supervisor/`.

### Technical details

The Linux adapter uses the original `typed_p4.c`, `editor_p4.c`, `p4.h` and the project's QuickJS objects. The FreeRTOS queue declaration is the only board type supplied at build time. The emitted byte difference lives inside a fixed-size executable slot.

## Step 3: Cross the two compilers and qualify the evidence for review

The authors measured effects at different points in compilation. One reduced the number of generated RV32 words, the other changed how functions arrive at the native backend. I wanted to know what happens when an ordinary boot compile pays for both together. I kept the firmware entry, editor source and prepared reactor fixed and varied two compiler choices independently.

### Prompt Context

**User prompt:** See Step 1.
**Assistant interpretation:** Supervise implementation, look for interactions the isolated experiments cannot measure, and arrange independent examination.
**Inferred user intent:** Find compiler changes worth testing on the handheld and preserve enough evidence to question the conclusion.
**Commit (code):** 3734cd7 provided the cold compiler harness. f0846ba and 88263e0 supplied the implementations under comparison.

### What I did

- Extended the cold compiler harness to transform either pinned backend with the same native streaming prototype. Built four complete Editor modules in each of 16 balanced rounds. Each treatment occupies every position four times.
- Compared the SHA-256 digest across frontend treatments for each backend, preserved the sample order and receipts, and plotted the cold compiler measurements beside the four guest execution comparisons.
- Examined the three research articles and their evidence. Commissioned two independent Astra examinations once the three Sol implementation reports were available. Split review by the questions of compiler correctness and measurement validity.
- Checked the host's USB identity again. The sole serial-by-id entry resolved to ttyUSB0, the bridge that had returned no response to the non-resetting probe.

### Why

Two isolated percentage changes cannot be added to obtain a whole-compiler result. A more compact representation could coexist with fewer emitted words or it could move the allocation high point elsewhere. The correct comparison runs all four combinations through final linking and compares both the high-water mark and module identity.

### What worked

The original measurement was 54.742 ms and 3,910,760 QuickJS allocator bytes. The combination took 42.233 ms and 1,891,168 bytes on this Linux machine. For each backend the buffered frontend and streamed frontend produced exactly the same ELF. The complete register and register-plus-streaming ELFs can therefore use the same execution evidence.

### What didn't work

The workstation had different absolute latency in the earlier 20-pair run. I kept that series intact, avoided comparisons between series and published the raw trial order for both. The currently enumerated USB bridge did not supply a physical P4 comparison.

### What I learned

The changes affect distinct expenses in this program. The combined compiler used 51.6% fewer peak allocator bytes on the Linux compile. The experimental representation alone changes compile-time behavior even when every byte of the generated program stays the same.

### What was tricky to build

Native emission and source checking are interleaved in the streamed experiment. The frozen transformation must apply cleanly to both backend revisions. Verifying only a raw instruction array would miss import relocations and linker differences, so the supervisor harness asserts complete linked ELF equality for each backend.

### What warrants a second pair of eyes

Examine diagnostic order when streamed lowering raises an error before the rest of the source has been checked. Try held-out control flow, clobbering calls and text-header mutations. Determine precisely which expenses a fresh-runtime Linux receipt includes and whether the balanced order supports the direction of the measured effect.

### What should be done in the future

Use the physical P4 with the same source and reactor for a direct board comparison. Revisit the streaming integration after evidence from the independent reviewers. Source-level type preservation and demand-driven proofs need their own measured consumer.

### Code review instructions

Read the ordering table and digest assertions in `scripts/supervisor/cold-compiler.py`. Compare its per-treatment output to `various/supervisor/factorial-editor.json`. Use `scripts/supervisor/plot-results.py` to regenerate the published figure.

### Technical details

The series contains 64 independent Linux processes. The median timings in milliseconds in stock, register, stream, and combined order are 54.7415, 50.552, 46.285 and 42.2325. The corresponding allocator peaks in bytes are 3,910,760, 3,402,944, 2,396,120 and 1,891,168. The full series retains application, frontend, backend, reactor and module hashes.

## Step 4: Audit the engine build and test the disputed claims independently

The methods examination identified the difference between the resident QuickJS benchmark and the firmware's compiler allocator. When tracing build prerequisites for a fresh checkout, I found that my own Linux harness used an older object directory. I compared both directories before interpreting additional timings. Four objects were identical. The fifth, quickjs.o, differed even after stripping debug information. I kept the original series in the ticket and repeated the entire experiment from a new build.

### Prompt Context

**User prompt:** See Step 1.
**Assistant interpretation:** Use stronger independent review to challenge the evidence and repair consequential reproducibility issues.
**Inferred user intent:** A later reader should be able to repeat the investigation from source and distinguish robust conclusions from measurements that depend on an old workspace.
**Commit (code):** d9631db recorded the first factorial series, before this audit. 07ae1c6 records the examiner's independent bounds tests.

### What I did

- Wrote an object fingerprint script, including a second digest after stripping debug data. Updated the supervisor harness to ask the project Makefile to build the five host QuickJS objects in a new temporary directory. The receipt includes object hashes, the source-tree identifier, the Makefile digest and compiler version.
- Repeated all 64 Editor compiles. Compared the new linked ELF digest with the earlier digest for each treatment. Regenerated the experimental figure from the new series.
- Read the two allocator implementations and the firmware world-compiler entry. Documented that the native-only prototype drops the shared Wasm linker export, and that garbage collection and peak accounting differ between the research harnesses.
- Collected the examiners' evidence about adversarial live values across calls, proof rollback, source order and peak overlap. Added the independent five-treatment results to the synthesis.

### Why

A hash on an output module establishes generated program identity. It cannot identify the executable that spent time generating it. Both are needed here because the scientific claim concerns the cost of compilation.

### What worked

The fresh Makefile objects matched the current build/eng objects exactly. All 16 blocks favored the combination; median paired savings were 12.9815 ms. The four median times were 54.891, 50.112, 46.333 and 41.849 ms. Both ELF digests and all four measured peak-byte values repeated exactly from the earlier series.

### What didn't work

The first visual replay rerun hit `spawnSync .../picocalc-host EPERM` under the sandbox. I retried using the existing project replay with permission to spawn the host simulator. The rerun completed; its full JSON receipt matched the historical four-workflow receipt byte for byte. The earlier assumption that the old cached QuickJS objects identified the current engine build was incorrect; the historical evidence and the repaired comparison are labeled separately.

### What I learned

The two examiners answered questions the original experiments could not settle. Scratch-register poisoning and varied argument counts test the ABI directly. The five-treatment experiment separates dropping unused Wasm writers, removing framing, packing operands and consuming functions early. With the register backend, streaming saves 697,496 peak bytes over packed buffering, which is slightly faster on this host. Program shape changes how long a large function's operation data overlaps the already-emitted native image.

### What was tricky to build

The fresh host engine must use the same flags as the maintained simulator, including the integer-overflow and aliasing flags. Requesting explicit object targets from the existing Makefile reuses that policy and keeps unrelated simulator dependencies out of the timed path. Make output goes to stderr so stdout remains a valid JSON receipt.

### What warrants a second pair of eyes

Check the distinction between cold runtime creation and a cold OS file cache, and between the paired time difference and the difference of treatment medians. An eventual shared frontend must continue to support the Wasm linker and preserve source diagnostic order.

### What should be done in the future

Qualify a shared production implementation of packed operation emission on the P4. Compare buffering and streaming as separate configurations, check both compiler entry points and collect the device's own receipt before choosing the default.

### Code review instructions

Recreate the historical environment audit with `scripts/supervisor/audit-host-objects.py` if the same object directories are still present. For a current reproduction use the cold compiler script and compare against `various/supervisor/fresh-factorial-editor.json`. Review the independent manuscripts for the held-out tests and five-way attribution.

### Technical details

The checked-in QuickJS tree is 1cabf1dfb35d373e4bcad26cf622af05857386d3. The audited older quickjs.o begins e6a9ff95a353; the fresh object begins aedf6248a0b8. Static counts and ELF hashes do not depend on the timing series. The four compiler treatments use the same firmware allocator and clock boundary within each trial.

## Step 5: Publish the reviewed series and verify it against the research record

The source ticket now contains one report, a chronological diary and separate notes for each of the three implementers, the two independent examiners and the supervisor. I prepared the vault edition after the authors' texts were complete, incorporated the independent qualifications into each implementation paper, and linked the studies through the synthesis.

### Prompt Context

**User prompt:** See Step 1.
**Assistant interpretation:** Commit and push every completed report in the go-go-parc vault, with an auditable source trail.
**Inferred user intent:** Make the evidence and decisions accessible to the supervisor and a new researcher without requiring them to reconstruct the chat.
**Commits (code and examination):** f0846ba, c1e3777 and 88263e0 implement the three experiments. The examiners completed their work at c5c111f and 9b3c1f3. 6418393 records the fresh-engine comparison.

### What I did

- Read the six final articles and cross-checked the figures used in the synthesis against the research receipts. Added the independent qualifiers to the three implementation articles.
- Wrote `scripts/supervisor/prepare-vault.py` to reproduce the portable edition. Validated frontmatter, code fences, local links and the figure in staging. The dated directory contains six new articles and one PNG.
- Verified the vault had no outgoing changes and its remote was at a5ac12b. Staged exactly seven new paths and ran the staged whitespace check. Committed and pushed. A fresh rendering of the final ticket texts matched every published byte.

### Why

The repository hosts the experiment scripts and receipts. Vault readers need the study navigation and figure to work in an independent checkout. Retaining ticket-relative evidence paths as text preserves their origin when a reader moves between the two repositories.

### What worked

The six rendered texts total 16,054 whitespace-delimited words including code and metadata. Git reported `a5ac12b..f2a26ab main -> main`. A separate remote query returned f2a26ab97c7f56627d2dcb128cea9160cbd7beb8 for refs/heads/main. The vault working tree was clean and synchronized after publication.

### What didn't work

Ticket-relative links in the first lowering manuscript pointed outside the vault when copied literally. The publication script validates each target in the source ticket and renders its evidence path in the vault edition. The source version retains clickable ticket links.

### What I learned

The project has one integrated code-generation change, two isolated compiler prototypes and independently reproduced Linux evidence. The negative bounds result also survived a separate attempt to retain more scalar facts. Board qualification is the outstanding experiment that can change the production decision about the frontend.

### What was tricky to build

The shared checkout received independent research commits while the vault had a separate publication history. Path-limited source commits and a single reviewed vault commit preserved provenance across the two histories. Comparing a fresh rendering against published bytes after the final examiner commit caught any potential difference in manuscript versions.

### What warrants a second pair of eyes

A reader evaluating the next hardware trial should start with the fresh four-treatment receipt and the independent five-treatment receipt. They differ in their choice of experimental controls. The recommendation to test both packed buffering and streaming follows from those controls.

### What should be done in the future

Run the same source and reactor on a confirmed physical P4. Collect target-side elapsed time and allocator peak, validate the resulting ELF and repeat the Editor behavior replays. The remaining docmgr task records that qualification explicitly.

### Code review instructions

Start in the ticket index for all six reports, notes and diaries. To reproduce the vault layout, run `python3 -B scripts/supervisor/prepare-vault.py <empty-directory>` using the ticket script path. Compare the result to `Projects/2026/11/19/` in go-go-parc at f2a26ab.

### Technical details

The vault contains the final six articles and the generated `_assets/picocalc-compiler-thesis-experiments.png` figure. The original experiment guide was delivered to the reMarkable folder recorded in Step 2. Raw compiler objects, binary executables and temporary device data were excluded from publication.

## Step 6: Restore the physical console and prepare a matched compiler trial

The USB troubleshooting changed my interpretation of the previous device check. The PicoCalc bridge was present in the host USB inventory even when its serial device was absent. The operator loaded the CDC ACM module and the firmware acknowledged a world query. I prepared an application-only trial that uses the regular firmware compile function and preserves the installed image for restoration.

### Prompt Context

**User prompt (verbatim):** “ok board is connected. Should we then merge the numeric operands directly passing? and text access removal? or what do you think”

**User follow-up (verbatim):** “I modprobbed”

**Assistant interpretation:** Use the available P4 to evaluate the host recommendation and distinguish the native operand representation decision from the bounds-elimination decision.

**Inferred user intent:** Find a simple compiler improvement worth merging for on-device compilation with real application evidence.

### What I did

- Matched bridge serial 5B61091051 against the project's p4cap default. Checked USB interface binding with `lsusb -t`. After the driver loaded I verified the by-id link to ttyACM0 and a `#OK worlds` reply.
- Held the keyboard bus and backed up the 8 MiB factory app. Read the partition table separately and verified the app offset and length. Kept both binaries in private temporary storage. The first 4,461,472 bytes of the app matched SHA-256 b2a6ab3fcfcfd161eb184ac7e2fb9802a8e6fb15bc64a007bceb916fb118459b from the earlier physical qualification.
- Built a disposable ESP-IDF 5.4.2 firmware with four pinned compiler configurations and the same production runtime, application source and native reactor for all sixteen invocations. Other worlds use the normal compiler. Added an independent host linker oracle for the exact firmware reactor.

### Why

The merge choice depends on cold compile time, peak heap and output identity. Runtime and context creation, compiler evaluation, linking and teardown belong in that interval. SHA-256 and serial reporting for each linked image run outside it.

### What worked

The isolated build reused the vendored compiler runtime and the downloaded IDF components. The original image prefix matched the previous receipt. The host oracle produced one hash for the original stack-slot backend and an identical second hash for the three register-backend variants.

### What didn't work

The initial `sudo -n modprobe cdc_acm` returned `sudo: a password is required`. The user loaded the module locally. A second check caught an important difference in the earlier host harness: its experimental reactor used a different Espressif toolchain build and link input order. I used the production firmware recipe and generated new host expectations for that reactor. Their bytes and hashes are pinned in the device receipt.

### What I learned

Project hardware identity comes from USB enumeration and the bridge serial as well as its current Linux tty. Matching application source and file size cannot establish native module identity across different reactor builds.

### What was tricky to build

Measuring all variants in a single diagnostic image avoids changing the app partition between treatments. Each treatment nevertheless constructs its own compiler runtime and re-reads its inputs. A balanced four-order schedule puts each compiler in every ordinal position, including first. The heap high-water counter is private to each compilation.

### What warrants a second pair of eyes

Inspect the trial timing boundary and the distinction between a fresh QuickJS compiler runtime and a power-cycled board. Review the independent host hashes and recorded restoration before interpreting the result.

### What should be done in the future

Select a production native frontend using the physical interval and heap results. Keep the direct bounds optimization a separate decision, evaluated against dynamic application costs.

### Code review instructions

Use the ticket's `scripts/supervisor/p4-backup.sh`, `p4-trial-build.sh` and `p4-trial-run.py` from the repository root. The build script takes a disposable workspace and the IDF export script. The runner takes the workspace, the device's serial path and the IDF esptool executable.

### Technical details

The on-board compiler uses the normal Editor limit of 4 MiB and 6 seconds per compilation. The source digest begins f37f60f3 and the production reactor digest begins 16660a8a. The reserved linked Editor file occupies 240,452 bytes.

## Step 7: Measure the physical P4 and replay the compiled Editor

Four complete, balanced blocks ran on one physical ESP32-P4. Buffered native operands gave the lowest time and streaming gave the lowest tracked allocation. The source, reactor and engine stayed fixed, and the three compiler configurations with the register backend returned interchangeable native programs.

### Prompt Context

**User prompt:** See Step 6.
**Assistant interpretation:** Determine whether the two proposed compiler changes warrant integration.
**Inferred user intent:** Prefer a change that reduces handheld compile time and can be understood and validated independently.
**Commit (code):** 756393b records the physical measurement harness.

### What I did

- Collected 16 compiler receipts, each with a fresh runtime, firmware clock interval, peak allocator bytes and a post-timing SHA-256 of the linked module.
- Compared all digests with the host oracle operating on IDF's actual linked reactor. The two hashes were 73376013… and aaf6a214… for the stack-slot and register backends.
- Ran the existing 65,536-byte formatted Markdown fixture, including a Page Down key, two physical framebuffer captures and scratch cleanup. Compared both decoded PNGs with the earlier reference pixel by pixel.
- Restored the full original factory application, checked the flash hash verification and queried its live native Editor. Saved the first trial receipt and illustrative figures in the ticket.

### Why

Changing how a checked integer travels between compiler stages should preserve the emitted machine code. Changing the native backend is expected to change those bytes. Both claims can be tested separately while also exercising the loaded file with its actual peripherals.

### What worked

The original, register, packed and streamed configurations took median times of 3.139, 2.863, 2.318 and 2.422 seconds. Packed beat the register backend and streaming in each of four matched blocks. The two physical screenshots differed from the earlier reference only inside the status clock rectangle. The temporary fixture was removed.

### What didn't work

Whole screenshot PNG hashes differed across qualification dates. Comparing the decoded images located the difference at x=548…625 and y=10…29 on the doubled 640×640 capture. The rendered document content matched exactly. I saved both the pixel verifier and the bounded difference receipt.

### What I learned

The physical result reproduces the host ordering of buffered and streamed numeric operands. Editor's existing heap budget leaves room for buffering. The first four treatments bundle together removal of Wasm framing and integer encode/decode; the recorded 544 ms saving cannot be attributed to operand passing alone.

### What was tricky to build

The device test has to restore an application partition that is longer than the installed executable. Reading the complete 8 MiB range and checking the original on-board image prefix against the prior physical qualification protects both the executable and the original partition tail. The user filesystem and credential partitions are separate and were not read or flashed.

### What warrants a second pair of eyes

Check the extra control that removes unused Wasm framing but still encodes and decodes integer operands. That control isolates the specific implementation choice the user asked about.

### What should be done in the future

Keep the first production numeric frontend compatible with both typed world entry points, and qualify accepted and rejected source for both targets. Revisit text-check removal only with generated-program time measurements in Files or Agenda.

### Code review instructions

Start with `various/supervisor/physical-editor.json`. Each trial records its position, block and linked digest. Run `scripts/supervisor/p4-verify-preview.py` against the output directory of the existing hardware replay for an independent content comparison.

### Technical details

The median tracked peaks were 2,454,968, 2,154,834, 1,735,524 and 1,387,004 bytes. Relative to the integrated register backend, buffered native compilation saves 419,310 peak bytes. Streaming saves another 348,520 bytes relative to buffering.

## Step 8: Isolate the representation decision in a second physical experiment

The first result favored packed buffering, but it combined fewer framing allocations with direct operand passing. I kept the register backend and the per-function buffering strategy constant, then introduced a control that still encodes and decodes each integer. That change made it possible to answer the specific merge question on hardware.

### Prompt Context

**User prompt:** See Step 6.
**Assistant interpretation:** Establish the independent value of passing numeric operands before recommending a production change.
**Inferred user intent:** Choose the simplest change with a demonstrated improvement on the handheld.
**Commit (code):** eb74bec records the controlled compiler variants and the first physical qualification.

### What I did

- Built a second temporary diagnostic firmware with four register-backend configurations. The additional unframed control omits Wasm module framing while retaining the old integer representation. Repeated four balanced blocks, using the same physical Editor source and reactor.
- Compared 16 module digests with each other and with the host oracle. Retained the raw serial timing lines in addition to the structured receipts.
- Replayed the same 64 KiB fixture, verified its CRCs, exact frame equivalence outside the clock, and scratch cleanup. Prepared a follow-up report with the actual board data for the ticket and the go-go-parc vault.

### Why

A difference between stock and packed compilers measures the entire change. The unframed control has the same buffered function lifetime and native-only interface. The remaining difference covers operand construction and consumption, including avoiding the LEB encoding and decoding helpers.

### What worked

Unframed encoded operands took 2.725 s and 1,746,650 peak bytes. Unframed direct numeric operands took 2.303 s and 1,735,888 peak bytes. The four paired savings were 421,845, 408,879, 420,236 and 457,568 microseconds. All sixteen complete ELFs in this experiment had the same SHA-256.

### What didn't work

The first treatment matrix lacked an unframed byte-operand control; assigning its whole 544 ms saving to the representation would have overstated the measured effect. The second matrix supplies that missing comparison. Whole-frame hashes also change with the wall clock, so the content check explicitly verifies every pixel outside the small clock rectangle.

### What I learned

Direct numeric operand passing explains a large compile-time improvement on this board and a smaller incremental allocation saving. The 10,762-byte median peak difference between the two unframed lanes is much smaller than the 408,012 bytes saved together by omitting framing and unused Wasm writer code. Streaming reduces peak allocation further while increasing current Editor latency. Direct bounds proofs remain an independent generated-program optimization.

### What was tricky to build

The experimental native-only bundles omit the shared Wasm linker entry. The recommendation is to integrate native emission into the shared compiler behind an explicit output selection. The generator's frozen textual substitutions are appropriate experimental fixtures and do not constitute that production design.

### What warrants a second pair of eyes

The natural causal comparison is between unframed and packed in the second image. The first image establishes the baseline-to-optimized end-to-end saving. Mixing raw timings from different images or taking the 64 KiB Editor replay as a measurement of the bounds optimizer would answer different questions.

### What should be done in the future

Land a production buffered numeric consumer, run host and P4 qualification on both supported compiler targets, and evaluate text access proofs separately on the hot Files and Agenda helper paths.

### Code review instructions

Read the median and raw per-call rows in `various/supervisor/physical-operand-ablation.json` beside `physical-operand-ablation-serial.txt`. Compare each receipt to the compiled module digests in `p4-bundle-oracle.mjs`. Read `various/reports/physical-editor.md` for the implementation recommendation and reproduction commands.

### Technical details

Both images use the same source and production-linked reactor. The four treatment medians in seconds for the second image are 2.877 for the regular frontend, 2.725 for unframed encoded operands, 2.303 for unframed numeric operands and 2.403 for streaming. The difference between the two relevant medians is 421,876 microseconds, or 15.5%.

## Step 9: Preserve the negative results and publish the decision

The user asked that a decision against a merge still receive a report. I collected the negative and conditional findings in one paper, linked each to the detailed author or examiner paper, and published it beside the physical qualification. The comparison firmware was removed after both runs. The original factory image passed flash verification and its console reported the native Editor running.

### Prompt Context

**User prompt (verbatim):** “even if something rejected btw, it should have a report because we do want to keep these valuable scientific / engineering results”
**Assistant interpretation:** Preserve the reasons, measured observations and reconsideration criteria for unmerged proposals.
**Inferred user intent:** Make unsuccessful hypotheses as retrievable and reproducible as successful implementation work.

### What I did

- Published the null corpus result for chained bounds proofs, the scalar-retention experiment, the positive but incomplete direct-check case, the time versus heap cost of streaming, and the type information erased by the tested numeric representation.
- Documented the measurements that required replacement and linked the rejected comparisons to the corrected controls. Included the conditional span experiment and the function-order counterexample.
- Verified the second trial's final physical receipt, scratch cleanup, screenshot comparison and factory application restoration. All 32 on-board builds matched the expected linked hashes. Closed the ticket's final task and recorded its completed status.
- Generated the follow-up vault edition, validated its figures and inter-article links, and fast-forwarded the clean vault checkout before adding four new paths. Pushed both reports and the two assets.

### Why

A zero gain for a stronger proof algorithm on one corpus is an empirical result with a scope. A lower-memory compiler that costs more time is a quantitative tradeoff. Documenting them separately helps future research start with the remaining question.

### What worked

The negative-results paper identifies a hypothesis, control, outcome and reopening condition for each design decision. The source record includes the original alternatives, individual examinations and machine-readable receipts. The remote vault head was verified as f4b320278693f002f924d55166cff9f2ef52aa68.

### What didn't work

The vault had advanced to 108cd65 since the earlier series. A clean fast-forward incorporated the unrelated new report before publication. No merge conflict occurred.

### What I learned

The current evidence supports a production native numeric operand path, a retained streaming experiment, and separate measurement of the direct bounds pass. Their scientific status and production status can be recorded independently.

### What was tricky to build

The earlier six-article vault edition has a stable historical navigation structure. The publisher now renders the two new follow-ups separately and resolves their references to the prior six without rewriting those articles.

### What warrants a second pair of eyes

Check that the null count refers to *additional chained eliminations* and that positive helper execution counts remain visible. The physical timings did not include the bounds analysis.

### What should be done in the future

Apply the same reporting convention when a new experiment fails or a design is deferred. Keep its control and raw evidence, describe what the test can establish and specify an observation that would change the decision.

### Code review instructions

Start with `various/reports/negative-results.md` and `various/reports/physical-editor.md`. Regenerate the vault follow-ups with `scripts/supervisor/prepare-vault.py --followups <empty-directory>` and compare against go-go-parc commit f4b3202.

### Technical details

Raw filtered serial receipts, P4 medians and per-block samples, host oracle hashes, pixel-difference bounds and restoration checks are under `various/supervisor/`. Hardware inputs and outputs used the same 240,452-byte reactor format in both device series.

## Step 10: Index the research program against the professor’s plan

The professor’s ticket catalogs proposed native work. The thesis and integration tickets catalog experiments and production decisions. I connected these layers with the older CJI and application studies so a reader can trace a question from proposal to evidence.

### Prompt Context

**User prompt (verbatim)** “do we have a more global set of research directions? do you have an index of all the things previously proposed / researched already?”

**User clarification (verbatim)** “lookat PICOCALC-NATIVE-NEXT for example”

**Assistant interpretation** Use the native plan as a primary source, account for previously proposed and investigated ideas, and give the reader a durable entry point.

### What I did

Read the professor’s task ledger, the scope designs and their counting model. Compared them with the subsequent register, operand representation and proof reports, the CJI line of research, and the existing ten-article issue. Added the index under `reference/` and linked it from the thesis landing page and project README.

### Why

The professor’s task list predates subsequent implementations. A task checkbox, an instruction-count prediction and a production receipt refer to different pieces of evidence. The index keeps the task IDs while attaching the stronger evidence wherever it exists.

### What worked

`python3 scripts/supervisor/check-research-index.py /home/manuel/code/wesen/go-go-golems/go-go-parc` (with the full ticket path from the repository root) verified all 41 task IDs, the 20 dated compiler/application tickets, 49 distinct workspace documents and eight vault articles at their named Git revision.

### What didn't work

A Git inventory showed that the original Native Next and special-issue ticket directories are present locally but absent from the tracked source snapshot. A reference to those paths alone would lose the roadmap inventory for a reader using a clean checkout. The index includes the task objectives and commit-pinned vault pointers. The supplied plan was left as received.

### What I learned

The implementation plan explicitly prioritizes native backend work even before physical key-to-pixel timing is available. The later proposal to measure output allocation addresses the separate question of cold compiler time and heap. Both can be located without inferring priority from whichever experiment was most recent.

### What was tricky to build

Scope A’s model starts from an earlier backend, and the shipped shallow-operand register scheme implements only part of its design. The index gives the model and the measured backend separate entries in the same row. The E8-related bounds study receives the same treatment because its local merge was subsequently reverted.

### What warrants a second pair of eyes

Read the A/E rows against the professor’s task acceptance criteria, then compare the CJI physical times with their heap, source and instrumentation controls. Counts from a 22-world JS catalog, a 15-app migration inventory and a three-world typed benchmark refer to distinct corpora.

### What should be done in the future

When an experiment lands or is rejected, add its evidence link next to the question it answered. A future task can keep its original design target and independently record a replacement implementation.

### Code review instructions

Start with `reference/02-picocalc-compiler-research-index-and-open-directions.md`. Run the coverage checker from the ticket’s `scripts/supervisor/` directory using the vault checkout as its argument. Inspect the README and ticket landing-page links.

### Technical details

The integration baseline for the inventory was source commit `39bf91f`. The JS streaming default landed at `7677932`. The vault’s special issue is referenced at `37d4459`. This checkpoint changed documentation and its coverage check.

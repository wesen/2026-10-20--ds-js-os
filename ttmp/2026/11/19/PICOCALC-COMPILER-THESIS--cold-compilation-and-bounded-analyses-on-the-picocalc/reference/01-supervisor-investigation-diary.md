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

---
Title: Director investigation diary
Ticket: PICOCALC-NATIVE-WAVE
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/scripts/director/04-device-matrix.py
      Note: Validates test firmware, records paired execution times, and restores the ordinary release.
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction/scripts/director/heldout/01-burst-oracle.mjs
      Note: Checks expected return, traps and memory across Wasm and native execution.
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T18:54:30.763123066-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Commission six studies and freeze an independent application

I assigned six independent Opus High research roles to three operators. The researcher can work on a compiler and its host oracle without the board. The person measuring physical effects must hold the board exclusively, and the result must include the work done by the guest and the artifact produced by the compiler.

### Prompt Context

**User prompt (verbatim):** “can we parallelize the research?”

**Active user goal (verbatim):** “do it, as before.
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Assistant interpretation:** Carry out all six research projects concurrently and publish their findings and a director synthesis. **Inferred user intent:** Use independent scientific judgments and sustained host experiments while sharing the physical P4 safely.

### What I did

Commissioned separate Opus design/review/report work for six topics. Created the parent ticket and eight coordination tasks. Built a new ten-function telemetry program, an independent JS expected-value oracle and a vocabulary-independent lifetime challenge with eight classified event flows. Recorded SHA-256 commitments. Compiled and executed the source using the existing Wasm engine and RV32 instruction interpreter.

### Why

Editor and Chess have already informed the hypotheses. A new source and an independently computed return value make it possible to observe which results transfer. Serialization of physical measurements prevents probe firmware from another experiment becoming the control.

### What worked

The stock compiler generated 2,876 native bytes and a 1,500-byte Wasm module. Both passed 1,603 cases, including 101 expected traps, with complete test-memory equality. Stock native execution consumed 158,570 modeled instructions in the harness. Each model invocation is separate from an on-board timing.

### What didn't work

The sandbox device list could not find /dev/serial/by-id. A host-level read-only check identified USB serial device 5B61091051 and /dev/ttyACM0. No board action was needed to validate the test program.

### What I learned

The held-out input needs an arithmetic, text and layout path to serve these hypotheses. Lifetime inference opens a different question: an operational specification of expiration can transfer between surface syntaxes while still testing the same observable permission to retain a reference.

### What was tricky to build

Expected outcomes cover negative and reversed ranges, malformed fields, UTF-16 input, exact-capacity writes, required traps and post-call memory. The native interpreter has a separate stack. Only the publicly visible test memory is part of the equality requirement.

### What warrants a second pair of eyes

This is one independent program, with correlated test vectors. Case counts establish exercised inputs and do not constitute independent applications. Distinguish policy preregistration from implementation freeze whenever a researcher saw test source before finishing code.

### What should be done in the future

Re-run the frozen control from the committed files, compare researcher arms and issue the six original designs and seven final articles. Record device state and study limitations alongside results.

### Code review instructions

Check the hash commitment, then reproduce the director's test oracle once the code is disclosed under scripts/director. Compare the normalized program behavior separately from dynamic instruction counts.

### Technical details

The telemetry state uses a length-prefixed UTF-16 payload, three i32 calibration fields and a destination with a trailing canary. Scripted structural edits include a moved pair of fields, a changed literal, a changed uncalled signature and an inconsistent used signature.

## Step 2: Fix the evaluation policies and build a common execution harness

The operators reported six research policy locks. Two studies used a declared policy before seeing the held-out program, while the other four also supplied implementation hashes. I wrote a second, independent harness to evaluate native execution of three different operations in the same telemetry workload and on the same device.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Coordinate physical research while keeping the researchers' designs independent. **Inferred user intent:** Make results comparable across compiler approaches. **Earlier commit:** 89b8fc6 — Commission six compiler studies and freeze the independent evaluation inputs.

### What I did

Produced a common raw-image descriptor with exact code identity and function entry offsets. A C driver calls readBurst, countEvents and label through the corresponding native symbols. Independent expected values come from a Python implementation operating on the original inputs. The reference collector verifies all copied UTF-16 units and surrounding sentinels before timing. The stock entry points are repeated as a timing control at the same addresses. A freestanding second driver executes these exact programs under the CJI RV32 model and counts executed instructions between emulator clock requests.

### Why

The full differential suite includes invalid inputs that trap. Physical timing instead uses successful workloads with reproducible results. The model counts include the C iteration and calling overhead within each endpoint. A compile-time difference in a byte-identical image cannot establish a guest execution benefit.

### What worked

Four independently provided pilot arms linked successfully. Stock execution took 13,498 modeled instructions to parse the valid and malformed input set, 5,424 to count separators, and 1,495 for the label replay. The all-late semantic candidate used 12,610, 4,518 and 1,149 respectively. Stock and selected bounds images produced equal instruction counts.

### What didn't work

The first ESP-IDF link failed with “section .flash.text VMA [40000040,40018e2b] overlaps section .flash_rodata_dummy VMA [40000020,4002001f]”. A requested 64-byte assembly alignment had advanced the entire output text section beyond the default 0x20 offset. Reducing the input alignment to 32 preserved the linker layout.

### What I learned

A single function can differ between compiler arms for one endpoint while another endpoint's code is unchanged. Preserve the three endpoints in the results. Any positive timing on unchanged code is a useful check on layout and measurement variability.

### What was tricky to build

All imported symbols must resolve to the actual machine image at the offsets declared by the compiler. Function offsets can change between arms. The benchmark aligns each image separately and charges all branches and calls that occur inside the measured guest entry.

### What warrants a second pair of eyes

The cases represent one independent application. Studies 1 and 2 locked their rules before disclosure, but implementation was still in progress. Studies 3–6 supplied implementation identities as well. A positive transfer in this application only supports a limited empirical claim.

### What should be done in the future

Add the final leaf-lowering images to the same build, compare host and on-device behavior, and record the verified release restoration.

### Code review instructions

Start with scripts/director/heldout/01-burst-oracle.mjs and the receipt it produced. Run 02-prepare-matrix.py and 05-model-matrix.py on the raw compiler arms. Check the output of the no-change stock replay before claiming a runtime gain.

### Technical details

The standalone binary runs on a single 360 MHz core. Each timed sample replays its input set 48 times. Eleven rotated blocks include a warm call before timing. This measures guest execution with the machine image in linked flash text. It excludes cold compilation, normal native ELF loading, window compositing and SPI transfer.

## Step 3: Time three guest operations and return the ordinary device

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Measure native programs in parallel with the researchers' host investigations. **Inferred user intent:** Distinguish device execution gains from elapsed compilation and code size. **Earlier commit:** 182167d — Qualify the independent program and stage a common RV32 execution experiment.

### What I did

Checked the six RV32 images byte by byte against the final linked program, ran seven arms (including the repeat control) in eleven rotated physical blocks, returned the ordinary application and handed the board to the bounds and semantic-lowering operator. Graphed the paired reductions beside instruction counts.

### Why

The same change need not accelerate every operation within a program. The three exported functions test the costs of helper calls, repeated text access and a literal write separately. An extra copy of the stock code at a different address and a repeat at the original entry serve as controls.

### What worked

All 231 timings have their expected workload checksums. Selected proofs produced identical code and zero median timing change across all three endpoints. Across blocks the median parse reduction was 11.277% for frameless leaves and 15.942% for the inlining arm. All-late semantic lowering reduced parse, count and label time by 4.982%, 15.901% and 21.267%. The full release and partition digests matched flash before and after the trial. All eight expected native worlds started and the painter installed with zero rejects.

### What didn't work

The first leaf exporter used different capitalization for two identity fields. I checked the bytes against both digests before staging a normalized copy. Its researcher then updated the exporter to match the shared field names. A pilot built before all arms arrived did not serve as the measured candidate.

### What I learned

The most effective arm depends on which work the guest performs. Inlining saved time in the parse entry while count and label were unchanged. Retaining semantic operations saved time in all three on this program. The numbers describe single changes against stock. Combining their percentages would have no experimental basis.

### What was tricky to build

ESP-IDF can transform section placement. Comparing compiler outputs alone would not establish that they are the machine code at the entry addresses the driver calls. The linked-image receipt binds sizes, entry points and bytes to the tested firmware.

### What warrants a second pair of eyes

The warm loop executes linked probe code at measured addresses. Normal native ELF relocation, flash placement, asynchronous UI work, interrupts and user-visible latency may have different costs. The primary evidence is the full per-block receipt. Eleven blocks constitute repeated measurements on one board.

### What should be done in the future

Compare these cross-study results with the independent Chess search probes and the fresh-engine compile timings, and publish the mode-dependent outcomes together.

### Code review instructions

Inspect scripts/director/07-verify-flash-images.py, then run scripts/director/08-summarize.py with various/director/physical.json, various/director/rv32-model.json and an empty output directory. Compare paired-results.json against the supplied summary.

### Technical details

360 MHz, one core, eleven blocks, 48 repetitions per endpoint, seven arms. Stock median times were 2,208 µs for parse, 893 µs for count and 221 µs for label per timed batch. The measured image starts with SHA-256 419817c7; the ordinary release starts with 134f3a24. Device logs remained local.

## Step 4: Combine two lowering changes and publish the six designs

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Own the experimental comparison across research groups and make each design accessible. **Inferred user intent:** Use the independent studies to identify combinations worth testing. **Earlier commit:** 243aebc — Measure native guest execution across six compiler outputs on the P4.

### What I did

Asked the leaf researcher to expose a source-injection argument in the ticket staging tool. Built a two-by-three comparison of early/late operations with ordinary, frameless and inlined calls. Reused each researcher's actual lowering implementation and the locked independent test program. Delivered the six final designs as a single reMarkable book with contents and verified its remote listing.

### Why

Both changes accelerate the same parse entry through different kinds of instructions. The most important unknown was whether changing the input operations disrupts leaf recognition or changes the benefits seen individually. A host comparison can reject a bad combination before a device window is booked.

### What worked

All six generated programs passed 1,603 differential cases each. The four overlapping individual-control images matched the existing hardware evidence byte for byte. On the complete modeled suite, late/stock executed 144,166 instructions; late/leaf 135,475; late/inline 132,105, compared with 158,570 for early/stock. A fresh staged build linked every arm at the verified entry offsets. Ten independent functions remain in every program because inlining at selected call sites leaves callable external entries intact.

### What didn't work

Node could not resolve an absolute filesystem import from an in-memory data URL on the first combined run. Passing its file URL corrected module resolution. The dependency did not change the expected behavior or comparison rule.

### What I learned

The reductions in modeled instruction count for these two transformations add exactly on this fixture. This is a statement about the emitted paths and this replay. Cycle counts include branch and memory costs that can change with the placement of the code. The second physical matrix tests that separate question.

### What was tricky to build

A meaningful composition must first reproduce the individual movements. The script checks the four overlapping single-study SHA-256 values before it accepts the two new combinations. A new output directory and independent model replay reproduce the six digests and the 21 endpoint counts.

### What warrants a second pair of eyes

The combined trial was added after seeing the first physical results. Reusing the same program makes the within-program comparison meaningful but cannot validate a prediction on another workload. The inline prototype uses buffering during compilation. It cannot inherit the production streaming memory behavior.

### What should be done in the future

Record physical cycle or elapsed-time outcomes for the combined code and reconcile them with the single-arm effects and each lab's application results.

### Code review instructions

Run scripts/director/10-replay-host.sh with a new scratch directory and a RISC-V ESP GCC path. It rebuilds the frozen stock oracle, all six native variants, and the independent C-driven RV32 instruction study from scratch, then compares both receipts byte for byte.

### Technical details

The fourth physical candidate has SHA-256 d1769084266e3c475f463a01009fa5d46c2f4c29e9b7e0abe718f28a560551a6. The reMarkable cloud directory and per-design source hashes are in various/director/remarkable.json.

## Step 5: Separate model composition, linked-world size and cold compilation

The six-arm comparison also offers a way to ask whether the independently written transformations are compatible on the complete application sources. I measured instruction extent with the real world linker. I checked the cold compile experiment's missing sample and arranged a separately identified confirmation.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Review each team's evidence and independently test the most consequential interaction. **Inferred user intent:** Show where a local compiler result transfers to actual apps. **Previous commit:** adadb30 — Compose the two native lowering studies and replay the crossed host controls.

### What I did

Extracted the exact Editor and Chess source text and reactor ELF from the ordinary device application at the four offsets independently identified in the dependency study. Verified the release SHA-256 and four asset hashes. Each app passed its real world validation and linker under all six code generators. Compared the resulting instruction extent, entry count, relocation count and fixed-size ELF. Sum and component charts were checked against independent runtime controls.

### Why

Telemetry takes a few milliseconds to replay and includes only ten functions. It cannot establish that whole-app validation accepts each variant or that leaf recognition continues to work alongside target-specific checked operations in a larger program.

### What worked

All twelve world variants compiled and linked. Editor early/stock and late/frameless used 89,168 and 75,812 instruction bytes. Chess used 256,400 and 180,860. Both output ELF lengths remained unchanged because the reactor reserves a fixed slot. Re-extracting the assets directly from the published binary reproduced the same result as the researcher's staged files.

### What didn't work

The fresh-compiler operator's 280-second host collection window ended after 59 of 60 planned samples. The last selected-bounds Editor observation and an aggregate native correctness marker were missing. The report retains the complete first four matched blocks and every raw row. I arranged a separate instrumented confirmation with one matched block and a dedicated native correctness marker. It will have its own receipt.

### What I learned

Less generated code can reduce the allocation and time required to compile a world. In the balanced physical observations Chess peak JavaScript allocation fell from 3,185,084 to 1,948,022 bytes and cold compile time fell 43.0% with all-late lowering. Bringing this into the ordinary firmware is a different acceptance decision.

### What was tricky to build

The ordinary world compiler returns a complete ELF from its public entry point. I observed the actual input to linkSlot while letting the original function perform all validations, apply relocations and return its real output. Both earlier isolated raw-image digests matched. Reporting just the linked file sizes would have hidden the compiler effect.

### What warrants a second pair of eyes

The crossed whole-world experiment qualified compilation and linking. Dynamic differential behavior for the composed pair is measured on telemetry. The standalone fixed-work Chess search timing exercises the leaf/inlining policy individually. Those are distinct evidence levels.

### What should be done in the future

Qualify Editor editing, Chess UI/painter interaction, error handling and production cold boot on a combined candidate before adopting it.

### Code review instructions

Run scripts/director/11-compose-release-worlds.mjs with the exact ordinary application binary and a new JSON path. Compare the result byte-for-byte with various/director/composed-release-worlds.json. scripts/director/12-publish-vault.py prepares linked reader copies and a manifest.

### Technical details

The two release sources are 69,884 and 61,022 bytes. The checked ELFs are 242,124 and 274,892 bytes. Inline currently uses a buffered compilation path; frameless standalone keeps streaming available.

## Step 6: Independently audit the conclusions and run the crossed hardware comparison

The researchers' raw receipts made it possible to compare the stock control, two separate transformations and their actual combination on the board. I also asked an independent Astra reviewer to recompute the principal outcomes from raw observations and audit what the firmware timers include.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Supervise independent research and publish the strong results and their limits together. **Inferred user intent:** Give the reader evidence for adopting, testing or rejecting each idea. **Previous commit:** 772f6ef — Explain the six compiler studies and put the measured tradeoffs in the research index.

### What I did

Ran the second physical matrix after the dependency study returned the ordinary firmware. Checked the six machine images, expected values, capacities and complete scope of all 231 observations. Brought the full-world link results, both telemetry matrices, balanced compiler timings and the 90 observed edits into the director synthesis. Added an explicit account of differences between experimental and production loading. Reviewed evidence for gate failures and safe conservative rejections.

### Why

A result from a small isolated loop cannot answer the user's product question unless the actual execution environment is accounted for. An independent reviewer can also detect a claim that sounds plausible but doesn't follow from the control.

### What worked

Late plus frameless reduced telemetry parse time by 16.071%. Late plus inlining reduced it by 21.558%. Separator-count and label-write reductions stayed at 15.901% and 21.267% in both combinations. The stock repeat measured a median change of 0.045% in parsing. The independent review replicated all 21 cells from the first matrix and all five Chess comparisons. Recorder receipts from the dependency study contain all 90 verified edits.

### What didn't work

The initial synthesis undercounted the valid held-out edits by one, described an arity diagnostic imprecisely and gave the fresh-engine cold endpoint too little detail. I corrected the report against the original artifact and the reviewer's readings of the production and probe code. The first experiment did not separately distinguish the semantic representation from the specialized instruction selection; the revised report explicitly leaves their individual contributions open.

### What I learned

The standalone native benchmark code executes in mapped flash, while the normal runtime places native worlds in PSRAM. Matched flash controls establish a useful difference, but they cannot demonstrate the latency seen by the ordinary loaded app. Similarly, a cache's fast structural edit and slower body edit call for separate deployment decisions.

### What was tricky to build

The CPU comparison had to preserve the actual emitted instructions, including branch layout and the entry of every compared function. Each one of the four overlapping stock or single-change compiler outputs reproduced the source of the first physical comparison. The independent execution replay excludes the test driver initialization and checks returned values before accepting timings.

### What warrants a second pair of eyes

Eleven repeated blocks on one physical board are descriptive, not independent devices. Whole-app size reduction does not release a fixed native slot by itself. The five physical Chess trials used three repeated timings per case, enough to support a qualification experiment but too little for a general performance model.

### What should be done in the future

Measure the normally loaded apps under the release scheduler with the validated two-operation change and streaming frameless lowering, and include a same-output full guest replay as well as boot and render measurements.

### Code review instructions

Inspect reference/20-independent-scientific-review.md and the balanced original compiler receipt in various/01-bounds. Compare various/director/composed/paired-results.json against the standalone model, then follow the full application linker measurement in various/director/composed-release-worlds.json.

### Technical details

The second physical matrix uses early/stock as the paired baseline, 11 blocks, 48 replays per block, one 360 MHz P4 core. All complete edit builds were checked byte for byte against the clean linked ELF. Their edit timer excludes cache commit and output comparison.

## Step 7: Verify physical recovery, publish the lab edition and close the ticket

All six Opus High research leads delivered their designs and resulting articles. Their operators finished the implementation, experiments and diaries. The independent Astra reviewer rechecked the two final matrices. I verified the final ordinary firmware state, published all seven articles as one coherent edition and checked the remote contents.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Finish the research through publication and leave a reproducible record. **Inferred user intent:** Make the material available to newcomers in the reading vault and preserve the scientific trail in the repository. **Code and evidence commits:** e787cfe for crossed hardware results; 03e0306 for the independent confirmation; 786f2b4 for independent final review.

### What I did

Verified the fifth window recorded native correctness, all 165 directed native timings, all twelve compiler observations and its aggregate completion marker. Read-back matched the published application and partition. The eight expected worlds started and the native painter installed with zero rejects. Kept the earlier incomplete run separately. Prepared the final articles, two charts, cross-links and per-file hashes; committed and pushed precisely that edition to the go-go-parc vault.

### Why

Publishing both the failed gate and the qualified performance controls lets the reader reconstruct adoption decisions. A remote revision and the file hashes identify the exact series delivered. The P4's last state matters to the next person opening an app.

### What worked

Seven articles and two figures passed local link validation and remote Git verification at go-go-parc main 48781a06bfe4663816887fa991035b71069630ee. I checked each committed blob against the publication manifest. The six finalized source hashes still match the reMarkable book that was verified in the cloud directory.

### What didn't work

The first long cold-compiler capture timed out with one observation missing. The separate confirming boot completed after its shorter plan, while the original 59/60 receipt remains unchanged. No later sample was inserted into the original block.

### What I learned

The strongest product candidates here are preserving two text operations until RV32 lowering and streaming frameless leaves. A separate build-cache policy is beneficial for structural edits but exceeded its body-edit allowance. Physical operation-level gains still require ordinary PSRAM-loaded validation.

### What was tricky to build

The published notes use vault-relative links to companion studies and figures. References to implementation and evidence resolve to the corresponding tracked source paths. The publisher restricted the commit to the nine expected documents and assets.

### What warrants a second pair of eyes

The final edition distinguishes early versus late operation *and* instruction selection, host versus loaded-world execution, and fresh compiler engines versus entire boots. Any later product claim should use the documented production-path measurements.

### What should be done in the future

Use the release trial described in the synthesis. The six research assignments and the requested publications are complete.

### Code review instructions

Inspect various/director/publication.json, the seven analysis files and the independent memorandum. Use scripts/director/12-publish-vault.py with a fresh local staging directory to compare the generated publication manifest. Use docmgr doctor --ticket PICOCALC-NATIVE-WAVE --stale-after 365 to validate the ticket.

### Technical details

Vault commit 48781a06bfe4663816887fa991035b71069630ee. reMarkable book: PicoCalc Native Compiler Wave - Six Study Designs, under /ai/2026/11/20/PICOCALC-NATIVE-WAVE. Final ordinary application SHA-256 134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1. Final partition SHA-256 72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30.

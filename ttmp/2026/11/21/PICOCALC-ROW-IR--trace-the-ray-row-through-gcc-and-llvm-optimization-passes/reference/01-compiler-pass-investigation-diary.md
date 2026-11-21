---
Title: Compiler pass investigation diary
Ticket: PICOCALC-ROW-IR
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T07:51:09.739766487-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiler pass investigation diary

## Step 1. Choose controls and capture both optimizing pipelines

I traced the real firmware translation unit and prepared two small versions of the same fused Typed row written in C. The controlled pair shares the buffer header, unsigned loads, row bounds, arithmetic and update order. One build inserts a trap at every checked element access. The other assumes valid indexes. The original C renderer has a separate discriminant array and different field widths, so it needs a separate capture.

### Prompt Context

User request (verbatim): “can you analyze how gcc does it / llvm does it, by analyzing intermediate representations and different compier passes in detail?”

User instructions (verbatim): “commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)” and “the article should be pedagogical and target new students that don't know much about the fundamentals or the context, and properly introduce the context necessaryr to follow along, both on the topic and on the subject at hand (typed js, raytracing, PIE, etc...)”.

I interpret the question as asking for evidence from the actual optimizing pipelines, a comparison with the Typed implementations and a final new vault report after the experimental work.

### What I did

Recovered the exact Espressif GCC invocation from the cached device build database. Checked the staged C source against the checkout. Captured GIMPLE SSA, loop invariant motion, vectorizer, IV optimization, final optimized GIMPLE, allocation and final RTL. Compiled a preprocessed copy of the same firmware TU using LLVM 18 and collected per-pass IR, MIR before allocation and after virtual register rewriting, and RV32 disassembly.

### Why

An assembly-only comparison cannot distinguish C source structure, target-specific compiler knowledge, address strength reduction and register allocation. A checked C control keeps errors and wraparound relevant to the comparison.

### What worked

Both toolchains compiled the production TU and both representations of the fused row at O2. The SDK uses GCC 14.2.0 and rv32imafc_zicsr_zifencei_xesppie. The LLVM experiment uses the common RV32IMAFC target with the same ilp32f ABI.

### What didn't work

Applying opt's function printer filter to the same textual output intended for llc produced a function-only file. llc reported “base element of getelementptr must be sized”. I retained the filtered pass trace but reran the same O2 pipeline without the printer filter to save a complete module for machine lowering.

### What I learned

The real C row explicitly calls its hand-written PIE function in one execution mode. Whether the ordinary scalar path auto-vectorizes is a distinct question that can be answered from the vectorization diagnostics.

### What was tricky to build

Comparing the exact production command with a portable LLVM target requires preserving preprocessor choices while keeping the vendor extension out of the portable backend. The two controlled C kernels use the same common ISA flags and signed wraparound option.

### What warrants a second pair of eyes

Assumptions about C alignment, valid backing storage, trapping, and interpreting LLVM target limits. A guarded C proxy cannot define arbitrary accesses outside its declared object.

### What should be done in the future

Execute the controlled RV32 objects against the Typed oracle, inspect individual passes and measure how much work remains in the inner loop.

### Code review instructions

Start with scripts/01-row.c and scripts/02-passes.py. Supply a temporary output directory and the real ESP-IDF compile_commands.json. Preserve raw dumps outside Git and commit compact readable extracts.

### Technical details

Compile controls use -O2, -fwrapv, -fno-strict-aliasing, -ffreestanding, rv32imafc and ilp32f. The hardware firmware translation unit retains its original compiler flags.

## Step 2. Execute the emitted programs and remove one pass at a time

I used the actual Typed Wasm program to prepare the initial state and compute all 160 expected row results. GCC and LLVM consumed this state through a small Linux system-call harness in qemu-riscv32-static. The three Typed programs consumed the same bytes in the existing RV32/PIE interpreter. This isolates guest instruction counts from host scheduling, USB and display time.

### Prompt Context

See Step 1. The user additionally requested a final deep-dive article introducing the system, explaining C and Typed variants, and publishing it to go-go-parc after completing the analysis.

### What I did

Ran ten C compiler configurations and three Typed configurations on every row, comparing all 4,100 bytes of the buffer header and payload, plus the return value. QEMU traced single-instruction translation blocks with chaining off. I counted PCs inside the linked row symbol and compared disassembly for direct stack-relative memory operations. Disabled GCC IV optimization and LLVM loop strength reduction in separate controlled builds. Recomputed a SHA-256 digest of the actual firmware function section and its GCC rebuild.

### Why

A pass dump shows which transformation occurred. Disabling just that pass measures its net contribution in a real pipeline. Counting instructions in the actual output provides a different metric from device elapsed time and row function size.

### What worked

All 2,080 row comparisons passed. Stock Typed took 3,608,697 instructions, checked GCC 1,136,142 and checked LLVM 1,233,611. Enabling GCC IV optimization saved 13.14% of checked guest instructions and 45.42% unchecked. LLVM strength reduction saved 3.29% checked and 20.82% unchecked. The row section of the rebuilt firmware matched the original section exactly.

### What didn't work

LLVM's remarks file did not give an actionable reason for ordinary RV32 vectorization. I inspected the pass output and final instructions directly and used the explicit profitability and control-flow diagnostics only for GCC. These QEMU experiments do not execute the vendor-only PIE instruction.

### What I learned

The register-allocation comparison becomes clearer with its denominator: stock Typed executes 1,290,106 direct stack memory instructions over 160 calls. Checked GCC executes 2,240. The checked C programs still execute buffer-length branches; even a checked scalar backend can avoid substantial frame traffic. In the checked LLVM kernel the first SROA invocation removed all 16 source-local allocations, while the later machine backend still saved registers at function boundaries.

### What was tricky to build

QEMU's tracer needed one instruction per translation block to interpret log entries as instruction fetches. I restricted counts to the linked symbol range. LLVM direct-driver and separately replayed llc outputs have identical dynamic counts on these inputs; the unchecked function sizes differ slightly. The LLVM ablation therefore compares two llc outputs.

### What warrants a second pair of eyes

All these fixtures have valid backing allocation and a fixed opening pose. Checked and unchecked C have different preconditions. Comparing their absolute times on a P4 would require a separate linked device trial.

### What should be done in the future

Qualify a scalar loop register and induction policy in Typed against this checked baseline, then benchmark isolated rows and complete frames on silicon.

### Code review instructions

Run scripts 02, 05, 06 and 07 from the repository root. Read the two JSON execution receipts and the selected GIMPLE, IR, MIR and assembler extracts in various/passes. Script 08 generates the comparison figure.

### Technical details

Setup commit 76733ea. GCC uses vendor 14.2.0, Clang/LLVM 18.1.3. The firmware row section digest begins 6cd634da5b60. Encoded widths differ between the compressed scalar C backends and the 32-bit Typed emitter. A count records each executed instruction once at either width.

## Step 3. Write the final comparative chapter after qualification

With the experimental evidence frozen in 662f306, I wrote a new chapter for students encountering ray tracing, Typed JS, PIE and compiler IR for the first time. It develops the sphere equation, follows a sample row through both compilers and distinguishes each Typed implementation by the question it answers.

### Prompt Context

See Step 1. The user requested a complete new final report after the work and asked for a pedagogical introduction to both the project and the compiler fundamentals.

### What I did

Wrote the final chapter, gave its ten-arm C comparison and three-arm Typed comparison the same execution boundary, linked the captured pass outputs, and included separate figures for machine instructions and estimated break-even. Reviewed the chapter against the physical and host receipts and verified the embedded figures, wiki references and local links. Published the completed chapter and its two figures to go-go-parc main. Linked the ticket from the compiler research index.

### Why

A student reading only the final report needs to understand the significance of a zero discriminant, the difference between a primary row and a completed frame, the source of C's explicit packed path, and why counting instructions cannot supply LLVM hardware timings.

### What worked

The new 4,300-plus-word chapter retains the original article as a separate note. The vault push advanced main from 9eab52d to 2c2436a. The comparative chapter includes checked and unchecked baselines, paired pass-off builds, rejected vectorization evidence, actual row bytes and the implementation path suggested by these results.

### What didn't work

The experiments give no P4 execution time for the new GCC/LLVM C proxies. The report uses their guest instruction counts and identifies the independent physical experiments wherever it gives milliseconds.

### What I learned

The opening row term example makes both the C two-loop arrangement and Typed's fused loop understandable before introducing SSA. Comparing bgeu and the capacity load with the register counts explains why substantial optimization remains possible with checked buffers.

### What was tricky to build

The previous template, the new inferred subregion and the source span experiment all concern the primary row but do different amounts of work. The final table identifies which code each treatment changes and labels comparisons across hardware runs.

### What warrants a second pair of eyes

A subsequent device experiment should time the controlled checked C kernels on the P4 and measure a general Typed register policy at fixed traversal. The paired instruction differences in the current report should not be extrapolated directly into frame-rate forecasts.

### What should be done in the future

Use a second unseen kernel as well as the ray row when testing automatic scalar loop scheduling. Keep cold compile cost, guest memory traffic, traps and output agreement in the acceptance criteria.

### Code review instructions

Read analysis/01-from-checked-halfwords-to-a-native-row-loop-in-gcc-and-llvm.md and follow the reproduction commands. The vault version adds direct links to the earlier chapters and packages both figures locally.

### Technical details

The final vault commit is 2c2436a. The additional break-even figure is generated from the earlier paired data by PICOCALC-PIE-LOOPS/scripts/12-session-cost.py. The 44–45 frame figure is an estimate from scene medians. The new study changed no production backend or firmware.

## Step 4. Extend the LLVM capture and preserve the physical study

The first experiment printed all default O2 middle-end pass invocations for the selected row functions and retained selected evidence in Git. That was a filtered capture. I regenerated the three inputs without a function filter and included the RV32 backend printer, then tested the compressed files and indices against their original byte streams.

### Prompt Context

User (verbatim): “did you dump all the LLVM IR passes / optimizations and such”, “You should also look up the llvm code to show the original algorithms used, etc...” and “you can checkout the source, but also, how much do you have in /tmp that risks getting wiped?”

### What I did

Counted allocated bytes in readable temporary files, exported the complete pass logs with per-header offsets, checked out the upstream tag sparsely outside /tmp, and saved the current physical and compiler experiment outside /tmp in a private local archive.

### Why

Selected function dumps are sufficient for a specific comparison but cannot answer questions about other functions or late machine passes. Preserving a compact replay and original physical inputs avoids reliance on machine cleanup policy.

### What worked

Verified 4,133 pass headers, their offsets and all six stream digests. The 102 MiB private archive was compared against its source files and passed its SHA-256 check. The tagged checkout at c13b7485 matched all twelve independently downloaded source files byte for byte.

### What didn't work

The default sandbox failed before shell startup: “remount /newroot/mnt/pico: No such device”. I used scoped permission requests for local inventory, archival and verification. Twelve directories under /tmp were unreadable to the current account.

### What I learned

At the first inventory, readable regular files in /tmp occupied 29.641 GiB. A named-project heuristic identified 13.660 GiB of PicoCalc trees. The largest, picocalc-eg-wave, contained many separate historical build directories. The current IR directory grew from 15.89 MiB to approximately 46 MiB when the full logs were generated. These numbers describe a point-in-time sample.

### What was tricky to build

The two pass managers print different header prefixes. The index records the byte position in the uncompressed stream, and verification opens each indexed header. A repeated pass on separate functions or loops produces separate entries.

### What warrants a second pair of eyes

The local archive covers this study and its SDK and firmware dependencies. Earlier projects in /tmp have separate retention histories. An archive on the same disk protects against temporary-file cleanup, not disk failure.

### What should be done in the future

Use the permanent pass index and upstream commit when discussing exactly which algorithm a particular dump supports.

### Code review instructions

Run scripts/09-archive-llvm.py on the full experiment directory. Check various/llvm-pipeline/manifest.json. The archive and checkout paths are recorded in the follow-up report.

### Technical details

The firmware TU produced 2,061 opt and 1,450 llc dump headers. Both controlled kernels each produced 195 opt and 116 llc headers. These are emitted snapshots for the chosen O2/target configurations.

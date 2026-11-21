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

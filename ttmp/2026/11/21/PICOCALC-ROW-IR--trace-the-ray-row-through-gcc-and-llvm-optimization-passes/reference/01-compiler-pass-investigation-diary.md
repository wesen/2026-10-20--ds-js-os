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

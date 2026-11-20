---
Title: Typed PIE investigation diary
Ticket: PICOCALC-TYPED-PIE
Status: active
Topics:
    - compiler
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Selector design, independent review fixes, ESP32-P4 timing, and firmware restoration.
LastUpdated: 2026-11-20T16:09:31.26001152-05:00
WhatFor: ""
WhenToUse: ""
---

# Typed PIE investigation diary

## Step 1 — Match checked numeric operations and emit a guarded vertex prefix

The director assigned this investigation as part of the requested 3D chess painter. I followed the checked buffer operations from the Typed frontend to the RV32 emitter and built a candidate that compiles the same scalar fixture in stock, guarded scalar and PIE modes.

### Prompt Context

**Prompt provenance** — The implementation began from the director's assignment in this conversation. The assignment summarized the user's request for automatic PIE SIMD lowering of a normal scalar Typed 3D Chess vertex loop, and for using it in a delivered painter. The exact top-level prompt was unavailable in this investigation's context.

**Commit (code)** — `bd544af` Prototype guarded Typed vertex lowering to ESP32-P4 PIE.

**Assistant interpretation** — Demonstrate automatic target-specific instruction selection and report its boundaries and measured costs.

**Inferred user intent** — Keep the app source portable and find out where the handheld gains from automatic vectorization.

### What I did

- Read the emitter's checked length/address sequences and scalar control flow.
- Wrote the independent scalar projection, the opt-in backend pass and the experiment staging adapter.
- Added a guarded RV32 comparison with the same proof and runtime preflight.
- Assembled load, store, broadcast, and add/subtract/logical examples using the ESP-IDF 5.4.2 Espressif GNU assembler with `-march=rv32imafc_xesppie -mabi=ilp32f`.
- Cooperated with an independent reviewer on the emitted byte oracle and holdouts.

### Why

The numeric stream has enough information to establish buffer access, loop structure and integer operand ranges without parsing a second language. The guard-and-continuation design keeps the original short-buffer trap behavior and permits a scalar tail.

### What worked

The fixture compiled to 628 bytes stock, 1,416 bytes guarded scalar and 1,384 bytes with PIE. The two optimized modes accepted the same intervals. The PIE body occupies 29 static words per eight vertices, while the guarded scalar body occupies 40 static words per vertex. These include the loop-back sequence. Dynamic instruction and cycle evidence belongs to the qualification steps.

### What didn't work

- `node 03-compile.mjs compile 01-vertices.typed /tmp/typed-pie.bin` first returned `ReferenceError: typedWasm is not defined` at `typed-async.js:15`. The adapter now loads `typed-wasm.js` before `typed-async.js`.
- Espressif GNU assembler rejected `esp.vldbc.16.ip q7,sp,0` and `esp.vldbc.16.ip q7,a6,0` with `Error: illegal operands`. The broadcast uses the encodable s0 register, preserved through an existing stack slot.
- Independent review found that the first matcher admitted writes to the induction slot through a read assignment. It now rejects assignments at or below the induction slot. Independent review also found that two extra stack slots could exceed the scalar frame limit. The prefix now borrows two dead position slots and keeps the stock frame.

### What I learned

Typed's buffer operations trap on unsigned position against the capacity and store by truncating. An apparently simple check for full count can change prior writes if it traps before the original loop. Returning to the existing loop at its original induction position preserves the failure.

### What was tricky to build

A branch to the scalar loop must occur before any vector store or relevant scalar-local change. The plan is constructed before emitting the guards. The ineligible path proceeds through the stock emitter.

### What warrants a second pair of eyes

The proof depends on the exact stack instruction sequence, non-concurrent buffer contents, and strict preservation of the numeric loop's remaining locals. Target review also needs the real PIE task-state path.

### What should be done in the future

Measure the selected bytes on the board and retain the scalar and guarded RV32 baselines.

### Code review instructions

Run the three commands in the design guide. Start at `scripts/02-pie-lowering.js` and compare its matcher to the checked operation sequence in `picocalc-os/compiler/typed-wasm.js`.

### Technical details

The prototype selects up to six buffer parameters, uses an eight-element prefix unit, checks all output-related range pairs including headers, and performs no CSR writes in generated code.

## Step 2 — Run identical generated words on the handheld

I built an isolated application that links the stock, guarded RV32, and PIE images as executable text, and compares them against an element-wise C reference and full-capacity CRCs. The board operator handed over the serial port after verifying the ordinary 2D painter was installed. The runner used the existing serial lock and verified the playable app and partition before writing the benchmark to the factory app offset.

### Prompt Context

**Previous prompt** — See Step 1. The director added a physical comparison and asked that the test restore the attested playable application before returning board ownership.

**Assistant interpretation** — Measure the instructions actually generated by the unchanged source in each arm and restore the previous bootable state.

### What I did

- Built with `bash scripts/05-build-board.sh /tmp/typed-pie-board /home/manuel/esp/esp-idf-5.4.2/export.sh`.
- Verified the three function symbols in `.flash.text` and the buffers in `.dram0.bss` with the vendor objdump.
- Used `scripts/06-run-board.py` to verify image geometry, take the shared lock, run the benchmark, and restore the playable factory application.
- Captured the benchmark's 72 correctness rows and 24 cycle summaries in the physical receipt.

### Why

The runtime model established behavior of the emitted bytes on the host. Physical hardware adds the actual ESP32-P4 execution paths, including instruction decoding, memory alignment and SDK PIE state management. The guarded scalar arm measures the benefit of removing repeated scalar checks before changing the instruction set.

### What worked

All checks passed for the aligned, naturally unaligned and exact-alias input variants in all three modes at all eight tested counts. At 256 vertices, the stock, guarded RV32, and PIE medians were 45,675, 13,161, and 1,644 cycles. At 1,024 vertices the corresponding medians were 184,005, 51,561, and 5,484 cycles.

### What didn't work

The initial C harness used differently typed pointers into a word array. That would make its independent C oracle depend on C aliasing rules. The physical build uses structures with typed header and payload members. The structural revision rebuilt successfully before flashing.

### What I learned

The hardware accepted the emitted opcodes and produced matching destination bytes after the scalar tails. At count 8, the guarded scalar loop measured 755 cycles and PIE 398 cycles, including preflight. The PIE loop measured 5,484 cycles for 1,024 vertices, making fixed compilation boundaries and caller layout significant to the usefulness of the optimization.

### What was tricky to build

A little-endian halfword payload four bytes after the buffer base changes the alignment requirement on the base. The hardware test uses a 12-byte prefix for the aligned case and a conventional four-byte header for the unaligned case. Code and data live in different sections and the receipt claims their placement separately.

### What warrants a second pair of eyes

The measured loop is a controlled, warm microbenchmark for a projection function. Its extent of speedup cannot be applied directly to frame latency. Longer runs with forced preemption and physical power/temperature measurement are independent follow-up questions.

### What should be done in the future

Run the same comparison where the application supplies ordinary Typed painter source and the device compiles it. Measure the fraction of frame cost attributable to projection, including staging geometry in aligned buffers.

### Code review instructions

Read the article's result table alongside `various/physical.json`. Use the design guide to rebuild. Run the board script with `--preflight` to confirm the benchmark and restore image geometry.

### Technical details

The device reported silicon revision 1.3 and 360 MHz. The app ran on CPU0 with power management disabled. The code symbols were `0x4000befc`, `0x4000c170`, and `0x4000c6f8` in flash-mapped text. The data array occupied `0x4ff111a0` in internal DRAM. Each arm had one warmup call, then 11 samples per count, each timing `floor(16384 / count)` calls. The receipt preserves minima, medians and maxima as integer cycles per call.

The runner exited successfully after restoring and reading back the playable application and partition table. The restored system reported the complete native world set and the ordinary 2D painter installed on its first compile. Board ownership then moved to the 3D painter experiment. [Receipt](../various/physical.json)

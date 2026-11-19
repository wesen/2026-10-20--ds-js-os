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

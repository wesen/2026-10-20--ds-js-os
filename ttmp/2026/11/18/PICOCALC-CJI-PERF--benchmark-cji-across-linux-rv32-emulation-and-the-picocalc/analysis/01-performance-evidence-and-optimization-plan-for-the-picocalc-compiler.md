---
Title: Performance evidence and optimization plan for the PicoCalc compiler
Ticket: PICOCALC-CJI-PERF
Status: active
Topics:
    - performance
    - esp32-p4
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Measured compiler costs, platform differences, framebuffer evidence and optimization experiments.
LastUpdated: 2026-11-18T10:01:35.770941026-05:00
WhatFor: ""
WhenToUse: ""
---

# Where compilation time goes on the PicoCalc

Agenda spends almost its entire physical compile inside stage 1. With an 8 MiB heap the frontend took **1,479.11 s** and the complete job took **1,480.34 s**. Of those frontend seconds, **85.90** were inside the compacting collector. Removing the entire measured GC cost would still leave more than 23 minutes of work. That bound sets the priority for optimization.

![The Linux simulator running the shipped Agenda app with the seeded task list.](../various/figures/linux-agenda.png)

**Linux simulator framebuffer.** This is the application whose bundled source we compile. Its launch screen verifies what the workload represents. The compiler benchmark ends after hashing the generated module. It excludes world startup, drawing and typing latency.

## Which work crosses platforms

![The compiler input forks into native host, guest emulator and physical board paths.](../various/figures/compiler-paths.png)

The Linux build executes the compiler's generated x86-64 code. A monotonic clock measures elapsed time and Callgrind counts machine instructions. The RV32 emulator runs the guest's RISC-V code and can attribute its guest instructions by program counter. The physical board executes that architecture on a 360 MHz ESP32-P4 alongside the kernel and its worlds, fetching code and touching working memory under the board's cache and PSRAM conditions. Emulation answers how much guest work an input induced. Hardware timing answers how long that work took on a particular build under a recorded operating condition.

The frontend reads a JavaScript world and emits SLIR, CJI's intermediate representation. The host and emulated frontend outputs must match an independent stage-0 byte sequence. The P4 also links the shared prelude, assembles the RV32 module and returns its SHA-256. A matching independent host module is the admission test for a P4 timing sample.

## Measured costs and their limits

![Measured Linux and P4 frontend time with GC shown separately. Each panel has its own seconds axis.](../various/figures/frontend-times.png)

**Within-target timing.** Each panel has its own scale. The blue portion is frontend time outside measured collections. The orange portion is elapsed time in completed collections. The host bars use separately computed medians of nested and total intervals from the first host matrix. The P4 bars use the recorded intervals from individual successful jobs.

| 8 MiB case | Linux AOT frontend, first matrix | P4 frontend | P4 GC | P4 whole job | Peak P4 scratch |
|---|---:|---:|---:|---:|---:|
| Files | 3.514 s | 262.264 s | 9.206 s (3.51%) | 263.136 s | 9,251,666 B |
| Agenda | 25.556 s | 1,479.109 s | 85.898 s (5.81%) | 1,480.340 s | 10,048,551 B |

On this matrix the P4 frontend took approximately 75 times as long as Linux for Files and 58 times as long for Agenda. Those ratios describe these builds, runs and timing boundaries. Frequency, target instruction expansion, cache behavior, clock variation and background work all affect them. We have no measured CPI or cache-miss attribution for the full P4 runs.

![The six highest instruction-count symbols for Files on Linux and guest RV32.](../various/figures/files-hotspots.png)

**Compiler code attribution.** Linux's top symbol, `whole_bits`, classifies a boxed number's bit representation. `rt_any_index`, `rt_any_eq` and `rt_any_get` implement operations on dynamically represented values. Those operations also appear among the leading named guest functions. RV32 additionally spends billions of instructions in software floating-point helpers. Its large `main` bucket includes generated addresses assigned to the nearest preceding symbol. A finer guest symbol map is necessary before assigning those instructions to parser, lowering or emission routines.

![Cumulative allocator call count from physical frontend heartbeat records.](../various/figures/frontend-heartbeats.png)

**Reading a slow run.** Each point is an observed frontend heartbeat. The same job can allocate, reuse and free temporary buffers throughout stage 1. A rising call count confirms activity. An interval with a flat count may still be running generated code. A terminal full-digest receipt establishes completion. Comparing the final link and assemble timestamps shows that improving them has very little leverage on Agenda's present wall time.

## Memory ownership on the device

![The compiler's contiguous frontend heap and other job scratch share PSRAM with the running OS.](../various/figures/memory-layout.png)

The outer allocator manages available ESP-IDF heap regions. The compiler job separately charges allocations against its 18 MiB scratch ceiling. Inside that budget, CJI manages a contiguous arena and periodically compacts live values. A failure to obtain one region of a given size can occur even when total free PSRAM exceeds the requested number of bytes. A CJI frontend that reaches its compact heap cap can fail with ample free memory outside its arena. Distinguish these cases using the reservation, refusal reason, free PSRAM, largest block and peak job charge in the serial receipt.

Files and Agenda produced exactly the same collection count, survivor bytes and actual slide bytes on Linux and the P4 at 8 MiB. For Agenda the collector reported 1,434,574,696 cumulative survivor bytes and 211,914,816 bytes passed to the slide operation. Multiple collections can revisit the same live object. Counting its size on each visit describes repeated collector work and overstates actual memory movement if interpreted as physical traffic.

## Optimization experiments in order

| Experiment | Hypothesis and measurement | Decision criterion |
|---|---|---|
| Change only the compact heap | Reserve 8 or 10 MiB before relocation. Collect frontend and nested GC time, module digest, peak scratch and PSRAM snapshots. | Require identical output. Compare the whole frontend improvement with the extra 2 MiB committed by an active OS. Repeat a close result in reverse order. |
| Improve generated-code attribution | Retain stage-1 labels when producing a profiling ELF or generate an offline map from the assembler. Associate hot guest PC ranges with actual emitted functions. | Require the same instruction stream and output. Reconcile named totals against the guest harness interval, then prioritize a specific routine. |
| Test one repeated dynamic operation | Find one hot call site with a provable type or repeated field lookup. Compare minimal variants while preserving JavaScript equality, numeric and property semantics. | Require equal Files and Agenda outputs, fewer guest instructions for the targeted operation, and a reproducible physical frontend improvement. |
| Attribute target memory latency | Bracket short repeatable phases with existing core-0 cache counters. Record accesses, misses and elapsed time with the same operating condition. | Require valid counter intervals and evidence that the proposed layout reduces misses or elapsed time. A 32-bit cycle delta wraps in about 11.9 s at 360 MHz. |
| Re-evaluate the running app | Replay the same deterministic messages in both engines with a separate state readback. Add measured UI latency only as a distinct experiment. | Compare per-event distributions with matching checksums. A faster compiler alone changes build latency. |

The existing dispatch control illustrates the last distinction. On Linux the compiled world won the 1,024-iteration integer batch (10.14 versus 44.38 µs). QuickJS won the Agenda string and regexp edit batch (22.60 versus 48.40 µs). These measurements distinguish workloads worth optimizing and give no direct estimate of physical frame latency.

## Reproducing the evidence

The [intern guide](../design-doc/01-profiling-cji-from-the-linux-host-to-the-picocalc.md) defines the APIs, tools, timing boundaries and expected digests. The [script index](../scripts/README.md) gives the execution order. The physical report reader validates the phase order, allocation snapshots, full source and module identities. The figures read the ticket evidence directly. The diagram sources, plotting program and screenshot capture recipes reside in [scripts/figures](../scripts/figures).

---
Title: Investigation diary
Ticket: PICOCALC-CJI-PERF
Status: active
Topics:
    - performance
    - esp32-p4
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Validation evidence and delivery history.
LastUpdated: 2026-11-18T08:50:39.145063834-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Step 1. Establish equivalent workloads and verify the host recipes

The requested deliverable is an intern guide for comparing native Linux profiling, RV32 guest work and physical PicoCalc measurements. I scoped the ticket to benchmark design and command validation.

### Work and evidence

- Inspected the stage-1 Make targets, AOT driver, symbol writer, firmware wrapper, emulator and compact collector.
- Built the Linux executable from the existing stage1.slir into a private temporary directory with slas -S -c and cc -O2 -g -fno-omit-frame-pointer -no-pie. Both Files and Agenda compiled with the fixed 8 MiB compacting heap. Both outputs passed cmp against freshly generated Node references.
- Verified the Files and Agenda measurement table against the AOT driver's stderr. Inspected the collector update and conditional memmove to distinguish live bytes from bytes physically moved.
- Built an RV32 stage-1 harness in temporary storage using the existing RV32 objects, Clang and the Rust toolchain's ld.lld. A small world matched the Node frontend byte for byte. The emulator reported 430,879,970 guest instructions and emitted a symbol ranking.
- Confirmed perf and Valgrind are installed. Hardware perf-event samples, full-world emulator profiles and a physical hardware experiment remain implementation tasks. The guide labels these accordingly.

### Review

Follow the native baseline first, then compare stage1_main.c and compiler_entry before interpreting any phase duration. The packaging work used no serial port and made no changes to firmware or compiler sources.

## Step 2. Start comparable native and guest profiles

I regenerated the Node references for Files and Agenda, then started native instruction attribution and RV32 guest profiling. The separate physical port job continued compiling Agenda. Profiling artifacts stay in scratch storage; scripts and validated summaries belong to the ticket.

### Prompt Context

**User prompts (verbatim)**

> Work on ttmp/2026/11/18/PICOCALC-CJI-PERF--benchmark-cji-across-linux-rv32-emulation-and-the-picocalc/design-doc/01-profiling-cji-from-the-linux-host-to-the-picocalc.md once you are ready, so we can more easily track what is going on, and get some baseline as well.
>
> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

> save all scripts inside the ticket's scripts/ folder, btw so we can do a complete trace of your work

**Assistant interpretation and inferred intent.** Produce reproducible benchmark evidence, starting with the guide's Files/Agenda workloads. Retain the exact launchers and document how to reconstruct large outputs.

### What I did

- Ran Node with --world-unit --emit on both sources. Used the guide's prepared AOT binary and emulator firmware for the first profiles.
- Ran scripts/as-run/01-initial-profile.sh under taskset. Core 0 ran RV32 Files, core 3 ran RV32 Agenda, and core 5 ran Callgrind Files then Agenda. Scratch root was /tmp/nov18-perf-base. The binaries initially came from /tmp/cji-perf-guide.b17g7D.
- Added repeatable preparation and profiling entry points under scripts. The port ticket holds earlier board-specific scripts in scripts/2026-11-18-session.

### Why

The guest profiler attributes instructions to target symbols. Callgrind attributes host instructions. Independent, byte-checked frontend outputs make these comparable workloads even though their instruction sets differ.

### What worked

The Node SLIR SHA-256 values matched the guide for both sources. The emulator and native AOT binaries were available, and profiling started while the physical worker continued.

### What didn't work

The host command perf stat -e cycles:u true returned “Access to performance monitoring and observability operations is limited” and reported perf_event_paranoid 4. Used Callgrind for instruction attribution, without changing system permissions.

### What I learned

The default kernel configuration affects which conclusions can be supported. An instruction share from Callgrind cannot be reported as a percentage of hardware cycles.

### What was tricky to build

Each guest writes SLIR to stdout and profiling data to stderr. Both need to survive independently. Use separate files per world and validate the complete output, including its last byte.

### What warrants a second pair of eyes

The initial profiles run simultaneously on different logical CPU IDs; their wall times are diagnostic only. Host timing runs require their own measurement conditions and must retain the selected affinity and comparison boundary.

### What should be done in the future

Collect both guest and host hotspot rankings, implement matched collector boundaries, and measure the physical prediction under identified configurations.

### Code review instructions

Start at scripts/01-prepare.sh and scripts/02-profile.sh, then compare scripts/as-run/01-initial-profile.sh with the original command lines above.

### Technical details

The starting configuration uses mark-compact GC, an 8,388,608-byte initial and maximum heap, no spilling, and the original world sources. Temporary benchmark runs retain large profile files outside Git.

## Step 3. Implement matched collection and frontend probes

I added build-time collector instrumentation and a profiling-only P4 control for fixed 8 and 10 MiB heaps. The local Linux measurements now distinguish time in cji_main, time inside collection, and bytes actually handed to the slide loop's memmove. Native, RV32 and hardware measurements are in flight or queued.

### Prompt Context

**User prompts, interpretation and intent.** See Step 2. Preserve complete script provenance and obtain a defensible compiler baseline.

**Previous ticket commit** 2c63204.

### What I did

- Guarded runtime counters with CJI_PROFILE_GC. The compiler embedder supplies either the microsecond clock or guest step counter. Each completed collection accumulates its interval; only a moved object's bytes increment the slide counter.
- Added cji_main boundaries in aot_main.c, stage1_main.c and the P4 tool. A profiled P4 frontend error can report a partial interval.
- Added an opt-in firmware build option and cji profile 8|10 for immutable bundled sources. The experiment reserves both configurations before tool loading so heap placement policy stays comparable. Ordinary build and install commands retain their settings.
- Added scripts/03-host-runs.py, 04-profile-guest-metrics.sh and 05-board-runs.py. The physical runner checks hashes, actual reservation and nested timing bounds before accepting a run.

### Why

The historical counter called copied bytes includes survivors whose addresses are unchanged. Counting payload at the actual move branch answers a different question. A guest instruction count also needs its own unit rather than conversion to hypothetical board seconds.

### What worked

Both host executables built and began emitting reference-identical output. The 10 MiB Agenda warm-up reported 297 collections, 995,195,416 survivor bytes and 172,771,688 slide bytes. Files' completed native profile counted 20,174,143,435 x86 instructions.

### What didn't work

The first guest measurement briefly shared physical core 2 with host timing because Linux logical CPUs 2 and 6 are siblings. Moved the guest shell and emulator to logical CPU 4. Retain affected samples with the other runs and disclose host-load variability.

### What I learned

A small difference in peak live data can coexist with large differences in collection frequency and cumulative live bytes. Frontend-wide timing is required to learn how much that difference matters.

### What was tricky to build

The device firmware and private compiler tool compile independently and share compiler_job.h. Both sides must agree whether the profiling ABI is enabled. The feature is off by default; the benchmark build normalizes the CMake boolean passed to build-tool.sh.

### What warrants a second pair of eyes

Report slide bytes separately from survivor bytes. Exclude warm-up from summaries. The guest step counter includes the cost of the instrumentation itself. Keep self-instruction shares separate from elapsed time.

### What should be done in the future

Collect and qualify complete profiles. Test the prior prediction that increasing Agenda's heap will reduce collections and time in the collector while costing two additional MiB. The prediction of a wall-time improvement is falsified if the larger heap's matched frontend interval does not fall.

### Code review instructions

Follow rt_collect and compact_collect, then inspect each platform's cji_main brackets. The physical observer records the actual measured reservation and keeps progress on stderr.

### Technical details

Both hardware cases are compile-only, with the same source and prelude, normal 18 MiB job limit, and a private compiler instance per job. The generation and validation scripts reside under this ticket's scripts directory.

## Step 4 — Preserve the launch history and qualify the reporting path

### Prompt Context

The user requested “save all scripts inside the ticket's scripts/ folder, btw so we can do a complete trace of your work”.

### What I did

Recovered six earlier PORT helpers, four tiny test worlds and the PERF smoke fixture. Added a reproduction index, the physical experiment driver, the workstation hand-off script and a compact profile summarizer.

### Why

Raw Callgrind dumps and firmware images are large. A reviewer can reconstruct the evidence from small launch scripts, configuration, SHA-256 receipts and summaries. The original one-time launchers also preserve order and failure handling.

### What worked

The report reader recovered the Files instruction total of 20,174,143,435 and a ranked list of runtime functions. It validated the emitted IR before accepting the profile. A partial host run can be inspected with explicit sample counts.

### What didn't work

The first physical Agenda trial with progress enabled stopped emitting receipts with the keyboard bus active. The held-bus retry was still advancing during this step. Earlier scratch-only scripts were scattered across /tmp.

### What I learned

The emulator already supports RV32_STEPS for a whole-program count. Enable it in future profiling runs. The original log records the guest harness interval and absolute symbol counts.

### What was tricky to build

The physical launch must wait for the previous observer to release serial. Copying the firmware ELF and binary into a unique boot directory pins both the measurement identity and the actual bytes passed to esptool.

### What warrants a second pair of eyes

The physical driver can flash the application partition. Its cleanup resets the board and saves the startup console. Historical source-edit scripts assume the exact original source revision.

### What should be done in the future

Compare the verified timing distributions and complete hardware receipts. Preserve the raw artifacts separately when retaining long-lived benchmark runs.

### Code review instructions

Start with scripts/README.md. Inspect 06-board-experiment.sh for the ownership boundary, 05-board-runs.py for output qualification, and 07-summarize.py for sample inclusion.

### Technical details

The original Callgrind launch used 8,388,608 bytes for both heap bounds. The serial console was held between keyboard transactions for the pending physical run. Large generated outputs live under /tmp/nov18-perf-base and /tmp/nov18-perf-board.

## Step 5 — Capture the first complete Linux timing matrix

### Prompt Context

Continuing the request for a traceable baseline across the Linux host, emulator and PicoCalc.

### What I did

Summarized 48 qualified AOT processes, committed the compact baseline rather than large dumps, and added the progress protocol, counter definitions and measured host medians to the intern guide. Built the profile-enabled P4 application with ESP-IDF 5.4.2.

### Why

A deterministic reduction in collector work and a wall-time improvement answer different questions. Measuring the probe build against a plain build exposes that distinction.

### What worked

All six Linux configurations passed the reference digest check on eight runs each. Excluding each warm-up left seven samples per configuration. The P4 application fit the existing partition with 0x27830 bytes to spare.

### What didn't work

Linux wall times varied substantially. Instrumented Agenda at 8 MiB ranged from 17.893 to 45.339 seconds with other profilers active. A small speed difference is ambiguous in this run.

### What I learned

Giving Agenda 2 MiB more reduced collections from 424 to 297. It reduced cumulative bytes slid by 39,143,128. The host plain binary nevertheless had a higher median process time at 10 MiB.

### What was tricky to build

An older profiling launch used an already-built stage-1 executable. The host matrix uses the paired plain and instrumented executables freshly built from a single generated object. Keep their identities distinct.

### What warrants a second pair of eyes

Both instrumentation and system load affect wall time. Inspect the measured and plain ranges in the JSON. Compare collector counts across word sizes only after validating each output.

### What should be done in the future

Finish the long guest profiles and physical Agenda comparison. The existing board run still owns serial. The experiment driver waits for its terminal receipt.

### Code review instructions

Re-run scripts/07-summarize.py on the working directory, compare the JSON, then review the Linux baseline table in the design guide. The ticket script archive and hardware handoff were committed in 05bc67b.

### Technical details

The benchmark firmware ELF SHA-256 is 154cd68cbe549538a837ec20293d389515d094b26a0a08a38a9da017ac8b4379, with application BIN SHA-256 5eced004bec6eb3da3d30042bf7a84cbc80242b133514d05be7bee8b43637792. This build selects 360 MHz. Host timings used CLOCK_MONOTONIC and per-process child CPU usage.

## Step 6 — Exercise generated world handlers and qualify their outputs

### Prompt Context

Continuing the profiling guide's generated-world experiment while the sequential physical compiler jobs run.

### What I did

Added a ticket-local service, host driver, build recipe and verifier. Ran integer mixing, three array sizes and Agenda text edits through QuickJS, host AOT and the RV32 shared-unit module. Recorded each median and range. Added the exact IDF profile build flags to scripts/08-build-board.sh.

### Why

Compiler latency measures how long it takes to build a world. The dispatch test measures an already-loaded world handling an event. This lets us answer separate questions about the experience of editing and running applications.

### What worked

Five cases passed across three paths. Each produced one warm-up reply and 24 measured replies per engine. The host engines share one process and clock. Validation reads a separate state reply outside the timed handler. All measured checksums agreed with the independent Python reference.

### What didn't work

The import references an older standalone fake-kernel test program that is absent from the imported files. Its shared call implementation and both real event-entry interfaces are present. The ticket driver uses those directly.

### What I learned

Linux AOT ran the integer batch in 10.14 microseconds versus 44.38 for QuickJS. For Agenda edits QuickJS ran in 22.60 microseconds versus 48.40 for AOT. Engine choice depends on the operations in the handler.

### What was tricky to build

Both engines parse the same JSON and handle the same state message. Excluding readback from each timed interval avoids measuring diagnostic output. The RV32 fake kernel measures guest steps for each message independently.

### What warrants a second pair of eyes

Host numbers describe the world-event entry and exclude OS scheduler and renderer costs. The RV32 guest measures steps. A physical dispatch timing would be a separate experiment. The array case includes initialization.

### What should be done in the future

Collect the physical compiler results and the full guest compiler rankings. The current board run uses the profile-enabled firmware whose boot-reported digest prefix matches the retained ELF.

### Code review instructions

Inspect scripts/dispatch/measure.py for exact source parity of the edit function, independent checksums, warm-up removal and sample counts. Inspect host.c for the timer brackets. Compiler baseline commit cfbcbdd and physical Agenda commit a589266 cover different workloads.

### Technical details

The RV32 module is 17,320 bytes. Linux uses CLOCK_MONOTONIC around each dispatch. All timing, collection and dispatch helpers live under ticket scripts directories. The ordinary on-device Agenda run finished before flashing the profiling build.

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

## Step 7 — Reconcile Files across three execution targets

### Prompt Context

Continuing the requested cross-platform baseline with traceable device logs.

### What I did

Qualified both native Callgrind outputs, the Files RV32 ranking, its instrumented guest output and the physical Files module. Copied compact raw reports into various/p4 and various/rv32. Compared the counters across architectures and launched the independent Agenda 10 MiB guest candidate on the now-free host-timing core.

### Why

Identical output establishes correctness. Equal collection counts, live bytes and moved bytes give a second check that the configurations exercise comparable runtime behavior.

### What worked

All three Files targets agreed on every deterministic GC counter. Physical GC consumed 9,206,362 microseconds during the 262,263,671-microsecond frontend. Agenda and Files native profiles ranked the same three named runtime functions first.

### What didn't work

Guest symbolization grouped much generated code under main. Per-symbol attribution cannot identify individual generated compiler functions there. Hardware cycle counters were unavailable on the Linux host.

### What I learned

For Files, even a perfect elimination of measured collector time can explain only 3.51% of P4 frontend time. Both dynamic operations and software floating-point helpers deserve investigation before generalizing the cause of compiler latency.

### What was tricky to build

The guest's full harness and frontend-only instruction counts have slightly different boundaries. The overhead calculation compares two harness totals. The Files instrumented harness reports 55,750,760,761 instructions.

### What warrants a second pair of eyes

Callgrind counts x86 instructions. The emulator counts RV32 guest instructions. Neither gives P4 wall-clock attribution for individual symbols. Linux timings had competing jobs.

### What should be done in the future

Finish the larger Agenda RV32 and physical heap comparison and interpret it separately from Files. The original guest series runs the two 8 MiB cases and would subsequently repeat the independently launched candidate.

### Code review instructions

Inspect the actual P4 log and JSON, guest stats and symbol ranking, then compare them with the updated guide and aggregated JSON. The earlier world-dispatch experiment is checkpoint abaae1e.

### Technical details

The retained initial native executable hash is e748e63a8ac14fb841c9bb1dc672a4e4b2a63920e87255c9f769768750743ecd. The initial and measured guest firmware hashes are d276e380ebabcf694a61c7ad3e2e029a7d369c9ccafb1d5e51d025992ed4f702 and dab4c956efd4a83875592ca55dba8f93e08a689e7acf084027e3979f3bba92d0. The Files physical digest matched the independent host module.

## Step 8 — Repeat the host control after Callgrind finishes

### Prompt Context

Continuing the baseline request and the requirement to preserve every runner in its ticket.

### What I did

Reran the same Linux AOT matrix on CPU 1 when the Callgrind processes had exited. Kept the original configuration order, binaries and references. Added a physical report reader which validates the source, module, firmware consistency, phases, nested timings and memory samples before summarizing a heap comparison.

### Why

The original 18–34% instrumented/ordinary process differences were too large to attribute confidently to the few added clock calls. An independent scheduling condition tests that interpretation.

### What worked

All 48 outputs in the repeat qualified. Across both runs there are now 96 verified Linux outputs. The second matrix produced identical work counters. The physical report reader validated all five phase transitions and four allocator snapshots for Files.

### What didn't work

Even after moving onto a dedicated physical core, host time ranges overlap. The direction of instrumented versus plain median latency reversed. The measurements cannot resolve a reliable probe cost in wall time.

### What I learned

Matched RV32 instruction counts establish the work added by the probe more cleanly than host timing differences. On the second matrix Agenda GC time fell from 1.400 to 0.997 seconds while the plain 10 MiB process median fell only 2.8%.

### What was tricky to build

Firmware dumps can be large. The physical reporting script uses the full receipt and short phase logs, and requires source identity, module identity and measured heap equality before calculating relative changes.

### What warrants a second pair of eyes

The statistical unit is one compiler process. Warm-up rows are retained but excluded from summaries. Other emulators shared package-level power and memory resources with the host control.

### What should be done in the future

Complete the physical A/B and larger guest work. This step leaves the first Files baseline intact so a reviewer can inspect each host scheduling condition independently.

### Code review instructions

Start at scripts/as-run/04-host-repeat.sh and compare its executable hashes in the two host receipts. Run scripts/09-board-report.py on the retained physical evidence to reproduce the memory and progress checks. The preceding three-target baseline is a35e113.

### Technical details

The repeat's plain process medians were 2,363,525, 17,897,174 and 17,397,927 microseconds for Files 8, Agenda 8 and Agenda 10. All runs used the same stage-0 digest per world.

## Step 9 — Capture report visuals and qualify the Agenda baseline

### Prompt Context

The user asked “take screenshots / make diagrams for the report we are going to write (detailed performance analysis and optimization planning and reports on how the device differs from the shost builds)”.

### What I did

Captured the actual Linux simulator's Agenda framebuffer, built two architecture diagrams and plotted three figures from checked-in receipts. Created an illustrated analysis with measurement limits and a ranked experiment plan. Queued a separate physical display capture after the experiment releases the serial port.

### Why

The program shown on screen, the compiler generating its module, and the three measurement targets have different boundaries. Labeling them explicitly prevents the Linux screenshot or guest instruction chart from being read as handheld latency evidence.

### What worked

The physical Agenda 8 MiB run matched the 301,496-byte reference module and reported 424 collections, identical to Linux. The screenshot shows the Agenda title and the two expected seeded tasks. Reviewed a contact sheet of all five diagrams and charts.

### What didn't work

Physical framebuffer capture needs the same UART as the active benchmark. Reading it concurrently would compromise receipt capture. A gated tmux job waits for both heap cases to qualify and the board to reset normally.

### What I learned

The physical 8 MiB Agenda job spent 1,479.109 seconds in stage 1 and 85.898 seconds in GC. The upper bound on the measured collector's contribution is much smaller than the whole compiler slowdown.

### What was tricky to build

Host and device seconds differ by more than an order of magnitude. The figure uses independently labeled axes and numerical values. The guest main bucket uses nearest-symbol attribution and cannot identify generated functions within it.

### What warrants a second pair of eyes

Inspect measured versus illustrative captions and the time axes. Code-path and allocation diagrams describe ownership and validation. The PNG screenshot is decoded framebuffer content. The physical framebuffer control is a separate demonstration from timed compiler runs.

### What should be done in the future

Complete the candidate measurement, review and add the physical framebuffer captures, then regenerate the figures and interpret the A/B.

### Code review instructions

Read the analysis, compare figures to various/p4 and various/compiler-baseline.json, and inspect scripts/figures and scripts/as-run/05-physical-screenshots.sh. The previous host control is 887fcee.

### Technical details

The host screenshot used fixed UTC 2026-10-22 09:41, a private copy of fs-seed and the actual picocalc-host binary. All diagrams and generated charts are retained as standalone report PNGs.

## Step 10 — Attribute the host bottleneck to numeric range analysis

### Prompt Context

The user asked “85 seconds seems pretty irrelevant compared to a 1480s total runtime, right/ what are some other potentially lower hanging fruits”, “do you have precise instrumentation / instruction sample profiling information on the host?” and “what does instantiate_library do?”.

### What I did

Collected dedicated host pass diagnostics, then rebuilt the native compiler with SLAS_SYMBOLS and compared its full text section with both initial executables. Captured actual instruction-pointer samples with ITIMER_PROF, retained the original line-level Callgrind traces, and started address-level instruction and jump counting. Added a pass-cost figure, the library-pass algorithm and concrete optimization trials to the illustrated report.

### Why

The 8 MiB Agenda collector consumes 5.8% of physical elapsed time. Finding a broader source of work requires caller attribution. The host Linux PMU is restricted but Callgrind and an in-process CPU timer work independently of it.

### What worked

Both AOT pass runs and both sampled runs emitted the expected SLIR. The same executable text SHA-256 covers all three native images. Agenda reported 17,178 ms in library instantiation out of 18,253 reported pass milliseconds. The inclusive Callgrind cost at analyzeRanges was 88.03% of whole-program Ir. The independent sampled run collected 35,612 Agenda PCs and 5,193 Files PCs.

### What didn't work

The first Callgrind files recorded line positions and anonymous generated function addresses. They cannot supply individual instruction counts retrospectively. Shared .text identity allows named address lookup, and a fresh dedicated run requests individual addresses. Pass diagnostics force collections and do not replace baseline timings.

### What I learned

The library pass both generates helpers and reruns inference. Numeric range analysis accounts for most of the inclusive native instruction work. The range-join helper accounts for 3.88% of sampled Agenda PCs even before counting its callees.

### What was tricky to build

The sampler only records the interrupted instruction pointer into preallocated storage. Symbolication and output occur outside the signal handler. Recursion and nested calls make summing inclusive Callgrind percentages invalid.

### What warrants a second pair of eyes

The candidate equality shortcut in range join is a hypothesis. Measure actual equal-ID hit rate and verify unchanged output before accepting it. Device attribution requires the corresponding target measurement.

### What should be done in the future

Finish the instruction-address profiles, physical candidate and verified display captures. Use the precise evidence to prioritize work inside range analysis.

### Code review instructions

Check scripts/11-host-pass-times.sh, scripts/12-host-instructions.sh and scripts/host-sampling. Review the compressed raw PCs, Callgrind graphs and pass logs in various/linux-profiles. Visual evidence began in ee9179e.

### Technical details

SHA-256 of the native text section was 133cfe0d4e7f28f387a947d12786f17eaf59f1ac5c9a750d4d23d289a5120390. The sampled executable's full ELF SHA-256 is c5c629b968f32caa654e844fdebc176ef5f74e9f58dc6845e5eb0fe09b05822b. The address of analyzeRanges in this non-PIE binary is 0x4f0822.

### Step 10 follow-up — Count the work inside library expansion

The source-level trace now reproduces the observed Agenda helper sequence. Ran scripts/13-library-rounds.mjs under Node 24 against Files and Agenda. Both outputs matched the independent SLIR references. Recorded the traces in various/linux-profiles. Agenda made 11,743,517 joins with 9,195,456 identical inputs. Files made 1,013,096 joins with 757,722 identical inputs. The counters establish an opportunity; a compiled candidate and actual board times are necessary to quantify a speedup. The previous host profiling checkpoint is 3482d82.

## Step 11 — Separate existing inference reuse from additional cache hits

### Prompt Context

The user asked “how much of the repeated type inference can be cached / reused / avoided ?”.

### What I did

Extended the in-memory reference-compiler trace to count top-level visits, unchanged-summary skips, whole-result reuse, episode validation attempts, successful replays and retained memo text. Qualified Files and Agenda in both modes. Started a separate compiled-stage-1 experiment with just the cross-round cache flag changed.

### Why

Rerunning an inference pass does not imply reexecuting every function. An upper bound from simply counting identical source functions would ignore changed call sites, widened ranges and replay validation costs.

### What worked

All four outputs matched. Agenda skipped 9,019 of 11,760 function visits in both modes. The optional cache replayed 1,690 additional visits and reduced interval joins by 44.5%. On Files it reduced joins by 5.5%. The report's new figure partitions visits into mutually exclusive outcomes.

### What didn't work

These reference counters cannot estimate a P4 wall-time improvement from the number of avoided bodies. Cache entries impose a substantial cost in serialized text and validation.

### What I learned

All 95 Agenda fixpoint rounds still execute with the cache. The compiler can reuse more of their contents. Seven whole-range replays also occur in both modes, separately from the optional function episodes.

### What was tricky to build

Peak memo text tracks live string lengths before instantiate_library exits. Releasing a repeated store ID is counted once. Code units measure payload and exclude containers and headers. The native experiment leaves the normal compiler untouched and substitutes the cache flag only in the input bundle read by the bootstrap compiler.

### What warrants a second pair of eyes

The correct denominator for the additional 61.7% avoidance is the 2,741 remaining body executions. The original denominator of 11,760 includes work already skipped. Neither denominator measures end-to-end CPU cost.

### What should be done in the future

Compare the native candidate's peak live heap, collection count, frontend and GC timings with matched baselines. Preserve even an allocation failure at the 8 MiB cap.

### Code review instructions

Compare the two per-world reuse JSON files in various/linux-profiles and inspect scripts/13-library-rounds.mjs. The initial reference trace was committed in 3f23b4a.

### Technical details

Agenda's peak tracked memo text was 1,530,495 UTF-16 units. Files peaked at 429,257. The two source digests and SLIR digests remain the previously qualified values.

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

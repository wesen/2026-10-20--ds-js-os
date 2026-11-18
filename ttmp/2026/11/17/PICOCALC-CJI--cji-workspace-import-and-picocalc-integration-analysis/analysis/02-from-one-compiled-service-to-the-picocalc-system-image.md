---
Title: From one compiled service to the PicoCalc system image
Ticket: PICOCALC-CJI
Status: active
Topics:
    - picocalc
    - esp32-p4
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T20:06:04.765351175-05:00
WhatFor: ""
WhenToUse: ""
---

# Porting the system image

The original ticket brings one additional trusted service onto the board. The shipped system has 22 JavaScript worlds. All 22 still use QuickJS in the verified image. A system-wide port would select compiled artifacts for built-in world names and preserve their service contracts, claims, budgets, inputs and visible output. The C nucleus, ESP-IDF port, peripheral workers and native loader are already machine code.

## What compiles today

I ran the following command against every file in picocalc-os/js/system.json. Success means the compiler emitted the world’s intermediate representation against the shared prelude interface. It does not cover ELF assembly, import resolution or runtime behavior.

```sh
node cji.js path/to/world.js --world-unit --emit > world.slir
```

| World | Compile result |
|---|---|
| keyboard | Emitted SLIR |
| power | Emitted SLIR |
| display | Emitted SLIR |
| compositor | Emitted SLIR |
| agent | Emitted SLIR |
| chat | Emitted SLIR |
| launcher | Emitted SLIR |
| files | Emitted SLIR |
| editor | Emitted SLIR |
| calc | cji: error: .size = : a ()=>Any has no properties in this subset |
| agenda | Emitted SLIR |
| settings | Emitted SLIR |
| logs | Emitted SLIR |
| loader | Emitted SLIR |
| sysmon | Emitted SLIR |
| repl | Emitted SLIR |
| sandbox | cji: error: 15:13: expected ), found , |
| snake | Emitted SLIR |
| faults | Emitted SLIR |
| flaky | Emitted SLIR |
| keys | Emitted SLIR |
| about | Emitted SLIR |

## Rollout sequence and exit criteria

1. **Replace one shipped app under its existing name.** Start with snake. Its archived native fixture already has an input sequence and expected calls. Select one engine per world in the build manifest and keep its existing title, launcher key, channel claims, memory and turn budget. Start from the home screen, play, compare the display with QuickJS, leave, relaunch, and measure input-to-frame latency and memory on the board. This tests an actual application through the OS.
2. **Share the prelude and run multiple real worlds.** The initial service pays for a private copy of compiled JavaScript support. Use the existing Makefile unit target, tools/rv32/unit.mjs, tools/link-units.mjs and assembler --lib/--extern modes. Link the target prelude unit once, export its symbols alongside the C runtime, and package the individual modules. Chapter 30 reports flaky shrinking from 170,888 loaded bytes to 10,528 with the unit. Measure the firmware-wide sum including the unit itself. Interleave snake and flaky, restart each independently and exhaust one world's quota. Verify that another world still answers and that its heap, exception, timer and pending-reply state remain correct.
3. **Migrate by capability.** The native prelude in src/world-native.js implements messaging, timers, screen descriptions and claimed I2C. Port keyboard and power separately with a working recovery console. Audit each application's real calls against sdk/nw.h, sdk/nw_calls.inc and nucleus/native.c. Files/editor/loader need filesystem handles; display needs SPI; compositor needs drawing/framebuffer operations; agent and settings need network, clock and system operations. Some native prelude methods explicitly throw; others return placeholders such as clock.wall returning null. A compiling world can silently display the wrong time. Exercise permissions, timeouts, cancellation, retained state and failures for each migrated capability, using QuickJS as the behavioral reference.
4. **Qualify a complete mixed image.** Run the host tour and representative screenshots, then repeat core workflows on the physical P4. Compare frame contents, timer cadence, heap peaks, startup time and flash size. Exercise clean boots, launcher navigation, notes saved across reboot, agent cancellations, low-memory conditions and supervised restarts. Include internal RAM largest-free-block measurements. The first hardware build in this ticket fit flash but its kernel console never started with a 96 KiB field cache present. Keep the JS manifest build usable as a control and recovery image.
5. **Decide what dynamic source means.** calc currently assigns .size to a function, which the subset rejects. That is a bounded language or source change. sandbox evaluates arbitrary input from the REPL; changing the parser to accept the comma operator would still leave dynamic eval semantics unresolved. The storage loader also accepts user source. Keeping QuickJS for dynamic execution preserves behavior and isolation while trusted built-ins migrate. Removing QuickJS entirely requires a deliberate design for language coverage, execution limits and isolation. P4 machine-code modules run on the kernel task with firmware memory access. Compiling arbitrary downloaded or typed code directly into those modules would change the trust model.
6. **Treat compiling on the handheld as its own milestone.** The cross-compiled system can ship without a compiler on the P4. Chapter 35's emulator integrates a self-hosted compiler and assembler. Its roughly 4.19 MB compiler code and 8.5 MB peak compile allocation demand flash placement, admission control and measurements alongside a live OS. The current board image already occupies 2,952,560 bytes of its 4 MiB application partition. Changing the partition layout or installing an on-device compiler requires a separate deployment design.

The next release-sized result is snake replacing its interpreted counterpart and a second compiled service surviving independent restart beside it. That supplies both a user-visible improvement to test and evidence for the multi-world architecture before porting privileged drivers.

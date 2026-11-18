---
Title: Porting PicoCalc workflows to shared CJI machine code
Ticket: PICOCALC-CJI-PORT
Status: active
Topics:
    - picocalc
    - native
    - esp32-p4
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/native.c
      Note: Kernel native system calls
    - Path: repo://picocalc-os/port/esp32p4/main/CMakeLists.txt
      Note: Build and manifest selection
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI-PORT--ship-compiled-picocalc-worlds-with-a-shared-prelude-and-port-os-workflows/various/hardware-checks.txt
      Note: Physical measurements and restart evidence
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T20:08:57.341329891-05:00
WhatFor: ""
WhenToUse: ""
---

# Porting PicoCalc workflows to shared CJI machine code

## What the board does when you press S

The launcher knows the game as snake. It sends focus and key events to that name; the compositor reads the screen tree that the game publishes. The name, message payloads, key binding and drawing contract are the interfaces we must preserve. The engine used to execute snake is a build choice. The reference JavaScript is picocalc-os/js/apps/snake.js. Compile that file directly so behavior fixes reach both engines.

Snake is a useful first application because drawing the snake exercises arrays, integers, color strings and JSON serialization on every visible update. Movement exercises a scheduled callback, keyboard direction changes and focus state. Autopilot adds three typed arrays and a breadth-first search. An image that boots and shows the title has exercised only a fraction of the game.

### The components

A *world* is a program with a name, a queue of events, a heap limit and an execution-time allowance per turn. The C nucleus chooses which world runs next. QuickJS is one implementation of a world. The P4 native engine is another. On the device native code executes directly on the kernel task. A turn budget is checked when a native handler returns. Only trusted, bundled code is suitable for this engine.

A *prelude* provides the API used by world authors. For example, app("snake").every(110, handler) records a declaration. During initialization the native prelude asks the kernel to create the timer. Later it receives a tick event and invokes the handler. The prelude also implements promise settlement, app metadata and screen serialization. The compiler's C runtime separately implements operations such as allocating arrays, collecting garbage and looking up JavaScript properties.

```text
Input:  keyboard -> keyboard world -> compositor -> snake key handler
Time:   nucleus timer ---------------------------> snake tick handler
Output: snake screen() -> native screen syscall -> retained screen tree
                                                        |
                                         compositor lays out and draws
                                                        |
                                        display driver -> physical panel
```

Every arrow has a failure mode that looks like a frozen game. Use the world list to distinguish a missing app from a stopped one. Use changes in turns, messages and CPU time to distinguish an inactive timer from a drawing problem. Use a framebuffer capture to separate a rendering difference from a panel transport fault.

## Package a shared unit

A module built in the earlier ticket included its own compiled copy of the prelude. The shared build puts the machine code for the prelude in firmware once. Each world module imports the functions and immutable data it needs. Heap roots, closures, pending replies, timers and event state belong to individual instances. A single read-write global heap shared by the game and a service would make one restart invalidate the other.

```text
Host Node                       Host assembler             P4 firmware
prelude source -> prelude SLIR -> --lib unit.o ----------> linked once
                                     |                         |
                                  unit.list                    | addresses
                                     |                         v
world.js -> own SLIR + prelude SLIR -> --extern -> world.elf -> resolver
                                                         |
                                              PSRAM module + world heap
```

SLIR is the compiler's low-level textual instruction representation. The two input texts are joined before assembly so the assembler knows which functions and constants the world references. Its export list identifies definitions already supplied by the shared object file. The file linked into firmware is ELF type REL; its references are fixed at firmware link time. The file loaded at runtime for a world is type DYN; the loader relocates it using the actual firmware addresses. The emulator's ilp32 conversion is for the emulator executable. The ESP32-P4 consumes the original ilp32f unit.o.

At configure time the build reads the existing world manifest. For a selected world it changes only engine and file in a build-local manifest. The original name, order, claims, store quota, priority, memory and turn budget carry over. An extra service such as toplog belongs in the optional native manifest. Putting snake in both manifests would give two records the same identity.

```text
for each record in the shipping manifest:
    if record.name is selected:
        compile the record's original source against the firmware unit
        record.file = bundled ELF path
        record.engine = native
bundle the rewritten manifest and generated modules
boot that manifest, followed by the optional extra services
```

### File and API reference

Paths beginning with js, sdk, nucleus and port below are relative to picocalc-os. Compiler paths are relative to the previous PICOCALC-CJI ticket's sources/cji directory.

| Start here | Responsibility |
|---|---|
| port/esp32p4/CMakeLists.txt | Enables the optional engine and selects compiled built-ins. |
| port/esp32p4/main/CMakeLists.txt, main/bundle_js.cmake | Compile modules, derive the selected manifest and embed files in the image. |
| port/esp32p4/optional/native_elf/CMakeLists.txt | Produce the unit object and export list as dependencies of the resolver and firmware link. |
| tools/link-units.mjs, tools/rv32/unit.mjs, runtime/rv32_obj.c | Combine compiler output, lay out a shareable unit and name its symbols. |
| tools/rv32/resolve-table.mjs, native_elf_p4.c in the optional component | Generate name/address pairs and resolve relocations. Kernel allocators must retain precedence. |
| sdk/nw_elf.h, runtime/cji_elf.c | Exchange module callbacks and kernel operations, enter a world and swap runtime state around a turn. |
| src/world-native.js, sdk/nw_wire.h, nucleus/native.c | Map JavaScript API calls to numeric operations and check them against the caller's authority. |
| nucleus/vm.c, nucleus/hw.c, nucleus/fs.c | QuickJS reference semantics, handle enforcement and filesystem behavior for capability ports. |

## Stage 1. Replace Snake

Use the current JS build as the reference. Start at the launcher, enter the game, steer, leave and relaunch. Capture a deterministic final frame by letting the snake hit a wall at score zero. Compare the game area independently of the wall clock and battery in the status bar. Exercise autopilot separately because it has a larger per-turn allocation and CPU cost. Record engine, charged memory, turn budget, restarts and error messages alongside the two captures. The fixture tests/native/snake.events gives a reproducible event sequence without a physical keyboard.

The physical console command key injects an event into the keyboard worker. The display capture comes from the framebuffer. This tests the OS input and rendering paths. A hand-operated key and a visual inspection of the glass are distinct observations and should be labelled separately.

## Stage 2. Prove isolation and measure sharing

Flaky is a small service whose ping increments a private counter. A counter is better than a constant reply for detecting a state mix-up. Keep Snake running while pinging Flaky. Restart Snake, then ask Flaky again; its count must advance. Restart Flaky and verify that its count starts again while the game still accepts input. Also compare memory before and after multiple restarts. Reclaiming a module must release its charged blocks, pending requests and handles.

```text
ask(flaky, ping) -> pong 1
restart(snake)
ask(flaky, ping) -> pong 2
restart(flaky)
ask(flaky, ping) -> pong 1
focus(snake), key(down), tick -> updated game frame
```

There are three size figures. Flash includes one shared unit and every bundled module. Loaded module size is the relocated segment resident in PSRAM. World memory adds live allocator blocks to the segment. Use the linker map, assembler output and console worlds respectively. The original toplog used 199,616 loaded bytes before any heap allocation; the first shared build produced 3,680 loaded bytes for it, 10,776 for Flaky and 77,072 for Snake. The unit itself contains 189,390 bytes of code plus tables and data.

## Stage 3. Port workflows with their capabilities

For each migration, trace an actual operation from the application down to the C implementation and back to an observable result. A source file compiling successfully proves none of its privileged operations are available. Some prelude methods throw on use; others return a placeholder. Each capability needs a direct comparison with the existing QuickJS path.

| Workflow | Native operations and checks | Physical acceptance |
|---|---|---|
| Keyboard and power | Claimed STM32 I2C open, byte write/read, delayed settle, publish and retained publish | A key reaches Snake, battery status survives compositor restart, unauthorized backlight requests leave the level unchanged. |
| Files and Editor | Open a claimed directory, derive child handles, delegate a file, read/write asynchronously, enforce path containment and rights | Create a disposable note, open it in Editor, save, reopen after reboot, and reject an out-of-claim path. |
| Compositor and display | Allocate framebuffer, transfer read-only access, read retained frames, draw, SPI commands and rectangular pixel transfers | Compare screen regions, restart the compositor and display independently, repaint active app, preserve handle lifetime across pending transfers. |
| Settings | Network status/scan/join and wall clock/zone, with claim checks and asynchronous results | Inspect status, change and restore a local setting, and exercise failure paths with a deterministic backend. |
| Agent | Per-world storage, notes, system enumeration, network start/poll/cancel and async reply handling | Cancel an active fixture request and start another; verify late replies cannot mutate the new turn. |

### Reuse the kernel's ownership rules

A world receives a handle as authority to act on a particular resource. The handle table binds it to the world and a set of rights. A filename or an integer supplied by a world cannot create authority. On asynchronous calls, preserve data that the worker will use after the current turn, charge it to the correct instance, and check instance generation before delivering a settlement. A restarted world may have the same name and completely different state.

```text
on native operation(world, handle, arguments):
    resolve handle under world's identity and required rights
    validate size, path or rectangle using the existing kernel rules
    submit work and return its token
on completion(token, original instance, result):
    release worker-owned resources
    if instance is still alive:
        enqueue its settle event with success or failure
```

Do not send framebuffer bytes or filesystem contents through an unbounded JSON string. Use the existing size-limited operation or handle that the QuickJS implementation uses. Keep the direct hardware and network workers in C. Compiling the JS driver changes which engine executes its state machine, while the C worker still owns the peripheral transfer.

## Build and investigate

From picocalc-os/port/esp32p4 activate the installed ESP-IDF 5.4.2 environment. Build the same optional Wi-Fi/native configuration that was validated in the first ticket.

```sh
idf.py -B build-elf -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_NATIVE_ELF=ON \
  -D SDKCONFIG=sdkconfig.agent-elf \
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
readelf -h build-elf/cji/unit.o
readelf -h -r -W build-elf/esp-idf/main/natives/snake.elf
```

Inspect the generated system.cji.json next to the main component outputs. There should be exactly one snake entry and one flaky entry. Compare every other field with js/system.json. In the final map, shared prelude code belongs in executable flash and large immutable data must not crowd out the 80 KiB internal kernel stack. Check actual heap on boot. The predecessor ticket discovered an otherwise successful firmware image could leave the console unresponsive by retaining a 96 KiB property cache in internal RAM.

Before writing, capture the running baseline using tools/p4cap.py and identify the known P4 serial bridge. Hold the keyboard bus between transactions, verify the chip and partition layout, and write only the application partition. Monitor the serial device throughout the write. If the interface disappears, stop. For evidence retain the flash hash, firmware revision, serial world records, responses, CRC-checked capture and measured timing. A successful serial write verifies the image transfer; application acceptance begins after boot.

## Diagnosing failures

- An unresolved import names a missing runtime or unit export. Compare the module's undefined dynamic symbols to the firmware resolver and check that both artifacts came from the same unit generation.
- A world that loads but fails at init may be hitting its quota or using an unavailable top-level capability. Inspect worlds and its first fault report before changing a budget.
- A working game with a missing icon or silent key binding points to presentation registration in the prelude. A moving game that fails only under autopilot points to typed-array behavior, allocation or turn timing.
- If restarting one world changes another's counter, inspect rt_swap and saved per-instance runtime fields. If an event completes after its world restarts, inspect token ownership and cleanup in the nucleus.
- An empty frame after a compositor restart is a retention or resource-lifetime failure until the recorded screen tree and framebuffer show otherwise. Test the late subscriber path explicitly.

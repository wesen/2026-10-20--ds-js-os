---
Title: Porting PicoCalc workflows to shared CJI machine code
Ticket: PICOCALC-CJI-PORT
Status: complete
Topics:
    - picocalc
    - native
    - esp32-p4
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/system/agent.js
      Note: Saved conversation restoration
    - Path: repo://picocalc-os/nucleus/agent_transport.c
      Note: Request ownership and cancellation
    - Path: repo://picocalc-os/nucleus/fs.c
      Note: Delegated filesystem operations
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

Paths beginning with js, sdk, nucleus and port below are relative to picocalc-os. Compiler paths are relative to the repository's top-level `cji/` directory.

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

## Following a handle from one world to another

Consider what happens when Files opens a document in Editor. Files holds a directory capability. Its call to `root.at(path, "rw")` gives it a child capability for that one file. Editor has no filesystem claim of its own. Passing the child lets Editor read and write that file. A path string alone cannot authorize those operations. The same message mechanism lets a compositor give a display driver access to a framebuffer without copying its pixels through JSON.

A handle has two representations. In application code it is an object with an ID, a type and methods. In a message it is a single-key JSON object such as `{"$h":17}`. The kernel owns the authoritative record for 17, including the holder set, rights, parent, revocation state and minter. Copying the marker into a text editor or persistent record does not add a holder.

```text
sender JS object       serialized message         native nucleus             receiver
{items: [handle]}  ->  {"items":[{"$h":17}]}  ->  validate complete JSON
                                                 check holder and grant
                                                 enqueue JSON + ids[17]
                                                       |
                                                 deliver, grant 17   ->   decode marker
                                                                          inspect metadata
                                                                          create wrapper
```

QuickJS uses the `enc` and `revive` functions in `picocalc-os/js/prelude.js`. Its encoder sends the IDs separately to the VM bridge. A firmware-bundled CJI world calls the same messaging operations as before. Its kernel entry reads bounded bytes directly, so the native validator collects IDs while parsing the message. This keeps the checked list and wire data together. The P4 loader selects eligible module paths from the same CMake lists that produce their ELFs. User-loaded code, ordinary native test drivers, host processes and Wasm keep their existing messaging rules.

| Entry point | What to follow in the code |
| --- | --- |
| CJI `send(to, type, payload)` and `ask(to, type, payload, opts)` | `src/world-native.js` serializes wrappers at the message boundary. `nucleus/native.c` copies the checked IDs to the deferred message or calls `kernel_ask` with them. |
| CJI handler return and `publish(channel, payload, opts)` | A return value becomes `NW_REPLY`. An invalid transfer rejects the ask. A publication requires a declared channel and honors its claim. Retained publications reject handles because replay could grant authority to a future subscriber. |
| `handle_may_grant` in `nucleus/hw.c` | Uses `handle_use` to check existence, ownership and ancestor revocation. A holder can delegate a grantable handle. A minter can give out its own attenuated child. A recipient of a read-only child without grant rights cannot pass it on. |
| `handle_event` and `settle_ask` in `nucleus/kernel.c` | Delivery or successful reply adds each live handle to the receiver's holdings. Message handling may occur later than delivery. Releasing a handle after delivery can affect a message still in the mailbox. |
| `$decode` and `$handle` in the compiled prelude | Rebuild the wrapper using receiver-checked type and rights. Each wrapper supplies operations for its kernel type. File, directory, framebuffer and SPI calls enter the checked native syscall path. The kernel verifies the holder and rights again at each use. |

```text
validate the entire payload
for each unique marker (at most MAX_MSG_HANDLES):
    require a positive integer representable by the kernel
    require that the caller holds a live, unrevoked handle
    require the grant right or that the caller minted this handle
if the publication requests retention and contains any handle:
    reject
enqueue the operation with its checked IDs
```

An intern can reproduce this independently of the user interface. Add `-DPICOCALC_TEST_CJI_GRANTS=ON` to the native firmware build below. Inspect `picocalc-os/tests/fixtures/cji-grants/sender.js` and `peer.js`. The sender allocates a one-pixel buffer and passes it inside an array. The compiled peer returns it, exercises all four message directions and attempts to return a read-only child. Search the serial boot output for `CJI GRANT`. The sender expects a refusal for the child, an unknown ID and a retained publication. Build again with `-DPICOCALC_TEST_CJI_GRANTS=OFF` for the normal application image. The test worlds and their DMA claim exist only in the diagnostic manifest.

## How phase 3 runs on the handheld

The build host runs Node, CJI and the RV32 assembler. The PicoCalc runs the resulting worlds. For each selected world the build packs its ELF into a zlib stream with the original byte length. At boot the P4 ROM decompressor expands the bytes from the trusted firmware bundle. The loader checks the image, relocates it in PSRAM and registers its event entry points. The existing application partition, NVS records and file storage keep their layout.

The imported compiler also contains a separate `rv32-stage1` target for a compiler compiled by CJI and a `BOARD=1` test harness for compile, assemble, load and run under an emulated kernel. The physical shipping firmware in this ticket builds its modules ahead of time. A physical self-hosting experiment would need to package the compiler and assembler, allocate their working memory, and demonstrate one source-to-running-world round trip under ESP-IDF.

### From a file selection to persistent text

The browser owns a root directory handle. When a file opens, `fs_at` derives its path and intersects its rights with the parent's rights. Editor receives that child by message. `fs_prepare` checks the operation, path and byte limit before the requesting engine allocates a promise token. `fs_defer` records the owner's ID, epoch and token. The filesystem worker performs the I/O, then the kernel delivers the settlement to the same running instance.

### From an app frame to LCD pixels

The compositor subscribes to frames and draws the active app into a back buffer. A commit compares that buffer with the front buffer and returns dirty rectangles. The display world holds a read-only child and submits SPI commands and pixel jobs for the rectangles. A submitted pixel job pins the front buffer. The bus completion drops that pin, including when all application handles have already been released.

```text
compiled compositor -> paint -> commit -> ask display to flush
                                          |-- SPI command
                                          |-- SPI command
                                          +-- SPI pixels (buffer pinned)
nucleus delivers each settlement          |
display awaits the whole group <-----------+
display replies -> compositor finishes this draw
```

The shared prelude tracks the promise returned by the outer handler. A settlement for one SPI job can run a continuation while other jobs remain pending. Ending the turn on that intermediate event makes the compositor invalidate the framebuffer. On this device the symptom was an image with every color complemented. The host-side framebuffer captures made that failure reproducible.

### From Chat to a provider result

Chat sends a submit or cancel message. The compiled Agent validates the sender and owns a bounded conversation state. The C transport accepts one request at a time and associates it with a ticket, owner and epoch. Start and cancel take effect after the current segment commits. Poll returns pending, an error or a single completed result. The compiled prelude reads completed metadata and response text in the same segment. The body may contain up to 65,536 UTF-8 bytes. The outgoing request limit is 49,152 bytes.

| Code | Review question |
| --- | --- |
| `nucleus/fs.c`, `nucleus/native.c` | Which rights and relative path permit this file operation? Who owns its eventual settlement? |
| `js/system/compositor.js`, `js/drivers/display.js`, `port/esp32p4/main/bus_p4.c` | When does a dirty rectangle become panel I/O, and who holds the last buffer reference? |
| `nucleus/agent_transport.c`, `port/esp32p4/main/agent_p4.c` | Is this ticket still active for the same world and epoch? Has the result body changed owners? |
| `tests/fixtures/cji-phase3` | How do the on-board tests simulate a canceled completion, compare a replacement answer, and release a framebuffer during transfer? |

### Reproduce the acceptance checks

1. Build the optional ELF configuration below with `-DPICOCALC_TEST_CJI_PHASE3=ON`. The diagnostic manifest uses the shipping Agent binary under the name `agent-probe`, which gives the fixture its own persistent record. A local provider and Chat driver exercise cancellation, a replacement run, a device-status continuation, and transport limits.
2. Look for `PHASE3 FS containment true`, `PHASE3 DMA pinned true`, `PHASE3 DMA completion true`, `PHASE3 AGENT replacement true` and `PHASE3 AGENT bounds true` on serial. The delayed-completion log identifies both the canceled and replacement tickets.
3. Open a disposable note through Files, save it in Editor, reboot and reopen it. Compare the Editor frame before and after a display restart. Restart the compositor separately, refocus Editor from the launcher and compare the application region again. The reference and native captures in the ticket's `various` directory use two host pixels per device pixel. Cropping the first 44 host rows excludes the changing status clock.
4. Build with both diagnostic flags off for the normal image. Compare the generated manifest with `js/system.json`. The selected worlds change engine and file only. Check the physical world table and open Chat using the existing session. The isolated fixture and the ordinary startup exercise different workloads.

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

The optional ELF manifest starts a diagnostic world named `nat-import`. Its source, `picocalc-os/natives/wimport.c`, declares an external `path_open` symbol. The P4 resolver refuses the module during relocation, before its initialization or file access can run. Five attempts within ten seconds trigger the kernel's restart limit. A boot log with `nat-import ... stays stopped` alongside healthy application worlds is the expected outcome of that test.

## Release verification on the PicoCalc

A normal boot loads the saved conversation from the Agent's store. The compiled store wrapper parses a fresh record on each read. The returned object is private to the caller. The Agent validates the history once, clips each message into its display entry, then publishes a snapshot to Chat. With an existing record, initialize yields to the scheduler between the expensive stages. The 100 ms budget applies separately to each turn.

| Hardware observation | Result |
| --- | --- |
| Original single-turn native restoration, five attempts | 147.065–159.763 ms, all over budget |
| Final release cold boot, existing conversation | Agent and Chat idle, zero restarts |
| First deliberate Agent restart, consecutive turns | 22.100, 55.087, 19.417, 10.839 ms |
| Second deliberate Agent restart, consecutive turns | 20.027, 58.508, 20.424, 11.294 ms |
| Final bus counters | 877 I2C and 158 SPI transfers, zero errors |
| Diagnostic image | Filesystem containment, pending DMA lifetime, stale request suppression, transport bounds and network denial passed |

The earlier QuickJS release also restored the saved conversation. A comparison of engine speed would require paired measurements on the same workload. The final release application occupied 0x332790 bytes. Its SHA-256 is recorded in step 7 of the diary. The compiler runs on the development machine to build these modules. Booting this firmware executes their RV32 machine code on the ESP32-P4.

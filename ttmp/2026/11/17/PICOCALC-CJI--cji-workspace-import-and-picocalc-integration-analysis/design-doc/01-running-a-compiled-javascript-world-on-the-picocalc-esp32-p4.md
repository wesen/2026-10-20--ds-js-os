---
Title: Running a compiled JavaScript world on the PicoCalc ESP32-P4
Ticket: PICOCALC-CJI
Status: active
Topics:
    - picocalc
    - esp32-p4
    - native
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/main/CMakeLists.txt
      Note: Firmware bundle
    - Path: repo://picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c
      Note: Resolver and loader
    - Path: repo://picocalc-os/sdk/nw_elf.h
      Note: Board ABI
    - Path: repo://cji/runtime/cji_elf.c
      Note: Runtime entry and state management
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/various/rv32-nosnap.txt
      Note: Reproduced emulator gate
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T19:45:51.881874967-05:00
WhatFor: ""
WhenToUse: ""
---

# Running a compiled JavaScript world on the PicoCalc ESP32-P4

## The first successful run

Bring up one service called **toplog**. Its source logs a line at startup and answers a ping. The first hardware milestone is to see that line on the PicoCalc console, get the string `pong` back from the running service, and repeat both observations after restarting the world. The display, keyboard, compositor and normal applications continue to use the existing OS. A keyboard or display driver would make a poor first test because a fault could take away the interface needed to observe it.

The following fixture is the entire application. Opening the file in a JavaScript interpreter is insufficient to exercise it. The two functions it calls are supplied by the world runtime.

```javascript
log("hello from the top level");
service("toplog").on("ping", (s) => "pong");
```

This guide uses the repository's `cji/` as the compiler root and the repository's `picocalc-os/` as the OS root. The compiler source is a curated snapshot. The host build and RV32 trace comparisons below ran on this checkout. Firmware revision 6a8e1a0 passed this procedure on ESP32-P4 v1.3. The implementation uses uncached field lookup on the board to release 96 KiB of internal RAM and avoid retaining module addresses across restarts. The ticket’s various/p4-acceptance.txt and various/p4-repl-pong.png record the physical results. The design and first-pass diagnostics below describe how the integration was developed.

## Follow a world across the system

A world is a scheduled app, service or driver. The nucleus owns its name, lifecycle, permissions, memory budget and event queue. A JavaScript world normally runs under QuickJS. A native world implements the same externally visible operations through a small C ABI, the binary-level agreement on arguments, return values and data layout. CJI translates a supported subset of JavaScript into code implementing that native interface. The scheduler can consequently deliver a message from an interpreted sender to a compiled receiver.

```text
Developer workstation                      PicoCalc ESP32-P4
---------------------                      -----------------
toplog.world.js                            flash: OS + bundled module
  | Node runs cji.js                              |
  v                                               v
SLIR instruction listing                   manifest selects native engine
  | slas-rv32 --module                            |
  v                                               v
RV32 shared object  ---> firmware bundle   elf_loader relocates into PSRAM
                                                  |
                           +----------------------+
                           v
                    module entry / init / event
                           |
                      shared CJI runtime
                           |
                    kernel table -> nucleus
```

There are three distinct products. **The compiler** runs under Node on the workstation. Its native-world frontend combines the application with the JavaScript implementation of the world APIs. Its passes reduce variables, functions, closures and runtime operations to SLIR, the assembler's instruction language. **The assembler** is a workstation C executable using the RISC-V backend of SLJIT. It writes position-independent code and records relocations for addresses that will only become known at load time. **The firmware** contains the OS, the device build of the C runtime, a small bridge and the module bytes. Running the compiler on the device would be a separate product and would consume flash and memory before the service ever started.

For the first build use the upstream single-world, no-snapshot mode. The JavaScript prelude is compiled into the module. The C operations implementing dynamic values, strings, allocation and collection live in firmware. On startup the module evaluates its top-level source against the real kernel, which gives us the log line. This costs more module space than sharing a compiled prelude, but removes a generated unit, an export manifest and snapshot restoration from the first hardware diagnosis.

## Reproduce the known result on Linux

From the repository root, in a POSIX shell with Node, make, a native C compiler, Clang with the RISC-V target, and LLVM's ld.lld available, run the following. On this host, ld.lld was available under the stable Rust toolchain's lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld directory.

```sh
repo=$(git rev-parse --show-toplevel)
cd "$repo"/cji
PICOCALC="$repo/picocalc-os" NOSNAP=1 sh tools/rv32/nw-test.sh
readelf -h -r -W build/rv32/nw/toplog.so
readelf --dyn-syms -W build/rv32/nw/toplog.so
```

The script builds a fake kernel and runtime for an instruction emulator. It loads each module, feeds in the events specified by the fixture, records every kernel call, then compares the trace byte for byte with its expected output. It also runs a reference module produced by a conventional C compiler. A failure in both the C control and the CJI cases implicates the shared test environment. A failure confined to one world points to that source, its generated code, or its expected trace.

| Fixture | Bytes loaded | Peak allocated blocks, bytes | Result |
|---|---:|---:|---|
| flaky | 170,096 | 38,676 | matched |
| snake | 233,840 | 71,604 | matched |
| toplog | 199,616 | 38,672 | matched |
| topstate | 169,256 | 38,674 | matched |
| C reference module | | | matched |

For a shorter edit cycle after building the assembler, these are the two commands that produce the chosen world. The result here was a 199,640-byte ELF32 RISC-V shared object, entry address 0x2e520, flags 0x3 (compressed instructions and single-float ABI), with 575 relocations and 82 imported names. The address is an offset in the image before relocation.

```sh
make slas-rv32
node cji.js tests/native/toplog.world.js --native --emit > /tmp/toplog.slir
./slas-rv32 -c /tmp/toplog.elf --module /tmp/toplog.slir
```

## Two tables and one turn

At boot the P4 reads its bundled native manifest. The loader checks the ELF header and ABI, relocates the image, checks the loaded size against the world budget, then calls its entry with two pointers passed in argv. Although the parameter is named argv, the pointers designate structures. Treating either as a C string would corrupt the handshake.

| Interface | Owner and lifetime | Contract |
|---|---|---|
| nw_elf_kernel | Firmware, stable across turns | abi, call and error. call carries an opcode, three numeric arguments, three length-delimited inputs and an output buffer. |
| nw_elf_module | Per-world backend instance | Entry fills abi, init and event. The loader validates all three before scheduling. |
| CJI world block | Relocated module, 512 bytes in this version | Contains entry points, allocator pointers, root-stack configuration and saved runtime state. Layout constants are in runtime/cji_elf.h. |
| event | Kernel calling the module for one turn | kind, second, timer, token, type, JSON pointer and length, sender. second means ask for a message and success for a settlement. Input strings live through this call. |

The entry, initialization and event calls have different jobs. The entry validates both ABI versions and installs callbacks. Initialization selects the charged allocator, creates the world heap and roots, runs main and registers the service. The event callback dispatches a message to a handler and returns its turn status. Generated entry stubs first select the module's world block. The common C bridge saves and restores that world's runtime state around execution. This matters even for a prototype with one service because restart gives the next instance a new heap.

```text
QuickJS caller         nucleus / P4 backend       compiled toplog
     | ask(ping)                |                       |
     |------------------------->| event(message, ask=1) |
     |                          |---------------------->|
     |                          |   call(reply, "pong") |
     |                          |<----------------------|
     |                          |      return DONE      |
     |                          |<----------------------|
     | settlement for token     |                       |
     |<-------------------------|                       |
```

The return code reports whether a turn completed or will answer later. The actual reply travels through the kernel call table. CJI uses a third result for a failed world. The P4 backend already treats an unexpected end code as a native protocol failure. A CJI-managed exception can take this route. An arbitrary machine-code fault can panic the entire device. Native ELF worlds are therefore firmware-bundled, trusted programs.

## Implement the device build

### 1. Compile the shared C runtime for the actual target

Work inside the existing optional native ELF component. Its CMake registration lives in `port/esp32p4/optional/native_elf/CMakeLists.txt`. Build `runtime/runtime.c` and `runtime/cji_elf.c` with the ESP-IDF component toolchain and the OS SDK include path. Keep the host assembler build separate. The emulator firmware's libc, host-call assembly, fake kernel and startup code belong exclusively to the test harness.

A probe using Espressif GCC 14.2.0, rv32imafc_zicsr_zifencei and ilp32f compiled cji_elf.c, including the static layout assertions. Two concrete runtime porting issues surfaced:

- The toolchain reports `fatal error: uchar.h: No such file or directory`. A temporary copy with that include removed compiled past the UTF-16 literal. Inspect the actual uses and retain the literal's two-byte code units. Adding the emulator include directory globally would shadow the device's time, stdio and allocator headers.
- The next diagnostic is `'struct tm' has no member named 'tm_gmtoff'` in local_offset. Its contract is the local offset in milliseconds at the supplied instant. Implement this target-specific calculation using the local and UTC broken-down times for that instant and civil-day arithmetic, or a verified equivalent in the installed IDF. A constant offset would give wrong answers around daylight-saving transitions. Test UTC, a negative offset and dates on both sides of a transition. Rebuild under the project's real compiler flags and resolve any subsequent link errors.

Use the runtime headers when treating 64-bit tagged JavaScript values as pointers on a 32-bit system. Review the integer/pointer warnings from GCC in this context. A successful standalone object build does not exercise IDF's warning policy, newlib link configuration or flash capacity.

### 2. Connect compiled imports to their definitions

The current board resolver offers selected libc operations and soft-float helpers. A compiled module additionally imports functions such as rt_collect, variables such as free_ptr, and the cji_elf_entry, cji_elf_init, cji_elf_event and cji_elf_world symbols. A function import needs the address of code. A global import needs the address of its storage. Substituting the current value of free_ptr would give generated code a stale heap pointer after collection.

Use the existing `tools/rv32/resolve-table.mjs` board mode. Feed it the **target relocatable objects** of the C runtime and glue. Make their compilation explicit dependencies of the generated C table. Compile that table into the component and link the same objects exactly once. In a component build, object libraries or explicit object outputs can express this dependency without a cycle. Inspect the final firmware map for duplicate definitions and retained exports.

```sh
node tools/rv32/resolve-table.mjs --name cji_resolve \
  --cji path/to/runtime.o path/to/cji_elf.o > path/to/cji_symbols.c
```

The generated symbols are cji_resolve and cji_nresolve. The P4 resolve function already remembers the first missing name to explain relocation failures. Insert the CJI lookup before recording that failure. Preserve the precedence of the kernel's charged allocators.

```text
resolve(name):
    search existing SYMS for name
    if found, return its address
    search generated cji_resolve entries for name
    if found, return its address
    remember first missing name
    return zero
```

For every undefined dynamic symbol in toplog.elf, identify a provider in these two tables. A successful firmware link alone cannot check that property because the module is embedded as bytes. Conversely, a complete name set cannot establish call compatibility. Compile both sides to their specified ABI and use the real reply test to exercise it.

### 3. Bundle the existing test service

In `port/esp32p4/main/CMakeLists.txt` follow the existing optional native module build. Add the generated toplog ELF to BUNDLE_EXTRA as `natives/toplog.elf` and its build output to BUNDLE_EXTRA_DEPS. The CJI artifact already contains the position-independent entry stubs. Feeding it through the C-world compile recipe would introduce a second entry implementation. Ensure that changing the fixture, compiler or runtime ABI rebuilds the relevant outputs. Keep generated SLIR, modules and generated C in the build directory.

Add this entry to the existing worlds array in `optional/native_elf/system.elf.json`. It is an example implementation edit. The curated import does not change the running OS manifest.

```json
{"name":"toplog","file":"natives/toplog.elf","engine":"native",
 "budget_ms":20,"mem_kb":320}
```

toplog does not request any hardware handles. The 64 KiB allowance of the existing C examples is too small for its loaded code alone. The emulator reported 238,288 bytes for the loaded segment and peak blocks together. A 320 KiB allowance gives a concrete starting point, with about 87 KiB left under that accounting. The runtime's root stack holds references used by the copying garbage collector. Its measured 304 bytes are part of runtime memory use, separate from the FreeRTOS kernel task's C stack. The backend charges loaded segment bytes and module allocation payloads. Heap headers and loader overhead can still reduce system free memory.

### 4. Build and inspect the complete image

Use ESP-IDF v5.4.2 from the P4 port README. This checkout already contains a build-elf configuration for the Wi-Fi plus native ELF variant. Reproduce the known configuration so that the CJI change is the experiment. The cached baseline application binary here is 2,674,080 bytes. The factory partition is 4,194,304 bytes, leaving 1,520,224 bytes against that historical binary. Run the partition-size check against the newly linked image. Emulator code size or the size of toplog.elf cannot establish final fit.

```sh
cd "$repo/picocalc-os/port/esp32p4"
. /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -B build-elf -D PICOCALC_AGENT_WIFI=ON \
  -D PICOCALC_NATIVE_ELF=ON -D SDKCONFIG=sdkconfig.agent-elf \
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
idf.py -B build-elf size
```

Inspect the link map for cji_elf_entry and the generated table, the module header for ELF32/RISC-V/ilp32f, and the generated bundle for the exact manifest key. The 4.19 MB self-hosted compiler discussed in chapter 35 has no role in this image.

## Operate and diagnose the physical board

The host enumerated a USB Single Serial bridge with VID/PID 1a86:55d3 and serial 5B61091051. That serial agrees with the default in `tools/p4cap.py`. Host lsusb -t showed both interfaces on bus 003 port 003 with no driver bound. There was no serial-by-id directory or ACM/USB tty. This confirms enumeration of the expected bridge. Reading the P4 chip revision, boot log and application state requires a working tty.

1. Inspect `lsusb -t`, `ls /dev/serial/by-id` and the host kernel messages for the bridge. Restore the host serial driver appropriate to the interface and confirm that the resulting port is accessible. Assign its stable by-id path to PORT. Only one reader should own it.
2. From the OS root collect a baseline with the command below. Record the existing worlds, free heap and application health. Use the installed esptool chip identification command on that port to verify ESP32-P4 and revision against the project configuration before writing. If the revision check fails, revisit the target configuration.
3. Once the integrated image passes the build and partition checks and the operator is ready to replace the application, use the existing P4 flash procedure on the verified port. For an already verified matching bootloader and partition layout, the IDF app-flash target writes only the app. Preserve a known-good application for recovery. Coordinate keyboard-bus hold/reset as in p4cap.py.
4. Capture a boot, then a restart. At the existing PicoCalc REPL evaluate `ask("toplog", "ping", null)`. The REPL forwards expressions to the JavaScript sandbox and waits for promises. Its displayed result must be the string pong. Repeat after restart and verify that normal keyboard and display activity continues.

```sh
python3 tools/p4cap.py -p "$PORT" --no-reset -s 6 \
  -c '1 worlds' -c '2 heap' -c '3 stats'
# After loading the candidate, capture startup and a supervised restart.
python3 tools/p4cap.py -p "$PORT" -s 18 \
  -c '6 worlds' -c '8 restart toplog' -c '12 worlds' -c '14 heap'
```

| First observation | Next diagnostic |
|---|---|
| No tty for the expected bridge | Resolve host driver binding before investigating firmware. |
| Board boots, toplog absent | Check selected build directory, compiled-in manifest and bundled file key. |
| Loader reports wrong board | Inspect ELF class, machine and float ABI. Regenerate with slas-rv32 in module mode. |
| Loader prints an unavailable name | Look up that exact import in both resolver tables and the final map. |
| No module table after relocation | Inspect entry address, CJI block size/version and NW_ELF_ABI at cji_elf_entry. |
| World starts, then crashes before ping | Read its first log, charged size and budget. Compare top-level behavior with toplog.out. |
| First ping works, restart fails | Trace backend unload, per-world allocations and rt_swap across the two instances. |

Save the firmware revision, size, chip revision, boot log, two replies and the world/heap output in the ticket. These observations establish that the physical P4 executed the emitted code and serviced a kernel message across restart. Emulator results belong beside that record as a reproducible control.

## Source map for review

- **Compiler path.** From the repository root, start at `cji/cji.js`, then `src/world-native.js` for the bundled world API and `src/compiler.js` for the pass ordering. Inspect `runtime/rv32_mod.c` for ELF layout, relocations and thunks.
- **Runtime boundary.** Read `cji/runtime/cji_elf.h` beside `runtime/cji_elf.c` in the same tree. Follow entry, init, enter/leave and event. Then inspect `runtime/runtime.h` and `runtime/runtime.c` for roots, collection and state swapping.
- **OS boundary.** Under picocalc-os, `sdk/nw_elf.h` defines the two tables, `sdk/nw.h` explains the event and service API, and `nucleus/native.c` dispatches native operations. The physical bridge from those tables to the scheduler is `port/esp32p4/optional/native_elf/native_elf_p4.c`.
- **Build and operations.** Read `port/esp32p4/main/CMakeLists.txt`, its `bundle_js.cmake`, the optional native component manifest, and `port/esp32p4/partitions.csv`. UART commands are implemented in `port/esp32p4/main/main_p4.c`. Capture is implemented in `tools/p4cap.py`.
- **Independent controls.** The compiler tree contains `cji/tests/native/toplog.events` and `toplog.out` in that directory. The emulator driver is `cji/tools/rv32/nw-test.sh`. Read the fixture beside `various/rv32-nosnap.txt`. Selected chapters 24, 30 and 35 cover Linux host integration, RV32 module loading and the separate self-hosting experiment.

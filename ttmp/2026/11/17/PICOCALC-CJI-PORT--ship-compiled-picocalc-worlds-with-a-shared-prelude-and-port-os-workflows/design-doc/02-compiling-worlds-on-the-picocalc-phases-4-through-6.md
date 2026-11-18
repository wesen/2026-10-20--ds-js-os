---
Title: Compiling worlds on the PicoCalc - phases 4 through 6
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
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: World replacement lifecycle
    - Path: repo://picocalc-os/port/esp32p4/compiler/install.c
      Note: Kernel-task activation and verified two-slot installation
    - Path: repo://picocalc-os/port/esp32p4/compiler/tool.c
      Note: Private stage-1 invocation and module assembly
    - Path: repo://picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c
      Note: Production module ABI and relocation
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/tools/rv32/fw/board_main.c
      Note: Emulator compilation reference
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI-PORT--ship-compiled-picocalc-worlds-with-a-shared-prelude-and-port-os-workflows/scripts/06-exercise-device-compiler.py
      Note: Physical Editor, peer IPC, failure and reboot acceptance
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI-PORT--ship-compiled-picocalc-worlds-with-a-shared-prelude-and-port-os-workflows/various/phase-4-6-p4-acceptance.txt
      Note: Physical release digest, timings, peer replies and corruption checks
ExternalSources: []
Summary: Compile trusted JavaScript on the ESP32-P4, replace a development world and reuse a verified installation after reboot.
LastUpdated: 2026-11-17T21:35:20.183356433-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiling worlds on the PicoCalc - phases 4 through 6

## Follow a ping from source to hardware

Open the imported CJI tree at `ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/`. Paths beginning with `cji/` below are relative to that tree's parent. Other paths start at the repository root. Start with `cji/tests/native/toplog.world.js`. Its top-level statement logs a greeting. Its service registers a handler for a ping and returns the string pong. This example tests **both** evaluating module-level code and delivering a later event. The expected calls are in the adjacent `toplog.out`.

In the Phase 3 release the host ran the JavaScript compiler and the PicoCalc ran the resulting machine code. The development loop moves the two middle steps below onto the PicoCalc. Authoring the compiler remains a host operation. An intern changing a world should have to transfer only its source.

```text
once per firmware/toolchain release, on host
  compiler JS -> stage 0 -> stage 1 (RV32 compiler)
  shared prelude -> firmware unit + ordered export list

once per source revision, on PicoCalc
  source bytes -> stage 1 -> SLIR text -> slas -> ELF bytes
                      compiler          assembler
  ELF bytes -> P4 ELF loader -> world init -> ping -> pong
                                   nucleus dispatch
```

SLIR is the compiler's textual instruction representation. The assembler maps its operations onto the 32-bit RISC-V instruction set and emits an ELF module with relocation records. A relocation tells the loader which address to fill in once the module and its imports have real addresses. The shared prelude provides functions such as service registration. Each world references the firmware's compiled copy through the unit export list. A matching name alone cannot establish binary compatibility across releases.

A world has a stable identity, an event queue, claims on resources, a memory limit and a turn budget. A native module enters through a table described in `picocalc-os/sdk/nw_elf.h`. The nucleus supplies kernel operations and dispatches events. Native code runs with the processor privileges of the firmware. Giving a world zero resource claims restricts calls through that table. It cannot make arbitrary machine code safe to execute. The operator who authorizes a native source revision must therefore be trusted.

## Baseline and capacity

The host recipe in `picocalc-os/port/esp32p4/main/CMakeLists.txt` emits a world unit, inserts the shared prelude startup call, and runs slas-rv32 with the unit export list. It packs the finished module for storage. Compression ends at the storage boundary. The production loader consumes ordinary ELF bytes. The emulator's `cji/tools/rv32/fw/board_main.c` demonstrates the same source-to-module sequence with an in-memory filesystem and a fake kernel. Its fake kernel and emulator host calls must stay out of the P4 runtime.

Chapter 35 of the import measured about 4.19 MB of compiler code and 8.5 MB peak compilation memory in its emulator experiments. Use these as sizing inputs. Memory for the running OS, loaded compiler, source, intermediate text, assembled module, loader copies and active worlds can overlap. Record the largest free PSRAM block as well as total free bytes before loading, after loading, after assembly and after cleanup. Fragmentation can prevent a single large allocation even when the total is sufficient.

The partition table in `picocalc-os/port/esp32p4/partitions.csv` gives the factory application 4 MiB, world records 128 KiB, and the files FAT volume 0xBD0000 bytes. Phase 3's application already occupies 0x332790 bytes. The implementation compresses the entire private compiler and assembler to about 645 KiB and bundles them in the application partition. The compiler-enabled builds occupy about 3.84 MiB of the 4 MiB application partition. The firmware reads the tool from the immutable bundle with port_read_file, expands it in memory, then relocates it into PSRAM. This removes compiler provisioning and a second trust decision from the installation path. A fresh compiler instance per build also gives the assembler's file-scope counters and pointers their original values.

## Phase 4 · Compile one known world

Work upward from a host-built reference. Save the exact source, frontend options, prelude/unit version, expected module digest and expected observable calls for toplog. Select no-snapshot mode so the world runs top-level statements when started. A snapshot taken by executing module initialization at build time would obscure the greeting. Use the same unit list for both builds.

1. Build stage 1 from the compiler sources and package it with the assembler for the physical target. Keep the compiler runtime's globals and allocator separate from the runtime used by live worlds.
2. Run one bounded job off the kernel task. The job owns its source copy, intermediate text, temporary allocator and output bytes. Give it a private input file or memory stream. Collect a bounded diagnostic if the frontend rejects its input.
3. Insert the prelude startup call exactly once. Assemble against the pinned export list. Compare the uncompressed output with the host reference before diagnosing any behavioral difference.
4. Return to the kernel task for world creation. Let the production ELF backend check the architecture, floating-point ABI, imports and segment budget. Observe the greeting, deliver a ping and inspect the reply. Record compile wall time and a concurrent keyboard/display observation.

```text
compile(source, unit) -> result                 proposed contract
    open private compiler instance
    try
        slir = frontend(source, world_unit=true)
        linked = insert_prelude_start(slir)
        module = assemble(linked, unit.exports)
        return owned_bytes(module)
    finally
        release instance, streams and scratch
```

A worker finishing on another core must hand ownership of the bytes back to the kernel task. Only the kernel task touches the world table. An allocation refusal, assembler failure, short write or loader rejection should identify the stage and release all temporary ownership. A subsequent compile must be possible.

## Phase 5 · Edit, compile and replace

Use one explicitly designated development world. The operator edits its source using the existing Editor and Files workflows, then requests a rebuild. Read the whole saved file into a bounded immutable buffer at submission. This snapshot prevents edits made during compilation from changing the meaning of the running job. Accept one compiler job at a time. Return busy for a second request until completion so the first implementation needs no queue or cancellation protocol.

```text
active revision A       build B in private storage
        |                   |            |
        |                failure       success
        |                   |            |
        +<--- diagnostics --+       validate B
                                         |
                                 kernel installs B
                                         |
                               observe B or restore A
```

Keep A's source/module until B boots. Compilation and load validation may fail before the old world is disturbed. If starting B requires releasing A's resources, preserve enough information to restart A on failure. A restart recreates volatile JS state. Persisted records remain keyed by the world's identity. Handles, requests and callbacks from the old epoch must never reach its replacement. A new top-level side effect that already reached another world cannot be rolled back, so the initial development world should use harmless log/reply behavior.

For the physical acceptance test, change the reply from pong to a distinguishable second string and rebuild without a device reset. Introduce a parse error, capture the diagnostic, and send another ping to the working revision. Restore valid text, rebuild again and compare the post-job free memory range. Check the world's identity, limits and claims after replacement. Make the test drive the same operator entry point used with the Editor.

## Phase 6 · Install once and reuse after reboot

An installation binds an authorized source revision to one world and one execution policy. The source and policy together decide whether native execution is permitted. Store source files in normal storage. Bind the trusted installation record and native artifact digest to state ordinary worlds cannot write. A content hash detects corruption only when the expected hash comes from a trusted place. A writable cache file must never grant itself permission to execute.

Use a digest over length-delimited fields covering source bytes, compiler and assembler build identity, unit exports and implementation, target ABI, and flags that affect code generation. A firmware build identity can stand for these dependencies if the build system guarantees it changes with every relevant input. Store the ELF content digest separately. Before every cache-backed native load, verify the authorized record, expected key, exact length and content digest of the bytes actually handed to the loader.

```text
install(authorized source snapshot, policy)
    if source is eligible for native compilation
        lookup by source and toolchain identity
        if verified hit: use those module bytes
        else: compile, validate and stage artifact
    otherwise select QuickJS if policy permits
    start candidate on kernel task
    on successful start: commit active record
    on failure: retain previous active record
```

Commit the new artifact before publishing its record. Keep the previous record valid across interruption. On reboot, an orphaned candidate may be discarded. A record referring to missing or corrupt bytes is a cache miss, never a license to execute them. Bound cache growth, for example by keeping the active artifact and at most one replacement for the development slot. Reclaim the old artifact only after a confirmed commit. Serialize updates and activation so two installers cannot publish over each other.

An explicit native policy reports compiler rejection. An automatic policy may select QuickJS for valid JavaScript outside CJI's supported subset. Syntax errors should remain visible. Cache I/O failure, an ABI mismatch or memory exhaustion deserves its own diagnostic; avoid silently persisting a misleading language fallback. Keep ordinary storage-spawned apps on their existing JS/Wasm path. New installation policy belongs at a trusted operator boundary.

## APIs and source reading order

| Existing entry | What to inspect |
| --- | --- |
| `cji/tools/bundle.mjs`, `cji/tools/jstok.mjs`, `cji/Makefile` | Bundle the frontend, compile it using stage 0 and assemble its stage-1 object. Generated objects stay in build directories. |
| `cji/tools/rv32/fw/board_main.c` | Read compile, with_start and main in order. Follow ownership of the SLIR stream and module bytes. |
| `cji/tools/rv32/fw/board_slas.c` | board_slas accounts for temporary assembler allocations and frees its region on return. Releasing a region alone leaves file-scope pointers stale if the same process image is reused. |
| `cji/runtime/rv32_mod.c`, `cji/tools/link-units.mjs` | The module writer and host reference for prelude linkage. |
| `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c` | elf_load checks ELF32/RISC-V/ilp32f, resolves permitted symbols, calls esp_elf_relocate and obtains an NW_ELF_ABI module table. elf_unload releases the instance. |
| `picocalc-os/nucleus/kernel.c` | kernel_spawn_loaded chooses the storage engine. kernel_spawn replaces a user world. Its existing teardown precedes the new boot, so callers promising rollback must retain a working revision. |
| `picocalc-os/port/esp32p4/main/main_p4.c` | console_exec handles operator input on the kernel task. Worker notifications should follow the existing completion handoff. |
| `picocalc-os/port/esp32p4/main/fs_p4.c` and `store_p4.c` | FAT file ownership and persistence of private world records. Keep operator installation metadata separate from ordinary editable files. |

## Verification and fault isolation

Build the host reference from the same checkout as the firmware. From the CJI source directory, set PICOCALC to the absolute picocalc-os directory and run the emulator gate below. It checks stage-1 SLIR, ELF bytes and fake-kernel calls independently. Physical acceptance additionally exercises the actual loader, scheduler, storage and reset sequence.

```sh
BOARD=1 sh tools/rv32/nw-test.sh
```

- **Different SLIR.** Compare source bytes, frontend revisions, command options and diagnostic output first. An assembler investigation comes later.
- **Equal SLIR but different ELF.** Compare prelude startup insertion, unit export list, assembler options and snapshot mode.
- **Equal ELF but different behavior.** Check the real world name, event payload, ABI/import resolution, memory limit and kernel calls. Record the first divergent observable event.
- **Success once, then failure.** Exercise success, syntax failure and success in the same boot. Inspect retained assembler globals, worker cleanup, stream ownership and world epoch.
- **Wrong result after reboot.** Inspect the trusted record, source/toolchain key, artifact digest and publication ordering. Test a missing artifact, a changed source and changed toolchain identity independently.
- **Responsiveness.** Measure the longest input delay while compiling alongside the editor. Compiler wall time and the longest kernel turn answer different questions. Report both on the actual board.

## Building and operating the implementation

The build switch is PICOCALC_DEVICE_COMPILER in the ESP32-P4 CMake project. Enable it together with PICOCALC_NATIVE_ELF. Keep the board's existing SDK configuration, partition table and Wi-Fi selection. From a shell with ESP-IDF 5.4.2 activated, run the following in picocalc-os/port/esp32p4. The host bootstrap uses Node, Clang, LLVM objcopy, LLD and a host C compiler. The first build needs several GiB of host memory.

```sh
idf.py -B build-elf -D PICOCALC_NATIVE_ELF=ON \
  -D PICOCALC_DEVICE_COMPILER=ON build
```

The trusted operator uses the serial console. For an editable file under apps/, open Loader, select the file, press F3 to edit and F2 in Editor to save. The build reads up to 32 KiB from the specified file. The compiler runs on core 0 with a 256 KiB PSRAM stack. Two nested assembler frames alone use 65,696 and 70,224 bytes. Core 1 runs the kernel on its existing internal stack. The worker decompresses the immutable tool on core 0 and pauses. Core 1 relocates it because the SDK's instruction-cache flush temporarily disables external-memory access. The kernel then wakes the worker and resumes normal event dispatch. Send a second build while it is running to observe the busy response.

```text
cji build apps/cjiprobe.js      require native compilation
cji install apps/cjiprobe.js    allow a QuickJS fallback
worlds                         inspect dev-cji and its restart count
heap                           free memory and largest blocks
```

Both commands install a successful result in the single dev-cji slot. Here the physical console install command selects the automatic policy. Manifest engine names and ordinary storage spawn retain their established meanings. The build command is strict about native code. The install command first tries native code and allows a frontend rejection to reach the normal QuickJS boot checks. A failing boot restores the previous source. The general-purpose Loader continues to create worlds named u-NAME. It cannot select the operator's dev-cji identity.

The tool in `picocalc-os/port/esp32p4/compiler/tool.c` has a private CJI runtime, memory files and assembler. The shared object links without unresolved symbols. Its sole entry takes a job described by `compiler_job.h`. The firmware supplies bounded allocation, number parsing, formatting, math and timing callbacks. It copies the module out before freeing every job allocation and unloading the tool. The output ELF then goes through the ordinary world loader.

Read `picocalc-os/port/esp32p4/compiler/install.c` in lifecycle order. compiler_console captures a source snapshot. begin tries the trusted record or starts the worker. compiler_tick consumes the result on the kernel task and activates the immutable bytes. The inactive FAT slot receives the source and artifact before the NVS record changes. compiler_restore verifies stored bytes before use at the next boot. Changing the application build identity invalidates the cached machine code. The cache uses two slots under cjidev/ and one private kernel record keyed cji-installed.

## Read one install transaction in the debugger

The global job has one owner at a time. The source snapshot belongs to the transaction until success or cleanup. Each handoff uses a FreeRTOS notification or queue operation. The separate compiler image has no unresolved imports. Its job pointer is the interface to the firmware. A generated **world** has a different entry point and resolves the existing firmware world API. Keeping these two entry contracts separate lets the compiler use its private memory streams without exposing filesystem calls to a world.

```text
kernel task, core 1                    worker, core 0
capture source and policy
READY -> LOADING   ---- notify ------> expand tool and read exports
                  <---- queue -------- wait for relocation
relocate tool using internal stack
LOADING -> BUILDING --- notify ------> compile -> assemble -> copy ELF
                  <---- queue -------- unload tool and release scratch
stage bytes in inactive slot
activate world -> STARTING
   boot error  -> restore previous revision -> READY
   boot OK     -> commit NVS record          -> READY
```

A verified cache hit enters BUILDING with the previously authorized bytes already held in memory. It skips the worker and joins the same activation path. During install after a source-file repair, the cache lookup also checks the **saved source snapshot** in the active slot. Otherwise a legitimate reinstall could run the correct artifact once and still leave the next boot unable to verify its source.

The private record stores the slot, engine, automatic-policy bit, source SHA-256, firmware ELF build identity and artifact SHA-256. Reads enforce size limits and hash the exact bytes used for activation. The record stores fixed-width fields, so lookup has no string concatenation or ambiguous key separators. The application binary's SHA-256 printed by a host tool identifies the flashed image for a test report. The internal cache key uses the SDK's firmware ELF build identity.

### Debugging a rejection

The standalone compiler can report an uncaught frontend exception and stop. On-device, the runtime directs that exception to the embedder's fatal callback. The private tool captures a bounded UTF-8 diagnostic. An automatic install can then give the original JavaScript to QuickJS. If QuickJS cannot boot it, activation fails and the previous revision is restored. A native candidate throwing during initialization reaches the **world's** fatal callback. The kernel can reject that candidate without restarting the board.

For a repeatable board check, use the ticket's scripts/04-observe-compiler.py with an existing trusted test source, then scripts/06-exercise-device-compiler.py from the repository root. The latter writes two disposable apps, operates Loader and Editor over the serial console, asks dev-cji for a reply from a separate QuickJS world, and tests failure and reboot behavior. Reserve the dev-cji slot for this exercise because the procedure installs its fixture in that slot. The corrupted-file cases touch only the installer's test artifacts under cjidev/. Hardware traces should identify the logging world to distinguish the bundled toplog greeting from the new dev-cji instance.

## Results on the physical PicoCalc

The final image is 0x3d79f0 bytes. The packed compiler and assembler account for 659,778 bytes. The board kept its original 4 MiB application partition, private records and files. The test image includes Wi-Fi and native ELF support and has the Phase 3 diagnostics disabled.

| Operation on the physical board | Observed result |
| --- | --- |
| Restore an authorized source after the firmware identity changed | Cache miss. Compiled the 268-byte toplog source and started the 3,704-byte native world in 7,028 ms during system boot. |
| Active-board native install of the original source | 6,025 ms to ready, 8,459,613 bytes peak private scratch. The host and device produced SHA-256 4a3cb25deb8a4c8860148b39361bb4efb3528e29e456c62f9d051f0b8e526d14. The QuickJS peer received pong. |
| Save the changed reply in Editor and rebuild | 5,907 ms. The peer received pong-two from the same development slot. |
| Submit invalid source, then a candidate throwing at boot | Compiler reported line 1, column 16 for the syntax error. The second candidate failed at boot. The live peer received pong-two after each failure. |
| Install valid JavaScript using Proxy | Frontend reported its unsupported construct. The ordinary QuickJS engine started the source and the peer received fallback-pong. |
| Reboot with the verified native install | Native cache hit, zero compiler scratch. About 1,450 ms to ready during boot. A later cache hit on an already running system took 20 ms. |
| Damage the cached ELF on FAT | Next boot rebuilt the artifact, reproducing the host SHA-256 in 7,047 ms. |
| Change the saved source under the trusted record | Boot refused the changed bytes. An explicit install of the original source repaired the saved slot. A simultaneous build got busy. After another reboot the peer received pong again. |

Source-to-ready includes scheduling, storage and world activation. The scratch peak measures the private allocation list. The relocated tool image, worker stack, kernel/world memory and temporary copies consume additional PSRAM. The sanitized serial record under various/phase-4-6-p4-acceptance.txt preserves samples of free and largest contiguous PSRAM. Earlier measurements in the diary explain how the stack size and relocation context were established.

The installer supports one trusted development slot, source files up to 32 KiB and modules up to 384 KiB. These measurements come from small service fixtures. A larger world requires its own latency, memory and interactive workload measurements. Compiler-enabled builds use the existing operator console to authorize installation. The final board retains the original toplog test in dev-cji and the two small test sources under apps/. The acceptance runner stops its polling caller and returns to the launcher.

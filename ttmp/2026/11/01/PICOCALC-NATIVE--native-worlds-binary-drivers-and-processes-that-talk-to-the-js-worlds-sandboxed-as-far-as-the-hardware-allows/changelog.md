# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01 - N1 and N2: native worlds on the host

Engines per world (eng_*), nucleus/native.c system calls with strict payloads, the host process backend under seccomp (4b3ce2f); examples in C and C++ and 12 tests incl. sandbox probes (199694d). P4 flashed: JS worlds unchanged. N3-N5 wait for approval to build WAMR / elf_loader.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/host/native_proc.c — host backend: process, rlimits, seccomp filter, turns over the socket
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/native.c — kernel side: events, system calls, payload validation

## 2026-11-01

N3: WebAssembly worlds on the host. WAMR 2.4.5 vendored (fast interpreter, instruction metering; patch 0001 writes the instruction count back) (4dd164e); nucleus/native_wasm.c with imports nw.call/nw.error and WASI stubs only, memory capped at mem_kb, budget in instructions; sdk/nw_wasm.c; 25 native tests incl. sandbox probes (899358a).

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/native_wasm.c — the WebAssembly backend (WAMR): imports, limits, events
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/sdk/nw_wasm.c — module runtime for WebAssembly: imports and exports
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/third_party/wamr/patches/0001-instruction-count.patch — instruction count written back for budgets

## 2026-11-01

N4: WebAssembly apps from storage through the Loader (sys.spawn with a read handle; the engine from the content, never machine code) and a bench module (9d66b95); WAMR on the ESP32-P4 with patches 0002 (linear memory in PSRAM) and 0003 (os_self_thread), console put + tools/p4put.py; device: probes trap, overrun, refused imports; 69 ns per wasm instruction (7ba759e).

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/kernel.c — kernel_spawn_loaded: engine from content, storage spawn
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/third_party/wamr/patches/0003-esp-idf-self-thread-in-any-task.patch — fix for the pthread_self assert reboot loop
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/tools/p4put.py — copy files onto the P4's FAT partition

## 2026-11-01

N5: machine-code native worlds on the P4 through elf_loader 2.0.0, opt-in (PICOCALC_NATIVE_ELF), firmware manifest only (bb55c32). Curated resolver, charged allocator, post-hoc budget. Device: all system calls incl. an I2C read through the claim; 26x WAMR on the bench loop; overrun restarts; missing symbol refused; a store to 0 panics and reboots. A 16 KB internal .bss change flipped the JS calibration loop 113 <-> 1604 ms (diary step 7).

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/main/CMakeLists.txt — builds and bundles the ELF modules
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c — the ELF backend: resolver, allocator, events, trust boundary
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/sdk/nw_elf.c — module runtime for ELF modules
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/sdk/nw_elf.h — ABI between kernel and ELF module

## 2026-11-01

Ticket closed

---
Title: 'Scopes B and C: the module cache and the CJI tool option'
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://firmware/port/esp32p4/CMakeLists.txt
      Note: PICOCALC_DEVICE_COMPILER option for C1
    - Path: repo://firmware/port/esp32p4/compiler/install.c
      Note: CJI installer whose record and write order B1 follows
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: Compile step that B2 moves into the nucleus and puts behind the cache
ExternalSources: []
Summary: 'Tasks B1, B2 and C1: a content-keyed cache for compiled typed modules with module-before-record writes and hash verification, compile-or-load at boot on device and simulator, and the CJI tool out of the default profile.'
LastUpdated: 2026-11-19T15:05:40.153853894-05:00
WhatFor: Implementation guide for the module cache and the firmware profile.
WhenToUse: When working on boot-time compilation or firmware build options.
---

# Scopes B and C: the module cache and the CJI tool option

This document describes three tasks. B1 and B2 stop the typed compiler from running at every boot by keeping its output under a key computed from everything that affects that output. C1 takes the first compiler's on-device tool out of the firmware images that the project qualifies. The two scopes share one document because they have one purpose: an ordinary boot should not compile anything and should not carry a compiler it does not use.

Read Article 6, sections 6.1, 6.3 and 6.8, and Article 10, section 10.5, before this document.

## B.1 What happens at boot today

The manifest entry of a typed application names a file that does not exist, for example `"file":"editor/compiled.bin"`. When the nucleus starts the world it calls `port_read_file` for that path (`picocalc-os/nucleus/kernel.c`, line 893). On the device, `port_read_file` (`picocalc-os/port/esp32p4/main/port_p4.c`, line 108) recognizes the three paths `js/editor/compiled.bin`, `js/files/compiled.bin` and `js/agenda/compiled.bin` and, instead of reading a file, calls `p4_editor_compile`, `p4_files_compile` or `p4_agenda_take_module`. Each reads the typed source and the reactor from the firmware bundle and calls `p4_typed_compile` (`typed_p4.c`, line 67), which creates a QuickJS runtime with its own heap limit and deadline, evaluates the compiler files, calls the linker function, copies the resulting bytes out and destroys the runtime. Its last statement prints the receipt:

```
editor compile source=bundle status=ok us=3138373 peak_js_bytes=2454960 module_bytes=240452
```

The same bytes are produced at every boot. For Editor that costs 1.99 s for WebAssembly or 3.14 s for native code.

The host simulator does none of this. The replay scripts compile with Node and hand the simulator a finished `editor.wasm`. Task B2 moves the compile step into code that both the device and the simulator run, so that the cache can be tested where there is no hardware.

## B.2 What a correct cache requires

A cache maps a key to stored bytes. It is correct if it returns stored bytes only when a fresh compile would produce the same bytes. The compiler's output is a function of five inputs, and the key covers all five.

| Input | Where it comes from on the device | Why it affects the output |
| --- | --- | --- |
| Application source | bundle (`editor/editor.typed`) or, for Agenda's editable source, the file `notes/agenda.typed` | it is what is compiled |
| Compiler | bundle: `typed/wasm.js`, `typed/rv32.js` (native engine only), and the linker file (`typed/world.js`, `files/compile.js` or `agenda/compile.js`) | a changed compiler emits different code |
| Reactor | bundle: `editor/reactor.bin` and its counterparts | the code is copied into it and calls into it |
| Engine | `ENG_WASM` or `ENG_NATIVE` | the two outputs differ |
| Reactor function table | the ordered list of reactor functions with their types | calls are bound by position |

The fifth input is contained in the second and third today: the table is text inside the linker file, and its counterpart is the trampoline list inside the reactor. It is still a separate part of the key, for two reasons. The dependency is then visible in the record and in the log line, and after task D1 the table comes from a generated file that can be hashed by itself.

Two further properties come from the CJI installer, which already implements this design for the first compiler (`picocalc-os/port/esp32p4/compiler/install.c`: the record type at line 22, the two storage areas at lines 152 and 153, the digest at line 160).

- **Module before record.** The new module is written to the storage area that the record does not name. The record is changed last. A power loss before that leaves the old record and the old module, both intact.
- **Verification on read.** The record holds the hash of the module. The stored module is hashed again when it is read, and a mismatch is treated as a miss.

The literature's name for this record is a constructive trace [Mokhov, Mitchell and Peyton Jones 2018]: the hashes of the inputs, the hash of the output, and the output itself.

---

## Task B1: the cache library

**Goal.** Write a portable C module that, given the five inputs and a compile callback, returns the module from storage when the key matches and the stored bytes verify, and otherwise compiles, stores module then record, and returns the fresh module.

**Where to look.**
- `picocalc-os/port/esp32p4/compiler/install.c`: `install_record_t` (line 22), `artifact_path` and `source_path` (lines 152, 153), `digest` and `matches` (lines 160 to 175), and `compiler_tick` (line 373) for the order of the final writes.
- `picocalc-os/nucleus/nucleus.h`, lines 514 and 515: `port_store_get` and `port_store_set`, the persistent key-value store. `picocalc-os/host/port_host.c`, lines 28 to 80: its host implementation, which with the runner's `-s DIR` keeps each record as the file `DIR/<ns>/<key>`; a namespace is at most 3 characters and a key at most 15, and the host creates only the directories `w` and `k`.
- `nucleus.h`, line 161: `port_fs_root()`, the root of the POSIX file system that `fs_execute` uses on host and device.
- Article 6, section 6.3. Literature: Mokhov, Mitchell and Peyton Jones 2018, "Build systems à la carte" (verifying and constructive traces).

**Files to change.** New: `picocalc-os/nucleus/typed_cache.c`, `picocalc-os/nucleus/sha256.c`, declarations in `picocalc-os/nucleus/nucleus.h`. New test files in `$NEXT/scripts/`: `05-typed-cache-driver.c`, `05-check-typed-cache.sh`. `picocalc-os/Makefile`: add the two C files to `OS_SRC`.

**Core algorithm.**

```
record (64 + 8 bytes, stored with port_store_set("k", "tc.<app>.<w|n>")):
    magic "TC1", area (0 or 1), module_length (u32), key[32], module_sha[32]

key = SHA256( "TC1" || engine byte
              || SHA256(source) || SHA256(compiler files, each preceded by its name and length)
              || SHA256(reactor) || SHA256(function table) )

module path of area a:  <port_fs_root()>/.typedcache/<app>-<w|n>-<a|b>.bin

typed_cache_get(app, engine, inputs, compile, &length):
    key = the hash above
    rec = port_store_get(...)
    if rec is well formed and rec.key == key:
        bytes = read module file of rec.area
        if bytes, length == rec.module_length and SHA256(bytes) == rec.module_sha:
            log "<app> cache status=hit key=<first 8 hex digits> us=<elapsed> module_bytes=<n>"
            return bytes
        status = "corrupt"
    else status = "miss"
    bytes = compile()                                  # the existing compile; prints its own receipt
    if bytes == NULL: return NULL                      # nothing is stored for a failed compile
    other = rec is well formed ? 1 - rec.area : 0
    write bytes to the module file of `other`: write to <name>.tmp, fflush, fsync, rename
    if the write succeeded:
        port_store_set(record {area: other, module_length, key, SHA256(bytes)})      # last
    log "<app> cache status=<miss|corrupt> key=... us=... module_bytes=..."
    return bytes                                        # the fresh module is used even if storing failed
```

**Steps.**
1. Add `sha256.c` (one function, `sha256(const void *, size_t, uint8_t out[32])`, no dependencies) and check it against the standard test vectors.
2. Write `typed_cache.c` as above. It takes the inputs as five (pointer, length) pairs and the compile step as a function pointer with a context argument, so that it contains no QuickJS code.
3. Write the driver. It links `typed_cache.c`, `sha256.c` and a small implementation of `port_store_get`, `port_store_set` and `port_fs_root` over a temporary directory, with a switch that makes the *n*-th write or store call fail and exit, to stand for a power loss. Its compile callback returns bytes derived from the inputs and counts its calls.
4. Write the scenarios below into the driver.

**Worked example.** The driver's scenario table, with the number of compile calls each step must cause:

| Step | Action | Compile calls | State afterwards |
| ---: | --- | ---: | --- |
| 1 | first request, empty storage | 1 | area a holds M1; record names a |
| 2 | same inputs | 0 | unchanged; log line `status=hit` |
| 3 | source changed by one byte | 1 | area b holds M2; record names b; area a still holds M1 |
| 4 | compiler changed | 1 | area a holds M3; record names a |
| 5 | reactor changed | 1 | area b |
| 6 | engine changed from wasm to native | 1 | a separate record `tc.<app>.n`; the wasm record is untouched |
| 7 | function table changed | 1 | |
| 8 | inputs changed; process killed after the module write, before the record write | 1 | record still names the old area and old key; the old module's bytes are unchanged |
| 9 | restart with the inputs of step 8 | 1 | record now names the new area |
| 10 | one byte of the active module flipped on disk | 1 | log line `status=corrupt`; module rewritten |
| 11 | same inputs | 0 | hit |
| 12 | active module file truncated to half | 1 | `status=corrupt` |
| 13 | record replaced by 10 bytes of garbage | 1 | `status=miss` |
| 14 | compile callback returns NULL | 1 | nothing written; record unchanged |
| 15 | the last byte of the source moved to the front of the compiler text, all else equal | 1 | `status=miss`: the key separates its inputs |

**Acceptance on the host.**
- `sh $NEXT/scripts/05-check-typed-cache.sh` builds the driver with the host C compiler and with `-fsanitize=address,undefined`, runs the 15 steps, and prints `typed cache: 15 steps passed, 13 compiles`. The sum of the compile column is 13.
- The SHA-256 of the three bytes `abc` is `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- `make -C picocalc-os` builds; all replays pass (the library is linked and not yet called).

**What a wrong implementation looks like.**
- *Record before module.* Step 8 kills the process between the two writes. With the wrong order the record already names the new area, which holds a partial file or the module of two generations ago. Step 9 then verifies and recompiles, so nothing wrong is loaded, but the old module that step 8 was supposed to preserve is gone; the driver's check "the old module's bytes are unchanged and the record is unchanged" fails.
- *Key without the engine.* Step 6 returns the WebAssembly module for the native engine. The loader would reject it on the device; the driver catches it as 0 compile calls where 1 is required.
- *Verification skipped.* Step 10 returns the damaged bytes with 0 compile calls.
- *Concatenation without lengths.* Hashing `source || compiler` lets a byte move from the end of one input to the start of the next without changing the key. The key above hashes each input separately, and step 15 does exactly this move and requires a miss.

**Dependencies.** None. **Size.** M. **Risks.** The storage location `.typedcache` under the user-visible file system follows the CJI installer's `/files/cjidev`; confirm with the project owner that a hidden directory there is acceptable, and that the namespace `k` of `port_store` may hold these records. `fsync` on the device's file system must be checked to reach the flash; `install.c`'s `write_file` (line 154) shows what the CJI installer relies on.

---

## Task B2: compile-or-load at boot, on the device and in the simulator

**Goal.** Route the three typed applications through the cache library on the device and give the host simulator the same compile-or-load path, so that a warm boot loads a verified module without compiling.

**Where to look.**
- `picocalc-os/port/esp32p4/main/typed_p4.c`, `p4_typed_compile` (lines 67 to 137); `editor_p4.c` (the whole file, 29 lines); `files_p4.c`; `agenda_p4.c`, lines 49 to 110, where Agenda chooses between the bundled source and `notes/agenda.typed`.
- `port_p4.c`, `port_read_file` (line 108) and `p4_bundle_read` (line 75).
- `picocalc-os/host/port_host.c`, line 26: the host's `port_read_file` is a plain file read.
- `$ISSUE/scripts/04-compile-phase-timing.c` and `.sh`: a host C program that runs the typed compiler inside QuickJS, built against `picocalc-os/build/qjs/*.o`. It shows that the compile step runs on the workstation unchanged.
- The device receipts in `ttmp/2026/11/19/PICOCALC-EDITOR-INLINE*/various/p4-inline-builds.json`.
- Article 6, sections 6.3, 6.5 and 6.8.

**Files and functions to change.**
- New `picocalc-os/nucleus/typed_build.c`: the body of `p4_typed_compile` moved here as `typed_compile(...)`, with the bundle reader passed in as a function pointer, and `typed_module(app, engine, reader, ...)`, which gathers the five inputs and calls `typed_cache_get` with `typed_compile` as the callback.
- `typed_p4.c`: reduced to a call of `typed_compile` with `p4_bundle_read`. `editor_p4.c`, `files_p4.c`, `agenda_p4.c`: call `typed_module`.
- `picocalc-os/host/port_host.c`: `port_read_file` recognizes a path ending in `/compiled.bin` when the files `<dir>/source.typed`-equivalents are present (see step 3) and calls `typed_module` with a reader over the `-j` directory.
- `picocalc-os/Makefile`: add `nucleus/typed_build.c`.
- New `$NEXT/scripts/06-check-cache-in-simulator.mjs`.

**Core algorithm.**

```
typed_module(app, engine, reader):
    source   = reader("<app>/<app>.typed")            # Agenda: the edited file if present
    reactor  = reader("<app>/reactor.bin")
    compiler = reader("typed/wasm.js") [+ reader("typed/rv32.js") if native] + reader(linker)
    table    = reader("typed/interface.json") if it exists (after D1), else reader(linker)
    return typed_cache_get(app, engine, {source, compiler, reactor, engine, table},
                           compile = typed_compile(app, source, linker, entry, engine, reactor))
```

**Steps.**
1. Move the compile function. Check on the host that `$ISSUE/scripts/04-compile-phase-timing.sh` still produces a module of 88,255 bytes for Editor.
2. Add `typed_module` and call it from the three device files. The compile receipt line is unchanged; the cache line is new.
3. In the host port, lay the inputs out in the `-j` directory under the bundle's names (`editor/editor.typed`, `editor/reactor.bin`, `typed/wasm.js`, `typed/world.js`), and make `port_read_file("js/editor/compiled.bin")` call `typed_module`. The simulator has no native engine, so it exercises the WebAssembly engine; the native key path is covered by B1's step 6.
4. Write `06-check-cache-in-simulator.mjs`: prepare the directories as `02-check-editor-world.mjs` does, with the manifest entry `{"file":"editor/compiled.bin","engine":"wasm"}`; run `picocalc-host` four times against the same `-f` and `-s` directories; read `uart.log` each time.
5. Device qualification.

**Worked example.** Expected lines in `uart.log` across four runs of the simulator with unchanged directories, then one changed source byte, then one flipped module byte:

```
run 1:  editor compile source=bundle status=ok us=... peak_js_bytes=... module_bytes=88255
        editor cache status=miss key=3f9a12c4 us=... module_bytes=88255
run 2:  editor cache status=hit key=3f9a12c4 us=... module_bytes=88255
run 3 (one comment character added to editor.typed):
        editor compile source=bundle status=ok ...
        editor cache status=miss key=<a different key> ...
run 4 (byte 1000 of the active module file inverted):
        editor compile source=bundle status=ok ...
        editor cache status=corrupt key=<the key of run 3> ...
```

The key digits are illustrative; the test compares keys between runs and does not fix their value.

**Acceptance on the host.**
- `node $NEXT/scripts/06-check-cache-in-simulator.mjs` asserts: run 1 has one compile line and `status=miss`; run 2 has no compile line and `status=hit` with the key of run 1; run 3 has a compile line and a different key; run 4 has `status=corrupt` and a compile line; a fifth run is a hit. In every run the frames published by Editor equal the frames of the JavaScript original, as in the existing Editor replay.
- `05-check-typed-cache.sh` still passes.
- All replays pass.

**Device qualification.** Paired Editor images. For each engine: flash; boot once (cold); reboot three times (warm); run the Editor workflow; then corrupt the stored module with the console (`put` a file of the same length over the active module file under `.typedcache`), reboot twice.

| Receipt | Prediction | Fails if |
| --- | --- | --- |
| Cold boot | one `editor compile` line and `editor cache status=miss` | no miss line |
| Warm boots | no `editor compile` line; `editor cache status=hit us=N` with N under 100,000, on all three boots, both engines | a compile line appears, or N is 100,000 or more |
| Warm native boot | the time from reset to `boot-world name=editor` is at least 2.9 s shorter than cold | less than 2.9 s gained |
| Warm WebAssembly boot | at least 1.8 s shorter than cold | less than 1.8 s gained |
| After corruption | first boot: `status=corrupt` and one compile line; second boot: `status=hit` | the damaged module is loaded, or the second boot compiles |
| Workflow after a warm boot | pass, with the same capture hashes as after a cold boot | any difference |
| `module_bytes` | identical in the miss line and the hit line | they differ |

If the warm hit takes 100 ms or more, the hashing is the suspect: the key hashes the source (71 kB), the compiler (43 kB) and the reactor, and the verification hashes the module. Record the four hash times separately before changing anything. The remedy that keeps the key intact is to compute the hashes of the bundled inputs when the firmware is built and store them in the bundle.

**What a wrong implementation looks like.**
- *The key is computed from file names or sizes.* Run 3 changes one character of a comment and keeps the length when the test replaces a character instead of adding one; a size-based key hits and the old module is used. The test has both variants.
- *Agenda's edited source bypasses the cache or shares the bundled source's record.* After `agenda build`, a reboot would load the module of the bundled source. The device step for Agenda: `agenda build` with an edited `notes/agenda.typed`, reboot, and check that the cache line shows a hit under a key different from the bundled one and that the edited behaviour is present.
- *The cache hides a compiler failure.* A failed compile must store nothing. B1's step 14 covers the library; on the device, a source with a syntax error must print `status=failed` in the compile line on every boot and never a hit.

**Dependencies.** B1. **Size.** M. **Risks.** `typed_p4.c` is device glue with no host build today; moving its body into the nucleus makes it part of the simulator, which must keep building with `M32=1` (no WebAssembly) and for the PaperS3 board (MicroQuickJS, where the typed compiler cannot run). Guard `typed_build.c` so that those builds contain a stub.

---

## Task C1: the CJI compiler tool out of the default qualification profile

**Goal.** Build and qualify firmware without the CJI on-device compiler tool, keeping it available as an explicit option, and check on the host that the default image does not contain it.

**Where to look.**
- `picocalc-os/port/esp32p4/CMakeLists.txt`, line 35: `option(PICOCALC_DEVICE_COMPILER ... OFF)`. The option exists and its default is already off.
- `picocalc-os/port/esp32p4/main/CMakeLists.txt`, lines 129 to 157: with the option on, `compiler/build-tool.sh` builds the tool, and the bundle gains `natives/compiler.elf` and `compiler/unit.list`.
- `picocalc-os/port/esp32p4/main/main_p4.c`, lines 29, 160, 222 and 242: the four places guarded by `#if PICOCALC_DEVICE_COMPILER` (the include, the `cji` console command, `compiler_restore()` at boot, and `compiler_tick()` in the main loop).
- The build scripts that the typed tickets used for every qualified image pass `-D PICOCALC_DEVICE_COMPILER=ON`: `ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts/03-build-editor-firmware.sh` and `ttmp/2026/11/18/PICOCALC-TYPED-APPS*/scripts/03-build-files-firmware.sh`. That is why the measured images carry the tool.
- Article 10, section 10.5, fourth row of the table: about 660 kB in the image and a relocation at boot.

**Files to change.** New `$NEXT/scripts/07-build-firmware.sh`, a copy of `03-build-editor-firmware.sh` with a sixth argument `DEVICE_COMPILER` that defaults to `OFF`, and with the bundle assertion extended. New `$NEXT/scripts/07-check-default-profile.sh`. `picocalc-os/port/esp32p4/README.md`: one paragraph stating that the tool is optional and how to enable it. No change to the CMake files is needed unless the check below finds one.

**Core algorithm.** There is none; the task is a configuration change with a check.

```
07-check-default-profile.sh BUILD_DIR_OFF [BUILD_DIR_ON]:
    bundle = BUILD_DIR_OFF/esp-idf/main/js_bundle.c
    fail if bundle contains "natives/compiler.elf" or "compiler/unit.list"
    fail if `nm` of the firmware ELF lists compiler_console, compiler_restore or compiler_tick
    if BUILD_DIR_ON is given:
        fail unless size(ON image) - size(OFF image) >= 600000
    print both image sizes and the difference
```

**Steps.**
1. Write the build script with the option off by default. Build the paired Editor images with it (`idf.py` is available on the workstation; the build directories `picocalc-os/port/esp32p4/build-elf` and `build-agent` show earlier builds).
2. Build one image with the option on, into a third build directory, for the size comparison and to confirm that the option still works.
3. Run the check script.
4. Use `07-build-firmware.sh` for every device qualification in this plan from here on.

**Worked example.** The assertion block of the existing build script already has the line `assert '"natives/editor.elf"' not in bundle`. The new script adds `assert '"natives/compiler.elf"' not in bundle` when `DEVICE_COMPILER` is `OFF` and the opposite assertion when it is `ON`.

**Acceptance on the host.**
- `sh $NEXT/scripts/07-check-default-profile.sh <off build> <on build>` exits 0 and prints a size difference of at least 600,000 bytes.
- Both configurations compile `main_p4.c` without warnings about unused functions.
- All replays pass (this task changes no host code).

**Device qualification.** Flash the default-profile pair and run the Editor qualification. Predictions: the workflow passes on both engines; the console command `cji` answers as an unknown command; the boot log contains no line beginning `cji:`; the boot is not slower than the same build with the tool. Record the time from reset to the first `boot-world` line for both builds, three boots each in alternating order; the default profile should be faster by the time of the boot-time relocation, which the earlier tickets scheduled around and did not report as one number.

**What a wrong implementation looks like.** Turning the option off in one script while another path still enables it, for example through a cached `CMakeCache.txt` in a reused build directory. The image then still contains the tool although the command line says otherwise. The check reads the generated bundle and the linked symbols, which reflect what was built, and fails.

**Dependencies.** None. **Size.** S. **Risks.** Worlds that are compiled by CJI on the workstation (the compositor, the drivers, Snake) do not depend on the device tool and stay in the image; the check must not confuse `natives/compositor.elf` with the tool. The 660 kB figure is from Article 10 and has not been re-measured for the current tree; the threshold of 600,000 bytes allows for drift, and a smaller difference is a finding to report.

## Key points of Scopes B and C

- The cache key is a hash over five separately hashed inputs: source, compiler, reactor, engine and reactor function table.
- The module is written before the record, to the area the record does not name, and is hashed again on every load.
- The compile step moves from device glue into the nucleus, so that the host simulator runs the same compile-or-load path and the cache is tested without hardware. The device step confirms the warm-boot time: under 100 ms where there were 2 to 3 seconds.
- The CJI tool is already an option that defaults to off. The typed tickets' build scripts turned it on. C1 changes the scripts and adds a check on the built image.

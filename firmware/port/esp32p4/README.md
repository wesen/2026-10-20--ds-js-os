# ESP32-P4 PicoCalc port

This port targets the PicoCalc adapter with a **Waveshare ESP32-P4-WIFI6 base board**.
The detailed agent architecture, setup, operating instructions, and verification report are in
[the PicoCalc agent implementation guide](../../../docs/agent/picocalc-agent-implementation.md).

## Build

Use the repository's ESP-IDF **v5.4.2** toolchain environment. A normal `idf.py build` remains an
offline build. The direct HTTPS transport is optional and uses the board's onboard ESP32-C6 over SDIO.

From this directory, after sourcing the ESP-IDF environment:

```sh
idf.py -B build-agent \
  -D PICOCALC_AGENT_WIFI=ON \
  -D SDKCONFIG=sdkconfig.agent \
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
```

Use the same flags when running `flash` or `monitor`, and supply the actual P4 port with `-p PORT`.
Keep the offline and network build/config directories separate. `dependencies.agent.lock` pins
the resolved network components; they are downloaded only for the optional network build.
Check the chip revision before flashing; never override a revision mismatch with `--force`.

### Machine-code native worlds (optional)

`-D PICOCALC_NATIVE_ELF=ON` adds Espressif's `elf_loader` (2.0.0, downloaded, pinned) and runs the worlds of
`optional/native_elf/system.elf.json` as ELF modules: C built with `sdk/nw_elf.c` as position-independent
shared objects, compiled and bundled by `main/CMakeLists.txt`. They are trusted drivers and are not isolated
(they run in machine mode with the firmware; a bad store panics the board, a loop that never returns stalls the
kernel), so they come only from the firmware, never from storage. Use its own build and config directories:

```sh
idf.py -B build-elf -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_NATIVE_ELF=ON \
  -D SDKCONFIG=sdkconfig.agent-elf \
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
```

Each combination keeps its own lock (`dependencies.agent.lock`, `dependencies.agent-elf.lock`,
`dependencies.elf.lock`), so building one does not rewrite another. WebAssembly worlds need no option: WAMR is
vendored (`third_party/wamr`) and always built in.

The network build has been cross-compiled with ESP-IDF v5.4.2, ESP-Hosted 1.4.2, and Wi-Fi Remote
0.14.0. Physical Wi-Fi, TLS, display responsiveness, storage recovery, and battery behavior still
need the hardware checks in the guide.

### Typed apps

A profile lists its Typed apps (`APPS=(chess agenda editor files candela raytrace candela-gallery)` in `profiles/playable.env`;
CMake's `PICOCALC_APPS`). Each is described by `apps/typed/NAME/app.json`, and the port compiles every one of them to
RV32 on the handheld through one path, `p4_typed_app_compile` in `main/typed_p4.c`. A profile with apps runs them as
ELF modules, so it also turns on `PICOCALC_NATIVE_ELF`; a Typed app replaces the CJI-compiled world of the same name.

At configure time `typed_apps.py` reads the listed manifests and writes, into the build directory: the assembled
sources, `typed_apps.c` (the table `typed_p4.c` compiles from, declared in `main/typed_apps.h`), the boot manifest
`system.typed.json`, and `typed-apps.cmake` (bundle entries, reactor ELFs, the apps' C hosts and defines).

| Field | Meaning |
|---|---|
| `name`, `kind` | `world`: a boot world the kernel reads as `NAME/compiled.bin`, compiled while it boots; `module`: compiled on demand by a C host |
| `sources` | the app's sources in order, each followed by a newline (or `variants`: named commands that generate one source each, Candela's stages) |
| `link`, `entry` | the linker's repository path and its global function, `entry(source, reactor, options)` |
| `compiler` | compiler modules besides `typed/wasm.js` and `typed/rv32.js` (`typed/async.js` for `async` worlds) |
| `reactor` | the reactor or slot ELF: repository `sources` and `defines`, built with the native-world flags |
| `policy`, `heapBytes`, `deadlineMs` | the RV32 policy (`typed-rv32.js` `POLICIES`) and the compile's limits |
| `world` | `replaces` an entry of `apps/js/picocalc/system.json` (with field overrides) or `append`s a new one |
| `fallback` | `true`: the replaced entry's JavaScript file runs when the compile fails or misses its deadline |
| `editable` | a file under the store that replaces the first source (`typed agenda build`) |
| `painter` | Chess: the delivered painter, its limits and slot, and how it is embedded into Chess's source |
| `host` | the C the app still needs in the firmware: sources, includes, defines |

The console's `typed` lists the apps and their limits; `typed WORLD baseline` compiles a running world again from the
bundle and restarts it, `typed WORLD build` from its editable file (`notes/agenda.typed` for Agenda).

#### The compiled-module cache

Every compile first asks a cache of compiled modules in `/files/.cache/typed` (PICOCALC-COMPILE-CACHE;
`main/typed_cache.{h,c}` is the format, `main/typed_cache_p4.c` the device side). Its key is a SHA-256 over every input
of the compile: the source, the reactor, every bundle under `typed/` (so any pass group a policy may load), the
linker, the entry, the policy, and a digest of the compiler's C side (`typed_lex_index`, `typed_p4.c`, QuickJS) that
CMake takes at configure time. A new firmware therefore misses only where the compiler or the app changed. A hit
prints `NAME cache hit us=... read_us=... sha=...`; a miss compiles as before, under the deadline and heap limits, and
a writer task stores the module after the boot. A flash erase stops both cores' caches, so the writer (priority 3 on
core 1, below the kernel) writes 4 KB pieces, each only while the kernel waits in a gap of 10 ms or more between
turns and no compile has run on core 1 for 2 s, and rests as long as each piece took: about 6 s for a 244 KB module,
18.6 s for the gallery's 788 KB Typed program. A warm boot reads an entry in 19–62 ms (keys 9–40 ms) instead of
compiling it in 1.5–5.3 s. An entry is written as `.tmp` and renamed; a read checks its header, key and SHA-256, and
deletes a corrupt one.
At most two entries per app and source stay, in at most 4 MB, leaving 1 MB of the partition free. `hold` stops the
writer between entries. Console: `typed cache` lists entries, `typed cache clear` deletes them, `typed cache verify
[APP]` compiles every cached source again and compares the modules byte for byte, `typed cache corrupt APP
[flip|cut]` damages an app's entries (the corrupt-entry test). `/files/.cache` is invisible to worlds: their paths
cannot name a hidden directory.

In Chess, press **H** from the launcher to play White. Use the arrows and **Enter** to select and move, **Q/R/B/N** to
choose a promotion, **F2** to restart, **F3/F4** to turn the camera, and **Esc** to cancel or leave.
[Chess design, qualification, and reproduction commands](../../../ttmp/2026/11/20/PICOCALC-TYPED-CHESS--a-playable-typed-chess-engine-and-a-repeatable-picocalc-compiler-workload/index.md)

### Benchmarks

`profiles/bench.env` is the playable profile plus `PICOCALC_BENCH`: the console benchmarks of `bench/board/firmware`
(`raybench`, `cachestat`, `typedray`, `typedmat`, `candela bench`; `cmake/bench.cmake`). The playable image carries
none of them.

### CMake

`main/CMakeLists.txt` is the component: the nucleus, QuickJS, WAMR and the bundle (`js_bundle.c`). The concerns have
their own files in `cmake/`: `native-elf.cmake` (CJI worlds, C natives, the device compiler, CJI test fixtures),
`typed-apps.cmake` (the compiler bundle and the apps), `candela.cmake` (the Candela world and gallery),
`bench.cmake`.

### The playable release

From a clean checkout, source the ESP-IDF **v5.4.2** environment and make Node.js 24 available. The release build
uses the tracked `dependencies.elf.lock` to resolve the native ELF loader. The first build can download those
components. From the repository root, choose an empty build directory.
Use separate checkouts for concurrent builds. The CJI bootstrap writes intermediates into its source tree.

```sh
make playable                       # from the repository root: build the playable profile and store its image
make install-playable               # flash it, settle, health-check, and record it in firmware/PLAYABLE.json
```

or by hand, with the ESP-IDF v5.4.2 environment sourced:

```sh
firmware/port/esp32p4/build.sh playable /tmp/picocalc-playable    # any profile in profiles/*.env
```

`build.sh` prints the app digest and writes `picocalc-build.json` (profile, commit, apps, options, digests) into the build
directory. Every profile builds reproducibly (`sdkconfig.reproducible`): one commit gives one app digest wherever it
is checked out and built.
The playable profile uses the real keyboard controller and display, compiles Files, Agenda, Editor and Chess (with
the app-delivered smooth 3D painter) at boot, and the Candela scene and the Typed ray tracer on first display.

On an existing installation, verify the published partition-table digest against the device before updating
only the factory app at offset `0x10000`. This preserves the bootloader, settings, and files. The app binary
targets ESP32-P4 and the documented 32 MB layout. Follow the release notes for the qualified hardware revision
and keypad status.

## Provisioning and companion firmware

Credentials are entered locally through the native `net` UART commands or the provisioning helper
described in the guide. `net status` reports configuration, Wi-Fi, and native clock readiness without
printing credential values. The default endpoint is `https://api.openai.com/v1/responses`; it can be
changed only through native configuration. Credentials are not part of the JavaScript bundle.

The P4 SDIO configuration is in `sdkconfig.agent-wifi`. If the C6 firmware needs updating, use a copy
of the **pinned** `managed_components/espressif__esp_hosted/slave` source, with `sdkconfig.c6-agent`
applied after that source's defaults. This overlay is exclusively for the C6, not for the P4.
It selects matching packet-mode SDIO, 20 MHz, and disables unused Bluetooth. The guide gives the
separate C6 build and manufacturer-specific programming-pad procedure; flashing the P4 does not
update its C6 companion.

The added `agentstore` partition holds bounded world records separately from the native credential
namespace. Existing NVS and factory application offsets are preserved. NVS initialization never
automatically erases a failed partition. Default NVS storage is not encrypted at rest.

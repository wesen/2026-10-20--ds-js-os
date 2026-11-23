---
Title: App manifests and one Typed-world path in the port
Ticket: PICOCALC-TYPED-APP-MANIFEST
Status: active
Topics:
    - os
    - esp32-p4
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Describe each Typed app in apps/typed/<app>/app.json and compile all of them through one generic path in the P4 port; remove per-app C glue and most PICOCALC_ flags; move benchmarks out of the shipping firmware."
LastUpdated: 2026-11-22T19:30:08.669088573-05:00
WhatFor: ""
WhenToUse: ""
---

# App manifests and one Typed-world path in the port

## Problem

The P4 port knows about individual apps. `firmware/port/esp32p4/main/` has per-app files that set compile limits and policy and wire the result into the system: `agenda_p4.c` (258), `editor_p4.c` (31), `chess_p4.c` (32), `files_p4.c` (28), `candela_p4.c` (174), `mobile_painter_p4.c` (108), `typed_ray_p4.c` (228), plus benchmarks compiled into the shipping firmware (`raybench_p4.c` 110, `typed_ray_material_bench.c` 174, `perf_p4.c` 163). `main/CMakeLists.txt` is 611 lines with 74 `PICOCALC_` uses; profiles (`firmware/port/esp32p4/profiles/*.env`) are lists of those flags. Example of the duplication:

```c
// chess_p4.c
static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000, .policy = "balanced"};
// editor_p4.c
static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000, .policy = "interactive"};
```

## Design

- **`apps/typed/<app>/app.json`:** name, sources (in order), link adapter, reactor (generic world, painter, slot), entry points, policy, heap cap, deadline, slot size, the JavaScript fallback's path, the manifest entry it serves (`editor/compiled.bin`). The firmware build bundles the manifests; `typed_p4.c` reads them.
- **One generic path:** the port intercepts `<app>/compiled.bin` for any app with a manifest, compiles with the manifest's limits and policy, and falls back to the JavaScript app as today. Special cases that remain (Chess's painter delivery, the ray tracer and Candela entry points in the compositor) become manifest kinds, not per-app C, where possible; whatever must stay C is listed with the reason.
- **Profiles choose apps:** `profiles/*.env` list apps and a few platform options, not dozens of flags. Split `main/CMakeLists.txt` into files per concern (core, compiler bundle, reactors, Candela, painter).
- **Benchmarks out of the firmware:** `raybench_p4.c`, `typed_ray_material_bench.c` and the parts of `perf_p4.c` that only studies use move to `bench/board/app` (or a profile that only studies build).

## Gates

- The playable profile builds; on the board (experiment image, then `make restore-playable`): every native world healthy, every boot app within 75 % of its deadline, the same features as the current playable firmware (the COMPILE-BUDGET feature comparison), the gallery's 18 digests unchanged (`bench/board/gallery.py`).
- `make test`, host gates, host screenshots unchanged except where intended.
- The coordinator installs the resulting playable firmware after merging.

## Rules every ticket follows

- **The goal (AGENTS.md).** Typed first, QuickJS only as a fallback, C only when unavoidable or as a benchmark. A missing Typed feature is compiler work.
- **No backwards compatibility.** Change any interface; tests and pins are tools, not promises.
- **Gates.** A change states its gate before it is made and records the result in the diary:
  - `make test` (Node, generated files, Go, the host binary's Python tests, cji);
  - `make test-host` and `make test-host OPTIONS='{"policy":"kernel"}'` (ray digest `430f0d50…`, Chess oracle 6,981 words, 24/24 replays);
  - *byte identity*: `tests/compiler` pins the image digest of each policy; a refactor that claims "no output change" must leave every pinned digest and every replay image unchanged;
  - *board*: a timing claim needs a paired study (`make bench-board STUDY=…`, `docs/measuring.md`).
- **The handheld.** One board, one serial lock (`bench/board/device.py`). A ticket may flash experiment images only through `bench/board` tools and must leave the playable image installed (`make restore-playable`). Only the program's coordinator installs a new playable firmware and rewrites `firmware/PLAYABLE.json`. The keyboard and display may be switched off by the user (`PERIPHERALS=off-by-user`); never debug them.
- **Generated files.** Edit `compiler/typed/rv32/*.js`, never `typed-rv32.js`; run `node compiler/typed/rv32/build.mjs`.
- **Moves and deletes** go through checked Python scripts in the ticket's `scripts/` (dry run, asserted counts), never shell one-liners.
- **Diary.** Each ticket keeps `reference/01-diary.md` in the investigation format (Prompt Context, What I did, Why, What worked, What didn't work with exact errors, What I learned, What was tricky, What warrants a second pair of eyes, Future work, Code review instructions, Technical details), one step per milestone, with commit hashes.
- **Commits** are focused, at validated boundaries, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Refinements (2026-11-22)

Checked against the port at `4b9a80b` before implementing.

**What the per-app files really do.**

| File | Does | After this ticket |
|---|---|---|
| `chess_p4.c`, `editor_p4.c`, `files_p4.c` | read `X/X.typed` and `X/reactor.bin`, call `p4_typed_compile` with fixed limits, policy, linker and entry | deleted: one table row each, generated from `app.json` |
| `agenda_p4.c` | the same compile, plus: compile *before* `kernel_boot` so a failed compile picks the JavaScript manifest; `agenda build` from `notes/agenda.typed`; an early-boot dispatch priority; stage timers and a boot report hooked into `kernel.c`, `vm.c`, `fs_p4.c`, `install.c`, `main_p4.c` | deleted. The fallback becomes a manifest field every boot world has; the edit source becomes a manifest field and a generic `typed APP build` command. The early-boot priority is dead code in the playable image: it lasts 2 s from Agenda's compile, and the Editor and Chess compiles that follow keep dispatch from starting until about 10 s (boot log of `COMPILE-BUDGET` `13-install-balanced`: `agenda response us=9169888`). The stage timers are measurement only. The prelude bytecode cache in `vm.c` sat under `PICOCALC_TYPED_AGENDA` but serves every JavaScript world; it stays, on every P4 build. |
| `mobile_painter_p4.c`, `painter_service.c` | compile the painter Chess delivers (after checking it equals the bundled copy), relocate it, run it on the painter task | stay C (the painter's loader and runner; the kernel's painter transport is nucleus C). The compile settings come from Chess's `app.json` (`painter`). |
| `candela_p4.c` | compile one of three generated scene sources, relocate, bind four entries, build and validate the scene graph, render with the C renderer (`candela_scene.c`); `candela bench` | the host stays C until CANDELA-TYPED replaces the renderer; settings and variants from `apps/typed/candela/app.json`; `candela bench` moves to the bench build. |
| `typed_ray_p4.c` | compile the ray tracer (policy `kernel`) on first display, relocate, draw it into the compositor's raytrace view; `typedray load N` with 15 study programs and alternative backends; `typedray bench` | the display host stays C (the compositor draws through `gfx.c`); settings from `apps/typed/raytrace/app.json`; the study programs, backends and bench move to the bench build. |
| `raybench_p4.c`, `typed_ray_material_bench.c`, `perf_p4.c` | console benchmarks: C ray tracer scalar against PIE, the Typed material frame, cache counters | move to `bench/board/firmware/`, built only by the `bench` profile. |

**No Wasm boot apps on the P4.** Every profile compiles Typed apps to RV32; the Wasm route (`PICOCALC_TYPED_X` without `PICOCALC_RV32_X`, with reactors prebuilt under `firmware/build/`) is built by no profile. It goes. `compileAgenda`/`compileFiles`/`compileTypedWorld` remain for the host replays.

**Manifests are read at build time.** `firmware/port/esp32p4/typed_apps.py` reads the `app.json` of every app a profile lists and writes, into the build directory: the assembled sources, a C table (`typed_apps.c`) that `typed_p4.c` uses, the boot manifest (`system.typed.json`) and a CMake fragment (bundle entries, reactor ELFs, host sources and defines). A C table instead of JSON parsed on the device: the limits are needed before the compiler's runtime exists, and the device needs no JSON reader for it.

**`app.json` fields.** `name`; `kind` (`world`: served at `NAME/compiled.bin` while the kernel boots; `module`: compiled on demand by a C host); `sources` (in the app directory, each followed by a newline); `link` and `entry` (the linker's repository path and global function); `compiler` (compiler modules beyond `typed/wasm.js` and `typed/rv32.js`, e.g. `typed/async.js`); `reactor` (`sources` and `defines` of the reactor or slot ELF, built with the native-world flags); `policy`, `heapBytes`, `deadlineMs`; `world` (`replaces` a `system.json` entry, with field overrides, or `append`s a new one); `fallback` (true: the replaced entry's JavaScript file runs when the compile fails); `editable` (Agenda: a file under the store that replaces the first source for `typed agenda build`); `variants` (Candela's three generated stages); `painter` (Chess: the delivered painter, its limits, its slot, and how it is embedded into Chess's source); `host` (the C sources and defines the app needs in the firmware: what still has to be C, stated per app).

**Fallback in the kernel.** A world entry may carry `"fallback": "apps/x.js"`. When its file cannot be read (the port's compile failed or missed its deadline), the kernel logs it and runs the JavaScript file instead. This replaces Agenda's two-manifest trick and gives Editor and Files the same protection; before, a failed Editor, Files or Chess compile made `kernel_boot` fail and nothing booted. Chess has no JavaScript version, so it has no fallback (open issue).

**Profiles.** `APPS=(chess agenda editor files candela raytrace)` plus platform options. `PICOCALC_NATIVE_ELF` follows from a non-empty app list; a Typed app replaces the CJI-compiled world of the same name. Removed options: `PICOCALC_TYPED_*`, `PICOCALC_RV32_*` (apps), `PICOCALC_MOBILE_PAINTER`, `PICOCALC_CHESS_3D` (Chess's manifest), `PICOCALC_AGENDA_EARLY_BOOT`, `PICOCALC_RV32_STREAM_FUNCTIONS`, `PICOCALC_TYPED_RAY_*` (bench build).

**CMake split.** `main/CMakeLists.txt` keeps the component, QuickJS, WAMR and the bundle; `cmake/native-elf.cmake` (CJI worlds, natives, device compiler), `cmake/typed-apps.cmake` (compiler bundle, generator, reactors, hosts), `cmake/candela.cmake` (the Candela world and gallery), `cmake/bench.cmake`.

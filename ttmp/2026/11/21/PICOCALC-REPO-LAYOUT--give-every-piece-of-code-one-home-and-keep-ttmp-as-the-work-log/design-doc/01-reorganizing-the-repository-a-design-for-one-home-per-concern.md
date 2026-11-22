---
Title: Reorganizing the repository - a design for one home per concern
Ticket: PICOCALC-REPO-LAYOUT
Status: active
Topics:
    - picocalc
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: AGENTS.md
      Note: Current entry document; a list of links into ticket documents
    - Path: picocalc-os/Makefile
      Note: Host build, shots, test-apps and CANDELA=1 targets that the move must preserve
    - Path: picocalc-os/port/esp32p4/main/CMakeLists.txt
      Note: Firmware bundle; embeds compiler/, link adapters, third_party/candela and the gallery compositor patch
    - Path: picocalc-os/port/esp32p4/build-smooth-chess.sh
      Note: The playable firmware's flags, now in the repository; becomes profiles/playable.env
    - Path: ttmp/2026/11/20/PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/scripts/device/board_common.py
      Note: Shared device infrastructure inside a ticket; seven scripts in five tickets load it
    - Path: picocalc-os/third_party/candela/VENDOR.json
      Note: Firmware sources copied out of two tickets; its note sends edits back to the tickets
    - Path: pkg/tracecompiler/compiler.go
      Note: The trace REPL loads the compiler by fixed paths at any revision; the moves must keep compiler.at working
ExternalSources: []
Summary: "Why the repository is hard to work in, and a target layout, rules and phased migration that give every reusable piece of code one home while ttmp/ stays the docmgr work log. Written 2026-11-21, revised 2026-11-22 for the Candela, RV32-split, trace-workbench and RAY-PARITY work; all five layout questions decided. Design only; nothing is moved yet."
LastUpdated: 2026-11-22T13:30:00-05:00
WhatFor: "Planning and reviewing the repository reorganization before any file moves"
WhenToUse: "Before moving directories, promoting ticket scripts, adding a new harness, or vendoring generated code into the firmware"
---

# Reorganizing the repository

This document describes how the repository is laid out, why that layout makes the compiler and firmware work slow and error-prone, and how to reorganize it. It is a design. Nothing has been moved yet.

One constraint is fixed: `ttmp/` keeps its name and role. docmgr depends on that path, and it is the log of the work: tickets, design documents, diaries, measurements and one-off scripts. The reorganization is about everything that is *not* a log entry but is being kept in one. No backwards compatibility is required. Every earlier state is in git, and every ticket diary records the commit its scripts ran against.

The first version was written on 2026-11-21 (`243cc05`). This revision, on 2026-11-22, adds what 98 later commits brought:

- the Candela path tracer on the P4, with a vendored source tree, a firmware renderer, two QuickJS worlds and generated kernel code;
- the RV32 backend split into modules with a generated bundle;
- the trace REPL's compiler workbench, with its embedded help pages;
- further RAY-PARITY board and replay scripts.

The revision also records the decisions on all five questions that were open (Section 8). Every count below was measured again on 2026-11-22.

## 1. What the repository contains today

The repository has 7,365 tracked files.

| Area | What it is | Tracked files | Change since 2026-11-21 |
|---|---|---:|---|
| `ttmp/` | docmgr tickets: 104 tickets in 11 day folders since 2026-10-31 | 6,391 (87%) | +2,227. 1,566 of them are COMPILER-ISSUE's reader sessions. 1,719 files are ticket `scripts/` (+223). |
| `picocalc-os/` | firmware, host simulator, Typed and JS apps, the Typed compiler, tools, tests | 708 | +108: the Candela tree, renderer and worlds, and the RV32 modules |
| `cji/` | the whole-program-inference compiler, its runtime, and `rv32emu` | 163 | unchanged |
| `cmd/`, `pkg/`, `go.mod` | the trace REPL and compiler workbench (Go) | 98 | +70: compiler, repository, results and native RV32 packages; help pages; 25 example scripts |
| `handoffs/` | one empty directory, `typed-selfhost/` | 0 | unchanged |
| `AGENTS.md` | entry document | 1 | 18 links, 12 of them into ticket documents |

Inside `picocalc-os/`, one directory holds very different kinds of code:

- **Firmware and its hosts.**
  - `nucleus/` holds the C kernel, graphics, VM glue and the C ray tracer. It now also holds the Candela renderer core (`candela_gallery.c`, `candela_gallery_instance.cpp`), the Candela world's host side (`candela_world.c`) and a renderer interface with a stub (`candela_render.h`, `candela_render_stub.c`).
  - `port/esp32p4/` and `port/esp32s3-papers3/` are the ESP-IDF projects; the P4 has eight `sdkconfig*` variants. `port/esp32p4/main/candela_gallery_p4.c` is the gallery's FreeRTOS worker.
  - `sdk/` is the native-world SDK, including `sdk/typed/`. Next to it are `natives/`, `host/` and `sim/` (the Linux host build and the simulated board), and `fs-seed/`.
  - `third_party/` has 206 files (+61). The addition is `third_party/candela/`: Candela's JavaScript (`src/`, `presets/`, pinned by `PIN.json` to a workspace archive), plus kernel, interpreter and scene table files *copied out of tickets* (`kernel/`, `vm/`, `gallery/`, listed in `VENDOR.json`).
  - Two firmware options are new: `PICOCALC_CANDELA_WORLD` and `PICOCALC_CANDELA_GALLERY`. The gallery is part of the playable build.
- **Apps.**
  - `worlds/` held only Typed worlds (agenda, candela, chess, editor, files, raytrace). It now also holds two QuickJS worlds: `candela-world` (Candela's unchanged front end) and `candela-gallery` (the gallery app).
  - `js/` and `js-papers3/` hold the JS worlds for the two boards.
  - `scripts/`, `scripts-agent/` and `scripts-papers3/` hold the simulator input scripts that `make shots` runs.
- **The Typed compiler.**
  - `compiler/typed-{wasm,rv32,pie-loops,async,world}.js`.
  - `typed-rv32.js` is now *generated*. Its 13 source modules are in `compiler/rv32/`, and `compiler/rv32/build.mjs` concatenates them. The firmware bundles the generated file (`main/CMakeLists.txt` line 227), and a test fails when the bundle is stale.
  - The same directory still holds four *link adapters*: `raytrace.js`, `raytrace-material.js`, `candela.js` and `mobile-painter.js`. They are not compiler passes.
- **Tools.** `tools/` mixes:
  - compiler-measurement code: `rv32-interp.js`, `typed-ray-bench.js`, `typed-ray-profile.mjs`, `typed-inspect*`;
  - device scripts: `p4cap.py`, `p4put.py`, `s3cap.py`, `provision_agent.py`;
  - asset generators: `gen_font.py`, `generate-chess-meshes.py`, `embed-chess-painter.py`;
  - toolchain setup: `vendor-wamr.sh`, `wasm-toolchain.sh`;
  - three new Candela build tools: `candela-bc.c` (a build-machine QuickJS bytecode compiler), `candela-stage.py` (host staging for `make CANDELA=1`) and `candela-gallery-compositor.py` (a build-time source patch, Section 2.6).
- **Tests.** `tests/` holds 36 files. `node --test tests/*.test.mjs` runs 152 Node tests, including the RV32 bundle-freshness test. `make test-apps` runs a hand-written subset. The Go module has its own tests, now including the help-page tests in `cmd/trace-repl/doc/`.
- **Outputs.** `out/`, `out-s3/` and `out-papers3/` hold 143 tracked `make shots` captures (2.3 MB). The host native tests also write `out/uart.log` and `out/before.png` while they run. Six `build*/` trees, four new `build*-candela/` trees and the port build trees are ignored.

## 2. The problems

### 2.1 Infrastructure lives in tickets

The central problem is that code used again and again lives inside ticket directories. A ticket is a dated log entry. When a later ticket needs the same harness, it copies the earlier one or reaches into it by a glob path. 137 tracked ticket scripts contain a path into another ticket, up from 122 a day earlier. The incidents that started this design, from one day of ray-tracer work:

- **The P4 benchmark harness is a chain of patched copies.**
  - `PICOCALC-SIMD-LAB/scripts/ray/board` was copied to `PICOCALC-SHADOW-CODEGEN/scripts/board`, whose `02-build.sh` still globs the SIMD-LAB ticket for its CMake files.
  - `PICOCALC-OPERAND-HOMES/scripts/01-board.py` builds its harness by string-replacing parts of SHADOW-CODEGEN's `01-images.mjs`. RAY-PARITY's `06-stage-board.py` and now also `10-stage-board.py` do the same again, with other replacements.
  - The run step is still SIMD-LAB's `02-run-board.py`, started by hand. RAY-PARITY's `11-import-board.py` normalizes its capture, and `15-score-board-workbench.js` scores the rows in the trace REPL.
  - A fixed-size buffer in the copied `cold.c` (`char cell[180]`) truncated a longer options string and lost 12 of 48 cold-compile measurements. No test exercises the harness, so a limit like that is found on the board.
- **Flashing goes through three tickets, and more tickets depend on that path now.**
  - `PICOCALC-RAYTRACE/scripts/device/board_common.py` loads `PICOCALC-NATIVE-PROMOTION/scripts/device/common.py` by `importlib`. It still names `PLAYABLE = Path("/tmp/picocalc-native-promotion-rev1/build")` with a playable SHA three builds old (`33b439d0…`).
  - Seven scripts in five tickets load it: CANDELA-CPU-KERNEL `09-run-board.py`, CANDELA-WORLD `08-run-device.py` and `lib/board_health.py`, CANDELA-GALLERY `06-run-device.py`, RAY-PARITY `16-restore-playable.py` and `17-install-playable.py`, and COMPILE-BUDGET `02-run-arms-firmware.py`.
  - A second shared library grew next to it: CANDELA-WORLD's `scripts/lib/board_health.py`, which judges world health with the keyboard and display recorded as "off by user". The gallery and RAY-PARITY's installer import it.
- **The playable firmware is recorded in a `/tmp` file.**
  - AGENTS.md requires that the device is left on the current playable build. Its record is now `/tmp/picocalc-current-playable.txt`, one line `<build dir> <app sha256>`.
  - RAY-PARITY `17-install-playable.py` and CANDELA-GALLERY `06-run-device.py` write it. CANDELA-CPU-KERNEL `09`, CANDELA-WORLD `08` and `12`, and RAY-PARITY `11` read it.
  - A workstation reboot loses both the file and the build tree it names: today `/tmp/picocalc-candela-gallery-a396d3b/build`, app `28d9a812…`.
  - One part has improved. The recipe is now in the repository, `port/esp32p4/build-smooth-chess.sh`, with every `-D` flag, including `PICOCALC_CANDELA_GALLERY=ON`.
- **The replay suite has three copies.**
  - The 24 host workflows that gate every compiler default change were run by `PICOCALC-COMPILER-THESIS/scripts/lowering/replay.sh`. It calls scripts in TYPED-APPS, TYPED-WORLDS and AGENDA-COMPILER.
  - Thirteen Editor checks failed for a day unnoticed, because the suite is not part of any test target. The repaired copy is RAY-PARITY's `04-replays.sh`.
  - COMPILE-BUDGET's `05-replays-policy.sh` copies it once more to add a compiler policy. It reaches into COMPILER-THESIS (`replay-baseline.mjs`), TYPED-APPS, TYPED-WORLDS, AGENDA-COMPILER and RAY-PARITY's repaired scripts. It is the gate the kernel-policy work used.
- **Holdouts are copied, not parameterized.** RAY-PARITY's `05-chess-engine-oracle.mjs` is TYPED-CHESS's oracle with two additions: compile options from an environment variable, and the emulator's instruction count. The emulator `rv32emu` that every host replay uses lives in `cji/tools/rv32/`, inside a different compiler's tree.

Copying is not careless. It is the only option when the code has no permanent home. The fix is to give it one.

### 2.2 Firmware sources whose source of truth is a ticket

The Candela work added a new form of the same problem, and it is worse because the firmware build depends on it. `third_party/candela/kernel/` and `vm/` are copies of files in two tickets:

- CANDELA-CPU-KERNEL's `scripts/generated/` (the generated kernel `cdl_kernel.cpp`, `cdl_post.cpp`) and `scripts/cpu/` (`cdl_math.h`, `cdl_overrides.inc`, `cdl_switches.h`);
- CANDELA-SECTIONS' `scripts/vm/` and `scripts/ck/` (the section bytecode interpreter).

CANDELA-GALLERY's `scripts/02-vendor.py` copied them, and its `01-prepare-scenes.mjs` produces `gallery/candela_gallery_scenes.c`. To do that, it imports CPU-KERNEL's loader (`scripts/lib/candela.mjs`) and SECTIONS' translator (`translateProgram`) by path into both tickets. `VENDOR.json` ends with the note "do not edit here, regenerate in the source tickets".

So the firmware's renderer is defined by code that rule 1 (Section 3) says no other ticket may import, and its edit instructions point into the log. The generators are infrastructure: they need a home outside `ttmp/` from which `third_party/candela/` is regenerated.

### 2.3 One directory, many concerns

`picocalc-os/` contains a firmware, two hardware ports, a host simulator, two app ecosystems, a compiler, generators and device tools. A newcomer cannot tell from the tree which code runs on the device, which runs at build time and which runs only on a workstation.

The Typed compiler directory is a concrete case. The P4 firmware's `main/CMakeLists.txt` bundles `compiler/typed-*.js` into the firmware. It also uses `compiler/raytrace.js` and its neighbours as link steps for specific worlds, so moving "the compiler" means separating two things that share a folder. `worlds/` is a second case: it used to mean "Typed worlds", and it now holds QuickJS worlds as well.

### 2.4 Tests are in five places

- Compiler and app Node tests are in `picocalc-os/tests/`, and `make test-apps` runs a hand-written subset.
- The Python native-world tests are in the same folder, under other targets.
- The replays are in tickets.
- cji has `cji/tests/`.
- The trace REPL has `go test`.

No single command answers "is the tree healthy?"

### 2.5 Configuration is implicit

A firmware configuration is an `sdkconfig*` file plus a set of `-D PICOCALC_*` flags. The playable configuration now has a name and a script (`build-smooth-chess.sh`). The benchmark images, the agent builds and the Candela world's measurement image are still described only by the ticket scripts that built them.

### 2.6 Build-time source patches

`tools/candela-gallery-compositor.py` makes four anchored text edits to `js/system/compositor.js` when the gallery option is on, and CJI compiles the patched copy. The anchors keep the patch safe, because the build stops if one is missing or repeated. But two compositors now exist, and the one on the device is not a file anyone can read.

This is rule 3's problem ("parameters, not patches") inside the firmware build. The patch existed so that the playable firmware stayed byte-identical without the option. The gallery is now part of the playable build, and no backwards compatibility is required, so the edits can simply become part of `compositor.js`.

### 2.7 Tools that name paths at every revision

The trace REPL's `compiler.at(rev)` loads the compiler at any git revision. `pkg/tracecompiler/compiler.go` names the files it loads by fixed paths: `picocalc-os/compiler/typed-*.js`, `picocalc-os/tools/rv32-interp.js` and `picocalc-os/tools/typed-ray-bench.js`. `TypedSources` walks `picocalc-os/worlds`.

A move that changes these paths breaks one of two things. Either `compiler.at` stops working for every commit before the move, or it stops working for every commit after it, unless the table becomes revision-aware. Ordinary tools only need to work at HEAD; this one must work across history.

### 2.8 The entry document points into the log

AGENTS.md has 18 links, and 12 of them point into ticket documents. The current explanation of the Typed compiler is an intern guide inside RAY-PARITY. Documents that stay true belong outside the dated log, which should only reference them.

The trace REPL shows the alternative. Its user guide, query examples and API reference are now Glazed help pages inside the binary (`cmd/trace-repl/doc/`), tested against the example scripts they quote.

## 3. Rules

The layout follows from six rules. They matter more than any particular directory name.

1. **`ttmp/` is the log.** A ticket holds prose, diaries, measurement results, evidence files and scripts that run once for that ticket. A ticket script may call promoted tools and read other tickets' evidence files. It must not import, glob or copy another ticket's code. The second time a script would be copied, it is promoted, and what made the copy different becomes a parameter. Code that the firmware build consumes is never left in a ticket.
2. **One home per concern.** Device code, build-time code, apps, the compiler, the measurement harness and workstation tools each have one top-level directory.
3. **Harnesses take parameters, not patches.** A board run is described by data (modes, workloads, fixtures) passed to one harness. Nobody string-replaces another script's source, and the build does not patch tracked sources.
4. **Build output is not tracked.** Captures that serve as references become golden files with a comparison test. Everything else is ignored. A generated file may be tracked when the build or the device needs it, but only with a check that regenerates it and fails on a difference, as `compiler/rv32/build.mjs --check` does.
5. **One command checks the tree.** `make test` runs every fast suite. `make test-replays` runs the suites that need the RISC-V GCC and `rv32emu`.
6. **The device state is defined in the repository.** The playable firmware is a named build profile with recorded digests, and restore uses that record.

## 4. Target layout

```text
/
├── AGENTS.md                 layout, commands, rules from Section 3; links to docs/
├── Makefile                  test, test-replays, firmware, playable, install-playable, bench-board
├── docs/                     durable documents: architecture, Typed compiler guide,
│                             measurement guide, device guide (promoted from tickets)
├── firmware/
│   ├── nucleus/ sdk/ natives/ host/ sim/ fs-seed/
│   ├── third_party/          including candela/ (vendored JS + generated kernel, vm, scenes)
│   ├── port/esp32p4/         ESP-IDF project; profiles/<name>.env (sdkconfig + -D flags)
│   ├── port/esp32s3-papers3/
│   └── PLAYABLE.json         the build the device must be left on (Section 5.3)
├── apps/
│   ├── typed/<world>/        Typed sources + the world's link adapter (link.js)
│   ├── js/picocalc/          JS worlds, the system worlds, and the QuickJS worlds
│   │                         candela-world/ and candela-gallery/
│   ├── js/papers3/
│   └── tours/picocalc/ tours/agent/ tours/papers3/   simulator scripts for `make shots`
├── compiler/
│   ├── typed/                typed-wasm, typed-pie-loops, typed-async, typed-world,
│   │   └── rv32/             the RV32 modules and build.mjs; generates ../typed-rv32.js
│   └── cji/                  the cji tree, without rv32emu
├── bench/
│   ├── host/                 rv32-interp (the reference), ray profile, Chess oracle, replays/
│   ├── board/                one P4 harness; device library: flash, health, restore, install
│   ├── emu/                  rv32emu (from cji/tools/rv32)
│   └── reference/            fixtures, C reference renderers' expected digests, OPENING_DIGEST
├── tests/                    compiler/ apps/ native/ golden/ — every fast suite
├── tools/
│   ├── trace-repl/           cmd/ and pkg/ of the trace REPL, with its help pages and examples
│   ├── device/               p4cap, p4put, s3cap, provision_agent
│   └── gen/                  fonts, meshes, painter embedding, toolchain setup, and
│       └── candela/          kernel generator, section translator, scene preparation, bytecode compiler
└── ttmp/                     unchanged: the docmgr work log
```

### 4.1 Where each existing path goes

| Today | Target | Reason |
|---|---|---|
| `picocalc-os/{nucleus,sdk,natives,host,sim,fs-seed}` | `firmware/…` | device and host-simulator code |
| `picocalc-os/third_party/` | `firmware/third_party/` | vendored code the firmware compiles |
| `picocalc-os/third_party/candela/{src,presets}` | `firmware/third_party/candela/` | vendored Candela, pinned by `PIN.json` |
| `picocalc-os/third_party/candela/{kernel,vm,gallery}` | the same place, written by `tools/gen/candela/` | generated firmware sources; `VENDOR.json` names the tool and its inputs, not a ticket |
| `picocalc-os/port/*` | `firmware/port/*` | PaperS3 stays maintained (Section 8) |
| `picocalc-os/port/esp32p4/build-smooth-chess.sh` | `firmware/port/esp32p4/profiles/playable.env` | the playable flags as data |
| `picocalc-os/compiler/typed-*.js` | `compiler/typed/` | the compiler proper |
| `picocalc-os/compiler/rv32/` | `compiler/typed/rv32/` | sources of the generated `typed-rv32.js` |
| `picocalc-os/compiler/raytrace.js`, `raytrace-material.js` | `apps/typed/raytrace/link.js`, `link-material.js` | a link step belongs to its world |
| `picocalc-os/compiler/candela.js` | `apps/typed/candela/link.js` | |
| `picocalc-os/compiler/mobile-painter.js` | `apps/typed/chess/link-painter.js` | links `paintChess` |
| `picocalc-os/worlds/{agenda,candela,chess,editor,files,raytrace}` | `apps/typed/*` | Typed worlds |
| `picocalc-os/worlds/{candela-world,candela-gallery}` | `apps/js/picocalc/` | QuickJS worlds, not Typed |
| `picocalc-os/js`, `js-papers3` | `apps/js/picocalc`, `apps/js/papers3` | |
| `picocalc-os/scripts*` | `apps/tours/*` | inputs to `make shots` |
| `picocalc-os/tools/{rv32-interp,typed-ray-bench}.js`, `typed-ray-profile.mjs` | `bench/host/` | measurement; `rv32-interp.js` stays the reference that the Go interpreter is tested against |
| `picocalc-os/tools/typed-inspect*` | `compiler/typed/tools/` | compiler introspection |
| `picocalc-os/tools/{p4cap,p4put,s3cap,provision_agent}.py` | `tools/device/` | |
| `picocalc-os/tools/{candela-bc.c,candela-stage.py}` | `tools/gen/candela/` | build-machine tools |
| `picocalc-os/tools/candela-gallery-compositor.py` | removed | its four edits become part of `compositor.js` (Section 2.6) |
| other `picocalc-os/tools/*` | `tools/gen/` | build-time generators |
| `picocalc-os/tests/*` | `tests/{compiler,apps,native}` | |
| `picocalc-os/out*` | removed; `out/` stays ignored | results, not references (Section 8) |
| `picocalc-os/docs/*` | `docs/` | |
| `cji/` | `compiler/cji/` | still live: `PICOCALC_DEVICE_COMPILER` builds the device compiler ELF from it |
| `cji/tools/rv32/` (emulator, firmware stubs) | `bench/emu/` | used by every replay, not specific to cji |
| `cmd/trace-repl`, `pkg/trace*` | `tools/trace-repl/` | `go.mod` stays at the root so `go test ./...` still covers it |
| `handoffs/` | removed | empty |
| ticket code to promote (Sections 2.1, 2.2) | see Section 4.2 | promoted once, parameterized |

### 4.2 Ticket code to promote

| Ticket code | Promoted to | What becomes a parameter |
|---|---|---|
| SIMD-LAB `scripts/ray/board`, SHADOW-CODEGEN `scripts/board`, RAY-PARITY `06`/`10-stage-board.py`, `11-import-board.py` | `bench/board/{stage.mjs,build.sh,run.py,rows.py}` | modes, workloads, fixtures, pins (Section 5.1) |
| RAY-PARITY `15-score-board-workbench.js` | `bench/board/score.js`, run in the trace REPL | the board directory, from `args` |
| RAYTRACE `scripts/device/board_common.py`, NATIVE-PROMOTION `scripts/device/common.py`, CANDELA-WORLD `scripts/lib/board_health.py`, RAY-PARITY `16-restore-playable.py`, `17-install-playable.py` | `bench/board/device.py` | port; peripherals present or off by user; settle time |
| COMPILER-THESIS `scripts/lowering/replay.sh`, RAY-PARITY `04-replays.sh`, COMPILE-BUDGET `05-replays-policy.sh` and the scripts they call in TYPED-APPS, TYPED-WORLDS, AGENDA-COMPILER | `bench/host/replays/` | `--options` or `--policy` |
| TYPED-CHESS oracle, RAY-PARITY `05-chess-engine-oracle.mjs` | `bench/host/chess-engine.mjs` | `--options`; the instruction count is built in |
| CANDELA-CPU-KERNEL kernel generator and `scripts/lib/candela.mjs` loader; CANDELA-SECTIONS translator and `scripts/{vm,ck}` sources; CANDELA-GALLERY `01-prepare-scenes.mjs`, `02-vendor.py` | `tools/gen/candela/` | the preset list, the kernel switches, and the fixed-kernel SHA that every program is checked against |

## 5. The parts that need design, not just moves

### 5.1 `bench/board`: one P4 harness

Today a board study is a copy of `bench.c`, `cold.c`, `layout.inc`, `01-images.mjs` and `02-build.sh`, patched for the study's modes. The promoted harness takes a study description instead. Modes are now named policies with overrides, which is how the RAY-PARITY runs describe them:

```json
{
  "workloads": ["ray-frame", "ray-predicate", "c-reference", "chess-evaluate", "cold-compile"],
  "modes": [
    {"name": "control", "options": {"policy": "kernel", "operandLocations": {"reuseArgs": false}}},
    {"name": "candidate", "options": {"policy": "kernel"}}
  ],
  "blocks": 6,
  "pins": {"candidate": "4323938e38a4ef2a44c80103bf43680b506195762d6faa0f5834b41c86e9d2a5"}
}
```

```text
bench/board/stage.mjs STUDY.json OUT     compile every mode, check pins, emit blobs.S, inputs.h, manifest.json
bench/board/build.sh OUT                 ESP-IDF build of the diagnostic app
bench/board/run.py OUT CAPTURE           flash, collect rows, restore PLAYABLE.json, verify health
bench/board/rows.py CAPTURE              normalized rows.json + receipt; asserts expected counts
bench/board/score.js                     trace-repl cell: stats.paired per block, wins out of blocks
```

The C side gets its options as data generated into `inputs.h`, not formatted into a fixed buffer, so the mode count and option length are unbounded. A host test runs `stage.mjs` on a two-mode study and checks that the generated tables match the manifest.

`run.py` uses `bench/board/device.py`, which holds what the five copies hold today:

- flashing through `p4put.py`, under the serial lock;
- waiting for the boot-time compiles (RAY-PARITY's `settle()`, up to 60 s, until no world reads "restarting");
- the health check, with `--peripherals off-by-user` when the keyboard and display are switched off;
- restoring the playable image from `PLAYABLE.json`.

### 5.2 `bench/host`: the gates every compiler change runs

- **`bench/host/ray-profile.mjs`** is today's `tools/typed-ray-profile.mjs`, with `OPENING_DIGEST` (`430f0d50…`) in `bench/reference/`.
- **`bench/host/chess-engine.mjs`** is the TYPED-CHESS engine oracle with `--options JSON` and the instruction count built in. Its fixtures move to `bench/reference/chess/`.
- **`bench/host/replays/`** holds the 24 workflows. The scripts they call in TYPED-APPS, TYPED-WORLDS and AGENDA-COMPILER are promoted next to them, together with RAY-PARITY's repairs (`04-check-editor-world.mjs`, `04-editor-world-driver.c`, `04-libgcc-helpers.c`) and COMPILE-BUDGET's policy parameter. `make test-replays` runs them.
- **A `--options` flag on every gate.** That one parameter is the difference between all the copies made so far.

### 5.3 `firmware/PLAYABLE.json` and build profiles

```json
{
  "profile": "playable",
  "commit": "<commit the image was built from>",
  "app": {"file": "picocalc-os-p4.bin", "sha256": "28d9a81241870a45f75c19f0406c4c0fc8c182e2a855cbab3dae6c99caf203a6"},
  "partitionTable": {"sha256": "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"},
  "store": "~/.cache/picocalc/firmware/28d9a812…/"
}
```

- `firmware/port/esp32p4/profiles/playable.env` holds what `build-smooth-chess.sh` passes today: `sdkconfig.defaults;sdkconfig.smooth-chess` and the `-D` flags, including the gallery. Other profiles replace the loose `sdkconfig.*` and flag combinations: `bench`, `agent`, `agent-elf`, and `candela-world` for the Candela world's measurement image.
- `make playable` builds the profile and copies the app, partition table and bootloader into the store directory named by digest. Restore never depends on a `/tmp` build tree surviving.
- `make install-playable` flashes the stored image, settles, health-checks every world and updates `PLAYABLE.json` in one commit. That is the standing instruction to keep the device on the newest playable build, as one command.
- `bench/board/run.py` reads `PLAYABLE.json` and refuses to flash a diagnostic image unless the stored playable image matches its digests. Afterwards it restores and health-checks the playable image.
- `/tmp/picocalc-current-playable.txt` is retired. Old ticket scripts that read it run at their own commits (Section 5.4).

### 5.4 Old ticket scripts after the move

Moving files breaks the relative paths in old ticket scripts, for example `import '../../../../../../picocalc-os/compiler/typed-wasm.js'`. That is acceptable. A ticket script is a record of how a result was produced at one commit, and it runs at that commit:

```sh
git worktree add /tmp/replay-<commit> <commit>
cd /tmp/replay-<commit> && <command from the ticket diary>
```

Old tickets are not rewritten. New tickets call promoted tools.

### 5.5 Candela: generated firmware sources with a home

`tools/gen/candela/` holds the promoted generators:

- the fixed-kernel generator and its loader, from CPU-KERNEL;
- the WGSL-section translator and the interpreter sources, from SECTIONS;
- scene preparation, from the gallery's `01-prepare-scenes.mjs`;
- the build-machine bytecode compiler, `candela-bc.c`.

`make candela-sources` regenerates `firmware/third_party/candela/{kernel,vm,gallery}`. `VENDOR.json` records, for each file, the generator, its inputs' digests and the fixed-kernel SHA (`8925739795c7…942d`), instead of a ticket path. The generated files stay tracked, because the firmware build does not run Node for them. A check (`make candela-sources CHECK=1`, run by `make test`) fails when a regenerated file differs, by the same pattern as `compiler/rv32/build.mjs --check`.

The gallery's equality gates come along as tests. The RV32 reference build (CANDELA-GALLERY `04-build-ref.py`) must keep each scene's frame-0 digest, and on the device `gallery digest` must equal that reference for all 18 scenes. The x86 host build is not a reference: glibc and newlib round differently, and 11 scenes differ pixel for pixel while their mean luminance agrees within 0.007%.

### 5.6 The trace REPL across the moves

`pkg/tracecompiler`'s module table becomes a function of the revision. For a commit before the move it returns today's `picocalc-os/…` paths, and for the move commit and later the new ones. The boundary is found with `git merge-base --is-ancestor MOVE rev`, and the move commit is recorded in the table.

`TypedSources` gets the same treatment for `worlds/` and `apps/typed/`. A test loads `compiler.at` at the commit before each move and at the move itself, and compiles the ray tracer at both. Without this, every recorded result that names a pre-move revision stops being reproducible in the workbench.

## 6. Migration plan

Each phase is one or a few commits, with a gate that must pass before the next phase starts. The order puts the risky firmware move after the harness that verifies it.

| Phase | Work | Gate |
|---|---|---|
| A | Promote `bench/host` and `bench/board` (Sections 4.2, 5.1, 5.2), including the device library, without moving any source. Add `bench/emu` as a copy of `cji/tools/rv32` built by `make`. | The ray profile reproduces the kernel policy's 3,239,635 executed instructions (default 4,888,369) and `430f0d50…`. The Chess oracle matches 6,981 words. 24/24 replays pass under the kernel default. One board study reproduces the RAY-PARITY run 15 medians within run-to-run noise (C 7,733 µs; control 11,164.5 µs; candidate 10,986 µs; 6/6 wins) and restores the playable firmware with every world healthy. |
| B | `PLAYABLE.json`, profiles, `make playable`, `make install-playable`, restore through the store. | A clean `make playable` reproduces `28d9a812…`, or records the new digest of a newer commit. `run.py --probe` passes. |
| B2 | Promote the Candela generators to `tools/gen/candela/` (Section 5.5). Fold the gallery's compositor edits into `compositor.js` and delete the patch tool. | Regenerated `third_party/candela/` files are byte-identical to the tracked ones. The RV32 reference build keeps every scene's frame-0 digest. The playable build boots with the gallery in front. |
| C | Move the Typed compiler (with `rv32/` and its generated bundle) and the link adapters. Update `main/CMakeLists.txt` `BUNDLE_EXTRA` paths, every import, and the trace REPL's module table (Section 5.6). | Node tests pass. `build.mjs --check` passes. The bundled `typed/*.js` files in the firmware build are byte-identical to the moved files. The pinned digests are unchanged. `compiler.at` works at the commit before the move and at the move. |
| D | Move the firmware tree, including `third_party/candela`. Fix `set(OS …)` in the P4 CMake, the host Makefile (including `CANDELA=1`) and the PaperS3 project. | The host build, `make CANDELA=1 candela` and `make shots` succeed. Every profile builds. A `playable` build boots, passes the health check and shows the gallery; `gallery digest` agrees for the 18 scenes. The app digest may change, because ESP-IDF embeds source paths; record it in `PLAYABLE.json`. |
| E | Move apps and tours, including the two QuickJS Candela worlds. | `make shots` captures are identical to before the move. |
| F | Remove `out*` and `handoffs/`. Ignore `out*/`, `.docmgr-operations/` and `__pycache__/`. | `git status` is clean after a full build and a docmgr session. |
| G | Root `Makefile`: `test`, `test-replays`, `firmware PROFILE=`, `playable`, `install-playable`, `bench-board STUDY=`, `candela-sources`. | `make test` runs every fast suite: Node, Python native, cji, `go test ./...` (including the help-page tests) and the generated-file checks. |
| H | Rewrite AGENTS.md. Move the current guides (Typed compiler, measurement, Candela on the P4) to `docs/`, leaving the ticket copies as history. Link the trace REPL's built-in help. | A newcomer can build, test, install the playable firmware and run a board study from AGENTS.md alone. |
| I | ttmp hygiene: close finished tickets with docmgr, and add an index of active tickets to AGENTS.md. No renames. | `docmgr doctor` reports no new errors. |

Phases A and B remain worth doing even if nothing else is: they remove the copy chains and the `/tmp` dependency on their own. B2 is new and nearly as valuable, because it removes the only case where the firmware build depends on ticket code.

## 7. Risks and sequencing

- **Concurrent work.** The trace-REPL workbench branch, which this design originally waited for, has merged. Subagents now work on `worktree-agent-*` branches, and a move on main conflicts with every open one. Before each phase, check that every such branch is merged (`git cherry main BRANCH` prints nothing). The Typed compiler changes often on main, so move it between compiler commits, in a commit that does nothing else.
- **ESP-IDF paths.** `main/CMakeLists.txt` computes `OS` as `${CMAKE_CURRENT_LIST_DIR}/../../..`. It refers to `${OS}/compiler/…`, `${OS}/nucleus/…`, `${OS}/third_party/candela/…`, `${OS}/worlds/candela-*`, `${OS}/tools/candela-*` and `CJI_ROOT`. Phase D must change these together and build every profile, not only the playable one.
- **Silent digest changes.** Phase C must leave compiled images byte-identical, because only files move. The pinned digests are in `typed-pie-loops.test.mjs` (`3ea6af69…`, `2e33bb64…`, `9a4a2356…`) and `typed-rv32.test.mjs` (kernel `4323938e…`, `8eaa4060…`, interactive `6b854512…`, balanced `4fa61ed1…`, default `d9c25ef9…`). Any change during the move is a bug in the move.
- **History-reading tools.** The trace REPL reads the compiler at old revisions (Section 5.6). Another tool that reads history, such as a replay that checks out a commit, needs the same revision-aware paths.
- **Python and Node path assumptions.** Several tools find the repository root by walking up to `.git` and then appending `picocalc-os/…`. Search for `picocalc-os/` across promoted code before each phase.

## 8. Decisions

Decided on 2026-11-22:

- **The ESP32-S3 PaperS3 target is still valuable.** It is kept and moves with the rest: `firmware/port/esp32s3-papers3`, `apps/js/papers3`, `apps/tours/papers3`, `firmware/sim/papers3`, and the `BOARD=papers3` path in the Makefile.
- **The `out*` captures are results.** The 143 tracked files are removed in Phase F, and `out*/` is ignored. A check found nothing that compares against the tracked captures. The host native tests write `out/uart.log`, `out/before.png` and `out/after.png` during their own run and compare those with each other, so `out/` stays as an ignored working directory.
- **`.docmgr-operations/` folders are ignored.** Phase F adds them to `.gitignore`. 45 tickets have one today.
- **cji is kept.** It moves to `compiler/cji/` in Phase C, without `rv32emu`, which moves to `bench/emu/`. It stays live through the device compiler (`PICOCALC_DEVICE_COMPILER`), and its tests join `make test` in Phase G.
- **The gallery build is kept.** `PICOCALC_CANDELA_GALLERY` stays a build option, and `profiles/playable.env` turns it on, so the playable firmware keeps the 18 scenes. Diagnostic profiles leave it off and spend no PSRAM or core-1 time on it. Its compositor edits still move into `compositor.js` in Phase B2, guarded so that a firmware without the gallery never takes the gallery path.

No questions are open. New ones go here as they come up during the phases.

## 9. Reference

| Topic | Location |
|---|---|
| Firmware bundle and link adapters | `picocalc-os/port/esp32p4/main/CMakeLists.txt`: device compiler at lines 131–154, the gallery compositor patch at 163, the Typed bundle from 221 (RV32 bundle at 227), link adapters at 282 (ray) and 319 (painter), the Candela sources from 422 |
| Playable recipe | `picocalc-os/port/esp32p4/build-smooth-chess.sh` |
| Playable record today | `/tmp/picocalc-current-playable.txt`, written by `ttmp/2026/11/21/PICOCALC-RAY-PARITY--*/scripts/17-install-playable.py` |
| Host build, shots, test-apps, Candela | `picocalc-os/Makefile` (`CANDELA=1` from line 62) |
| Board harness chain | `ttmp/2026/11/21/PICOCALC-SIMD-LAB--*/scripts/ray/`, `PICOCALC-SHADOW-CODEGEN--*/scripts/board/`, `PICOCALC-OPERAND-HOMES--*/scripts/01-board.py`, `PICOCALC-RAY-PARITY--*/scripts/{06,10}-stage-board.py`, `11-import-board.py`, `15-score-board-workbench.js` |
| Flashing and health chain | `ttmp/2026/11/20/PICOCALC-RAYTRACE--*/scripts/device/board_common.py` → `PICOCALC-NATIVE-PROMOTION--*/scripts/device/common.py`; `ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--*/scripts/lib/board_health.py` |
| Replays | `ttmp/2026/11/21/PICOCALC-RAY-PARITY--*/scripts/04-replays.sh`, `ttmp/2026/11/21/PICOCALC-COMPILE-BUDGET--*/scripts/05-replays-policy.sh` (both copies of COMPILER-THESIS `scripts/lowering/replay.sh`) |
| Candela generated sources | `picocalc-os/third_party/candela/VENDOR.json`; `ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--*/scripts/{01-prepare-scenes.mjs,02-vendor.py}` |
| RV32 backend sources | `picocalc-os/compiler/rv32/README.md`, `build.mjs` |
| Trace REPL module table | `pkg/tracecompiler/compiler.go` lines 38–44, `TypedSources` near line 213 |
| Emulators | `cji/tools/rv32/emu.c` (`rv32emu`, replays), `picocalc-os/tools/rv32-interp.js` (reference), `pkg/tracerv32` (Go, tested against the reference) |

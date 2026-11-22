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
      Note: Host build, shots and test-apps targets that the move must preserve
    - Path: picocalc-os/port/esp32p4/main/CMakeLists.txt
      Note: Firmware bundle; embeds compiler/ and link-adapter paths and builds the cji device compiler
    - Path: ttmp/2026/11/20/PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/scripts/device/board_common.py
      Note: Example of shared device infrastructure living in a ticket, importing another ticket by glob
ExternalSources: []
Summary: "Why the repository is hard to work in, and a target layout, rules and phased migration that give every reusable piece of code one home while ttmp/ stays the docmgr work log. Design only; nothing is moved yet."
LastUpdated: 2026-11-21T21:00:00-05:00
WhatFor: "Planning and reviewing the repository reorganization before any file moves"
WhenToUse: "Before moving directories, promoting ticket scripts, or adding a new harness"
---

# Reorganizing the repository

This document describes how the repository is laid out today, why that layout makes the compiler work slow and error-prone, and how to reorganize it. It is a design, written while the problems are fresh. Nothing has been moved. One constraint is fixed: `ttmp/` keeps its name and role. docmgr depends on that path, and it is the log of the work: tickets, design documents, diaries, measurements and one-off scripts. The reorganization is about everything that is *not* a log entry but is being kept in one.

No backwards compatibility is required. Every earlier state is in git, and every ticket diary records the commit its scripts ran against.

## 1. What the repository contains today

The repository has 4,969 tracked files. Measured on 2026-11-21:

| Area | What it is | Tracked files | Notes |
|---|---|---:|---|
| `ttmp/` | docmgr tickets: 94 tickets in 10 day folders since 2026-10-31 | 4,164 (84%) | 1,496 of them are ticket `scripts/` |
| `picocalc-os/` | firmware, host simulator, Typed and JS apps, the Typed compiler, tools, tests | ~600 | 1.9 GB on disk with build trees |
| `cji/` | the whole-program-inference compiler, its runtime, and `rv32emu` | | also builds the on-device compiler ELF |
| `cmd/`, `pkg/`, `go.mod` | the trace REPL (Go) | | module `github.com/go-go-golems/picocalc-trace` |
| `handoffs/` | one empty directory, `typed-selfhost/` | 0 | |
| `AGENTS.md` | entry document | 1 | 17 links, 12 of them into ticket documents |

Inside `picocalc-os/`, one directory holds very different kinds of code:

- **Firmware and its hosts:** `nucleus/` (the C kernel, graphics, VM glue, the C ray tracer), `port/esp32p4/` and `port/esp32s3-papers3/` (ESP-IDF projects, eight `sdkconfig*` variants for the P4), `sdk/` (the native-world SDK, including `sdk/typed/` with `world.c`, `rv32-slot.S`, `wasm-slot.c`, `chess-psix.c`), `natives/`, `host/` and `sim/` (the Linux host build and simulated board), `third_party/` (145 files), `fs-seed/`.
- **Apps:** `worlds/` holds the Typed worlds (agenda, candela, chess, editor, files, raytrace). `js/` and `js-papers3/` hold the JS worlds for the two boards. `scripts/`, `scripts-agent/` and `scripts-papers3/` hold simulator input scripts that `make shots` runs.
- **The Typed compiler:** `compiler/typed-{wasm,rv32,pie-loops,async,world}.js`. The same directory also holds four *link adapters*, `raytrace.js`, `raytrace-material.js`, `candela.js` and `mobile-painter.js`, which link one compiled world to a native slot ABI. They are not compiler passes.
- **Tools:** `tools/` mixes compiler-measurement code (`rv32-interp.js`, `typed-ray-bench.js`, `typed-ray-profile.mjs`, `typed-inspect*`), device scripts (`p4cap.py`, `p4put.py`, `s3cap.py`, `provision_agent.py`), asset generators (`gen_font.py`, `generate-chess-meshes.py`, `embed-chess-painter.py`) and toolchain setup (`vendor-wamr.sh`, `wasm-toolchain.sh`).
- **Tests:** `tests/` holds 36 files: Node tests for apps and the compiler, Python tests for native worlds, fixtures. `make test-apps` runs eight of them.
- **Outputs:** `out/`, `out-s3/` and `out-papers3/` are `make shots` captures, 143 tracked files and 2.3 MB. Six `build*/` trees and the port build trees are ignored.

## 2. The problems

### 2.1 Infrastructure lives in tickets

The central problem is that code used again and again lives inside ticket directories. A ticket is a dated log entry. When a later ticket needs the same harness, it copies the earlier one or reaches into it by a glob path. 122 tracked ticket scripts contain a path into another ticket. Examples from one day of ray-tracer work:

- **The P4 benchmark harness is a chain of patched copies.** `PICOCALC-SIMD-LAB/scripts/ray/board` was copied to `PICOCALC-SHADOW-CODEGEN/scripts/board`. Its `02-build.sh` still globs the SIMD-LAB ticket for its CMake files. `PICOCALC-OPERAND-HOMES/scripts/01-board.py` builds its harness by string-replacing parts of SHADOW-CODEGEN's `01-images.mjs`, and `PICOCALC-RAY-PARITY/scripts/06-stage-board.py` does the same again with other replacements. A fixed-size buffer in the copied `cold.c` (`char cell[180]`) truncated a longer options string in the RAY-PARITY run and lost 12 of 48 cold-compile measurements. No test exercises the harness, so a limit like that is found on the board.
- **Flashing goes through three tickets.** `PICOCALC-SIMD-LAB/scripts/ray/02-run-board.py` imports `board_common.py` from `PICOCALC-RAYTRACE`. That file loads `scripts/device/common.py` from `PICOCALC-NATIVE-PROMOTION` by `importlib` and names `PLAYABLE = Path("/tmp/picocalc-native-promotion-rev1/build")`.
- **The playable firmware is not recorded in the repository.** AGENTS.md requires that the device is left on the current playable build. Its digest (`e7b771aa…`) is known only from receipts in ticket `various/` folders. Its build tree was found by hashing every `picocalc-os-p4.bin` under `/tmp`. The recipe is `PICOCALC-TYPED-CHESS/scripts/16-build-playable-firmware.sh`, a list of `-D` flags inside a ticket.
- **The replay suite is a ticket script.** The 24 host workflows that gate every compiler default change are run by `PICOCALC-COMPILER-THESIS/scripts/lowering/replay.sh`. That script calls scripts in `PICOCALC-TYPED-APPS`, `PICOCALC-TYPED-WORLDS` and `PICOCALC-AGENDA-COMPILER`. Thirteen Editor checks had been failing since 2026-11-20 for a link-time reason, and nobody noticed for a day because the suite is not part of any test target. The repaired copy is now RAY-PARITY's `scripts/04-replays.sh`.
- **Holdouts are copied, not parameterized.** RAY-PARITY's `scripts/05-chess-engine-oracle.mjs` is TYPED-CHESS's oracle with two additions: compile options from an environment variable, and the emulator's instruction count. The emulator `rv32emu` that every host replay uses lives in `cji/tools/rv32/`, inside a different compiler's tree.

Copying is not careless. It is the only option when the code has no permanent home. The fix is to give it one.

### 2.2 One directory, many concerns

`picocalc-os/` contains a firmware, two hardware ports, a host simulator, two app ecosystems, a compiler, generators and device tools. A newcomer cannot tell from the tree which code runs on the device, which runs at build time and which runs only on a workstation. The Typed compiler directory is a concrete case. The P4 firmware's `main/CMakeLists.txt` bundles `compiler/typed-*.js` into the firmware. It uses `compiler/raytrace.js` and its neighbours as link steps for specific worlds, so moving "the compiler" means separating two things that share a folder.

### 2.3 Tests are in five places

Compiler and app Node tests are in `picocalc-os/tests/`, of which `make test-apps` runs a hand-written subset. The Python native-world tests are in the same folder under other targets. The replays are in tickets, cji has `cji/tests/`, and the trace REPL has `go test`. No single command answers "is the tree healthy?"

### 2.4 Configuration is implicit

A firmware configuration is an `sdkconfig*` file plus a set of `-D PICOCALC_*` flags. The flags are written down only in the ticket scripts that built each image. "The playable build" and "the benchmark build" are not names in the repository.

### 2.5 The entry document points into the log

AGENTS.md has 17 links, and 12 of them point into ticket documents. The current explanation of the Typed compiler is an intern guide inside RAY-PARITY. Documents that stay true belong outside the dated log, which should only reference them.

## 3. Rules

The layout follows from six rules. They matter more than any particular directory name.

1. **`ttmp/` is the log.** A ticket holds prose, diaries, measurement results, evidence files and scripts that run once for that ticket. A ticket script may call promoted tools. It must not be imported, globbed or copied by another ticket. The second time a script would be copied, it is promoted, and what made the copy different becomes a parameter.
2. **One home per concern.** Device code, build-time code, apps, the compiler, the measurement harness and workstation tools each have one top-level directory.
3. **Harnesses take parameters, not patches.** A board run is described by data (modes, workloads, fixtures) passed to one harness. Nobody string-replaces another script's source.
4. **Build output is not tracked.** Captures that serve as references become golden files with a comparison test; everything else is ignored.
5. **One command checks the tree.** `make test` runs every fast suite. `make test-replays` runs the suites that need the RISC-V GCC and `rv32emu`.
6. **The device state is defined in the repository.** The playable firmware is a named build profile with recorded digests, and restore uses that record.

## 4. Target layout

```text
/
├── AGENTS.md                 layout, commands, rules from Section 3; links to docs/
├── Makefile                  test, test-replays, firmware, playable, bench-board
├── docs/                     durable documents: architecture, Typed compiler guide,
│                             measurement guide, device guide (promoted from tickets)
├── firmware/
│   ├── nucleus/ sdk/ natives/ host/ sim/ third_party/ fs-seed/
│   ├── port/esp32p4/         ESP-IDF project; profiles/<name>.env (sdkconfig + -D flags)
│   ├── port/esp32s3-papers3/
│   └── PLAYABLE.json         the build the device must be left on (Section 5.3)
├── apps/
│   ├── typed/<world>/        Typed sources + the world's link adapter (link.js)
│   ├── js/picocalc/  js/papers3/
│   └── tours/picocalc/ tours/agent/ tours/papers3/   simulator scripts for `make shots`
├── compiler/
│   ├── typed/                typed-wasm, typed-rv32, typed-pie-loops, typed-async, typed-world
│   └── cji/                  the cji tree, without rv32emu
├── bench/
│   ├── host/                 rv32-interp, ray profile, Chess oracle, replays/
│   ├── board/                one P4 harness, flashing and restore library
│   ├── emu/                  rv32emu (from cji/tools/rv32)
│   └── reference/            fixtures, C reference renderers' expected digests, OPENING_DIGEST
├── tests/                    compiler/ apps/ native/ golden/ — every fast suite
├── tools/
│   ├── trace-repl/           cmd/ and pkg/ of the trace REPL
│   ├── device/               p4cap, p4put, s3cap, provision_agent
│   └── gen/                  fonts, meshes, painter embedding, toolchain setup
└── ttmp/                     unchanged: the docmgr work log
```

### 4.1 Where each existing path goes

| Today | Target | Reason |
|---|---|---|
| `picocalc-os/{nucleus,sdk,natives,host,sim,third_party,fs-seed}` | `firmware/…` | device and host-simulator code |
| `picocalc-os/port/*` | `firmware/port/*` | |
| `picocalc-os/compiler/typed-*.js` | `compiler/typed/` | the compiler proper |
| `picocalc-os/compiler/raytrace.js`, `raytrace-material.js` | `apps/typed/raytrace/link.js`, `link-material.js` | a link step belongs to its world |
| `picocalc-os/compiler/candela.js` | `apps/typed/candela/link.js` | |
| `picocalc-os/compiler/mobile-painter.js` | `apps/typed/chess/link-painter.js` | links `paintChess` |
| `picocalc-os/worlds/*` | `apps/typed/*` | |
| `picocalc-os/js`, `js-papers3` | `apps/js/picocalc`, `apps/js/papers3` | |
| `picocalc-os/scripts*` | `apps/tours/*` | inputs to `make shots` |
| `picocalc-os/tools/{rv32-interp,typed-ray-bench}.js`, `typed-ray-profile.mjs` | `bench/host/` | measurement |
| `picocalc-os/tools/typed-inspect*` | `compiler/typed/tools/` | compiler introspection |
| `picocalc-os/tools/{p4cap,p4put,s3cap,provision_agent}.py` | `tools/device/` | |
| other `picocalc-os/tools/*` | `tools/gen/` | build-time generators |
| `picocalc-os/tests/*` | `tests/{compiler,apps,native}` | |
| `picocalc-os/out*` | removed, or `tests/golden/` if a test compares them | build output |
| `picocalc-os/docs/*` | `docs/` | |
| `cji/` | `compiler/cji/` | still live: `PICOCALC_DEVICE_COMPILER` builds the device compiler ELF from it |
| `cji/tools/rv32/` (emulator, firmware stubs) | `bench/emu/` | used by every replay, not specific to cji |
| `cmd/trace-repl`, `pkg/trace*` | `tools/trace-repl/` | `go.mod` stays at the root so `go test ./...` still covers it |
| `handoffs/` | removed | empty |
| ticket harness chains (Section 2.1) | `bench/board/`, `bench/host/replays/` | promoted once, parameterized |

## 5. The parts that need design, not just moves

### 5.1 `bench/board`: one P4 harness

Today a board study is a copy of `bench.c`, `cold.c`, `layout.inc`, `01-images.mjs` and `02-build.sh`, patched for the study's modes. The promoted harness takes a study description:

```json
{
  "workloads": ["ray-frame", "ray-predicate", "chess-evaluate", "cold-compile"],
  "modes": [
    {"name": "previous", "options": {"pieLoops": "pie-empty", "operandLocations": {"forward": true, "capacity": true, "homes": true}}},
    {"name": "candidate", "options": {"pieLoops": "pie-empty"}}
  ],
  "blocks": 6,
  "pins": {"previous": "2e33bb648fd24dc470769ef92cb72be3a793cf4a8de4e964cbbed273b91684ac"}
}
```

```text
bench/board/stage.mjs STUDY.json OUT     compile every mode, check pins, emit blobs.S, inputs.h, manifest.json
bench/board/build.sh OUT                 ESP-IDF build of the diagnostic app
bench/board/run.py OUT CAPTURE           flash, collect rows, restore PLAYABLE.json, verify health
bench/board/rows.py CAPTURE              normalized rows.json + receipt; asserts expected counts
```

The C side gets its options as data generated into `inputs.h`, not formatted into a fixed buffer, so mode count and option length are unbounded. A host test runs `stage.mjs` on a two-mode study and checks that the generated tables match the manifest.

### 5.2 `bench/host`: the gates every compiler change runs

- `bench/host/ray-profile.mjs`: today's `tools/typed-ray-profile.mjs`, with the opening-frame digest in `bench/reference/`.
- `bench/host/chess-engine.mjs`: the TYPED-CHESS engine oracle with `--options JSON` and the instruction count built in. Fixtures move to `bench/reference/chess/`.
- `bench/host/replays/`: the 24 workflows. The scripts they call in TYPED-APPS, TYPED-WORLDS and AGENDA-COMPILER are promoted next to them, together with RAY-PARITY's repairs (`04-check-editor-world.mjs`, `04-editor-world-driver.c`, `04-libgcc-helpers.c`). `make test-replays` runs them.
- A `--options` flag on every gate. That one parameter is the difference between all the copies made so far.

### 5.3 `firmware/PLAYABLE.json` and build profiles

```json
{
  "profile": "playable",
  "commit": "<commit the image was built from>",
  "app": {"file": "picocalc-os-p4.bin", "sha256": "e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5"},
  "partitionTable": {"sha256": "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"},
  "store": "~/.cache/picocalc/firmware/e7b771aa…/"
}
```

- `firmware/port/esp32p4/profiles/playable.env` holds the `sdkconfig` name and the `-D` flags that are now in `16-build-playable-firmware.sh`. Other profiles (`bench`, `agent`, `agent-elf`, `smooth-chess`) replace the loose `sdkconfig.*` + flag combinations.
- `make playable` builds the profile and copies the app, partition table and bootloader into the store directory named by digest. Restore never depends on a `/tmp` build tree surviving.
- `bench/board/run.py` reads `PLAYABLE.json`, refuses to flash a diagnostic image unless the stored playable image matches its digests, and restores and health-checks it afterwards. Updating the playable build is one commit that changes `PLAYABLE.json`.

### 5.4 Old ticket scripts after the move

Moving files breaks the relative paths in old ticket scripts, for example `import '../../../../../../picocalc-os/compiler/typed-wasm.js'`. That is acceptable. A ticket script is a record of how a result was produced at one commit, and it runs at that commit:

```sh
git worktree add /tmp/replay-<commit> <commit>
cd /tmp/replay-<commit> && <command from the ticket diary>
```

Old tickets are not rewritten. New tickets call promoted tools.

## 6. Migration plan

Each phase is one or a few commits with a gate that must pass before the next phase starts. The order puts the risky firmware move after the harness that verifies it exists.

| Phase | Work | Gate |
|---|---|---|
| A | Promote `bench/host` and `bench/board` (Sections 5.1–5.2) without moving any source. Add `bench/emu` as a copy of `cji/tools/rv32` built by `make`. | The ray profile reproduces the current default's instruction count and `430f0d50…`. The Chess oracle matches 6,981 words. 24/24 replays pass. One board study reproduces the RAY-PARITY Step 5 medians within run-to-run noise and restores the playable firmware. |
| B | `PLAYABLE.json`, profiles, `make playable`, restore through the store. | A clean `make playable` reproduces the recorded app digest or records a new one. `run.py --probe` passes. |
| C | Move the Typed compiler and link adapters. Update `main/CMakeLists.txt` `BUNDLE_EXTRA` paths and every import. | Node tests pass. The bundled `typed/*.js` files in the firmware build are byte-identical to the moved files. |
| D | Move the firmware tree. Fix `set(OS …)` in the P4 CMake, the host Makefile and the Papers3 project. | The host build and `make shots` succeed. A `playable` build boots and passes the health check. The app digest is allowed to change, because ESP-IDF embeds source paths, so record the new digest in `PLAYABLE.json`. |
| E | Move apps and tours. | `make shots` captures are identical to before the move. |
| F | Remove `out*` (or keep golden files with a test), `handoffs/`, stray `__pycache__`; tighten `.gitignore`. | `git status` is clean after a full build. |
| G | Root `Makefile`: `test`, `test-replays`, `firmware PROFILE=`, `playable`, `bench-board STUDY=`. | `make test` runs every fast suite, including the Go tests and cji's. |
| H | Rewrite AGENTS.md. Move the current guides (Typed compiler, REPL, measurement) to `docs/`, leaving the ticket copies as history. | A newcomer can build, test and run a board study from AGENTS.md alone. |
| I | ttmp hygiene: close finished tickets with docmgr, add an index of active tickets to AGENTS.md. No renames. | `docmgr doctor` reports no new errors. |

Phases A and B are worth doing even if nothing else is: they remove the copy chains and the `/tmp` dependency on their own.

## 7. Risks and sequencing

- **Concurrent work.** The trace-REPL workbench (PICOCALC-TRACE-WORKBENCH) is being implemented on a branch that changes `cmd/` and `pkg/`. Move `tools/trace-repl` only after that branch has merged. The Typed compiler is changing on main, so move it between compiler commits, in a commit that does nothing else.
- **ESP-IDF paths.** `main/CMakeLists.txt` computes `OS` as `${CMAKE_CURRENT_LIST_DIR}/../../..` and refers to `${OS}/compiler/…`, `${OS}/nucleus/…` and `CJI_ROOT`. Phase D must change these together and build every profile, not only the playable one.
- **Silent digest changes.** Phase C must leave compiled images byte-identical, because only files move. Any change in the pinned test digests (`3ea6af69…`, `2e33bb64…`, `9a4a2356…`) during the move is a bug in the move.
- **Python and Node path assumptions.** Several tools find the repository root by walking up to `.git` and then appending `picocalc-os/…`. Search for `picocalc-os/` across promoted code before each phase.

## 8. Open decisions

- **ESP32-S3 PaperS3 target.** Is it still maintained? If not, remove `port/esp32s3-papers3`, `js-papers3`, `scripts-papers3`, `out-papers3`, `sim/papers3` and the `BOARD=papers3` path in the Makefile instead of moving them.
- **`out*` captures.** Are they references that something compares against, or results? Only references should stay, as golden files.
- **cji's future.** It is live through the device compiler (`PICOCALC_DEVICE_COMPILER`) and its own tests. The proposal keeps it as `compiler/cji`. Archiving it behind a tag is possible only if the device compiler is dropped.
- **`.docmgr-operations/` folders.** 45 tickets have untracked operation folders. Decide with the docmgr owner whether they are meant to be committed or ignored.

## 9. Reference

| Topic | Location |
|---|---|
| Firmware bundle and link adapters | `picocalc-os/port/esp32p4/main/CMakeLists.txt` lines 131–160 (device compiler), 210–310 (Typed bundle, link adapters) |
| Host build, shots, test-apps | `picocalc-os/Makefile` |
| Board harness chain | `ttmp/2026/11/21/PICOCALC-SIMD-LAB--*/scripts/ray/`, `PICOCALC-SHADOW-CODEGEN--*/scripts/board/`, `PICOCALC-OPERAND-HOMES--*/scripts/01-board.py`, `PICOCALC-RAY-PARITY--*/scripts/06-stage-board.py` |
| Flashing chain | `ttmp/2026/11/20/PICOCALC-RAYTRACE--*/scripts/device/board_common.py` → `PICOCALC-NATIVE-PROMOTION--*/scripts/device/common.py` |
| Playable build recipe | `ttmp/2026/11/20/PICOCALC-TYPED-CHESS--*/scripts/16-build-playable-firmware.sh`, `17-install-playable-firmware.py`, `reference/03-reproduce-chess.md` |
| Replays | `ttmp/2026/11/21/PICOCALC-RAY-PARITY--*/scripts/04-replays.sh` (repaired copy of COMPILER-THESIS `scripts/lowering/replay.sh`) |
| Emulator | `cji/tools/rv32/emu.c`, built as `cji/build/rv32/rv32emu` |

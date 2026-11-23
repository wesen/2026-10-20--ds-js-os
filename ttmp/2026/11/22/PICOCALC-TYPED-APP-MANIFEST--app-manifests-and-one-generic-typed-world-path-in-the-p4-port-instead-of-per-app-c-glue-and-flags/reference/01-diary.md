---
Title: Diary
Ticket: PICOCALC-TYPED-APP-MANIFEST
Status: active
Topics:
    - os
    - esp32-p4
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Implementation diary: app manifests, one Typed compile path in the P4 port, the CMake split, benchmarks out of the playable firmware."
LastUpdated: 2026-11-22T20:30:00-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: The design checked against the port, and a reproducible baseline

I read every per-app file of the P4 port and the CMake that wires them, then built the playable profile at `main`
(`4b9a80b`) before changing anything, so every later build has a reference: its bundle inputs, its reactor ELFs and
its app digest. The baseline reproduced the installed playable image exactly, `f8f36bd1…`, although `PLAYABLE.json`
records it as built at `f2e67ee`: the commits between touch no firmware input.

### Prompt Context

**User prompt (verbatim, the coordinator's instructions):** "TICKET: PICOCALC-TYPED-APP-MANIFEST — describe each
Typed app in apps/typed/<app>/app.json and compile them all through one generic path in the ESP32-P4 port; remove
per-app C glue and most PICOCALC_ flags; split firmware/port/esp32p4/main/CMakeLists.txt; move benchmarks out of the
shipping firmware." Work plan: verify the design against the code and append Refinements; keep this diary in the
investigation format; implement; Agenda's and Files' C reactors wait for PICOCALC-AGENDA-TYPED-WORLD; build every
profile (playable, candela-world, offline, agent, agent-elf) into /tmp directories named with the ticket; on the board
flash the playable image as an experiment, settle, health-check every native world, measure every boot app's compile
against its deadline (75 % rule), compare features with the current playable (`f8f36bd1…`), run
`bench/board/gallery.py` (18/18), then `make restore-playable`; never write `firmware/PLAYABLE.json`; gates
`make test`, `make test-host`, `make -C firmware shots`; deletes and moves only through checked Python scripts; focused
commits. TYPED-TAPE edits the BUNDLE_EXTRA list (adds `compiler/typed/tape.js`); SPLIT-FILES splits `agent_p4.c` and
nucleus files; RV32-CONFORMANCE adds a capture app under `bench/board/`.

**Assistant interpretation:** Replace the per-app C files and flags with manifests and one generated table, keep every
feature of the playable firmware, prove it on the board, and leave the installed image as it was.

**Inferred user intent:** Make adding or retuning a Typed app a manifest edit, and make the port say plainly which
parts are still C and why.

### What I did

- Fast-forwarded the worktree branch from `5c2fb9c` to `main` (`4b9a80b`); it had been created behind `main`.
- Read `typed_p4.c`, `chess_p4.c`, `editor_p4.c`, `files_p4.c`, `agenda_p4.c`, `candela_p4.c`, `typed_ray_p4.c`,
  `mobile_painter_p4.c`, `painter_service.c`, `raybench_p4.c`, `typed_ray_material_bench.c`, `perf_p4.c`,
  `main_p4.c`, `port_p4.c`, both `CMakeLists.txt`, `build.sh`, the profiles, the Agenda hooks in `nucleus/kernel.c`,
  `nucleus/vm.c`, `fs_p4.c` and `compiler/install.c`, and `bench/board/{device,playable,gallery,run}.py`.
- Baseline: `firmware/port/esp32p4/build.sh playable /tmp/picocalc-typed-app-manifest-base-playable` (11 min):
  `playable 4b9a80b dirty=false app f8f36bd1120251588de1c27911de2aa9069af828d3db9db6fb029773dc8af1e0`.
- Appended "Refinements (2026-11-22)" to the design document.

### Why

- A baseline built from the same tree is what makes "the bundle did not change" checkable file by file.

### What worked

- The baseline digest equals `PLAYABLE.json`'s: the build is reproducible across commits that do not touch inputs.

### What didn't work

- My first attempts to write files with shell heredocs were refused by the worktree guard ("this command is too
  complex to verify that it stays inside the worktree"); I wrote files with the editor tool and ran Python scripts
  from files instead.

### What I learned

- **Every boot compile happens inside `kernel_boot`.** `add_world` reads each world's file synchronously, so Files,
  Editor and Chess compile in manifest order before the first dispatch (about 10 s after reset).
- **Agenda's early-boot priority is dead in the playable image.** It lasts until 2 s after Agenda's compile starts;
  dispatch begins ~8 s later (`COMPILE-BUDGET` `13-install-balanced/boot.log`: `agenda response us=9169888`).
- **A failed Editor, Files or Chess compile stopped the whole boot** (`kernel_boot` returned −1, the kernel task
  deleted itself). Only Agenda had a JavaScript fallback, by switching manifests before boot.
- The prelude bytecode cache in `vm.c` sat under `PICOCALC_TYPED_AGENDA` but speeds every QuickJS world's start.

### What was tricky to build

- N/A (reading).

### What warrants a second pair of eyes

- The decision to drop the Wasm route for boot apps on the P4 (no profile builds it).

### What should be done in the future

- N/A.

### Code review instructions

- Design: `design-doc/01-app-manifests-and-one-typed-world-path-in-the-port.md`, "Refinements".

### Technical details

- Baseline build directory: `/tmp/picocalc-typed-app-manifest-base-playable` (kept for the bundle comparison).

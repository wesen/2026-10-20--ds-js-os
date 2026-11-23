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

## Step 2: Manifests, the generator, one compile path, the CMake split, benchmarks out

I wrote `apps/typed/NAME/app.json` for the six Typed apps and `firmware/port/esp32p4/typed_apps.py`, which turns the
profile's manifests into the assembled sources, a C table, the boot manifest and a CMake fragment at configure time.
`typed_p4.c` compiles every app from its row; the four per-app compile files are gone, the painter, Candela and the
ray tracer call the same function, the kernel learned a manifest fallback, and `main/CMakeLists.txt` shrank from 611
to 96 lines with four files per concern beside it. The first playable build after the change compiled, and every
bundled source and reactor ELF was byte-identical to the baseline's under its new name.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement the refined design without losing any compiled byte.

**Inferred user intent:** A port where the apps are data.

**Commit (code):** `5ca2faa` — "feat(nucleus): a manifest entry's JavaScript fallback; drop the Agenda boot hooks";
`ab62b73` — "refactor(p4): Typed apps from app.json through one compile path; CMake per concern; benchmarks out";
`477ed5c` — "docs: Typed app manifests, the bench profile and the CMake split in the guides";
`d4453e8` — ticket documents and scripts.

### What I did

- `apps/typed/{agenda,files,editor,chess,candela,raytrace}/app.json`; Chess's carries the delivered painter.
- `typed_apps.py`: assembles sources (each followed by a newline; Chess's view rename and embedded painter from its
  manifest; Candela's variants by running `assemble.py`), writes `typed_apps.c`, `system.typed.json` (fallbacks,
  overrides, appended Chess, then the Candela world and gallery entries) and `typed-apps.cmake`.
- `typed_p4.c`: `p4_typed_compile` takes the compiler-module list instead of guessing `typed/async.js` from the
  linker's name and drops the Wasm engine and the buffered-functions macro; new `p4_typed_app_find`,
  `p4_typed_app_limits`, `p4_typed_app_compile`, `p4_typed_world_read` (serves `NAME/compiled.bin`), and the console's
  `typed` (list), `typed WORLD baseline|build`.
- Nucleus: `"fallback"` in `manifest_world_t`, parsed by both bindings, used by `add_world`;
  `firmware/tests/test_fallback_native.py` (3 tests, in `make test-sys`). Removed the Agenda hooks from `kernel.c`,
  `vm.c`, `fs_p4.c`, `install.c` (`compiler_tick` lost its argument) and `main_p4.c`; the prelude cache is
  `PICOCALC_PRELUDE_CACHE`, set on every P4 build.
- CMake: top level takes `PICOCALC_APPS` (implies `PICOCALC_NATIVE_ELF`, removes each app from `CJI_WORLDS`);
  `cmake/native-elf.cmake` (moved verbatim), `cmake/typed-apps.cmake`, `cmake/candela.cmake`, `cmake/bench.cmake`.
- Profiles: `APPS=(…)` plus options; `build.sh` passes `PICOCALC_APPS` and records `apps`; new `profiles/bench.env`.
- `scripts/02-move-port-files.py` (dry run, then `--apply`): 6 deleted (`agenda_p4.c`, `chess_p4.c`, `editor_p4.c`,
  `files_p4.c`, Chess's and Editor's `source.list`), 3 moved to `bench/board/firmware/`
  (`raybench.c`, `cachestat.c`, `typed_ray_material_bench.c`). The bench halves of `typed_ray_p4.c` and
  `candela_p4.c` became `typed_ray_bench.c` and `candela_bench.c`; `bench_console.c` dispatches them.
- Host consumers: `bench/host/replays/editor-world.mjs` and the trace REPL's `world(name)` read `app.json`
  (older revisions keep `source.list`/built-in layouts); `TestWorldLayoutsFromAppManifests`.

### Why

- A generated C table rather than JSON parsed on the device: the limits are needed before the compiler runtime
  exists, and the build already has Python.
- Uniform "each source followed by a newline": checked first (`scripts/01-trailing-newline.mjs`): Agenda's and Files'
  modules are identical with and without the trailing newline (66,364 and 24,424 bytes, same digests).

### What worked

- `scripts/03-compare-bundles.py` against the baseline: 51 files the same, 14 renamed with identical bytes (every
  reactor ELF, Chess's, Editor's, Candela's and the painter's sources, the linkers), 5 new (Agenda's, Files' and the
  ray tracer's sources, which gained a trailing newline, Agenda's tail, `system.typed.json`), 10 gone (the four
  chained `system.typed-*.json`, the split Agenda/Files/ray sources, the `typedmat` bench files), 0 changed.
- `scripts/04-module-images.mjs`: Agenda, Files and the ray tracer link to the same images from the new sources.
- `go test ./pkg/traceapi/` passes (105 s), with a temporary go.mod whose `replace` path is absolute (the worktree's
  `../go-go-golems` does not exist).

### What didn't work

- The new boot manifest first lacked Agenda's `budget_ms: 100` (the old CMake set it in the Agenda block). Found by
  comparing `system.typed.json` with the old `system.typed-agenda.json` as JSON; added to Agenda's `world` override.
- `go test ./pkg/traceapi/` in the worktree: `github.com/go-go-golems/go-go-goja@v0.10.7: replacement directory
  ../go-go-golems/go-go-goja does not exist` — ran with `-modfile` pointing at a copy with an absolute path.
- The `bench` profile failed: `candela_bench.c:53:65: error: passing argument 2 of 'esp_rom_crc32_le' from
  incompatible pointer type` — my extraction replaced the `crc_bytes(const void *, size_t)` helper with direct calls;
  restored the helper.

### What I learned

- `CMAKE_CURRENT_LIST_DIR` inside an `include()`d file is the included file's directory; the moved native-ELF block
  needed `${MAIN}` and `${PORT}` for `pack_elf.py` and the compiler tool.

### What was tricky to build

- Keeping every compiled byte while renaming everything: the reactor command lines keep the old argument order
  (flags, defines, `-o`, sources), and the comparison was by content, not by name.

### What warrants a second pair of eyes

- `p4_typed_world_read` runs inside `add_world` exactly like the old per-app calls, so boot order and timing are
  unchanged; Agenda now compiles third instead of before `kernel_boot`.
- Chess has no fallback: a failed Chess compile still stops the boot (no JavaScript Chess exists).

### What should be done in the future

- PICOCALC-AGENDA-TYPED-WORLD: Agenda's and Files' C reactors.

### Code review instructions

- Start at `firmware/port/esp32p4/typed_apps.py`, `main/typed_apps.h`, the tail of `main/typed_p4.c`,
  `cmake/typed-apps.cmake`, then one manifest (`apps/typed/chess/app.json`).
- `python3 firmware/port/esp32p4/typed_apps.py . /tmp/x --apps "chess;agenda;editor;files;candela;raytrace"
  --manifest apps/js/picocalc/system.json` shows the generated files without a firmware build.

### Technical details

- What stays C, per manifest `host`: the painter's loader and task (`mobile_painter_p4.c`, `painter_service.c`,
  `painter_commands.c`, `chess-psix.c`), Candela's scene host and renderer (`candela_p4.c`, `candela_scene.c`), the
  ray tracer's display host (`typed_ray_p4.c`); reactors: Agenda's and Files' world C, the shared Typed world runtime
  (`sdk/typed/world.c`), the slots.

## Step 3: Every profile built twice over, the gates, and the experiment image on the PicoCalc

At `d4453e8` every profile builds, the playable profile reproducibly (two directories, one digest). On the board the
experiment image boots healthy with the keyboard and display on, every boot compile stays inside 75 % of its deadline
with the same module bytes as before, the raytrace view's four scenes give the same framebuffer CRCs, the Typed ray
tracer links to the same ELF CRC, and the gallery's 18 digests equal the RV32 reference. Midway the keyboard's I2C
began failing every transfer (on the playable image as well), which cost the gallery's on-screen check and the
peripherals-on restore; the digests were checked without the screen and the playable image was restored and
verified by digest.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Run every gate the coordinator named and leave the playable image on the board.

**Inferred user intent:** Evidence that the refactor changed no behaviour of the shipped firmware.

**Commit (code):** `13abe1d` — "fix(bench): candela_bench.c keeps its CRC helper; ticket board scripts".

### What I did

- `scripts/05-build-profiles.sh d4453e8`: playable, playable again, bench, candela-world, offline, agent, agent-elf.
  bench failed (Step 2), rebuilt at `13abe1d`.
- `scripts/06-board.py /tmp/picocalc-typed-app-manifest-playable-d4453e8 /tmp/picocalc-typed-app-manifest-board-1`:
  under one hold of the lock, verify the recorded playable image (reset), health with peripherals on, features
  (worlds, painter, `typed`, F1, V, then G three times through the raytrace scenes with a `shot` of each, waiting
  for `TRLOAD` on the Typed scene); then write the experiment image and repeat.
- `bench/board/gallery.py /tmp/picocalc-typed-app-manifest-gallery-1` and `-2` (after
  `scripts/07-open-gallery.py`): failed, see below.
- `make restore-playable OUT=/tmp/picocalc-typed-app-manifest-restore-1`, then `PERIPHERALS=off-by-user`
  (`-restore-2`): both wrote and verified the playable image, both failed health (below).
  `scripts/08-status.py` 30 s later: painter installed, the judged worlds native from their files.
- `scripts/09-gallery-digests.py`: the 18 digests without the on-screen wait, first on the playable image (control),
  then `--build` the experiment image; then `make restore-playable OUT=/tmp/picocalc-typed-app-manifest-restore-3`
  (written and verified; health failed on the keyboard again) and `08-status.py` (status-2: every judged world native
  from its file, no errors, painter installed; I2C0 2,238 transfers, 2,238 errors).
- `make test` (with `GOFLAGS=-modfile=` a go.mod copy whose replace path is absolute, and the main checkout's
  `firmware/build/wasm-toolchain` linked into the worktree), `make test-host`, `make test-host
  OPTIONS='{"policy":"kernel"}'`, and `make -C firmware shots` at `4b9a80b` (from `git archive`) and at the branch.

### Why

- The board script compares the two images in one session, under the same conditions, instead of against numbers
  from an older ticket.

### What worked

| Profile | App digest (`d4453e8`) |
|---|---|
| playable (twice) | `ddcf66e6d38d5fc7c12ecf90b9bb88282ee98edfa43c0ebf966a24e471054a11` |
| bench (`13abe1d`) | `b00e30e46f4237513fbb4fdf2de972b52442d48e589021ffdc0f4d1487b7d3be` |
| candela-world | `017c7cd513457b75c30b94ce5da8e33c583c4995b25adf500f6cd8949b1627ab` |
| offline | `4d2a61ae22079a4e148a155c1b4236025aa1c4c601de8a10c26eec901ad21fb2` |
| agent | `fe50bc04733cd3861e6e15333e894b554fb64accb55f486262f2ad27f243a1a3` |
| agent-elf | `d9a49c40fbad881db8b39327d5c4db8f0d79f31c8ca3d4d56c5bb0a7f7c5f3f4` |

`13abe1d` changes no input of the other profiles, so their digests hold there too.

Boot and first-use compiles on the board (`board-1/summary.json`), experiment against the playable image measured
minutes before:

| App | Policy | Compile | Deadline | Share | Playable image | Module bytes (both) |
|---|---|---:|---:|---:|---:|---:|
| Candela (boot) | default | 2.19 s | 8 s | 27 % | 2.17 s | 66,816 |
| Files | default | 0.43 s | 1.7 s | 25 % | 0.43 s | 24,424 |
| Agenda | interactive | 0.68 s | 1.7 s | 40 % | 0.67 s | 66,364 |
| Editor | interactive | 3.17 s | 6 s | 53 % | 3.18 s | 242,124 |
| Chess | balanced | 3.87 s | 6 s | 64 % | 3.88 s | 274,892 |
| Chess painter | default | 5.01 s | 8 s | 63 % | 4.92 s | 33,840 |
| Typed ray tracer (first display) | kernel | 2.11 s | 8 s | 26 % | 2.11 s | 66,816 |

- Health with peripherals on: every native world (agenda, chess, compositor, display, editor, files, keyboard, snake)
  native from its file, no restarts, nothing restarting after settle, painter compiled once and installed, keyboard
  answering.
- Features: the same worlds with the same engines and files; the painter state the same; framebuffer CRCs of the
  raytrace view equal on all four scenes (C `788a496b`, Candela mix `ff3499b1`, Candela tile `4d64e712`, Typed
  `85805f0b`); `TRLOAD` `elfCRC` `00300430` on both. The experiment's `typed` lists the seven units with the
  manifests' limits. The playable answers `unknown command typed`.
- Gallery digests: 18/18 on the playable image (control), 18/18 on the experiment image.
- `make test`: exit 0. `make test-host`: ray `430f0d501659` (4,888,369 instructions), Chess oracle 6,981 words, 24/24
  replays. With `{"policy":"kernel"}`: ray `430f0d501659` (3,239,635), 6,981 words, 24/24.
- Shots: 79 files at `4b9a80b` and at the branch, `diff -rq` empty.

### What didn't work

- `bench/board/gallery.py`: `AssertionError: no CGAL scene record within 120 s: the gallery is not drawing`, three
  times: on the experiment after `06-board.py` left the launcher in front, again after `07-open-gallery.py` pressed
  F1 and P, and on the restored playable image. From the open-gallery run on, the console carried nothing but
  `E (…) i2c.master: I2C transaction unexpected nack detected` (19,639 of 19,640 lines in `gallery-2/uart.log`).
- `make restore-playable OUT=/tmp/picocalc-typed-app-manifest-restore-1`: the image was written and verified
  (`verify OK (digest matched)`), then `ValueError: physical keyboard I2C0 did not qualify: {'busyMs': 1215.36,
  'transfers': 48, 'bytes': 195, 'errors': 48} -> {… 'transfers': 51, … 'errors': 51}`.
- With `PERIPHERALS=off-by-user` (`restore-2`): written and verified again, then `RuntimeError: painter {'sources':
  0, 'compiles': 0, 'installed': False, …}` — the off-by-user check reads the painter at once, before Chess has
  delivered it. 30 s later (`08-status.py`) the painter was installed; I2C0 9,462 transfers, 9,462 errors.
- First `make test`: `/usr/include/stdint.h:26:10: fatal error: 'bits/libc-header-start.h' file not found` building
  `build/natives/echo.wasm`: the worktree has no `firmware/build/wasm-toolchain` (untracked, in the main checkout).

### What I learned

- The keyboard (the PicoCalc's I2C controller) stopped answering between the experiment's health check, which passed
  with the keyboard on, and the next console session; it fails on the playable image too. Per the rules I did not
  debug it. With every transfer failing, the error log saturates the 115,200-baud console.
- `gallery.py` needs the gallery in front; the digests do not.

### What was tricky to build

- `device.install` and `device.acquire` take the lock themselves; one session that compares two images has to use the
  lower-level `hold`, `esp` and `write_app` inside a single `acquire`, since `flock` on a second descriptor in the
  same process would wait on itself.

### What warrants a second pair of eyes

- The playable image is back on the board (verified by digest twice), but its health record in this ticket is the
  30-second status, not a passing `install` health check, because the keyboard fails.

### What should be done in the future

- Check the keyboard by hand; then the coordinator's install runs the peripherals-on health check.
- `device.health(off-by-user)` could wait for the painter as the peripherals-on branch does.

### Code review instructions

- `/tmp/picocalc-typed-app-manifest-board-1/summary.json`, `…/after/scene-3.png`,
  `/tmp/picocalc-typed-app-manifest-digests-experiment/gallery.json`.

### Technical details

- Build directories: `/tmp/picocalc-typed-app-manifest-{playable,playable-again,candela-world,offline,agent,
  agent-elf}-d4453e8`, `/tmp/picocalc-typed-app-manifest-bench-13abe1d`.

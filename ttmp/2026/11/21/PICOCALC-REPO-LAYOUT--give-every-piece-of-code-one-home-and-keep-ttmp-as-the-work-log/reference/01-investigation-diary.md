---
Title: Investigation diary
Ticket: PICOCALC-REPO-LAYOUT
Status: active
Topics:
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T20:24:38.385145597-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

This diary records PICOCALC-REPO-LAYOUT: the design, and later the migration, of a repository layout in which every reusable piece of code has one home and `ttmp/` stays the docmgr work log. Entries use the investigation format.

## Step 1: Write the reorganization design while the problems are fresh

This step produced the design document only. It describes the current layout with measured counts, the problems and the concrete incidents behind them, six rules, a target layout with a path-by-path mapping, designs for the parts that are more than moves (the board harness, the host gates, the playable-firmware record) and a nine-phase migration with a gate per phase. Nothing was moved, as asked.

### Prompt Context

**User prompt (verbatim):** "how would you reorganize and cleanup the repository to make things more understandable and cleanly laid out? it's starting to be quite a mess. We can cut anythiing, or move it around, anything goes, no backwards compatibility needed, it's all in git anyway. Answer, then stop."

**Follow-up prompt (verbatim):** "write a new docmgr ticket design doc for the reorganization (as a design doc), but keep the name ttmp/ since docmgr depends on it. It's just a log of the work we do. Don't implement it yet, but write it down while it's fesh"

**Assistant interpretation:** Turn the earlier chat answer into a reviewable design in a ticket. The answer had proposed renaming `ttmp/` to `research/`; that is withdrawn. `ttmp/` keeps its name and becomes the explicit "log" in the rules.
**Inferred user intent:** Have a plan to execute later that does not depend on anyone remembering today's details.

### What I did

- Counted tracked files with `git ls-files` (4,969 total, 4,164 under `ttmp/`, 1,496 under ticket `scripts/`) and tickets with `ls -d ttmp/2026/*/*/*/` (94).
- Counted ticket scripts that name another ticket's path: `git ls-files 'ttmp/**/scripts/*' | xargs grep -l "ttmp/2026"` gives 122.
- Read the firmware bundle in `picocalc-os/port/esp32p4/main/CMakeLists.txt` (device compiler at lines 131–160; Typed bundle and link adapters at lines 210–310), the `picocalc-os/Makefile` targets and both `.gitignore` sections.
- Opened the four non-compiler files in `picocalc-os/compiler/`. Each starts with a `link…` function (`linkTypedRay`, `linkTypedMaterial`, `linkCandela`, `linkMobilePainter`) that compiles one world and checks its native slot signatures.
- Traced the flashing chain: `PICOCALC-RAYTRACE/scripts/device/board_common.py` loads `PICOCALC-NATIVE-PROMOTION/scripts/device/common.py` and names `PLAYABLE = Path("/tmp/picocalc-native-promotion-rev1/build")`.
- Wrote the design doc and ten tasks (q53s for the doc, n17a…1ank for Phases A–I).

### Why

- The incidents of the last day all came from the same cause. The board harness is a chain of four patched copies, the replays were broken for a day without anyone noticing, and the playable build had to be found by hashing `/tmp`. Writing them down now, with paths, keeps the design concrete.

### What worked

- Every claim in Section 2 has a path or a count from the commands above.

### What didn't work

- My first chat answer proposed `research/` instead of `ttmp/`. That conflicted with docmgr's fixed root, and the user corrected it.

### What I learned

- cji is not dead code. `PICOCALC_DEVICE_COMPILER` builds `natives/compiler.elf` from `cji/`, and every host replay runs `cji/build/rv32/rv32emu`. The emulator is general infrastructure inside a compiler tree. The design moves it to `bench/emu/`.
- The four "compiler" files that are not compiler passes are link adapters, each tied to one world. That makes their home obvious: next to the world.

### What was tricky to build

- Choosing the order of phases. The firmware move (D) is the riskiest, and it needs a harness that can verify a playable build. Phases A and B therefore come first, and they are useful even if the rest is never done.

### What warrants a second pair of eyes

- Section 8's open decisions: whether the PaperS3 target is still maintained, whether `out*` captures are references, cji's future, and `.docmgr-operations/`.
- Phase D's gate accepts a changed app digest, because ESP-IDF embeds source paths. A reviewer should agree that "boots and passes the health check" is the right gate there.

### What should be done in the future

- Phase A, when the current compiler work reaches a pause. Coordinate with the trace-REPL workbench branch before moving `cmd/` and `pkg/`.

### Code review instructions

- Read `design-doc/01-reorganizing-the-repository-a-design-for-one-home-per-concern.md`, Sections 2 (evidence), 3 (rules) and 6 (gates).

### Technical details

- The current playable firmware: app `e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5`, partition table `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. Build tree at time of writing: `/tmp/picocalc-scalar-breakdown-verified/build`.

## Step 2: Revise the design for the 98 commits since it was written

The design was a day old, and in that day the repository had grown by 2,396 tracked files. The new work included the Candela path tracer on the P4, the RV32 backend split, the trace-REPL workbench and its help pages, and more RAY-PARITY board and replay scripts. This step re-measured every count, added the new instances of each problem, and found two new kinds of problem: firmware sources whose source of truth is a ticket, and a tool that reads compiler paths at every revision. It also recorded the three decisions the user made. Nothing was moved.

### Prompt Context

**User prompt (verbatim):** "update it for the new code that we have written since."

**Mid-turn message (verbatim):** "papers3 is still valuable.  I think out/ is just results? ignore .docmgr operations I think"

**Assistant interpretation:** Revise the design document so that its inventory, problems, mapping, phases and gates describe the current tree, and turn three of the four open questions into decisions. Check the `out/` guess before relying on it.

**Inferred user intent:** Have a plan that can be executed against today's tree, not yesterday's.

### What I did

- Ran `git diff --name-status 243cc05 HEAD` outside `ttmp/` and grouped it by directory. The new paths:
  - 61 files under `third_party/candela`;
  - seven `nucleus/candela_*` files and `port/esp32p4/main/candela_gallery_p4.c`;
  - 13 `compiler/rv32/` modules with `build.mjs` and a README;
  - two QuickJS worlds, `worlds/candela-world` and `worlds/candela-gallery`;
  - three Candela tools;
  - 36 new files in `pkg/` and 34 in `cmd/` (the workbench, the help pages and the examples).
- Recounted with the Step 1 commands:
  - 7,365 tracked files, 6,391 of them under `ttmp/` and 1,719 ticket scripts;
  - 104 tickets in 11 day folders;
  - 137 scripts that name another ticket's path (122 before);
  - AGENTS.md with 18 links, 12 into tickets.
- Grepped the 13 new tickets' scripts for paths into other tickets and read each hit. The findings:
  - `PICOCALC-RAYTRACE/scripts/device/board_common.py` now has seven importers in five tickets, and it still names a `/tmp` playable build with SHA `33b439d0…`.
  - `CANDELA-WORLD/scripts/lib/board_health.py` became a second shared library.
  - COMPILE-BUDGET's `05-replays-policy.sh` is a third copy of the replay suite.
  - RAY-PARITY's `10-stage-board.py` is another string-replacing variant of the board harness.
  - `/tmp/picocalc-current-playable.txt` is now written by two scripts and read by four.
- Read `third_party/candela/VENDOR.json`. Its 15 files come from CANDELA-CPU-KERNEL and CANDELA-SECTIONS ticket scripts, and its note says "do not edit here, regenerate in the source tickets".
- Read `pkg/tracecompiler/compiler.go` lines 38–44, where the module table names `picocalc-os/compiler/…` and `picocalc-os/tools/…` paths. `compiler.at(rev)` loads them at any revision.
- Checked the `out/` guess:
  - `git grep` over the Makefile, tests and tools found the host native tests writing `out/uart.log`, `out/before.png` and `out/after.png` during their own run;
  - `test_sys_native.py:142` compares `before.png` with `after.png` from the same run;
  - nothing reads the 143 tracked captures.
- Rewrote the design document:
  - Section 1 (inventory), Section 2.1 (new instances) and new Sections 2.2 (generated firmware sources in tickets), 2.6 (build-time source patch) and 2.7 (history-reading tools);
  - rules 1, 3 and 4 tightened;
  - target layout and mapping updated, with a new Section 4.2 listing the ticket code to promote and what becomes a parameter;
  - Sections 5.1 and 5.3 updated, and new Sections 5.5 (Candela generators) and 5.6 (trace REPL across moves);
  - a new Phase B2, updated gates and risks, and Section 8 split into decided and open questions.
- Added two tasks: 4dwu (Phase B2) and v3ua (a revision-aware module table before Phase C).

### Why

A plan whose gates name yesterday's numbers would fail its own first gate. Phase A's gate, for example, named the RAY-PARITY Step 5 medians and the old pinned digests. The Candela copy also changes the priorities. The firmware build now consumes ticket code, which is a stronger reason to promote than a copied harness, so it gets its own phase (B2) directly after the playable record.

### What worked

- Every new claim in Sections 1, 2 and 4 has a path, a count or a grep behind it.
- The check on `out/` confirmed the user's guess and turned it into a precise decision: remove the tracked captures, but keep `out/` as an ignored working directory, because the host tests write into it.

### What didn't work

- My first cross-ticket grep printed nothing. A `grep -v` that dropped lines naming the script's own ticket also dropped lines that named another ticket in the same path. Filtering on the last path component fixed it.
- My first draft's Candela gate said that the x86 host build's frame-0 digests must equal the RV32 reference. That is false: CANDELA-GALLERY measured 11 of 18 scenes differing between host and device, because glibc and newlib round differently. The gate now uses the RV32 reference build, which equals the device in all 18 scenes.
- Two CMake line references in Section 9 had shifted (the device compiler now ends at 154, and the Typed bundle starts at 221). They were re-read and corrected.

### What I learned

- `port/esp32p4/build-smooth-chess.sh` already holds the playable flags in the repository. Phase B can turn it into `profiles/playable.env` instead of reconstructing the flags from ticket scripts.
- The repository now has three RV32 interpreters: `rv32emu` in C (used by the replays), `tools/rv32-interp.js` (the reference) and `pkg/tracerv32` in Go (tested against the reference). They have different jobs, so the design gives each one a home instead of merging them.

### What was tricky to build

Deciding where the Candela generators belong. They are not part of the firmware, the compiler or the measurement harness. They are build-time generators whose output the firmware compiles, which is the definition of `tools/gen/`, and the vendored JavaScript and generated C stay under `firmware/third_party/candela/`. Tracking the generated C (and not generating it in CMake) follows the RV32 bundle's pattern: track it, and check it by regenerating.

### What warrants a second pair of eyes

- Section 5.6, the revision-aware module table. The alternative is to let `compiler.at` work only on one side of each move. That would break reproducing recorded workbench results that name old revisions.
- Section 8's remaining open questions: cji's future, and whether the gallery stays an option of the playable profile.

### What should be done in the future

- Phase A, then B and B2, when no `worktree-agent-*` branch is open. Today all six agent branches are merged into main.

### Code review instructions

Read the design document's Sections 2.1, 2.2, 2.6 and 2.7 (what is new), 4.2 (what gets promoted), 5.5 and 5.6, and the Phase A, B2 and C gates in Section 6. The commands under "What I did" reproduce every count.

### Technical details

- Base of the comparison: `243cc05` (2026-11-21 20:26). Head at measurement: `5c2fb9c`.
- The current playable image: app `28d9a81241870a45f75c19f0406c4c0fc8c182e2a855cbab3dae6c99caf203a6`, partition table `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. The build tree is `/tmp/picocalc-candela-gallery-a396d3b/build`.

## Step 3: Decide the last two open questions

**User prompt (verbatim):** "yes, keep cji, and the gallery build"

This milestone moved the two remaining questions in Section 8 to decided.

- **cji** stays and moves to `compiler/cji/` in Phase C. `rv32emu` moves out of it, to `bench/emu/`.
- **The gallery** stays a build option (`PICOCALC_CANDELA_GALLERY`), and `profiles/playable.env` turns it on. Diagnostic profiles leave it off. Its compositor edits still move into `compositor.js` in Phase B2, behind a check, so that a build without the gallery never takes the gallery path.

Section 8 now has no open questions. Only the design document, this diary and the changelog changed.

## Step 4: Start the migration, and do Phase F first

The user asked to implement the design. This step plans the order of the work, starts two background agents, and lands Phase F. Phase F stops tracking build output, and it goes first because it is independent of every other phase and removes noise from `git status` for the rest of the migration.

### Prompt Context

**User prompt (verbatim):** "then, implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

 write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
 Commit and push the bsidian vault when done (go-go-parc vault).   The report is basically about the entirety of this project and repository, explaining what's in it and why and where and how it's used and what it taught us and all that."

**Assistant interpretation:** Execute Phases A to I of the design, with commits at phase boundaries and this diary in investigation format. Then write one long vault report about the whole project and repository, and commit and push the vault.

**Inferred user intent:** End with a repository a newcomer can understand from its layout, and a written account of what the project built and learned.

**Commit (code):** `3b809dd` (Phase F).

### What I did

- Read the code that Phase A must consolidate:
  - the board harness: SHADOW-CODEGEN `scripts/board/{01-images.mjs,02-build.sh,03-run.sh,bench.c,cold.c,layout.inc}` and SIMD-LAB's `scripts/ray/02-run-board.py` and `board/` CMake files;
  - RAY-PARITY's `10-stage-board.py`, `11-import-board.py`, `15-score-board-workbench.js`, `16-restore-playable.py` and `17-install-playable.py`;
  - the device library chain and CANDELA-WORLD's `lib/board_health.py`;
  - COMPILE-BUDGET's `05-replays-policy.sh` and the 24 scripts it calls.
- Found that the device library chain is four tickets deep, not three. RAYTRACE's `board_common.py` loads NATIVE-PROMOTION's `common.py`, which loads its serial `Console` class from SNAKE-INTEGRATION's `scripts/device/01-normal-snake.py` (345 lines, also a Snake measurement script).
- Measured the moves. Outside `picocalc-os/`, only 13 tracked files name a `picocalc-os/` subdirectory, and they are in the trace REPL, AGENTS.md and `.gitignore`. Inside, the firmware directories (`nucleus`, `sdk`, `natives`, `host`, `sim`, `third_party`, `port`) mostly reference each other, and about 90 files reference the directories that leave (`compiler`, `worlds`, `js*`, `scripts*`, `tools`, `tests`).
- Started two background agents:
  - Phase B2 (the Candela generators, in its own worktree, without device access). Its diary is `reference/02-phase-b2-candela-generators-diary.md`.
  - A read-only digest of the project's history for the vault report.
- Phase F:
  - `git rm -r --cached` the three `out*` trees (143 files; the files stay on disk);
  - ignored `picocalc-os/out*/`, `__pycache__/`, `.docmgr-operations/`, `.playwright-mcp/`, `.claude/worktrees/` and `.claude/settings.local.json`;
  - removed the empty `handoffs/typed-selfhost/` and `handoffs/` with a Python `os.rmdir` after checking that each was an empty, non-symlinked directory.

### Why

- **The firmware move is a rename.** Renaming `picocalc-os/` to `firmware/` as a whole keeps every firmware-internal relative path valid. Only the directories that leave need their references rewritten.
- **The order.** The host gates and the playable record come first, so that the moves can be checked against them. B2 runs in parallel and must be merged before the firmware moves.

### What worked

- Nothing outside the tests and the Makefile reads `out*/`, so untracking it needed no other change.

### What didn't work

- My first attempt to list the replay scripts' dependencies used zsh word splitting (`set -- $spec`). zsh does not split unquoted variables, and the loop received one word. I redid it as a Python scan.

### What I learned

- The board harness depends on files from three tickets:
  - SHADOW-CODEGEN's `validation/holdout.mjs`, which supplies the Chess fixtures and an independent evaluation; it reads the Chess source at the fixed revision `57b2d9f` through `git show`;
  - SIMD-LAB's `various/director/frame-fixtures.json`, the twelve frame fixtures;
  - SIMD-LAB's `board/` CMake and sdkconfig files.

### What was tricky to build

- Keeping Phase F free of side effects. `git rm --cached` removes the files from the index without deleting the captures someone may still look at.

### What warrants a second pair of eyes

- `.claude/` is only partly ignored (worktrees and local settings), so a shared `.claude/settings.json` could still be committed later.

### What should be done in the future

- Phase I commits the five untracked ticket READMEs that the new ignore rules now reveal.

### Code review instructions

- `git show 3b809dd --stat`. Then `git status` should show only ticket READMEs as untracked.

### Technical details

- Base for the migration: `889a9b2`.

## Step 5: Phase A, the host gates in bench/

This step moved the three gates that every compiler change runs out of five tickets and into `bench/host`: the opening ray frame, the Chess engine oracle and the 24 host replays. All three now take one parameter, the compile options. The emulator and its C runtime got one home, `bench/emu`, and the reference data went to `bench/reference`. Every gate reproduced its recorded result through the promoted code, under both the compiler defaults and the kernel policy.

### Prompt Context

**User prompt (verbatim):** see Step 4.

**Assistant interpretation:** Implement Phase A's host part (design Sections 4.2 and 5.2) without moving any source the firmware builds.

**Inferred user intent:** One harness instead of copies.

**Commit (code):** `9ec448b`.

### What I did

- **The shared library.** Wrote `bench/lib/repo.mjs` (the repository root) and `bench/lib/compiler.mjs`. The loader imports the five compiler files as ESM, in the firmware's bundle order. When `TYPED_RV32_OPTIONS` is set, it installs a `globalThis.typedRv32` setter before `typed-rv32.js` runs. The setter wraps `compile`, so every caller sees the defaults, including `typed-world.js` when it links a world.
- **The promotion (`scripts/01-promote-host-gates.py`).**
  - Copied 16 replay files to `bench/host/replays/` under descriptive names, each with a provenance line.
  - Collapsed each script's `../../../../../../picocalc-os/compiler/typed-*.js` imports into one import of `../../lib/compiler.mjs`.
  - Copied the Chess oracle with TYPED-CHESS's runner and positions.
  - `git mv`'d `tools/typed-ray-profile.mjs` to `bench/host/ray-profile.mjs`. `--policy` now accepts any policy name; before, `--policy kernel` silently compiled with the defaults, because only `stock` and `default` were in its table.
  - Moved `OPENING_DIGEST` to `bench/reference/ray-opening.json`.
  - `git mv`'d `cji/tools/rv32/emu.c` to `bench/emu/`.
- **Two fix-up scripts.** `scripts/02-emulator-runtime.py` and `scripts/03-replay-drivers.py`, for the failures below.
- **The runners.** `bench/emu/Makefile` builds `rv32emu` and the three runtime objects. `bench/lib/toolchain.sh` finds the GCC and the emulator. `bench/host/replays/run.sh [--options JSON]` runs the replays, and `bench/host/gates.sh [--options JSON]` runs all three gates.

### Why

- **Copies differed only in their options.** The copies across tickets differed only in how the options reached the compiler: an environment variable in one, a patched `typed-rv32.js` swapped in by an import hook in another. One environment variable, applied at the compiler's definition, covers both.

### What worked

- **Ray profile.** Kernel 3,239,635 and default 4,888,369 executed instructions, both with output `430f0d50…`, the same as RAY-PARITY Step 21.
- **Chess oracle.** 6,981 words with GCC 14.2, under the defaults (128,152,624 engine instructions, 21,716 B) and the kernel policy (118,361,847, 19,892 B).
- **Replays.** 24/24 under the defaults and 24/24 under `{"policy":"kernel"}`, about 35 s each.

### What didn't work

1. **Missed imports.** The first replay run gave 5/24. Three scripts also import `worlds/*/compile.js` through six-level relative paths: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/manuel/picocalc-os/worlds/files/compile.js'`. My regular expression had only handled the compiler imports.
2. **The emulator was not standalone.** The scripts link against objects next to the emulator: `riscv32-esp-elf-gcc: error: .../bench/emu/build/libc.o: No such file or directory`. Those objects are the emulator's C runtime, built by cji's Makefile from `cji/tools/rv32/fw/`. Moving `libc.c`, `hostcalls.S`, `softfloat.c` and `include/` to `bench/emu/fw/` fixed it. cji's Makefile (six paths) and `nw-test.sh` now name them there.
3. **The wrong GCC.** The second run gave 21/24 after `cc1: error: -march=rv32imafc_zicsr_zifencei: unsupported ISA substring '_zicsr_zifencei'`. My discovery had picked `esp-2021r2-patch5-8.4.0` over `esp-14.2.0_20260121`, because `sort | tail -1` orders `2021…` after `14…`. It now picks the highest `-dumpversion`. My first oracle run had used GCC 8.4 too, so it was rerun.
4. **Three more C drivers.** The third run's failures were drivers that 01 had missed (`02-files-rv32-driver.c`, `07-editor-layout-driver.c`, `15-rv32-entry-runner.c`). A grep for `'NN-name.ext'` literals in the promoted scripts found exactly these three.

### What I learned

- `make -C cji build/rv32/fw-test.elf` fails on this machine with `ld.lld: No such file or directory`. That is independent of this move; the replays never needed `fw-test.elf`.

### What was tricky to build

- The options wrapper has to exist before `typed-rv32.js` assigns the global. A wrapper installed afterwards would miss any code that captured the original object while loading.

### What warrants a second pair of eyes

- `bench/host/replays/*.mjs` are copies of ticket scripts, not refactors: they keep their own structure and cwd-relative `picocalc-os/…` paths. Making them into one module is possible later; the gate is that they reproduce.

### What should be done in the future

- The board half of Phase A, after Phase B gives it a playable record to restore.

### Code review instructions

- Read `bench/lib/compiler.mjs`, then run `bench/host/gates.sh --options '{"policy":"kernel"}'`. It ends with `24/24 workflows passed`.

### Technical details

- Toolchain: `/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc` and `bench/emu/build/rv32emu` (48,176 bytes).

## Step 6: Phase B (PLAYABLE.json, profiles, the store) and the board half of Phase A

This step gave the device state one record and the board one harness. `picocalc-os/PLAYABLE.json` names the build the PicoCalc is left on, and `~/.cache/picocalc/firmware/<sha>/` holds its files. `bench/board/device.py` replaces the importlib chain across five tickets. `port/esp32p4/build.sh PROFILE` replaces `build-smooth-chess.sh`, and every profile now builds reproducibly. The harness reproduced RAY-PARITY's board run 15 within run-to-run noise, then restored the playable image with every world healthy.

### Prompt Context

**User prompt (verbatim):** see Step 4.

**Assistant interpretation:** Phase B (design Section 5.3), then the board gate of Phase A (Sections 5.1 and 5.2).

**Inferred user intent:** No more `/tmp` restore pointers and no more copied device code. One command restores the handheld.

**Commits (code):**
- `d338f4a`: PLAYABLE.json, profiles, store, device library, Makefile.
- `e8ccbb1`: return cji's runtime.
- `45649b7`: board harness and the revision-aware `compiler.at`.

### What I did

- **The device library and the store.** Wrote `bench/board/device.py`:
  - `Console` (from SNAKE-INTEGRATION), `esp` and `hold` (NATIVE-PROMOTION), `settle` and `install` (RAY-PARITY 16/17);
  - health with `peripherals="on"` or `"off-by-user"` (CANDELA-WORLD);
  - `run_app`, the SIMD-LAB `02-run-board.py` flow.

  `bench/board/playable.py` handles status, store, install and restore.
- **Seeding the record.** Seeded `PLAYABLE.json` from the image already on the board, with `install --health-only --profile playable --commit a396d3b`. That image is 28d9a812…, the gallery build. Health passed with the peripherals on: all eight worlds and the I2C keyboard probe.
- **Profiles.** `profiles/{playable,candela-world,offline,agent,agent-elf}.env` feed `build.sh`, which writes `picocalc-build.json` into the build directory.
  - The agent profiles start from their tracked full `sdkconfig.agent*`, copied into the build directory, instead of writing into the source tree.
  - `build-smooth-chess.sh` is removed. Its two mentions in CMake error messages now name `profiles/playable.env`.
- **Reproducible builds.**
  - `sdkconfig.reproducible` (`CONFIG_APP_REPRODUCIBLE_BUILD=y`) applies to every profile.
  - The P4 `CMakeLists.txt` adds `-fmacro-prefix-map` and `-fdebug-prefix-map` for the repository root and the build directory. ESP-IDF maps only its own tree and the project directory, but the firmware compiles `nucleus/`, `third_party/` and generated bundles from outside both.
- **The root Makefile.** Targets: `test-host`, `firmware PROFILE=`, `playable`, `install-playable`, `restore-playable`.
- **The board harness.** `bench/board/{stage.mjs,build.sh,run.py,rows.py,score.js}` and `bench/board/app/`.
  - `scripts/05-promote-board-harness.py` promoted the app: `bench.c`, `cold.c` and `layout.inc` from SHADOW-CODEGEN; the CMake project and `sdkconfig.defaults` from SIMD-LAB; `holdout.mjs` as `chess-holdout.mjs`.
  - RAY-PARITY's two copy-time patches are now parameters. `cold_inputs.h` carries each mode's whole compile expression as data (`cells[]`), so `cold.c` has no fixed buffer. `"internalWorkLast"` in the study defines `INTERNAL_WORK_LAST`.
- **The study file.** `bench/board/studies/ray-parity-run15-reuse-args.json` holds run 15's two modes, copied from `88-board-modes-reuse.json`, with pins for both ray images.

### Why

- **Restores from the store.** A board study must restore an image whose files exist. Each earlier ticket restored from a `/tmp` build tree named in a pointer file, and those trees disappear.
- **One digest per commit.** Reproducible images make "the playable build of commit X" one digest, which a second machine can check.

### What worked

- **The playable build** at `e8ccbb1` took 11 min 16 s. It produced app `bab5c48afbf6051a8b4bbba0741e777203d8ea3f25987fef2056adeb2d106d2e`, partition table `72721dc3…` (unchanged), and no `/home/manuel` or `/tmp/picocalc` string in the image. The version is the fixed `picocalc-p4-smooth-chess-202611`, with an empty time and date.
- **The probe.** `run.py --probe` held the firmware and verified the board's app slot and partition table against the store, then checked health: `probe ok: the board runs the recorded playable image 28d9a8124187 and is healthy (on)` (`various/02-probe`).
- **Staging.** `stage.mjs` on the run 15 study reproduces run 15's images exactly: ray `8eaa4060…` (11,632 B) and `4323938e…` (11,544 B), Chess `e056eeb5…` twice. The app built in 3 min 28 s.
- **The board run.** It took 4 min 36 s. `rows.py` counts matched exactly: pred 480, frame 648, chess 72, cold 24 each. `score.js` ran in the trace REPL (`various/05-board-run15-scores.json`):

| | run 15 (RAY-PARITY Step 21) | this run |
|---|---:|---:|
| C frame | 7,733 µs | 7,730.5 µs |
| control frame | 11,164.5 µs | 11,162.5 µs |
| candidate frame | 10,986 µs | 10,996.5 µs |
| paired saving | 1.59 %, 6/6 | 1.49 %, 6/6 |
| Chess, mode 0 vs mode 1 | 0.12 %, 3/6 | 0.01 %, 3/6 |
| ray compile | 2,025,030 → 2,024,388.5 µs | 2,017,128 → 2,018,578.5 µs |

- All 12 scenes won 6/6 again.
- The run restored `28d9a812…` from the store. Health passed with the peripherals on and nothing restarting after settle.

### What didn't work

- **The first playable build broke on Phase A's move.** It failed after 28 s:

  ```
  ninja: error: '/home/manuel/code/wesen/2026-10-20--ds-js-os/cji/tools/rv32/fw/libc.c', needed by 'cji/tool/compiler.elf.z', missing and no known rule to make it
  ```

  Step 5 had moved cji's freestanding C runtime to `bench/emu/fw/`, but the firmware's device-compiler tool links it (`port/esp32p4/compiler/build-tool.sh`), and the P4 CMake lists it. Step 5's reference check had searched only `cji/`. `scripts/04-return-cji-runtime.py` moved the files back, and `bench/emu/Makefile` now builds the replays' three objects from `cji/tools/rv32/fw/`. This differs from the design's Section 4.1 row "`cji/tools/rv32/` (emulator, firmware stubs) → `bench/emu/`": only `emu.c` moved.
- **A wrong dirty flag.** The first `picocalc-build.json` said `"dirty": true`, because `build.sh` checked the tree after the 11-minute build, by which time I had edited Go files. It now records the commit and state before `idf.py` runs.
- **A seed-script slip.** My first `build-smooth-chess.sh` removal script edited the README and then stopped at its assertion: two CMake messages still named the script. The script was rerun after fixing those.

### What I learned

- **Session API.** The trace REPL service has no `/v1/sessions` route. Sessions are opened with `trace-repl open --addr`.
- **Scope of variables in ESP-IDF.** Variables set in the project `CMakeLists.txt` before `project()`, such as `CJI_ROOT`, are visible in `main/CMakeLists.txt`.

### What was tricky to build

- **Ordering in `--probe`.** It has to hold the firmware before `verify_flash`, as `run_app` does. Without the hold, esptool and a running firmware console share the port.

### What warrants a second pair of eyes

- **Unchecked reproducibility.** It is asserted from the prefix maps and the empty time and date fields. A second build of `e8ccbb1` from a separate checkout at another path is running to check it (Step 7).
- **`PLAYABLE.json` still records `28d9a812…`.** The new `bab5c48a…` is stored but not installed. It goes on the device after Phase D's firmware move, as the design requires, together with whatever that move changes.

### What should be done in the future

- **Missing `bench` profile.** The design names one; no such configuration exists in the repository today. The board study app is its own ESP-IDF project (`bench/board/app`).

### Code review instructions

- `python3 bench/board/playable.py status`, then `python3 bench/board/run.py --probe DIR`.
- `node bench/board/stage.mjs bench/board/studies/ray-parity-run15-reuse-args.json DIR` must print the four digests above.

### Technical details

- Evidence: `various/01-seed-playable`, `02-probe`, `03-board-run15-capture` (without `bench.log`, which `04` keeps gzipped), `04-board-run15` and `05-board-run15-scores.json`.

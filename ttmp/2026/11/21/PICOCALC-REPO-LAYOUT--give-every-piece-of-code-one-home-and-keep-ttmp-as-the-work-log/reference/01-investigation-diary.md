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

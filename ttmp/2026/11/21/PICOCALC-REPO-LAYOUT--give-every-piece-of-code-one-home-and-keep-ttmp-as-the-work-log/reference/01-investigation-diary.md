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

# Changelog

## 2026-11-21

- Initial workspace created

## 2026-11-22

Design revised for the 98 commits since 243cc05: Candela vendoring and generators (new Phase B2), the RV32 module split, the trace-REPL workbench and its revision-aware module table, the third replay copy and the /tmp playable pointer; PaperS3 kept, out* are results, .docmgr-operations ignored

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-REPO-LAYOUT--give-every-piece-of-code-one-home-and-keep-ttmp-as-the-work-log/design-doc/01-reorganizing-the-repository-a-design-for-one-home-per-concern.md — Revised design

## 2026-11-22

Decided: cji kept as compiler/cji; the gallery stays a build option that the playable profile turns on. No open layout questions remain.

## 2026-11-22

Phase B2 implemented (67ac952, a995693, 6aaca8e, 7c78312): Candela generators promoted to tools/gen/candela with regenerate.mjs --check (byte-identical at 67ac952); missing generator inputs (render.js, wgsl2glsl.js, 18 gallery presets) vendored and pinned in PIN.json; candela-bc.c and candela-stage.py moved; gallery compositor edits folded into compositor.js and the patch tool deleted. Node 152/152, host CANDELA=1 candela passes, RV32 reference 18/18 frame-0 digests unchanged, playable app e889a8d1 at 7c78312. Device gate left to the supervisor. Found: playable images are not reproducible across builds (compile time and date in the app descriptor).

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/tools/gen/candela/regenerate.mjs — Entry point and --check gate
- /home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-REPO-LAYOUT--give-every-piece-of-code-one-home-and-keep-ttmp-as-the-work-log/reference/02-phase-b2-candela-generators-diary.md — Phase B2 diary

## 2026-11-22

Phases A-I implemented: bench/ (host gates, board harness reproducing RAY-PARITY run 15), PLAYABLE.json with profiles and a store, compiler/ and apps/ and firmware/ moves, make test, docs/, AGENTS.md, ticket hygiene. Reproducible playable f8f36bd1 (f2e67ee) installed; gallery 18/18 digests on the device.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/Makefile — the repository's entry points
- /home/manuel/code/wesen/2026-10-20--ds-js-os/bench/README.md — measurement infrastructure
- /home/manuel/code/wesen/2026-10-20--ds-js-os/firmware/PLAYABLE.json — the installed playable firmware

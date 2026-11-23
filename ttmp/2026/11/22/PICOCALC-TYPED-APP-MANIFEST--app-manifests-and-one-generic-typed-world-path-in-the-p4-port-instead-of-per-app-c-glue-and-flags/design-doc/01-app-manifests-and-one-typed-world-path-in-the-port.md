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

---
Title: A declared RV32 pass pipeline and the backend as modules
Ticket: PICOCALC-TYPED-PIPELINE
Status: active
Topics:
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Turn the RV32 backend's lower() closure into a declared pipeline of passes, policies into pass lists, add per-pass timers, load pass groups lazily, and make rv32/ sources ES modules bundled for QuickJS."
LastUpdated: 2026-11-22T19:30:04.557651424-05:00
WhatFor: ""
WhenToUse: ""
---

# A declared RV32 pass pipeline and the backend as modules

## Problem

`compiler/typed/rv32/70-compile.js` `compile()` contains `lower(fn)`, a ~150-line closure that runs the passes in a fixed order under flags: `options.select.{commute, conjunctions, sets, rotate, facts, version, hoist, induction}`, `options.operandLocations.split`, `options.inline`, `options.inlineGuardedReturns`, `options.pieLoops`, with `observe(phase)` calls placed by hand. Policies (`60-policies.js`) are bundles of those flags. There are no per-pass timers, which COMPILE-BUDGET and the RAY-PARITY reports name as missing. The thirteen `rv32/*.js` files are concatenated in file-name order into one IIFE; dependencies are implicit, and every policy loads every pass (boot apps on `interactive` carry the `kernel` passes; peak heap follows bundle size, 19 KB → 150 KB).

Long files: `10-function-code.js` (659), `30-version-loops.js` (520), `70-compile.js` (267, the driver).

## Design

1. **Pass registry.** Each pass is `{name, group, needs, run(fn, ctx) → changed}`; `ctx` holds callables, targets, arity, storeless, facts, and per-function scratch. The pipeline runs a list of pass names; the observe hook and a timer wrap every pass generically. The leaf path, the planner and emission are the final stages.
2. **Policies as data.** A policy is a list of passes plus parameters (`{passes: ["inline", "commute", …], operandLocations: {...}}`). `resolveOptions` keeps accepting explicit overrides so studies can still toggle one pass.
3. **Timers.** `options.timing = []` receives `{fn, pass, ms, cells}`; `bench/host` gets a script that prints per-pass totals for Editor, Agenda, Files, Chess and the ray tracer, so later work (shared analyses, finding E) is decided by numbers.
4. **Modules and lazy groups.** `rv32/` becomes directories of ES modules with explicit imports:

   ```
   rv32/encoding/   registers, encoders, immediates, division magic
   rv32/emit/       function-code (split: stack, homes, addresses, branches, calls, prologue), leaf-code, guarded-return
   rv32/passes/     inline, commute, conjunctions, rotate, version-loops, hoist, induction, split-locals, value-sets
   rv32/analysis/   ranges, division facts, storeless
   rv32/plan/       planLocations, saved homes
   rv32/policy.js   policies as pass lists
   rv32/compile.js  the pipeline driver, layout, relocations
   rv32/link.js     linkSlot
   ```

   `build.mjs` becomes a small bundler (no new dependencies) producing `typed-rv32.js` (the core and the passes `interactive` needs) and `typed-rv32-kernel.js` (passes only `default`/`kernel`/`balanced` need), each a plain script for QuickJS; `--check` stays in `make test-generated`. The P4 port loads the second file only when a compile's policy needs it (`typed_p4.c`, the bundle list in `firmware/port/esp32p4/main/CMakeLists.txt`, the compiler bytecode cache). Decide the split from measured sizes; if lazy loading does not pay, record that and keep one bundle.

## Gates

- Byte-identical images under every policy and 24/24 replays (this is a refactor).
- Per-pass timing table for the five workloads in the diary.
- Board: one paired study of boot compile time and compiler peak heap for Agenda, Editor, Files and Chess, before and after (the COMPILE-BUDGET rule: every boot app within 75 % of its deadline). This ticket builds experiment images and restores the playable one; it does not install a playable firmware.

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

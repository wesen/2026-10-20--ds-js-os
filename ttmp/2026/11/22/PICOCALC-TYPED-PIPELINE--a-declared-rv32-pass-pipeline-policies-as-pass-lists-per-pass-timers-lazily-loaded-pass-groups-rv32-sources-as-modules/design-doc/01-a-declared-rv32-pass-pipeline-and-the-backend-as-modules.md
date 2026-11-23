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

## Refinements (2026-11-22)

Checked against the code at `bf30d31` and changed while implementing (diary steps 1-6):

- **Pass list.** The tape passes are `inline, commute, conjunctions, sets, rotate, ranges, version, hoist, induction,
  split, facts`, in that fixed order (`rv32/passes/registry.js`). `hoist` and `induction` are options of `version`
  (`kind: "option"`, no stage of their own); `ranges` and `facts` are analyses (the old `select.facts` was both).
  `version` needs `rotate`, `facts` needs `ranges`. `select` keeps only the emitter's switches (`immediates`,
  `divisions`, `branches`, `results`, `leafParams`, `shortBranches`, `loadHomes`) and `operandLocations` only the
  planner's; `split` is a pass. The emitter's one dependency on a pass (`select.version` in `FunctionCode.step`)
  became `emitter.versioned`.
- **Not tape passes.** The guarded-return summary (`inlineGuardedReturns`), the PIE lowering (`pieLoops`) and the
  `"inline"` observeTape checkpoint (observed even without inlining, as before) stay stages driven by options,
  between `inline` and the rest, so every observed tape is unchanged.
- **Overrides.** `passes` replaces the list; `enable`/`disable` edit it by name (an added pass takes its pipeline
  position). A `select` or `operandLocations` key that is now a pass, or a boolean `inline`, is refused with a message
  naming the pass. No compatibility layer (the run-15 study JSON and the tests were rewritten).
- **Pass hooks.** A pass has `setup(unit)` (per compile: the inliner's limits and library), `start` (hoist's
  storeless answer, on the untransformed tape), `run`, and `finish` (the inliner's library candidate after
  emission, timed as `candidate`).
- **Timers.** `options.timing` rows are `{fn, pass, ms, cells}` per stage, including `leaf`, `plan`, `emit`; one
  `{fn: null, pass: "compile"}` row; `options.clock` overrides the clock (tests use a counter).
- **Modules and bundles.** Layout as designed, plus `index.js` (core entry), `emit/mixin.js` (FunctionCode's six
  method groups, mixed into one flat prototype), `analysis/storeless.js`, `passes/inline-group.js` and
  `passes/loops-group.js`. `10-function-code.js` became `emit/function-code.js` (232 lines) and six method files;
  `30-version-loops.js` became `passes/version-loops.js` and `passes/hoist.js`. The bundler scope-hoists each bundle
  (a function scope per module made the QuickJS bytecode 48 % larger).
- **Lazy groups: two, not one.** `typed-rv32.js` (core), `typed-rv32-inline.js` (`inline`, `commute`, `rotate`:
  what `balanced` adds) and `typed-rv32-loops.js` (the rest). The compiler asks for a missing group through
  `globalThis.typedRv32Load(file)`; `typed_p4.c` defines it over its bytecode cache, so the firmware decides nothing
  by policy name and an explicit override loads what it needs. Host loaders load all three.
- **Tests.** `tests/compiler/typed-rv32.test.mjs` was split (four files and `rv32-helpers.mjs`) to drop its
  file-length exception.

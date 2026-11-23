---
Title: Diary
Ticket: PICOCALC-TYPED-PIPELINE
Status: active
Topics:
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: compiler/typed/rv32/compile.js
      Note: the pipeline driver
    - Path: compiler/typed/rv32/passes/registry.js
      Note: the pass table, groups and typedRv32Load
    - Path: compiler/typed/rv32/policy.js
      Note: policies as pass lists
    - Path: compiler/typed/rv32/build.mjs
      Note: the scope-hoisting bundler
    - Path: firmware/port/esp32p4/main/typed_p4.c
      Note: typedRv32Load over the bytecode cache
ExternalSources: []
Summary: "Per-pass timers, a declared pass registry, policies as pass lists, rv32/ as ES modules bundled into a core and two lazily loaded pass groups; byte-identical output; a paired board study of boot compiles."
LastUpdated: 2026-11-22T23:00:00-05:00
WhatFor: "What was done in PICOCALC-TYPED-PIPELINE, with the evidence"
WhenToUse: "Reviewing or continuing the RV32 pipeline work"
---

# Diary

## Step 1: Per-pass timers on the old lower(), and the timing table

I read the design, the program's rules, `docs/typed-compiler.md`, `rv32/README.md`, `docs/measuring.md`, the TAPE
diary and the COMPILE-BUDGET diary, then added timers to the unchanged `lower()` closure before any restructuring, so
the first table measures the old code. A digest harness confirmed the timers change nothing.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-TYPED-PIPELINE — turn the RV32 backend's lower() closure
(compiler/typed/rv32/70-compile.js) into a declared pass pipeline; policies become pass lists; per-pass timers; lazily
loaded pass groups if they pay; rv32/ sources become ES modules in directories (encoding/, emit/, passes/, analysis/,
plan/, policy, compile, link), bundled by build.mjs into plain scripts for QuickJS; split 10-function-code.js (659) and
30-version-loops.js (520)." Work plan (coordinator): verify the design, append Refinements; diary; order (1) per-pass
timers and a per-pass table for Editor, Agenda, Files, Chess and the ray tracer on Node and bare QuickJS, (2) the pass
registry and policies as pass lists, (3) modules + bundler, (4) lazy pass groups decided from bundle sizes and compile
cost, updating every loader; gates: byte-identical images under every policy, 24/24 replays, `make test`, `make
test-host` default and kernel; a paired board study of boot compile time and compiler peak heap, restoring the
playable image; no compatibility; moves via checked scripts; commit with the trailer, never push or merge into main.
Later coordinator notes: merge main (SPLIT-FILES, then APP-MANIFEST and FRONTEND), remove the file-length entries of
the split files, wire the group files through `TYPED_COMPILER`, restore the playable image from the main checkout.
**Assistant interpretation:** a refactor with no output change, plus a measured decision on lazy loading.
**Inferred user intent:** numbers per pass for later compiler work, and a backend whose structure matches its passes.
**Commit (code):** `f95fe3f` — "feat(rv32): per-pass timers (options.timing, options.clock)"

### What I did
- `git merge --ff-only main` (to `bf30d31`).
- `options.timing` (an array of `{fn, pass, ms, cells}`, one `{fn: null, pass: "compile"}` row) and `options.clock`.
- `scripts/units.mjs` (the twelve compile units of `typed-tape.test.mjs`), `scripts/01-digests.mjs` and
  `02-compare-digests.sh` (image, entries and every observeTape tape under stock, interactive, balanced, default,
  kernel, kernel + PIE, default buffered: 84 digests), `scripts/03-pass-timing.mjs` (Node),
  `scripts/04-qjs-pass-timing.c` + `pass-totals.js` + `05-qjs-pass-table.py` (bare QuickJS with a microsecond
  `performance.now`, a tracking allocator for load and peak bytes, and the device's bytecode cache: the first round
  parses and is dropped).

### Why
- The table was asked for on the code as it was; timers first also made the later refactors' timing rows comparable.

### What worked
- `02-compare-digests.sh` against `bf30d31`: `IDENTICAL 84 of 84`.
- Host Node, median of 7 compiles after 2 warm-ups, ms (Node JIT; the frontend is the remainder of the call):

| Workload, policy | frontend | storeless | inline | guarded | commute | conjunctions | sets | rotate | ranges | version | split | facts | leaf | plan | emit | candidate | compile |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| agenda, interactive | 3.2 |  |  | 0.0 |  |  |  |  |  |  |  |  | 0.1 | 1.2 | 1.6 |  | 6.0 |
| editor, interactive | 16.0 |  |  | 0.1 |  |  |  |  |  |  |  |  | 0.2 | 4.2 | 4.8 |  | 25.3 |
| files, default | 0.8 |  | 0.2 | 0.0 | 0.1 |  |  | 0.1 |  | 0.4 | 0.1 |  | 0.1 | 1.2 | 1.2 | 0.0 | 4.5 |
| playableChess, balanced | 7.3 |  | 3.0 | 0.0 | 0.7 |  |  | 0.5 |  |  |  |  | 0.4 | 8.1 | 6.0 | 0.2 | 25.6 |
| ray, kernel | 2.7 | 0.1 | 0.7 | 0.0 | 0.3 | 0.1 | 1.0 | 0.2 | 1.7 | 3.7 | 0.6 | 0.4 | 0.1 | 6.2 | 3.5 | 0.1 | 22.3 |
| agenda, kernel | 3.5 | 0.1 | 1.4 | 0.0 | 0.5 | 0.6 | 0.4 | 0.4 | 3.3 | 2.0 | 0.5 | 0.5 | 0.1 | 6.8 | 6.3 | 0.1 | 26.2 |
| editor, kernel | 19.5 | 0.3 | 4.7 | 0.1 | 1.4 | 1.5 | 1.1 | 1.1 | 1.7 | 4.0 | 1.5 | 0.3 | 0.3 | 16.2 | 13.5 | 0.3 | 73.9 |
| files, kernel | 0.8 | 0.0 | 0.1 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 | 0.6 | 0.1 |  | 0.1 | 1.5 | 1.1 | 0.0 | 4.9 |
| playableChess, kernel | 9.5 | 0.2 | 3.3 | 0.0 | 0.9 | 0.5 | 1.1 | 0.5 | 4.8 | 3.5 | 0.8 | 0.8 | 0.4 | 9.2 | 8.5 | 0.2 | 44.4 |

- Bare QuickJS (the P4's interpreter on the host), median of 7 runtimes after the parse round, ms; load is reading
  the cached bytecode; KB are the runtime's bytes after loading and at its peak (64-bit host, about 1.7x the P4's).
  Taken at the end of the ticket (same pass code, quieter host than step 1's first run):

| Workload, policy | load | frontend | storeless | inline | guarded | commute | conjunctions | sets | rotate | ranges | version | split | facts | leaf | plan | emit | candidate | compile | load KB | peak KB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| agenda, interactive | 1.1 | 6.3 |  |  | 0.0 |  |  |  |  |  |  |  |  | 0.2 | 1.5 | 4.5 |  | 12.5 | 1100 | 1504 |
| editor, interactive | 1.0 | 35.3 |  |  | 0.1 |  |  |  |  |  |  |  |  | 0.3 | 6.5 | 18.3 |  | 60.4 | 1100 | 3250 |
| files, default | 1.0 | 1.2 |  | 0.3 | 0.0 | 0.3 |  |  | 0.2 |  | 0.9 | 0.4 |  | 0.1 | 1.1 | 1.7 | 0.1 | 6.3 | 1100 | 1381 |
| playableChess, balanced | 1.0 | 20.3 |  | 8.2 | 0.1 | 3.3 |  |  | 2.4 |  |  |  |  | 0.7 | 12.3 | 20.5 | 1.3 | 69.4 | 1100 | 3907 |
| ray, kernel | 1.1 | 4.5 | 0.1 | 1.4 | 0.0 | 0.9 | 0.5 | 2.0 | 0.7 | 2.4 | 7.7 | 1.9 | 0.6 | 0.1 | 7.2 | 5.9 | 0.5 | 36.3 | 1100 | 2193 |
| agenda, kernel | 1.0 | 7.3 | 0.3 | 3.8 | 0.0 | 2.1 | 3.5 | 1.6 | 1.8 | 7.5 | 6.5 | 2.5 | 1.3 | 0.2 | 7.7 | 14.9 | 0.7 | 62.2 | 1100 | 2828 |
| editor, kernel | 1.1 | 38.8 | 0.5 | 11.1 | 0.1 | 6.4 | 9.5 | 4.9 | 5.0 | 5.7 | 20.7 | 8.3 | 0.9 | 0.3 | 25.6 | 33.2 | 1.6 | 172.7 | 1100 | 6630 |
| files, kernel | 1.0 | 1.2 | 0.1 | 0.3 | 0.0 | 0.3 | 0.3 | 0.2 | 0.2 | 0.1 | 1.2 | 0.4 | 0.0 | 0.1 | 1.1 | 1.7 | 0.1 | 7.3 | 1100 | 1397 |
| playableChess, kernel | 1.1 | 21.5 | 0.4 | 8.2 | 0.1 | 3.4 | 2.7 | 3.6 | 2.4 | 11.1 | 13.2 | 4.3 | 2.2 | 0.8 | 14.0 | 22.7 | 1.3 | 111.4 | 1100 | 4690 |

### What didn't work
- A `node:vm` realm has no `performance`; the first Node table had 1 ms resolution. `units.mjs` now passes
  `performance` into the realm.
- `04-qjs-pass-timing.c` first used a five-member `JSMallocFunctions` initializer; this QuickJS has four members
  (`js_malloc`, `js_free`, `js_realloc`, `js_malloc_usable_size`). Fixed.
- The bash tool refused compound commands mixing `git` with pipes and loops ("this command is too complex to verify
  that it stays inside the worktree"); scratch scripts and separate `git` calls instead.

### What I learned
- At boot the tape passes are a small share of a compile: frontend, `plan` and `emit` dominate every workload. Under
  `kernel` the passes cost about 40 % of Editor's compile (`version` 21 ms, `inline` 11 ms, `conjunctions` 9.5 ms in
  QuickJS) and `ranges` is the most expensive analysis on Agenda and Chess. `interactive` runs no tape pass.
- The serialized bytecode of `typed-rv32.js` is 474 KB, the largest compiler source.

### What was tricky to build
- Timing `inline` and its library candidate separately; the candidate step became the pass's `finish` in step 2.

### What warrants a second pair of eyes
- The QuickJS table is host time; the P4 runs about 30x slower. Shares between passes carry over, absolute values do not.

### What should be done in the future
- Shared analyses (finding E) can now be decided by these rows; `ranges` + `facts` and `version`'s own loop walk are
  the candidates.

### Code review instructions
- `git show f95fe3f`; `scripts/02-compare-digests.sh BASE SCRATCH` with `BASE` from `git archive bf30d31 compiler/typed`.

### Technical details
- `cc -O2 -w -DCONFIG_VERSION='"2026-06-04"' -I firmware/third_party/quickjs -o qjs-pass-timing scripts/04-qjs-pass-timing.c firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread`
- `node scripts/03-pass-timing.mjs --write-sources DIR FILE...`, `python3 scripts/05-qjs-pass-table.py --harness BIN --sources DIR [--rv32 FILES] compiler/typed`.

## Step 2: A declared pass pipeline; policies as pass lists

`lower()` now runs a list of stages built from a registry (first `65-passes.js`, later `passes/registry.js`); a policy
is `{passes, inlineGuardedReturns, operandLocations, select}`. Images and every observed tape are unchanged.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** policies become data, the pass order is declared once.
**Inferred user intent:** studies toggle a pass by name; the driver stops being a list of flags.
**Commit (code):** `0db9bb4` — "feat(rv32): a declared pass pipeline; policies are pass lists"

### What I did
- Registry order `inline, commute, conjunctions, sets, rotate, ranges, version, hoist, induction, split, facts`;
  `needs` (version → rotate, hoist/induction → version, facts → ranges); kinds transform / analysis / option.
- `resolveOptions`: `passes` replaces, `enable`/`disable` edit by name; a `select`/`operandLocations` key that is now a
  pass and a boolean `inline` are refused. Emitter flag `versioned` replaces `select.version`.
- Rewrote the tests' option objects as pass lists, each translated to the exact old semantics (for example
  `{select: {..., commute, rotate, shortBranches}}` on the default policy meant passes `inline, commute, rotate, split`),
  and `bench/board/studies/ray-parity-run15-reuse-args.json`; trace-REPL docs.
- A new test: pass-list edits, refusals and the timing rows (with a counting clock).

### Why
- The old `select` mixed tape passes with emitter switches; separating them makes each policy readable as a list.

### What worked
- 84 of 84 digests identical; every pinned digest in `tests/compiler` holds; the run-15 study's two pins hold.

### What didn't work
- First run: `TypeError: Cannot read properties of null (reading 'get')` in `rangeOf`: `localRanges` returns null when
  it cannot model a tape, and the old code skipped `divisionFacts` then. The `facts` stage checks `ctx.ranges`.
- The new timing test first expected the `compile` row to be 1 ms with the counting clock; it brackets every stage
  (`2·(rows-1)+1`).

### What I learned
- `observe("inline")` fired even without inlining and after the PIE stage; tools see it as the tape entering the
  passes. Kept as an explicit checkpoint stage.

### What was tricky to build
- Order inside the old closure: `storeless` of the current function is computed before any pass rewrites its tape
  (hoist's `start` hook); the guarded-return summary and PIE run after `inline` and before the checkpoint.

### What warrants a second pair of eyes
- The translation of each old test option object (diff of `tests/compiler/typed-rv32*.test.mjs` in `0db9bb4`).

### What should be done in the future
- N/A.

### Code review instructions
- `git show 0db9bb4 -- compiler/typed/rv32/60-policies.js compiler/typed/rv32/65-passes.js compiler/typed/rv32/70-compile.js`.

### Technical details
- `{policy: "kernel", disable: ["sets"]}`, `{policy: "balanced", enable: ["version", "split"]}` (= default).

## Step 3: rv32/ as ES modules in directories, and a bundler

`scripts/06-split-into-modules.py` moved every line of the numbered files into 26 modules (asserting each line lands
once and that only blank separators and one duplicated header are dropped), computed each module's imports from the
identifiers it uses, and deleted the numbered files. `build.mjs` became a dependency-free bundler.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** explicit imports, one concern per file, the long files split.
**Inferred user intent:** a backend a reader can navigate, and module boundaries that can become bundle boundaries.
**Commit (code):** `6c55557` — "refactor(rv32): ES modules in directories, bundled into a core and two pass groups"; `211383b` — "build(rv32): scope-hoist each bundle"

### What I did
- Layout: `encoding/{tape,registers,selection,division}.js`, `emit/{function-code,stack,homes,addresses,branches,
  arithmetic,calls,mixin,leaf-code,guarded-return,inspection}.js`, `passes/{registry,inline,commute,conjunctions,
  rotate,version-loops,hoist,split-locals,value-sets,inline-group,loops-group}.js`, `analysis/{ranges,storeless}.js`,
  `plan/{locations,saved-homes}.js`, `policy.js`, `compile.js`, `link.js`, `index.js`, `package.json` (`"type":
  "module"`). Longest module 370 lines (`value-sets.js`); `function-code.js` 232.
- FunctionCode's methods: six method-group classes mixed onto one flat prototype (`emit/mixin.js`; a name defined
  twice is an error). `SHORT_BRANCH_RANGE` moved to `branches.js`, which broke the old 10 ↔ 11 file cycle.
- Bundler: imports `import {a, b} from "./x.js"`, `export` before top-level function/class/const (with destructuring
  and multi-declarator consts), cycles refused, imports of unexported names refused. First version gave each module a
  function scope; `211383b` scope-hoists each bundle (all top-level names unique, checked), the core publishes the names
  the groups import (`globalThis.typedRv32Modules`) and each group destructures them.
- Tests: the core alone, a lazily loading realm, the unbundled ES modules compiling every policy like the bundles,
  and the bundle check for all three files.

### Why
- Per-module scopes were 48 % more QuickJS bytecode (core 367 KB against 260 KB hoisted, all three 701 KB against
  474 KB for the old bundle); on the device this is PSRAM for the cache and `JS_ReadObject` time every compile.
  Hoisted: 261 + 45 + 196 KB.

### What worked
- 84 of 84 digests identical after the move, after the bundler, and after hoisting.

### What didn't work
- The import scan first missed `...ALU.keys()` (a spread read as a property access); the lookbehind now admits `...`.
- The first move left `SHORT_BRANCH_RANGE`, `lowerLeaf` and other names used only by the hand-written `compile.js`
  unexported; a checked edit added `export`.
- `Error: the RV32 pass inline needs typed-rv32-inline.js; load it after typed-rv32.js` from every loader that read
  only `typed-rv32.js`, as intended; each loader now lists the three files.
- Cross-realm `assert.deepEqual` on `Uint8Array` failed ("same structure but are not reference-equal"); the tests
  compare digests or `Buffer.compare`.

### What I learned
- QuickJS serializes per-function closure-variable tables; a module wrapper per module multiplies them.

### What was tricky to build
- Scope hoisting needs globally unique top-level names; the move script had already asserted that for the moved code.

### What warrants a second pair of eyes
- In a hoisted bundle a module that forgets an import still finds the name; only the unbundled ES-module test (all
  policies on the ray tracer) catches it.

### What should be done in the future
- PICOCALC-TYPED-FRONTEND's `frontend/build.mjs` and this bundler could become one.

### Code review instructions
- `python3 scripts/06-split-into-modules.py` (dry run on `0db9bb4`); `node compiler/typed/rv32/build.mjs --check`.

### Technical details
- `compiler/typed/rv32/README.md` maps every file.

## Step 4: Lazy pass groups

Two groups, loaded on demand: `typed-rv32-inline.js` (inline, commute, rotate; what `balanced` adds) and
`typed-rv32-loops.js` (the rest). `compile` calls `globalThis.typedRv32Load(file)` for a missing group; `typed_p4.c`
defines it over its bytecode cache.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** split only if the measured sizes and costs pay.
**Inferred user intent:** less heap and evaluation in the boot compiles that run under `interactive`.
**Commit (code):** `9a2e7cd` — "feat(p4): bundle the RV32 pass groups and load them on demand"; `b7cc8a0`; merge `6ea8540`

### What I did
- Measured in bare QuickJS with the cache: realm after loading and peak, host bytes.

| Workload, policy | loads | load KB | peak KB | vs everything loaded |
|---|---|---:|---:|---|
| Agenda, interactive | core | 893 | 1301 | −207 / −203 KB |
| Editor, interactive | core | 893 | 3047 | −207 / −203 KB |
| Chess (playable), balanced | core + inline | 938 | 3734 | −162 / −173 KB |
| Files, default; ray, kernel | all three | 1100 | 1381, 2193 | − |

  One group would have saved Chess nothing; two groups save it about 170 KB.
- `typedRv32Load` in `typed_p4.c` (maps `typed-rv32-X.js` to the bundle path `typed/rv32-X.js`), the cache grown to
  16 entries; after the APP-MANIFEST merge the two files join `TYPED_COMPILER` in `cmake/typed-apps.cmake`. Loaders:
  `bench/lib/compiler.mjs`, `bench/host/ray-profile.mjs`, `bench/board/stage.mjs`, `typed-inspect.mjs` (except with
  `--backend`), every test, and `tracecompiler`'s module table (optional modules `typedRv32Inline`/`typedRv32Loops`
  that the group bundles publish as markers; the 25cd108 revision now misses five files).

### Why
- The hook keeps policy names out of C and lets an override (`enable: ["version"]`) load what it needs.

### What worked
- Board run 2 (Step 5): −149, −157, −122 KB compiler peak for Agenda, Editor, Chess; +34 KB for Files.

### What didn't work
- Merging main conflicted in `main/CMakeLists.txt` and `typed_p4.c` (APP-MANIFEST rewrote both): took main's files and
  re-added `install_rv32_load` and the two `TYPED_COMPILER` entries.

### What I learned
- Files' compile under `default` loads everything and pays the module overhead: in QuickJS +61 KB load, about +50 KB
  peak against the old single bundle (before hoisting; see the board numbers for the hoisted build).

### What was tricky to build
- `bench/lib/compiler.mjs` replaces `globalThis.typedRv32` with a wrapping copy, so the module table cannot live on that
  object; it is its own global.

### What warrants a second pair of eyes
- `rv32_load` returns the pending exception when a group fails to evaluate; check the message reaches the compile log.

### What should be done in the future
- Persist the bytecode cache in flash (COMPILE-BUDGET).

### Code review instructions
- `git show 9a2e7cd`, `git show 6ea8540 -- firmware`.

### Technical details
- Group bytecode on the P4: rv32.js 367,451, rv32-inline.js 64,933, rv32-loops.js 269,019 bytes in the module-scope
  build (step-5 run 1); the hoisted build is in run 2.

## Step 5: Gates and the board

Both host gate sets pass on the merged branch, and two paired board studies measured the boot compiles: the lazy
groups take 122-157 KB off the compiler's peak heap in Agenda, Editor and Chess, and every boot compile stays
inside 75 % of its deadline, but each compile is 15-96 ms slower on the P4 than its control, a cost the host's
instruction counts do not show.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the refactor gates, then a paired study of boot compile time and compiler peak heap.
**Inferred user intent:** evidence that the change fits the boot budgets.
**Commit (code):** `211383b` (gates on the merged state, main `e219349` merged); board images `9a2e7cd` and `211383b`

### What I did
- `GOFLAGS=-modfile=/tmp/picocalc-typed-pipeline-gomod/go.mod make test` (a modfile whose go-go-goja replace is
  absolute; not committed); `make test-host`; `make test-host OPTIONS='{"policy":"kernel"}'`.
- `bash firmware/tools/wasm-toolchain.sh` in the worktree (the replays need it).
- `firmware/port/esp32p4/build.sh playable /tmp/picocalc-typed-pipeline-{playable,control,candidate}` with ESP-IDF 5.4.2.
- `scripts/08-board-boot-compiles.py`: installs control and candidate in alternation (AB, BA, AB) with
  `bench/board/device.install` (the serial lock per install), parses each boot's compile and bytecode-cache lines.
  Run 1: control = the playable image `1f99bf38` (bf30d31, the same compiler as main then), candidate `6822ac03`
  (9a2e7cd, module scopes), peripherals off-by-user. Run 2: control `10695eee` (main e219349, which is the playable
  image 6195cab records), candidate `3edccad7` (211383b, hoisted, merged), peripherals on.
- Restored from the main checkout: `cd /home/manuel/code/wesen/2026-10-20--ds-js-os && make restore-playable
  OUT=/tmp/picocalc-typed-pipeline-restore`: app `10695eee…`, health with peripherals on passed.

### Why
- Run 2 is the result: same merged tree on both sides except this ticket. Run 1 explained the bytecode cost of module
  scopes, which led to `211383b`.

### What worked
- `make test`: 105 node tests, 0 failing; test-generated (both bundlers, the file-length check: 94 over 500 lines,
  all listed); go test all ok; Python suites ok; test-native 34 OK (1 expected failure); cji ok; test-rv32 ok.
- `make test-host`: ray 4,888,369 instructions, 11964 B, `430f0d501659` (reference); Chess 6981 words, 128,152,624
  instructions, 21716 B; replays 24/24. Kernel: ray 3,239,635, 11544 B, `430f0d501659`; Chess 6981 words,
  118,361,847, 19892 B; 24/24.
- Board run 2 (3 blocks; every pair identical module bytes; per-block deltas candidate − control):

| App (policy) | control s | candidate s | paired Δ s | 75 % of deadline | control peak KB | candidate peak KB | Δ KB |
|---|---:|---:|---|---:|---:|---:|---:|
| Agenda (interactive) | 0.700 | 0.715 | +0.015, +0.014, +0.015 | 1.27 | 1177 | 1028 | −149 ×3 |
| Editor (interactive) | 3.219 | 3.237 | +0.017, +0.018, +0.020 | 4.50 | 2972 | 2815 | −157 ×3 |
| Files (default) | 0.447 | 0.471 | +0.024 ×3 | 1.27 | 969 | 1004 | +34 ×3 |
| Chess (balanced) | 3.920 | 4.016 | +0.096 ×3 | 4.50 | 2957 | 2835 | −122 ×3 |
| Candela (kernel, first compile) | 2.263 | 2.342 | +0.077 to +0.080 | | 1608 | 1638 | +29 ×3 |

  Bytecode cache: rv32.js 474,091 B → 260,813 + rv32-inline.js 44,824 + rv32-loops.js 195,486 B.
- Board run 1 (module scopes): the same heap pattern (−138, −139, +44, −115 KB), times +15, +21, +40, +60 ms and
  Candela +182 ms; bytecode 367,451 + 64,933 + 269,019 B. Hoisting cut the first compile's extra from 182 to 79 ms.

- After merging main at `3f867a1` (TYPED-ASYNC-TAPE; merge `312a944`, which also adds the pass groups to the new
  `typed-async.test.mjs`): `make test` 112 node tests, 0 failing, everything else ok; both `make test-host` runs give
  the numbers above; 84 of 84 digests equal `bf30d31`'s.

### What didn't work
- Run 1's health checks failed on the painter (`painter {'sources': 0, 'compiles': 0, 'installed': False, ...}`) in
  every install, control included, with the keyboard bus failing; the compile lines were complete. Per the
  coordinator the keyboard needed a power cycle; run 2 passed health with peripherals on.
- `make test-host` first failed: `/usr/include/stdint.h:26:10: fatal error: 'bits/libc-header-start.h' file not
  found` (no wasm toolchain in the worktree); `wasm-toolchain.sh` fixed it.
- `perf stat` is not permitted (`perf_event_paranoid` 4); callgrind instead.

### What I learned
- The time cost is not interpreter work: callgrind over bare QuickJS (cached rounds) counts 132.35 M against 132.4 M
  instructions per Agenda compile and 809.5 M against 807.5 M (+0.25 %) per Chess compile. On the device a compile
  that loads less heap still runs 15 ms longer. Chess also evaluates rv32-inline.js inside its compile.

### What was tricky to build
- A fair control: `bf30d31`'s playable image for run 1 (its compiler equals main's then), a build of main itself for
  run 2 (`git checkout --detach main` in the worktree, build, back to the branch).

### What warrants a second pair of eyes
- The +0.5-2.4 % device time on every boot compile (Chess 4.016 s is 67 % of its 6 s deadline, 89 % of the 75 % line).
  Candidates: memory placement on the P4 (the heap shrinks, the bytecode cache in PSRAM changes shape), the cost of
  `typedRv32Load` evaluating a group inside the compile, the mixed-in FunctionCode prototype. Not resolved here.

### What should be done in the future
- Find the device-only cost (a board study of one compile with the old and new bundles inside the same firmware).
- Files loads both groups for two passes it needs (`version`, `split`); a third group, or moving `split` (2.5 KB)
  to the core, would cut its +34 KB.

### Code review instructions
- `various/02-board-run-2-hoisted/{summary.txt,rows.json,runs.json}`, run 1 in `various/01-*`, the restore record in
  `various/03-restore/after.json`.

### Technical details
- `python3 scripts/08-board-boot-compiles.py --control DIR --candidate DIR --out OUT --blocks 3 --peripherals on`;
  `--summarize OUT` re-prints the table.

## Step 6: Test split and file-length entries

`scripts/07-split-rv32-tests.py` moved the 24 tests of `typed-rv32.test.mjs` (1,182 lines) unchanged into four files
with a helper module; the file-length exceptions for `10-function-code.js`, `30-version-loops.js` and the test file
are gone, and the generated `typed-rv32-loops.js` is listed.

### Prompt Context
**User prompt (verbatim):** see Step 1 (and the coordinator's SPLIT-FILES note).
**Assistant interpretation:** no file over 500 lines without a reason.
**Inferred user intent:** keep the length check meaningful.
**Commit (code):** `59c1386` — "test(rv32): split typed-rv32.test.mjs into four files and a helper module"

### What I did / What worked
- `typed-rv32.test.mjs` (policies, pipeline, bundles; 152 lines), `-emit` (427), `-loops` (273), `-kernel` (332),
  `rv32-helpers.mjs`; `firmware/Makefile test-apps` runs all four. 24 tests pass.

### What didn't work / What I learned / What was tricky / Second pair of eyes / Future
- N/A.

### Code review instructions
- `python3 scripts/07-split-rv32-tests.py` on `e455042` (dry run).

### Technical details
- N/A.

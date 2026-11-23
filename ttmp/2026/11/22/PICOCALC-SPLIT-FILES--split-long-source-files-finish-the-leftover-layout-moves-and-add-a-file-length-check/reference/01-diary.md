---
Title: Diary
Ticket: PICOCALC-SPLIT-FILES
Status: active
Topics:
    - os
    - testing
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: tools/check-file-length.mjs
      Note: the file-length check (make test-generated)
    - Path: tools/file-length-exceptions.txt
      Note: the files allowed over 500 lines, with reasons
ExternalSources: []
Summary: "Implementation diary of PICOCALC-SPLIT-FILES: the file-length check, the splits, the leftover layout moves."
LastUpdated: 2026-11-22T20:30:00-05:00
WhatFor: "What was split into what, the gates each step ran, the failures met and the firmware digests."
WhenToUse: "Reviewing or rebasing the ticket's branch; looking up why a file is on the exception list."
---

# Diary

## Step 1: Baseline, worktree environment and the coordinator's instructions

I started from the coordinator's worktree branch (`worktree-agent-ab2b9aa96786d3ed0`), fast-forwarded it to `main` at
`4b9a80b` (the branch was at `5c2fb9c`, before the Typed-first tickets existed), read the program design, this
ticket's design and PICOCALC-REPO-LAYOUT's Section 10 and scripts, and ran every gate at the base commit so that later
results have something to be compared with.

### Prompt Context

**User prompt (verbatim):** (the coordinator, abridged to its instructions) "TICKET: PICOCALC-SPLIT-FILES — split the
long source files no other ticket rewrites, finish the layout moves left from PICOCALC-REPO-LAYOUT, and add a
file-length check to make test. [...] Order: (1) the file-length check with its exception list (files other tickets
are splitting listed with the ticket name: typed-wasm.js → TYPED-FRONTEND, typed-async.js → TYPED-ASYNC-TAPE, rv32
sources → TYPED-PIPELINE, bench/emu/emu.c → RV32-CONFORMANCE, apps/typed/agenda/wasm-world.c → AGENDA-TYPED-WORLD,
firmware/port/esp32p4/main/CMakeLists.txt → TYPED-APP-MANIFEST); (2) the splits, one commit per file or small group,
each gated; (3) the leftover moves, with the trace-repl move (cmd/trace-repl + pkg/trace* → tools/trace-repl) as your
LAST commit so it can be rebased easily — keep pkg/tracecompiler's revision-aware path table working [...]. Gates:
make test; make test-host; make -C firmware shots byte-identical (capture before and after); go test ./...; the trace
REPL tests; every firmware profile still builds [...]. After the nucleus split, one probe boot of your playable build
on the handheld as an experiment image using bench/board tooling under the serial lock [...], health-check, then
restore the playable image (make restore-playable). Never write firmware/PLAYABLE.json. [...] for compositor.js, split
late and keep the ray tracer/painter code in one clearly separated file."

**Assistant interpretation:** Add the check first, split the long files the other tickets do not own with checked
scripts and gates per commit, then the leftover moves, the trace REPL move last.

**Inferred user intent:** No file is too long to read in one sitting, the rule is enforced by `make test`, and the
repository layout of PICOCALC-REPO-LAYOUT is finished, without colliding with the parallel tickets.

### What I did

- `git merge --ff-only main` (5c2fb9c → 4b9a80b).
- A gate script in the session's scratch directory runs `make test`, `make test-host` with and without
  `OPTIONS='{"policy":"kernel"}'`, `make -C firmware shots` (recording the SHA-256 of every file the run wrote under
  `firmware/out/`) and `firmware/port/esp32p4/build.sh PROFILE /tmp/picocalc-split-PROFILE` for the five profiles.

### What didn't work

- `make test` at 4b9a80b in the worktree: `go test ./...` failed with
  `pkg/tracerepl/results.go:9:2: github.com/go-go-golems/go-go-goja@v0.10.7: replacement directory ../go-go-golems/go-go-goja does not exist`.
  go.mod's `replace` is relative to the repository, and a worktree lives two directories deeper
  (`.claude/worktrees/NAME`). Recovery: a `go.work` outside the tree (`use` the worktree, `replace` go-go-goja with its
  absolute path), passed as `GOWORK=...` by the gate script. Nothing in the repository changed.
- `make test-host` (and `make test-native`): `fatal error: 'bits/libc-header-start.h' file not found` compiling
  `build/typed-world-reactor.wasm`: the worktree has no `firmware/build/wasm-toolchain`. A symlink to the main
  checkout's copy then failed with
  `wasm-ld-18: error: cannot open .../firmware/build/wasm-toolchain/res/lib/wasi/libclang_rt.builtins-wasm32.a`: the
  main checkout's `res/lib/wasi` link still points into `picocalc-os/build/...`, the firmware tree's name before
  PICOCALC-REPO-LAYOUT Phase D. Recovery: `sh firmware/tools/wasm-toolchain.sh` in the worktree (downloads the
  Ubuntu packages into the ignored `firmware/build/`). The main checkout's toolchain link is stale and should be
  rebuilt the same way; its cached `.wasm` files hide that.

### What worked

- At 4b9a80b: `go test ./...` passes (with the go.work); `make -C firmware shots` writes 79 files; the playable
  profile builds to app `f8f36bd1120251588de1c27911de2aa9069af828d3db9db6fb029773dc8af1e0`, the digest
  `firmware/PLAYABLE.json` records (the build is reproducible from a worktree).
- At 854ffe2 (check + query split, no firmware change): `make test` 0, `make test-host` 0 (ray `430f0d501659`, Chess
  6,981 words, 24/24 replays), kernel policy 0 (same output digest, 6,981 words, 24/24), shots: the 79 files are
  byte-identical to the base run.

### What I learned

- Worktrees need two local fixes before the gates run (go.work, wasm toolchain); both stay outside the commits.

### Code review instructions

- Nothing to review in this step; the gate logs are in the session scratch directory.

## Step 2: The file-length check

`tools/check-file-length.mjs`, run by `make test-generated` (and so by `make test`), fails on a tracked source file over
500 lines that `tools/file-length-exceptions.txt` does not list, and on an exception that is no longer needed (the
file is gone or under the limit), so an entry comes off when its ticket lands.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the check and its list first, with every file being split listed under its ticket.
**Inferred user intent:** the limit is enforced from now on; other tickets know which entries are theirs.
**Commit (code):** 72f8ba0 — "test: a file-length check in make test-generated, with its exception list"

### What I did

- Source files: `.c .h .cc .cpp .hpp .S .s .js .mjs .cjs .go .py .typed .sh`, `Makefile`, `CMakeLists.txt`, tracked,
  outside `ttmp/`. Markdown, JSON and text are not source. Exceptions: `PATH -- REASON`, or `DIR/** -- REASON` for a
  tree (vendored `firmware/third_party/**`, `compiler/cji/**`).
- `node tools/check-file-length.mjs --list` prints every file over the limit with its reason or `NOT LISTED`.
- AGENTS.md's `make test` line names file lengths.

### Why

- Node, because `make test-generated` already runs Node and the check needs `git ls-files` only.
- The stale-entry error keeps the list honest without anyone remembering to prune it.

### What worked

- `node tools/check-file-length.mjs`: `782 source files, 109 over 500 lines, all listed (29 files, 2 trees)`.
- Negative test: removing `firmware/nucleus/vm.c` and adding `README.md -- bogus` gave both errors and exit 1.

### What warrants a second pair of eyes

- Files this ticket did not have in its design table but that are over 500 lines: `tests/compiler/typed-rv32.test.mjs`
  (1,109) is listed under PICOCALC-TYPED-PIPELINE (the tests of the rv32 sources it splits; TAPE and PIPELINE both add
  tests there, so a split here would conflict with both); `firmware/tests/calc.test.mjs` (588) goes with `calc.js`
  (ported, not split); `compiler/typed/rv32/10-function-code.js` and `30-version-loops.js` are rv32 sources
  (TYPED-PIPELINE). `firmware/nucleus/nucleus.h` (586) and `apps/js/picocalc/system/agent.js` (569) were added to this
  ticket's own list.

### Technical details

- Limit 500; the design's table started at 400 lines, so files between 400 and 500 are optional for this ticket.

## Step 3: query.js into query/*.js

The trace REPL's query language was one 2,545-line IIFE. It is now nine files in `pkg/traceapi/query/` that share one
scope, like `compiler/typed/rv32/*.js` share `typed-rv32.js`'s: `install.go` embeds `query/*.js` and joins them in
file-name order inside the function that opened and closed `query.js`.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** split by namespace; the design suggested goja modules.
**Inferred user intent:** readable files with no behaviour change.
**Commit (code):** 854ffe2 — "refactor(traceapi): split query.js into query/*.js by namespace"

### What I did

- `scripts/splitlib.py`: a split names its source, its parts and each part's line ranges; the library asserts that
  every source line lands exactly once (in a part, or in a named list of lines that the edits re-create), that the tree
  is clean, and applies `(old, new, count)` edits with asserted counts. `--dry-run` prints the plan.
- `scripts/01-split-query-js.py`: 00 errors/bridge/caches (97 lines), 10 plans and scopes (337), 20 rows, prints and
  timelines (324), 30 the archive and the IR parser (348), 40 snapshots, states and metrics (463), 50 machine
  properties and profiles (299), 60 compare, params, module (276), 70 fragments and sessions (157), 80 help and the
  public surface (250).

### Why

- Not goja modules: the IIFE's 2,500 lines share dozens of closures (`cache`, `archive`, `index()`, `QueryError`,
  plan classes) in both directions. Modules would mean an export list per file and re-plumbing every cross-reference,
  for no behaviour gain. One scope over several files is the repository's existing pattern.

### What worked

- The joined text equals the old `query.js` plus one header line per part (`diff` shows only the nine header lines and
  the opening lines moving into Go).
- `go test ./pkg/traceapi/ ./cmd/... ./pkg/tracerepl/` pass; Step 1's host gates at this commit pass.

### What warrants a second pair of eyes

- Error stack positions now count from the joined text, which has the header lines; no test pins a `query.js:LINE`.

## Step 4: The trace REPL's Go files and Candela's translator

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** split by responsibility; lower.js by construct.
**Inferred user intent:** as Step 3.
**Commit (code):** 9657334 (script), 90efbf8 — main.go; 2cfa38d — service.go; 21c53dd — study.go; c7408ce —
archive.go; cb11f09 — lower.js.

### What I did

- `scripts/02-split-go-files.py FILE`: `splitlib.go_split` gives each new file the package clause and the source's
  whole import block, then runs `goimports -w` and `gofmt -w`, so imports are only removed, never guessed.
  - `cmd/trace-repl/main.go` (701) → `main.go` (command tree, 175), `serve.go` (service, inventory, listener, 284),
    `client.go` (client commands, 267).
  - `pkg/tracerepl/service.go` (559) → `service.go` (379) and `cell.go` (one cell's parse and evaluation, 207).
  - `pkg/tracesimd/study.go` (530) → `study.go` (types, Parse, accessors, 362) and `check.go` (validation, 188).
  - `pkg/tracearchive/archive.go` (511) → `archive.go` (347), `profiles.go` (119), `label.go` (89).
- `scripts/03-split-candela-lower.py`: `tools/gen/candela/translator/lower.js` (914) → `lower-state.js` (the entry's
  state, constants, IR helpers, 265), `lower-expressions.js` (`ExpressionLowering extends EntryLowering`, 312) and
  `lower.js` (`Lowerer extends ExpressionLowering`: statements, plus the names `index.js` imports, 356).

### Why

- The `Lowerer` class alone was 640 lines. A chain of classes keeps every method unchanged (`this.inline` from an
  expression method still finds the statement half because `this` is a `Lowerer`).

### What worked

- `go vet` per package; `go test ./...` all ok after the four Go splits.
- `node tools/gen/candela/regenerate.mjs --check`: `7 generated files and VENDOR.json current`. The translator's own
  inputs are not in VENDOR.json's digests (only `translator/isa.js` is), so the split does not change them.
- A free-name check (a scratch script listing the old file's top-level names each new module uses without declaring
  or importing them) found nothing missing.

### What didn't work

- The worktree guard refuses shell commands that mix `git` with heredocs or pipelines; scripts are written with the
  editor and git is called alone or from a small commit helper.

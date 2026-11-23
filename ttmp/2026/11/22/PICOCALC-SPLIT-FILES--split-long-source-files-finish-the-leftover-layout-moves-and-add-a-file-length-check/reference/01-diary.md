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

## Step 5: The nucleus — vm.c, kernel.c, nucleus.h, native.c, vm_mqjs.c

Five C files of the nucleus, each split by a checked script into parts plus one internal header. The firmware digest
changes (link order); the host behaviour does not: after each commit the 79 host captures are byte-identical to the
base run, and `make test-native` and the firmware's `test-apps` pass.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** split the nucleus by responsibility, one commit per file, each gated; then build every
profile and probe-boot the playable build on the handheld.
**Inferred user intent:** shorter nucleus files with no behaviour change, proven on the host and on the device.
**Commit (code):** e8d5362 — vm.c; df74dad — kernel.c; 771f19c — nucleus.h; f19494e — native.c; 52728b0 — vm_mqjs.c.

### What I did

- `scripts/04-split-vm-c.py`: `vm.c` (1,266) → `vm.c` (462: allocator, work counting, lifecycle, manifest,
  calibration), `vm_ops.c` (432: errors, argument helpers, a world's own/message/handle/hardware/graphics operations,
  table `VM_OPS`), `vm_sys.c` (388: system, network, store and agent operations, `host_k`, `host_ka`), `vm_quickjs.h`.
  `SYNC_OPS` became `VM_OPS` + `SYS_OPS`; `host_k` looks in `VM_OPS` first through `find_op`.
- `scripts/05-split-kernel-c.py`: `kernel.c` (1,117) → `kernel.c` (474: profile, queue, logging, worlds, the lane,
  `kernel_reset`), `kernel_channels.c` (236), `kernel_supervision.c` (327), `kernel_reports.c` (109),
  `kernel_internal.h` (14 functions, `apply_at`, `frozen_now`, `painter_pending`).
- `scripts/06-split-nucleus-h.py`: the native-world section of `nucleus.h` (586 → 439) goes to `nucleus_native.h`
  (152), included by `nucleus.h` where the section was.
- `scripts/07-split-native-c.py`: `native.c` (836) → `native.c` (389), `native_json.c` (149: strict JSON payloads,
  text), `native_device.c` (303: CJI graphics; handles, files, clock, network in `nat_syscall_device`),
  `native_internal.h` (the call helpers as `static inline`).
- `scripts/08-split-vm-mqjs-c.py`: `vm_mqjs.c` (1,039) → `vm_mqjs.c` (456), `vm_mqjs_ops.c` (367: table, `__k`,
  `__ka`, most operations), `vm_mqjs_gfx.c` (221: pixels, system, clock, store), `vm_mqjs.h`. `SYNC_OPS` keeps its
  order (the op profile indexes it).
- Build lists: `firmware/Makefile` (both boards), the P4 and PaperS3 `main/CMakeLists.txt` (one line each per split).
- `splitlib.py --revert` undoes an applied, uncommitted split, so the list of shared functions could be read off the
  compiler's errors and the script rerun from a clean state.

### Why

- One internal header per binding keeps the shared surface explicit and away from `nucleus.h`.
- `kernel_reset` stays in `kernel.c` so the event queue (`heap`, `heap_n`) stays file-private instead of becoming
  two generic global names.
- `native.c`'s helpers are `static inline` because `vm_ops.c` now exports a global `fail` with another signature.

### What worked

- Host build with no warnings for picocalc, `CANDELA=1` and PaperS3 objects after every split.
- `make -C firmware shots`: 79 files byte-identical to the base run after each of the five commits; `make
  test-native` and `test-apps` 0 each time.
- PaperS3: its host binary does not link at the base either (`undefined reference to port_net_info`, `port_net_join`,
  `port_net_scan`, `port_net_scan_result`, `port_tz_set`). Linked with a stub file for those five, its 23 tour
  outputs are byte-identical before and after the `vm_mqjs.c` split.
- All five P4 profiles build at f19494e/52728b0 (digests in Technical details).
- Probe boot (`scripts/10-probe-boot.py`, `bench/board/device.install` under the serial lock) of the playable build
  `afbcb34dcd39`: flashed and verified; with `--peripherals on` health failed on the keyboard only
  (`physical keyboard I2C0 did not qualify: {... 'transfers': 261, 'errors': 261} -> {... 'transfers': 282, 'errors': 282}`),
  so per the rules the check was repeated with `--peripherals off-by-user --health-only`: every judged native world
  (snake, files, editor, agenda, chess) healthy, no restarts, painter compiled once (5.07 s) and installed.

### What didn't work

- First kernel run: 14 implicit declarations and `‘heap_n’ undeclared` in `kernel_supervision.c` (from
  `kernel_reset`); fixed by the shared list and by keeping `kernel_reset` in `kernel.c`.
- First native run: `implicit declaration of function ‘text_result’` in `native.c`; `text_result` joined the shared
  list. `--revert` itself first failed (`pathspec 'firmware/nucleus/native_internal.h' did not match`): it tried to
  restore the new parts' edits from HEAD; fixed to skip them.
- First vm_mqjs run: `‘js_nucleus_k’ undeclared` in the generated `mqjs_stdlib.h`, `‘wall_offset_ms’ undeclared`,
  `‘log_sink’ undeclared`, implicit `use`; all became shared declarations.
- `make restore-playable PERIPHERALS=off-by-user` reflashed and verified the recorded image `f8f36bd1`, then failed
  its health check: `RuntimeError: painter {'sources': 0, 'compiles': 0, 'installed': False, ...}`.
  `python3 bench/board/run.py --probe DIR --peripherals off-by-user` confirmed the recorded image is on the board
  (verify passed) and failed the same way. The UART log shows the display and compositor waiting with growing
  mailboxes (`"display" ... "mbox":2`, `"compositor" ... "mbox":6`) and Chess idle with no turns: with the display
  off nothing pulls frames, so Chess never sends its painter sources. This is the display, which the rules say not to
  debug; the playable image is installed. (The probe image had installed its painter during its first, peripherals-on
  attempt, before the keyboard check failed.)

### What warrants a second pair of eyes

- `vm.c`'s lookup now tries `VM_OPS` before `SYS_OPS`; the names are disjoint, so only the strcmp count per call
  changes (the virtual cost is a constant 1 per host call).
- `nat_syscall_device` returns `INT64_MIN` for "not mine"; no moved case returns that or breaks out of the switch.
- New global symbols with generic names in the QuickJS binding (`fail`, `use`, `iarg`, ...) and the kernel (`alive`,
  `settle_ask`, ...); every profile links, but a future file with the same global names would collide.
- The PaperS3 ESP-IDF build (its CMakeLists gained the kernel and vm_mqjs parts) — see Step 8.

### Technical details

| Profile | Base 4b9a80b (cb11f09 for the last three) | After the nucleus (f19494e / 52728b0) | Final (6afda7d) |
|---|---|---|---|
| playable | `f8f36bd1…` (= PLAYABLE.json) | `afbcb34d…` | `f20f6d97…` |
| candela-world | `520f2521…` | `2e40a47a…` | `fc561df6…` |
| offline | `29422ee3…` | `ca943948…` | `ffb2c4f9…` |
| agent | `16bbe047…` | `a0a5218d…` | `64ec9b9d…` |
| agent-elf | `9069cb0a…` | `962fc64e…` | `0687235b…` |

The final column differs from the middle one by Settings' help text (Step 7).

## Step 6: The firmware's tests to tests/apps and tests/native

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** PICOCALC-REPO-LAYOUT's leftover `firmware/tests` → `tests/{apps,native}`, where the
separation is real.
**Inferred user intent:** one home for tests.
**Commit (code):** 2f7aae5 — "refactor(layout): move the firmware's tests to tests/apps and tests/native"

### What I did

- `scripts/09-move-firmware-tests.py`: 7 Node tests → `tests/apps/`, 7 Python tests and the agent fixtures →
  `tests/native/`. The Python tests keep `OS` as the firmware directory (`parents[2] / "firmware"`), so every path
  they build stays the same; the firmware Makefile runs `../tests/{apps,native}/...`.
- The CJI fixtures stay in `firmware/tests/fixtures/`: the P4 `main/CMakeLists.txt` builds them.

### What worked

- Shots byte-identical; `make test-native`, `test-apps` and `make -C firmware test-agent` (23 tests, agent
  integration) pass.

## Step 7: Device tools, and the long files left

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** move `firmware/tools/{p4cap,p4put,s3cap,provision_agent}.py`; decide the remaining
long files.
**Inferred user intent:** finish the layout; leave nothing unexplained on the exception list.
**Commit (code):** 6f3d82b — the exception reasons; 6afda7d — "refactor(layout): move the boards' serial tools to tools/device"

### What I did

- `scripts/11-move-device-tools.py`: the four tools → `tools/device/`; README, docs, qemu.sh, comments; AGENTS.md
  gains a `tools/device/` row.
- Left on the exception list with reasons: both compositors and `agent.js` (one-file QuickJS worlds; see the
  design's Refinements), `world.c` and `agent_p4.c` (after PICOCALC-TYPED-APP-MANIFEST).

### What worked

- Shots: 78 of 79 byte-identical; `86-settings-provider.png` changes, and only in the help line that now reads
  `tools/device/provision_agent.py` (checked by eye). That capture's new digest is the reference from here on.
- `python3 tools/device/p4cap.py --help` and `provision_agent.py --help` run from the new place.

### What warrants a second pair of eyes

- The settings text change makes the playable digest differ from the nucleus build (`f20f6d97…` vs `afbcb34d…`).

## Step 8: The PaperS3 ESP-IDF build

The split scripts edited `firmware/port/esp32s3-papers3/main/CMakeLists.txt` (kernel and vm_mqjs parts), so I built
that port too: `idf.py -C firmware/port/esp32s3-papers3 -B /tmp/picocalc-split-s3 build`.

### What worked / what didn't

- Every new part compiled with no warning (`kernel_channels.c.obj`, `kernel_reports.c.obj`,
  `kernel_supervision.c.obj`, `vm_mqjs.c.obj`, `vm_mqjs_gfx.c.obj`, `vm_mqjs_ops.c.obj`).
- The link fails: `undefined reference to 'engine_index'`, `'engine_name'`, `'nat_begin_segment'`, `'nat_create'`,
  `'nat_dispatch'`, `'nat_dispose'`, `'nat_render'`, `'nat_settle'`. These live in `native.c`, which the PaperS3
  CMakeLists has never listed while `kernel.c` has called them since native worlds arrived: the port was already
  broken before this ticket (as its host build is, Step 5). Not fixed here; noted for PAPERS3-PORT.

## Step 9: The trace REPL to tools/trace-repl (the last commit)

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** `cmd/trace-repl` + `pkg/trace*` → `tools/trace-repl`, last, keeping the revision-aware
path table working.
**Inferred user intent:** the workbench under `tools/` like the other tools, in a commit that rebases easily over
TYPED-TAPE's change to the path table.
**Commit (code):** the branch's last commit — "refactor(layout): move the trace REPL to tools/trace-repl"

### What I did

- `scripts/12-move-trace-repl.py`: `cmd/trace-repl` → `tools/trace-repl` (command, `doc/`, `examples/`),
  `pkg/trace*` (nine packages, all of `pkg/`) → `tools/trace-repl/pkg/`. Outside `ttmp/`: `cmd/trace-repl` →
  `tools/trace-repl` and `pkg/trace` → `tools/trace-repl/pkg/trace` (import paths, docs, help pages, comments,
  the repo test's README path); the six `"../../ttmp/"` globs in the package tests gain two levels. `go.mod` stays
  at the root.
- `pkg/tracecompiler`'s `Modules`/`WorldRoots` table names compiler and world paths at each revision; only its import
  line changes, and its tests (which load historical revisions) are part of the gate.

### What should be done in the future

- TYPED-TAPE adds `compiler/typed/tape.js` to that table in `pkg/tracecompiler/compiler.go`; after this move the
  file is `tools/trace-repl/pkg/tracecompiler/compiler.go` (git follows the rename).

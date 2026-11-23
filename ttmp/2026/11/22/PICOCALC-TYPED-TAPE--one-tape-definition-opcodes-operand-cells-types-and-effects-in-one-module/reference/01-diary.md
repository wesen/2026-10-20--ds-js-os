---
Title: Diary
Ticket: PICOCALC-TYPED-TAPE
Status: active
Topics:
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: compiler/typed/tape.js
      Note: the tape definition this ticket adds
    - Path: tests/compiler/typed-tape.test.mjs
      Note: the tape-coverage test
    - Path: docs/typed-compiler.md
      Note: the compiler guide this ticket starts
ExternalSources: []
Summary: "Implementation diary of PICOCALC-TYPED-TAPE: one tape definition (compiler/typed/tape.js) read by the front end, the RV32 backend, the PIE pass, the tools, the trace REPL and the firmware, with no output change."
LastUpdated: 2026-11-22T20:30:00-05:00
WhatFor: "What was done, how it was checked, and what to review"
WhenToUse: "Reviewing or extending the tape definition"
---

# Diary

## Step 1: Verify the design and record a baseline

The design says the tape's knowledge is spread over `typed-wasm.js` (`OP` and raw hex), `OPERAND_CELLS`, `storeless`,
`opNext`/`opClose`, the PIE pass, the inspector and the tests. Reading the sources at `4b9a80b` confirmed every item and
found three more: `LEAF_OPERANDS` in `rv32/11-leaf-code.js` (a second table of cell counts), the `ALU`, `PREDICATES`
and `IMMEDIATE_FORMS` tables in `rv32/00-encoding.js` (keyed by tape opcodes, valued by RV32 encodings), and the
firmware's compiler bytecode cache in `typed_p4.c`, which was already full. Before changing anything I wrote a digest
harness that compiles every compile unit under every policy and hashes the image and every tape `observeTape` sees.

### Prompt Context
**User prompt (verbatim, the coordinator's instructions):** "TICKET: PICOCALC-TYPED-TAPE — one tape definition for the
Typed compiler.

Read first, in this order:
1. AGENTS.md (the project goal: Typed first, QuickJS fallback, C only if unavoidable or as a benchmark).
2. ttmp/2026/11/22/PICOCALC-TYPED-FIRST--*/design-doc/01-*.md (program findings, ticket map, and the \"Rules every ticket follows\" section — obey them).
3. Your design: ttmp/2026/11/22/PICOCALC-TYPED-TAPE--*/design-doc/01-one-tape-definition-for-the-typed-compiler.md
4. docs/measuring.md and compiler/typed/rv32/README.md.

Work plan:
- First verify the design against the code. If something is wrong or missing, append a \"## Refinements (date)\" section to your design doc rather than silently deviating.
- Create your diary: `docmgr doc add --ticket PICOCALC-TYPED-TAPE --doc-type reference --title \"Diary\"` and keep it in the investigation format described in /home/manuel/.claude/skills/diary/references/investigation-entry.md (read that file). Record the verbatim task you were given (this prompt's TICKET line and work plan, labeled as the coordinator's instructions), every failure with exact command and error, every gate with numbers, and commit hashes. One step per milestone.
- Use docmgr tasks in your ticket (`docmgr task add/check --ticket PICOCALC-TYPED-TAPE`) and `docmgr changelog update` at milestones.
- Implement per the design: compiler/typed/tape.js; replace every scattered opcode table/constant (typed-wasm.js OP and raw hex, rv32/20 OPERAND_CELLS, storeless in rv32/70, opNext/opClose users, typed-pie-loops.js constants, compiler/typed/tools/typed-inspect.mjs, tests); load tape.js everywhere the compiler is loaded (bench/lib/compiler.mjs, tests, pkg/tracecompiler module table and its revision-aware paths, the firmware bundle list in firmware/port/esp32p4/main/CMakeLists.txt BUNDLE_EXTRA and the device's compiler bytecode cache). Edit compiler/typed/rv32/*.js, then `node compiler/typed/rv32/build.mjs` — never edit typed-rv32.js by hand. Write docs/typed-compiler.md and link it from docs/README.md and AGENTS.md's table.
- Gates (record numbers in the diary): `make test`; `make test-host` and `make test-host OPTIONS='{\"policy\":\"kernel\"}'` (ray digest 430f0d50…, Chess 6,981 words, 24/24 replays); every pinned digest in tests/compiler unchanged; the new tape-coverage test. Build the playable profile once (`source ~/esp/esp-idf-5.4.2/export.sh; firmware/port/esp32p4/build.sh playable /tmp/picocalc-tape-playable`) to prove the bundle change builds. A board probe is optional; if you do one, use bench/board tools under the serial lock, never write firmware/PLAYABLE.json, and leave the playable image installed (`make restore-playable` if you flashed anything). The keyboard/display may be off by the user: use PERIPHERALS=off-by-user if health fails only on them; don't debug them.
- Rules: no backwards compatibility needed; deletes/moves only via checked Python scripts in your ticket's scripts/ (never rm -rf or pkill one-liners); focused commits at validated boundaries with the trailer \"Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\". Other subagents work in parallel on other tickets (RV32-CONFORMANCE, TYPED-APP-MANIFEST, SPLIT-FILES); stay within your ticket's files.

When done, reply with a compact report: branch name and commits; what changed (files); gate results with numbers; deviations from the design and why; open issues; anything the coordinator must do at merge (expected conflicts, firmware to install). Do not paste the diary."

**Assistant interpretation:** Introduce `compiler/typed/tape.js` as the only definition of the tape, make every
producer, consumer and loader use it, and prove that no compiled output changes.

**Inferred user intent:** Prepare the compiler for typed operations (f32) and for the FRONTEND, PIPELINE and BITWISE
tickets, which all need one table of opcodes, cells, types and effects.

### What I did
- The worktree started at `5c2fb9c`; `git merge --ff-only main` brought it to `4b9a80b` (the program's tickets).
- Read the design, the program design, `docs/measuring.md`, `compiler/typed/rv32/README.md`, every `rv32/*.js`,
  `typed-wasm.js`'s emitter and inspector, `typed-pie-loops.js`, `typed-inspect.mjs`, the tests, every loader
  (`bench/lib/compiler.mjs`, `bench/host/ray-profile.mjs`, `bench/board/stage.mjs`, `pkg/tracecompiler/compiler.go`,
  `firmware/port/esp32p4/main/CMakeLists.txt`, `typed_p4.c`).
- Counted the hex literals per file: 943 in `typed-rv32.js`, 94 in `typed-wasm.js`, 53 in `typed-pie-loops.js`, 45 in
  the rv32 test. Some are RV32 encodings with the same values as tape opcodes (`instruction.i(0x03, …)` is the RV32
  LOAD opcode, `0x20` is a funct7), so the rewrite had to select lines.
- Wrote a scratchpad harness (`baseline.mjs`) that compiles 13 units (ray, the material benchmark, Editor, Chess, Files,
  Agenda, Agenda's reminder, both painters, Candela's three stages) under `stock`, `interactive`, `balanced`,
  `default`, `kernel` and `kernel` + `pieLoops: "pie"`, hashing the image and every observed tape, plus each unit's Wasm
  bytes: 84 digests at `4b9a80b`.

### Why
- A value-preserving rename cannot change the output, but a wrongly named literal can mislead a reader; the harness
  checks the first claim on far more than the pinned digests, and the line selection plus a review of every changed
  line addresses the second.

### What worked
- The baseline reproduces the pins: ray `default` `d9c25ef9…`, `balanced` `4fa61ed1…`, `interactive` `6b854512…`,
  `kernel` `4323938e…` (the board study's pin).

### What didn't work
- `node baseline.mjs …` first failed because `apps/typed/candela/assemble.py` cannot write to `/dev/stdout` here:
  `OSError: [Errno 6] No such device or address: '/dev/stdout'`. The harness writes to a scratch file instead.
- `agenda/entry.typed` alone fails (`213:30: unknown type EntryError`); the firmware compiles `reminder.typed` + a
  newline + `entry.typed`, which the harness and the test now use.

### What I learned
- The playable firmware evaluates nine compiler sources but `typed_p4.c` caches eight.

### What was tricky to build
- Nothing yet.

### What warrants a second pair of eyes
- N/A for this step.

### What should be done in the future
- N/A.

### Code review instructions
- `ttmp/.../design-doc/01-one-tape-definition-for-the-typed-compiler.md`, section "Refinements (2026-11-22)".

### Technical details
- Units and assemblies: as in `tests/compiler/typed-tape.test.mjs`'s `units()`.

## Step 2: tape.js and the rewrite of every producer and consumer

`compiler/typed/tape.js` defines 36 rows (33 WebAssembly opcodes and the three text pseudo-ops) with constant names,
operation names, operand formats, pop and push types and effects, and publishes `typedTape`. The front end, the
backend's sources, the PIE pass, the inspector and the tests now use the names. The first full comparison failed on
every unit; the cause was a name clash, and after the fix all 84 digests matched.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement the table and replace the scattered definitions.
**Inferred user intent:** One place to read and to extend.
**Commit (code):** see Step 4.

### What I did
- `compiler/typed/tape.js`: `ROWS`, `cells` (Int8Array, -1 outside the tape), `effects` (Uint8Array), `rows`, `row`,
  `name`, `next`, `close`, `decode(tape, wasm)`, value types `I32`/`VOID`, effect bits.
- `ttmp/.../scripts/01-name-tape-opcodes.py`: replaces hex literals equal to a tape opcode (and, with `--types`, the
  block types `0x7f`/`0x40`) with the names, on selected lines (`--lines`, `--skip REGEX`), leaving comments alone, and
  prints every changed line for review. Runs and counts:
  - pure tape passes with `--types`: `30-version-loops.js` 247, `31-split-locals.js` 9, `40-ranges.js` 72,
    `41-value-sets.js` 139, `42-conjunctions-and-rotation.js` 52, `43-inline-candidate.js` 4, `50-planner.js` 65,
    `20-inline-and-commute.js` (after its table) 81;
  - `10-function-code.js` 72 with `--skip 'instruction\.i\(0x03|T6, 0x20\)'` (a dry run showed exactly those two
    lines would have been misnamed: the RV32 LOAD opcode and a funct7);
  - `11-leaf-code.js` 38 with `--skip 'instruction\.'`;
  - `typed-wasm.js` 38 on lines 11–1000 and 1625–1640 (outside them are Wasm module bytes: `0x6d` in the magic would
    otherwise have become `I32_DIV_S`); `typed-pie-loops.js` 41.
- By hand: `00-encoding.js` (destructuring of the names, `ALU`/`PREDICATES`/`IMMEDIATE_FORMS` keys, `constantForm`);
  `OPERAND_CELLS` deleted, its users read `CELLS`; `opNext`/`opClose` deleted from `30-version-loops.js` and taken from
  `typedTape.next`/`close`; `storeless` and the planner's purity test use `EFFECTS[op] & STORES`; `LEAF_OPERANDS`
  became `LEAF_OPERATIONS` + `CELLS`; `typed-wasm.js`'s `OP`, `I32`, `VOID` and `inspectOperations`' table replaced
  (inspection now calls `typedTape.decode`), `decodeNumericOperations` removed; the PIE pass decodes with
  `typedTape.decode` and names `64` as `VOID`; `typed-inspect.mjs` tests operation names; comments that named
  opcodes by number now name them.
- Tests: `typed-rv32.test.mjs` (13 loader lists, `I32_ADD`, `UNCHECKED_ADDRESS`, the local cell table in the value-sets
  test replaced by `typedTape.decode`), `typed-pie-loops`, `typed-wasm-inspect`, `typed-inspect` load `tape.js`.
- `node compiler/typed/rv32/build.mjs` after each round of edits.

### Why
- Closure constants instead of `T.X`: see the refinements; the passes compare opcodes in inner loops.

### What worked
- After the fix below: `diff baseline.json after.json` printed nothing and the harness said `IDENTICAL` — 84 of 84
  digests (78 RV32 image + tape-stream pairs and 6 Wasm images that compile alone) equal to `4b9a80b`'s.

### What didn't work
- The first comparison: every RV32 compile threw (`ERR unsupported RV32 control result`, `ERR Cannot read properties of
  undefined (reading 'params')`) and every Wasm digest changed (ray `e41e83909a29a4e7` became `403e0c7c6ed518c5`). A
  scratch script comparing old and new Wasm bytes for the ray tracer found the first difference at byte 1032: `16`
  (`call`) had become `4` (`if`). The published object spread the opcode constants and then the effect bits, and the
  effect `CALL = 4` overwrote the opcode `CALL = 0x10`. Fix: plural effect names (`STORES`, `LOADS`, `CALLS`,
  `BRANCHES`, `TRAPS`, `CONTROL`) and a check in `tape.js` that throws `tape name X is defined twice`.

### What I learned
- One namespace for opcodes and effect bits needs a guard; the guard now runs at every load.

### What was tricky to build
- Telling tape opcodes from RV32 encodings with the same value in `10-function-code.js`, `11-leaf-code.js` and
  `00-encoding.js`. The dry runs listed every candidate line; the two misnamings the script would have made were
  excluded by `--skip`, and `00-encoding.js` was edited by hand so that `[I32_SUB,[0,0x20]]` keeps its funct7.

### What warrants a second pair of eyes
- The names on literals in `10-function-code.js` and `11-leaf-code.js` (`git diff` of those two files).
- `next` returns `NaN` for an unknown opcode where `opNext` returned `at`; every caller rejects unknown opcodes first,
  so no output changes, but a loop that relied on `at` not moving would now end instead of spinning.

### What should be done in the future
- PICOCALC-RV32-REGISTERS can name the RV32 encodings that stay hex.

### Code review instructions
- Start at `compiler/typed/tape.js`, then `rv32/00-encoding.js`'s destructuring, `rv32/70-compile.js`'s `storeless`,
  `typed-wasm.js`'s header and `inspectOperations`.
- Validate: `node compiler/typed/rv32/build.mjs --check`; `node tests/compiler/typed-tape.test.mjs`.

### Technical details
- `typedTape` keys: 36 opcode constants, `I32`, `VOID`, six effect bits, `rows`, `cells`, `effects`, `row`, `next`,
  `close`, `name`, `decode`.

## Step 3: Loaders, the coverage test, the trace REPL and the firmware

Every loader evaluates `tape.js` before `typed-wasm.js`. The coverage test walks every tape the compiler produces from
`apps/typed` with the table and a typed operand-stack check.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Load the table everywhere and test it against real tapes.
**Inferred user intent:** No loader can miss the table, and the table cannot drift from what the compiler writes.
**Commit (code):** see Step 4.

### What I did
- Loaders: `bench/lib/compiler.mjs`, `bench/host/ray-profile.mjs`, `bench/board/stage.mjs` (the board app's cold
  compile bundle), `compiler/typed/tools/typed-inspect.mjs`, the four compiler tests.
- Trace REPL: `typedTape` first in `pkg/tracecompiler`'s `Modules`, optional (absent at older revisions); the wrapper
  test's indexes; `pkg/traceapi/compiler_test.go` expects three missing files at `25cd108` (was two); module lists in
  `pkg/traceapi/compiler.js`, `cmd/trace-repl/README.md` and `doc/03-trace-repl-js-api.md`.
- Firmware: `CMakeLists.txt` bundles `typed/tape.js` with `typed/wasm.js`; `typed_p4.c` evaluates it first and its
  bytecode cache has 12 entries instead of 8.
- `tests/compiler/typed-tape.test.mjs` (added to `firmware/Makefile`'s `test-apps`): table consistency (names unique,
  cells = operand formats, `STORES` rows exactly the three stores, `CALLS` only `call`, `decode` in both modes, `next`
  and `close`); every tape of 12 units under `stock` and `kernel`; a negative test with four wrong cell counts.

### Why
- The stack check uses the pop/push columns, so the test checks the type columns as well as the cell counts.

### What worked
- `node tests/compiler/typed-tape.test.mjs`: 3 tests pass in about 2 s; 4,184 tapes checked; phases seen: inline,
  commute, conjunctions, sets, rotate, version, split. Every row occurs: all but `i32.shl` in the numeric tapes, and
  `i32.shl` in the Wasm mode's bytes, which never contain a pseudo-op.
- `go test ./pkg/tracecompiler/ ./pkg/traceapi/` (with the modfile below): ok, traceapi in 67.5 s.

### What didn't work
- The first test run: `deepStrictEqual` failed on equal arrays ("Values have same structure but are not
  reference-equal") because the arrays came from the vm context's realm; the test compares `JSON` copies.
- `instanceof ctx.SyntaxError` threw `TypeError: Right-hand side of 'instanceof' is not an object` (the context has no
  such global); the test compares `error.name`.
- A Chess unit with `mobile-view.typed` failed (`940:43: unknown function chessPainterSource`); the firmware embeds the
  painter with `firmware/tools/embed-chess-painter.py` and renames `chessRender`, which the test now does.
- `go test ./pkg/traceapi/` in the worktree: `github.com/go-go-golems/go-go-goja@v0.10.7: replacement directory
  ../go-go-golems/go-go-goja does not exist` (go.mod's relative replace resolves from the worktree). Workaround: a
  scratchpad copy of `go.mod` with the absolute path, `GOFLAGS=-modfile=…`. Not a repository change.

### What I learned
- The Wasm mode writes `i32.shl` for buffer addresses; the numeric tape has `text.checked_address` instead.

### What was tricky to build
- The stack check's handling of unreachable code after `br`, `return` and `unreachable`: pops below the block's base are
  allowed there, and the stack is cut back to the block's height until its `else` or `end`.

### What warrants a second pair of eyes
- The cache size in `typed_p4.c` (12 entries of 56 bytes each, static).

### What should be done in the future
- N/A.

### Code review instructions
- `tests/compiler/typed-tape.test.mjs`, `pkg/tracecompiler/compiler.go`, `firmware/port/esp32p4/main/typed_p4.c`.

### Technical details
- Units: ray, material, Editor (`source.list`), Chess (`source.list`), playable Chess (3D painter embedded, mobile
  view), Files, Agenda (reminder + entry), both painters, Candela hand/fluent/callback (`assemble.py`).

## Step 4: Gates, the playable build, QuickJS cost, commits

Every gate passed with the numbers of `4b9a80b`, the playable profile builds with `typed/tape.js` in its bundle, and a
host QuickJS comparison shows no measurable compile-time cost.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Run the gates the coordinator listed and commit at the validated boundary.
**Inferred user intent:** Evidence that the refactor changes no output and costs nothing at boot.
**Commit (code):** `5ded48f` — "feat(compiler): one tape definition, compiler/typed/tape.js"; `58238aa` — "docs: the
Typed compiler guide (pipeline, the tape, passes, backends, oracles)".

### What I did
- `GOFLAGS=-modfile=<scratch>/go.mod make test` (see Step 3 for the modfile), then, after the toolchain fix below,
  `make -s -C firmware test-native` and `make -s -C compiler/cji test` again.
- `make test-host`; `make test-host OPTIONS='{"policy":"kernel"}'`.
- `source ~/esp/esp-idf-5.4.2/export.sh; firmware/port/esp32p4/build.sh playable /tmp/picocalc-tape-playable`.
- `scripts/02-qjs-compile-time.c` (a bare QuickJS realm from `firmware/third_party/quickjs`, a fresh runtime per round
  that parses the compiler files and compiles one unit) and `scripts/03-compare-qjs-compile-time.py` (the `4b9a80b`
  files against the new ones in alternating order, 12 blocks, the P4's boot policy per unit).

### Why
- The design's board gate (boot compile times within 75 % of each deadline) was made optional by the coordinator; the
  host QuickJS comparison checks the same risk, interpreter work, without the board.

### What worked
- `make test`: 99 passing node tests in 9 files, 0 failing (including `typed-tape.test.mjs`: 3 tests, 4,184 tapes;
  every pinned digest in `typed-rv32.test.mjs`, `typed-pie-loops.test.mjs`, `typed-inspect.test.mjs` unchanged);
  test-generated ok; `go test ./...` all ok (traceapi 150 s); python suites 4, 20, 6 (2 skipped), 9 OK; `test-native`
  34 tests OK (1 expected failure); cji: every fixture ok.
- `make test-host` (default): ray 4,888,369 instructions, 11964 B, output `430f0d501659` (reference); Chess 6981 words
  match, engine 128,152,624 instructions, 21716 B; replays 24/24.
- `make test-host OPTIONS='{"policy":"kernel"}'`: ray 3,239,635 instructions, 11544 B, `430f0d501659` (reference);
  Chess 6981 words, 118,361,847 instructions, 19892 B; replays 24/24 (the numbers in `docs/measuring.md`).
- Playable build: `Project build complete`, `picocalc-os-p4.bin binary size 0x4b1990 bytes`, 41 % of the app
  partition free; `js_bundle.c` contains `typed/tape.js`. It ran from the uncommitted tree just before `5ded48f`
  (`playable 4b9a80b dirty=true app 1f99bf38…`), with the committed sources.
- QuickJS, medians of 12 alternating rounds (host load average 11 from parallel agents' builds, so noisy):

  | Unit, policy | load old → new (µs) | compile old → new (µs) | new/old |
  |---|---|---|---|
  | Agenda, interactive | 19,970 → 20,392 | 21,612 → 19,274 | 0.892 |
  | Editor, interactive | 19,676 → 20,522 | 106,328 → 96,854 | 0.911 |
  | Chess, balanced | 20,523 → 21,811 | 87,326 → 89,536 | 1.025 |
  | Ray, kernel | 21,495 → 21,149 | 59,963 → 58,356 | 0.973 |

  Every pair compiled images of identical length (the script asserts it). An earlier 6-block run under heavier load
  gave 1.100, 1.014, 0.887, 0.999. Loading gains up to ~1 ms on the host for parsing `tape.js` (the device caches the
  bytecode after the first compile); compiling shows no consistent change in either direction.

### What didn't work
- `test-native` failed in the fresh worktree: first `fatal error: 'bits/libc-header-start.h' file not found` (no
  `firmware/build/wasm-toolchain`), then, with a symlink to the main checkout's toolchain, `wasm-ld-18: error: cannot
  open …/firmware/build/wasm-toolchain/res/lib/wasi/libclang_rt.builtins-wasm32.a: No such file or directory`: the main
  checkout's `res/lib/wasi` link still points at the pre-layout `picocalc-os/build/wasm-toolchain/...` path. A
  scratchpad script replaced my symlink with a worktree-local `wasm-toolchain` whose `res` links resolve (build
  directory only, not committed); `test-native` then passed.

### What I learned
- Host QuickJS on a loaded machine has about ±10 % noise per unit; a smaller claim needs the board.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- The device's first compile parses one more small file (about 150 lines); the next playable install's boot compile
  lines will show it.

### What should be done in the future
- Rerun `tools/wasm-toolchain.sh` in the main checkout so that `res/lib/wasi` resolves.

### Code review instructions
- `git show 5ded48f --stat`; the gates as above.

### Technical details
- Harness build: `cc -O2 -DCONFIG_VERSION='"…"' -I firmware/third_party/quickjs -o qjs-compile-time
  scripts/02-qjs-compile-time.c firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread`.

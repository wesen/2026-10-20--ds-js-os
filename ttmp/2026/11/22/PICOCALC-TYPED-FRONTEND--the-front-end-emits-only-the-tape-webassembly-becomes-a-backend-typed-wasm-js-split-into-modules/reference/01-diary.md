---
Title: Diary
Ticket: PICOCALC-TYPED-FRONTEND
Status: active
Topics:
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: compiler/typed/frontend/build.mjs
      Note: Bundles frontend/ and wasm/ into typed-wasm.js; --check in make test-generated
    - Path: compiler/typed/wasm/encode.js
      Note: encodeFunction, the tape to Wasm serializer, and compileWasmFunctions
    - Path: compiler/typed/frontend/expressions.js
      Note: ExpressionParser with the tape writer
    - Path: compiler/typed/wasm/inspect.js
      Note: The Wasm backend's inspection events, derived from the tape event
ExternalSources: []
Summary: "Implementation diary of PICOCALC-TYPED-FRONTEND: the front end writes only the tape, Wasm serializes it, typed-wasm.js is built from frontend/ and wasm/."
LastUpdated: 2026-11-22T21:00:00-05:00
WhatFor: "How the change was made and gated, with the exact failures and numbers."
WhenToUse: "Reviewing the ticket's commits or repeating its byte-identity and heap measurements."
---

# Diary

## Step 1: Baseline, and a digest harness wider than TAPE's

The worktree started at `5c2fb9c`; `git merge --ff-only main` brought it to `bf30d31` (TAPE and RV32-CONFORMANCE
merged). Before changing anything I wrote the ticket's digest harness and recorded its 123 digests from a copy of
`bf30d31`'s `compiler/typed` (extracted with `git archive`), and a QuickJS harness for compile time and peak heap.

### Prompt Context
**User prompt (verbatim, the coordinator's instructions):** "TICKET: PICOCALC-TYPED-FRONTEND — the parser/checker always
emits the tape; WebAssembly becomes a backend that serializes the tape; typed-wasm.js (1,667 lines) is split into
frontend/ and wasm/ modules.

Read first:
1. AGENTS.md (goal: Typed first, QuickJS fallback, C only if unavoidable or as a benchmark).
2. ttmp/2026/11/22/PICOCALC-TYPED-FIRST--*/design-doc/01-*.md (\"Rules every ticket follows\" — obey them).
3. Your design: ttmp/2026/11/22/PICOCALC-TYPED-FRONTEND--*/design-doc/01-*.md
4. docs/typed-compiler.md and ttmp/2026/11/22/PICOCALC-TYPED-TAPE--*/reference/01-diary.md (how TAPE was gated: its
before/after digest harness in that ticket's scripts/ is reusable — 84 digests over 13 units × policies plus Wasm builds).

Work plan:
- Verify the design against the code; append \"## Refinements (date)\" to the design for changes.
- Diary: `docmgr doc add --ticket PICOCALC-TYPED-FRONTEND --doc-type reference --title \"Diary\"`; investigation format
per /home/manuel/.claude/skills/diary/references/investigation-entry.md (read it). Record the coordinator's instructions
(this prompt's TICKET line and plan), failures with exact command and error, gate numbers, commit hashes. docmgr tasks
and changelog in your ticket.
- Implement: (1) tape → Wasm serializer reproducing today's Wasm bytes exactly (pseudo-ops 0xf1–0xf3 expand to today's
bounds-check sequences); (2) the parser emits only the tape; (3) split into modules (frontend/lexer, declarations,
expressions, statements, compile; wasm/encode, module, link; inspect). The device and every loader read one script per
compiler file today (bench/lib/compiler.mjs, tests, pkg/tracecompiler's revision-aware module table,
firmware/port/esp32p4/main/CMakeLists.txt BUNDLE_EXTRA and typed_p4.c's eval chain and bytecode cache): bundle your
modules back into typed-wasm.js with a small generator `compiler/typed/frontend/build.mjs` (no new npm dependencies)
and add its `--check` to `make test-generated`. PICOCALC-TYPED-PIPELINE is building a bundler for compiler/typed/rv32
in parallel; keep yours small and self-contained — the coordinator may unify them later. Keep typed-async.js working
(it subclasses FunctionEmitter as TypeChecker and uses typedWasm internals); PICOCALC-TYPED-ASYNC-TAPE replaces it later.
- Gates: every Wasm module and every RV32 image byte-identical (reuse TAPE's harness); `make test`; `make test-host` and
`make test-host OPTIONS='{\"policy\":\"kernel\"}'` (ray 430f0d501659, Chess 6,981 words, 24/24 replays); Editor host
compile time and peak heap within 2 % (record method); typed-inspect.mjs and the trace REPL inspection still work.
Build the playable profile once to prove the bundle builds (`source ~/esp/esp-idf-5.4.2/export.sh;
firmware/port/esp32p4/build.sh playable /tmp/picocalc-frontend-playable`). Board: only if you need it; then use
bench/board tools under the serial lock, experiment images only, restore the playable image, never write
firmware/PLAYABLE.json.
- Worktree environment notes from earlier tickets: go.mod's relative `replace ../go-go-golems/go-go-goja` does not
resolve in a worktree — use a GOWORK file in /tmp or GOFLAGS=-modfile=<copy with absolute path>; don't commit that. The
WebAssembly toolchain under firmware/build/ is gitignored: run `bash firmware/tools/wasm-toolchain.sh` in your worktree
if test-native needs it.
- Rules: no backwards compatibility; moves/deletes only via checked Python scripts in your ticket's scripts/; focused
commits with trailer \"Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\". Parallel: PICOCALC-TYPED-PIPELINE
(compiler/typed/rv32/, rv32/build.mjs), PICOCALC-TYPED-APP-MANIFEST (P4 port, typed_p4.c, main/CMakeLists.txt),
PICOCALC-SPLIT-FILES (nucleus, pkg/cmd, tools). Stay in compiler/typed (except rv32/), its loaders and tests.

When done, reply with a compact report: branch and commits; module layout; gate results with numbers; deviations; open
issues; merge notes (expected conflicts). Do not paste the diary."

**Assistant interpretation:** Make the front end target-neutral (tape only), make WebAssembly a serializer of the tape
with byte-identical output, split `typed-wasm.js` into modules that a generator bundles back into the same file, and
prove that no output, inspection result or compile cost changes.

**Inferred user intent:** One emission path for both backends, so that the Wasm oracle checks exactly what the RV32
backend receives, and a front end small enough per file to extend (f32, bitwise, async as a tape transform).

**Commit (code):** `ba30978` — "test(typed-frontend): digest harness and QuickJS time/heap harness for the front-end split"

### What I did
- Read AGENTS.md, the program design's rules, this ticket's design, `docs/typed-compiler.md`, TAPE's diary, all of
  `typed-wasm.js`, `typed-async.js`'s use of `typedWasm`, `rv32/70-compile.js`'s call of `compileFunctions`,
  `typed-world.js`, the inspection tests and `typed-inspect.mjs`, `rv32/build.mjs`.
- TAPE's harness (`baseline.mjs`) was a scratchpad file and is not in its `scripts/`; I wrote
  `scripts/01-digests.mjs` with the same 13 units (from `tests/compiler/typed-tape.test.mjs`'s `units`) and 6
  policies, plus the Agenda reminder alone, `typedWasm.compile` bytes per unit, the five linked Wasm worlds (Editor,
  Chess and the playable Chess through `compileTypedWorld`, Files and Agenda through their `compile.js` linkers with
  the reactors from `firmware/build/`), and the JSON of every inspection event of `typedWasm.compile` and
  `typedRv32.compile` per unit (the latter without the frontend event's `target`, which this ticket renames).
- `bash firmware/tools/wasm-toolchain.sh`, then `make -C firmware typed-world-reactor build/agenda-reactor.wasm
  build/files-reactor.wasm` for the reactors.
- `node scripts/01-digests.mjs --compiler <scratch>/base/compiler/typed --out baseline.json`: 123 digests at
  `bf30d31`, 6 expected errors (Editor exceeds `typedWasm.compile`'s 64 KiB limit; the two Chess units need the SDK
  imports to compile alone, and they are covered by `world/*`).
- `scripts/02-qjs-measure.c`: TAPE's QuickJS harness with an allocator that records the peak heap of the compile.

### Why
- The design's gate is every Wasm module byte-identical; the linked worlds are the Wasm modules the replays and
  non-playable firmware profiles actually run, so they belong in the set. The inspection streams cover the part of
  the change that is not bytes (source spans of Wasm operations).

### What worked
- The baseline reproduces the pins: ray `default` `d9c25ef9…`, `balanced` `4fa61ed1…`, `interactive` `6b854512…`,
  `kernel` `4323938e…`; ray Wasm `e41e8390…` (TAPE's number).

### What didn't work
- `mkdir -p …/base && git archive bf30d31 compiler/typed | tar -x -C …/base && …` was refused by the worktree guard
  ("this command names git in a form too complex to verify that it stays inside the worktree"); `git archive -o
  <scratch>/base.tar bf30d31 compiler/typed` as its own command, then `tar -x`, worked.

### What I learned
- No playable boot path compiles to Wasm: `profiles/playable.env` sets `PICOCALC_RV32_{CHESS,AGENDA,EDITOR,FILES}=ON`,
  and `editor_p4.c`/`chess_p4.c` choose `compileTypedWorld` (Wasm) only without those flags. A board measurement is
  not needed for the boot path.

### What was tricky to build
- Nothing yet; the mutation check is in Step 2.

### What warrants a second pair of eyes
- That the unit list matches what the firmware compiles (it is the TAPE test's list, plus the reminder).

### What should be done in the future
- N/A.

### Code review instructions
- `node ttmp/…/scripts/01-digests.mjs --compiler DIR --out FILE` from the repository root, for two `DIR`s, then `diff`.

### Technical details
- Digest form: `sha256(image)[:16] + "+" + sha256(fn/phase/nlocals:cells; …)[:16]` for RV32; `sha256(bytes)[:16]`
  for Wasm; `sha256(JSON.stringify(events))[:16]` for inspection.

## Step 2: The front end writes only the tape; the Wasm backend serializes it

`FunctionEmitter` and `NumericFunctionEmitter` differed in six methods. The numeric versions became the only ones,
and `encodeFunction` turns a tape into the Wasm body the old mode wrote. The first full comparison was identical: 123
of 123 digests.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Items (1) and (2) of the plan, in place in `typed-wasm.js` so the diff is reviewable
before the split.
**Inferred user intent:** One emission path.
**Commit (code):** `380140d` — "refactor(typed): the front end writes only the tape; the Wasm backend serializes it"

### What I did
- `FunctionEmitter.emitConst/emitIndex/emitMemory/codeUnitAddress/emitLiteralStores/finish` are the tape writer's;
  `NumericFunctionEmitter` and `signed()` are deleted.
- `encodeFunction(fn, marks)`: opcode byte, then each operand cell as unsigned LEB128, signed for `i32.const`;
  `CHECKED_ADDRESS receiver position` → `local.get position; local.get receiver; i32.load 2 0; i32.ge_u; if void;
  unreachable; end; local.get receiver; local.get position; i32.const 1; i32.shl; i32.add`; `LITERAL_STORES address
  k` → per unit of `fn.literals[k]`, `local.get address; i32.const unit; i32.store16 1 (4 + 2i)`; any opcode without
  cells or `UNCHECKED_ADDRESS` throws. Then the old framing: `[size, locals…, instructions…]`.
- `compileWasmFunctions(source, base, imported, max, options)`: calls `compileFunctions` with an `onFunction` that
  serializes each tape and releases `fn.code` and `fn.literals`; `compile` and `linkWorld` use it.
- Inspection: the front end's event is `target: "tape"`; `compileWasmFunctions` passes the front end a wrapper
  `inspect` that keeps the event, and in `onFunction` emits `{...event, target: "wasm", operations}` with the Wasm
  operations decoded from the body, each with the source of the tape operation whose byte range contains it (`marks`).
  `fn[inspectedWasm] = {length, ranges}` replaces `fn.code.length` in `inspectWasmEmission`.
- `compileFunctions`'s fifth parameter (`numericOperands`) is now unused but kept, so `rv32/70-compile.js` (PIPELINE's)
  is untouched.
- `tests/compiler/typed-wasm-inspect.test.mjs`: the numeric frontend event's target is `"tape"`.

### Why
- Every operand that is not an `i32.const` is non-negative, and a block type is 0x40 or 0x7f, whose unsigned LEB128 is
  the byte itself, so one rule covers indices, memory immediates and block types; no format table is needed.
- Re-describing the event in the Wasm backend keeps the Wasm inspection output exactly as before (the CLI, the tests and
  the digest harness check it), and keeps the front end free of target knowledge.

### What worked
- `node scripts/01-digests.mjs --out after1.json; diff baseline.json after1.json` → `IDENTICAL` (123/123).
- Mutation check: a scratch copy with `4 + 2 * i` changed to `6 + 2 * i` in `pushLiteralStores` changed 8 digests (the
  units with literals), so the harness sees the serializer.
- `node --test tests/compiler/*.test.mjs`: 35 pass, 0 fail (4,184 tapes in the tape test).

### What didn't work
- `node --test tests/compiler/` (a directory argument) reported `✖ tests/compiler … 'test failed'` with 0 tests: this
  Node treats the directory as a file. Passing the files (`tests/compiler/*.test.mjs`) ran them.

### What I learned
- The old Wasm inspection spans came from `InspectionTape.push`, one span per push call, and the pseudo-op sequences
  were pushed without the lexer advancing, so one span per tape operation reproduces them exactly.

### What was tricky to build
- Event order and error wrapping. The front end used to emit the Wasm `frontend` event right after a function's
  emission; now the backend emits it from `onFunction`, which `emitFunctions` calls immediately after, inside
  `compileFunctions`'s `try`, so a throwing callback still surfaces as its own error (`InspectionCallbackError` is
  unwrapped there), and the async fallback path, which re-emits without `onFunction`, never reaches the callback.

### What warrants a second pair of eyes
- `describeWasmFunction` maps a Wasm operation to the last tape operation starting at or before its byte offset; this
  relies on `marks` being pushed for every tape operation in order.

### What should be done in the future
- Remove the unused fifth parameter of `compileFunctions` together with PIPELINE's `70-compile.js`.

### Code review instructions
- `git show 380140d -- compiler/typed/typed-wasm.js`; then the digest harness as in Step 1.

### Technical details
- The old fast paths (`value & 127` for small constants, raw bytes for indices < 128) produce the same bytes as LEB128.

## Step 3: Split typed-wasm.js into modules and bundle it back

A checked Python script moved every line of `typed-wasm.js` into one of ten modules; `frontend/build.mjs` concatenates
them back into `typed-wasm.js`. The digests stayed identical.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Item (3) and the bundle.
**Inferred user intent:** Files of one concern each, with no loader change.
**Commit (code):** `427a7de` — "refactor(typed): split typed-wasm.js into frontend/ and wasm/ modules, bundled by frontend/build.mjs"

### What I did
- `scripts/03-split-typed-wasm.py`: 22 anchored chunks of the body (each must start at its anchor, in order), every
  body line assigned exactly once (asserted), dry run by default, `--write` refuses to overwrite. Dry run: lexer 229,
  declarations 199, expressions 406, statements 286, frontend/inspect 78, compile 120, wasm/encode 104, module 118,
  wasm/inspect 49, link 89 lines; 1,678 lines from 1,684 body lines (blank lines between chunks are normalized).
- The class split: `class FunctionEmitter {` → `class ExpressionParser {` (constructor, tape writer, expressions,
  calls, members, buffer literals); `class FunctionEmitter extends ExpressionParser` (statements, `result`,
  `bufferWrite`, `function`, `finish`).
- `compiler/typed/frontend/build.mjs`: a fixed module list, one IIFE, `--check`; `make test-generated` runs it, and
  `typed-wasm-inspect.test.mjs` has the same check as `typed-rv32.test.mjs`'s.
- Edited the modules' comments after the split (one header per module; `unsigned()` now uses `pushUnsigned`).

### Why
- A script rather than hand cuts, per the rules for moves, and so that the claim "every line moved once" is checked.
- Inspection is split by owner (`frontend/inspect.js`, `wasm/inspect.js`) instead of the design's single
  `compiler/typed/inspect.js`, which would sit beside `tape.js` and look like another loaded script.

### What worked
- `node compiler/typed/frontend/build.mjs && node compiler/typed/frontend/build.mjs --check` → ok;
  digests → `IDENTICAL` (123/123), again after the comment edits; `node --test tests/compiler/*.test.mjs` 36 pass.
- `make test-generated`: rv32, frontend, candela (7 generated files current), vectors (15,664 current).

### What didn't work
- My first attempt to write `frontend/lexer.js` with a shell heredoc plus `sed -n` ranges was refused by the worktree
  guard ("this command is too complex to verify that it stays inside the worktree"); the split script replaced it.

### What I learned
- The bundle's top-level order matters only for `const` destructuring and `class … extends`; every other cross-module
  reference is a hoisted function or a class used at call time.

### What was tricky to build
- Anchors for lines with regexp literals (`TOKEN`): the Python string had to escape the JavaScript source exactly; the
  script's assertion caught nothing because it matched on the first try, but a wrong escape would have failed there.

### What warrants a second pair of eyes
- `MODULES` order in `build.mjs`: `expressions.js` must precede `statements.js` (extends) and every module that uses
  the tape constants at load time (none do; they are used inside functions).

### What should be done in the future
- PICOCALC-TYPED-PIPELINE writes a bundler for `rv32/`; the two `build.mjs` files can become one.

### Code review instructions
- `python3 ttmp/…/scripts/03-split-typed-wasm.py` (dry run) against `380140d`'s `typed-wasm.js`;
  `node compiler/typed/frontend/build.mjs --check`.

### Technical details
- The bundle prefixes each module with `// ---- frontend/lexer.js` etc., so a stack trace's line maps to a module.

## Step 4: Compile time and peak heap in QuickJS, and why the first heap number was wrong

The first comparison showed the RV32 Editor compile's peak heap 1.6 % above the base, deterministic over 12 rounds. It
turned out to be the cycle collector's phase, not live data: a comment line appended to the base bundle moved the peak
by 0.5 %. With the phase swept, the new compiler is 0.998x on peak and 0.99x on time.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The "Editor host compile time and peak heap within 2 %" gate, with a recorded method.
**Inferred user intent:** The split must not cost the boot compiles anything.
**Commit (code):** `bb46eb3` — "perf(typed-wasm): one-byte fast paths in the tape serializer; phase-swept QuickJS heap measure"

### What I did
- `scripts/04-compare-qjs.py`: base (`bf30d31`) and new `compiler/typed` in alternating order, one fresh runtime and
  one compile per run, for `typedRv32.compile(Editor, typedWorld.imports, 1 << 20, {policy: "interactive"})` (the
  playable boot path) and `compileTypedWorld(Editor, typed-world-reactor.wasm)`.
- First run (malloc_usable_size accounting, no phase control), 12 blocks: RV32 time 0.988x, peak 1,457,176 →
  1,481,200 B (1.016x, identical in every round); Wasm time 1.006x, peak 0.672x.
- Bisection: `380140d` alone (no split) gave 1.018x. Disabling the collector (threshold 10⁹) gave 0.992x;
  `JS_SetGCThreshold` before loading (32 KiB … 1 MiB) did not move the number. Appending one comment line to the
  base's `typed-wasm.js` gave +0.5 % (1,465,112 B).
- Changed the harness to count requested bytes in a size header (layout-independent; QuickJS's array growth uses the
  reported usable size, so this also removes glibc slack from the program's behaviour): the one-line padding still gave
  +0.6 %, so it was not glibc. QuickJS collects when the heap passes 1.5x its size after the previous collection, so
  everything allocated before the compile shifts where collections fall in it. `QJS_GC_PHASE=K` now sets the first
  trigger to `base * (1 + K/32)`; `04-compare-qjs.py` sweeps K = block % 16 for both arms. The padded base then gave
  0.994x: the artifact averages out.
- `encodeFunction` got the old one-byte fast paths (one-cell operand < 128; `i32.const` in −64…63).

### Why
- QuickJS is what the P4 runs and Node's heap is not comparable; a peak that depends on collection phase needs the
  phase controlled, or every refactor that adds a comment would "fail" the 2 % gate.

### What worked
- Final, 32 blocks each (`compare-final2`, `compare-final3`):

  | Compile (Editor) | time old → new (µs, median) | ratio | peak old → new (B, median over 16 phases) | ratio |
  |---|---|---|---|---|
  | RV32 `interactive` | 62,940 → 62,512; 63,388 → 62,902 | 0.993, 0.992 | 1,449,652 → 1,446,964 | 0.998 |
  | Wasm world | 39,918 → 40,738; 54,671 → 54,256 | 1.021, 0.992 | 2,157,134 → 1,408,194 | 0.653 |

  The image (59,260 B) and the Wasm module (92,162 B) are the same in every run (asserted).
- The Wasm peak falls by a third: the old mode kept every function's instruction bytes (`fn.code`) next to its framed
  body until the module was written; the new backend releases the tape once it is serialized.

### What didn't work
- The first heap method (above). Also the compound `mkdir … && git show 380140d:… > … && …` was refused by the worktree
  guard; `git show` alone into a scratch file worked.

### What I learned
- A peak-heap gate in QuickJS needs a collector-phase sweep; a deterministic number is not a stable one.

### What was tricky to build
- Telling layout and collector artifacts from live data: three hypotheses (prototype-chain shapes, glibc slack, the
  collector) were separated by (1) disabling the collector, (2) a layout-independent allocator, (3) padding-only
  variants of the base.

### What warrants a second pair of eyes
- Wasm time: 1.021x in one 32-block run and 0.992x in the next (host load average 1.7); the boot path does not compile
  Wasm.

### What should be done in the future
- Use `02-qjs-measure.c` with `QJS_GC_PHASE` sweeps for future heap gates; TAPE's `02-qjs-compile-time.c` has no heap
  number.

### Code review instructions
- Build: `cc -O2 -DCONFIG_VERSION='"host"' -I firmware/third_party/quickjs -o qjs-measure scripts/02-qjs-measure.c
  firmware/third_party/quickjs/{quickjs,libregexp,libunicode,cutils,dtoa}.c -lm -lpthread`; run
  `python3 scripts/04-compare-qjs.py qjs-measure OLD_DIR compiler/typed editor.typed firmware/build/typed-world-reactor.wasm --blocks 32`,
  with `editor.typed` the files of `apps/typed/editor/source.list` each followed by a newline.

### Technical details
- Peak = max over the compile of the runtime's requested bytes, minus the bytes after loading and one `JS_RunGC`.

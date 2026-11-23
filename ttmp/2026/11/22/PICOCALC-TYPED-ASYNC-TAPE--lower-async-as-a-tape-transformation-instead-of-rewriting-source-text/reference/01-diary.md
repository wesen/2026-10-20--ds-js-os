---
Title: Diary
Ticket: PICOCALC-TYPED-ASYNC-TAPE
Status: active
Topics:
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: compiler/typed/async/build.mjs
      Note: bundles the async modules into typed-async.js
    - Path: compiler/typed/frontend/compile.js
      Note: configureGeneratedLexer maps diagnostics to original positions; the second compile is gone
    - Path: tests/compiler/typed-async.test.mjs
      Note: the continuation fixtures and 18 exact diagnostics
ExternalSources: []
Summary: "The study (no-go for a tape transformation), the error path without a second compile, the split of typed-async.js into compiler/typed/async/, and the gates."
LastUpdated: 2026-11-22T22:00:00-05:00
WhatFor: "How PICOCALC-TYPED-ASYNC-TAPE was decided and done, with evidence."
WhenToUse: "Reviewing the ticket's commits or reopening async-as-a-tape-transformation."
---

# Diary

## Goal

This diary records PICOCALC-TYPED-ASYNC-TAPE: the study of async lowering as a tape transformation, the decision, what
replaced the text rewrite's error path, the module split, and the gates with their numbers.

## Step 1: Baseline, harnesses and the async test cases

I brought the branch up to main (`git merge --ff-only main`, to `6195cab`). Then I looked for the "async test cases in
`tests/compiler`" that the gate names. There were none. The async fixtures lived only in PICOCALC-CONTINUATION-G's
`scripts/14-check-async-layout.mjs`, which still loads `picocalc-os/...` paths from before the repository layout
change. I turned them into `tests/compiler/typed-async.test.mjs`, with every diagnostic's exact message and position,
and recorded the 125 digests of the base compiler with the FRONTEND ticket's digest harness, adapted to `app.json`.

### Prompt Context

**User prompt (verbatim):** "TICKET: PICOCALC-TYPED-ASYNC-TAPE — replace compiler/typed/typed-async.js's source-text
rewriting (its own scanner, cursor parser, TypeChecker subclass, liveness, field allocation, text generation, and the
recompile-to-remap-errors path in compileFunctions) with async lowering inside the front end and as a tape
transformation. Study first; implement only if sound and not slower; otherwise split typed-async.js into modules and
record why." The work plan, from the same prompt:

- Diary in the investigation format.
- Step 1 is the design study, with a go/no-go decision.
- Gates:
  - Editor `asyncLayout` at 70 fields or fewer, with the same Editor turn counts;
  - 24/24 replays in `make test-host`, default and `OPTIONS='{"policy":"kernel"}'`, ray `430f0d501659`, Chess
    6,981 words;
  - `make test`, including the file-length check;
  - async error positions unchanged;
  - Editor compile time and requested-byte peak no worse in bare QuickJS on the host;
  - a board study only if images change.
- GOWORK in `/tmp` for the worktree.
- Moves and deletes through checked Python scripts.
- Regenerate bundles with their build scripts.
- Stay in typed-async.js, `frontend/`, their loaders and tests.

**Assistant interpretation:** Decide on evidence whether async lowering can become a tape pass in the streaming front
end without changing images or getting slower. Implement it if it can. Otherwise split the file, and remove what is
removable without changing output.

**Inferred user intent:** One parser of the language, a robust error path, and code organized by concern, with no
regression on the device.

**Commit (code):** `1a56982` — "test(typed-async): the continuation fixtures as tests/compiler/typed-async.test.mjs; digest and QuickJS harnesses"

### What I did

- `tests/compiler/typed-async.test.mjs`:
  - the four-task world on WebAssembly against a miniature reactor (busy start, failed starts, nested frames with a
    caller field, cancel, resume);
  - the layouts (fixture 27 fields, professor `openFile` 5, overlap 5, Editor 57 + 13 = 70);
  - 18 diagnostics, each compared exactly on `typedWasm.compileFunctions` and `typedRv32.compile`.

  Sixteen diagnostics come from CONTINUATION-G. I added two: an error after `cancel`/`start` replacements on the same
  line, and a type error after `resume()`/`pending()` replacements in `typedWorldEvent`. Those exercise the remapping
  of rewritten bodies. `firmware/Makefile` `test-apps` runs the test.
- `scripts/01-digests.mjs`: FRONTEND's harness, with sources read from `app.json` and two `async/*` digests (Editor's
  `asyncLayout` and `asyncSource`). 125 digests in all.
- `scripts/03-qjs-measure.c` and `04-compare-qjs.py`: FRONTEND's QuickJS harness and its alternating, phase-swept
  comparison, renamed.
- Built the reactors in the worktree:
  - `bash firmware/tools/wasm-toolchain.sh`
  - `make -s -C firmware typed-world-reactor build/agenda-reactor.wasm build/files-reactor.wasm`
- Base digests: `node scripts/01-digests.mjs --compiler <copy of compiler/typed at 6195cab>`. Result: 125 digests and
  6 errors. The errors are the same expected ones as FRONTEND's: Wasm alone has no SDK, and `wasm/editor` exceeds the
  64 KiB default.
- `make test` at base (GOWORK in the scratchpad): passed.

### Why

- A gate on "error positions unchanged" needs exact messages. The CONTINUATION-G script matched regexps, which would
  not notice a moved column.

### What worked

- All 18 messages agree between the targets. The table records them, for example
  `23:9: text is live across the wait at line 23; obtain it again after the wait`,
  `3:95: unknown field WorldState.missing` and `6:37: expected i32, got bool`.

### What didn't work

- `make -s -C firmware build/editor-reactor.wasm` failed with `make: *** No rule to make target
  'build/editor-reactor.wasm'.  Stop.` The target no longer exists, and no harness needs it.
- The first layout assertion I wrote used 28 fields. The test failed with `27 !== 28`, and the fixture really has 27.
- A heredoc combined with `node` and `git archive | tar` was refused by the worktree guard ("too complex to verify").
  I used the Write tool and a plain `cp -r compiler/typed` instead.

### What I learned

- The test the gate refers to did not exist in `tests/compiler`. The only exact positions checked were
  CONTINUATION-G's two `assert.equal`s.

### What was tricky to build

- The fixture's `wasmReactor` reproduces the linker's slot contract by hand: SDK exports call `mock` imports, and the
  entry slots are stubs. I copied it unchanged, because a reimplementation could hide a difference.

### What warrants a second pair of eyes

- The two diagnostics I added are the only ones that cover remapping within rewritten bodies.

### What should be done in the future

- N/A

### Code review instructions

- `node --test tests/compiler/typed-async.test.mjs`
- `TYPED_ASYNC_PRINT=1 node --test tests/compiler/typed-async.test.mjs` prints the messages instead of comparing them.

### Technical details

- Base: `6195cab`. The digest file is in the scratchpad and is not committed. Any revision can regenerate it with the
  harness.

## Step 2: The study and its decision

I studied what a tape transformation would need and measured where the rewrite spends its time. The decision is
no-go. A tape pass would have to rebuild the control tree that `AsyncBody` builds already, and Editor's layout is
minimal, so the transformation would have to reproduce today's tape byte for byte. Streaming still needs a
whole-program pre-pass. Text generation is a small part of the cost, and on the device the C lexical index reads the
generated text. The study is in the design doc, "## Study (2026-11-22)".

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Step 1 of the work plan, with a go/no-go decision.
**Inferred user intent:** No large rewrite without evidence that it pays.
**Commit (code):** `2bc4743` — "docs(typed-async-tape): the study: no-go for a tape transformation, split into modules instead"

### What I did

- Read `typed-async.js` end to end, and the front end (`frontend/*.js`, the `configureGeneratedLexer` and
  `isGeneratedLocal`/`generatedWordType`/`generatedStartFields` hooks).
- Dumped Editor's layout: Find saves 5 scalars, and Open saves `handle` at its first wait and `handle`, `length`,
  `read` and `written` at its second. Each one is read after its wait, so none can go.
- Node timing, warm: `typedAsync.rewrite` takes 2.48 ms and an `interactive` RV32 compile 8.95 ms. The generated
  text is 14,946 units and 299 lines; 5 of 112 bodies are rewritten.
- `node --cpu-prof`: the rewrite's inclusive time is split among `readProgram` (60), `scanOperations` (48, of which
  `scanOrdinaryCalls` 45) and `analyze` (51), in sampled ms over 35 runs. `render` and `GeneratedText` do not appear.
- Read PICOCALC-EG-QUAL's phase measurements on the device. Text construction was 57.1 ms of the rewrite's 906.8 ms.
  The index, token reuse and spans brought the native cold compile to 2.606 s, against 2.646 s hand-written.

### Why

- The ticket allows a split instead when the tape transformation is not sound or would be slower.

### What worked

- The constraints settled the question without a prototype. Byte identity, the whole-program dependence of the
  generated function set and of the start-guard offsets, and the binding names in `asyncLayout` together leave a tape
  pass with nothing to gain.

### What didn't work

- N/A

### What I learned

- The generated text is cheap on the device because the C scanner indexes it like the original. A JavaScript token
  stream would have made the device slower.
- The real duplicate work is the host-only regexp scan of ordinary bodies (`scanOrdinaryCalls`). On the P4,
  `indexedBodies` replaces it.

### What was tricky to build

- I considered a middle design: chunks lexed as tokens with original positions, read by one lexer without
  materializing text. It would have removed the second compile too. It loses the C index on the generated text,
  though, so I chose the smaller change in Step 3.

### What warrants a second pair of eyes

- The claim that the layout cannot improve rests on Editor alone. Programs with several awaits per frame could
  share slots between waits. The current allocation gives each saved binding one field per frame.

### What should be done in the future

- Fold the operation scan into `scanSignatures`.
- Map inspection positions of lowered code to the original source.

### Code review instructions

- Read the design doc's study. The numbers come from the scratchpad scripts `time.mjs` and `prof.mjs`, which use
  `bench/lib/compiler.mjs` and the Editor sources from `app.json`.

### Technical details

- Editor layout: 57 declared fields.
  - Find: state, token, `at`, `end`, `anchor`, `foldedAt`, `phase`.
  - Open: state, token, `handle`, `length`, `read`, `written`.
  - 70 in all.

## Step 3: Diagnostics at original positions without a second compile

`compileFunctions` used to catch a `SyntaxError` from the span emitter and compile the whole lowered text again with
`emitFunctions`, only to obtain a line and column in the lowered text. It then mapped them back through the chunks
(`GeneratedText.remap`). Now each lexer over lowered code knows where it starts in the lowered program. Its `fail`
maps the token's offset straight through the chunks, `lowered.originalAt(base + token.at)`, and formats the original
line and column the way `Lexer.fail` does. The 18 diagnostics and the 125 digests are unchanged.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Remove the recompile-to-remap path, which the study keeps out of the no-go.
**Inferred user intent:** A robust error path.
**Commit (code):** `6ead992` — "refactor(typed-async): lowered-code lexers report original positions; no second compile to remap errors"

### What I did

- `typed-async.js`: `GeneratedText.originalAt(offset)` (the chunk binary search from `remap`). `result()` publishes
  `originalAt` instead of `remap`. A rewritten body's plan entry carries `from`, its offset in the lowered program.
- `frontend/compile.js`:
  - `configureGeneratedLexer(lex, lowered, base)` overrides `fail` for the generated lexer (base `generatedAt`) and
    for each rewritten body's lexer (base `body.from`);
  - `compileFunctions` no longer catches and recompiles. The `lexicalScope?.sources.clear()` and the internal error
    "span emitter rejected the canonical program" are gone;
  - `emitFunctions` lost its `lowered` parameter.
- `node compiler/typed/frontend/build.mjs`

### Why

- The second compile cost a whole compile on every error, and it could disagree with the first, hence the internal
  error. The span lexers already know their offsets.

### What worked

- `diff base-digests.json remap-digests.json`: identical (125).
- `typed-async.test.mjs`: 6/6, with all 18 messages unchanged.
- `typed-wasm-inspect` and `typed-inspect`: 8/8. `tests/apps/editor.test.mjs`: 10/10.

### What didn't work

- A Python heredoc that wrote JavaScript containing `"\\n"` was refused by the worktree guard ("too complex to
  verify"). I used the Edit tool.

### What I learned

- The old remap and the new mapping compute the same position: offset in a copied chunk is the same character, and
  in generated text it is the chunk's statement. The only change is which compile's error is reported: the span
  emitter's own instead of the canonical one. Both run the same emitter code in the same function order.

### What was tricky to build

- `fn.bodyAt` of a rewritten body is set to the body text's own offset 0 while it is emitted, so the token offsets
  are relative to the body text. The base has to be the body's offset in the lowered program (`body.from`), not
  `fn.bodyAt`.

### What warrants a second pair of eyes

- Errors at an end-of-file token inside a rewritten body's lexer map to the offset just after the body. The old path
  reported the canonical text's next real token. This only happens in a malformed body that the scanner accepted.

### What should be done in the future

- Step 5 replaces the `fail` override with a `catch` (`originalError`), because the override cost about 8 KB of
  peak heap.

### Code review instructions

- `compiler/typed/frontend/compile.js`: `compileFunctions`, `originalError` (since Step 5).
- `compiler/typed/async/text.js`: `originalAt`.

### Technical details

- Message format: `lines = original.slice(0, at).split("\n"); lines.length + ":" + (lines.at(-1).length + 1)`. This
  equals `Lexer.fail` and typed-async's `location`.

## Step 4: typed-async.js split into compiler/typed/async/

`scripts/05-split-typed-async.py` moves every line of `typed-async.js` into eight modules. It asserts that the chunks
start at their anchors, that every body line is covered exactly once, that the non-blank lines are the same multiset,
and that no module exists yet. `compiler/typed/async/build.mjs` bundles the modules back into `typed-async.js`, as
`frontend/build.mjs` does for `typed-wasm.js`, so every loader keeps reading one file.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The no-go branch: split into modules (scanner, body parser, liveness, allocation,
rendering) under `compiler/typed/async/`.
**Inferred user intent:** One home per concern, and files under the length limit.
**Commit (code):** `f101195` — "refactor(typed-async): typed-async.js built from compiler/typed/async/ modules"

### What I did

- `python3 scripts/05-split-typed-async.py` (dry run), then `--write`. The modules:
  - `scan.js`: 231 lines, from 6-12, 37-75 and 119-304;
  - `body.js`: 328 lines, from 13-36, 76-118 and 305-566;
  - `liveness.js`: 79;
  - `allocate.js`: 50;
  - `text.js`: 85, `GeneratedText` and `render` plus the text helpers;
  - `lower.js`: 206, `cut` and `emitStep`;
  - `tasks.js`: 108;
  - `rewrite.js`: 78.
- `compiler/typed/async/build.mjs`, with `--check`.
- `Makefile` `test-generated` runs `node compiler/typed/async/build.mjs --check`.
- `typed-async.test.mjs` checks that the bundle is fresh.
- `tools/file-length-exceptions.txt`: the entry `typed-async.js -- PICOCALC-TYPED-ASYNC-TAPE` became
  `-- generated from compiler/typed/async/*.js by compiler/typed/async/build.mjs`, under "Vendored and generated". The
  bundle is 1,204 lines.
- Comments and docs:
  - `frontend/statements.js` and `frontend/inspect.js` (the stale "Async syntax recovery" comment);
  - `docs/typed-compiler.md`: the table row, the pipeline, a new "The async lowering's modules" section, and the
    `compile.js` row;
  - `docs/typed-compiler-and-the-ray-tracer.md`.

### Why

- The loaders stay unchanged: firmware `typed/async.js` (`typed_apps.py`), bench, trace REPL, tests and
  `typed-inspect.mjs`. Only Editor's `app.json` loads `typed/async.js` on the device.

### What worked

- `diff base-digests.json split2-digests.json`: identical (125).
- `node tools/check-file-length.mjs`: "851 source files, 96 over 500 lines, all listed (16 files, 2 trees)".
- Tests: 12/12 (typed-async and typed-wasm-inspect).

### What didn't work

- The first dry run failed with `AssertionError: (5, 5)`. I had treated the blank line after `"use strict"` as the
  first body line. Fixed the bounds, and added the non-blank multiset assertion because 7 trailing blank lines at
  chunk ends are dropped (1,165 lines from 1,172).

### What I learned

- Module order matters only where a class extends another at load time: `AsyncBody extends Cursor` inside `body.js`,
  and `TypeChecker extends typedWasm.FunctionEmitter`, which needs typed-wasm.js loaded first.

### What was tricky to build

- `text.js` takes two chunks, `GeneratedText`/`render` and the text helpers that sat between `cut` and `emitStep`.
  `lower.js` takes `cut` and `emitStep` around them. The helpers are top-level `const`s that are used only at call
  time, so the order is safe.

### What warrants a second pair of eyes

- Nothing changes in behavior. The bundle's text differs from the old file (module separators and headers), so the
  firmware's cached QuickJS bytecode for `typed/async.js` changes with the next build.

### What should be done in the future

- N/A

### Code review instructions

- `python3 ttmp/.../scripts/05-split-typed-async.py` (a dry run on the pre-split file reproduces the table above).
- `node compiler/typed/async/build.mjs --check`, `make test-generated`.

### Technical details

- The bundle starts with a "Generated from compiler/typed/async/" header. Each module is preceded by
  `// ---- async/NAME.js`.

## Step 5: QuickJS time and peak, a correction to Step 3, and the gates

The first QuickJS comparison after the split looked worse. Compile time was +1.3 % on RV32 and +1.5 % on Wasm. The
median peak above the post-load heap was +0.8 % (+12,200 B), and the shift was the same at every collector phase. I
bisected it to Step 3's `fail` override. Setting an own `fail` property on six lexer instances cost about 8 KB of the
compile's live peak. The mapping moved into a `catch` around each lowered function's emission (`originalError`),
which costs nothing unless an error is thrown. After that, time is within noise. The relative peak stays 8,160 B
higher, but a control shows that this is the resolution of the metric for code that never runs.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The QuickJS gate: Editor compile time and requested-byte peak no worse.
**Inferred user intent:** No device regression from a refactor.
**Commit (code):** `a2c0a2c` — "perf(typed-frontend): map lowered-code diagnostics in a catch, not an overridden fail"

### What I did

- Built `scripts/03-qjs-measure.c` (with `base=`, the post-load heap, added to its output). Ran
  `python3 scripts/04-compare-qjs.py qjs-measure <base 6195cab compiler/typed> compiler/typed editor.typed firmware/build/typed-world-reactor.wasm --blocks 32`.
- Swept the 16 collector phases (`QJS_GC_PHASE=0..15`) per variant: base; the new `typed-async.js` alone (A); the
  new `typed-wasm.js` alone (B); the unsplit Step 3 commit `6ead992` (D); the override disabled (E); the loop's
  `catch` removed (F).
- Built a QuickJS copy in the scratchpad whose collector threshold after each collection is `size + QJS_GC_STEP`
  rather than `1.5 × size`. With steps from 256 B to 256 KB, the peak above the post-load heap approximates the
  peak of live data. Not committed: it is a measuring instrument.
- Printed the atom and shape counts before and after the compile (1909→2026 atoms, 317→322 shapes, the same in base
  and new: no table resize). Printed the data retained by the result after a collection: 529,820 B base, 529,844 B
  new.
- Measured the front end alone (`QJS_RUN` overriding the compile expression):
  - `typedAsync.rewrite`: 804,676 → 796,356 B;
  - `typedWasm.compileFunctions`: 966,228 → 958,252 B, so the front end peaks 8 KB lower.
- Control: added 1 to 4 small functions to the *base* `typed-wasm.js`, never executed but referenced from
  `emitSpanFunctions` (unreferenced ones are freed with the IIFE and change nothing). The relative peak went
  1,418,644 → 1,422,732 → 1,430,876 B, and the post-load heap fell by about 4 KB.

### Why

- A peak that moves by 4 KB quanta with code that does not run cannot rank two compilers whose difference is a
  `catch` clause. The live-data and retained-data measurements say what the change does: nothing on the success
  path.

### What worked

- Final comparison (32 blocks, phases swept):
  - `rv32 out 59260 B compile old 61680 new 61768 us ratio 1.001 peak old 1442924 new 1451084 B ratio 1.006`
  - `wasm out 92162 B compile old 38120 new 38432 us ratio 1.008 peak old 1404154 new 1408086 B ratio 1.003`
- Fixed-step live peak, RV32 compile (step 256 B to 256 KB alike): base 1,418,644 B above 1,227,058; new 1,426,804 B
  above 1,222,703. The absolute heap at the peak (loaded compiler plus compile) is +3,805 B (+0.14 %).
- Digests: 125 identical to base. 18 diagnostics unchanged. `node --test tests/compiler/*.test.mjs`: 43/43.

### What didn't work

- The override design of Step 3. It was correct, but it cost peak heap: varB (new `typed-wasm.js` with the override)
  was +4 KB, D was +12,152 B, E (override disabled) +4,280 B.
- Removing the loop's `catch` (F) did not lower the peak (1,426,804 B), which confirmed that the rest is not
  execution cost.

### What I learned

- In QuickJS the post-load heap and the compile's peak above it trade 4 KB quanta when the loaded code changes. Dead
  code that no closure references is freed with the IIFE and has no effect.
- An own property on a hot object is not free in QuickJS: the instances get a new shape, and the heap notices.

### What was tricky to build

- Attributing the shift. The phase sweep alone could not separate collector scheduling from live data. The
  fixed-step collector, the front-end-only runs, the retained-result measure and the dead-code control together
  could.

### What warrants a second pair of eyes

- Whether the gate should be read on the relative peak (+0.6 % median; +8,160 B live) or on the absolute heap
  (+0.14 %). The front end itself, the only code this ticket changed, peaks 8 KB lower.

### What should be done in the future

- A peak-heap gate in QuickJS needs a control: the same measurement with a no-op change of similar size.

### Code review instructions

- `compiler/typed/frontend/compile.js`: `originalError`, and the `catch` in `emitSpanFunctions`.
- Re-measure with `scripts/04-compare-qjs.py` as above.

### Technical details

- Gates on `a2c0a2c`:
  - `make test` passed (GOWORK in the scratchpad);
  - `make test-host`: ray `430f0d501659` (reference), 6981 words, 24/24 workflows;
  - `make test-host OPTIONS='{"policy":"kernel"}'`: ray `430f0d501659`, 6981 words, 24/24 workflows.
- Editor: `asyncLayout` 70 fields (57 declared). The images are identical (the `world/editor`, `rv32/editor/*` and
  `async/editor-*` digests). The Editor workflows therefore execute the same guest code turn for turn, and every
  `editor-world.mjs` run passes (matching Wasm and RV32 framebuffers: 3 default, 3 `--large`, 4 `--edit`,
  4 `--positions`, 4 `--find`). No board study, because no image changed.

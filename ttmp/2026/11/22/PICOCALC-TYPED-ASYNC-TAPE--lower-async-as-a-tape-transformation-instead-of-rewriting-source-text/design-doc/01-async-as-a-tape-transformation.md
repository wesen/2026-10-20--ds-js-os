---
Title: Async as a tape transformation
Ticket: PICOCALC-TYPED-ASYNC-TAPE
Status: active
Topics:
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Replace typed-async.js's source-text rewriting (its own lexer, parser, liveness and error remapping by recompiling) with async lowering inside the front end and on the tape."
LastUpdated: 2026-11-22T19:30:08.003113358-05:00
WhatFor: ""
WhenToUse: ""
---

# Async as a tape transformation

## Problem

`compiler/typed/typed-async.js` (1,182 lines) rewrites `async` functions into ordinary Typed source before the front end sees them. It has its own regex scanner (`candidate`, `ordinaryCall`), a `Cursor`/`AsyncBody` parser, a `TypeChecker` subclass of `typedWasm.FunctionEmitter`, liveness (`liveSequence`, `liveBefore`, `analyze`), field allocation in `WorldState` (`allocate`) and text generation (`GeneratedText`, `render`, `cut`). The generated text is lexed again with span maps (`configureGeneratedLexer`, `emitSpanFunctions` in `typed-wasm.js`); when it fails to compile, `compileFunctions` compiles the canonical text a second time only to remap the error. The result is two parsers of one language and a fragile error path. Editor's Open and Find use it: 70 scalar fields, one fewer than the hand-written version, compile cost +3 % after span reuse.

## Design (study first)

Step one is a design study recorded in this ticket: how the front end can parse `async`/`await` itself and emit a tape with an `await` pseudo-op, and how a tape pass splits the function into `start` and `resume` entry points with live scalars stored in `WorldState` fields, reusing the existing liveness ideas on the tape. Constraints: streaming per function, no syntax tree, the same `asyncLayout` contract the reactor (`firmware/sdk/typed/world.c`) and Editor rely on, and source positions for errors without recompiling.

If the study shows a tape-level transformation is sound and not slower, implement it and delete `typed-async.js`. If it is not, record why and instead split `typed-async.js` into modules (scanner, body parser, liveness, allocation, rendering) under `compiler/typed/async/`.

## Study (2026-11-22)

**Decision: no-go for the tape transformation.** `typed-async.js` is split into modules under
`compiler/typed/async/` instead. Its one fragile path, the second compile that remaps an error, is replaced by
lexers that report positions in the original source directly. Images stay byte-identical. The reasons follow.

### What a tape transformation would have to do

The tape is structured like WebAssembly's control flow: `block`, `loop`, `if`/`else`, `end` and `br` with a depth.
A resumed function has to continue in the middle of a loop or a branch. A structured tape cannot jump into a block,
so the lowering cannot be a local rewrite of the tape. `cut` in `typed-async.js` turns the function into pieces
dispatched by `pc` inside one `while (pc >= 0)` loop. A tape pass would have to do the same work, in this order:

1. Decode the tape.
2. Rebuild a tree of the control constructs that contain an await. The statement-level parts of this tree are what
   `AsyncBody` builds today.
3. Find the stack-depth-zero points between statements. Expression-level control (`&&`, `||`, the match interval
   tests and the start guard all write `if i32`) must not be cut.
4. Run liveness over local indices.
5. Emit a new tape: the dispatch loop, the saves, the reloads, and the statement segments with their locals
   renumbered.

That is the current statement skeleton built from tape cells instead of tokens, so it is no simpler. It has two
further costs:

- **The layout needs names.** The `asyncLayout` contract (field names `…_v<binding>_<name>`, `waits[].saved` by
  name, `line`) and the diagnostic "*x* is live across the wait at line *N*; obtain it again after the wait" need
  binding names and source positions. The tape has only local indices. The front end would have to carry a side
  table from locals to names.
- **Byte identity is mandatory.** Editor's layout is already minimal:
  - Find saves `at`, `end`, `anchor`, `foldedAt` and `phase`. All five are read after the yield.
  - Open's second wait saves `handle`, `length`, `read` and `written`. All four are read after it.
  - Each frame needs `state` and `token` for the reactor's completion matching.

  That makes 13 fields over 57 declared, 70 in all. Neither design can lower the count. Under the gate (images may
  change only if the layout improves), a tape pass would have to reproduce exactly the tape that the text lowering
  yields today: the local numbering (aliases first, then `pc`, then one `__word` per await in emission order), and
  the shapes of `!(x === 0)`, `if (v) return 1; return 0;` and `i32(x)`. That is a second implementation of
  `emitStep`, with no gain to show for it.

### Streaming does not remove the pre-pass

The front end streams each function to the backend as soon as it is parsed. Several things in an ordinary function
depend on the whole program:

- the set and the indices of the generated functions: a step function per frame, then `start` per task, `cancel`
  only for a task that some function cancels, `pending` and `resume` only if used;
- the frames themselves: only tasks named by `start`, plus the async functions they await;
- the start guard's field offset: declared fields plus the fields of the earlier frames, which depend on the
  liveness of async bodies that may come later in the source. Editor calls `start editorOpenTask` before declaring
  it.

A streaming front end must know all of that before the first ordinary body reaches the backend. Some pass has to
read the operations in every body first, whether it works on text, tokens or the tape. On the P4 this pass is
already cheap: `indexedBodies` reads the C lexical index rows (`typed_lex_index.c`) without running the regexp. An
async-first parse inside the front end would only move the pass.

### Text generation is not the cost

- PICOCALC-EG-QUAL measured the original rewrite on the device:
  - reading the program took 440.8 ms;
  - scanning for operations took 181.4 ms;
  - analyzing the tasks took 160.7 ms;
  - building the text took 57.1 ms, about 6 % of the rewrite.

  The lexical index, token reuse and source spans brought Editor's native cold compile to 2.606 s, against 2.646 s
  for the hand-written Editor.
- The generated text (14,946 units, 299 lines) is indexed by the same C scanner as the original source. A token
  stream built in JavaScript would lose that index on the device.
- On the host (Node, Editor, warm), `typedAsync.rewrite` takes 2.5 ms of the 9.0 ms of an `interactive` RV32
  compile. In a CPU profile its time divides about evenly among three parts:
  - reading declarations and signatures, and tokenizing the candidate bodies;
  - the regexp scan of the 107 ordinary bodies (`scanOrdinaryCalls`), used only when no index exists;
  - the `AsyncBody` parse with its `TypeChecker`.

  None of the three is text generation.

### What stays and why

- **The scanner** (`candidate`, `indexedBodies`, `scanOrdinaryCalls`, `scanOperations`) is the whole-program pre-pass
  that streaming needs.
- **`Cursor`/`AsyncBody` and `TypeChecker`.** `TypeChecker` is the real `FunctionEmitter`, with its writers turned
  off. Every expression and simple statement of an async body is checked by the same code that compiles it. It is
  the second user of the parser, not a second parser.
- **Liveness and allocation** work on bindings, because the layout and the diagnostics name bindings.
- **The text generator.** Copied chunks keep the original characters, and generated chunks carry the position of
  the statement they implement.

### What changes

- **No second compile for errors.** `compileFunctions` used to catch a `SyntaxError`, compile the whole lowered text
  again with `emitFunctions` only to get a line and column in it, and map that back through the chunks
  (`GeneratedText.remap`, and an internal error if the second compile passed). The lexers of the rewritten bodies
  and of the generated functions now report the original position themselves: `configureGeneratedLexer(lex, lowered,
  base)` overrides `fail` with `lowered.originalAt(base + token.at)`. The position is the same one the remap
  computed. The test is the 18 diagnostics in `tests/compiler/typed-async.test.mjs`, each with its exact message,
  on both targets.
- **Modules.** `compiler/typed/async/{scan,body,liveness,allocate,text,lower,tasks,rewrite}.js` are bundled into
  `typed-async.js` by `compiler/typed/async/build.mjs`, as `frontend/build.mjs` bundles `typed-wasm.js`. Every loader
  (firmware `typed/async.js`, bench, trace REPL, tests) still reads one file. `make test-generated` checks the bundle.

### Future work this study points to

- Fold the operation scan into `scanSignatures`, which already passes over every body (`skipBody`). Then the
  host's regexp scan of ordinary bodies disappears. This changes the order in which errors are reported, so it needs
  the diagnostic table.
- Map inspection positions of lowered code through `originalAt` as well, so that `unit: "original"` holds for every
  function. This changes inspection events, not images.

## Gates

- Editor's async build: same `asyncLayout` field count (70 or fewer), same turn counts on the Editor workflows, every replay passing; RV32 and Wasm images may change only if the layout improves, and then the device workflows are rerun.
- Error messages point at the same source positions for the async test cases in `tests/compiler`.
- Board: Editor's boot compile time and peak heap no worse in a paired study.

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

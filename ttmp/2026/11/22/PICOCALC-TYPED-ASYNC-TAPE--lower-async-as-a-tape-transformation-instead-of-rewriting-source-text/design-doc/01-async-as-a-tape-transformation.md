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

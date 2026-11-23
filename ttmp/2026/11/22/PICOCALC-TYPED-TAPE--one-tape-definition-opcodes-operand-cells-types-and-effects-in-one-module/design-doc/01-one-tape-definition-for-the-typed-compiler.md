---
Title: One tape definition for the Typed compiler
Ticket: PICOCALC-TYPED-TAPE
Status: active
Topics:
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Define the tape (the Typed compiler's IR) once: opcode names, operand cells, operand and result types, effects; every producer and consumer reads it."
LastUpdated: 2026-11-22T19:30:03.21364409-05:00
WhatFor: ""
WhenToUse: ""
---

# One tape definition for the Typed compiler

## Problem

The *tape* is the Typed compiler's intermediate representation: a flat array of numbers per function, in which each operation is a WebAssembly opcode followed by its operands as plain cells (not LEB128), plus three pseudo-ops: `0xf1 receiver position` (checked UTF-16 address), `0xf2 address literalIndex` (checked literal stores), `0xf3 …` (unchecked address, three cells). `NumericFunctionEmitter` in `compiler/typed/typed-wasm.js` produces it; the RV32 backend consumes it.

Nothing defines it in one place. Today its knowledge is spread over:

- `typed-wasm.js`: `const OP` (12 names) and raw hex everywhere else; `inspectOperations` decodes it for inspection;
- `compiler/typed/rv32/20-inline-and-commute.js`: `OPERAND_CELLS` (operand cell counts per opcode);
- `compiler/typed/rv32/70-compile.js`: `storeless()` tests `0x36`, `0x3b`, `0xf2`, `0x10` inline;
- `compiler/typed/rv32/30-version-loops.js` (`opNext`, `opClose`) and every pass that matches opcodes by number;
- `compiler/typed/typed-pie-loops.js`: `const get = 0x20, set = 0x21, literal = 0x41, add = 0x6a, address = 0xf1`;
- `compiler/typed/tools/typed-inspect.mjs`, `tests/compiler/typed-rv32.test.mjs`, the trace REPL's documentation and examples (`cmd/trace-repl/examples/21-watch-the-passes.js`, `observeTape`).

The tape also carries no types: every operation is assumed to be `i32`. Floats (PICOCALC-TYPED-F32) need typed operations.

## Design

A new file, `compiler/typed/tape.js`, loaded before `typed-wasm.js` wherever the compiler is loaded (Node tests, `bench/lib/compiler.mjs`, the trace REPL's compiler module table in `pkg/tracecompiler`, the firmware bundle in `firmware/port/esp32p4/main/CMakeLists.txt` `BUNDLE_EXTRA`, the device's compiler bytecode cache). It defines `globalThis.typedTape`:

```js
// one row per opcode the tape may contain
{ code: 0x6a, name: "i32.add", cells: 0, pop: ["i32","i32"], push: ["i32"], effects: 0 }
{ code: 0xf1, name: "checked.address", cells: 2, pop: [], push: ["i32"], effects: TRAP }
```

- `cells` replaces `OPERAND_CELLS`; `effects` is a bit set (`STORE`, `CALL`, `BRANCH`, `TRAP`, `CONTROL`) that replaces the inline opcode tests in `storeless` and in the passes;
- named constants (`T.I32_ADD`, `T.LOCAL_GET`, …) replace every raw hex literal in the compiler, the PIE pass, the inspector and the tests;
- `next(tape, at)`, `decode(tape)` (for tools only; the passes keep walking raw cells, because decoding to objects cost a quarter of the compile in bare QuickJS) and `name(code)`;
- type columns use WebAssembly's value types so `f32` later adds rows, not structure.

Where the tape is also a WebAssembly byte stream (the Wasm emission mode), the same table names the opcodes.

The ticket also writes `docs/typed-compiler.md`: the pipeline diagram, the tape's format with an example function and its tape, the passes, the backends and the oracles. Later tickets keep it current.

## Gates

- Every pinned image digest in `tests/compiler`, the 24 replays and the ray digest unchanged under the default and `kernel` policies: this ticket changes no output.
- A test that walks every tape produced while compiling all Typed sources in `apps/typed` and checks that each opcode is in the table and each cell count matches.
- On the board: none needed (no output change); the device bundle grows by the table, so check `make firmware PROFILE=playable` builds and that boot compile times stay within 75 % of each deadline in one probe boot (`bench/board/run.py --probe` plus the boot log's compile lines).

## Out of scope

Changing what the passes do; typing the operand stack beyond the table's columns; the trace REPL's Go code beyond loading the new file.

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

---
Title: A target-neutral front end and WebAssembly as a backend
Ticket: PICOCALC-TYPED-FRONTEND
Status: active
Topics:
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Make the parser and checker target-neutral by always emitting the tape; serialize WebAssembly from the tape; split typed-wasm.js into frontend/ and wasm/ modules."
LastUpdated: 2026-11-22T19:30:03.837813317-05:00
WhatFor: ""
WhenToUse: ""
---

# A target-neutral front end and WebAssembly as a backend

## Problem

`compiler/typed/typed-wasm.js` (1,667 lines) holds the lexer and its lexical index (`Lexer`, `withLexIndices`, `indexFor`), the signature pass (`scanSignatures`, `parseDeclarations`, `parseEnum`, `checkAcyclic`), the parser, type checker and emitter in one class (`FunctionEmitter`, lines 282–974), the tape variant (`NumericFunctionEmitter`), inspection (`InspectionTape`, `inspectOperations`, `WasmReader`), WebAssembly module encoding (`encodeModule`, `section`, `vec`) and the world linker (`linkWorld`, `invoke`).

The two targets are two emission modes of one class: `FunctionEmitter` writes Wasm bytes (LEB128), and `NumericFunctionEmitter` overrides `emitConst`, `emitIndex`, `emitMemory`, `codeUnitAddress` and `emitLiteralStores` to write the tape. So the parser knows about targets, and the Wasm oracle exercises a different emission path from the RV32 backend.

## Design

1. **One output.** The parser always emits the tape (the RV32 path already does). A new backend `wasm/encode.js` serializes a function's tape to Wasm bytes: operand cells become LEB128; `0xf1`–`0xf3` expand to the bounds-check sequences that `FunctionEmitter.codeUnitAddress`, `bufferWrite` and `emitLiteralStores` emit today. The first gate is that every Wasm module is byte-identical to the current output.
2. **Modules.** Split the file by responsibility:

   ```
   compiler/typed/frontend/lexer.js        Lexer, token regex, reserved words, lexical index
   compiler/typed/frontend/declarations.js signatures, records, enums, distinct types, call graph
   compiler/typed/frontend/expressions.js  prefix/postfix/binary expressions, calls, members
   compiler/typed/frontend/statements.js   blocks, conditionals, loops, match, declarations
   compiler/typed/frontend/compile.js      compileFunctions, streaming, emitFunctions
   compiler/typed/wasm/encode.js           tape → Wasm function bodies
   compiler/typed/wasm/module.js           sections, encodeModule, WasmReader
   compiler/typed/wasm/link.js             linkWorld, invoke
   compiler/typed/inspect.js               inspection callbacks
   ```

   The device and the other loaders read one file, so a build step (shared with PICOCALC-TYPED-PIPELINE's, if it lands first; otherwise this ticket writes it) bundles the modules into the existing `globalThis.typedWasm` script, with a `--check` mode in `make test-generated`. Keep `globalThis.typedWasm`'s exported names, or update every caller.
3. **The class split.** `FunctionEmitter` becomes a parser/checker that calls an emitter interface; there is one emitter (the tape writer). `typed-async.js` subclasses `FunctionEmitter` as a `TypeChecker`; keep that working (PICOCALC-TYPED-ASYNC-TAPE replaces it later).

## Gates

- All Wasm modules byte-identical (Editor 88,255 B, Agenda, Files, Chess, the ray tracer, Candela's Typed scenes, the replays' worlds); every RV32 pinned digest unchanged; 24/24 replays.
- Host compile time and peak heap of Editor within 2 % of before (Node `--expose-gc` measure or the trace REPL's `stats`); the device's boot compiles use only the RV32 path, so state whether any boot path compiles to Wasm and, if so, measure it on the board.
- `typed-inspect.mjs` and the trace REPL's inspection still work.

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

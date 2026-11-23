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

## Refinements (2026-11-22)

Checked against the code at `bf30d31` (typed-wasm.js was 1,632 lines, not 1,667) and implemented as follows.

1. **The serializer.** The front end's only differences between the two modes were `emitConst`, `emitIndex`,
   `emitMemory`, `codeUnitAddress`, `emitLiteralStores` and `finish`. They are now the tape writer in
   `ExpressionParser`, and `encodeFunction` (`wasm/encode.js`) writes every operand cell as unsigned LEB128 except
   `i32.const`'s (signed); a block type cell (0x40, 0x7f) is its own one-byte encoding, so no format table is needed.
   `text.checked_address` and `text.literal_stores` expand to the old sequences; `text.unchecked_address` throws, since
   only loop versioning writes it. The Wasm compile streams: each tape is serialized in `onFunction` and released.
2. **`compileFunctions` keeps its arity.** The fifth parameter (`numericOperands`) is unused instead of removed, so that
   `rv32/70-compile.js`, which PICOCALC-TYPED-PIPELINE is rewriting in parallel, needs no edit. Drop it when the two
   tickets are merged.
3. **Inspection.** The front end's `frontend` event now says `target: "tape"` (it said `"rv32"` in the numeric mode).
   The Wasm backend intercepts it (`compileWasmFunctions`) and emits the event it emitted before, `target: "wasm"`
   with the Wasm operations decoded from the serialized bytes, each carrying the source span of the tape operation it
   encodes. The spans are the same as before because a pseudo-op's expansion was written at one token. The `emission`
   event is unchanged.
4. **Modules.** As designed, except that the inspection code is split by owner, `frontend/inspect.js` and
   `wasm/inspect.js`, instead of one `compiler/typed/inspect.js` (a file next to `tape.js` would look like another
   script the loaders read). `FunctionEmitter` is two classes: `ExpressionParser` (expressions.js: constructor, tape
   writer, expressions) and `FunctionEmitter extends ExpressionParser` (statements.js). The prototype chain has the
   same depth as the old `NumericFunctionEmitter extends FunctionEmitter`: the emit methods are one level further
   from an instance, the statement methods one level closer (the QuickJS compile time did not move).
5. **The bundle.** `compiler/typed/frontend/build.mjs` is a sibling of `rv32/build.mjs`: it concatenates the modules
   in a fixed list into one IIFE; `--check` runs in `make test-generated` and in `typed-wasm-inspect.test.mjs`. No
   loader changed: the bundle is still `typed-wasm.js`, publishing the same `typedWasm` names.
6. **Gates as run.** Byte identity: the ticket's `scripts/01-digests.mjs`, 123 digests (TAPE's 78 RV32 image + tape
   pairs over 13 units x 6 policies plus the Agenda reminder unit, Wasm modules, the five linked Wasm worlds, and the
   Wasm and tape inspection event streams). Compile time and heap: QuickJS on the host (`scripts/02-qjs-measure.c`,
   `04-compare-qjs.py`), because the device runs QuickJS; Node's heap is not the device's. No playable boot path
   compiles to Wasm (`profiles/playable.env` sets `PICOCALC_RV32_{CHESS,AGENDA,EDITOR,FILES}=ON`), so no board
   measurement was needed.

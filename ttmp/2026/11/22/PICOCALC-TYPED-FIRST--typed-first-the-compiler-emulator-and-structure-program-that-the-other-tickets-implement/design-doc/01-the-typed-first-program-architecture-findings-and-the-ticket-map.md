---
Title: 'The Typed-first program: architecture findings and the ticket map'
Ticket: PICOCALC-TYPED-FIRST
Status: active
Topics:
    - compiler
    - os
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "The program that makes the Typed compiler, the RV32 executors and the repository ready for Typed-first work and floats; findings, rules, ticket map and order."
LastUpdated: 2026-11-22T19:30:02.586031298-05:00
WhatFor: ""
WhenToUse: ""
---

# The Typed-first program: architecture findings and the ticket map

AGENTS.md now states the project's goal: an operating system whose code is Typed, compiled to RV32 on the handheld, with QuickJS as a fallback and C only where it cannot be avoided or as a benchmark. This program prepares the compiler, the RV32 executors and the repository for that goal, and then uses them for the first large float workload: Candela's path tracer written in Typed.

The findings below come from reading the sources at `7ba124c` (2026-11-22). Each ticket's design document gives the details for its part.

## 1. The compiler as it is

```
Typed source
  ├─ typed-async.js (1,182)   only for async/await: own lexer, cursor parser, liveness; rewrites
  │                           async functions into ordinary Typed source text
  ▼
typed-wasm.js (1,667)         Lexer (+ cached lexical index) → signature pass (records, enums,
  │                           distinct, acyclic calls) → FunctionEmitter: parser + type checker +
  │                           emitter in one class; no syntax tree; one function at a time
  ├─ Wasm mode   → Wasm bytes → encodeModule → linkWorld (Wasm reactor)
  └─ numeric mode (NumericFunctionEmitter) → the tape: Wasm opcodes with plain-number operand
                              cells + pseudo-ops 0xf1 (checked UTF-16 address), 0xf2 (checked
                              literal stores), 0xf3 (unchecked address)
  ▼  streamed per function
typed-rv32.js (2,992, built from rv32/*.js): tape→tape passes (inline, commute, conjunctions,
  value sets, rotate, version loops/hoist/induction, split locals), analyses (ranges → division
  facts) → LeafCode or planLocations + FunctionCode → layout, call patching → linkSlot
typed-pie-loops.js (292)      optional: hand-encoded PIE words for qualifying loops
typed-world.js (81)           the world ABI: two entries, ~30 SDK imports in trampoline order
```

Properties worth keeping: streaming one function at a time (bounded memory on the P4), no syntax tree (cost proportional to source length), WebAssembly as an independent oracle, byte-identity gates.

| | Finding | Evidence |
|---|---|---|
| A | The tape has no single definition and no types | `OP` (12 names) plus raw hex in `typed-wasm.js`; `OPERAND_CELLS` in `rv32/20-inline-and-commute.js`; constants in `typed-pie-loops.js`; `0x36/0x3b/0xf2` inline in `70-compile.js`'s `storeless`; decoders in `typed-inspect.mjs` and the trace REPL |
| B | WebAssembly is a sibling emission mode, not a backend of the tape | `NumericFunctionEmitter` overrides `emitConst`, `codeUnitAddress`, `emitLiteralStores` |
| C | Two parsers of one language | `typed-async.js` lexes, parses and emits text; `compileFunctions` recompiles the canonical text to remap errors |
| D | The pass pipeline is one closure and flag bags | `lower()` in `70-compile.js`; ~15 flags; hand-placed `observe`; no per-pass timers |
| E | Every pass rescans raw cells | loops, ranges and liveness recomputed per pass (cost unmeasured) |
| F | One register class | `FunctionCode`, `LeafCode`, the planner know x0–x31; PIE words are constants outside `00-encoding.js` |
| G | One bundle, loaded whole, ordered by file name | boot apps on `interactive` load every `kernel` pass |
| H | Compile settings in C | per-app limits and policy in `agenda_p4.c`, `editor_p4.c`, `chess_p4.c`, `candela_p4.c`, `mobile_painter_p4.c` |
| I | The lexer exists twice | JS `Lexer` and `firmware/port/esp32p4/main/typed_lex_index.c` |

## 2. The RV32 executors as they are

| Executor | Size | Scope | Used by |
|---|---|---|---|
| `bench/emu/emu.c` (rv32emu) | C, 886 | RV32IM machine from the CJI book; loads firmware ELF and modules like `elf_loader`; libc, soft-float and maths through host calls | replays, Chess oracle, cji fixtures, Candela RV32 reference |
| `bench/host/rv32-interp.js` | JS, 213 | the subset `typed-rv32` emits; counts; calling-convention checks; runs in Node, goja and QuickJS | ray profile, compiler tests, trace REPL |
| `pkg/tracerv32` | Go, ~1,200 | predecoded twin of the JS interpreter, bit-identical, ~440× faster | trace REPL |

No executor decodes RV32F; the JS interpreter stops on PIE. Go is checked against JS; rv32emu against neither.

## 3. The repository

The layout from PICOCALC-REPO-LAYOUT holds. Open: the trace REPL under `cmd/`/`pkg/`, the firmware's tests, the device tools; ~20 per-app files and 74 `PICOCALC_` flags in the P4 port; Agenda's and Files' C reactors; long files (PICOCALC-SPLIT-FILES); no compiler architecture guide.

## 4. The tickets

| Ticket | Covers | Depends on |
|---|---|---|
| PICOCALC-TYPED-TAPE | A, I (index only), starts `docs/typed-compiler.md` | — |
| PICOCALC-TYPED-FRONTEND | B; splits `typed-wasm.js` | TAPE |
| PICOCALC-TYPED-PIPELINE | D, E (timers first), G; splits the RV32 backend into modules | TAPE |
| PICOCALC-RV32-REGISTERS | F | PIPELINE |
| PICOCALC-RV32-CONFORMANCE | the executors; RV32F; splits `emu.c` | — |
| PICOCALC-TYPED-BITWISE | `&`, `\|`, `^`, `<<`, `>>>`, hex literals | TAPE |
| PICOCALC-TYPED-F32 (widened, design-doc 02) | `f32`, RV32F, a Typed math library | TAPE, REGISTERS, CONFORMANCE |
| PICOCALC-CANDELA-TYPED | Candela's kernel and scene code in Typed | BITWISE, F32 |
| PICOCALC-TYPED-ASYNC-TAPE | C; replaces `typed-async.js` | TAPE, FRONTEND |
| PICOCALC-TYPED-APP-MANIFEST | H; generic Typed-world path; benchmarks out of the firmware | — |
| PICOCALC-AGENDA-TYPED-WORLD (design-doc 02) | Agenda and Files off their C reactors | APP-MANIFEST |
| PICOCALC-SPLIT-FILES | long files no other ticket rewrites; leftover moves; a length check | — |

```
TAPE ──► FRONTEND ──► ASYNC-TAPE
  ├────► PIPELINE ──► REGISTERS ──┐
  ├────► BITWISE ────────────────┐├──► F32 ──► CANDELA-TYPED
CONFORMANCE ─────────────────────│┘             ▲
                                 └──────────────┘
APP-MANIFEST ──► AGENDA-TYPED-WORLD             SPLIT-FILES (parallel)
```

**Execution.** Each ticket is built by one subagent in its own git worktree, which keeps its own diary in the ticket and commits on its branch. The coordinator merges branches into `main` in dependency order, reruns `make test` and the host gates after each merge, installs new playable firmware when a merge changes it, keeps the program diary (`reference/01-program-diary.md`) and writes the vault reports at four milestones:

1. the compiler's new architecture (TAPE, FRONTEND, PIPELINE, REGISTERS, BITWISE, ASYNC-TAPE);
2. the executors and floats (CONFORMANCE, F32);
3. Candela in Typed (CANDELA-TYPED);
4. the structure of the OS (APP-MANIFEST, AGENDA-TYPED-WORLD, SPLIT-FILES).

**Decisions already taken.** cji (`compiler/cji`) is on the file-length exception list: it is the book's compiler, its files follow the book's chapters, and under the goal it is a fallback. `apps/js/picocalc/apps/calc.js` is not split; it is ported to Typed once floats exist.

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

---
Title: Bitwise operators and hex literals
Ticket: PICOCALC-TYPED-BITWISE
Status: active
Topics:
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Add &, |, ^, <<, >>> and hex literals to Typed, through the tape, WebAssembly and RV32, with differential tests."
LastUpdated: 2026-11-22T19:30:06.602477922-05:00
WhatFor: ""
WhenToUse: ""
---

# Bitwise operators and hex literals

## Problem

The tokenizer in `typed-wasm.js` (`const TOKEN`) accepts `!== === <= >= >> || && { } ( ) : ; , . = - + * / % ! < >` and decimal integers only. Typed therefore has no `&`, `|`, `^`, `<<`, `>>>`, `~`, and no hex literals. Candela's random-number hash (`pcgH` in `firmware/third_party/candela/kernel/cdl_kernel.cpp`: variable shifts, xor, multiply) cannot be written, and RAY-PARITY noted that `v % 2` cannot be written as `v & 1`.

## Design

- Tokens and precedence as in JavaScript: `<<`, `>>`, `>>>` above relational; `&` then `^` then `|` below equality and above `&&`. Compound assignment forms if the language has any compound assignment (it has none today; keep it that way unless trivial).
- `i32` semantics: shifts use the low 5 bits of the count (Wasm and RV32 agree); `>>>` is logical. Results are `i32`; `distinct` integer types follow the existing arithmetic rules (decide and document whether `&` on two values of one distinct type keeps the type).
- Tape: `i32.and` 0x71, `i32.or` 0x72, `i32.xor` 0x73, `i32.shl` 0x74, `i32.shr_s` 0x75, `i32.shr_u` 0x76 rows in `tape.js` (0x74/0x75 already exist in `OPERAND_CELLS`).
- RV32: `and/or/xor/sll/sra/srl` and immediate forms (`andi/ori/xori/slli/srai/srli`) when an operand is a literal in range; `commuteConstants` and the other passes learn the new opcodes where they match operators (check each pass's opcode lists).
- Hex literals `0x…` up to 32 bits; literals above `0x7fffffff` wrap to negative `i32` (document).
- `~x` only if cheap (`x ^ -1`).

## Gates

- Differential test: generated expressions over random inputs, compiled to Wasm (run in Node) and RV32 (run in the JS interpreter), compared with JavaScript's own `| 0` semantics.
- Existing images byte-identical (no existing source uses the new operators).
- A Typed `pcgH` matches the C++ kernel's on 10,000 inputs.

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

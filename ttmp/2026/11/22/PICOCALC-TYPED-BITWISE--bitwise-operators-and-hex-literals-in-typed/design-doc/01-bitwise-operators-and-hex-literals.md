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

## Refinements (2026-11-22)

Checked against the code after TYPED-TAPE, TYPED-FRONTEND and TYPED-PIPELINE merged.

- **Where the tokenizer is.** `TOKEN` now lives in `frontend/lexer.js`, and the front end already had `>>`
  (`i32.shr_s`). There is a second tokenizer the design missed: the P4's lexical index
  (`firmware/port/esp32p4/main/typed_lex_index.c`), which the firmware installs as `__typedLexIndex` and whose
  token rows the lexer reads instead of running `TOKEN`. It has to tokenize identically: the old scanner splits
  `0x1f` into `0` and `x1f` and `>>>` into `>>` and `>`, silently. It learns `>>>`, `<<`, `& | ^ ~` and `0[xX]\w*`.
- **Precedence numbers.** JavaScript's: `|| 1, && 2, | 3, ^ 4, & 5, equality 6, relational 7, shifts 8, + - 9,
  * / % 10`, prefix operands at 11. No compound assignment (the language has none).
- **Distinct types.** The levels that already let a distinct integer through (equality, relational, `+ -`) gain
  `| ^ &`: two operands of one distinct type, or one and a literal, and the result keeps the type (flag sets).
  Shifts stay `i32` only, like `>>`, `*`, `/`, `%`. `~` takes `i32` like unary `-`.
- **Bitwise on bool is an error.** Operands are `i32`; so `a & 1 === 1` (JavaScript: `a & (1 === 1)`) is a type
  error rather than a silent bug.
- **Hex literals.** `0x`/`0X` and 1-8 hex digits, the i32 of those bits (`0xffffffff` is -1). The lexer token is
  `0[xX]\w*` so that `0xfg`, `0x` and nine digits are one token and one error ("invalid hex literal"). Enum member
  values accept hex too (`Lexer.integerValue`). Decimal literals keep their limit (2147483647, and `-2147483648`).
- **`~x`** is written as `x, i32.const -1, i32.xor` (cheap: RV32 gives `xori x, -1`). Note that a written `-1` is
  `0 - 1` on the tape, not a literal, so `x ^ -1` uses the register form; folding `-literal` would move existing
  images and is left out.
- **RV32.** `ALU` gains `and/or/xor/srl` (`sll`, `sra` were there); `IMMEDIATE_FORMS` gains `andi/ori/xori` for a
  literal in [-2048, 2047] and `srli`; `commute` treats `& | ^` as commutative. Passes that test for a pure binary
  operation with `op >= I32_ADD && op <= I32_SHR_S` (commute, inline, hoist x3, value-sets x3, ranges, pie-loops) now
  stop at `I32_SHR_U`; `and/or/xor` were already inside the range. `value-sets` folds the new operators.
  `analysis/ranges.js`: `x & y` is in `[0, min of the non-negative operands' maxima]` when either operand is
  non-negative (the rule TYPED-TAPE left unreachable at `0x71`), and `x >>> c` for a constant `0 < c < 32` is
  `[x0 >>> c, x1 >>> c]` for non-negative `x`, else `[0, 2^(32-c) - 1]`. Every other pass (version-loops, rotate,
  split-locals, conjunctions, storeless, plan/locations) leaves them opaque: its pattern matchers never match them
  and its walkers copy them or give up on the function.
- **Tape test.** `typed-tape.test.mjs` asserted that every row is exercised by `apps/typed`; no app uses the
  bitwise rows yet, so it now lists them as the expected missing rows and the new `typed-bitwise.test.mjs` covers
  them.

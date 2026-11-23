---
Title: Register classes and one encoder table
Ticket: PICOCALC-RV32-REGISTERS
Status: active
Topics:
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Give the RV32 backend register classes (integer and float) and one encoder table covering the base ISA, PIE and RV32F, so f32 can be allocated and emitted."
LastUpdated: 2026-11-22T19:30:05.336544819-05:00
WhatFor: ""
WhenToUse: ""
---

# Register classes and one encoder table

## Problem

The backend treats registers as integers 0–31 everywhere: `00-encoding.js` (registers, `instruction.{r,i,s,b,u,j}`), `FunctionCode` (operand registers `t0`–`t4`, homes, saved registers), `LeafCode`, and `planLocations` (homes and pointer groups). PIE instructions are hand-encoded 32-bit constants in `typed-pie-loops.js` (`minInputU16 = 0x919057db`, `broadcast = 0x8607203b`, …). RV32F needs a second register file (`f0`–`f31`), float loads and stores (`flw`, `fsw`), moves between files (`fmv.x.w`, `fmv.w.x`) and the OP-FP formats.

## Design

- **Encoder table.** `encoding/` gets one table of instruction formats and mnemonics for RV32IM, the Zicsr bits the backend uses, RV32F (all of OP-FP, `flw`, `fsw`, `fcvt.*`, `fmv.*`, `fclass.s`, compare, `fmadd` family encoded but not emitted by default) and the PIE instructions the PIE pass uses. `typed-pie-loops.js` builds its words through it. A test cross-checks every encoding against GNU `as` from the ESP toolchain (`riscv32-esp-elf-as`, found as in `bench/lib/toolchain.sh`), assembling a generated file and comparing words.
- **Register classes.** A register is `{cls: "x"|"f", n}` (or an integer with a class bit; choose by measured compile cost in bare QuickJS, since the planner runs on the device). The planner's homes, saved registers and spills take a class; the ABI tables (`CALLEE_SAVED`, argument registers) exist per class (`fs0`–`fs11`, `fa0`–`fa7` for `ilp32f`).
- **No float emission yet.** This ticket only makes the structure ready; PICOCALC-TYPED-F32 emits floats. A unit test allocates and emits a synthetic float tape fragment through the new classes to prove the path.

## Gates

- Byte-identical images under every policy; 24/24 replays; the PIE pass's output byte-identical (`pieLoops: "pie"` on the ray tracer).
- The assembler cross-check passes for every table row.
- Host compile time of Editor within 2 % (the planner is on the boot path); board study only if it is not.

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

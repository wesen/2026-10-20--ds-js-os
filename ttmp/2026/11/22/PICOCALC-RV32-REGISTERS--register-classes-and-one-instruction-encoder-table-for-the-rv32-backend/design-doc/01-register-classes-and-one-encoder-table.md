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

## Refinements (2026-11-22)

- **Where the code is.** The design names `00-encoding.js`; after PICOCALC-TYPED-PIPELINE the encoders live in
  `rv32/encoding/registers.js` (the six integer formats `instruction.{r,i,s,b,j}`), the planner in `rv32/plan/` and the
  emitter in `rv32/emit/`. The table is a new module, `rv32/encoding/instructions.js`.
- **Register representation: an integer with a class bit.** `x_n` is `n`, `f_n` is `32 + n`; `reg >> 5` is the class.
  Integer code keeps its numbers, so every integer encoder and every comparison in the emitters is unchanged, and the
  only added work on the integer path is one `reg < 32` test in `load`, `store` and `move`. `{cls, n}` objects would
  have allocated per operand and touched every emitter line.
- **The table and the formats.** The emitters keep calling the integer formats (`instruction.*`): rewriting their ~70
  call sites to mnemonics would have collided with PICOCALC-TYPED-BITWISE in `emit/arithmetic.js` for no output change.
  A test instead checks that the formats agree with the table on random operands, and that every `ALU` and
  `IMMEDIATE_FORMS` entry of `selection.js` (including BITWISE's and/or/xor/srl and andi/ori/xori/srli) is a table row.
- **Encoders made on first use.** `encoder(key)` makes and keeps a row's encoder; making all 85 closures at load cost
  the bare QuickJS realm 35 KB. The assembler text writer (`encoding/assembly.js`) is in no bundle.
- **Classes in the planner.** A key's class comes from `fn.params` and `fn.localTypes` (frame locals; the front end
  does not write it yet: PICOCALC-TYPED-F32 adds it). `planSavedHomes` keeps one free list per class with the same
  rules; the float class takes part only when the function has an `f32` parameter or local, so integer-only functions
  plan exactly as before (including the early stop at the first unaffordable key).
- **ABI.** `argumentRegisters(params)` assigns `a0`-`a7` and `fa0`-`fa7` independently (ilp32f); an `f32` result
  returns in `fa0`. The operand stack stays in `t0`-`t4`: a float crosses into and out of it with `fmv.x.w`/`fmv.w.x`.
  F32 decides whether floats get their own operand stack (`REGISTER_CLASSES[F].stack` is reserved as `ft0`-`ft4`).
- **The synthetic fragment.** The tape has no float operations, and the planner returns no plan for an unknown opcode,
  so the test's float additions are calls to an intrinsic import that its emitter subclass lowers to `fadd.s`.

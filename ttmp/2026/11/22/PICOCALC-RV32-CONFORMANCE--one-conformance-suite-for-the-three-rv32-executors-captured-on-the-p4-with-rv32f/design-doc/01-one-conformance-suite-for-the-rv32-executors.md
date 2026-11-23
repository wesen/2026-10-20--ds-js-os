---
Title: One conformance suite for the RV32 executors
Ticket: PICOCALC-RV32-CONFORMANCE
Status: active
Topics:
    - compiler
    - testing
    - esp32-p4
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "A shared instruction-vector suite that rv32-interp.js, pkg/tracerv32 and rv32emu must all pass in make test, with RV32F semantics captured on the ESP32-P4, and RV32F support in the executors."
LastUpdated: 2026-11-22T19:30:05.978295778-05:00
WhatFor: ""
WhenToUse: ""
---

# One conformance suite for the RV32 executors

## Problem

Three executors implement RV32 separately (see the program design, Section 2): `bench/emu/emu.c` (rv32emu, RV32IM, whole-program ELF runs with host calls), `bench/host/rv32-interp.js` (the subset Typed emits, counts, calling-convention checks) and `pkg/tracerv32` (Go twin of the JS interpreter, ~440× faster). The Go and JS interpreters are compared with each other; rv32emu with neither. None decodes RV32F; the JS interpreter stops on PIE. PICOCALC-TYPED-F32 needs float execution on the workstation with the device's semantics.

## Design

1. **Vectors.** `bench/reference/rv32/` holds JSON Lines vectors: `{word, x: {...}, f: {...}, mem: [...], fcsr, expect: {x, f, mem, fcsr} | {fault}}`. A generator (`bench/rv32/vectors.mjs` or similar) produces them per instruction class: arithmetic edge cases (overflow, `INT_MIN / -1`, divide by zero), shifts, loads and stores (alignment, sign extension), branches and jumps, and for RV32F: rounding modes, NaN propagation and canonical NaNs, signed zeros, `fmin`/`fmax` with NaN, `fcvt.w.s` saturation and flags, subnormals, `fsqrt.s`, `fdiv.s`, `fclass.s`, compare flags.
2. **Ground truth from the P4.** The expected results for RV32F (and a sample of the integer vectors) are captured on the board: a study app (in `bench/board/app` or a new small ESP-IDF app under `bench/board/`) executes each vector's instruction with the given inputs and prints the result; a capture script under the serial lock writes `bench/reference/rv32/p4-captured.jsonl`. The board is restored to the playable image afterwards.
3. **Runners.** Each executor gets a runner in `make test`: a Node test for the JS interpreter, a Go test for `tracerv32`, and a small C harness (or an rv32emu mode) for rv32emu. Integer vectors pass on all three; RV32F vectors pass on the executors that support it.
4. **RV32F in the executors.** Add F decoding and execution to the JS interpreter and the Go interpreter (and to rv32emu if its role stays; see 5), matching the captured semantics bit for bit, including `fcsr` flags.
5. **Roles.** Decide and document: JS = readable reference that runs inside any VM next to the compiler; Go = fast machine for counts and profiles; rv32emu = whole-program ELF runs (replays, cji, Chess oracle). Record whether rv32emu should later be replaced by the Go machine (it would need ELF loading and host calls).
6. **Split `emu.c`** (886 lines) into decode, execute, ELF loading and host calls, in `bench/emu/`.

## Gates

- All three executors pass the integer vectors; JS and Go pass the RV32F vectors; the P4 capture is in the repository with its build and capture logs in the ticket.
- Existing gates unchanged: `make test`, 24/24 replays, ray digest, Chess oracle, the trace REPL's bit-identity test between Go and JS.

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

Checking the design against the code at `4b9a80b` changed the following; `docs/rv32-executors.md` describes the result.

1. **The integer subset.** The reference interpreter executed only what `typed-rv32` emits (no `mulhsu`, `divu`,
   `remu`, `auipc`, `fence`; `jal` only with `x0`/`ra`; `jalr` only as `ret`), and the Go machine copied the subset on
   purpose. "Integer vectors pass on all three" therefore required extending both to all of RV32IM. The calling-convention
   checks stay (a call is `jal` or `jalr` linking `ra`, a return is `ret`) and can be turned off with
   `options.checks = false` / `Machine.NoChecks`; `options.registers`, `fregisters` and `fcsr` set the initial state.
   Fault messages changed: "unsupported M instruction" and "unsupported jal link register" are gone, "unsupported F
   instruction" and "unsupported system instruction" are new.
2. **rv32emu was RV32IMC, not RV32IMF** (its Makefile comment said IMF). It gets RV32F and RV32FC too, not
   conditionally: its role stays (item 6), and the replays will run Typed `f32` code on it once PICOCALC-TYPED-F32 lands.
3. **Vector format.** JSON Lines in `bench/reference/rv32/vectors.jsonl`: `{id, class, word, x, f, fcsr, mem, board,
   expect: {x, f, fcsr, mem, next} | {fault}}`, numbers in minimal hexadecimal, registers not named are zero and must
   not change. Every vector runs at pc `0x2000` with a 32-byte window at `0x1100`, and uses rd = x10/f10, rs1 = x11/f11,
   rs2 = x12/f12, rs3 = f13 (the capture stubs depend on it), with x10 and f10 preset to `0xdeadbeef`. The generator is
   `bench/rv32/generate.mjs` (inputs and the RV32I model), the suite `bench/rv32/vectors.mjs` (build, `--check`,
   `--board`, `load`, `check`). 15,664 vectors, 15,454 run on the board.
4. **The capture app** is a new ESP-IDF app, `bench/board/rv32-vectors`, with one generated assembly stub per distinct
   instruction word (264), so nothing is generated or patched at run time. `bench/board/rv32-capture.py` runs it through
   `device.run_app`, which verifies the playable image first and restores and health-checks it afterwards.
   Expectations: F vectors from the board only; integer arithmetic and memory vectors from the model, which the build
   requires to agree with the board; control flow, `auipc`, `x0` and aliasing from the model alone (the board's pc is
   not the vector's). Illegal encodings are not run on the board (they would trap the app).
5. **Runners.** `tests/rv32/conformance.test.mjs` (reference), `pkg/tracerv32/conformance_test.go` (Go),
   `tests/rv32/rv32emu.test.mjs`, which drives `bench/emu/build/rv32emu-vectors` (rv32emu's processor, one instruction
   per input line, state out) and compares with the suite's own `check`. `make test-rv32` is part of `make test`;
   `make test-generated` runs `vectors.mjs --check`.
6. **Roles** are as proposed; the decision on replacing rv32emu with the Go machine is "not now", with the reasons in
   `docs/rv32-executors.md`.
7. **The split of `emu.c`** has nine files rather than four (`machine`, `decode`, `execute`, `fpu`, `elf`, `host`,
   `profile`, `main`, plus `vectors.c` for the harness). The move itself is `scripts/01-split-emu.py`; the memory
   accessors became `static inline` in `machine.h` afterwards so the split costs no speed.
8. **Not covered:** misaligned loads and stores (the P4's behaviour is not captured), and the board's response to
   illegal encodings.

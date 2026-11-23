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

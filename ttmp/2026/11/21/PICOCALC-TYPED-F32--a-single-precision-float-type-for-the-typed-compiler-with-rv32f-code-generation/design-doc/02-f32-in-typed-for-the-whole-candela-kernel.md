---
Title: f32 in Typed for the whole Candela kernel
Ticket: PICOCALC-TYPED-F32
Status: active
Topics:
    - picocalc
    - compiler
    - esp32-p4
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Widened scope: f32 in Typed end to end (language, tape, WebAssembly, RV32F, a Typed math library), sized for Candela's whole kernel, with explicit semantics where WebAssembly and RISC-V differ."
LastUpdated: 2026-11-22T19:30:10.111080943-05:00
WhatFor: ""
WhenToUse: ""
---

# f32 in Typed for the whole Candela kernel

This supersedes the scope of `01-design-stub.md` (per-scene code only). Under the goal in AGENTS.md, Typed must express Candela's whole kernel, so `f32` is a first-class type, not a niche for generated sections.

## Language

- Type `f32`; literals with a decimal point or exponent (`1.5`, `2e-3`, `1.0`); an integer literal stays `i32`.
- No implicit mixing: `f32(i)` converts `i32 → f32` (round to nearest); `i32(x)` converts `f32 → i32`. Decide trap or saturate for NaN and out-of-range (WebAssembly's `i32.trunc_f32_s` traps, `i32.trunc_sat_f32_s` saturates, `fcvt.w.s` saturates and sets flags); Typed already traps on division by zero, so trapping is consistent, saturating is cheaper. Measure both on the kernel and record the decision.
- Arithmetic `+ - * /`, unary `-`, comparisons; records with `f32` fields (each still one 32-bit word); buffer access for floats (`buf.getF32(i)`/`buf.setF32(i, x)` over two 16-bit cells, or a separate float buffer type: decide by what Candela's data needs).
- `Math` functions as single instructions where RV32F has them: `sqrt` (`fsqrt.s`), `abs`/`copysign`/`neg` (sign injection), `min`/`max`. `floor`, `ceil`, `round`, `trunc` have no RV32F instruction; implement through `fcvt` with a rounding mode plus a range check (|x| ≥ 2^23 is already integral).

## Semantics where the targets differ

The WebAssembly build is the oracle for the RV32 build, so every difference is decided once and implemented on both:

| Case | WebAssembly | RV32F | Typed's rule |
|---|---|---|---|
| `min`/`max` with a NaN | NaN | the other operand | choose; lower the other target to match |
| `min(-0, +0)` | −0 | −0 | same |
| NaN payloads | nondeterministic | canonical NaN | never observable from Typed (no bit casts) or canonicalize |
| Fused multiply-add | none | `fmadd.s` exists | never contract; emit `fmul.s` + `fadd.s` |
| Float → int out of range | trap or saturate | saturate + flag | the decision above |

## Tape and backends

Typed tape rows for `f32` (WebAssembly opcodes `0x92`–`0x98`, `0x5b`–`0x60`, `0x8b`–`0x91`, conversions `0xa8`/`0xb2`, loads/stores `0x2a`/`0x38`). The Wasm backend serializes them. The RV32 backend gets float operand registers and homes in the float class (PICOCALC-RV32-REGISTERS), `flw`/`fsw` spills, `fmv` between classes, and a float calling convention between Typed functions (`fa0`–`fa7`, matching `ilp32f` so reactor calls stay possible).

## The math library, in Typed

`sin`, `cos`, `exp`, `log`, `log2`, `pow`, `atan2`, `acos`, `fract`, `mix`, `clamp` as a Typed library (`compiler/typed/lib/math.typed` or similar) with polynomial approximations (range reduction, minimax coefficients). Accuracy targets per function (max ulp error against `Math.fround(Math.f(x))` over sampled and edge inputs), documented. Bit-exactness with C's libm is not a goal; Wasm/RV32 agreement is.

## Gates

- Differential tests: generated float expressions and the math library, Wasm (Node) vs RV32 (JS and Go interpreters with RV32F from PICOCALC-RV32-CONFORMANCE), bit for bit.
- The original stub's acceptance: the three Candela fragments from PICOCALC-CANDELA-P4 `scripts/09-numeric-bench.c` (sphere test from `hitObj`, the GGX term from `evalLobe`, `safeNorm`) in Typed within 1.5× of GCC -O2's instruction counts, then timed on the board in a paired study against the C versions.
- Existing integer images byte-identical.

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

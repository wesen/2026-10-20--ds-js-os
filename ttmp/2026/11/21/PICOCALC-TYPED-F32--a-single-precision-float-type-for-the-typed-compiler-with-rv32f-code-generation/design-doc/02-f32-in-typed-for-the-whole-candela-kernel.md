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

## Refinements (2026-11-22)

Decisions taken while implementing, against the code as it is (commits `b2773a5`, `88d11bd`).

**The rule where the targets differ: RV32F's, everywhere.** The device runs RV32; WebAssembly is the oracle. So each
difference takes the rule that costs one instruction on the P4, and the Wasm backend expands to it (its cost does not
matter). Three tape pseudo-ops carry these rules (`tape.js`): `f32.to_i32` (`0xf4`), `f32.min_num` (`0xf5`),
`f32.max_num` (`0xf6`).

| Case | Typed's rule | RV32 | WebAssembly expansion |
|---|---|---|---|
| `i32(x)`, x out of range | saturate to -2^31 or 2^31-1 | `fcvt.w.s rtz` | `i32.trunc_sat_f32_s` |
| `i32(NaN)` | 2^31-1 | `fcvt.w.s rtz` | `select(2^31-1, trunc_sat(x), x != x)` with an f32 scratch local |
| `Math.min`/`max` with one NaN | the other operand | `fmin.s`/`fmax.s` | `select(select(min(a,b), a, b==b), b, a==a)` |
| both NaN | a NaN | canonical NaN | b (a NaN) |
| `min(-0, +0)` | -0 | `fmin.s` | `f32.min` |
| NaN payload and sign | unspecified | canonical `0x7fc00000` | V8's |
| fused multiply-add | never | `fmul.s` + `fadd.s` | `f32.mul` + `f32.add` |
| rounding | nearest even, static | every instruction names `rne` (`frm` never matters) | the only mode |
| floor/ceil/trunc | IEEE (sign kept: `ceil(-0.5)` is -0) | `|x| < 2^23`: `fcvt.w.s` and `fcvt.s.w` in the mode, `fsgnj.s`; else x (8 words) | `f32.floor`/`ceil`/`trunc` |

*Trap or saturate for f32 → i32.* Saturating is one instruction. Trapping on NaN or out of range needs the flags
(`csrw fflags, 0; fcvt.w.s; csrr; andi; beqz; ebreak`, five more instructions) or two compares against loaded bounds
and a NaN test (six to eight). Candela's kernel has 63 `i32(...)` conversions and 18 `floor` calls (each of which
converts), many in hashes and per-sample loops; a path tracer meets NaN in practice (a zero-length normal), and a trap
would stop the gallery where C (which saturates on the P4, its conversion being undefined in the language) renders a
dark pixel. Measured statically: the trap form adds 5-7 instructions per conversion against 1. Decision: saturate,
NaN to 2^31-1 (RV32F's value, Wasm's `trunc_sat` gives 0 and is corrected). Division by zero keeps trapping for
integers; f32 division follows IEEE (infinities, NaN).

*min/max NaN rule:* the non-NaN operand (IEEE 754-2008 minNum, RV32F), so `clamp(NaN, 0, 1)` is 0 — what a renderer
wants. *NaN payloads:* unspecified; Typed has `Math.bitsOf` and buffer access, so a payload can be observed, and the
differential tests compare every NaN equal to every NaN (`tests/compiler/f32-cases.mjs` `same`). `Math.copysign(x, y)`
takes y's sign bit, so its result is unspecified when y is an arithmetic NaN; the generator only uses parameters and
literals as y.

**Language.** `f32` is a type and a reserved word. Literals: `\d+\.\d+([eE][+-]?\d+)?` or `\d+[eE][+-]?\d+` (lexer
kind `"float"`, also in the P4's lexical index, `typed_lex_index.c` kind 5); a literal that rounds to infinity is an
error; `-1.5` is one literal (its sign bit flipped in the tape cell), `-0.0` is negative zero. An integer literal stays
`i32`: `x * 2` is an error, `x * 2.0` is not. `f32(i)` (a literal folds into an `f32.const`) and `i32(x)` convert.
Operators on two f32: `+ - * /`, unary `-` (`f32.neg`), `< <= > >= === !==` (false with a NaN, `!==` true). `%`,
bitwise operators and mixing with i32 are errors. `Math.sqrt/abs/floor/ceil/trunc/copysign/min/max` take f32
(`min`/`max` also two i32 as before); `Math.bitsOf(x): i32` and `Math.fromBits(n): f32` reinterpret (the library's
exp and log need them). `Math.round` is left out: JavaScript's rounds halves up, Wasm's `nearest` to even.

**Records and buffers.** A record field may be `f32` (one word, `f32.load`/`f32.store`). Buffer access is
`buf.getF32(i)` / `buf.setF32(i, x)` on the existing `buffer` type: element i is UTF-16 units 2i and 2i+1, the
bounds check is on unit 2i+1 (one `text.checked_address`), and the f32 is at byte 4 + 4i (word-aligned, since a
buffer starts word-aligned). Candela's scene data is float arrays that the host passes as buffers, so one buffer type
serves both; a separate float buffer type would duplicate the host ABI for no saving. (An index of 2^30 or more
wraps when doubled and reads another element, in bounds; both targets agree.)

**Locals.** The front end writes `fn.localTypes` (`"f32"` or `"i32"` per frame local) when a function has an f32
local; Wasm declares typed local groups from it; inline (callee ranges), split (webs) and fields (fresh locals) extend
it; a missing entry is i32.

**The float operand stack.** f32 operands live in f registers: depth d is `ft0`..`ft7` (`F_STACK`, eight deep, so
deep f32 expressions rarely spill), x and f operands share the spill slot of a depth, and `ft10`/`ft11` are the
scratch registers of a spilled f operand. A consumer pops with a scratch of the class it expects, which picks the
class's stack register; the emitter records each depth's class for the spills around a call. No `fmv` crosses the
classes except `Math.bitsOf`/`fromBits` and the round sequence.

**Passes.** Every pass with an abstract operand stack (inline, commute) takes an f32 operation's pops and pushes from
its tape row (`FLOATING`, `tapeRow` in `encoding/tape.js`); value-sets, hoist, ranges and the PIE loops already reject
operations they do not know, so they leave f32 functions alone (a function with f32 operations gets no range facts
yet). Block type cells may be `F32` (an inlined f32 callee).

**f32-only code-generation changes.** These apply only to functions with an f32 parameter, local or result, so that
every integer image stays byte-identical (the 84 digests): inlining of f32 candidates at any call site (not only in
loops), the `fields` pass (one load per f32 field of an unwritten record parameter when nothing stores), f32 constant
homes (key `"f<bits>"`, weight 0.6 per use), the leaf's extra free f registers (fa0 for the first f32 parameter, a0
for the first integer one when nothing uses a0 as scratch, ft8, ft9 and the operand-stack registers above the tape's
deepest stack), computing a returned value directly in fa0, and dropping the frame of an f32 function that uses none.
Most would help integer code too; widening them is a separate ticket with its own board study.

**Math library location.** `compiler/typed/lib/math.typed`, a Typed source a program concatenates before its own
functions (Typed has no imports). It declares no records, because a program's declarations must precede all its
functions. Accuracy per function: `compiler/typed/lib/README.md`.

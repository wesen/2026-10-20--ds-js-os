---
Title: 'Value types for Typed: local records, arrays, record results, continue, conditionals, u32'
Ticket: PICOCALC-TYPED-VALUES
Status: active
Topics:
    - compiler
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:20.589730586-05:00
WhatFor: ""
WhenToUse: ""
---

# Value types for Typed: local records, arrays, record results, continue, conditionals, u32

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

# Value types for Typed

## Why

PICOCALC-CANDELA-TYPED generated Candela's kernel in Typed and measured it on the P4 at 1.76× the C++ kernel's cycles per sample. On kernel-bound scenes (B-01, R-01, L-03, V-02) it is 2.5×. The generator had to work around missing language features, and each workaround costs memory traffic:

| Missing in Typed | Generator workaround | Cost |
|---|---|---|
| local records (structs as values) | one static frame record per function holding references to struct records | every struct field access is a load or store through two pointers |
| multiple results / record results | vector results return `x` and leave `y, z` in fields `r1..r3` of the kernel record | three stores and three loads per vector-valued call |
| local arrays | buffers, with `Math.bitsOf`/`fromBits` for integer elements | bounds checks, conversions |
| `continue` | folded into later statements or a one-shot loop with a flag | extra branches |
| `a ? b : c` | if/else into temporaries | extra locals and moves |
| `u32` | `i32` with `>>>`; unsigned compare and divide refused | the generator refuses some code |
| more than 8 parameters per register class | the extra parameters go through the callee's frame record | memory traffic |

The goal (AGENTS.md) treats each of these as compiler work. This ticket adds them to the language and both targets. PICOCALC-CANDELA-KERNEL-CODEGEN then uses them.

## The design, per feature

Decide the details in the Refinements after reading `docs/typed-compiler.md`, `compiler/typed/frontend/` and the RV32 planner. Keep the existing invariants:
- streaming, one function at a time;
- no syntax tree;
- the tape as the only IR;
- byte-identical images for programs that do not use a new feature (the 84-digest harness).

1. **`continue`.** It is a `br` to the loop's continue label. The front end already emits `block`/`loop` for `while` and `for`. Check that `for`'s update expression runs on `continue`.
2. **Conditional expression `c ? a : b`.** Lower it to `if (result T) … else … end` on the tape, or to `select` when both arms are side-effect-free and cheap. Both branches must have the same type, and there is no implicit conversion. Keep JavaScript's precedence and associativity.
3. **`u32`** as a distinct numeric type, represented as i32 on the tape and in registers:
   - unsigned comparison (`lt_u`, and so on), division and remainder (`div_u`, `rem_u`), `>>>`;
   - explicit conversions `u32(x)`, `i32(x)` and `f32(x)`. RV32F has `fcvt.s.wu` and `fcvt.wu.s`; on WebAssembly use `f32.convert_i32_u` and a saturating truncation.
   - Literals: decide whether hex literals above 2³¹ are u32.
4. **Local records.** `let v: Vec3 = {x: 1.0, y: 2.0, z: 3.0}`, or a constructor form, as a value whose fields are scalar locals. This is scalar replacement, done by the front end: a local record of a declared record type becomes one local per field, `v.x` reads that local, and assigning a whole record copies field by field.
   - **Parameters.** A local record passed to a function is passed as its fields, as consecutive parameters in the same order. That raises the parameter count, see item 6.
   - **Aliasing.** A local record never aliases memory, so there is no address-of.
   - **The distinction from today's record references.** Today's `Vec3` type means a reference to memory the host provides. A value record needs its own spelling, for example `value record Vec3 {…}`, or `Vec3` values versus `ref Vec3`. Choose one, and record why, in the Refinements.
5. **Record results.** A function may return a value record. On the tape a result of several values (WebAssembly multi-value; `(result f32 f32 f32)` is valid in Wasm 2.0) is the simplest. On RV32, return up to two words of each class in `a0/a1` and `fa0/fa1` (ilp32f allows two). Larger results go through a caller-provided stack area. Decide and document the convention; keep the integer-only ABI of existing worlds unchanged.
6. **More than 8 parameters per class.** ilp32f passes the rest on the stack. Implement stack parameters in the planner and calls. Value-record parameters make this common.
7. **Local arrays.** `let a = new F32Array(16)` (or a syntax you justify): a fixed-size array whose size is a compile-time constant, in the function's stack frame, with bounds-checked indexing, and with an unchecked form after range analysis proves the index. Elements are i32 or f32.

Order: 1–3 first (small), then 6, then 4 and 5 together, then 7. Each lands with tests on both targets and the differential harness (Wasm vs RV32 vs a JS model).

## Gates

- `node --test tests/compiler/*.test.mjs`.
- The 84-digest identity harness: programs without the new features are byte-identical.
- `make test`, and `make test-host` with both policies (25/25).
- New differential tests for every feature, under all five policies.
- The device lexical index (`typed_lex_index.c`) must tokenize any new syntax. Check it against the JS lexer on a host QuickJS, as BITWISE and F32 did.
- One device check: a playable build boots with every boot app compiled through the new compiler, and compile times stay within 75 % of their deadlines.

## Out of scope

- Heap-allocated records, closures and generics.
- Changing Candela's generator (PICOCALC-CANDELA-KERNEL-CODEGEN).

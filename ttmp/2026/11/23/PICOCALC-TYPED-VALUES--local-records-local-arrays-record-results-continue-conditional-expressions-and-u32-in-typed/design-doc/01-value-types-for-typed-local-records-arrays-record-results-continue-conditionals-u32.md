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

## Refinements (2026-11-23)

Decisions taken against the code, in the order the features landed (diary steps 2 onwards).

### Every feature

- **Identity.** A program that uses none of the new features compiles to the same tapes and images: the 84-digest
  harness (PICOCALC-TYPED-PIPELINE's, with Files and Agenda as the multi-file worlds they now are, copied to this
  ticket's `scripts/`) is `IDENTICAL 84 of 84` after each feature.
- **Where the front end's new code lives.** `frontend/values.js` (methods copied onto `ExpressionParser`, as `floats.js`
  does), so `expressions.js` stays under the 500-line limit.

### `continue`

- A loop was `block; loop; C; eqz; br_if 1; B; [update]; br 0; end; end`. `continue` cannot be a `br` to the loop: that
  skips a `for` loop's update, and once the `rotate` pass has moved C to the bottom (`loop; B; C; br_if 0`), a branch to
  the loop also skips the condition. So a body that continues is wrapped: `...; br_if 1; block; B; end; [update]; br 0`,
  and `continue` is a `br` to that block's end. Every pass already handles a forward branch out of a block.
- The front end is streaming and has no syntax tree, so it decides before parsing the body whether to open the block:
  `bodyContinues` scans the body's text from its `{` to the matching `}` for the word `continue` (skipping comments and
  strings). A `continue` of a nested loop also counts; the extra block costs no instruction (RV32 emits nothing for
  `block` and `end`). A source without the word anywhere pays one `includes` per source; loops in programs without
  `continue` keep their tapes, which the identity harness checks.
- `continue` in an `async` function's own statement parser (`async/body.js`) is not supported (it parses `break`
  only); recorded as a task.

### The conditional expression

- `c ? a : b` is JavaScript's: looser than `||`, right-associative, each arm a whole expression. It is parsed after the
  binary operators at precedence 0 (`expr(0)`), so `a || b ? c : d` is `(a || b) ? c : d`.
- The tape is `c; if (result T); a; else; b; end`, the form `&&`, `||` and `Math.min` already write, so no pass or
  backend needed a change; RV32 fuses a comparison into the `if`'s branch. T is `I32` until the first arm is parsed and
  then patched to `F32` if the arm is an f32 (one cell; the front end writes T before it knows the arm's type).
- **No `select`.** A `select` row would need RV32 lowering (a branchless sequence of four instructions, or a branch
  anyway) and teaching every pass with an abstract stack; the fused compare-and-branch is two instructions per arm.
- Both arms have one type, with no implicit conversion. A literal takes the other arm's integer type
  (`k > 0 ? id : 7` is an `Id`); a `u32` literal meets only `u32`.

### `u32`

- A distinct numeric type, an `i32` on the tape and in registers. Tape rows `i32.lt_u` (0x49), `gt_u` (0x4b), `le_u`
  (0x4d), `div_u` (0x6e), `rem_u` (0x70), `f32.convert_i32_u` (0xb3), all Wasm's own opcodes, and one pseudo-op
  `f32.to_u32` (0xf7): RV32F's `fcvt.wu.s` rule (truncate, saturate, NaN to 2^32 - 1); Wasm expands it to
  `i32.trunc_sat_f32_u` and a NaN select, as `f32.to_i32` does.
- Operators: `+ - * & | ^ ~ <<` as on `i32`; `< <= > >=`, `/` and `%` unsigned; `>>>` logical; **`>>` is an error** on
  `u32` (JavaScript's `>>` is arithmetic; giving it a logical meaning on one type would surprise a reader, and `>>>` says
  what it does). A shift's count may be any integer; the left operand gives the result's type. Unary minus is an error.
  Mixing `u32` and `i32` is an error; `u32(x)` and `i32(x)` convert (bits unchanged), `f32(x)` of a `u32` rounds the
  unsigned value (`fcvt.s.wu`), `u32(x)` of an f32 is `f32.to_u32`. `Math.min`/`max` compare two `u32` unsigned.
- **Literals.** A hex literal stays 32 bits that take their context's type, as today: `0xffffffff` is `-1` as an `i32`
  and 4294967295 as a `u32`, with the same bits; so hex literals above 2^31 are not `u32` by themselves. A decimal
  literal from 2^31 to 2^32 - 1 is a `u32` (an `i32` context reports "i32 literal out of range" as before); above that,
  "integer literal out of range". Two literals give a literal under `+ - * & | ^ << >>>` (and a literal shifted by any
  count), whose bits do not depend on signedness, so `1 << 5` fits a `u32`; under `/ % >>` they give an `i32`, because
  the front end must choose the signed or the unsigned operation when it writes it. This widens what compiled before
  (`const f: Flags = 1 + 2` is now accepted) and changes no tape.
- RV32: `sltu`/`sltiu`, fused `bltu`/`bgeu`, `divu`/`remu` behind the zero check (no overflow check), and a division or
  remainder by a power of two as `srli`/`andi`. The passes: `value-sets` folds the new rows; `ranges` bounds `rem_u` and
  `div_u` by a constant; `hoist` moves an unsigned division only with a literal divisor, like a signed one; every
  other pass meets the rows inside the ranges it already tests (`I32_EQ..I32_GE_U`, `I32_ADD..I32_SHR_U`).
- The P4's lexical index (`typed_lex_index.c`) learns `?`; `u32` and `continue` are words it already tokenizes.

### More than eight parameters per class

- **ilp32f exactly**, so that C could call any Typed function and the convention needs no second description: integers
  in `a0`-`a7`, f32 in `fa0`-`fa7`; an f32 beyond `fa7` takes the next free integer register (the psABI's "passed
  according to the integer calling convention"), and whatever finds no register takes the next 4-byte stack word, in
  parameter order, at the caller's `sp + 4k`. `argumentRegisters` writes stack word k as `-1 - k` and counts them in
  `.stack`; it no longer throws.
- **The caller** reserves a stack-argument area at the bottom of its frame, as large as its largest call needs
  (`outgoingWords`, a walk of the tape's calls that a program without stack words skips), and stores those arguments
  there just before the call (`sw`/`fsw` from the operand stack). Slots move up by the area (`slotBase`); a large frame
  puts `ra`, `s0` and the saved registers above it. The arguments are written only at the `call` itself, so a call
  among the arguments of another cannot overwrite them.
- **The callee** copies its stack parameters into their homes (`lw`/`flw`) or slots in the prologue, from the caller's
  sp computed as `addi t5, sp, frame` (or `addi t5, s0, frame - 2032` in a large frame), a placeholder patched once the
  frame is known. Copying costs one or two instructions per stack parameter per call; addressing them in place would
  need every slot access patched with the frame size.
- The planner keeps no stack parameter, and no f32 that arrived in an integer register, in its incoming register
  (`inOwnRegister`), and builds capacity and pointer homes only from parameters that did arrive in their own class's
  register. A leaf with more than eight parameters was already declined.

### Value records

- **Spelling: `value record Vec3 { x: f32; y: f32; z: f32; }`**, a declaration of its own beside `record`. Today's
  `record` means a reference to memory the host lays out (worlds share `WorldState` and `WorldEvent` with C, Candela's
  arena records with `candela_typed_p4.c`), and every Typed program uses it that way; spelling references `ref Vec3` would
  change every program for no gain, and one record declaration used both ways would let a reader not know whether
  `a = b` copies or aliases. With two declarations the type's name says which it is. `value` is a keyword only at the
  start of a declaration (programs use it as a local's name).
- **Construction: `Vec3(1.0, 2.0, 3.0)`**, positional, one argument per field in field order, a nested value record
  field taking any expression of its type (`Ray(o, Vec3(0.0, 0.0, 1.0))`). It needs no expected type (an object literal
  `{x: 1.0, ...}` would, which a parser without a syntax tree has only in some positions), it is the form WGSL uses for
  structs (`Ray(o, d)`, which Candela's generator translates), and it is the form Typed already uses for a distinct
  type (`Id(3)`).
- **Scalar replacement in the front end, as it parses.** A value record's layout is its leaves: scalar fields, nested
  value records flattened in field order. A local of a value record type is one local per leaf, consecutive; `v.o.x` is
  one `local.get`; an expression of a value record type leaves its leaves on the operand stack in order (the same
  convention as a multi-value call); storing a value is one `local.set` per leaf, last first; `v.f = e` and
  `v.o = e` set the leaf or the sub-range. `f(x).y` and `Vec3(...).y` store the leaves into fresh locals and read the
  one asked for. No pass and no backend sees a value record: the tape holds only scalars.
- **Value semantics.** Assignment copies (`let b = a; b.x = 1.0` leaves `a` alone); a field write needs a `let`
  (`const` and parameters are immutable, as for scalars). This is not JavaScript's object semantics (an object is
  aliased); Typed already differs from JavaScript in its `record`, `match` and integer types, and there is no address-of,
  so a value record never aliases anything.
- **Parameters** are the leaves, consecutive parameters in field order (`fn.params`, names `v.x`); the signature as written
  is `fn.sourceParams`/`fn.sourceNames`, present only when a value record appears, so other functions' descriptors keep
  their shape. A call checks each argument against the written type. Methods (`methods Vec3 { dot = dot; }`) take the
  receiver's leaves.
- **Fields** may be any scalar, a record reference (`v.cell.w = 1.0` stores through it) or an earlier value record. A
  `record` cannot have a value record field (that would be an inline struct in memory, a different feature), and a value
  record cannot contain itself (fields name only earlier types).
- `?:` between value records stores each arm's leaves into the same fresh locals (`if void ... end`; a tape block holds
  one value). `===` on value records is an error.
- **Streaming and no syntax tree** shaped two things: the constructor form (no expected type needed), and the choice of
  where a value lives — a named value is always in locals (a `local.get` per use), an unnamed one (a call's result) on
  the operand stack until it is stored or selected from. Whether a leaf then lives in a register is the RV32 planner's
  ordinary decision about a local.

### Record results

- **The tape and WebAssembly: multi-value.** A function's result is several values (`fn.results`, the leaves' types;
  `fn.result` keeps the record's name); `return` and the final `end` take them all; the Wasm type is
  `(result f32 f32 f32)` (WebAssembly 2.0, which Node and wasm3-era engines accept).
- **RV32: the leaves return as arguments arrive.** Integer leaves in `a0`-`a7` and f32 leaves in `fa0`-`fa7`, each class
  in order; a leaf beyond its class's eight takes the next stack word in the caller's stack-argument area (the same area
  as stack parameters, sized for the larger of the two). ilp32f itself returns a struct in at most two registers per
  class and a larger one through a hidden pointer; Typed's convention keeps a `Vec3` (three f32) and Candela's `BS`
  (seven f32, three integers) entirely in registers. A function with one result keeps the integer-only ABI of existing
  worlds (`a0`, or `fa0` for an f32).
- The callee moves pending direct reads to the operand stack before placing the leaves (`returnValue`), so a leaf kept
  in an argument register is never overwritten by another leaf's move; it writes stack leaves through the caller's sp
  (`addi t6, sp, frame`, patched as for stack parameters). A frameless leaf with stack leaves is declined.
- **Passes.** Every abstract operand stack now pushes a call's result count (`arity.results`). The inline pass inlines a
  callee with a record result as `block; body end; local.get r_0..r_{n-1}`, each `return` and the final `end` storing the
  leaves into result locals that follow the callee's own; those reads may be substituted into a later inlined call like
  any plain local read, and an earlier copy's reads stop being substitutable once a later copy of the same callee
  overwrites the shared result locals.

### Local arrays

- **Syntax: JavaScript's typed arrays.** `const a = new Float32Array(16)`, `new Int32Array(n)`, `new Uint32Array(n)`;
  `a[i]`, `a[i] = e;`, `a.length`. A JavaScript reader knows what it means, the JavaScript fallback of a boot app could
  run the same lines, and the element type is in the name, so the declaration needs no annotation. The design's
  `F32Array` would be a near-miss of a real name. `new` is now reserved; `[` and `]` are tokens (the lexer's `TOKEN`
  and the P4's `typed_lex_index.c`). The length is an integer literal from 1 to 1024 (a large frame reaches about
  4 KB).
- **Zeroed at the declaration**, every time it runs, as JavaScript's `new` and WGSL's `var` (Candela's
  `var stack: array<i32, 48>`) do. A C-style uninitialized array would make the WebAssembly oracle and RV32 disagree
  on a read before a write; the cost is a `sw zero` per word (a three-instruction loop beyond 16 words).
- **Checked indexing, unsigned.** `a[i]` traps when `i >= n` as an unsigned comparison, so a negative index traps too:
  the front end writes `local.get i; i32.const n; i32.ge_u; if; unreachable; end` with existing tape rows, so every
  pass already understands the check, and RV32 fuses it into one `bltu`/`bgeu` around an `ebreak`. An index that is not
  a plain local is computed once into a fresh local. **The unchecked forms.** A literal index: the front end checks
  it and writes `array.address offset + 4i` with no run-time check (one `addi` and the load). The counter of a counted
  loop: `for (k = c; k < n; k = k + s)` holds `0 <= k < n` whenever its body starts, if the body never writes `k`
  (unsigned `<`; or signed with `c` and `s` not negative, so `k` never is). The front end proves this itself, as it
  streams: the header's tape shape gives `c`, `n` and `s`; each `a[k]` with `n <= a.length` records its check's
  position; when the body ends, a walk of the body's tape for `local.set k` decides, and the recorded checks are cut
  out (nine cells each, later positions moved down; an inspection tape's spans with them). This is range analysis of
  the one shape that matters for arrays, and it needs no pass, so it applies under every policy and leaves the
  policies' pass lists, which board studies qualify, alone. `analysis/ranges.js` was not used: it runs only under
  `kernel`, only for functions that divide by a constant, and its intervals are flow-insensitive (a counter's
  interval includes its exit value `n`).
- **Where an array lives.** RV32: in the frame, an area between the stack-argument area and the slots (above `ra`, `s0`
  and the saved registers in a large frame), addressed from `sp` (`array.address`, a new pseudo-op that pushes the
  address of an area offset; `array.zero` clears a range). WebAssembly has no frame memory: each function's area is a
  static block below the previous function's from the top of the module's memory. That is exact because Typed's call
  graph is acyclic (checkAcyclic), so no function is ever active twice and its arrays need one copy. `linkWorld`
  refuses arrays, because the reactor runtime owns a linked world's memory.
- **An array is not a value**: no assignment, parameter, result, comparison or address. So it never aliases memory a
  pass reasons about (buffers, record fields); the passes treat `array.address` as an opaque i32 and an array store as
  a store (conservative for `fields` and `storeless`, which a later change could refine).
- **Passes.** The abstract operand stacks (inline, commute, hoist, value-sets, ranges) learn the two rows; `inline`
  keeps calls to a function with arrays (its area would need a place in the caller's); frameless leaves decline them.

# Answers to "Check your understanding" (section 5.13)

## 1. `x = y + 1` translated the way the current backend does

Each WebAssembly operation is translated in isolation: load its inputs from their slots into temporaries, compute, store the result to the slot of its result.

| WebAssembly | Emitted RV32 | Count |
| --- | --- | --- |
| `local.get y` | `lw t0, 0(sp)` | read `y` |
| | `sw t0, 8(sp)` | push to stack slot 0 |
| `i32.const 1` | `li t0, 1` (or `addi t0, zero, 1`) | materialise the constant |
| | `sw t0, 12(sp)` | push to stack slot 1 |
| `i32.add` | `lw t1, 12(sp)` | pop the right operand |
| | `lw t0, 8(sp)` | pop the left operand |
| | `add t0, t0, t1` | the only computation |
| | `sw t0, 8(sp)` | push the sum |
| `local.set x` | `lw t0, 8(sp)` | pop the sum |
| | `sw t0, 4(sp)` | write `x` |

That is **10 instructions**, of which exactly one (`add`) does arithmetic. The other nine move values between registers and memory, and the sum is stored to slot 8 and read back from slot 8 by the immediately following instruction. This is the same shape as the `let a = b + c` block in section 5.2, which also came to ten instructions; substituting a constant for the second operand does not change the count, because the backend still pushes the constant to a slot and pops it again.

Confidence: 3

*Note:* the article never shows a table row for `i32.const` in the current backend, so the two instructions for pushing the constant are my extrapolation of the stated rule ("load its inputs from their slots, compute, store the result to its slot"), not a quotation from the text.

## 2. The same statement with a compile-time operand stack

Now reads of locals and constants emit nothing; a value is only forced into a register when an operation needs it there.

| WebAssembly | Compile-time list after the operation | Emitted RV32 |
| --- | --- | --- |
| `local.get y` | `[local y]` | nothing |
| `i32.const 1` | `[local y, const 1]` | nothing |
| `i32.add` | `[register t0]` | `lw t0, 0(sp)`; `addi t0, t0, 1` |
| `local.set x` | `[]` | `sw t0, 4(sp)` |

The list holds two entries after the first two operations because the stack depth is two; both entries are "pending" in the sense of section 5.5 — the local has not been fetched and the constant has not been materialised. At `i32.add` the left operand is forced into a register (`lw t0, 0(sp)`) and the right operand is a known constant, so it needs no register at all and folds into the immediate field of the instruction; this is the article's own example, "`a + 1` becomes the single instruction `addi t0, t0, 1`". At `local.set` the list is empty and the value is stored once. Total: **3 instructions** instead of 10, and no operand-stack slot (8 or 12) is touched at all.

Confidence: 4

## 3. Why pending values must be moved to agreed locations before a join

At a join, one piece of code is reached by two or more different paths: the instruction after an `if` is reached both by falling out of the end of the block and by the branch that skipped the block. The compiler emits that continuation only once, so it must be a sequence that is correct for whichever path was taken. If one path left a pending value in `t0` and the other left it in `t3`, then every later instruction that names a register would be wrong on one of the two paths.

This is therefore a matter of **correctness**, not of code quality. The section says so directly — "This is a correctness requirement" — and the argument is a proof obligation rather than a heuristic: there is no single instruction sequence that reads a value from two different registers. The remedy, a *flush* before splits and merges, is the cheapest rule that guarantees agreement. The same reasoning applies at a call for a different reason: the calling convention allows the callee to clobber `t0`–`t6` and `a0`–`a7`, so anything still pending in those registers would not survive.

Confidence: 5

## 4. Why the branch-over-jump form is emitted, and what the measurement says

The backend translates in a single forward pass, so when it reaches the `if` it does not yet know the address of the end of the block. A conditional branch on RV32 reaches only about 4 KiB while an unconditional jump reaches about 1 MiB, so the backend cannot risk the short form and always emits `bnez t0, +8` followed by `j after_if`. The long form is always correct, at the price of one extra instruction per `if`; section 5.2 quotes Wirth calling unknown branch destinations "a difficulty inherent in all single-pass compilers".

The measurement in section 5.3 says the long form is almost never *necessary*: of 1,009 branch-over-jump pairs in Editor, 1,008 have a target within reach of a plain conditional branch, and in Agenda (274) and Files (75) every single one is within reach. So the precaution pays for 1,358 instructions across the three programs and buys protection against exactly one case. Section 5.6 gives the fix: emit the short form, remember its position, and rewrite that one site into the long form only if it turns out to be out of reach.

Confidence: 5

## 5. What the exact reproduction establishes, and what it leaves unproven

Matching today's output exactly for all 161 functions establishes that the walk decodes the WebAssembly correctly and that its instruction-counting rules are the same rules the real backend uses — in the article's words this "shows that the walk decodes and interprets the code correctly". Since the baseline is faithful, any difference between the baseline count and the models A and B counts is attributable to the changed rules, not to a broken counter.

It leaves the predictions themselves unproven in several ways. The models count instructions but never generate or run them, so nothing checks that the assumed sequences are actually correct code. Model A assumes a free temporary is always available, which may be false on the deepest expressions even though Editor's deepest operand stack is only 8. Model B assumes leaf and non-leaf register policies work out, and pays a flat two instructions per saved register. Both ignore the 16-bit compressed encodings that would apply to old and new code alike. And instruction count is only a proxy for the thing that matters, as section 5.9 notes: "Its predictions are a hypothesis to be confirmed by an implementation."

Confidence: 4

## 6. Two things the hand-written loop has that a one-operation-at-a-time translator cannot produce

First, **hoisting the load of the string length before the loop** (`blt t0, t1, loop` uses a length held in `t1`). This requires knowing that nothing inside the loop writes to the length field, i.e. loop-invariant code motion, which needs to reason about all the paths in the loop body — an intermediate representation plus data-flow analysis, not a single forward scan of one operation.

Second, **the missing bounds check on `charCodeAt`** (`lhu t2, 4(t2)` with no test). This requires proving that the loop condition `at < text.length` already implies `at` is a valid index, i.e. range-check elimination, which again is a whole-function proof. A third, if a different pair is wanted: the **test at the bottom of the loop** (loop inversion), which requires restructuring control flow before emission. All three are named in section 5.9 and said to need "an intermediate representation and data-flow analysis".

Confidence: 5

# Answers to "Check your understanding" (§5.13)

## 1. `x = y + 1` translated the way the current backend does

The rule from §5.2 is that every WebAssembly operation is translated on its own: load its inputs from their frame slots, compute, store the result to its slot. With `y` at offset 0, `x` at offset 4 and the two operand-stack slots at 8 and 12:

| WebAssembly | Emitted RV32 | Purpose |
| --- | --- | --- |
| `local.get y` | `lw t0, 0(sp)` | read `y` |
| | `sw t0, 8(sp)` | push it to stack position 1 |
| `i32.const 1` | `li t0, 1` | make the constant |
| | `sw t0, 12(sp)` | push it to stack position 2 |
| `i32.add` | `lw t1, 12(sp)` | pop the right operand |
| | `lw t0, 8(sp)` | pop the left operand |
| | `add t0, t0, t1` | the only instruction that computes |
| | `sw t0, 8(sp)` | push the sum |
| `local.set x` | `lw t0, 8(sp)` | pop the sum |
| | `sw t0, 4(sp)` | write `x` |

That is **10 instructions**, of which exactly one does arithmetic. It is the same count as the article's `let a = b + c`, because a constant costs a `li` and a `sw` just as a local read costs a `lw` and a `sw`; nothing in the scheme is cheaper for constants.

Confidence: 5

## 2. The same statement with a compile-time operand stack

Each list entry records where the value currently is instead of copying it into a slot. Readings of locals and constants stay lazy until an operation needs the value in a register.

| WebAssembly | Compile-time list after the operation | Emitted RV32 |
| --- | --- | --- |
| `local.get y` | `[local y]` | nothing |
| `i32.const 1` | `[local y, constant 1]` | nothing |
| `i32.add` | `[register t0]` | `lw t0, 0(sp)`; `addi t0, t0, 1` |
| `local.set x` | `[]` | `sw t0, 4(sp)` |

That is **3 instructions**: the `add` never needs a second register because the right operand is a known constant, so it collapses into an immediate `addi`, exactly as §5.5 says for `a + 1`. Only the left operand had to be fetched, since a value in memory cannot be an operand of `addi`. So 3 instructions replace 10, and the store to the slot at offset 8 and the load from it in the old scheme have both disappeared.

Confidence: 4

## 3. The two situations that do not require a flush

The two are a **trap** and a **hardware interrupt**. A trap ends the program's handling of the current event, so no code ever reads the frame afterwards and stale slots cannot be observed. A hardware interrupt saves and restores all registers itself, so whatever the interrupted code left in a register survives unchanged. In both cases the reason is the same: no path exists on which a later reader can disagree about where a value lives, which is the only thing the flush rule protects.

Confidence: 5

## 4. Why every `if` gets a branch over a jump

The backend translates in a single forward pass, so when it reaches the `if` it does not yet know how far away the end of the block will be. A conditional branch reaches only about 4 KiB while an unconditional jump reaches about 1 MiB, so the two-instruction form is the only one that is always correct without patching. The measurement in §5.3 says the caution is almost never needed: in Editor 1,008 of 1,009 branch-over-jump pairs had their target within reach of a plain conditional branch, and in Agenda and Files the figure was 274 of 274 and 75 of 75. In other words the long form is essentially always the long way round for no reason, which is why §5.6 proposes emitting the short branch and patching the rare exception.

Confidence: 5

## 5. How much smaller Editor's native code would be under model A

Today Editor's code is 175,860 bytes and model A is 66,176 bytes, so the saving is 175,860 − 66,176 = 109,684 bytes, which is 109,684 ÷ 1,024 = **107.1 KiB**; the ratio is 175,860 ÷ 66,176 = 2.66, matching the article's "2.7 times smaller". For comparison model B gives 175,860 − 53,020 = 122,840 bytes = 120.0 KiB, which is why the article quotes "about 107 to 120 KiB". This matters for Editor in particular because §5.8 says the world currently has only 58 KiB of memory to spare, so the saving is roughly twice the free memory, and Editor is by far the biggest of the three applications (43,965 emitted instructions in 120 functions against 7,710 and 1,529). Note that this is the one part of the answer I have to hedge: the article does not say whether the 58 KiB free is RAM while code lives in flash, so I cannot tell whether the saving addresses the shortage directly.

Confidence: 3

## 6. Two things in the hand-written loop that a one-at-a-time translator cannot produce

The first is the **hoisted load of `text.length` into `t1` before the loop**, which is loop-invariant code motion: it needs an intermediate representation of the whole function plus the knowledge that no statement in the loop body writes that field. The second is the **absent bounds check on `charCodeAt`**, which is range-check elimination: it needs a proof that the loop condition `at < text.length` already implies the index is in range, and that proof has to be carried around the loop. A translator that looks at one operation at a time has neither the whole-function view nor the flow facts, which is why §5.9 says these need "an intermediate representation of the whole function and an analysis of how values flow through it". (A third instance in the same listing is loop inversion, the test at the bottom.)

Confidence: 5

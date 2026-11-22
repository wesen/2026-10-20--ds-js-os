# Answers to "Check your understanding" (section 5.13)

## 1. `x = y + 1` translated the way the current backend does

`y` is at offset 0, `x` at 4, and the two operand-stack slots are at 8 and 12. Each WebAssembly
operation is translated on its own: load its inputs from their slots, compute, store the result to
its slot.

| WebAssembly | Emitted RV32 |
| --- | --- |
| `local.get y` | `lw t0, 0(sp)` (read `y`); `sw t0, 8(sp)` (push to first stack slot) |
| `i32.const 1` | `li t0, 1` (make the constant); `sw t0, 12(sp)` (push to second stack slot) |
| `i32.add` | `lw t1, 12(sp)` (pop right); `lw t0, 8(sp)` (pop left); `add t0, t0, t1`; `sw t0, 8(sp)` (push the sum) |
| `local.set x` | `lw t0, 8(sp)` (pop the sum); `sw t0, 4(sp)` (write `x`) |

That is 2 + 2 + 4 + 2 = **10 instructions**, and only one of them (`add`) does arithmetic. The count
matches section 5.2's `let a = b + c`, which has the same shape and is also ten instructions.

Confidence: 5

## 2. The same statement with a compile-time operand stack

The compiler keeps a list of where each operand-stack value currently is, and emits nothing for a
read of a local or a constant until an operation actually needs the value in a register.

| WebAssembly | List after the operation | Emitted RV32 |
| --- | --- | --- |
| `local.get y` | [local y] | nothing |
| `i32.const 1` | [local y, constant 1] | nothing |
| `i32.add` | [register t0] | `lw t0, 0(sp)`; `addi t0, t0, 1` |
| `local.set x` | [] | `sw t0, 4(sp)` |

The constant never needs a register: section 5.5 says that `a + 1` becomes the single instruction
`addi t0, t0, 1`, so the addition costs two instructions rather than four. Total: **3 instructions**,
against ten for the current backend.

Working: 2 (add) + 1 (store to `x`) = 3. (If one did not use the `addi` short form, the addition
would be `lw t0, 0(sp)`; `li t1, 1`; `add t0, t0, t1` and the total would be 4 — still fewer than
10, but the article's own rule for constants makes 3 the intended answer.)

Confidence: 4

## 3. Two situations that do not require a flush

Section 5.5 gives two. The first is a **trap**: a trap is a fault that ends the program's handling of
the current event, so after it nothing reads the frame and the places of pending values do not matter.
The second is a **hardware interrupt**, because the interrupt mechanism saves and restores all
registers itself, so any value the compiler left in a register is still there afterwards. Because of
these two cases the frame slots may hold stale values between one flush point and the next, but the
flush rule itself is unchanged.

Confidence: 5

## 4. Why the branch-over-jump form is emitted, and how often it is needed

The backend translates in one forward pass, so when it reaches an `if` it does not yet know how far
away the end of the block is. A conditional branch can only reach about 4 KiB, while an unconditional
jump reaches about 1 MiB; emitting `conditional branch; jump` is therefore always correct whichever
distance turns out to be right. It could return later to patch the distance, as Wirth's compiler does,
but the current backend does not.

The measurement says the caution is nearly always wasted. In Editor there are 1,009 branch-over-jump
pairs and 1,008 of them (all but one) have a target within reach of a plain conditional branch; in
Agenda all 274 and in Files all 75 are in reach. So of 1,358 pairs in the three applications, 1,357
could have been a single short conditional branch.

Confidence: 5

## 5. How much smaller Editor's native code would be under model A

Work in bytes first, since every RV32 instruction is 4 bytes. Today: 43,965 × 4 = 175,860 bytes,
which is exactly the "175,860 bytes of code" row in the section 5.8 table, so the table is internally
consistent. Under model A: 16,544 × 4 = 66,176 bytes, again the table's figure. The saving is
175,860 − 66,176 = 109,684 bytes; dividing by 1024 gives **about 107 KiB**. (For comparison model B
saves 175,860 − 53,020 = 122,840 bytes ≈ 120 KiB, which is the "107 to 120 KiB" range quoted.) As a
ratio 175,860 / 66,176 ≈ 2.66, matching the article's "2.7 times smaller".

It matters for Editor in particular because Editor is the largest of the three applications (43,965
instructions against 7,710 and 1,529) and because the article says the device "currently has 58 KiB of
memory to spare". A saving of about 107 KiB is roughly twice the free space, so this is the one
application where the gain would change what fits, rather than being a comfortable margin.

Confidence: 4

## 6. Two things in the hand-written loop that a one-operation-at-a-time translator cannot produce

(a) **Loading the string length once, before the loop** (`lw t1, 0(a0)` hoisted out of the body).
This is loop-invariant code motion, and it needs the knowledge that nothing inside the loop changes
`text.length` — a fact about the whole loop, not about one instruction.

(b) **Omitting the bounds check on `charCodeAt`** (`lhu t2, 4(t2)` with no test that `at` is in
range). This is range-check elimination, and it needs the knowledge that the loop condition
`at < text.length` already implies the check cannot fail — again a fact that spans the loop's test
and the body.

(A third, if wanted: putting the test at the bottom of the loop, "loop inversion", which needs the
knowledge that the loop runs at least once, or a separate test before it, as the `bge t0, t1, done`
guard provides.)

Confidence: 5

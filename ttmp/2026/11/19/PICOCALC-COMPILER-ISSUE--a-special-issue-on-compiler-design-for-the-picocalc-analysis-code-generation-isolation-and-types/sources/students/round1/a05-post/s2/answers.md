# Answers to section 5.13, "Check your understanding"

Layout assumed, as given in the question: `y` at offset 0, `x` at offset 4, operand-stack
slots at offsets 8 (stack slot 0) and 12 (stack slot 1).

## 1. `x = y + 1` translated the way the current backend does

Following the pattern of the `bump` table in section 5.2: a push is "load the value into a
temporary, store it to the next stack slot"; an operation is "load the right operand, load the
left operand, compute, store the result to the left operand's slot"; a pop is "load the slot,
store the destination".

| WebAssembly | Emitted RV32 | Purpose |
| --- | --- | --- |
| `local.get y` | `lw t0, 0(sp)` | read `y` |
| | `sw t0, 8(sp)` | push to stack slot 0 |
| `i32.const 1` | `li t0, 1` | materialise the constant |
| | `sw t0, 12(sp)` | push to stack slot 1 |
| `i32.add` | `lw t1, 12(sp)` | pop right operand |
| | `lw t0, 8(sp)` | pop left operand |
| | `add t0, t0, t1` | the sum |
| | `sw t0, 8(sp)` | push the sum |
| `local.set x` | `lw t0, 8(sp)` | pop the sum |
| | `sw t0, 4(sp)` | write `x` |

That is **10 instructions**: 8 loads/stores of the value itself, plus `li` and `add`. Note the
push of a constant costs two instructions, exactly like the push of a local, even though the
value is known at compile time. Two of the ten do real work and the pair `sw t0, 8(sp)` /
`lw t0, 8(sp)` at the `i32.add` / `local.set` boundary is a store immediately followed by a load
of the same slot. (The article never shows what the backend emits for `i32.const`; I assumed
`li` plus a push, which is the only choice consistent with keeping the stack in memory. If the
backend instead emitted a single store of a literal, the count would be 9.)

Confidence: 4

## 2. The same statement with a compile-time operand stack

The list records where each operand-stack entry currently lives; nothing is emitted for a local
read or a constant until some operation needs the value in a register.

| WebAssembly | List after the operation | Emitted RV32 |
| --- | --- | --- |
| `local.get y` | `[local y]` | nothing |
| `i32.const 1` | `[local y, const 1]` | nothing |
| `i32.add` | `[register t0]` | `lw t0, 0(sp)`; `addi t0, t0, 1` |
| `local.set x` | `[]` | `sw t0, 4(sp)` |

At `i32.add` the left operand is a local, so it must be loaded; the right operand is the
constant 1, so it never occupies a register and the add becomes the immediate form `addi`.
The count is **3 instructions** against the 10 above. It cannot drop lower without technique 4,
because `y` still lives in the frame and `x` must go back to it; if both were in registers the
whole statement would be one `addi`.

Confidence: 4

## 3. Why pending values must be moved to agreed locations before a join

The instruction stream after a join is emitted **once** but is reached along two or more paths
(the fall-through end of an `if` block and the branch that skipped it, for instance). If one
path left a pending value in `t0` and the other left it in `t3`, then no single instruction
sequence placed after the join can be right for both paths: one path would read a stale or
wrong register. Moving every pending entry to a fixed, agreed location before the split and
before the merge (a *flush*) makes the state identical on every incoming path.

This is a matter of **correctness**, not code quality. It is not an optimisation that a compiler
may skip; a backend that ignores it produces wrong programs. Only the *choice* of agreed
location, and how often a flush happens, is a quality question.

Confidence: 5

## 4. Why a branch over a jump, and what the measurement says

The backend translates in a single forward pass. When it reaches an `if`, the end of the block
has not been translated yet, so the distance to the join is unknown. A conditional branch only
reaches about 4 KiB while an unconditional jump reaches about 1 MiB, so emitting the conditional
branch to a nearby trampoline and then a jump to the real target is always correct regardless of
distance. That is the "long form" the backend always picks.

Section 5.3 says the long form is almost never necessary: in Editor there are 1,009
branch-over-jump pairs and 1,008 of them have a target within reach of a plain conditional
branch; in Agenda all 274 and in Files all 75 are within reach. So the long form is required for
one site out of 1,358, and section 5.6's remedy — emit the short branch, record its position, patch
it to the long form only if the target turns out to be far — costs almost nothing.

Confidence: 5

## 5. What the exact reproduction establishes, and what it does not

It establishes that the walk **decodes and interprets the WebAssembly correctly** and that its
model of the current backend's emission rules is faithful: since the walk reproduces all 43,965
etc. instructions of 161 functions exactly, the counting machinery and the rules it applies are
not the source of error. That is why the later numbers deserve attention rather than dismissal.

It leaves unproven everything about the new rules. The walk counts instructions but does not
generate them, so models A and B are never assembled or run; the prediction assumes a free
temporary register is always available; it ignores the 16-bit compressed encodings that would
change both old and new code sizes; and it embeds cost assumptions of its own (two instructions
per saved-register save and restore, 155 flush instructions) that the exact match on today's
rules does not test, because today's backend has no flushes and keeps no locals in registers.
The prediction is therefore a well-grounded hypothesis, confirmed only by implementing the
backend.

Confidence: 5

## 6. Two things in the hand-written loop that one operation at a time cannot produce

First, `t1` holds `text.length`, loaded **once before the loop**. Producing that requires
loop-invariant code motion: the compiler must establish that nothing in the loop body writes the
length, which is knowledge about the whole loop (def-use information), not about one operation.

Second, `lhu t2, 4(t2)` has **no bounds check**, while the source `charCodeAt` must check. That
requires range-check elimination: proving that the loop condition `at < text.length` already
implies the index is in range, i.e. reasoning about the values the index can take.

A third item, if one is allowed, is that the test sits at the bottom (`blt t0, t1, loop`) rather
than being duplicated at the top, which is loop inversion.

Confidence: 5

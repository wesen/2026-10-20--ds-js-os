# Answers to "Check your understanding" (section 5.13)

## 1. `x = y + 1` translated the way the current backend does

Following the pattern of section 5.2 (load the local, store it to the next free stack
slot, and so on), with `y` at 0, `x` at 4, and stack slots at 8 and 12:

```
lw   t0, 0(sp)      # local.get y: read y
sw   t0, 8(sp)      #   push it: first stack slot
li   t0, 1          # i32.const 1: make the constant
sw   t0, 12(sp)     #   push it: second stack slot
lw   t1, 12(sp)     # i32.add: pop the right operand, 1
lw   t0, 8(sp)      #   pop the left operand, y
add  t0, t0, t1     #   t0 = y + 1
sw   t0, 8(sp)      #   push the sum
lw   t0, 8(sp)      # local.set x: pop the sum
sw   t0, 4(sp)      #   write x
```

That is ten instructions for four WebAssembly operations, and only one of the ten
does arithmetic. The shape is exactly the ten instructions section 5.2 counts for
`let a = b + c`, because the constant costs the same two instructions (`li` then
`sw`) as a local read does. The sum is stored to offset 8 and loaded from offset 8
by the very next instruction, which is the waste the later sections remove.

Confidence: 5

## 2. The same statement with a compile-time operand stack

Reading a local or a constant emits nothing; the list only records where the value
is (section 5.5).

| WebAssembly | Compile-time list after the operation | Emitted RV32 |
| --- | --- | --- |
| `local.get y` | [local y] | nothing |
| `i32.const 1` | [local y, const 1] | nothing |
| `i32.add` | [register t0] | `lw t0, 0(sp)`; `addi t0, t0, 1` |
| `local.set x` | [] | `sw t0, 4(sp)` |

Three instructions replace ten. The constant never occupies a register, because
section 5.5 says a constant operand usually needs none and that `a + 1` becomes the
single instruction `addi t0, t0, 1`; so the add costs a load of `y` plus one `addi`
rather than the three instructions it costs when both operands are in memory. The
result stays in `t0` and is written once to `x`, so nothing is stored to a stack
slot. No flush is needed here, since there is no join and no call between reading
`y` and writing `x`.

Confidence: 4

## 3. The two situations that do not require a flush

The first is a trap: a trap ends the program's handling of the current event, so
nothing reads the frame afterwards, and stale frame slots can do no harm. The
second is a hardware interrupt, which saves and restores all registers itself, so a
value that is only in a register cannot be lost by whatever runs during the
interrupt. In both cases the rule itself does not change; it is only that the
locations need not agree with anything, because no code continues from that point
in the ordinary way. Section 5.5 puts this as: between one flush point and the
next, frame slots may hold stale values without harm.

Confidence: 5

## 4. Why branch-over-jump, and how often it is necessary

The backend translates in a single forward pass, so when it reaches the `if` it does
not yet know how far away the end of the block will be. A conditional branch reaches
only about 4 KiB while `j` reaches about 1 MiB, so the backend always emits the pair
(conditional branch skipping an unconditional jump), which is always correct
whatever the distance turns out to be. Section 5.3 measures 1,009 such pairs in
Editor, 274 in Agenda and 75 in Files, and says that in Editor all but one
(1,008 of 1,009) have a target within reach of a plain conditional branch; in Agenda
and Files all of them are. So the long form is almost never necessary: in Editor it
is wrong for one site out of 1,009.

Confidence: 5

## 5. How much smaller model A makes Editor's native code

Working from the byte row of the section 5.8 table: today 175,860 bytes, model A
66,176 bytes. The difference is 175,860 − 66,176 = 109,684 bytes, and
109,684 ÷ 1024 ≈ 107.1 KiB. As a ratio, 175,860 ÷ 66,176 ≈ 2.66, which is the
"2.7 times smaller" of the text; (checking the other column, 175,860 − 53,020 =
122,840 bytes ≈ 120.0 KiB for model B, matching the "107 to 120 KiB" sentence).
This matters for Editor in particular because section 5.8 says Editor's world has
only 58 KiB of memory to spare: a saving of about 107 KiB is roughly twice the free
space, so it is not a marginal improvement but the difference between a program that
fits with room to grow and one that does not.

Confidence: 5

## 6. Two things in the hand-written loop that one operation at a time cannot produce

The first is `lw t1, 0(a0)` before the loop, the string length loaded once instead of
on every iteration: this is loop-invariant code motion, and it requires knowing that
nothing in the loop body writes `text.length`, which means looking at the whole loop
rather than at one operation. The second is that `lhu t2, 4(t2)` has no bounds check
on `charCodeAt(at)`: this is range-check elimination, and it requires proving that
the loop-entry test `at < text.length` guarantees the index is in range for every
iteration, a fact about values that flow around the loop. The article also lists a
third, loop inversion (the test at the bottom of the loop, `blt t0, t1, loop`), which
requires seeing the loop as a whole so that the first test can be peeled out.
Section 5.9 says all three need an intermediate representation of the whole function
and an analysis of how values flow through it.

Confidence: 4

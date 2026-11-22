# Answers to section 5.13 (Check your understanding)

## 1. `x = y + 1` the way the current backend does it

Following the `bump` table exactly: each WebAssembly operation is translated in isolation, every push goes to the next operand-stack slot, every pop comes back out of it. Slot 0 is offset 8, slot 1 is offset 12.

| WebAssembly | Emitted RV32 | Purpose |
| --- | --- | --- |
| `local.get y` | `lw t0, 0(sp)` | read `y` |
| | `sw t0, 8(sp)` | push to stack slot 0 |
| `i32.const 1` | `li t0, 1` | materialize the constant |
| | `sw t0, 12(sp)` | push to stack slot 1 |
| `i32.add` | `lw t1, 12(sp)` | pop the right operand |
| | `lw t0, 8(sp)` | pop the left operand |
| | `add t0, t0, t1` | the only instruction that computes anything |
| | `sw t0, 8(sp)` | push the sum to slot 0 |
| `local.set x` | `lw t0, 8(sp)` | pop the sum |
| | `sw t0, 4(sp)` | write `x` |

Ten instructions, of which one does arithmetic; the same count as `let a = b + c` in 5.2, because the only difference is that the middle push materializes a constant instead of reading a local. Note the sum is stored to offset 8 and immediately loaded from offset 8 by the two-instruction `local.set` — the store-load pair the article measures at 34 percent. The article never shows how the current backend pushes an `i32.const`, so `li t0, 1` is my reconstruction from "load its inputs from their slots, compute, store the result to its slot"; `addi t0, x0, 1` would do the same job.

Confidence: 4

## 2. The same statement with a compile-time operand stack

| WebAssembly | Compile-time list after the operation | Emitted RV32 |
| --- | --- | --- |
| `local.get y` | `[local y]` | nothing |
| `i32.const 1` | `[local y, const 1]` | nothing |
| `i32.add` | `[register t0]` | `lw t0, 0(sp)`; `addi t0, t0, 1` |
| `local.set x` | `[]` | `sw t0, 4(sp)` |

The two reads emit nothing, because the list records that the value is "the current value of local 0" and that the second is "the constant 1" — neither has been fetched or computed. At `i32.add` the left entry must become a register, so one load is emitted; the right entry is a constant and needs no register at all, so it folds into the `addi` immediate, exactly as the article's `a + 1` example says. The result stays in `t0` rather than being pushed anywhere, so `local.set x` is a single store. That is three instructions instead of ten, and only one of the three touches memory beyond the one load and one store. If one insisted on a register for the constant the total would be four (`li t1, 1`; `add t0, t0, t1`), which is what the `let a = b + c` row in 5.5 shows for two locals; the article is explicit only about `a + 1`.

Confidence: 4

## 3. Why pending values must be moved to agreed locations before a join

Because the compile-time list describes only the path the compiler is currently walking, while the code after the join is emitted once and is reached by every path. If one path leaves a pending value in `t0` and the other leaves it in `t3`, then every instruction after the join would have to be right for both, and no single instruction sequence can be — the very instruction that reads the value names one register. The flush (moving every pending entry to a fixed, agreed location) is therefore a matter of **correctness**, not of code quality: without it the compiled program computes the wrong answer or reads a stale slot, rather than merely being slower. The article is explicit that this is a correctness requirement and separately measures the cost as 155 of 16,544 instructions in Editor (under one percent), which is the sign that it is a cheap obligation rather than a quality trade. The same reasoning applies before a call, but there the reason is different: the calling convention lets the callee overwrite the registers, so a value is not "in the same place" after the call unless it was saved.

Confidence: 5

## 4. Why the branch-over-jump form, and what 5.3 says about it

The backend translates in a single forward pass, so when it reaches an `if` it does not yet know how far away the end of the block is. A conditional branch reaches only about 4 KiB while a jump reaches about 1 MiB, so the backend emits the conditional branch over a jump: whichever the distance turns out to be, one of the two instructions will reach. Wirth's remedy (patch the instruction later, once the destination is known) is only applied in section 5.6, so today the long form is emitted unconditionally.

Section 5.3 says the long form is almost never needed: 1,009 branch-over-jump pairs in Editor, of which 1,008 have a target within reach of a plain conditional branch, and 274 of 274 in Agenda and 75 of 75 in Files are likewise in reach. So the pair is essentially always the wrong instruction choice — all but one occurrence out of 1,358 measured pairs could have been a single conditional branch.

Confidence: 5

## 5. What the exact reproduction establishes, and what it does not

Reproducing today's count exactly for all 161 functions (7 + 34 + 120, which matches the table) establishes that the walk decodes the WebAssembly and applies the current backend's rules correctly — the counting machinery and the rule set are both validated against real output, so an error in the walk would almost certainly have shown up as a mismatch on at least one function. It is evidence that the *baseline* is modelled faithfully, which is why the article calls it "the reason to take the hypothesis seriously."

It leaves unproven everything about models A and B, because those use *different* rules: no real output exists for them, so there is nothing to compare against. Specifically, the model counts instructions but never emits them, so the predicted sequences are never assembled, run, or checked for correctness; it assumes a free temporary register is always available; it ignores the 16-bit compressed encodings that RV32 offers (which would shrink both old and new code, so the ratio may survive but the absolute kilobytes are not predictions of real output); and it says nothing about how the extra register pressure interacts with real calling-convention saves. The 2.7 and 3.3 factors are therefore a hypothesis about size only, not a measurement, and not a claim about speed.

Confidence: 4

## 6. Two things in the hand-written loop that one operation at a time cannot produce

**(a) The length load hoisted out of the loop.** The hand version keeps `text.length` in `t1` and loads it once, before the loop, which requires knowing that nothing inside the loop body changes the string — knowledge that spans the whole loop, not one operation. **(b) The missing bounds check on `charCodeAt`.** The hand version uses a bare `lhu t2, 4(t2)` where the compiler would have to test the index and trap, which requires proving that the loop condition `at < text.length` already implies the index is in range. A third one, beyond the two asked for, is that the loop test sits at the *bottom* (`blt` after the body) instead of as a test at the top jumping over the body, which is loop inversion. All three need an intermediate representation and data-flow analysis rather than a single forward pass over stack operations; the article names them as loop-invariant code motion, range-check elimination and loop inversion.

Confidence: 4

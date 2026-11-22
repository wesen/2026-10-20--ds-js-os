# Answers

## 1. `x = y + 1` with the current stack-machine-style backend

With an explicit operand stack in memory, every WebAssembly operation must finish by writing its
result into a stack slot, so each operation becomes a load/constant materialisation plus a store:
`local.get y` → `mov eax,[rbp+0]` + `mov [rbp-8],eax` (2); `i32.const 1` → `mov eax,1` +
`mov [rbp-12],eax` (2); `i32.add` → `mov eax,[rbp-8]` + `mov ecx,[rbp-12]` + `add eax,ecx` +
`mov [rbp-8],eax` (4); `local.set x` → `mov eax,[rbp-8]` + `mov [rbp+4],eax` (2). That is about
**10 instructions** for a three-operation expression. The exact opcode/register spellings would
depend on the article's example, but the count follows from one store per stack push and one or two
loads per stack pop.
Confidence: 3

## 2. The same statement with a compile-time operand stack, lazy constants and lazy locals

The list after each operation: after `local.get y` → `[Local y]` (no code); after `i32.const 1` →
`[Local y, Const 1]` (no code); after `i32.add` → pop the constant and the local, fold them into one
instruction `mov eax,[rbp+0]` / `add eax,1`, stack becomes `[VReg eax]` (2 instructions); after
`local.set x` → pop into the destination, `mov [rbp+4],eax` (1 instruction). Total **3
instructions**, i.e. roughly a third of the naive version, and the intermediate stack slots at
offsets 8 and 12 disappear entirely. If the backend also kept the pending value in a register that
already matched the destination, the last store could in principle be hoisted, but for this example
three is the natural count.
Confidence: 3

## 3. Two situations in section 5.5 where pending values need not be moved to agreed locations

I cannot know this without the article. My best reasoning is that the two cases will be the ones
where no other code can observe the pending value: (a) the value is consumed immediately by the very
next instruction that produced the agreement contract, so it can stay wherever it happens to be
(typically because it already sits in a register the consumer accepts, or can be folded in as an
immediate), and (b) the value is on a path where it is dead — the end of a block, a block whose
result is never used, or the last use before an unconditional transfer — so there is no join point
that requires a common location. In both cases the reason is the same: the "agreed location" exists
only to satisfy another consumer across a join, and if there is no such consumer, the move is
pure waste.
Confidence: 1

## 4. Why the current backend emits a conditional branch plus an unconditional jump for every `if`

I cannot know the measurement in section 5.3 without the article. The reason to expect the shape is
that the translator works one operation at a time with no lookahead: when it sees the `if` it must
emit the false-edge branch to a label it has not placed yet, and because it cannot know whether the
then-block will be followed by an `else` or whether the target will end up being the immediately
next instruction, it conservatively ends the block with a jump to the join point. The measurement
almost certainly shows that this unconditional jump is nearly always unnecessary — that is, in the
overwhelming majority of cases the jump target is the very next instruction, so the jump is a pure
fall-through and the conditional branch could be inverted instead. I would expect a figure in the
high nineties per cent.
Confidence: 2

## 5. Size reduction for Editor under model A

I cannot know this without the article, because the answer requires both Editor's native code size
and the percentage saving in the section 5.8 table. The computation would be
`saving_KiB = Editor_native_size_KiB × reduction_percent / 100`, so if the table gives, say, a 40%
reduction and Editor's native code is a few hundred KiB, the saving lands in the low hundreds of
KiB. It matters for Editor specifically because Editor is presumably the largest program built on
this toolchain and the one that has to fit, with its own data and the operating system, into the
PicoCalc's limited flash and RAM; a saving of that order is the difference between fitting and not
fitting rather than a cosmetic improvement. It would also shrink the code that has to be copied or
paged in, which affects load time and cache behaviour on a small machine.
Confidence: 1

## 6. Two things in the hand-written loop (5.9) a one-operation-at-a-time translator cannot produce

I cannot know the article's exact list, so I will name the two most likely and say what each needs.
First, keeping the induction variable and the running total in fixed registers across the loop back
edge instead of reloading and storing them each iteration — this requires liveness analysis across
basic blocks, in particular knowing that a value defined in one iteration is still live at the next,
which a translator that forgets everything at every operation boundary does not have. Second,
strength reduction or pointer bumping, e.g. replacing `base + i*4` with a pointer that is advanced by
4 each iteration and hoisting the loop-invariant part out of the body — this requires knowing that
`i` is an induction variable with a predictable increment, i.e. loop analysis plus knowing that the
multiplier is a constant. A third candidate would be fusing the bounds check or the comparison with
the branch, which needs to know that the compared value is the loop counter and that its range is
invariant.
Confidence: 2

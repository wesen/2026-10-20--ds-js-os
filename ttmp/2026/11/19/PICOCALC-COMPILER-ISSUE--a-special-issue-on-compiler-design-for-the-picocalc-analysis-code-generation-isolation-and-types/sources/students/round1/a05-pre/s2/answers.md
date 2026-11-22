# Answers — "5. Code Generation: From a Stack Machine to a Register Machine"

(Section headings read literally, but no titles were supplied.)

## 1. Naive stack-slot translation of `x = y + 1`

The current backend mirrors WebAssembly one operation at a time, so every operand-stack value is
materialised into a fixed frame slot (`y` at 0, `x` at 4, stack slots at 8 and 12) instead of
staying in a register. Roughly, that gives: `local.get y` = load `[fp+0]`, store to result register
and spill to slot `[fp+8]`; `i32.const 1` = load immediate, spill to `[fp+12]`; `i32.add` = load
`[fp+12]`, load `[fp+8]`, add, spill the sum back to `[fp+8]`; `local.set x` = load `[fp+8]`, store
to `[fp+4]`. That is about ten instructions for a statement that has three real data movements, and
two of them are pure spill traffic through memory that no machine actually needs. I cannot know the
exact listing or the exact count without the article, because the number depends on the back-end's
ISA (one-address accumulator or three-address) and on whether the code generator keeps a value in
the accumulator result register or always reloads it.

Confidence: 2

## 2. Same statement with a compile-time operand stack and lazy constants

With a compile-time stack the translator pushes *descriptors* rather than emitting code: after
`local.get y` the stack is `[local(y @0)]` and nothing is emitted; after `i32.const 1` it is
`[local(y @0), const(1)]` and still nothing is emitted; after `i32.add` it collapses to
`[const-folded? no — expr(y @0 + 1)]` and emits a single `ADD rtmp, [fp+0], 1` (or
`LOAD rtmp,[fp+0]` + `ADD rtmp,#1` if there is no memory-operand form); after `local.set x` it pops
the pending value and emits `STORE [fp+4], rtmp`, leaving the stack empty. Total: two instructions
(three if the ALU has no immediate/memory operand form), and neither operand-stack slot at 8 or 12
is touched at all — the slots become dead and the frame can shrink. The gain is around five times on
this statement, entirely from deleting spills of values that were consumed one operation later.

Confidence: 3

## 3. Why pending values must be moved to agreed locations before a join

A pending value is a promise made by the *emitter*, not by the machine, so it only holds along the
single path where it was made; at a merge point the successor block is emitted once but reached
from several predecessors, and each predecessor may be holding the same logical stack value in a
different register, in a different temp slot, or still as an unexpanded constant. The block can
only be compiled if all predecessors agree on one canonical home for every stack entry (the usual
solution: spill pending values to their fixed stack slots on any edge that does not already match,
so the join sees memory). This is a matter of correctness, not code quality — if the block reads a
location a predecessor did not write, it reads a stale value, and no amount of "less optimal code"
framing rescues a wrong answer. The cost is quality: those join spills are pure overhead exactly
where the compiler could not prove agreement.

Confidence: 4

## 4. Why every `if` gets a conditional branch *and* an unconditional jump

A one-operation-at-a-time translator emits blocks in the order of the input, so it emits the
condition, `JZ else`, the then-block, `JMP end`, the else-block, and the `end` label; that
unconditional jump is wired in unconditionally because the emitter does not know, when it emits the
then-block, whether an else-block will follow or whether the `end` label will end up being the next
instruction anyway. The jump is genuinely needed only for the if/else shape; for a bare `if` (no
else) the else-label and the end-label coincide and the jump branches to the very next instruction.
I cannot know the measurement in section 5.3 without the article, but the claim that section would
have to support is that the redundant jump is needed in only a minority of the `if`s in the corpus
(the fraction of `if`s that have an else). My expectation is a figure in the region of one in four
to one in three, i.e. roughly 70–75% of these jumps are dead weight.

Confidence: 2

## 5. What the counting model establishes, and what it does not

Reproducing the current instruction count exactly for all 161 functions establishes that the cost
model is a faithful description of the *existing* backend: the per-opcode weights and the rule for
when a value is spilled are calibrated against ground truth over a broad, real corpus, so the model
is not a wishful abstraction and its numbers can be arithmetically trusted as accounting. It does
not establish that models A and B can be realised as described. A model is a prediction about what
a future compiler will emit; it silently assumes that the register allocator will actually keep the
pending values in registers (not spilling under pressure), that one modelled "operation" really is
one machine instruction on the target ISA (immediates that do not fit, ABI moves around calls,
compare-and-branch patterns), and that the 161 functions exercise the cases where the new model
differs from the old one. It also proves nothing about correctness or about run-time speed — static
counts, not dynamics.

Confidence: 3

## 6. Two things in the hand-written loop a one-operation translator cannot produce

Two candidates: (a) a loop value held in a register for the whole loop instead of being reloaded
from its slot on every iteration, which requires liveness/loop-invariance analysis over the whole
control-flow graph — knowledge that the slot is neither written nor aliased inside the loop, plus a
register reserved across a back edge; and (b) a fused compare-and-branch loop closing (decrement
plus branch-if-nonzero, or `cmp`+`jcc` collapsed into one), which requires pattern knowledge of the
loop's *shape* — that the counter and the bound are the same quantity — not knowledge of any single
opcode. I cannot know which two the article actually lists without reading section 5.9. Both are
"whole-region" facts: the one-operation translator sees each WebAssembly operation in isolation and
has no representation in which a fact spanning several operations could even be stated.

Confidence: 3

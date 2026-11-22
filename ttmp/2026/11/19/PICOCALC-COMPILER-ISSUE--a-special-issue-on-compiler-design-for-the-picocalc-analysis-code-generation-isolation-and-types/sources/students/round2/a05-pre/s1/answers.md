# Answers

*(Answered before reading the article. Where the answer depends on facts only the article
contains, I say so and then reason about what the answer would have to look like.)*

## 1

The naive backend treats the WebAssembly operand stack as real memory at fixed frame offsets,
so every op is a load/store round trip. `local.get y` becomes "load word from `[fp+0]`, store to
`[fp+8]`" (2 instructions); `i32.const 1` becomes "materialize 1, store to `[fp+12]`" (2);
`i32.add` becomes "load `[fp+8]`, load `[fp+12]`, add, store to `[fp+8]`" (4); `local.set x`
becomes "load `[fp+8]`, store to `[fp+4]`" (2). That is **10 instructions** in total, of which
only one (`add`) does real work — the other nine are pure traffic between the operand stack,
locals and registers.

Confidence: 3

## 2

A compile-time operand stack tracks *where* each pending value lives instead of copying it to a
fixed slot. After `local.get y` the stack is `[local:y@0]` (0 instructions); after `i32.const 1`
it is `[local:y@0, const:1]` (0 instructions); after `i32.add` it is `[lazy: add(y,1)]`, which can
be emitted as a single `add rd, r_y, #1` because the constant folds into an immediate operand
(1 instruction); `local.set x` stores that register into `x`'s home slot, `str rd,[fp+4]`
(1 instruction), or 0 instructions if `x` is kept in a register. Total **2 instructions** (best
case 1), versus 10 for the naive backend.

Confidence: 3

## 3

I cannot know this without the article, since 5.5's two exemptions are specific to its design. My
best reasoning is that they are the two places where moving a value would be pointless rather
than merely wasteful: (a) when the *consumer* of the pending value can read it where it already
is — e.g. a pending value sitting in a register that is consumed by an instruction that accepts an
arbitrary register operand, so "agreement" is achieved by choosing the consumer's operand instead
of relocating the value (this is register allocation / coalescing rather than shuffling); and
(b) when the value is at a *boundary it will never cross* — the end of a basic block whose
successor is the join point where the value becomes a fixed local or is dead, so the copy can be
elided as a rename (the drop of the operand stack at block exit, or a `local.set` where the
destination is the value's home). The reason in both cases is the same: agreement on a location is
only needed when two independently chosen locations must meet.

Confidence: 2

## 4

Because the backend translates one WebAssembly operation at a time with no ability to see the
shape of the block it is inside: `if` is lowered as "branch-if-false past the then-body", and the
else-body has to be skipped afterwards, so after the then-body it emits an unconditional jump to
the join point. It never learns whether that jump is *needed* — e.g. when the then-body already
ends in a branch or return, or when there is no else-body at all — so it pays for it always. I
cannot know the exact figure from 5.3, but the measurement must show that the unconditional jump
is required in only a small minority of cases (the near-zero-percent end); the point of the
measurement is precisely that the code is emitted unconditionally while being necessary almost
never.

Confidence: 3

## 5

I cannot know this without the article: the answer is "the Editor's model-A size from the 5.8
table times the reduction model A gives", and neither number is derivable without the table. What
the answer *has to look like* is a subtraction of two table rows (current backend vs. model A for
Editor), expressed in KiB, most plausibly of the order of tens of KiB — larger than the savings
for the other programs simply because Editor is the biggest program, and a fixed percentage of a
big number is a big number. It matters for Editor specifically because Editor is the program that
is stressed against the machine's fixed resources: it is the largest native image (so it defines
whether the output fits in flash / in whatever RAM the native code must be loaded into) and it has
the largest hot code footprint, so a proportional size cut buys real instruction-fetch and
loading benefit where the other examples are too small to care.

Confidence: 1

## 6

Two things: **(i) keeping a variable in a register for the whole loop** — the hand-written loop
holds the index/accumulator in a register and reloads nothing per iteration, which requires
*liveness and loop-carried-variable knowledge across basic blocks*, something a one-op-at-a-time
translator structurally cannot have because when it sees the loop body it has already forgotten
the values defined before it. **(ii) a fused machine idiom, such as a compare-and-branch or a
post-increment/indexed load** that replaces several WASM operations with one instruction — this
requires *pattern knowledge over a window of operations* (a peephole over the sequence `local.get`,
`i32.load`, `i32.const`, `i32.add`, `local.set`) rather than knowledge of any single op. A third
candidate in the same spirit is hoisting the loop-invariant base address out of the loop, which
also needs global invariant analysis.

Confidence: 2

# Answers

Article: "5. Code Generation: From a Stack Machine to a Register Machine" (not supplied to me).

## 1

I am reconstructing this, since I have not seen the backend. For a translator that handles one
WebAssembly operation at a time and keeps every value in memory, `local.get y` costs two
instructions (`mov eax,[fp+0]` then `mov [fp+8],eax`, pushing to slot 8), `i32.const 1` costs two
(`mov eax,1` then `mov [fp+12],eax`, pushing to slot 12), `i32.add` costs three (`mov eax,[fp+8]`,
`add eax,[fp+12]`, `mov [fp+8],eax`) and `local.set x` costs two (`mov eax,[fp+8]`,
`mov [fp+4],eax`). That is nine instructions for one assignment, and note that slot 8 is written
three times and read twice for a single addition. The essential property is not the exact number but
that every intermediate crosses the memory bus: three stores and four loads for one `+`.
Confidence: 3

## 2

With a compile-time operand stack holding abstract values, the stack evolves as `[Local y]` after
`local.get y`, then `[Local y, Const 1]` after `i32.const 1`; nothing is emitted for either, because
a local is just a name for a frame slot and a constant is just an immediate waiting for a consumer.
`i32.add` pops both and emits exactly the two instructions `mov r0,[fp+0]` / `add r0,1`, leaving
`[Tmp r0]`, and `local.set x` pops that and emits one more, `mov [fp+4],r0`. Total: three
instructions instead of nine, and the operand-stack slots at offsets 8 and 12 are never touched at
all. The saving comes from two independent ideas: lazy constants let the `1` fold into the immediate
field of `add`, and lazy locals let `y` be read directly from its home slot instead of being copied
into a temporary first.
Confidence: 4

## 3

Pending values must be materialized into agreed locations before a join because a join label is a
single piece of code shared by more than one predecessor, and each predecessor may arrive with the
logical operand stack living in different physical places; the code after the label can only read
one place. This is correctness, not code quality: if the two edges disagree, one of them silently
delivers a stale register or an uninitialized slot and the program computes a wrong value, whereas
choosing *which* agreed location to use (fixed spill slots in the frame versus register-plus-phi-move)
is only a quality decision affecting instruction count. Put differently, the *obligation to agree* is
part of the semantics of the translation, while *where* they agree is an optimization.
Confidence: 4

## 4

Because the translator looks at one WebAssembly operation at a time, it sees the `if` as a
`br_if` to an else label immediately followed by an unconditional `br` to the end label — the shape
of the structured text, not the shape of the machine's control flow — so it reproduces that shape
faithfully, and an unconditional jump is genuine when the then-block is followed by an else-block
that must be skipped. What it cannot see is that in the common case where the then-block ends
normally and there is an else or an empty else, the second jump falls through to the next instruction
anyway, so a whole class of those jumps are dead. I cannot know the article's figure for section 5.3
without the article, but the claim must have the form "only a small percentage of the emitted
unconditional jumps are actually needed", i.e. the measurement converts a stylistic complaint into a
quantified opportunity for the register-machine backend.
Confidence: 3

## 5

If a model reproduces the *existing* backend's instruction count exactly on all 161 functions, that
establishes the model is a faithful and complete description of what today's generator emits: no
hidden emission paths, no miscounted multi-instruction operations, no per-function special cases. It
establishes nothing about models A and B, because those describe code that does not exist yet; the
calibration validates the *accounting*, not the *predictions*. What remains unproven is that the new
translation will actually realize the modelled savings — that the abstract stack, lazy constants and
joins will produce that instruction sequence on real input, that register pressure will not force
spills that eat the gains, and that the modelled code is correct at all. A precise count of the wrong
program is still the wrong program, and a precise count of a program nobody has generated yet is only
a hypothesis.
Confidence: 4

## 6

Two things the hand-written loop of section 5.9 must show, both invisible to a translator that sees
one operation at a time: the loop induction variable kept in a register for the whole loop rather than
reloaded from and stored to its frame slot on every iteration, and the address computation reduced to
a pointer that is incremented per iteration instead of `base + i*4` being recomputed from scratch each
time. The first needs *liveness and register-allocation* knowledge, i.e. the fact that a value is
untouched across a back edge, which is a property of the control-flow graph and not of any single
operation; the second needs *algebraic and loop-structure* knowledge, i.e. the recognition that
`i` changes by one per iteration so `i*4` changes by four, which requires reasoning about the loop as
a unit. Neither is expressible as a rule keyed on the operation currently being translated; both
demand that the translator be allowed to look at the whole function before emitting anything.
Confidence: 3

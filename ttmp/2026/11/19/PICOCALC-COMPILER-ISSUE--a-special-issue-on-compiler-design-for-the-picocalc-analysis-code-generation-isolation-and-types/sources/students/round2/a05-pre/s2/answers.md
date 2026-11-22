# Answers

Assumption used throughout: the target is a small 32-bit RISC core (Thumb-style, `fp`-relative
frame addressing, one instruction per load/store, small immediates free), and the "current backend"
translates one WebAssembly operation at a time with the operand stack living in memory.

## 1. `x = y + 1` in the current backend

The current backend never keeps anything between operations, so every producer stores to a stack
slot and every consumer reloads. `local.get y` = `ldr r0,[fp,#0]` + `str r0,[fp,#8]` (2);
`i32.const 1` = `movs r0,#1` + `str r0,[fp,#12]` (2); `i32.add` = two loads, `adds`, one store (4);
`local.set x` = `ldr r0,[fp,#8]` + `str r0,[fp,#4]` (2). That is **10 instructions** for an
addition of a constant to a local.

Confidence: 3

## 2. Same statement with a compile-time stack, lazy constants and locals

Keep the pending operand stack as a list of abstract values at compile time and only commit when a
location is observable. After `local.get y` the list is `[Local(y) in r0]` (1 instruction: the load
is emitted, the store is not). After `i32.const 1` the list is `[Local(y) in r0, Const(1)]` and
nothing is emitted — the constant is a deferred immediate. After `i32.add` the list collapses to
`[r0]` with a single `adds r0,r0,#1` (1 instruction), because the constant folds into the immediate
field of the add. After `local.set x` the list is empty with one `str r0,[fp,#4]` (1 instruction).
Total: **3 instructions** instead of 10 — a factor of ~3.3.

Confidence: 3

## 3. The two situations in section 5.5 where pending values need not be moved

I cannot know this without the article; I do not know which two cases the section picks or how it
words them. My best reasoning is that the two situations have to be (a) the pending value is
consumed by the immediately following operation, with no branch target, call, or block boundary in
between, so the consumer is the only possible observer and can address the value wherever the
producer left it, and (b) the pending values are dead — dropped at a control-flow edge
(branch taken, `return`, unreachable code, or end of block where the stack is discarded) so nothing
downstream can read the agreed locations anyway. The common justification for both is the same:
materializing a value only matters if some later code, generated without knowledge of the producer,
may observe the slot; if no such code exists the store is pure overhead. A third candidate the
article might use instead of (b) is "the operation's result is already in the register the next
operation wants", which is really (a) generalized to register coincidence.

Confidence: 2

## 4. Conditional branch plus unconditional jump for every `if`

I cannot know the exact text of section 5.3, but the shape is explainable: a one-operation-at-a-time
translator ends every structured block by emitting an unconditional jump to the join point, because
when it emits `end` it does not yet know whether the block that follows in linear order is the join
or another arm. In WebAssembly's layout the `else` arm follows the `then` arm, so the jump is
genuinely needed when an `else` exists, and the backend emits it unconditionally rather than
checking. The measurement almost certainly shows that the jump is only necessary in the minority of
`if`s (those with a real else arm, or where the following block is not the target), i.e. it is
redundant in most cases and removable by a peephole or block-layout pass.

Confidence: 2

## 5. Editor's native code under model A

I cannot know this without the article — I do not have the table, the baseline size, or model A's
percentage. The computation the question asks for is arithmetic on that table: take Editor's
baseline native-code size in KiB and subtract model A's size for Editor (or multiply baseline by
model A's relative factor), giving the saving in KiB; a typical honest figure for a scale of
code-generation improvement like this is a saving of a few to a few tens of KiB. It matters for
Editor in particular because Editor is the largest program in the suite, so the same relative
improvement is the largest absolute win there, and because Editor is the program that has to live
inside the machine's fixed flash/RAM budget alongside its own data — a few tens of KiB is a real
fraction of the remaining headroom rather than rounding error, which is not true for the small
example programs. The article's point is presumably exactly that: percentage savings are
uninformative, absolute KiB on the biggest program is what decides whether Editor ships.

Confidence: 2

## 6. Two things the hand-written loop in 5.9 does that a per-operation translator cannot

I cannot know the article's list, so these are my candidates for what a hand-written loop shows.
First, keeping the loop variable (or an incrementing pointer) in a register for the whole loop:
that requires liveness and register-interference knowledge over an entire loop body, whereas
one-operation-at-a-time code generation only ever sees a single stack effect and must be
conservative about what lives across the back edge. Second, strength reduction or a bottom-tested
loop — turning `base + i*4` into a pointer that is bumped by four, or a `subs`-and-`bne` counted
loop — which requires recognizing the loop's shape (a trip count, an index used only additively)
as a pattern, not local knowledge of any one operation. Both are whole-region facts: the first is
dataflow knowledge, the second is structural pattern knowledge; neither is derivable from one
WebAssembly instruction at a time.

Confidence: 2

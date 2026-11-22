# Answers — "3. Why Whole-Program Inference Costs Minutes"

Note: I was not given the article. The answers below are reasoned from the question wording
and from what I know about whole-program type/range inference. Where a question depends on a
specific number, table, or measurement that only the article contains, I say so explicitly and
then describe what the answer would have to look like.

## 1. Why adding `half` changes the machine code for `scale`

`scale` and `half` almost certainly share something whose type is solved for once for the whole
program: a polymorphic arithmetic primitive, a module-level constant, or a helper that both call.
Whole-program inference builds one constraint system and solves it to a fixed point, so `half`'s
use sites add constraints to a node that `scale` also depends on, and the solution can move — for
example from "always a small integer" to "any number" — which flips the chosen representation
from an unboxed integer to a tagged or heap-boxed value. `scale` then has to be re-emitted with
different instructions (tag checks, boxing, or a generic arithmetic call) even though its own
source text did not change. The implication is that `scale` is not separately compilable: its
object code is a function of facts gathered from other functions, so an edit anywhere can
invalidate it. A separately compiled `scale` would have to be built against an assumed
worst-case interface, and would therefore be slower or would need a later optimistic
recompilation.
Confidence: 3

## 2. Range of `i` at the loop head, and what widening costs

I cannot know this without the article's table, so I cannot give the three literal ranges; the
shape they must have is an entry range followed by the join of the entry edge with the back edge,
growing by the loop step, e.g. `[0,0]`, then `[0,1]`, then `[0,2]` for a step of 1. The first
visit establishes the pre-loop value, and each later visit merges in the state that reaches the
head from the bottom of the body. At some later visit the bound would keep climbing one step at a
time, so the analyser widens: instead of continuing to climb it jumps straight to the top of the
lattice, usually the whole integer range (or ±∞), which guarantees termination. The cost is
precision, not just time: everything derived from `i` afterwards is known only to be "some
number", so the code generated from that visit onward must fall back to boxed or generic
operations, and the widened value can force extra iterations before the analysis settles again.
Confidence: 2

## 3. Two reasons `a + b` in JavaScript cannot always be one integer add

First, `+` is overloaded: if either operand is a string the operation is concatenation, and if an
operand is an object it must be converted via ToPrimitive, so the compiled code needs a check and
at least a second path. Second, JavaScript numbers are IEEE-754 doubles, so a single machine
integer add is only sound when both operands are known to be integers inside the small-integer
range; otherwise the result may need a heap-allocated double, and NaN, ±Infinity and -0 all have
to round-trip correctly. So the compiler needs whole-program (or at least whole-function,
guarded) facts about both operands before it may pick the one-instruction form, which is exactly
why inference precision pays off here and why losing it hurts.
Confidence: 4

## 4. Why specializing one library call needs another round

Specialization is a fixed-point computation, not a single pass: instantiating a library function
for concrete argument types gives its body narrower types, which in turn reveals that operations
*inside* that body can be specialized, and the narrowed result types flow back out to the callers
and to other call sites that consume the result. Those newly precise values then justify
specializing further downstream, and each new monomorphic instance has to be explored on its own.
So one round exposes work for the next, and the process stops only when a round finds nothing new
— the six rounds just mean the longest dependency chain in that program happened to be six deep.
A sharper way to put it: rounds are the transitive closure of "specializing X makes Y specializable".
Confidence: 3

## 5. The measurement showing the residual cost is still large

I cannot know the exact numbers without section 3.5. What the measurement must be is a before/after
timing of the whole compile at the point where range analysis is disabled or removed, showing that
the total moves only modestly — i.e. range analysis was never the bulk of the minutes, and the
remaining time is still on the order of the original figure, not a rounding error. The attribution
in that section would then have to be the part of the pipeline that cannot be removed by dropping
a single analysis: the repeated whole-program passes themselves (constraint generation and
solving over every call site, plus the extra passes each specialization round triggers), i.e. the
cost of iterating to a fixed point over the entire program rather than of any one clever analysis.
Confidence: 2

## 6. Self's two compilers vs. what CJI lacks

I cannot be certain which component the article names, but by the structure of the argument the
part of the handheld that already plays the role of Self's fast first compiler is the existing
JavaScript interpreter in the OS: it runs the application immediately at unoptimized speed, so
there is no pause before the first output, exactly as Self's simple compiler did before the
optimizing compiler caught up. What CJI lacks compared with Self is the *concurrency and the
safety net* around the second compiler: Self recompiled hot code in the background, kept the old
version valid for frames already running, and swapped in the new version at a safepoint (and could
deoptimize back out if an assumption failed), with enough memory to keep two versions alive.
Without that, optimization has to be interleaved with execution on the same thread, so the
compilation time shows up directly as a pause at the user's expense.
Confidence: 2

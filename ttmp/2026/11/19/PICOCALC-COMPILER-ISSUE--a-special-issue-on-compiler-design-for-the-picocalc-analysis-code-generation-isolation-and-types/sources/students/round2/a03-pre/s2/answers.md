# Answers — "3. Why Whole-Program Inference Costs Minutes"

Note: I have not been given the article, so each answer is reasoning from the question text plus
general knowledge of compilers and JavaScript semantics. Where a specific number or table entry
can only come from the article, I say so.

## 1. Adding `half` changes the machine code for `scale`

Because the analysis is whole-program, `half` is part of the same inference problem: its signature
and call sites can change what the analyser concludes about the values reaching `scale` (a new
caller of a helper, a widened type, a lost range, a function that must now be emitted generically for
two different input kinds). Once `scale`'s inferred types/ranges change, the representation chosen
for its parameters, its arithmetic and its interprocedural calling convention also changes, so even
the body of `scale` — which nobody edited — compiles to different instructions. The implication is
that `scale` cannot be compiled separately and correctly optimised: any separate compilation would
be compiling against assumptions about the rest of the program that adding one function can
invalidate. Optimisation therefore has to happen where the whole program is visible, which is what
makes the cost whole-program cost.

Confidence: 3

## 2. Range of `i` at the loop head, first three passes, widening, cost

I cannot know the exact rows of the table without the article, but any standard ascending iteration
over a loop like `for (i = 0; i < n; i++)` behaves as follows: pass 1 gives the entry value only,
`i ∈ [0, 0]`; pass 2 re-evaluates the header with the back edge and gives `i ∈ [0, 1]`; pass 3 gives
`i ∈ [0, 2]`. The range grows by one per pass because the analysis has no way to use the loop test as
a bound, so it is chasing an unbounded sequence. Widening breaks that by giving up on the sequence
and jumping straight to a coarse limit — typically `[0, +∞]`, `[0, INT64_MAX]` or the widest safe
integer — which the next pass reproduces unchanged, so the fixpoint lands on the pass immediately
after widening (pass 4 in this count) instead of after `n` passes. The cost is precision: the useful
fact `i ∈ [0, n-1]` is destroyed, and every downstream conclusion that depended on it (overflow
checks, index bounds, safe-integer proofs) is lost, so the code generator has to fall back to a
slower, more general representation.

Confidence: 3

## 3. `(max + 2) - max` giving 1 in JavaScript and 2 in CJI

JavaScript gives 1 because every number is an IEEE-754 double: `max = 2^53 − 1` is exactly
representable, but `max + 2 = 2^53 + 1` is odd and above the spacing-2 boundary at 2^53, so it is not
representable and rounds to nearest even, `2^53`. Subtracting `max` then gives `2^53 − (2^53 − 1) = 1`
— the rounding, not the arithmetic, decided the answer. CJI without the range proof emitted the
operation as 64-bit integer arithmetic, where `9007199254740991 + 2` is exact
(`9007199254740993`) and the subtraction is exactly 2: correct as integer semantics, wrong as
JavaScript semantics. So the range proof is not an optimisation detail but a correctness condition —
the compiler may only use integer instructions when it has proved every intermediate value stays
inside the safe-integer range where int64 and double agree. Losing the proof (see question 2) is
exactly how a fast build produced 2.

Confidence: 4

## 4. Why six specialization rounds give seven analyses and 95 passes

The arithmetic is nested iteration: a *pass* (a traversal of the program, or of one function in it)
sits inside an *analysis* (a fixpoint reached by repeating passes until the abstract state stops
changing), and an *analysis* sits inside a *specialization round* (specialise, then re-analyse,
because specialisation invalidates the facts that justified it). Seven analyses for six rounds is the
pattern of one initial whole-program analysis to decide the first specialisation, plus one
re-analysis after each of the six rounds to check convergence — `1 + 6 = 7`. The 95 passes are then
the total of the inner fixpoint iterations summed over all seven analyses (about 13–14 per analysis,
growing as more of the program becomes visible/precise); the exact per-round breakdown is in the
article's table and I cannot reconstruct it without seeing it. The point of the numbers is
multiplication: cost is not "one analysis", it is rounds × analyses × passes over the whole call
graph, which is how a handheld gets to minutes.

Confidence: 2

## 5. The measurement in section 3.5 showing the remaining cost is still large

I cannot know this without the article — I do not know which number section 3.5 reports. The shape of
the answer would have to be: a timing (or profile share) taken with the range analysis removed,
disabled or replaced by a trivial domain, in which compile time falls from the multi-minute figure
to something still measured in tens of seconds or minutes rather than to something negligible. My
best reasoning is that the residual is attributed not to the range domain itself but to the structure
around it — repeated whole-program fixpoint solving, re-running the same iteration after each
specialisation round, and rebuilding/querying global facts about the call graph — which is consistent
with question 4's arithmetic. If instead the attribution is to a different analysis (shape/type or
object/closure inference), the conclusion is the same: removing one domain does not remove the
iterate-the-whole-program-six-times cost.

Confidence: 1

## 6. Self's two compilers versus CJI, and what the handheld already has

Self's design is tiered: a fast, non-optimising compiler that produces runnable code immediately, and
an optimising compiler applied later only to methods that prove hot, with the ability to fall back
(invalidate optimised code, recompile, and continue in the running activation). The component of the
handheld that already plays the fast first compiler's role is the existing interpreter — it runs
programs correctly and immediately, with no whole-program inference and therefore no compile pause.
What CJI lacks is the second half of that design: hot-code detection and the trigger to invoke the
optimising compiler, plus deoptimisation machinery (invalidation and on-stack replacement) so an
optimised frame can return to the interpreter when an assumption fails. Without those, the
optimising compiler cannot be paid for lazily, and the only way to get its output is to run it over
the whole program up front — which is the minutes-long pause the chapter is about.

Confidence: 3

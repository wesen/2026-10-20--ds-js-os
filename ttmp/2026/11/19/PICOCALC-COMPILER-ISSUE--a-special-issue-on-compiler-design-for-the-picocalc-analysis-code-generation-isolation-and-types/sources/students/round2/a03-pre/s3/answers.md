# Answers for "3. Why Whole-Program Inference Costs Minutes"

I was given only the quiz, not the article. Where a question asks for a number, a table entry or a
specific measurement I say so plainly, and then describe what the answer would have to look like.

## 1

I cannot know the exact code of `half` and `scale` without the article, but the mechanism is
forced by the framing. Adding `half` adds either a new caller of `scale` or a new producer of
values that flow into it, and because CJI infers numeric facts over the whole program, that new
traffic feeds back into the inferred range of `scale`'s parameters (e.g. `x/2` of an odd input is
fractional, or the upper bound crosses the exactly-representable integer boundary). Once the
inferred domain changes from "small integers" to "general numbers", the code generator must stop
emitting the fast integer operations for `scale` and emit generic double (or boxed, checked)
operations instead — different machine code for unchanged source. The implication is that `scale`
is not a self-contained compilation unit: its object code is a function of the entire rest of the
program, so compiling it separately would force the compiler to assume the worst case and throw
away exactly the specialization the analysis exists to buy. That is the argument for
whole-program compilation, and therefore for whole-program analysis cost.

Confidence: 3

## 2

I cannot know the table's values without the article. What I can say is the shape any such trace
must have. With a loop head reached from an initialising entry edge and from a back edge, the
iterative analysis sees (pass 1) only the entry fact, e.g. `i ∈ [0, 0]`; pass 2 joins in one trip
through the body, e.g. `[0, 1]`; pass 3 gives `[0, 2]` — a strictly ascending chain that will never
terminate. Widening is the accelerator that breaks that chain: when the upper bound keeps growing
on successive visits, the analysis replaces it with the largest bound it can justify (in the
classic form `+∞`, or the bound implied by the dominating test such as `i ≤ n`), which turns the
sequence into a finite one and yields the fixpoint printed in the table on the next visit to the
head after the widening step. The cost is precision: the widened fixpoint is sound but coarser
than the true one, so downstream code generation can no longer prove smallness and may have to use
the generic arithmetic path, and every loop pays a fresh widening decision.

Confidence: 2

## 3

With `max = 2^53 − 1 = 9007199254740991`, the intermediate `max + 2 = 2^53 + 1` is odd and larger
than 2^53, so it is not representable as a double; it falls exactly halfway between `2^53` and
`2^53 + 2`, and IEEE-754 ties-to-even rounds it to `2^53 = 9007199254740992`. Subtracting `max`
then gives exactly 1, which is why plain JavaScript (and any implementation that faithfully uses
doubles, or constant-folds with doubles) prints 1. The CJI build without the range proof computed
2 because its generated code performed the same sequence in exact 64-bit integer arithmetic (or
folded the constants in integers at compile time), where `2^53 + 1` and the subtraction are both
exact, so no rounding occurs and the result is the mathematical answer. The difference is purely
about where the rounding to double happens; the range proof's job is to license integer arithmetic
only where it is provably indistinguishable from double arithmetic. Note what the example is
designed to show: a proof that bounds the inputs and the result inside ±2^53 is not sufficient,
because the *intermediate* `max + 2` is out of range while both endpoints are in range.

Confidence: 4

## 4

I cannot know Agenda's size or the bookkeeping convention of the pass counter without the article,
but the two numbers have a natural reading. Seven analyses for six specialization rounds suggests
one full range analysis up front (to establish the baseline facts) plus one complete re-analysis
after each round, with the last one both confirming that the fixpoint was reached and producing
the final facts used for code generation; equivalently, rounds 1..6 each invalidate the whole
program's facts, and a seventh sweep is what certifies quiescence. The 95 passes are then the
inner unit of work — one pass over one function or one loop body — summed over those seven sweeps:
95 / 7 ≈ 13.6, and that it is not an integer tells us the sweeps are not uniform, which is what you
expect from a worklist/dirty-flag scheme in which a unit is re-visited only when its inputs
changed, so early sweeps touch everything and later sweeps touch only the shrinking frontier a
specialization perturbed. A defensible check on the article's numbers is whether
`95 = Σ over sweeps of (units visited that sweep)` with the first sweep alone accounting for
roughly the program's unit count.

Confidence: 2

## 5

I cannot know which measurement in section 3.5 the article uses, or its value. For the claim to
work at all, the measurement has to be an ablation: compile with the range analysis disabled,
replaced by a trivial/immediately-top analysis, or with its results cached from a previous run, and
report that total compile time stays in the same order of magnitude (seconds to minutes) rather
than collapsing to near zero. The cost left over must then be attributed to something other than
the inference itself — most plausibly to the specialization/code-generation structure it drives
(the whole program is re-emitted or re-specialised once per round, so rounds multiply codegen
work), or to the per-pass traversal overhead of the pass manager over every unit, or to
invalidation and re-analysis bookkeeping even when the facts are cheap to compute. Whichever it
is, the article's point is that removing the analysis removes the *reason* for the passes, not the
passes themselves.

Confidence: 2

## 6

Self's fast first compiler ("quick compiler") existed so that code would run immediately and
correctly, while the optimizing compiler worked in the background on type feedback gathered by that
running code, and could later swap in — or deoptimize away from — optimized code at a safe point.
On the handheld, the component already playing that role is the baseline interpreter that ships
with the machine's runtime, which executes programs today with no compilation step at all and hence
no compile pause. What CJI lacks, compared with Self's design, is the whole second half of that
arrangement: there is no runtime type feedback to feed the optimizer, so all of the inference has to
be done statically and conservatively before anything runs; and there are no guards, no
deoptimisation and no on-stack replacement, so the analysis results must be sound for every
possible execution rather than merely for the executions actually observed. That is precisely why
CJI pays minutes up front instead of amortising the cost across a running program.

Confidence: 3

# Answers — "3. Why Whole-Program Inference Costs Minutes"

These answers are written without the article. Where a question asks for a specific fact
from a section I do not have (exact ranges, exact percentages, exact component names), I say
so and then describe the shape the answer would have to take.

## 1. Why adding `half` changes the code for `scale`, and what that implies

Adding a function can only change `scale`'s machine code if inference is whole-program: `half`
introduces a new caller or callee edge, which changes the set of values that can reach `scale`'s
parameters and therefore its inferred types or numeric range. A widened input (say, a general
number where a small fixnum was proven before) forces different code — a boxing/unboxing step, an
overflow check, or a call instead of an inline add. The implication is that `scale` has no
self-contained meaning to compile: compiling it separately, in isolation, can only produce the
conservative version, and any optimized version is valid only with respect to a specific whole
program. I cannot know the exact code change without the article, but it must be one of those
shapes (check added, allocation added, or inline replaced by call).
Confidence: 4

## 2. Range of `i` at the loop head over the first three visits, then widening

I cannot know the literal intervals without section 3.2. What the answer must look like: the first
visit gives a narrow, essentially exact interval (the initializer value, e.g. `[0,0]` or `[1,1]`);
the second visit folds in the value produced by one back-edge traversal, so the interval grows to
something like `[0,1]` or `[1,2]`; the third visit grows it again, showing the analysis is
converging one iteration at a time and would take as many passes as the loop has iterations. A
later visit therefore stops iterating to a fixpoint and applies widening: it jumps to a
deliberately coarse bound, such as `[0, +inf)`, or drops the bound on the loop counter entirely.
The cost is precision: having lost the proven range, code generation can no longer justify the
narrow integer representation and must emit overflow checks, boxed arithmetic, or a fallback path,
so the analysis terminates but pays for it in the generated code.
Confidence: 4

## 3. Two reasons `a + b` cannot always be one integer add in JavaScript

First, JavaScript numbers are IEEE-754 doubles, not machine integers: an integer add is only
correct after proving both operands are small enough (safe-integer range, and no `-0`/`NaN`
subtleties), otherwise the result must be computed in floating point. Second, `+` is overloaded:
if either operand is a string, the operation is concatenation, and objects may run `valueOf`/
`toString` or proxy traps, which are arbitrary user code with side effects. Either reason alone
kills the one-instruction translation, and both together mean the compiler must first prove types
and then still guard with a check. I cannot confirm which two the section actually chose, but any
correct list will be drawn from this set.
Confidence: 4

## 4. Why six specialization rounds, and why one specialization creates another

Specializing one library call means inferring more about the callee's parameters than its declared
signature says; with that sharper information the callee's body becomes analyzable — new type facts
appear inside it, some of its own calls become specializable in turn, and the results flow back to
callers. So specialization is a fixpoint over the call graph, and the number of rounds is bounded by
the length of the chains of discovery, not by the number of functions. Each round is another full
pass over the program, which is exactly why the total cost is minutes rather than milliseconds.
I cannot verify the number six or the particular library, but the mechanism must be this
iterate-to-fixpoint structure.
Confidence: 3

## 5. Which measurement shows the residual cost, and what it is attributed to

I cannot know this without the article: I do not have the section 3.5 numbers. The measurement
that would settle it is an ablation — build the compiler with range analysis disabled (or
neutralized) and re-time compilation of the same corpus; if the residual time is still large and of
the same order as before, that isolates the remaining cost from the range arithmetic. The
attribution would then have to be to the parts that remain: the iterative type/union-find
propagation and its repeated fixpoint passes over the whole call graph, plus the specialization
machinery (construction and refinement of specialized method copies) rather than to the numeric
interval domain itself.
Confidence: 2

## 6. Self's two compilers vs. the handheld's existing pieces

Self's answer was a cheap, fast compiler that always terminates quickly plus an expensive
optimizing compiler applied only to hot code. On the handheld, the component already playing the
role of the fast first compiler is the existing baseline path — the interpreter/VM (or its simple
non-optimizing code generator) that executes everything without whole-program analysis; it is
already there and costs nothing extra. What CJI lacks, compared with Self, is the other half: a
second optimizing compiler invoked by runtime hotness feedback, and the supporting machinery that
makes it safe — execution counters/profiling, and deoptimization (including on-stack replacement)
so that code compiled under assumptions can be abandoned when those assumptions fail. Without that
split, the whole-program inference has to be run ahead of time on everything, which is why it costs
minutes.
Confidence: 3

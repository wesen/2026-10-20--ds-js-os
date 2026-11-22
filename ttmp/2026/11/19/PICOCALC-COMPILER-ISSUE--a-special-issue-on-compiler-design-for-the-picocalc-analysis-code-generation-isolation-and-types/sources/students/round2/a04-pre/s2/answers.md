# Answers

## 1. Jump function for `clamp`'s first argument in `nextIndex`

I cannot know this without the article: I have not seen the body of `nextIndex`, so I cannot tell
what expression is passed as `clamp`'s first argument, and the numeric answer depends entirely on
that expression. Reasoning about what the answer must look like: a "jump function" here presumably
plays the role of a per-call-site transfer that maps the caller's abstract state into the callee's
entry state, so a call of the shape `clamp(i, ...)` would give the identity jump function `J(r) = r`,
and the range would simply be [5, 7]. If instead the argument is a transformed value (say
`i + 1` or `n - i`), the jump function would be the corresponding affine map, and the interval
would have to be recomputed by applying that map to [5, 7] — or, for a non-monotone map, by taking
the image of the two endpoints and the extremum. The article's answer almost certainly shows the
composition `clamp`'s own parameter summary after that jump function applied to the caller range.
Confidence: 2

## 2. Why "computed once must be wrong" is mistaken

The objection conflates *when a summary is computed* with *what a summary is a function of*: a useful
summary is not a fixed fact about one caller but a parametric relation (a jump/precondition mapping
from incoming ranges to outgoing ranges and results), so a single stored copy is instantiated
differently at each call site without being recomputed. Its soundness obligation is universal over
all inputs, not over the particular callers that happened to exist when it was built, and it is
typically stated conservatively enough to survive callers it has never seen. What genuinely must be
redone when callers change is the cheap application of the jump function, not the expensive body
analysis — that split is exactly the point of summarizing. A summary can become *stale* if the
callee's own body changes or if it was computed under whole-program assumptions that no longer hold,
which is a real but different worry, handled by invalidation rather than by never summarizing.
Confidence: 3

## 3. What plain SSA loses at a merge, and what extended SSA adds

I cannot know the article's exact terminology, but the standard argument is clear: at the join after
`if (i < n)`, the φ-node `i3 = φ(i1, i2)` has to be given a single abstract value, so the analyzer
joins the two branch values into their least upper bound (for intervals, the convex hull), and in
doing so it throws away the correlation between the value and the predicate that guarded it. On the
true side we know `i < n` and on the false side `i >= n`, yet the merged value records neither, so
a fact like "i is at most n-1" degrades to "i is at most max(n-1, ...)" and tight bounds that
depend on the test evaporate — the classic loss of path sensitivity at every φ. Extended forms add
explicit nodes that carry the branch condition itself, so the analysis can re-associate values with
the predicates that produced them: Guha et al.'s e-SSA introduces σ-nodes (and gated/GSA or
π-node formulations do the same job), letting ranges be recovered per path without re-exploring
paths from scratch. So extended SSA supplies, structurally, the facts that plain φ-nodes flatten
away.
Confidence: 3

## 4. How many of the 11,760 visits analyzed a body

I cannot know this without the article: the split between visits that analyzed a body and visits that
were served from a summary (a cache hit or a memoized lookup) is a measured number from the Agenda
compile and I have no way to reconstruct it. What the answer must have the shape of: the count of
body analyses is necessarily the smaller number — at most the number of distinct functions in
Agenda, and in practice well below the visit count, since the whole reason the 11,760 figure is
interesting is that most visits are repeats. The body-analysis count is the number that matters
because that is the only work a summary can eliminate: visits that already skip analysis cost
almost nothing, so the achievable saving is proportional to analyzed bodies, not to visits. Quoting
the total visits alone would overstate both the current cost and the payoff of summaries.
Confidence: 2

## 5. "Local checking" and two practical consequences

Local checking means judging a function using only what is visible where it is compiled — its own
body plus the summaries or declared contracts of the functions it calls — rather than requiring a
whole-program analysis whose results depend on every other function in the image. The caller's
obligations are checked against a callee's stated precondition, and the callee is trusted to have
been checked once against its own postcondition, so the reasoning composes without a global fixpoint.
Two consequences for a compiler running on the handheld: first, work and memory stay bounded and
incremental — there is no need to hold a whole-program call graph, points-to set or fixpoint state
in RAM, and recompiling one function does not force rechecking the program, which matters when the
machine must compile small units on demand. Second, mistakes localize and can be reported at the
point of compilation, but the price is that summaries must be conservative and precise enough to be
usable out of context, and anything that genuinely needs global knowledge (escaping addresses,
indirect calls, cross-function invariants) has to be approximated pessimistically or ruled out by
the language. The trade is thus predictability and small footprint in exchange for precision.
Confidence: 3

## 6. Where the two remedy families meet

I cannot know this without the article: both the identity of the "existing feature of CJI" and the
"two families of remedy" are article-specific, and I have not read section 4.3. My best reasoning
about the required shape of the answer: section 4 is titled around making inference affordable *or
avoiding it*, so the two families are plausibly (a) making the analysis cheap through summaries,
caching and local checking, and (b) doing without inference by demanding the information be declared.
They "meet" if CJI already carries some optional per-function description — candidates would be
optional declared types or annotations in its source language, its native-function signature tables,
or a lazily compiled per-function unit that could naturally carry a summary — because that same
artifact can serve both as a cached analysis result and as a checked declaration. What would have to
become mandatory is that description: the optional annotation or summary would have to be required
for every compiled function, so that no body is analyzed or re-analyzed without one, and so that the
compiler can treat "absent summary" as an error rather than as license to run expensive inference.
Confidence: 2

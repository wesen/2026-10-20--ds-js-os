# Answers

## 1

I cannot know this without the article: section 4.1's `nextIndex` and its `clamp` are not visible to me, so I cannot write the exact jump function the article gives. My best reasoning about the shape of the answer: a jump function for an argument is a monotone map from the interval of the function's inputs to the interval of that argument, so for a first argument of the form `clamp(i + 1, lo, hi)` it would be the interval `[i.lo + 1, i.hi + 1]` intersected with `[lo, hi]`, giving `[6, 8]` for `i` in `[5, 7]` before the clamp bound is applied. One of the two clamp bounds is presumably derived from `n`, so the final per-argument range is only known once `n`'s range is instantiated at the call site — that is exactly the point of separating the jump function from its application.

Confidence: 1

## 2

The error is a category mistake: a summary is a property of the callee's code, not of any particular caller. Computing it once means computing the function's behaviour as a reusable object; each call site then *instantiates* the summary with its own arguments, so a caller that changes simply produces a new instantiation, not a stale summary. What callers can invalidate is the *result* of applying a summary at that call site, not the summary itself. The statement only becomes true for summaries that were deliberately made context-dependent (caller-specific specialization), where recomputation is an acknowledged cost rather than an error.

Confidence: 4

## 3

A phi node in plain SSA says "this name is either the value from the true edge or the value from the false edge", which is a plain join of the two ranges — the fact that the true branch implies `i < n` and the false branch implies `i >= n` is destroyed at the merge. For a range analysis that is costly, because the merged interval must cover both possibilities even though no single control path does. Extended forms (gated SSA, pi/sigma nodes, static single information) give the predicate and the branch-refined values their own names, so the analysis can keep "`i` under the assumption `i < n`" and "`i` under `i >= n`" separately and only join when it genuinely has to.

Confidence: 4

## 4

Iteration is still required wherever the summary dependency graph has cycles: loops in the control-flow graph, and recursion or mutual recursion in the call graph, both of which force a fixpoint to be reached by repeated application of the transfer/jump functions. Iteration is never required along the acyclic part of the graph: once a callee's summary is final, a caller's summary is a single evaluation in dependency order, with no re-visiting, because evaluating a jump function on an interval needs no iteration. Practical consequence: analyze bottom-up over a topological order of the acyclic condensation, and confine the worklist to strongly connected components.

Confidence: 4

## 5

"Local checking" means each function (or compilation unit) is checked against summaries of the functions it calls, rather than against the whole program at once, so a verdict on a piece of code can be reached without seeing all callers or all callees. Two consequences for a compiler on the handheld: (a) memory and time stay bounded — the compiler never has to hold or re-scan the entire program, which matters on a device with little RAM and slow flash; (b) recompilation is incremental and stable — editing one function only requires redoing that function plus the code that consumes its summary, so edit-compile cycles stay short. A third likely one is portability of the checking: the same summaries can be produced on a bigger machine and consumed on the handheld, since the checks are local. I cannot know which two consequences the article picks without the article.

Confidence: 3

## 6

Static TypeScript supplies the facts through its type system: every value carries a statically known type (and the compiler inserts the checks that make that claim sound), so operations can be compiled to the concrete machine routine for that type instead of a generic, dynamically dispatched one. That is precisely the information a general optimizer would have to rediscover by its own analysis — types give it for free what inference would otherwise cost. Hence a peephole pass is enough to produce code far faster than an interpreter, because the expensive analyses have been replaced by type checking that the language design already paid for.

Confidence: 4

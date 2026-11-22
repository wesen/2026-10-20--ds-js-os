# Answers to "Check your understanding" (section 4.5)

## 1. Jump function for `nextIndex`, with `i` in [5, 7]

The first argument of the call `clamp(i + 1, n)` is `i + 1`, so the jump function for that argument is `J₁ = i + 1` (the second is `J₂ = n`). Substituting the caller's fact for `nextIndex`'s first parameter gives the range of `i + 1` over [5, 7]: the smallest value is 5 + 1 = 6 and the largest is 7 + 1 = 8, so the first parameter of `clamp` is in [6, 8]. Adding a constant moves both ends of a range by that constant and cannot reorder them, so no other work is needed. The point of the exercise is that no part of `nextIndex`'s body had to be looked at again to get this answer.

Confidence: 5

## 2. Why "a summary computed once must be wrong" is a mistake

The objection treats the summary as if it were an answer, when it is a formula whose inputs are the caller's facts. When a caller changes, the number of times the facts travel around the call graph does not change and the formula is untouched; only the result of substituting the new facts into the formula changes, exactly as `x + 1` still means the same thing whether `x` is 5 or 7. The formula depends only on the text of the enclosing function, so it needs recomputing only when that text changes. The article's own words are that the facts still travel around the call graph as many times as needed, but each trip is now the evaluation of a formula instead of an analysis of a body. So "computed once" means computed once per function text, not once per program run.

Confidence: 5

## 3. What plain SSA loses at a branch, and what π restores

Inside `while (i < n)` the analysis knows `i < n`, but plain SSA gives that same value one name on the path where the test succeeded and on the path where it failed. Any fact attached to that single name must be true on both paths, so the only facts the analysis can keep are the ones implied by both outcomes. When the two paths meet again the join combines a "less than `n`" range with an unconstrained one, and the useful bound is lost. Extended SSA forms insert a renaming written π on each branch outcome, so `i2 = π(i1)` on the true branch and `i3 = π(i1)` on the false branch each carry their own fact. The π does nothing at run time; it exists only so the stronger fact has a name of its own, and with that renaming the sparse analysis keeps the precision of the dense one.

Confidence: 4

## 4. How many of the 11,760 visits analyzed a body, and why that is the number that matters

Of the 11,760 function visits for Agenda, 9,019 were skipped because the function's inputs had not changed, leaving 2,741 visits in which a body was actually analyzed (11,760 − 9,019 = 2,741). Only those 2,741 are candidates for saving by a summary: the 9,019 visits already cost nothing beyond checking the inputs, so a summary cannot improve on them. That is why the article judges the experimental cache against 2,741 and not against 11,760: the cache avoided 62 percent of 2,741 and cut 29 percent of compile time, which is the realistic size of the win. Quoting 62 percent of all visits would overstate what summaries can do by roughly a factor of four.

Confidence: 5

## 5. What local checking is, and two consequences on the handheld

Local checking means that compiling a function needs only two inputs: the function's own text, and the declared signatures of the functions it calls. Nothing about callers is required, so the cost is proportional to the size of the function, the functions can be checked in any order, and editing one function's body cannot change the code generated for another. On the handheld, the first consequence is that a rebuild after an edit is bounded by the function that changed rather than by the whole program, which is what makes an interactive edit-compile loop possible; the second is that an unchanged function's compiled output remains valid across builds and after edits elsewhere, so it can be kept and reused instead of recomputed, and functions can be compiled in whatever order is convenient. The article states these properties in section 4.2 and draws the first consequence in section 4.4 ("only local checking gives interactive compile times on the device"), but the reuse-across-builds consequence is my inference from the stated no-cross-function-effect property rather than something the section spells out.

Confidence: 3

## 6. Where the two families meet

The enabling feature is that CJI already accepts type annotations written in comments, in the form `/*: Any[] */`, which declares an array of values of any type; the project used one to remove 15.9 million run-time type dispatches from CJI's own code. What would have to become mandatory is that such annotations appear on every function boundary, that is, that every parameter and every result be given a type. Section 4.3 states the consequence directly: with annotations required, CJI's inference would become local, its specialization could be driven by declared types without rounds of solving, and it would be a larger-language relative of the typed compiler. In the other direction, the typed language growing towards records with methods, arrays and closures would bring it towards the subset CJI accepts.

Confidence: 4

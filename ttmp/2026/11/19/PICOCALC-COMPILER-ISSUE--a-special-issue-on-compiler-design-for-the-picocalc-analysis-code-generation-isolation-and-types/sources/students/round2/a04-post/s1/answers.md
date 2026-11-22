# Answers to "Check your understanding" (section 4.5)

## 1. Jump function for `clamp`'s first argument, with `i` in [5, 7]

The function is `function nextIndex(i, n) { return clamp(i + 1, n); }`. The first
argument of the call to `clamp` is `i + 1`, so its jump function is `J₁ = i + 1`
(the second, `J₂ = n`, is not asked for). Evaluating `J₁` on the input range is
ordinary interval arithmetic: add 1 to both ends. The low end becomes 5 + 1 = 6
and the high end becomes 7 + 1 = 8, so `clamp`'s first parameter is known to lie
in [6, 8]. No part of the body of `nextIndex` had to be analyzed again to get
that answer: the formula was already computed and the new range is just its
result on new inputs.

Confidence: 5

## 2. Why "a summary computed once must be wrong" is wrong

The classmate is treating the summary as if it were a *result* (a fixed set of
facts about the function) rather than a *formula*. A summary such as `J₁ = i + 1`
is a small expression whose inputs are the caller's facts; it depends only on
the text of the enclosing function, not on any call site. When a caller starts
passing different ranges, the formula's result changes but the formula itself
does not, so computing it once remains correct. The article makes the point
directly: facts still travel around the call graph as many times as needed, but
each trip is now the evaluation of a formula instead of the analysis of a body.
The summary would need recomputing only when the function's own text changes.

Confidence: 5

## 3. What plain SSA loses at a branch, and what π adds

Range analysis is only as precise as its naming, because a fact is stored per
name. With plain SSA, `i` has a single name `i1` on both outcomes of the test
`i1 < n`, so the fact "less than `n`" learned inside the branch cannot be
attached to a name that is not also used on the other side. The analysis must
join the two paths, and the join of the branch's stronger fact with the
else-path's weaker fact throws the extra precision away. Extended SSA inserts a
π renaming on each branch outcome: `i2 = π(i1)` in the then-branch, where the
analysis records `i2 < n`, and `i3 = π(i1)` in the else-branch, where it records
`i3 >= n`. The π does nothing at run time; it exists only so that each stronger
fact belongs to a name of its own. With branch renamings as well as assignment
renaming, the sparse analysis preserves the precision of the dense one.

Confidence: 5

## 4. How many of the 11,760 visits analyzed a body, and why that matters

Of the 11,760 function visits made while compiling Agenda, 9,019 were skipped
because the function's inputs had not changed. That leaves 2,741 visits in which
a function body was actually analyzed. The 2,741 is the number that matters
because skipped visits cost nothing anyway: no work was done in them, so no
summary could save anything there. The only savings a summary can offer is to
replace the analysis of a body with the evaluation of a formula, so the
available saving is bounded by those 2,741 body analyses. The article adds
supporting evidence: an experimental cache of complete per-function results
avoided 62 percent of exactly those 2,741 visits and cut compile time by 29
percent.

Confidence: 5

## 5. What local checking means, and two consequences

Local checking means that to compile a function the compiler needs only two
things: the function's own text and the declared signatures of the functions it
calls. Nothing about the function's callers is required, because the types
crossing the function's edge are written down as a declared boundary. Two
practical consequences for a handheld compiler: first, cost is proportional to
the size of the function and roughly independent of program size, which is what
makes compiling in seconds on a 360 MHz device possible at all; second, work can
be done in any order, so files or functions can be processed independently and
in parallel. A third follows from the same property: editing one function's body
cannot change the code generated for any other function, which is what makes an
edit-and-rebuild cycle cheap.

Confidence: 5

## 6. What existing CJI feature makes the meeting possible, what must become mandatory

The existing feature is that CJI already *accepts* type annotations written in
comments, in the form `/*: Any[] */` (an array of values of any type); the
project used one to remove 15.9 million run-time type dispatches from CJI's own
code. Section 4.3 says that if CJI *required* such annotations on every function
boundary, then its inference would become local, its specialization could be
driven by the declared types without rounds of solving, and it would be a
larger-language relative of the typed compiler. So the change is that a
boundary annotation must stop being optional and become mandatory on every
function signature. The code would still be JavaScript; what changes is that the
type information is declared where functions meet rather than solved for
globally.

Confidence: 4

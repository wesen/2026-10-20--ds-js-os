# Answers to "4.5 Check your understanding"

**1.** The first argument of `clamp` is `i + 1`, so the jump function is `J₁ = i + 1` (the second is `J₂ = n`, which just copies the parameter). If the analysis learns that `i` is in [5, 7], it evaluates `J₁` by adding 1 to both ends: the smallest value is 5 + 1 = 6 and the largest is 7 + 1 = 8. So the first parameter of `clamp` is in [6, 8], and the body of `nextIndex` is not read again to find this out.

Confidence: 5

**2.** The classmate is treating the summary as a *result* when it is really a *formula*. A summary such as `J₁ = i + 1` is written in terms of the caller's facts, so when a caller supplies a different `i`, the formula gives a different value without being recomputed. What has to be stored per function is the expression, whose text depends only on the body of that function, and it needs rebuilding only when that body is edited. So facts can still travel around the call graph as often as necessary; only the way each trip is made changes, from analysing a body to evaluating a formula. When the expression becomes too complicated to represent, the analysis records "unknown", which is less precise but still safe.

Confidence: 5

**3.** Plain SSA gives the value `i` a single name that is used both inside the body and on the paths that leave the loop, so a range analysis cannot attach "less than `n`" to that name in one place only. The fact would have to hold everywhere the name appears, which is false after the test fails, so the analysis must either drop it (losing precision) or join it with the facts from the other path and get the wider interval back. Extended SSA forms insert a π renaming on each branch outcome, for example `i2 = π(i1)` on the true side and `i3 = π(i1)` on the false side. The π has no run-time effect; it exists so the sharper fact can be recorded against a name that belongs to exactly one branch, which is what makes the sparse analysis keep the precision of the dense one.

Confidence: 4

**4.** 11,760 − 9,019 = 2,741 visits analyzed a function body. That is the number that matters because the other 9,019 visits did no analysis at all: they stopped as soon as the analysis saw that the function's inputs were unchanged, and a summary can only save work where work is actually being done. So 2,741 is the entire pool of body analyses that summaries (or the experimental result cache) could remove, whereas quoting 11,760 as the opportunity would overstate it by more than four times.

Confidence: 5

**5.** Local checking means compiling a function from two things only: its own text, and the declared signatures (parameter and result types) of the functions it calls; no facts about its callers are used. The first practical consequence is that the cost of checking a function is proportional to that function's size, not the program's, so time and memory stay small enough to fit the handheld's constraints instead of growing with the whole program. The second is that functions can be checked in any order and independently, which means an edit to one function's body cannot change the code generated for any other, so a rebuild only has to redo the edited function and the tools can even work in parallel.

Confidence: 5

**6.** The feature that makes it possible is that CJI already accepts type annotations written in comments, in the form `/*: Any[] */` (here declaring an array of values of any type). If CJI *required* such annotations on every function boundary, its inference would become local and its specialization could be driven by declared types instead of rounds of whole-program solving, making it a larger-language relative of the typed compiler. So what would have to become mandatory is the annotation on every function signature, not just an optional comment the programmer may add.

Confidence: 5

**Note on what I could not do:** questions 1–6 are all answerable from section 4.1–4.3, but question 2 is only answerable because the article states the objection and its rebuttal explicitly; nothing in the text gives a second example of a summary whose inputs change, so the answer rests on the single `nextIndex` case.

Confidence: 3

# Answers to "Check your understanding" (article 4)

## 1. Jump function for the first argument of `clamp`

The call is `clamp(i + 1, n)` inside `nextIndex`, so the first argument's jump function is
`J₁ = i + 1`, exactly as the article gives. Evaluating it substitutes `i`'s incoming range:

- lower bound: 5 + 1 = 6
- upper bound: 7 + 1 = 8

So the first parameter of `clamp` gets the range [6, 8], computed by evaluating two additions
rather than by re-visiting the body of `nextIndex`. This is the same arithmetic the article does
for `i` in [0, 9], which it turns into [1, 10].

Confidence: 5

## 2. Why a summary computed once is not automatically wrong

The classmate is treating the summary as if it stored the facts it was built from. A summary is a
dependence, not a fact: `J₁ = i + 1` says how the argument is computed from `nextIndex`'s
parameter, and it is true for every possible range of `i`. New caller facts do not invalidate it,
they are simply plugged into it.

What does change is the input, and inputs still travel around the call graph as often as needed;
the only difference is that each trip is now an expression evaluation instead of a body analysis.
A summary has to be recomputed only when the function's own text is edited. If a jump function
would be too complex to represent, the analysis marks that argument "unknown", which costs
precision but keeps the result correct.

Confidence: 4

## 3. Why plain SSA loses precision at a branch, and what π adds

Inside `while (i < n)` the fact `i < n` holds, but with plain SSA the name `i` is the same on the
branch where the test succeeded and on the branch where it failed. A range analysis attaches
ranges to names, so it cannot record "the value called `i` is less than `n`" for one outcome without
also claiming it for the other; the two facts get merged and the stronger one is lost.

Extended SSA forms fix this by inserting a renaming, written π, on each branch outcome: the
succeeding outcome gets a fresh name that carries the strengthened fact, the failing outcome gets
a name carrying its own fact. Sparse analysis then follows those distinct names and keeps the
precision the dense analysis would have, so no facts are thrown away at the merge.

Confidence: 4

## 4. Where iteration is still needed in dependency-order solving

Iteration — widening to force convergence, then narrowing to refine the widened result — is
required only *inside* a strongly connected component, that is, a group of nodes that depend on
each other cyclically, which is what loops and recursion produce.

Between components it is never required, because components are processed in topological order:
each one is solved after everything it depends on is already final, so one pass suffices and
there is nothing left to re-confirm.

Confidence: 5

## 5. What "local checking" means, and two consequences on the handheld

Local checking means that compiling a function needs exactly two inputs: the function's own text
and the declared signatures of the functions it calls. No fact about any caller is required, so
the cost of checking a function is proportional to that function's size rather than to the size
of the program.

Two practical consequences for a compiler running on the device: (a) an edit to one function's
body cannot change the code generated for any other function, so a rebuild only re-does the edited
function instead of 95 whole-program rounds; (b) functions can be checked in any order, which is
what makes one-pass compilation in seconds possible on a 360 MHz machine. The article states both
of these as properties of declared boundaries and connects them to the typed compiler's
"one-pass compilation in seconds on the device".

Confidence: 4

## 6. What supplies the information Static TypeScript's optimizer would have discovered

The type annotations already written in the source. A declared type tells the compiler up front
that an operand is an integer machine word or a managed reference, so it can emit the specialised
instruction sequence directly instead of generating and testing code for every combination of
operand types — which is exactly the reason Static Hermes gives for needing "sound types for
performance".

The article's phrasing is that "the type annotations already present in the source do the work
that inference and optimization do elsewhere". The same decision shows up in MicroPython's viper
emitter, where annotated integers are machine words whose arithmetic wraps at word size.

Confidence: 4

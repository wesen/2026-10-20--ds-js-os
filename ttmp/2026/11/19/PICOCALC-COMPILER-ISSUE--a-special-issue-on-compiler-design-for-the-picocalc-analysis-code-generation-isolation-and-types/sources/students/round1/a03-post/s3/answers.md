# Answers to "Check your understanding" (Article 3)

## 1

`scale` has no declared types, so the type of `k` is an unknown that must be solved from its
call sites. With only `area` calling it, `k` is always a small integer and the product is the
integer 12, so the multiply can be one integer instruction. `half` passes `0.5`, so `k` may be a
fraction and the product may be fractional, forcing a floating-point multiply.

The implication is that the compiled code for `scale` is not a function of the text of `scale`
alone; it is a function of every caller in the program. Compiling `scale` separately, before
seeing `half`, would produce code that is wrong or would have to be thrown away and redone, which
is exactly the "loss of knowledge" the article cites from Cooper & Torczon.

Confidence: 5

## 2

The article's table gives the trace directly: visit 1 gives `[0, 0]` (from the initializer
`let i = 0`), visit 2 gives `[0, 1]`, visit 3 gives `[0, 2]`. Each visit adds one to the upper
bound because the loop body computes `i + 1` and that value flows back to the loop head, so plain
iteration needs as many visits as the loop has iterations.

On a later visit, widening notices a bound that keeps moving and jumps it at once to a much
larger value, "for example to the next constant that appears in the program or to infinity". The
iteration then stabilizes within a few visits. The cost is precision: the final range is larger
than the true one, so any proof that depends on a tight bound may fail and more arithmetic gets
demoted to floating point.

Confidence: 4

## 3

First, JavaScript numbers are 64-bit floating point, so integer machine arithmetic agrees with
JavaScript only while every intermediate result stays inside ±2⁵³, the range where every integer is
exactly representable; `a + b` can leave that range. Second, no operand may be a fraction or NaN,
or the integer add no longer matches the floating-point answer.

(A third condition in the article is that negative zero must not be confused with zero where the
difference is observable.) None of these is known without the whole-program range analysis, so
`a + b` is compiled as an integer add only where the analysis proves all three conditions.

Confidence: 5

## 4

A specialized copy is new code, and that new code contains calls of its own — for example a
specialized `map` still calls whatever function was passed to it, and may call further helpers.
Those calls must be specialized as well, and specializing them requires inferring types inside the
newly created copy. So the work proceeds in rounds: specialize, infer, discover new call sites,
specialize again.

The accounting in section 3.4 matches this: six rounds added 12, 58, 1, 4, 3 and 1 helpers, and
12 + 58 + 1 + 4 + 3 + 1 = 79 in total. The large second round (58) shows that the first round's
copies exposed most of the remaining call sites.

Confidence: 5

## 5

The relevant row is "Replacing the range proof by local rules that need no whole-program facts":
170 s, of which 168 s is in the frontend. Since the numeric range proof has been removed, this
170 s cannot be the range analysis, and the article attributes the remaining time to solving for
types across the program and specializing library code.

The following paragraph is what makes the attribution: the typed compiler handles the typed part of
its version of the program in under one second, so the residual seconds are the price of
whole-program inference and specialization rather than of generating code. The article is careful
to say this does not prove inference is the only difference between the two compilers.

Confidence: 4

## 6

QuickJS plays the role of Self's fast first compiler: the article says "the handheld already has
its fast first tier, which is QuickJS". QuickJS compiles the same source to bytecode in 37 ms, so
programs run immediately without optimization, just as Self's non-optimizing compiler did.

What CJI lacks is the second half of Self's design: a mechanism to restrict the optimizing tier to
the code that actually matters. Self applied its optimizing compiler only to code that proved to
be executed often; CJI is "an optimizing tier with no mechanism to restrict it to the code that
matters", so it pays the whole-program cost for code that may never be hot. The missing piece is
therefore profiling plus hot-code selection, not the fast tier.

Confidence: 4

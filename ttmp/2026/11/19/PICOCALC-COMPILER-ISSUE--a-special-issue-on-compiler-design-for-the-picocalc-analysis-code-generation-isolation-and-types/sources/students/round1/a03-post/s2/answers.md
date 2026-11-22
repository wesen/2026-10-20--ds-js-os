# Answers to "Check your understanding" (article 3, *Why Whole-Program Inference Costs Minutes*)

## 1. Why adding `half` changes the machine code for `scale`

`scale` is the same three tokens in both versions, but its parameter `k` no longer receives only small integers: `half` passes `0.5`, so the product `x * k` can be a fraction. A single integer multiply instruction gives the wrong answer on a fractional operand, so the operation has to become a floating-point multiply (and the result type of `scale` stops being an integer). The facts about `k` are therefore a function of *all* call sites, not of `scale`'s own text. This implies `scale` cannot be compiled separately and cached: compiling it alone fixes a decision that a later, unrelated caller can invalidate, so the callers must be known before code is emitted, and adding a caller forces the already-compiled function to be recompiled.

Confidence: 5

## 2. Tracing `i` through the loop, then widening

At the loop head `i` is known from the reaching paths: visit 1 gives `[0, 0]`, visit 2 gives `[0, 1]` (initial value plus the back-edge value 0+1), visit 3 gives `[0, 2]` (initial value plus the enlarged back-edge value 1+1). Each visit adds one to the upper bound because the loop body adds exactly 1, so plain iteration would need as many visits as the loop has iterations — for `i = 0 … n-1` that is about `n` visits. Widening intervenes when a bound keeps moving: it jumps the upper bound at once to a much larger value, e.g. a threshold from the program's literals or infinity, so the iteration stabilizes in a few visits. The cost is precision: the final range is wider than the true one, and since the integer proof depends on the range, a wider range more easily fails the proof and forces demotion to floating point.

Confidence: 4

## 3. Two reasons `a + b` in JavaScript is not always one integer add

First, the result of integer machine arithmetic equals JavaScript's result only while every value stays inside ±2⁵³, the region where each integer is exactly representable as a 64-bit float; a sum past that bound rounds and the two answers diverge. Second, neither operand may be a fraction or NaN, because integer instructions truncate or trap where JavaScript would produce a fraction or NaN. (A third, also from section 3.3, is that negative zero must not be confused with zero where the difference is observable.) Since JavaScript gives no annotation to check, each of these conditions must be *proved* by the range analysis, and where the proof fails the add is demoted to general floating-point arithmetic.

Confidence: 5

## 4. Why one specialization forces another round

A specialized copy is not a leaf: it is newly generated code that contains calls of its own (to the functions that `map` calls, to element operations, and so on). Those new call sites were not in the source, so their callees have not been specialized yet, and specializing them requires inferring types inside the new copy. Hence the loop described in the article: specialize, infer, discover new call sites, specialize again. Agenda's six rounds added 12, 58, 1, 4, 3 and 1 helpers, and 12+58+1+4+3+1 = 79, matching the stated total, which shows the rounds shrink but do not stop after the first one.

Confidence: 5

## 5. Which measurement shows a large residual cost, and what it is attributed to

The last row of the table in section 3.5: with the range proof replaced by local rules that need no whole-program facts, the build still takes 170 s, and 168 s of that is in the frontend. Working: 1,475 s − 544 s = 931 s removed, and 931/1,475 ≈ 63 %, which is the "repeated range analysis was 63 %" figure in the row above. The residual 170 s is attributed to whole-program type inference and library specialization, i.e. solving unknowns across functions plus generating specialized copies, not to parsing or code emission.

Confidence: 3

## 6. Who plays Self's "fast first compiler", and what CJI lacks

QuickJS, the JavaScript engine already on the handheld, plays the role of Self's first-tier compiler: it produces running code quickly and without optimization, as the 37 ms compile of the same source shows. CJI is the optimizing tier, the analogue of Self's second compiler. What CJI lacks is the mechanism that restricted Self's optimizer to code worth optimizing: Self applied its optimizing compiler only to code that proved to be executed often, whereas CJI runs its whole-program analysis and specialization over the entire program with nothing to limit it to hot code. So the handheld has both tiers, but no way to decide which code deserves the expensive one.

Confidence: 4

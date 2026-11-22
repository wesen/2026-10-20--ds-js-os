# Answers to "Check your understanding" (section 3.8)

## 1

`scale(x, k)` uses `k` in a multiply. When only `scale` and `area` exist, `k` only ever receives `4`, so the product is always a small integer and one integer multiply instruction compiles the function. Once `half(v)` is added and calls `scale(v, 0.5)`, `k` can also be the fraction 0.5, so some calls need a floating-point multiply, and the code for `scale` changes although its own text did not. This means `scale` cannot be compiled in isolation: its machine code depends on facts that live in other functions, so any separate compilation would have to assume the worst (general floating-point arithmetic) or be redone when a new caller appears.

Confidence: 5

## 2

Pass 1 gives `i` the range [0, 0] at the loop head, from `let i = 0`. Pass 2 gives [0, 1]: the body computes `i + 1` from [0, 0] giving [1, 1], and the join with the entry value is [0, 1]. Pass 3 gives [0, 2] by the same step, and each further pass adds one, so plain iteration needs about as many passes as the loop has iterations. Widening replaces that stepping: when a bound has moved more than once, the solver jumps the bound directly to +∞ (or first to a threshold, such as a constant appearing in the program, and to +∞ only if it moves again). In the table's right-hand column the jump is made on pass 3, giving [0, +∞), and pass 4 finds the value unchanged, so the fixpoint is reported on the fourth pass regardless of how many iterations the loop really has. The cost is precision: the analysis now knows only that `i` is non-negative, not that it is below `n`, so a range check that would justify integer code may fail and the loop arithmetic may be demoted to floating point.

Confidence: 4

## 3

With `max = 2⁵³ − 1`, the true value of `max + 2` is 2⁵³ + 1, which is not exactly representable in a 64-bit floating-point number, so JavaScript rounds it; the rounded value used is 2⁵³ (above 2⁵³ the representable numbers are spaced by 2, and 2⁵³ + 1 sits halfway, so rounding takes it back to 2⁵³ rather than up to 2⁵³ + 2). The next step is exact: 2⁵³ − (2⁵³ − 1) = 1, which is why JavaScript answers 1 even though the arithmetic is wrong. A build of CJI without the proof used machine-integer arithmetic, where 2⁵³ + 1 is exactly representable (it is far below 2⁶³), so it computed 2⁵³ + 1 − (2⁵³ − 1) = 2 — the arithmetically correct answer but not JavaScript's answer. That mismatch is a wrong-code bug, which is why the proof counts as correctness rather than as an optimization.

Confidence: 4

## 4

The seven analyses follow from the round structure: CJI ran one complete range analysis before the first specialization round and again after each of the six rounds, that is 1 + 6 = 7. The 95 is not computed from a formula in the article; it is the sum, over those seven analyses, of the number of passes each analysis needed to reach its own fixpoint. It is consistent with the stated average of "about fourteen passes each", since 95 / 7 ≈ 13.6, and with the visit count, since 11,760 / 95 ≈ 124 functions per pass; later rounds handle more code (the 79 specialized helpers accumulate), so the later analyses should need more passes than the earlier ones. Two arithmetic slips worth noting: 7 × 14 = 98, not 95, and 95 × 124 = 11,780, not 11,760, so both figures are rounded rather than derived.

Confidence: 3

## 5

The last row of the table in section 3.5 shows that replacing the range proof entirely by local rules needing no whole-program facts still costs 170 s for the whole compile, of which 168 s is in the frontend; so removing the range analysis leaves a compile that is still two orders of magnitude slower than the typed compiler's 0.5 to 0.7 s on the typed functions of its own Agenda. That residue is attributed to the rest of the frontend — parsing, whole-program type inference, library specialization and the emission of intermediate code — with parsing ruled out by QuickJS's 37 ms and with a workstation timing that gave library specialization plus the inference it triggers 94 percent of pass time. The article is explicit that this attribution is an inference from those two facts, since no pass-by-pass profile of that particular variant was taken.

Confidence: 4

## 6

QuickJS, the JavaScript interpreter that runs the system's ordinary JavaScript programs, plays the role of Self's fast first compiler: it needs no analysis and starts running immediately, and it must be the tier that keeps the handheld responsive. What CJI lacks is the second half of Self's design — the mechanism that restricts the expensive optimizing compiler to code that proves to be hot, by profiling and recompiling only the frequently executed methods. CJI optimizes the whole program before anything runs, so every compilation pays the full 1,475-second cost even for code that executes once.

Confidence: 5

# Answers to "Check your understanding" (section 3.8)

## 1. Why adding `half` changes the machine code for `scale`

`scale` has no declared types, so the type of `k` is an unknown that is filled in from its
call sites. Before `half` exists, the only caller is `area`, which passes 3 and 4, so `k` can
only be an integer and `x * k` can be one integer multiply instruction. `half` passes 0.5, so
`k` must now also allow a fraction, and the product can be fractional, which forces a
floating-point multiply. The body of `scale` was never edited; only a new caller elsewhere in
the program changed. The implication is that `scale` cannot be compiled separately and once
for all: its code is a function of every call in the program, so it must either be compiled
last, after all callers are known, or be recompiled when a new caller appears.

Confidence: 5

## 2. Tracing `i` at the loop head, and what widening does

Pass 1 gives `i` the range [0, 0], because the loop is entered with `i = 0`. Pass 2 gives
[0, 1], because the back edge brings in the result of `i + 1` from the known value 0. Pass 3
gives [0, 2], and so on, one per pass. Widening is the shortcut taken when a bound keeps
moving: instead of counting up, the solver jumps the upper bound to a much larger value at
once. In the table this happens on pass 3, when the upper bound has moved twice, and the range
becomes [0, +∞); the fixpoint is then reached on pass 4, where the pass changes nothing. The
cost is precision: the analysis no longer knows that `i` is small, so it can prove fewer
integer operations. (CJI's refinement jumps first to a threshold such as a constant from the
program or a power of two, and only to infinity if the bound moves again.)

Confidence: 4

## 3. Where 1 and 2 come from

JavaScript numbers are 64-bit floats, and above 2⁵³ not every integer is representable.
`max + 2` is 2⁵³ + 1, which cannot be represented, so the addition rounds to the nearest
representable value, 2⁵³. Then `2⁵³ − (2⁵³ − 1)` is exactly 1. That is the true JavaScript
answer, and it is the answer a build with the range proof gives. A build without the proof
assumed exact integer arithmetic, so `max + 2` stayed 2⁵³ + 1 with no rounding, and
`(2⁵³ + 1) − (2⁵³ − 1)` is 2. The 2 is therefore the result of a silent wrong assumption,
which is why the article calls the range proof a correctness requirement rather than an
optimization.

Confidence: 4

## 4. How the seven and the 95 arise

The seven analyses come from the schedule: one complete range analysis before the first
specialization round, plus one after each of the six rounds (1 + 6 = 7). The 95 passes are
the sum, over those seven analyses, of the passes each one needed to reach its fixpoint; the
article states this average as "about fourteen passes each", and 7 × 13.57 ≈ 95, so the
individual analyses must have ranged between roughly 13 and 14 passes. The per-pass visit
count is consistent with the table: 11,760 visits ÷ 95 passes ≈ 123.8, the "about 124
functions per pass" the article gives. So the cost is the product of seven analyses, ~14
passes each, ~124 functions per pass.

Confidence: 3

## 5. The measurement that shows a large remaining cost, and its attribution

The last row of the table in 3.5: replacing the range proof with local rules that need no
whole-program facts gives a whole compile of 170 s, of which 168 s is still in the frontend.
So removing the dominant analysis leaves a large cost rather than a small one. That 168 s is
attributed to the rest of the frontend — parsing, type inference, library specialization and
the emission of intermediate code — with parsing ruled out by QuickJS's 37 ms and the weight
placed on type inference plus the specialization it triggers. The article is explicit that
this last step is an inference from two other facts (the 94 percent of pass time attributed
to specialization plus inference, and the parse time), not a pass-by-pass profile of that
build.

Confidence: 4

## 6. Who plays Self's fast first compiler, and what CJI lacks

QuickJS, the JavaScript interpreter, plays that role: every world already has a tier that
runs its code immediately without an optimizing compile, so the user is never blocked while
CJI thinks. What CJI lacks is the second half of Self's arrangement — a mechanism for
restricting the optimizing tier to the code that actually proves to be hot. The article puts
it directly: CJI "is an optimizing tier with no mechanism to restrict it to the code that
matters", so it pays the whole-program price for the whole program instead of for its hot
parts.

Confidence: 5

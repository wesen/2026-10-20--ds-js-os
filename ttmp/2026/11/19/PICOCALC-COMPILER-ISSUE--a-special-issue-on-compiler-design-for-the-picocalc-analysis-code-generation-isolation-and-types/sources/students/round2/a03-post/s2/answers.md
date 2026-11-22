# Answers to "3.8 Check your understanding"

**1.** Type inference treats each parameter's type as an unknown solved from every call site, so `scale`'s `k` must hold both the integer `4` passed by `area` and the fraction `0.5` passed by `half`. Once a fraction can reach `k`, the product can be a fraction, so the multiply cannot be the single integer multiply instruction and is demoted to floating-point arithmetic; the result type of `scale` widens with it. The text of `scale` never changed, so the change was caused only by a caller. This implies `scale` cannot be compiled separately from the rest of the program: any call added anywhere can invalidate the facts the earlier compile relied on and force it to be re-inferred and re-emitted.

Confidence: 5

**2.** Pass 1: `i` is [0, 0] at the loop head, from `let i = 0`. Pass 2: the body computes `i + 1` from [0, 0] giving [1, 1], and the join with the entry value gives [0, 1]. Pass 3: the body gives [1, 2], the join gives [0, 2]; in the widening column the upper bound has now moved twice (0 → 1 → 2), so the solver jumps it to [0, +∞) in this same pass. Widening replaces a slowly climbing bound with a much larger value at once, so the solver terminates in a few passes instead of one pass per loop iteration (for a loop of n iterations, plain iteration needs n passes). In the table the fixpoint is reported at pass 4, because the solver recomputes the body from [0, +∞), joins, and gets [0, +∞) again — unchanged, so it stops. The cost is precision: the upper bound is now infinite, so a proof that `i` stays under 2⁵³ fails and dependent integer arithmetic may be demoted; the threshold refinement (jump to a program constant or a round value first) buys back part of that.

Confidence: 4

**3.** Working: `max = 2⁵³ − 1`. In JavaScript, `max + 2 = (2⁵³ − 1) + 2 = 2⁵³ + 1`. A JavaScript number has only 53 bits of significand, so 2⁵³ + 1 is not representable; it lies exactly halfway between 2⁵³ and 2⁵³ + 2 and rounds (ties to even) down to 2⁵³. Then `2⁵³ − max = 2⁵³ − (2⁵³ − 1) = 1`, which is the observed 1. The build without the proof used exact integer arithmetic, where 2⁵³ + 1 is representable exactly and subtracting `max` gives 2. So 1 is the answer after JavaScript's rounding and 2 is the exact answer; because the two differ, the integer code is wrong, which is why the article calls the range proof a correctness requirement and not an optimization. The article states that the sum "is rounded to 2⁵³" but does not give the rounding rule, so the ties-to-even step is mine.

Confidence: 5

**4.** The seven come from the schedule: the original CJI ran the complete range analysis once before the first specialization round and then once after each of the six rounds, so 1 + 6 = 7. The 95 come from the inside: each of those analyses is itself an iteration of whole-program passes, and the table reports 95 passes summed over all seven analyses. Working: 95 ÷ 7 ≈ 13.6, which is exactly the "averaging about fourteen passes each" of section 3.4, so "fourteen" is derived from 95 and not measured separately. The same multiplication explains the next rows: 95 passes × about 124 functions per pass ≈ 11,760 visits (95 × 123.8 = 11,760), and the joins accumulate over those visits to 11,743,517.

Confidence: 4

**5.** The last row of the section 3.5 table: replacing the range proof by local rules that need no whole-program facts still takes 170 s for the whole compile, 168 s of it in the frontend. That shows the leftover cost is large and is not the range analysis. Parsing is ruled out by QuickJS compiling the same source in 37 ms, so the article attributes the 168 s to whole-program type inference plus the library specialization that triggers the inference. Its supporting figure is the workstation timing that put 94 percent of pass time on "library specialization together with the inference it triggers". The article says plainly that no pass-by-pass profile of that variant was taken, so this attribution is an inference from two facts and not a direct measurement.

Confidence: 5

**6.** QuickJS, the JavaScript interpreter already on the handheld, plays the role of Self's fast first compiler: it is the cheap tier that runs first and needs no whole-program work. CJI lacks the second half of the Hölzle and Ungar design, a mechanism to restrict the optimizing compiler to code that proves to be executed often. In the third-generation Self system most methods never paid for optimization because a fast compiler ran first and only hot code was later recompiled; CJI instead runs its whole-program type inference and specialization over the entire program, unconditionally, with no profiler choosing who deserves the expensive tier. So the handheld has a fast first tier but nothing that decides which code should ever reach the slow one.

Confidence: 5

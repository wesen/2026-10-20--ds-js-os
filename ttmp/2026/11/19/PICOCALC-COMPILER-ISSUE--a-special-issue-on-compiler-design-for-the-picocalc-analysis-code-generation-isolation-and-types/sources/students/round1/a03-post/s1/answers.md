# Answers to "3.8 Check your understanding"

## 1. Why does adding `half` change the machine code for `scale`?

Without `half`, the only caller of `scale` is `area`, which passes the constants 3 and 4, so both parameters are known to be small integers and the `x * k` can be one integer multiply instruction. Adding `half` adds a caller that passes 0.5 for `k`, so `k` no longer ranges only over integers and the product can be a fraction; the multiply must then be a floating-point operation. The text of `scale` is identical in both versions, yet its compiled code is not. This implies that `scale` cannot be compiled separately from the rest of the program: the facts about its parameters are a function of every call site, so a compiler that emits code for `scale` from `scale` alone would choose the integer multiply and be wrong once `half` exists.

Confidence: 5

## 2. Trace the range of `i`, then explain widening

The table in section 3.2 starts `i` at the literal `0`, so visit 1 knows `i` is [0, 0]. Visit 2 propagates the loop body once (`i = i + 1`) back to the loop head, giving [0, 1]; visit 3 gives [0, 2]. Each further visit would enlarge the range by exactly one, so reaching the true bound would take as many visits as the loop has iterations, which is unbounded if `n` is unknown. Widening is the remedy: when a bound keeps moving, the solver does not take one more step, it jumps the bound at once to something much larger than the next value, for example the next constant that occurs in the program or infinity. The iteration therefore reaches a fixpoint in a handful of visits, but at a cost in precision, since the answer is now some over-approximation of the real range rather than the smallest one.

Confidence: 5

## 3. Two reasons `a + b` cannot always be a single integer add

First, JavaScript has no integer type: every number is a 64-bit float, and integers are only exactly representable up to ±2⁵³, so a result inside that window can be computed by integer arithmetic but one outside it cannot. Second, the operands must be proved to be neither fractions nor NaN, because a fractional operand (0.5, as in question 1) or NaN would make integer add give a different answer; the article also adds the related condition that negative zero must not be confused with zero where the difference is observable. Since these are conditions rather than guarantees, CJI treats integer arithmetic as a claim that the range analysis must prove, and demotes the operation to floating point wherever the proof fails.

Confidence: 5

## 4. Why does one round of specialization force another?

Specializing `list.map(f)` means generating a fresh copy of `map` for that call site, and that copy is new code: it has its own body, its own temporary variables and its own calls (for example to the passed function `f`, or to helpers that `map` uses internally). Those inner calls have never been seen by the specializer before, and specializing them requires knowing the types of the values flowing through the new copy, which is exactly what inference supplies. So the rounds go: specialize, infer types inside the new code, discover call sites that were not there before, specialize again. Agenda's rounds added 12, 58, 1, 4, 3 and 1 helpers, 79 in total, which shows the growth can be large in an early round and then die out.

Confidence: 5

## 5. Which measurement shows a large residual cost?

The last row of the table in section 3.5: replacing the range proof by local rules that need no whole-program facts still leaves the build at 170 s, of which 168 s is spent in the frontend. That row is the important one because the numeric proof — the expensive part being removed — is gone, so the remaining 170 s cannot be blamed on it. The article attributes that remainder to whole-program type inference across the program plus the specialization of library code, and points out that the typed compiler handles the typed part of its version of the program in under one second. I read "attributed" as the article's own attribution rather than something separately measured, which is why I mark this below certain.

Confidence: 4

## 6. Who plays Self's fast first compiler, and what does CJI lack?

QuickJS plays that role: it is the handheld's fast first tier, producing bytecode in 37 ms without optimization, while CJI is the optimizing tier that runs behind it. What CJI lacks is Self's third-generation control mechanism, namely a way to apply the optimizing compiler only to the code that proves to be executed often. Self paired a non-optimizing compiler with an optimizing one applied later to hot code, which kept interactive pauses short; CJI instead runs whole-program inference and specialization over everything, so its cost is paid for the whole program rather than restricted to the part that matters.

Confidence: 5

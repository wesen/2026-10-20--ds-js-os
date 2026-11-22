# Answers — "3. Why Whole-Program Inference Costs Minutes"

## 1. Why adding `half` changes the machine code for `scale`

I cannot know this without the article. My best reasoning is that Agenda infers operand types globally, so `scale`'s arithmetic is compiled from the *inferred* type of the values it touches rather than from a written annotation; introducing `half` presumably puts a fractional literal or a new call edge into the program that reaches the same values `scale` uses, which forces those values from a narrow integer type up to a promoted (float or unbounded/ranged-wider) type. If `scale` were compiled separately, the compiler would not see `half` and would have to assume the narrow type, producing a narrower `add`/`mul` (or a specialized unboxed loop) that becomes wrong once `half` exists. So the implication is stark: there is no separate compilation and no stable object file per function — any edit anywhere can invalidate the code of a function that does not mention the edit, and `scale` must be re-derived as part of the whole program.

Confidence: 2

## 2. Range of `i` at the loop head, and what widening costs

I cannot know this without the article. The shape such an example always has is a monotone fixed-point walk: visit 1 gives `[0, 1]`, visit 2 sees the back edge's `i+1` and extends to `[0, 2]`, visit 3 to `[0, 3]`, and so on, each visit refining but never shrinking the interval at the loop head. At a later visit the analysis gives up on convergence and *widens* — it jumps `i` to the top of its type (e.g. `[0, +inf]` or `[0, 2^31-1]`) so the iteration terminates instead of crawling to the real bound. The cost is precision, and precision is where the code generation lives: with `[0, 3]` the bound proves no overflow and no promotion, so `i*4` can be a raw integer multiply; with a widened range every operation needs an overflow check, a promotion path to float, or boxing, so the loop gets larger and slower and often triggers another specialization round.

Confidence: 2

## 3. Two reasons `a + b` in JavaScript is not a single integer add

First, `+` is overloaded: it is string concatenation whenever either operand is a string, and in JavaScript *any* value may at runtime be a string, so the compiled code must branch on the operand types (or on an inline-cached type tag) before it can choose an operation at all. Second, even on the numeric path, JS numbers are IEEE-754 doubles, not machine integers — the addition must be a float add plus whatever bookkeeping preserves integer appearance, and results beyond 2^53 no longer behave like integers, so an "integer add" is only a legal peephole after a proof that both operands are small ints. A third reason in the same spirit is that a non-primitive operand forces `ToPrimitive`/`valueOf` coercion, which runs user code that can allocate, throw, or mutate state, so it cannot be inlined as arithmetic at all.

Confidence: 3

## 4. Why specializing one library call creates a need for another round

Because specialization changes the program the analysis is looking at, not just its speed. Inlining or specializing one library call (say the generic `insert`/`push` in a collection) exposes that call's body at the call site — new expressions, new call sites, and new concrete operand types that were previously hidden behind a generic signature — so a second call elsewhere in that body may now become monomorphic where before it was polymorphic. Each round therefore unlocks the next, and only when a round finds nothing new has the program reached a fixed point; Agenda's six rounds are the length of that chain on a real program. The cost is that "one more round" is a whole-program round: nothing can be declared done early, and the compiler cannot stop when a function's own analysis is stable, only when the entire reachable program is.

Confidence: 2

## 5. The measurement in 3.5 that shows the residual cost is still large

I cannot know this without the article, and I do not know which measurement is meant. What such a measurement has to look like is a before/after pair in which the range analysis is switched off (or stubbed to a trivial result) and the remaining compile time is still in the tens of seconds or minutes — i.e. removing the expensive-sounding pass fails to remove most of the cost, which is what makes the section necessary. The attribution that would follow, and that I would expect from the argument built in 3.1–3.4, is to the whole-program fixed-point iteration itself: repeatedly walking and re-solving the reachable call graph, merging/uniting type information for every value, and re-running specialization rounds until nothing changes — not to any single clever algorithm inside one pass.

Confidence: 2

## 6. Which handheld component plays Self's fast first compiler, and what CJI lacks

I cannot know this without the article — I do not know what the PicoCalc (or the described system) ships with, so I cannot name the component with confidence. The role it must play is Self's: Self beat its compile pause by pairing a *fast, non-optimizing* compiler that always produces machine code immediately with an *optimizing* compiler that runs later, in the background, guided by type feedback gathered from the running program, and swaps the optimized version in (including into already-running frames, via on-stack replacement). By analogy, the handheld's existing quick code generator or interpreter — whatever turns a form into runnable machine code in milliseconds — is the fast first compiler. What CJI would then lack relative to Self is the second half: runtime type feedback as the input to specialization, a background/concurrent optimizing compiler that does not stop the program, dependency tracking so an invalidated assumption re-specializes only what depended on it, and on-stack replacement of live frames — so instead of recompiling per method in the background it re-runs whole-program inference and stops the world for minutes.

Confidence: 1

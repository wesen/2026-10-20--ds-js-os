# 3. Why Whole-Program Inference Costs Minutes

This article explains what CJI computes during the 25 minutes it needs for Agenda, and why that computation cannot be done one function at a time. By the end you should be able to describe type inference as the solving of unknowns, trace a fixpoint iteration on a three-line loop, explain why a call from a new place can change the code generated for an old function, and cite the measurements that identify inference as the cost. The next article covers the remedies.

Article 1 introduced CJI as a compiler that accepts JavaScript without type annotations. This article assumes that definition and the meaning of *turn* and *world*.

## 3.1 Types as unknowns

When a program declares `function scale(x: i32, k: i32): i32`, a compiler *checks* types: it confirms that each use agrees with the declaration. When the program says only `function scale(x, k)`, the types of `x` and `k` are unknowns, and the compiler must *solve* for them from the ways the function is used. Consider three functions.

```js
function scale(x, k) { return x * k; }
function area()      { return scale(3, 4); }
function half(v)     { return scale(v, 0.5); }
```

Looking only at `scale` and `area`, both arguments are small integers, the product is the integer 12, and `scale` can be compiled as one integer multiply instruction. Adding `half` changes the answer. Now `k` is sometimes 0.5, the product is sometimes a fraction, and the multiply must be a floating-point operation. The text of `scale` did not change. Its compiled code changed because a caller elsewhere in the program changed.

This is the defining property of whole-program inference: the facts about a function are a function of all its callers, and the facts about a caller's values may in turn depend on what its callees return. *Engineering a Compiler* names the underlying problem as "loss of knowledge in single-procedure analysis and optimization because of a call site" [Cooper & Torczon 2023, §9.4]. A compiler that wants the integer multiply must look across the call.

The compiler records the unknowns as *constraints*. For the example: the type of `x` includes whatever `area` passes and whatever `half` passes; the type of `v` in `half` includes whatever the callers of `half` pass; the result type of `scale` follows from `x` and `k`. Solving means finding the smallest assignment of types that satisfies every constraint.

## 3.2 Solving by iteration

Constraints of this kind are solved by repeated propagation. Each unknown starts with no information. The solver visits the program, adds to each unknown whatever the code implies, and repeats until a full visit changes nothing. The unchanged state is called a **fixpoint**. The method and the conditions under which it terminates were set out for compilers in the 1970s [Kildall 1973; Kam & Ullman 1977].

Termination requires that information only grows and that it cannot grow forever. For types this holds trivially: a variable can acquire the labels *integer*, *number*, *string* and a few others, and once it has all of them nothing more can be added. For numeric *ranges* it does not hold, and ranges are what CJI needs most.

A **range** (or interval) records the smallest and largest value a variable can take. CJI also records three flags: whether the value can be a fraction, whether it can be negative zero, and whether it can be the special value NaN. Consider this loop.

```js
let i = 0;
while (i < n) { i = i + 1; }
```

| Visit | Range known for `i` at the loop head |
| --- | --- |
| 1 | [0, 0] |
| 2 | [0, 1] |
| 3 | [0, 2] |
| … | grows by one per visit |

Each visit enlarges the range by one, so plain iteration would need as many visits as the loop has iterations. The remedy is **widening**: when a bound keeps moving, the solver jumps it to a much larger value at once, for example to the next constant that appears in the program or to infinity. The iteration then stabilizes in a few visits at the cost of a less precise answer. Widening was introduced with the general theory of this kind of analysis, called abstract interpretation [Cousot & Cousot 1977]. CJI widens to thresholds taken from the program's literals plus a set of standard values.

Combining two ranges where control flow merges is called a **join**: the join of [0, 3] and [2, 9] is [0, 9]. The number of joins performed is a direct measure of how much work a range analysis does.

## 3.3 Why JavaScript integers need a proof

In the typed language of Article 1, `i32` arithmetic is defined to wrap around at 32 bits, so `at + 1` is always one add instruction. JavaScript has no integer type. Every number is a 64-bit floating-point value, and integer machine arithmetic gives the same answers only under conditions that must be established:

- the result must stay within the range where every integer is exactly representable, which is ±2⁵³;
- no operand may be a fraction or NaN;
- negative zero must not be confused with zero where the difference is observable.

CJI therefore treats integer arithmetic as a claim to be proved by the range analysis. Where the proof fails, the operation is **demoted** to general floating-point arithmetic. A demotion changes a variable's type, which can change other functions' types, so type solving must run again after it.

The project tested what happens without the proof. A build with the proof disabled computed `(max + 2) - max` as 2 where JavaScript gives 1, and converted negative zero to zero. The proof is required for correctness and cannot be dropped as an optimization that happens to be expensive.

## 3.4 Specialization multiplies the work

CJI performs a second whole-program activity, **library specialization**. A call such as `list.map(f)` could be compiled as a call to one general `map` routine that inspects its arguments at run time. CJI instead generates a separate copy of `map` for each call site, specialized to the element type and the function passed there. Specialized copies are fast because every operation in them has known types.

A specialized copy is new code, and it contains calls of its own. Those calls must be specialized too, which requires inferring types inside the new copy. Specialization therefore proceeds in rounds: specialize, infer, discover new call sites, specialize again. Agenda needs six rounds that add 12, 58, 1, 4, 3 and 1 specialized helpers, 79 in total.

The original CJI ran the complete range analysis after every round. The two activities multiply.

| Work done compiling Agenda (16,326 bytes of source) | Count |
| --- | ---: |
| Specialization rounds that added helpers | 6 |
| Complete range analyses | 7 |
| Fixpoint visits of the whole program | 95 |
| Visits to individual functions | 11,760 |
| Range joins | 11,743,517 |

Nearly twelve million joins to compile a sixteen-kilobyte source file is the 25 minutes. A profile on a workstation attributed 88.0 percent of all executed instructions to the range analysis.

## 3.5 The evidence that inference is the cost

The claim of this article is specific: the dominant cost in CJI is interprocedural inference and specialization. It is not parsing JavaScript, not emitting machine code, and not garbage collection. Four measurements from the project support each part of that claim.

| Measurement (Agenda, on the device unless noted) | Result | What it rules out or shows |
| --- | --- | --- |
| Link, assemble and hash | 1.2 s of 1,480 s | Machine-code emission is not the cost |
| Garbage collection | 85.9 s (5.8%); a larger heap saved 1.2% | Memory management is not the cost |
| QuickJS compiling the same source to bytecode | 37 ms | Parsing JavaScript is not the cost |
| Running the range proof once after the last round, with a safety guard | 1,475 s → 544 s | Repeated range analysis was 63% of the time |
| Replacing the range proof by local rules that need no whole-program facts | 170 s, of which 168 s in the frontend | What remains is type inference and specialization |

The last row is the important one. Even with the numeric proof replaced, CJI needs 170 seconds, and the typed compiler handles the typed part of its version of the program in under one second. The difference that remains after removing the range analysis is the cost of solving for types across the program and specializing library code.

One caution applies. The typed compiler also does less: its language has no closures, no objects and no automatic memory management, so it would be faster than CJI even with identical analysis strategies. The measurements above do not claim that inference is the *only* difference between the compilers. They show that within CJI, inference is where the time goes.

## 3.6 The same wall, hit before

CJI is not the first compiler to meet this cost. Three earlier systems met it and are worth knowing as instances of one phenomenon.

**Self.** The Self language of the late 1980s had no static types and made every operation, including arithmetic, a message send. Its compiler made programs fast by **customization**: it compiled a separate copy of each method for each type of receiver it was called on, so that inside the copy the receiver's type was known and sends could be bound at compile time [Chambers & Ungar 1989]. This is the same idea as CJI's per-call-site specialization. The price was long compilation pauses during interactive use, because every new combination of method and type triggered an optimizing compile. The third-generation Self system answered with two compilers: a fast one that does no optimization and runs first, and an optimizing one applied later only to the code that proves to be executed often [Hölzle & Ungar 1994]. The authors measured the result in a 50-minute interactive session: 21 pauses exceeded one second and almost two thirds were under a tenth of a second, in a system that still ran two to three times faster than the Smalltalk implementations of its day. The lesson for this project is direct. The handheld already has its fast first tier, which is QuickJS. CJI is an optimizing tier with no mechanism to restrict it to the code that matters.

**RPython.** The PyPy project writes its interpreters in RPython, a restricted Python whose types are inferred over the whole program so that it can be translated to C [Ancona et al. 2007]. The paper states that the toolchain "relies on a full-program analysis", so that checking is not done module by module and separate compilation is difficult. PyPy's build documentation gives the time to translate the complete interpreter as about 20 minutes on a fast machine, with several gigabytes of memory. RPython's designers accepted this because translation happens rarely and off line. On a handheld where a user edits a file and waits, the same design is not acceptable.

**Shed Skin.** This compiler translates implicitly typed Python to C++ by inferring every type in the program [Dufour 2006]. Its documentation states the limit directly: the inference techniques "do not scale very well beyond several thousand lines of code".

**The Cartesian product algorithm.** Agesen's algorithm for inferring types in Self programs analyzes each function once for every combination of argument types that reaches it [Agesen 1995]. It states precisely what "specialize per call site" costs: the amount of analysis is proportional to the number of distinct type combinations in the whole program, a quantity no single function's text reveals.

## 3.7 Key points

- Without declared types, the type of a parameter is an unknown that depends on every caller. The compiled code for a function can change when unrelated code is added.
- Unknowns are solved by iterating to a fixpoint. Numeric ranges need widening to converge, and joins measure the work.
- JavaScript numbers are floating-point. Compiling them as integers requires a proof of range, fraction-freedom and zero sign, and the proof is required for correctness.
- CJI specializes library calls per call site in rounds and originally repeated the range analysis every round: 7 analyses and 11.7 million joins for Agenda.
- With the range analysis replaced entirely, CJI still needs 170 s. The remaining cost is whole-program type inference and specialization.
- Self, RPython and the Cartesian product algorithm met the same cost. Self's answer was a fast compiler first and optimization only for hot code.

## 3.8 Check your understanding

1. In section 3.1, adding the function `half` changes the machine code for `scale`. Explain why, and say what this implies about compiling `scale` separately from the rest of the program.
2. Trace the range of `i` at the loop head in section 3.2 for the first three visits, then state what widening does on a later visit and what it costs.
3. Give two reasons, from section 3.3, why `a + b` in JavaScript cannot always be compiled as a single integer add instruction.
4. Agenda needs six specialization rounds. Why does specializing one library call create the need for another round?
5. Which measurement in section 3.5 shows that the cost remaining after the range analysis is removed is still large, and what is that cost attributed to?
6. Self's designers solved their compile-pause problem with two compilers. Which component of the handheld already plays the role of Self's fast first compiler, and what does CJI lack compared with Self's design?

## References

- [Agesen 1995] O. Agesen. "The Cartesian product algorithm: simple and precise type inference of parametric polymorphism." *ECOOP*, 1995.
- [Ancona et al. 2007] D. Ancona, M. Ancona, A. Cuni, N. D. Matsakis. "RPython: a step towards reconciling dynamically and statically typed OO languages." *Dynamic Languages Symposium*, 2007.
- [Chambers & Ungar 1989] C. Chambers, D. Ungar. "Customization: optimizing compiler technology for SELF, a dynamically-typed object-oriented programming language." *PLDI*, 1989.
- [Cooper & Torczon 2023] K. D. Cooper, L. Torczon. *Engineering a Compiler*, 3rd edition. Morgan Kaufmann, 2023. §9.2 (iterative data-flow analysis), §9.4 (interprocedural analysis).
- [Cousot & Cousot 1977] P. Cousot, R. Cousot. "Abstract interpretation: a unified lattice model for static analysis of programs by construction or approximation of fixpoints." *POPL*, 1977.
- [Dufour 2006] M. Dufour. "Shed Skin: an optimizing Python-to-C++ compiler." Master's thesis, Delft University of Technology, 2006; and the Shed Skin documentation.
- [Hölzle & Ungar 1994] U. Hölzle, D. Ungar. "A third-generation SELF implementation: reconciling responsiveness with performance." *OOPSLA*, 1994.
- [Kam & Ullman 1977] J. B. Kam, J. D. Ullman. "Monotone data flow analysis frameworks." *Acta Informatica* 7, 1977.
- [Kildall 1973] G. A. Kildall. "A unified approach to global program optimization." *POPL*, 1973.

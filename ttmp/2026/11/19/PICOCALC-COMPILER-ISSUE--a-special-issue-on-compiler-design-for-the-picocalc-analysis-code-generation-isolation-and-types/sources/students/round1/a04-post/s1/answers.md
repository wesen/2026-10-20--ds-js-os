# Answers to "Check your understanding" (section 4.5)

## 1. Jump function for `clamp`'s first argument and its range when `i` is in [5, 7]

The body is `return clamp(i + 1, n)`, so the call has two arguments. The jump function for the first argument expresses that argument in terms of the enclosing function's own parameters: `J₁ = i + 1`. (The second is `J₂ = n`, as the article states.)

Working: the jump function is monotone in `i`, so I apply it to the endpoints of the interval. Lower endpoint: 5 + 1 = 6. Upper endpoint: 7 + 1 = 8. Therefore the first argument of `clamp` lies in [6, 8].

This is obtained by evaluating an expression, not by visiting the body of `nextIndex`, which is exactly the point of the example.

Confidence: 5

## 2. The error in "a summary computed once must be wrong, because callers keep changing"

The classmate confuses a summary with the facts the summary is applied to. A summary is a *dependence*: it says how a function's outputs (or its calls' arguments) are determined by the function's own inputs, and it contains no caller facts at all. So it does not become stale when callers change.

Facts still flow through the call graph as often as needed; what changes is the cost of each trip, which becomes an expression evaluation over the summary instead of a re-analysis of the body. The summary needs recomputation only when the function's own text changes, because only then does the dependence itself change.

Confidence: 5

## 3. Why plain SSA loses information at a branch, and what extended SSA adds

Under plain SSA, `i` keeps one name on both outcomes of `i < n`, so a range analysis has only one place to store facts about `i`. On the true edge it learns `i < n`, but that fact is not true of the same name on the false edge, so it can only record what holds on both paths — roughly the join of the two ranges. The stronger fact that the analysis could derive inside the loop body is therefore discarded.

Extended SSA forms insert a renaming, written π, on each branch outcome, giving each strengthened fact its own name. The true edge gets a name carrying `i < n` and the false edge a different one, so each name has a single range and the sparse analysis keeps the precision of the dense analysis it replaces.

Confidence: 4

## 4. Where iteration is still required in dependency-order solving, and where it is never required

Iteration is required *inside* a strongly connected component that contains a cycle — a loop or recursion — because the values in that component depend on each other and no order solves them in one pass. There the analysis iterates with widening, then applies a refining step called narrowing before the component's results are used.

Iteration is never required *between* components. Components are processed in topological order, so each one is solved only after everything it depends on is already final, and each component is visited once. That confinement of iteration to cycles is also what raised precision in the cited measurements, since widening is applied only inside cycles.

Confidence: 5

## 5. What "local checking" means, and two consequences for the handheld compiler

Local checking means the compiler needs only two things to compile a function: the function's own text, and the declarations of the functions it calls. Nothing about callers is needed, so the cost of checking is proportional to the size of the function, functions can be checked in any order, and an edit to one function's body cannot change the code generated for another.

Two practical consequences: (a) a function can be compiled in one pass in seconds on the device itself, which is what the typed compiler of this project does and what whole-program inference cannot achieve on a 360 MHz machine; (b) an edit followed by a rebuild — the common case on the handheld — only requires recompiling the edited function, because no other function's generated code depends on it. The article also allows work to be split and done in order-independent fashion, which is the parallel-tools argument it cites for TypeScript's `isolatedDeclarations`.

Confidence: 4

## 6. What supplies the information that an optimizer would otherwise discover

The type annotations already present in the source supply it. In Static TypeScript the compiler has almost no optimization to speak of — only a simple peephole pass — yet the declared types tell it the representation and size of each value, so it does not have to derive those facts by analysis.

The same principle is stated for Static Hermes as "sound types for performance": without sound types a compiler must generate code for every combination of operand types. The annotations do the work that inference and optimization do in other compilers, and the result runs far faster than the embedded interpreters it was compared with.

Confidence: 5

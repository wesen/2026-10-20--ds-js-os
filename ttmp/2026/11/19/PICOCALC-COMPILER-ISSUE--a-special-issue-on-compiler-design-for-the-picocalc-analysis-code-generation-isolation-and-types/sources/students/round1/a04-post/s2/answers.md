# Answers to "Check your understanding" (section 4.5)

## 1. Jump function for the first argument of `clamp`, and its range when `i` is in [5, 7]

The article gives the call `clamp(i + 1, n)` inside `nextIndex(i, n)` and states the two jump
functions as `J₁ = i + 1` and `J₂ = n`. So the jump function for the first argument of `clamp` is
`J₁(i) = i + 1`, an expression over the *enclosing function's own parameters*, not over the
caller's variables. Evaluating it treats the interval as an expression: the lower bound becomes
5 + 1 = 6 and the upper bound becomes 7 + 1 = 8. The first argument of `clamp` therefore lies in
[6, 8], and the body of `nextIndex` is never revisited to find this out. This is sound because
adding the same constant to every point of an interval moves both endpoints by that constant, so
the result is the set of all `i + 1` for `i` in [5, 7], namely [6, 8].

Confidence: 5

## 2. The error in "a summary computed once must be wrong, because callers keep changing"

The mistake is to think the summary *contains* facts about callers, when it contains only a
dependence. A summary is a small function from the function's inputs to its outputs; the caller's
facts are the *arguments* to that function, and they arrive fresh on every visit. So the analysis
does not have to read the body again — it evaluates the summary on the new inputs — while the
facts themselves keep travelling around the call graph as often as needed. The only event that
invalidates a summary is a change to the function's own text. Even in the worst case where a jump
function becomes too complicated to write down, the analysis records "unknown", which loses
precision but stays correct, so the cheap answer is never a wrong answer.

Confidence: 5

## 3. Why plain SSA loses information at a branch, and what extended SSA adds

Inside the body of `while (i < n)` the analysis knows `i < n`, and that is a stronger fact than
the one holding before the test. But plain SSA only creates a new name where a variable is
*assigned*, and a branch assigns nothing, so the `i` on the true edge and the `i` on the false
edge carry the same name. A name can hold only one range in the table, so the analysis must either
record a range valid on both paths, which forgets `i < n`, or claim a fact that is false on the
other path. Extended SSA forms insert a renaming, written π, for each branch outcome, giving the
strengthened fact its own name. With those names present, a sparse analysis loses no precision
compared with the dense analysis it replaces, because every place where a fact can change now has
a name of its own.

Confidence: 4

## 4. Where iteration is still required in dependency-order solving

Iteration is required *inside* a single strongly connected component of the constraint graph, that
is, inside a group of values that depend on each other in a cycle; loops and recursion create such
cycles. There the analysis still runs to a fixed point, using widening to force termination and
then a refining step called narrowing to recover the precision widening lost. Iteration is never
required *between* components, because components are processed in topological order and each one
is solved only after everything it depends on is already final. That is why the method can be both
faster and more precise than 95 whole-program rounds: widening happens only where cycles make it
unavoidable, and each component's results are narrowed before anything else reads them.

Confidence: 5

## 5. What "local checking" means, and two practical consequences on the handheld

Local checking means the compiler needs only the function's own text and the declared signatures
of the functions it calls; nothing about its callers is required. It has three named properties:
cost proportional to the size of the function, validity in any order, and the guarantee that an
edit to one function's body cannot change the code generated for another. Two practical
consequences: first, a rebuild after editing one function only re-checks and recompiles that
function, so the edit–compile cycle stops costing 170 seconds and becomes compatible with
interactive use at 360 MHz. Second, because functions are independent, they can be checked in any
order and in parallel, and the working set is one function plus its callees' signatures rather
than whole-program fact tables, which matters inside an 8 MiB heap where a per-function result
cache already pushed peak memory from 4.5 MB to 7.3 MB.

Confidence: 4

## 6. What supplies the information that an optimizer would otherwise have to discover

The type annotations already present in the source supply it. Static TypeScript compiles an
annotated subset of TypeScript, so at every function boundary the compiler knows the
representation of each value without inference, and it can emit direct code for the declared types
instead of code that tests operand types at run time. The article says the authors describe their
optimizer as having "no optimizations to speak of except for a simple peep-hole pass", and that
"the type annotations already present in the source do the work that inference and optimization do
elsewhere". The Static Hermes quotation puts the same point negatively: native compilation
"requires sound types for performance", because without them the compiler must generate code for
every combination of operand types.

Confidence: 4

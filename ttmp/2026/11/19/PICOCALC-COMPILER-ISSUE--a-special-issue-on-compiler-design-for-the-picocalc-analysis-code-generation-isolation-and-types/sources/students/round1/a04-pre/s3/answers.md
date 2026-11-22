# Answers (written without seeing the article)

1. I cannot know this without the article: I have not been given the body of `nextIndex`, so I do not
   know which expression is passed as `clamp`'s first argument. A jump function here is the map
   from the caller's current value to the callee's argument value — identity for a bare variable,
   `x+1` for `i+1`, and so on — and the argument's range is that function applied to the incoming
   interval. So the answer must read like: if the first argument is `i` itself the jump function is
   `J(x) = x` and the range is [5, 7]; if it is `i+1` then `J(x) = x+1` and the range is [6, 8]; the
   result should be expressed as `J([5,7])` and then intersected with whatever `clamp`'s declared
   parameter range allows.
   Confidence: 2

2. The reasoning confuses "computed once" with "constant". A summary is not a value but a function
   (or relation) from a callee's input facts to its output facts, so it remains true for every
   caller; when callers change, you re-apply the summary at the new call sites rather than recompute
   it. It only becomes stale when the callee's own body changes, which invalidates the summary
   independently of who calls it. The claim would be correct only if summaries were stored as
   caller-specific constants, which is exactly what a summary is designed to avoid.
   Confidence: 4

3. Plain SSA merges both outcomes into a single `φ` value, so the edge condition `i < n` is no
   longer attached to the name: a range analysis sees one value with the join of the two branch
   ranges, and the refinement "here `i < n` held" is lost. Extended forms (gated/pi-SSA, SSI) give
   the value a distinct name per outcome, carrying the predicate with it, so `i` on the true edge is
   named separately from `i` on the false edge. That lets the analysis keep `[lo, n-1]` on one edge
   and `[n, hi]` on the other instead of falling back to a single weaker interval.
   Confidence: 4

4. Iteration is required wherever the dependency graph has cycles, which in practice means loop
   headers and anything mutually recursive (fixpoint iteration until the facts stop changing). It is
   never required in acyclic regions: straight-line code, branches, and a call DAG whose callees'
   summaries are already available can be solved in one pass in topological (dependency) order. So
   the rule of thumb is "iterate only over back edges"; everything else is a single ordered sweep.
   Confidence: 3

5. Local checking means each construct is judged using only facts available at that point — the
   declarations in scope, the callee's own declared or summarised interface, the current inferred
   range — with no whole-program search, no global constraint solving, and no inlining required.
   For a compiler on a handheld this means compile time and memory scale with the current function
   rather than the whole program, so compilation stays interactive and predictable. It also means
   error messages point at the local expression, and separately compiled units can be checked
   without re-reading everything.
   Confidence: 4

6. The type information itself supplies what an optimizer would otherwise have to rediscover: that a
   variable is a number rather than a tagged value, that an operator is the monomorphic integer or
   float version, that a field access is at a fixed offset, and that a call target is static. With
   that, even naive code generation emits unboxed arithmetic and direct calls, avoiding the tag
   checks, dynamic dispatch and property lookups that dominate an interpreter's inner loop. So the
   speedup comes from representation and dispatch decisions made from annotations, not from
   instruction-level optimisation.
   Confidence: 3

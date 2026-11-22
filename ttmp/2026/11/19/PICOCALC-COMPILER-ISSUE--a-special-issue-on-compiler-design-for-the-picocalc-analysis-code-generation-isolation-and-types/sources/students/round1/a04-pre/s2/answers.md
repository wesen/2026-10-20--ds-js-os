# Answers — "4. Making Inference Affordable, or Avoiding It"

Note: I was given only the questions, not the article. Answers below are reasoned from general
knowledge of range/type analysis and compiling for small devices, except where I say explicitly
that the article's specifics are unknowable to me.

## 1

I cannot know this without the article: the body of `nextIndex` and the exact form of a "jump
function" in section 4.1 are not available to me. Taking the name at face value, the likely body is
something like `return clamp(i + 1, 0, n - 1)`, in which case the jump function for `clamp`'s first
argument is J(x) = [x + 1, x + 1], i.e. a shift by one, and applying it to `i ∈ [5, 7]` yields the
argument range `[6, 8]`. If `clamp` is summarised as "the result lies in [lo, hi] and in the range of
its first argument", the result range is then `[6, 8] ∩ [0, n - 1]`, which is `[6, min(8, n - 1)]`
when that interval is non-empty and degenerates to the single value `n - 1` when `n - 1 < 6`.

Confidence: 2

## 2

The error is a category mistake about what a summary is about. A summary is a statement about a
*function body*, phrased as a function of that body's inputs ("for argument ranges Ā, the result lies
in S(Ā)"); it says nothing about the current set of call sites, so callers changing does not falsify
it. When a caller changes, the input range at that call site changes, and you simply re-apply the same
summary to the new argument ranges. Recomputing is forced by changes to the *callee* (and to the
functions it calls), not by changes to its callers — which is exactly why summaries are cheap: they
are per-definition facts, computed once per revision of the definition.

Confidence: 3

## 3

A plain φ-node at a join says "either this version or that version", so the only thing a range
analysis can conclude is the *union* (join) of the two incoming ranges; the predicate `i < n` that
selected the branch is not recorded anywhere in the names, so the fact `i < n` is dropped on the
true edge. What is lost is the correlation between the value and the path taken to reach it. Extended
SSA forms recover it by renaming on the *edge*: σ-nodes (also called π-nodes / predicate nodes, as in
Ananian's e-SSA, HSSA, or "predicated SSA") give the tested value a fresh name on each outgoing edge
of a test, so the true-edge version can be defined as "the old `i`, further constrained by `i < n`",
and the join then merges the two distinct names. The condition becomes part of the numbering, so a
range analysis reads it as a defining fact rather than having to re-derive control-flow dominance.

Confidence: 4

## 4

Iteration is needed exactly where the dependency graph of summaries has cycles — loop headers, i.e.
back edges and the φ/join nodes they feed, plus anything whose value transitively depends on such a
node. That is what a work-list algorithm does: it processes nodes in reverse post-order and re-queues
a node when one of its inputs changes after it was already processed, and this only happens on
backward/cyclic dependencies. It is never required in the acyclic part: straight-line code, and joins
of branches whose inputs are all final, are solved in one topological pass because each definition's
range is computed after, and only from, the ranges of its already-solved inputs. In short, iteration
is confined to the strongly-connected components of the summary graph, and a guarded SCC (one with a
monotone transfer function and finite height domain) terminates at a fixpoint.

Confidence: 3

## 5

I cannot know this without the article, since "local checking" is the author's term, but the reading
that fits the rest of the questions is: a check of one definition uses only that definition's body
plus the *summaries* of the definitions it calls, never facts about its callers or the rest of the
program, so verification is modular and composable and needs no whole-program pass. Under that
reading two practical consequences for a compiler running on the handheld are: (i) memory — only the
current function's IR and the summaries of the functions in its call cone need to be resident, so
peak RAM is bounded by a function's size rather than by program size, which matters on a
microcontroller-class device; (ii) time and incrementality — the cost of checking or recompiling one
function is proportional to that function, so edits stay interactive and diagnostics are localised to
the function being checked. (A weaker alternative reading — "checks run on the device rather than
off-loaded to a build server" — would give the same two benefits of no network dependence and
predictable, small working sets.)

Confidence: 2

## 6

Static TypeScript is a deliberately restricted, fully statically typed subset: every value's type is
written down and checked up front, there is no `any`, no `eval`, no prototype mutation, no dynamic
property access, and classes are closed. So the facts an optimising compiler would normally have to
*discover* — the concrete type of every value, the exact field layout and offsets of every object, the
absence of polymorphic call targets, the absence of aliasing surprises, and the fact that numbers can
be unboxed into fixed-width integer storage — are supplied by the source program and its type
annotations. The peephole pass therefore does not need type inference, devirtualisation, escape
analysis or representation selection; it only has to lower a well-understood, already-disambiguated
IR into the target's instructions. That is the article's "avoiding inference" thesis: pay for the
information once, in the source language and its type checker, instead of deriving it in the compiler.

Confidence: 3

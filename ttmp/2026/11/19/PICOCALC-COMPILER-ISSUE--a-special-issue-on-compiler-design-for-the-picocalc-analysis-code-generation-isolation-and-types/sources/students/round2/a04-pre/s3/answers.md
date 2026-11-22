# Answers

1. I cannot know this without the article: I have not been shown the body of `nextIndex`, so I do not
   know what expression is passed as `clamp`'s first argument or what the other arguments are. If
   (as is usual for a "next index" helper) the body is `clamp(i + 1, 0, n - 1)`, then the jump
   function for the first argument is the affine map `J(X) = X + 1`, and applied to the incoming
   range `[5, 7]` it yields `[6, 8]`; the later `clamp` then only shrinks that range further, and
   only if the bounds in the second and third arguments are themselves known. If instead the first
   argument were the bare `i`, the jump function would be the identity and the range would stay
   `[5, 7]`. Either way the shape of the answer is fixed: read the expression, read off how it maps
   an input range to an output range (a scale and an offset for arithmetic, plus the known ranges of
   any operands), then push `[5, 7]` through it.
   Confidence: 2

2. The reasoning confuses "the summary is wrong" with "the summary is finished". A useful summary is
   not a single answer about one call; it is a parameterized transfer function — "given an argument
   range in this set, the result lies in that set, and these are the effects" — so a caller who
   passes a different range re-applies the same summary instead of invalidating it. What actually
   invalidates a cached summary is a change to the *code* of the summary's own function (or to
   something it depends on, such as a mutable global or a dynamically resolved callee), not a change
   to the caller. So summaries must be cached keyed on function identity/version and on argument
   facts, never on "who called me and with what". The real cost of a caller changing is just that a
   new argument range may be a cache miss needing recomputation, which is a performance matter, not
   a correctness one.
   Confidence: 4

3. Plain SSA only guarantees that two definitions of a variable get distinct names; when both
   branches of `i < n` carry the *same* definition of `i`, the merge needs no phi node and the value
   after the test is named identically to the value before it. That loses information because the
   analysis can no longer tell which path a use came down, so at the join it must take the union of
   the facts from both sides and the guard's refinement (on the true side `i < n`, on the false side
   `i >= n`) is thrown away. Extended forms repair this by making the path condition part of the
   value's name: gated SSA (GSA) or phi functions annotated with predicates, sigma/pi nodes as in
   SSI, or range-annotated variables, so an analysis can ask "on which branch was this definition
   reached, and what did the test imply there". The point is that path-sensitivity becomes something
   you can *look up* along a name instead of something you must re-derive by re-walking the program.
   Confidence: 4

4. I cannot know this without the article — the split of the 11,760 visits is a measurement only the
   author has. The reasoning that fixes the answer for sure: a visit can also terminate at a cached
   or already-computed summary, be rejected as unanalyzable, or be a recursive/re-entrant visit that
   is cut off, so the count of visits says nothing by itself about how much inference was done. What
   matters is the number of visits that actually had to analyze a body from scratch, because those
   are the only visits a summary could have replaced — the rest were already cheap. So I would
   expect the body-analyzing count to be much smaller than 11,760, and the saving available from
   summaries to be bounded by that smaller number.
   Confidence: 2

5. Local checking means each function is checked once, on its own, against summaries of the
   functions it calls rather than against their bodies — the analysis is local to a function and the
   only thing crossing a call boundary is a summary, so no whole-program fixpoint has to be run and
   no caller's context is threaded into a callee. Two consequences for a compiler running on the
   handheld: (a) compile time per function is bounded and predictable, so you can compile lazily,
   function-at-a-time, as code is first needed, and cache results across sessions; (b) precision is
   capped — anything a caller knows is invisible inside the callee and vice versa, so at every call
   boundary you must fall back to conservative assumptions (unknown argument ranges, unknown effects),
   which is exactly why the cost of *summaries* and the cost of *not inferring* both come up.
   Confidence: 3

6. I cannot know this without the article which existing CJI feature section 4.3 has in mind, but the
   argument has a forced shape: one remedy is to infer better summaries, the other is to stop
   inferring by having the programmer (or the tool) state the facts outright, and the two "meet"
   when the stated facts are stored in the same place the inferred facts would be and consumed by the
   same checker. So the existing feature is almost certainly some declaration CJI already accepts and
   already ignores-as-a-hint — most plausibly optional parameter and return type annotations, or an
   effect/purity annotation on functions — which today is optional and only used loosely. For the meet
   to actually happen those annotations would have to become mandatory for the checked subset, so
   that every function has a summary without any inference being run, and the analyzer's job shrinks
   to checking each body locally against the declared summaries.
   Confidence: 2

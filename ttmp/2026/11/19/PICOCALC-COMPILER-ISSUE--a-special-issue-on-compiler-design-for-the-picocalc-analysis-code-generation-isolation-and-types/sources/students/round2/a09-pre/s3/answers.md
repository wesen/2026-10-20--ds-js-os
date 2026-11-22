# Answers to the questions for "9. Types That Pay for Themselves"

Note: I have not been given the article. Some questions ask for specific facts from it
(named sections, named loop, named rules); where I cannot know those I say so and give the
best reasoning I can about what the answer would have to look like.

## 1. Bare integers in the typed sources (section 9.2)

I cannot know this without the article: I have not seen section 9.2 or the typed sources, so
I cannot name the three places the author names. What I can reason out is the shape of the
answer: they will be small numeric fields whose values are drawn from a short closed set and
whose meaning is documented only by a comment, e.g. an alignment/mode field (0 = left,
1 = center, 2 = right), a direction or axis field (up/down/left/right), or a kind tag on a
token or diagnostic. The visible change from introducing an enumeration is not in the layout
but in the generated code: a named enum/tagged type appears in the generated declarations and
in function signatures where a plain integer used to be, and switches over the value become
checkable for exhaustiveness instead of silently accepting an out-of-range integer at
runtime. Whether the representation or only the types change depends on how the compiler
lowers enums, which is exactly what the section is likely arguing about.

Confidence: 2

## 2. The four coordinate systems and the mistake tests miss (section 9.3)

I cannot know this without the article which four systems it lists, but the standard set for
an editor is: (1) a flat offset into the document buffer (a byte or element index), (2) a
logical line/column pair counted in characters, (3) a visual cell column on screen after tab
expansion and wide/combining character widths, and (4) pixel coordinates inside the window or
framebuffer. The characteristic mistake that tests miss is that all four coincide on short,
single-line, ASCII-only test text, so a bug that confuses two of them—a byte offset used as a
cell column, a 0-based and a 1-based index compared, or a position at the end of a line or in
the middle of a multi-byte character—never fires in the test suite. The section's point is
presumably that the coordinate systems need to be distinct types so the mix-up cannot be
written at all, and that the tests that do exist only cover the degenerate case where the
distinction is invisible.

Confidence: 2

## 3. The loop of section 9.4

I cannot know the specific loop, its fact, or its events without the article. The pattern
being described is a flow-sensitive fact that the compiler establishes once and then tracks
within a single pass of the loop body—something like "this length/index pair has not changed
since it was checked", or "this pointer into the buffer is still valid"—with a short list of
events that invalidate it: a call to code the compiler cannot see into, any write that might
alias the thing the fact is about, and any operation that can move or reallocate it (an
allocation that can collect, or a suspension/yield point). The reason nothing has to be
carried across iterations is that the fact is re-derived at the top of the body from values
that are recomputed there: the analysis is per-iteration and scoped to the body, so the
compiler never needs a loop invariant or a fixpoint over the back edge. That is the design
bet—give up cross-iteration facts and in exchange get an analysis that is cheap, local, and
has no interesting edge cases.

Confidence: 3

## 4. Signed test vs. unsigned index (section 9.5)

A comparison `at < text.length` is true for negative `at`, so on its own it rules out only
the upper overrun: the lower-bound check is still needed because a signed index can be any
negative number, and `text[-1]` style arithmetic is exactly how the classic off-by-one and
`length - 1` on an empty buffer bugs happen. An unsigned index type fixes this by making the
invariant part of the value domain rather than of the control flow: every value of an unsigned
index type is non-negative, so `at < text.length` alone implies `0 <= at < length` and the
lower-bound half of the check is vacuous. The check does not vanish, it moves—it becomes a
single checked conversion at the boundary where a signed computed value becomes an unsigned
index, which is one place that can be proved once rather than a branch inside the inner loop.

Confidence: 3

## 5. Rules for a per-turn arena (section 9.6)

I cannot know the two rules as the author states them, but any per-turn arena that is freed
wholesale needs the same two properties. First, no reference may point from longer-lived
memory into the arena—nothing allocated in the arena may be stored in the persistent heap, so
the arena region is only ever referenced by things that die with it. Second, nothing in the
arena may need finalization or have a destructor effect: the region is reclaimed by resetting
a pointer, not by running per-object cleanup, so any object holding an external resource must
not live there. Data that has to outlive the turn must be copied (or explicitly promoted) out
into longer-lived storage before the turn ends; the copy is the point where the compiler or
the programmer pays for the safety.

Confidence: 3

## 6. A linear `Grant` through an `if` (section 9.7)

At the end of each branch the grant must have been used exactly once: either it was consumed
(handed to whatever consumes it, which moves it and leaves the binding unusable), or it was
moved out of the branch—returned, or assigned to a binding that is live after the `if`. A
branch that falls through with the grant still owned and unused is an error, and so is a
branch that uses it twice; the two branches do not have to agree on what they did with it, but
they must agree on the *type* of the resulting state, so that whatever follows the `if` sees
the same thing no matter which branch ran (both grant-free, or both holding one live grant).
Whether the two branches may dispose of it in different ways depends on whether "dispose"
means "consume here" versus "return it": mixing those two is exactly the pattern that makes
the join ill-typed unless the language has sum types over the residual linear obligation, so
the safe expectation is that both branches must reach the same residual state—and it is
cheapest to read the article's rule as "each branch must consume it, or each must give it
back".

Confidence: 3

# Answers — "9. Types That Pay for Themselves"

I have not been given the article, so most answers below are reconstructions from the question wording
and from general knowledge of editors, compilers and type systems. I flag guesses where they are guesses.

## 1

I cannot know this without the article. The question tells me the article lists three places, so what I
can say is what a plausible list looks like and what the change would buy. Likely candidates in a text
editor's typed core: a "direction" or "movement" code (left/right/up/down passed as 0..3), a "mode"
integer (insert/select/replace), and a "kind" tag in an edit or undo record (insert / delete / replace).
Replacing a bare integer by an enumeration changes the generated code in a downstream, mechanical way:
the numeric literals disappear from call sites, names appear instead, and the compiler can reject a
"mode" where a "kind" was expected. If the enumerations are dense and the toolchain is C-like it may
also be able to warn on non-exhaustive `switch`, and the representation stays an integer so nothing
changes at runtime. Confidence: 2

## 2

I cannot know this without the article which four coordinate systems it names, but the shape is
predictable from any editor with a text grid and a scrollable, soft-wrapped view. The four would be
something like: byte offset into the buffer; "logical" document position as line and column (in
characters); the rendered/visual position after soft-wrap and tab expansion (visual line, visual
column); and screen or pixel coordinates inside the widget (cells plus scroll offset, or pixels
including a font metric). The mistake tests tend to miss is exactly the pair that looks interchangeable
at the origin: column-as-character-index versus column-as-byte-offset, or visual-line versus document
line. In an ASCII-only, non-wrapped, unscrolled document all four collapse to the same numbers, so a
test that only types plain ASCII at column zero passes even if every conversion is a silent identity.
The bug only appears with tabs, wide/combining characters or a wrapped line, which are precisely the
cases the test corpus omits. Confidence: 3

## 3

I cannot know the exact fact, but section numbers and the question's shape point to an invariant that
the compiler can prove from syntax alone and that a `loop` with an `if`/`break` body cannot disturb.
The fact is almost certainly a bounds-relation on the index — that it stays `<= length` or that a
pointer stays inside the buffer — recorded as a predicate in the type/effect environment at the loop
head. The three kinds of event that discard it are the three ways the invariant can be invalidated:
a write through an alias that could change the length (assigning to the buffer, or a call the compiler
cannot see into), a diagnostic side channel the callee may use (the question's own wording mentions a
diagnostic callback, which can re-enter and mutate the buffer), and an escape of the index or of a
pointer derived from it (storing it, or returning it, so a later use is not the one proved). Because
the invariant is re-derived at the loop head from the state left at the end of the previous iteration,
and because those three events are the only ways that state can differ from what was proved, nothing
has to be carried across iterations as a remembered witness — the fact is a property of the program
text at that point, not of a run. Confidence: 2

## 4

A signed test `at < text.length` only rules out the high end. If `at` is a signed integer it may still
be negative, and `array[-1]` (or the equivalent pointer arithmetic) is a real read or write outside the
buffer; the compiler therefore needs the lower-bound half of the check, and the whole check cannot go.
An unsigned index type removes that half by construction: a negative value is not representable, so
`at < length` is sufficient, the value is in `0..length-1`, and the check collapses to a single
comparison — or disappears entirely when the relation was already established by the loop guard. This
is the classic "types pay for themselves" trade: a representation choice deletes a branch and a class
of bug at once. Confidence: 4

## 5

I cannot know the article's exact wording, but a per-turn arena is safe under two rules that I would
expect to be: (a) nothing allocated in the arena may escape the turn — no pointer or reference into it
may be stored anywhere that outlives the turn, which a lifetime/region type enforces by tying the
allocation's type to a turn-scoped region; and (b) the arena is reset only at a point where no live
value refers to it, i.e. reset is an operation that consumes or invalidates the arena token so the
type checker refuses to reset while borrows are live. Data that must outlive the turn has to be moved
into an explicitly longer-lived region — copied into a persistent/heap store or returned as an owned
value whose type is not tagged with the turn region — rather than merely referenced. The benefit is
that the whole arena becomes a pointer-bump free list with no per-object deallocation and no reference
counting, and the safety argument is discharged once, statically, instead of per allocation.
Confidence: 3

## 6

A linear `Grant` must be used exactly once, so at the end of each branch the grant must be consumed
exactly once — re-obtained (the question's word suggests "renew") or explicitly released — and never
merely dropped or duplicated. Both branches must therefore leave the linear variable dead, and no path
may fall off the end while the value is still live. The two branches may absolutely dispose of it in
different ways: linearity constrains usage, not the shape of use, so one branch can renew and the other
can revoke/release, provided each does exactly one thing. What is forbidden is a branch that neither
consumes nor releases, a branch that uses it twice, or an `if` without an `else` where the missing path
leaves it live — which is why linear-type checkers typically report "value not consumed on this path"
with a path condition rather than a single error. Confidence: 4

# Answers to 9.12 Check your understanding

## 1. New enumeration value, examined in six places

Exhaustive matching turns the addition into a compile-time obligation: the compiler checks each
`match` against the full set of names (§9.2 says that for enumerations without nested data the
check is "a comparison of two sets") and reports every `match` that omits the new name. So the six
places become a list of errors the compiler hands you, instead of six places you have to remember.
That is valuable because it converts a missed case, which today silently falls through to whatever
the old integer meant, into a failure that cannot be shipped. It also makes the cases you do write
meaningful: `NotFound` and `Found` can no longer be confused with the phase numbers.

Confidence: 5

## 2. `Unit` and `Point` as distinct types

Declaring them distinct prevents a value of one coordinate system being passed where the other is
expected — a code-point column handed to a function that wants a UTF-16 offset — which §9.3 notes
compiles fine today and is wrong only for text with characters outside the basic plane. Working:
the article's own example `a🙂b` is 6 bytes, 4 UTF-16 code units and 3 code points, so the
resulting wrongness is a silent off-by-one that ordinary ASCII tests never show. Both types keep a
`i32` representation, so the generated code and its size are unchanged. The only cost is one extra
rule in the checker, plus explicit conversion functions like the code-point-to-code-unit mapping the
reactor already has.

Confidence: 5

## 3. The fact in the §9.4 loop

The compiler records that the guard `at < text.length` held when it entered the loop body, i.e. the
upper bound needed by `text.charCodeAt(at)`. It becomes invalid if `at` or `text` is assigned, or if
a call is made that could change the length. It does not have to survive the loop's back-edge
because the loop condition is re-evaluated on every iteration and re-establishes the same fact
before the body runs again; the fact is proved fresh each time rather than carried around the cycle.
That is why a one-pass checker with a table of facts, cleared at assignments and calls, suffices and
no dataflow fixpoint is needed. Note this covers only the upper bound.

Confidence: 4

## 4. Why a signed guard is not enough

The existing bounds check is one comparison performed as unsigned, and unsigned comparison rejects
negative indices as a side effect. Working: with `text.length = 10` and `at = -1`, the signed test
`-1 < 10` is true, so the guard passes; reinterpreted unsigned, `-1` is 0xFFFFFFFF and
`0xFFFFFFFF <u 10` is false, so the old check would still have trapped. A signed guard therefore
proves only the upper bound, and removing the whole check on its strength would let a negative index
through. An unsigned index type fixes this by making the value itself unable to be negative: for a
variable of that type the guard `at < text.length` is an unsigned comparison, which implies both
`at >= 0` and `at < length`, so the single signless check is discharged entirely. The article notes
the unsigned type is the "clean solution" and leaves the messy alternative — a separate signed lower
bound — out.

Confidence: 4

## 5. The two arena rules and data that outlives the turn

The two rules both come from the arena being reset wholesale when the handler returns: a reference
into the turn arena may not be stored in the state record, and a reference into the turn arena may
not be live across a wait. The first protects data that must survive into later turns from being
silently invalidated; the second is the rule Article 8 already imposes on buffers, restated for
arena references. Both are local checks, which is what lets the design keep the §9.1 criterion.
Data that must outlive the turn has to be copied into storage the application owns for its whole
life — that is the second region, the life-of-application one. Growth beyond a bounded capacity then
has three designs (§9.5 table), and the article recommends fixed capacity as the default for a
768 KiB world.

Confidence: 5

## 6. A linear `Grant` across an `if`

Both branches must consume the grant exactly once, so after the `if` the set of handles still held
is the same on both paths — the article compresses this into "after an `if`, both branches must have
consumed the same handles". Working: a branch ending in `revoke(g)` holds nothing, and a branch
ending in `send(g, editor)` also holds nothing, so both agree and the function is accepted; a branch
that simply returns without touching `g` has forgotten it, and that path is a compile error. Each
consuming operation must be one of the three the article names: revoking, sending to another world,
or storing in the state. If a branch consumes it and the other keeps it in the state, the two
branches disagree and the checker rejects the function, because the handle is held on one path only.

Confidence: 4

# Answers — "9. Types That Pay for Themselves"

*(Written before seeing the article. Only `TASK.md`, `quiz.md` and `diary-format.md` were available.
Answers are reasoned from general knowledge of compiler and type-system design; where a question
depends on the article's specific code or numbering, I say so.)*

## 1. New value added to an enumeration examined in six places

Exhaustive matching (a `match`/`switch` with no wildcard/default arm) forces the compiler to know
the full constructor set, so adding a seventh case makes each of the six sites that fail to mention
it a compile error, and the diagnostic names the missing case. That is valuable because the omission
is found at build time with a list of exact locations, instead of at run time as a silent fall-through
into a default arm that does something plausible but wrong. It also flips the cost of extending a
type: the type becomes cheap to grow, because the compiler hands you the work list. Without
exhaustiveness, the same edit looks free and the bug ships.

Confidence: 4

## 2. `Unit` and `Point` as distinct types over 32-bit integers

Declaring them distinct (nominal) types prevents passing a `Unit` where a `Point` is expected, or
adding two values of different units, or a `Point` slipping into a parameter that means pixels — the
checker rejects it and any mixing must be an explicit conversion. The run-time cost is nothing:
both are erased to the same 32-bit integer representation, so the check exists only during type
checking and no tag, boxing or wrapper survives into generated code. The real cost is at the source
level, where conversions have to be written out at the boundaries.

Confidence: 4

## 3. The fact recorded in the loop of section 9.4

I cannot know this without the article: I do not know which fact section 9.4 records, whether it is
a range/bounds fact about an index, a length-invariance fact about a buffer, or a nullness fact.
The shape of the answer must be: a fact is established by a dominating check (or by an assignment
whose right-hand side the compiler can bound), it is used inside the region the check dominates,
and it becomes invalid at the first point that can break it — typically a call that may mutate the
object, or a store through an alias. It does not need to survive the back-edge because the fact is
only consumed within one straight-line region of the body and is re-established on each iteration
by the check that dominates its uses; at the loop head the compiler merges incoming paths and simply
drops any fact it cannot prove holds on every path, re-deriving it on entry to the body rather than
carrying it around the loop.

Confidence: 1

## 4. Why `at < text.length` (signed) does not license dropping the whole bounds check

A signed comparison only proves "below the top". For a signed `at`, the predicate is also true for
negative values, and a negative index reads memory before the start of the buffer (or indexes a
negative-offset row in the flat string representation), so the compiler must still emit `at >= 0` —
the check stays, it is merely halved. If the index type is unsigned, `at < length` alone implies
`at >= 0`, because an unsigned value has no negatives; one unsigned compare discharges both
sub-goals of the bounds check, so the whole check can go with a single test and no extra
sign correction. The unsigned type does the work at the type level that a second run-time branch
would otherwise have to do.

Confidence: 4

## 5. The two rules that make a per-turn arena safe

The two rules I would expect to be stated are: (1) allocation inside the turn only — every object
placed in the arena is created during the turn and is reachable only from roots that die with the
turn — and (2) wholesale reset at the turn boundary, with no individual `free`, no finalizers and no
search for live objects, so reclamation is a single pointer move. A program that needs data to
outlive the turn must not point into the arena at all: it has to copy the bytes into a longer-lived
region (a persistent heap or an explicit long-lived store) before the turn ends. In effect the
escape rule is the load-bearing one, because the reset is only safe if nothing outside the turn
still references arena memory.

Confidence: 3

## 6. A linear `Grant` split across an `if`

For the function to be accepted, every path through the `if` must use the `Grant` exactly once:
neither branch may drop it, forget it, or consume it twice, and the joined continuation may not
mention it again. Both branches must therefore end in the same linearity state — typically each
closes by passing the grant to whatever consumes it, or by returning it — so the join point sees a
single "already consumed" state on both arms. If one arm consumed it and the other did not, the
function would be rejected: linearity is a property that has to hold on all paths, not on the one
path the programmer had in mind.

Confidence: 4

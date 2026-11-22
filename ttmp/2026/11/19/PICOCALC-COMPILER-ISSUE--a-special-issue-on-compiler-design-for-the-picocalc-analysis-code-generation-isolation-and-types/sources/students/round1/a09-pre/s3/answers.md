# Answers — "9. Types That Pay for Themselves"

I have not seen the article. These answers come from general knowledge of compilers and type
systems, plus reasoning about what a chapter with this title would have to say.

## 1. Adding a value to an enumeration examined in six places

**Answer.** With exhaustive matching the compiler treats the enumeration's case set as closed, so
adding a new value turns every one of the six `match`/`switch` sites into a compile error until
each is handled (or an explicit default/`else` arm says "I intend to ignore future cases"). The
value is that the set of places that must change is discovered by the compiler rather than by a
test suite or a crash in the field, so the cost of the change is paid once at compile time instead
of at every runtime path that forgot the new case. It also documents intent: a site with no
default arm asserts "these are all the cases there are." The catch is that exhaustiveness only
helps if wildcards are used sparingly; one careless `_ ->` in the six places silently restores the
old instanceof-style behaviour for that site.

Confidence: 4

## 2. `Unit` and `Point` both 32-bit integers, declared as distinct types

**Answer.** Declaring them as distinct nominal types prevents mixing a unit count with a
coordinate — passing a `Unit` where a `Point` is expected, adding them, comparing them, storing one
in a field of the other's type — which are exactly the errors a units mix-up produces silently in a
language where both are just `i32`. In a language with implicit conversions or structural typing
this is weaker; the article is presumably arguing for a nominal (or at least non-coercing) newtype.
At run time it costs nothing at all if the compiler erases the distinction: same size, same
alignment, same representation, no tag, no boxing, no wrapper allocation. The usual accompanying
cost is programmer ergonomics — you need an unwrap/`as` or constructor to get at the raw number,
and that verbosity is the price of the checking, not a run-time price.

Confidence: 4

## 3. The fact recorded in the loop of section 9.4

**Answer.** I cannot know this without the article — I can only guess what section 9.4 does. The
shape is almost certainly: inside a loop the compiler records a *flow-sensitive fact* proved before
the loop body (for example "`i < len`", or "this pointer is non-null", or "this index is in
bounds"), uses it to delete a check inside the body, and the fact becomes invalid at the point the
loop mutates whatever the fact depended on — or simply at the end of the body, since the loop
condition re-establishes it. It does not have to survive the back-edge because the fact is
re-derived from the loop *header* on each iteration: the condition is tested again at the top, so
the entry state of the body is always the one where the fact is known to hold. That is why the
fact can be re-established cheaply per iteration rather than being carried as an invariant across
the jump back to the loop head.

Confidence: 2

## 4. Why `at < text.length` (signed) does not justify removing the bounds check

**Answer.** A signed comparison proves only the upper bound. If `at` is a signed integer it may be
negative, and every negative index satisfies `at < text.length` while being out of bounds;
worse, in a language where the comparison itself is done in signed arithmetic, a very large
unsigned-looking value could compare as negative and pass too. So the test as written justifies
dropping the `at >= 0` half of the check at most, not the whole check, and only if the compiler can
also see that the length is non-negative and that the comparison's semantics match the indexing
semantics. Making the index type unsigned moves the invariant into the type: every value of the
type is already `>= 0`, so a single unsigned compare `at < len` is now a complete proof of
"in bounds", and the check disappears with no residual case analysis. The trade-off is that
unsigned types reintroduce their own hazard (wraparound on subtraction), which is presumably why
the article is careful about where the range fact comes from.

Confidence: 3

## 5. The two rules that make a per-turn arena safe

**Answer.** I cannot know the exact wording without the article, but the two rules almost certainly
are: (1) allocation in the arena is allowed only within the turn that owns it, and (2) nothing
allocated in the arena may be reachable once the turn ends — no reference may escape the turn, and
the arena is reset (not freed piecemeal) when the turn finishes. Equivalently: the arena's lifetime
is tied to the turn, and any value whose lifetime is tied to it cannot outlive it, which is what
makes bulk reset sound instead of a dangling-pointer generator. A program that has data to keep
after the turn must therefore copy it out — allocate it in a longer-lived region (the persistent
heap, a parent arena, or a caller-provided buffer) — and that copy should be explicit in the
source, since the type system cannot read your mind about which bytes matter. The usual
implementation of the two rules is a lifetime or region parameter on the arena handle plus a
constraint that allocated values carry it.

Confidence: 2

## 6. A function receiving a linear `Grant` and containing a two-branch `if`

**Answer.** Linear (use-exactly-once) discipline means the `Grant` must be consumed exactly once on
every path, so both branches must each use it exactly once — and the branches must not both use it
(the function would then consume it twice on that path, which is fine per-path, but what must hold
is that *every* path consumes it once), nor may one branch use it zero times or twice. In the usual
formulation the obligation is on the continuation: each branch must end with the grant consumed, or
the `if` must itself be the single consumption point (e.g. one branch returns it, the other drops
it via an explicit release). Two further things have to be true: the branches cannot both keep a
copy of it (linear types forbid duplication), and the join point must agree on the resulting state,
which is why a branch that *returns* the grant to be reused and a branch that *consumes* it can
still type-check if the shared continuation expects the appropriate state. Also, if one branch can
exit the function early, that path still owes the use.

Confidence: 3

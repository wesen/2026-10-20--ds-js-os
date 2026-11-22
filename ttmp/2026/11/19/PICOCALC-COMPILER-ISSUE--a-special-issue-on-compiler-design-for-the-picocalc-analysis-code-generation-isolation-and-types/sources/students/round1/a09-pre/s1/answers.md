# Answers — "9. Types That Pay for Themselves"

## 1. A new value is added to an enumeration examined in six places

Exhaustive matching means every `match` on that enum must name every variant, so adding a variant turns each of the six examination sites into a compile-time error until it is updated. The compiler then enumerates the work for you instead of letting the new case silently fall into a default or `else` branch. The value is that the omitted case is found before shipping, and the fix is forced at exactly the places that need thought.

Confidence: 4

## 2. `Unit` and `Point` both represented as 32-bit integers

Declaring them distinct (nominal) types prevents mixing them up: you cannot pass a `Unit` count where a `Point` is expected, add them together, or silently assign one to the other, which catches unit- and meaning-confusion bugs that identical representations hide. The run-time cost is nothing: the representations are the same 32-bit integer, so there is no tag, box, or wrapper left after type checking — the distinction exists only in the compiler.

Confidence: 5

## 3. The fact in section 9.4's loop

I cannot know this without the article, but the shape has to be a fact about the index or the buffer being recorded at a particular point, e.g. "`at` is within `text`'s bounds" or "`text` has not been reallocated," established by a check or call. It becomes invalid at the first operation that could break it: a write or append to `text`, a reassignment of the buffer or its length, or a call that might mutate or reallocate it. It does not need to survive the back-edge because the fact is re-established at the top of each iteration by re-running the check; only the straight-line segment between check and use needs the guarantee.

Confidence: 3

## 4. Signed test `at < text.length`

A signed comparison only rules out being too large; a negative index still satisfies `at < text.length`, and indexing with a negative value is exactly the out-of-bounds case you were trying to exclude — so the lower half of the check must stay. If the index type is unsigned, negative values are unrepresentable, so the single `at < length` test covers the whole valid range and the remaining bounds check becomes redundant. The prerequisite is that the index genuinely cannot be negative anywhere upstream, which is what the type change buys.

Confidence: 5

## 5. Two rules that make a per-turn arena safe

The rules are almost certainly (1) no reference into the arena may escape the turn — nothing allocated in it may be stored in a global, in a longer-lived structure, or returned for later use; and (2) memory is reset only after the last use in the turn, so no live reference is used after the reset (no use-after-free within the turn). I cannot verify the exact wording without the article. A program that needs data to outlive the turn must copy it out — allocate it in a persistent/owned store, or serialize/convert it into a longer-lived form — before the turn ends.

Confidence: 3

## 6. A linear `Grant` and an `if` with two branches

For the function to be accepted, the linear value must be used exactly once on every path: each branch must consume the grant — return it, hand it to something that consumes it, or explicitly discard it — and neither branch may drop it unused or use it twice. In practice this usually means both branches must have the same ownership outcome, so the value's fate after the `if` is well defined. A branch that ignores the grant makes the function ill-typed rather than merely suspicious.

Confidence: 4

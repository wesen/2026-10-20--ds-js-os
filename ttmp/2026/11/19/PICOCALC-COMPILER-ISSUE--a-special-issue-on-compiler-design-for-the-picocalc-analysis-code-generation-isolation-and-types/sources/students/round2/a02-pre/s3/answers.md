# Answers — "2. Measuring Before Optimizing"

## 1

I cannot know this without the article, since I do not have the table in section 2.1. Based on how such tables are usually built, the interval most likely ends at the first visible response from Agenda (the first rendered frame or "app is up" milestone), not at full readiness. After that point the user is still waiting for the device to accept and act on input — a key press or screen tap still has to produce a change — so the number measures "something appeared," not "the machine is usable." That distinction is exactly the kind of thing a measuring chapter would want to make explicit.

Confidence: 2

## 2

I cannot know this without the article, since the two measurements in section 2.2 are not given to me. The arithmetic, however, is fixed: if the total measured path is `T` and the part spent in application code is `A`, the share is `A/T`, and the largest possible speedup from making application code free is `T/(T-A)` = `1/(1 - A/T)`. The share is an upper limit because it counts time the application merely *causes* or *waits on* (driver, kernel, display, scheduling) as if it were time the application could remove; faster application code can only drive its own term toward zero and leaves everything else untouched. So the share overstates the real headroom, and no optimization of app code can beat the reciprocal bound.

Confidence: 4 (for the method), 1 (for the numbers)

## 3

I cannot know this without the article, so I cannot name the specific activity or which "world" dominated the 559 ms. The structure of the question implies the boot profile attributes time to named worlds (for example an application world, a runtime/VM world, and a system or kernel world), and that one of them consumed the largest slice — most plausibly the world responsible for initializing the JavaScript runtime and its base objects, since that is usually the largest fixed cost at boot. Whatever the finding was, the change the project made "as a result" would have been to move that work off the critical boot path (make it lazy, precompute it, or drop it entirely) rather than to micro-optimize it.

Confidence: 1

## 4

I cannot know this without the article, so I cannot quote the two numbers. The refutation would have to be of the form "garbage collection cannot be the cost because the heap stayed small and collections were rare or absent": typically a low peak heap figure (well under any pressure threshold) paired with a collection count near zero, or a measured allocation rate far too low to trigger repeated cycles. Two such numbers are enough to kill the hypothesis because GC cost requires both live-data pressure and frequency; with neither present there is nothing to collect and therefore nothing to pay for. If instead the numbers were "GC time was X% of total," that would support rather than refute the hypothesis, so the pair must be pressure-and-frequency figures.

Confidence: 1

## 5

I cannot know this without the article. The natural check is a cross-validation: the script's counts are compared against a value the author can establish independently — a hand count of tokens in a small file, a second counting method, or a total that a known artifact already publishes — and the script reproduces that value exactly. What such a check does not establish is that the script's notion of a "token" matches the compiler's: it can count the same stream consistently and still disagree with the actual lexer about operators, literals, or comments, and it says nothing about whether the sampled code is representative of real programs. Consistency is verified; correctness of the model and generality are not.

Confidence: 2

## 6

I cannot know this without the article, so I cannot state the two values. The phrasing "two per-token costs for the typed compiler on the device" implies two different denominators or two different scopes, most likely a cost per token for the front end alone (lexing/parsing) and a cost per token for the full pipeline including type checking and code generation, so that the second is larger and their difference attributes cost to the later phases. Alternatively they could be per-token costs under two conditions, such as warm and cold, or with and without type annotations. In either case, "what each one measures" is the key content: the numbers are only meaningful with the scope and the measurement conditions stated alongside them.

Confidence: 1

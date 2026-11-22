# Answers

## 1. Table-order mismatch after an edit

If the reactor-function table and the trampoline table are independently maintained lists keyed by position, then inserting, deleting, or reordering an entry in one leaves the other stale, and every later entry silently dispatches to the wrong function. That produces wrong results or crashes with no diagnostic, since the indexes are still numerically valid. The proposed interface description would make order non-load-bearing, most plausibly by naming each function with a stable key so both tables are generated from one declaration rather than being hand-synchronised. The article's exact mechanism I cannot know without the article.
Confidence: 3

## 2. Steps of a screen update that exist only because application and compositor exchange text

I cannot know this without the article, but the shape is predictable: the application formats a draw request into characters, the compositor parses those characters back into fields, then validates and re-dispatches them to the real drawing primitive. Each of those text-round-trip stages — serialise, parse, re-validate — exists only to cross the boundary. Removing text exchange would leave just "compute the geometry, call the primitive, mark the region dirty."
Confidence: 2

## 3. Why stripping type annotations is not enough

Because annotation removal only erases syntax, whereas several type constructs are also runtime semantics that must be replaced with executable code. Two examples: `enum` must become a real object with member values (and reverse mapping if numeric); and a `private`/parameter-property class field or `implements`-style nominal guarantee requires emitted constructor assignments and runtime checks. Other candidates are `namespace` (needs an IIFE wrapper object) and non-null assertions or `satisfies` (which need nothing at runtime, but the declaration/import elision rules do). So the emitter must add constructs, not just delete characters.
Confidence: 3

## 4. What a JavaScript emitter from the same source can and cannot detect

It can detect semantic differences that depend only on the program's own observable behaviour: a reference emitter running the same source in a JS engine lets you diff outputs and so catches codegen bugs in the target, wrong arithmetic, wrong control-flow lowering, and divergence between the two backends. It cannot detect anything where the target's contract differs from JS by design — target-specific memory layout, hardware/register behaviour, calling conventions, integer overflow wrapping, or timing — because the JS side has no equivalent to compare against. So it is a differential oracle for shared semantics, not a proof of target correctness.
Confidence: 3

## 5. Why `await` comes before porting applications

Porting the remaining applications is expensive and would bake in a callback-based or blocking style that `await` is meant to replace. If `await` lands first, each port is done once against the final async model instead of being rewritten afterwards. Doing it the other way round multiplies rework across every ported application; I cannot know the article's exact stated reason.
Confidence: 3

## 6. A prediction from 10.7, a refuting observation, and the fallback

I cannot know the article's specific predictions, so I'll reason about the shape of a good answer. A typical prediction would be something like "with the interface description in place, table-sync bugs stop appearing," and a refuting observation would be a table-order or dispatch mismatch recurring after the change. The plan's expected response to a refuted prediction is to revisit the premise (the description is incomplete or the ordering assumption was wrong) rather than patch the symptom, and to record the failure before redesigning. Without the article I cannot name the actual prediction or the actual stated contingency.
Confidence: 1

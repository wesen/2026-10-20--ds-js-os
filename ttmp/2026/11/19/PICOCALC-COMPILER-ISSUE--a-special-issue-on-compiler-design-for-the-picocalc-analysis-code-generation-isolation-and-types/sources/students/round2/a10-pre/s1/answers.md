# Answers

1. I cannot know this without the article, but I can reason about what such a check can and cannot do. A header that stores the number of reactor functions, checked by the linker, catches a *count* mismatch: a function added, removed, or duplicated on one side of the build so that the header disagrees with the emitted table (and, by extension, catches an off-by-one in a hand-maintained dispatch table). It necessarily misses any change that keeps the count identical — a changed signature, changed argument order, changed return type, or two functions swapped in the table — and it says nothing about the *bodies*. An interface description removes both only if it is the single source from which the header, the dispatch table, and the per-function stubs are generated, so that count, order and types are derived rather than written twice; then a signature change regenerates the table and the count together, leaving no second copy to drift.

Confidence: 3

2. I cannot know the article's exact five steps, but the structure is inferable. The three that exist only because the two sides exchange *text* would be: formatting cell content and attributes into a byte/character stream, transmitting (and framing) that stream, and parsing it back into cells/attributes on the other side — plus, in most designs, the re-layout or cursor addressing needed to interpret the text. The two that survive a binary protocol are the ones that are inherent to any remote display: deciding *what* changed on the producing side (dirty-region or state comparison) and actually writing the changed pixels/cells on the consuming side. Those are work, not encoding, so no change of wire format removes them; only a change of where the framebuffer lives would.

Confidence: 3

3. Deleting annotations removes the information a checker uses, but adds nothing to the engine: JavaScript performs no static typing and dispatches dynamically, so the *runtime behaviour* the static types promised must be produced explicitly. Two concrete cases: (a) fixed-width integer arithmetic — typed code expects wrapping/truncating semantics, so you must insert coercions (`|0`, `>>>0`, `Math.imul`) at every arithmetic site and at every assignment to an integer-typed location; (b) structs/value types with by-value copy semantics and a fixed field layout — JavaScript objects are references, so you must emit explicit copies at assignment/argument passing (or materialise them into flat arrays with computed offsets). Overloading and generic specialisation, which are resolved at compile time, likewise need name mangling or monomorphisation rather than erasure.

Confidence: 4

4. A JavaScript emitter derived from the same source is a differential oracle: it detects *divergence between two implementations of the same intermediate representation* — wrong field offsets, wrong arithmetic, a mis-ordered reactor table, a copy that should have been made, an off-by-one in a loop or in string indexing. It cannot detect an error that both back ends share because it originates upstream: a misreading of the source language's semantics in the front end, an incorrect canonicalisation in the IR, or an assumption about the target (pixel format, word size, memory limits, timing) that the JS emitter simply does not model. It also cannot detect resource failures — memory or speed budgets — since JavaScript has effectively unbounded memory and no such real-time constraints.

Confidence: 4

5. I cannot know the section 10.1 figures, so I cannot quote them. The reasoning the roadmap is almost certainly following: the figures give a cost budget — how many applications remain, and how much of their code uses async constructs (timers, key/network waits) — so `await` is a prerequisite for the *majority* of the remaining ports rather than for a few. Doing it first avoids porting applications twice (once with callback-style workarounds, once with `await`), and its cost is one runtime feature against N applications; if the figures show the remaining apps are dominated by event-driven code, the leverage is obvious. If instead the figures showed only a small fraction used async, the ordering would be a mistake.

Confidence: 2

6. I cannot know the specific predictions in section 10.7, so I will describe the shape any answer must have. A refutable prediction needs an observable: a measured cost per screen update, a number of protocol message kinds, or a bound on generated code size — refuted by the measurement coming in above the stated number on the real hardware or on the largest ported application. What the plan then says to do is the part I cannot reconstruct: it could be "fall back to the text protocol", "revisit the interface description", or "re-measure before committing". If the plan contains no such fallback, that absence is itself the thing an editor should query, since a prediction without a stated response to refutation is not a plan item.

Confidence: 1

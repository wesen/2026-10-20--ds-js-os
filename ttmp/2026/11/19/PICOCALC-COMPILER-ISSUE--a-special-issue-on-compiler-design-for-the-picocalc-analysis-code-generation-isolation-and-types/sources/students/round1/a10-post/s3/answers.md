# Answers — Article 10, "Architecture and a Roadmap"

## 1. The compiler's table and the trampoline table disagree on order

Native code does not call reactor functions by name. It holds a number: to call function *k* it jumps to the *k*-th entry of `sdk/typed/rv32-slot.S`. If the compiler's table (`compiler/typed-world.js`) and the trampoline file disagree about order, then call number *k* lands in the trampoline of some other function, and the arguments are pushed with types the callee does not expect (section 10.2). The result is a call that runs the wrong function with arguments of the wrong meaning, and the article says explicitly that no check detects it.

Working: the only automated guard mentioned is a count of functions packed into a header word that the linker checks. A count is a single integer, so it catches an **edit that adds or removes a function** (count 28 → 29) but is blind to a **permutation**, which leaves the count at 28. Suppose the table order is `(drawText, fillRect, …)` and the trampolines swap to `(fillRect, drawText, …)`; the count stays 28, the linker passes, and every call to `drawText` executes `fillRect` with a string where a rectangle was expected.

The proposed interface description prevents this because it is the *only* source: one file lists each function's name, parameter types and result type, and a build step generates the compiler's table, the trampolines and the C prototypes from it. Order is then a single list, produced once, so there is no second ordering that can drift. Both generated outputs also share provenance with the C prototypes, so a name or type change fails at the build step rather than at run time.

Confidence: 5

## 2. Steps of a screen update that exist only because the two sides exchange text

The article lists five steps (section 10.3). Three of them exist only because the exchange is text:

- **Step 1** — the application *builds* a JSON description of its screen, in the typed language by concatenating string fragments into a buffer (Editor has 104 `writeLiteral` calls, e.g. `output.writeLiteral(at, ",\"color\":\"accent\"}")`).
- **Step 2** — the reactor *converts* that buffer from UTF-16 to UTF-8 and escapes characters as JSON requires, budgeted at up to six output bytes per input unit.
- **Step 4** — the compositor *parses* the JSON text into a tree of dynamically typed objects allocated on a garbage-collected heap.

Step 3 (copying the message, capped at 16 KiB, onto the compositor's queue) is a messaging step between worlds, not a text step, and step 5 (walk the tree, compute positions, draw) is the actual work. A typed binary protocol lets the application write fields at fixed offsets and the compositor read the same offsets, so nothing is formatted, escaped or parsed (step 1 and 2's escaping work disappear; step 4 disappears) and no tree is allocated. Section 10.8 puts it the same way: "a typed binary protocol removes both steps", where "both" means formatting and parsing.

Confidence: 5

## 3. Why deleting the annotations is not enough

Deletion alone leaves JavaScript semantics where the typed language has different semantics. Section 10.4 says the differences are "specific, enumerable", and gives a table of five; the emitter must add a rewrite for each.

Two specific constructs and what must be added:

1. **`a + b` on `i32`.** In the typed language the result wraps at 32 bits; in JavaScript it is a 64-bit float. Working: with `a = 2147483647` (2³¹ − 1), typed `a + 1` yields `-2147483648`, while JavaScript yields `2147483648`. The emitter must insert `(a + b) | 0`, which coerces back to a 32-bit signed integer and produces `-2147483648`.
2. **`a * b` on `i32`.** Same wrap, but addition's shortcut is wrong here: JavaScript loses precision above 2⁵³, so a product may lose low bits where `i32` merely truncates. The emitter must insert `Math.imul(a, b)`, which multiplies as 32-bit integers. (A third example, if wanted: `a / b` on `i32` truncates and traps on zero, JavaScript gives a fraction or infinity, so a *checked helper* is needed; and `s.charCodeAt(i)` out of range traps in the typed language but returns NaN in JavaScript, requiring "a wrapper class with a checked method".)

Confidence: 5

## 4. What a JavaScript-derived reference can and cannot detect

It can detect **implementation** errors: mistakes in the WebAssembly backend, the RV32 backend, or in the lowering that only one implementation makes. The emitter is "a second, independent implementation of the language's semantics", so running one application through both and comparing the screens is a test that needs no hand-written original — a divergence means at least one backend is wrong (section 10.4).

It cannot detect an error **in the source's own logic**, because both implementations read the same typed source: a wrong condition, an off-by-one, a missing case in the application appears identically in both outputs and the screens still match. The article states this limit plainly ("A reference derived from the same source cannot reveal an error in the source's logic") and adds the consequence: during a port, the original JavaScript application remains the standard of behaviour.

Confidence: 5

## 5. Why `await` comes before the remaining ports

Section 10.1 gives the multiplier: the typed Editor is about 1,730 lines against 316 lines of JavaScript, and the article attributes part of that growth to missing features, one of which is `await` (with no allocation and no string operations beyond single code units). Section 10.6 adds that porting twelve applications "in the current style would produce a great deal of code that `await` would then make obsolete" — i.e. hand-written continuations and state fields that step 7 would generate automatically.

Working from the table's numbers: Editor's typed source is 1,730 / 316 ≈ 5.5 times its JavaScript original, so twelve ports at that rate could be roughly 12 × 5.5 × (size of one application) in typed lines; section 10.7 puts Editor's hand-maintained state at 71 fields, so the same twelve ports would also carry hundreds of hand-written state fields that would have to be rewritten later. Section 10.5 confirms the mechanism — `await` is exactly what removes "hand-written continuations" from ports.

Confidence: 4

## 6. One prediction and what would refute it

Take the Article 5 prediction: "A compile-time operand stack gives 593 instructions for Files, where today there are 1,529." The check named by the plan is to implement it for Files first and count. Working: 1,529 → 593 is a saving of 936 instructions, or 593 / 1,529 ≈ 0.39, i.e. about 2.6 times smaller, which is the "about 2.7 times smaller" promised by step 5 in the roadmap. Refutation: implement it for Files and find a count materially above 593 — the counting model would then be wrong, and the plan says to "re-examine before doing Editor", i.e. to stop and audit the model instead of proceeding to the much larger Editor port.

(A second, independent example: section 10.7 predicts application code is under 10 percent of key press to pixels. Step 0's measurement would refute it if the share were above 10 percent, and the plan's response is not to abandon the roadmap but to "raise the priority of step 5 for the affected application".)

Confidence: 5

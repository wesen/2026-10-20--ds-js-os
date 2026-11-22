# Answers to 10.9 Check your understanding

## 1. Mismatched order between the compiler's table and the trampoline table

Native code calls function number *k* by jumping to the *k*-th trampoline entry, so the position of a name in `compiler/typed-world.js` is the whole of its identity at the call site. If an edit moves one function in the JavaScript table but not in `sdk/typed/rv32-slot.S`, then call *k* lands on the code of a different function: the arguments passed mean something else to the callee and the result type is wrong. The article states that nothing detects this, because the only check made at link time is the *count* of functions packed into a header word; counts stay equal under a reordering. An interface description fixes it by being the single source from which the table, the trampolines and the C prototypes are all generated, so the three orders are produced from one list and cannot diverge.

Confidence: 4

## 2. Screen-update steps that exist only because text is exchanged

Working through the five steps of section 10.3: step 1, the application building its screen as JSON text by successive `writeLiteral` fragments; step 2, the reactor converting that buffer from UTF-16 to UTF-8 and escaping it as JSON requires; and step 4, the compositor parsing the text back into a tree of dynamically typed objects allocated on a garbage-collected heap. Step 5 (walking the tree, computing positions, drawing) stays because drawing is real work, and step 3 (copying the message to the compositor's queue, capped at 16 KiB) would arguably shrink with a binary form but is not listed as a text cost. A binary protocol removes 1, 2 and 4 because both sides then read fixed offsets in the same record layout instead of formatting and re-parsing.

Confidence: 5

## 3. Why deleting type annotations is not enough

Because the typed language's arithmetic and array/string behaviour differ from JavaScript's, not just its syntax, so a mechanical deletion leaves code with different meaning. Two of the article's rows: for `a + b` on `i32` the typed language wraps at 32 bits while JavaScript computes in 64-bit floating point, so the emitter must write `(a + b) | 0`; and for `a * b` on `i32` JavaScript may lose low bits above 2⁵³, so the emitter must write `Math.imul(a, b)`. Two more of the same kind: `a / b` on `i32` truncates and traps on zero where JavaScript gives a fraction or infinity, needing a checked helper, and `s.charCodeAt(i)` out of range traps in the typed language but returns NaN in JavaScript, needing a wrapper class with a checked method. `record` declarations also have to be mapped onto an object or typed array.

Confidence: 5

## 4. What a JavaScript-emitter reference can and cannot detect

It is a second, independent implementation of the language's semantics, so running the same typed source through the WebAssembly backend, the RV32 backend and the JavaScript emitter and comparing the resulting screens tests the two native backends against a differently built one. That catches lowering and code-generation errors: a wrong wrap, a wrong offset, a mis-sized field. It cannot catch an error in the program's own logic, because the reference is derived from the same source as the thing being tested — a wrong algorithm is compiled wrongly-or-rightly into the same wrong screen by all three. The article therefore keeps the hand-written JavaScript original as the standard of behaviour during a port.

Confidence: 5

## 5. Why `await` comes before the remaining ports

Section 10.1 shows the typed ports are about five to six times longer than the JavaScript they replace, and attributes the difference to missing language features, among them no `await`: control flow has to be written out by hand as continuations with explicit state fields. Twelve applications are still to be ported. Doing that work in the current style would produce a large body of hand-written continuation code that `await` compiled to state machines would then make obsolete, so the language work is done first. The roadmap makes step 7 (medium to large) precede the remaining ports explicitly for this reason.

Confidence: 5

## 6. One prediction, its refutation, and the plan's response

Take the caching prediction: with a cache, an unedited Editor costs under 100 ms at boot instead of 2–3 s. The check is to time a boot with a warm cache; the observation that would refute it is a warm-cache boot that still takes seconds rather than tens of milliseconds. The plan then says to look at hashing and load costs — that is, to treat the cache as correctly placed but poorly implemented, rather than abandoning it. I could also have taken the prediction that application code is under 10 percent of key-press-to-pixel time, checked by step 0, where failure means raising the priority of step 5 for the affected application.

Confidence: 4

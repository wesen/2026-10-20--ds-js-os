# Answers to "Check your understanding" (section 10.9)

## 1. Different orders in the compiler table and the trampoline table

The compiler's table fixes each function's position, and native code calls function number *k* by jumping to the *k*-th trampoline. If the two files disagree after an edit, the call still succeeds mechanically but lands on the wrong function, so the arguments are reinterpreted with the wrong meaning. Nothing catches this: the only automatic check is the count of functions packed into a header word, and that check passes because the number of functions has not changed. The interface description prevents it because one file holds each function's name, parameter types and result type, and a build step generates the compiler table, the trampolines and the C prototypes from that single source in one fixed order. Since nobody edits the generated order by hand, the three lists cannot drift apart.

Confidence: 5

## 2. Screen-update steps that exist only because text is exchanged

Step 1 is the application formatting its screen as JSON text, in the typed language by writing string fragments such as `output.writeLiteral(at, ",\"color\":\"accent\"}")` into a buffer. Step 2 is the reactor converting that buffer from UTF-16 to UTF-8 and escaping characters as JSON requires. Step 4 is the compositor parsing the JSON text back into a tree of dynamically typed objects allocated on a garbage-collected heap. Step 5's tree walk is also a consequence of having text only, but the article does not say so explicitly, so I count 1, 2 and 4 as the clear cases and note that the copying in step 3 would still be needed with a binary protocol.

Confidence: 4

## 3. Why deleting annotations is not enough

Annotation deletion leaves JavaScript semantics, and the typed language's semantics differ in specific ways, so the emitter must rewrite constructs rather than just strip types. For `i32` addition, JavaScript computes in 64-bit floating point while the typed language wraps at 32 bits, so the emitter must add `(a + b) | 0`; for `i32` multiplication, where JavaScript may lose low bits above 2^53, it must add `Math.imul(a, b)`. Two further examples: `i32` division truncates and traps on zero in the typed language but gives a fraction or infinity in JavaScript, so a checked helper is required, and `s.charCodeAt(i)` out of range traps in the typed language while JavaScript returns NaN, so a wrapper class with a checked method is required. Record declarations have no JavaScript equivalent and must become objects or typed arrays. Each row of the article's table is called a mechanical rewrite.

Confidence: 5

## 4. What a same-source reference can and cannot detect

Because the JavaScript emitter is an independent implementation of the language's semantics, running an application through both backends and comparing screens tests whether the WebAssembly and RV32 backends generate correct code. If, for example, the RV32 backend computes an offset or a multiply wrongly, the two screens differ and the fault is visible. It cannot detect an error in the source's own logic, because both implementations read the same source text: a mistake in a port's algorithm is faithfully reproduced on both sides and the screens still agree. The article therefore keeps the original JavaScript application as the standard of behaviour during a port, where it is a third, differently written check.

Confidence: 5

## 5. Why `await` comes before the remaining ports

Section 10.1 shows that typed ports are five to six times longer than the JavaScript they replace, and gives the missing language features — no allocation, no string operations beyond single code units, and no `await` — as the explanation. Without `await`, an application must spell out its continuations by hand in state fields; Editor is said to use 71 state fields. Porting the remaining twelve applications in that style would produce a large amount of hand-written continuation code that the `await` transformation would then make obsolete. Doing step 7 first means each application is written once, in the form the language will keep, rather than being rewritten afterwards.

Confidence: 5

## 6. One prediction and what would refute it

If I take the operand-stack prediction, the claim is that a compile-time operand stack gives 593 instructions for Files where today there are 1,529 (Article 5). The stated check is to implement it for Files first and count. An observation that refutes it would be a Files count far from 593 — for instance a count close to the existing 1,529, or a figure that moves with the model's parameters in a way the model does not predict. The plan's response is that the counting model is wrong and must be re-examined before doing Editor, so the cheap measurement is spent before the expensive port.

Confidence: 4

## Working notes on numbers I checked

- Editor: 1,730 typed lines / 316 JavaScript lines = 5.5× ("five to six times" holds).
- Agenda: (468 + 869) / 307 = 1,337 / 307 = 4.35×, which is below the stated "five to six times"; see feedback, claims I could not verify.
- Screen size: 17 × 49 = 833 characters; "under 2 kB" needs at least about 2.4 bytes per character of layout, and the record layout is not given.

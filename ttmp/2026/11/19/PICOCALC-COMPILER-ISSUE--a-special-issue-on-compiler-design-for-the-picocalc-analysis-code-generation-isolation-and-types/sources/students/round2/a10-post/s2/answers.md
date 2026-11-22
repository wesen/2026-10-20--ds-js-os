# Answers to "Check your understanding"

## 1.

The header stores only a count, and the linker compares that count with the length of
the compiler's table in `compiler/typed-world.js`. It therefore catches a function that
was added to one of those two lists and not the other: the numbers no longer match.
What it cannot catch is any mistake that keeps the length the same — above all two lists
of equal length written in a different order. In that case native code calling function
number *k* jumps to the *k*-th trampoline, which is now a different function, so it runs
the wrong code with arguments that mean something else, and no check fires. Nothing in
the article says how the third file, `sdk/typed/world.c`, is checked at all, so its order
is unchecked today as well. The interface description removes both failures at the root:
the compiler's table, the trampolines and the C prototypes are all *generated* from one
file, so there is only one list and one order, and a disagreement has nowhere to arise.

Confidence: 4

## 2.

Of the five steps, the three that exist only because the two sides exchange *text* are
step 1 (the application writes a JSON description of its screen into a buffer with
`writeLiteral` calls), step 2 (the reactor converts that buffer from UTF-16 to UTF-8 and
escapes it as JSON requires) and step 4 (the compositor parses the JSON text into a tree
of dynamically typed objects on a garbage-collected heap). Step 3, the nucleus copying
the message into the compositor's queue, remains because two separate worlds still have
to hand data over; the article says explicitly that this step "would remain with any
protocol". Step 5, walking the structure, computing positions and drawing, is the
compositor's actual job and is needed whatever the data looks like. Under a binary
protocol the application writes fields at fixed offsets and the compositor reads the same
offsets, so steps 1, 2 and 4 collapse into one store and one load: nothing is formatted,
escaped or parsed, and no tree is allocated.

Confidence: 5

## 3.

Deleting annotations leaves JavaScript code whose meaning differs from the typed
language in specific places, so a plain deleter produces a program that computes the
wrong answers rather than a compile error. Two examples from the article's table. First,
`a + b` on `i32` must wrap at 32 bits, but JavaScript `+` is 64-bit floating point, so the
emitter must add `(a + b) | 0` to force the result back into 32 bits. Second, `a * b` on
`i32` wraps at 32 bits, whereas a JavaScript product can lose low bits above 2^53, so the
emitter must emit `Math.imul(a, b)` instead. The article gives three more of the same
kind: division must become a checked helper because the typed language truncates and
traps on zero while JavaScript returns a fraction or infinity, `s.charCodeAt(i)` out of
range traps in the typed language but returns NaN in JavaScript so it needs a wrapper
class with a checked method, and `record` declarations have a fixed memory layout that
has to become an object or a typed array.

Confidence: 5

## 4.

Because the emitter is a second, independent implementation of the typed language's
semantics, running one application through the JavaScript path and through the WebAssembly
or RV32 path and comparing the resulting screens tests *the backends*: any place where the
WebAssembly or RV32 code behaves differently from the language definition shows up as a
different screen. What it cannot detect is an error in the source program's own logic. If
the typed source is wrong, both emitters reproduce the same wrong behaviour, and the two
screens agree while the application is still broken. That is why the article keeps the
hand-written JavaScript original as the standard of behaviour during a port; the emitter
may only replace it after the port has been accepted. Similar logic covers a mistake in
the emitter itself: since the emitter is new code, an error there would also produce a
mismatch, and the article does not say how the two kinds of mismatch would be told apart.

Confidence: 4

## 5.

The roadmap puts `await` (step 7) before the remaining ports because of the multiplier in
section 10.1. There the typed versions are measured as 4 to 6 times longer than the
programs they replace: Editor is 316 lines of JavaScript against about 1,730 lines of
typed source, that is 1,730 / 316 = 5.5, and Agenda is 307 lines of JavaScript against
468 lines of typed source plus 869 lines of C, that is (468 + 869) / 307 = 1,337 / 307 =
4.4. Twelve applications are still to be ported, so porting them in the current style
would multiply roughly 4 to 5 times their JavaScript size into new typed source and new C.
`await` is named as one of the missing features that cause that length, and Article 8's
alternative is hand-written continuations moved into persistent state, which is exactly
the kind of code that `await` would make obsolete. Writing twelve applications that way
first would therefore produce a large body of code that has to be rewritten afterwards.

Confidence: 4

## 6.

Take the first prediction: "A compile-time operand stack gives 593 instructions for Files,
where today there are 1,529". The stated check is to implement the new backend for Files
first and count the emitted instructions. The prediction is refuted if that count comes
out well above 593 and near or above today's 1,529, since the claimed saving would then
not exist. The article's response in that case is to treat the counting model used in
Article 5 as wrong and to re-examine it before starting on Editor. Note that the two
numbers given here also fail to produce the "about 2.7 times smaller" figure of step 5:
1,529 / 593 = 2.58, so a reader cannot reproduce the 2.7 from this table.

Confidence: 5

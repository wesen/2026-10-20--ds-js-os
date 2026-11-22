# Answers to "Check your understanding" (section 10.9)

## 1. What the count check catches and misses

The stored count catches a function that was added to the compiler's table (or to the C/assembly side) and not to the other side, because then the two lengths differ and the linker's comparison fails. It does not catch two lists that have the same length but list the functions in a different order: the count still matches, yet native code jumping to entry *k* lands on the wrong function and passes arguments with the wrong meanings. A single interface description removes both, because the compiler's table, the assembly trampolines and the C prototypes would all be *generated* from one file instead of being typed out by hand, so neither the number nor the order can drift. That is also a gain in kind, not just in degree: the current check is a length check, while generation cannot produce a disagreement at all.

Confidence: 4

## 2. Which screen-update steps exist only because of text

Steps 1, 2 and 4 exist only because the two sides exchange text: the application formatting a JSON description, the reactor converting UTF-16 to UTF-8 and adding JSON escapes, and the compositor parsing that text into a tree of heap-allocated objects. Step 3, the nucleus copying the message into the compositor's queue, remains because the application and the compositor are separate worlds with separate memory, so *something* must be passed between them, text or not. Step 5, the compositor walking the structure, computing positions and drawing, remains because that is the compositor's actual job; a binary protocol only changes the form of what it walks.

Confidence: 4

## 3. Why deleting annotations is not enough

Deleting annotations leaves JavaScript, and JavaScript's arithmetic and string behaviour differ from the typed language's, so the program would compute different answers rather than merely look different. Two examples: `a + b` on `i32` wraps at 32 bits in the typed language but is 64-bit floating-point addition in JavaScript, so the emitter must add `(a + b) | 0`; and `a * b` on `i32` wraps while JavaScript multiplication can lose low bits above 2⁵³, so the emitter must use `Math.imul(a, b)`. Two further cases from the article's table: `a / b` on `i32` truncates and traps on zero instead of giving a fraction or infinity (a checked helper is needed), and `s.charCodeAt(i)` out of range traps instead of returning NaN (a wrapper class with a checked method is needed). `record` declarations have no JavaScript equivalent either and must become objects or typed arrays.

Confidence: 4

## 4. What a JavaScript-emitter reference can and cannot detect

Because it is a second, independent implementation of the language's semantics, it can detect errors in the WebAssembly and RV32 backends: run an application through both paths and compare the screens, and a disagreement points at one of the two backends. It can also be used without a hand-written JavaScript original, which is what makes it a cheap reference. It cannot detect an error in the source program's own logic, because a fault in the typed source appears in both implementations and cancels out. The article states this limit explicitly and adds that during a port the original JavaScript application must stay the standard of behaviour.

Confidence: 4

## 5. Why `await` comes before the remaining ports

Section 10.1 shows that typed ports are much longer than the JavaScript they replace: Editor is 316 lines of JavaScript against about 1,730 lines of typed source (5.5 times), and Agenda is 307 lines against 468 lines of typed source plus 869 lines of C (1,337 lines, 4.4 times). The article attributes that price to missing language features, including the absence of `await`, which forces hand-written continuations. With twelve applications still to port, doing the ports first would generate a large body of code that a later `await` would make obsolete. Adding `await` first (roadmap step 7) therefore shrinks the work of the remaining ports; this is why the arrow runs from step 7 to "Port the remaining twelve applications".

Confidence: 4

## 6. One prediction and what would refute it

Take the prediction that a compile-time operand stack gives 593 instructions for Files where there are today 1,529. The refuting observation is a count above 593 after implementing the compile-time operand stack for Files first; a count of, say, 1,100 would mean the saving is far smaller than claimed. The plan then says the counting model is wrong and must be re-examined before the same change is attempted on Editor. Note the prediction is deliberately ordered: Files is the cheap trial that protects the larger application from a bad model.

Confidence: 4

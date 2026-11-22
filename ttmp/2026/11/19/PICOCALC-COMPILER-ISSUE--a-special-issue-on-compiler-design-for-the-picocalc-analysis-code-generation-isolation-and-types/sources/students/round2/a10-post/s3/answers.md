# Answers to "Check your understanding" (Article 10)

## 1. What the header's function count checks, and what it misses

The count in the header catches a **length** mismatch: a function present in the compiler's table but missing from the assembly list (or the reverse), because then the two numbers differ and the linker complains. It misses a **reordering**: two lists of the same length whose entries are in different orders pass the count check, yet native code jumping to entry *k* lands in the wrong function and passes arguments with the wrong meanings, with no diagnostic. The interface description removes both at once because the names, parameter types, result types and order are written in exactly one file, and a build step generates the table, the trampolines and the C prototypes from it; count and order then agree by construction instead of being compared afterwards.
Confidence: 5

## 2. Which screen-update steps exist only because of text, and why the others remain

Steps 1, 2 and 4 exist only because the two sides exchange text: the application concatenates JSON string fragments, the reactor converts the buffer from UTF-16 to UTF-8 with JSON escaping, and the compositor parses the text into a tree of dynamically allocated objects. Step 3, the nucleus copying the message into the compositor's queue, remains under any protocol, as the article says explicitly, and the 16 KiB message limit with it, because a world still has to hand something to another world. Step 5, computing positions and drawing, remains because that is the compositor's actual job; with a binary protocol it reads the same fields at the same offsets instead of walking a tree.
Confidence: 5

## 3. Why deleting annotations is not enough

Deleting annotations is not enough because the typed language deliberately gives some constructs a different meaning from JavaScript, so the JavaScript left after deletion would compute something else, or would not be JavaScript at all. Two examples from the table: `a + b` on `i32` wraps at 32 bits while JavaScript adds 64-bit floating-point numbers, so the emitter must write `(a + b) | 0`; and `a * b` on `i32` wraps at 32 bits while JavaScript multiplication may lose low bits above 2⁵³, so the emitter must write `Math.imul(a, b)`. The same applies to division (truncating and trapping on zero needs a checked helper), to `charCodeAt` out of range (trap instead of NaN needs a wrapper class with a checked method), and to `record` declarations (fixed memory layout needs an object or a typed array). Each row is a mechanical rewrite, but a rewrite is code the emitter must add, not text it can delete.
Confidence: 5

## 4. What a same-source reference can and cannot detect

It can detect errors in the compiler's lowerings: if the WebAssembly-and-RV32 path and the JavaScript path are the same source, then running an application through both and comparing the screens of the two runs exposes places where a backend's translation disagrees with the language's meaning. It cannot detect an error in the source program's own logic, because both runs execute that same source and therefore share the mistake — a wrong algorithm produces the same wrong screen twice. That is why the article keeps the hand-written JavaScript original as the standard of behaviour during a port, and only retires it once the port is accepted.
Confidence: 5

## 5. Why `await` comes before the remaining ports

Section 10.1 shows that typed ports are far longer than the programs they replace: Editor is 316 lines of JavaScript against about 1,730 lines of typed source, a factor of 5.5, and Agenda is 307 lines against 468 lines of typed source plus 869 lines of C, a factor of 4.4 once the reactor is counted. The article attributes that multiplier to missing features, `await` among them, so each of the twelve applications still to port would be written in the verbose style and would need hand-written continuations wherever it waits. Porting first would therefore produce a large body of code that the `await` work (step 7, compiled to state machines) would immediately make obsolete; doing `await` first means the twelve ports are written once, in the shorter form.
Confidence: 5

## 6. One prediction, its refutation, and the plan's response

Take the cache prediction: with a content-keyed cache, an unedited Editor should cost under 100 ms at boot instead of 2–3 s. The observation that refutes it is timing a boot with a warm cache (step 1 being already done) and finding that it still takes, say, several hundred milliseconds or seconds; the plan then says to look at hashing and load costs, that is, at the 14 ms load and the tens of milliseconds of hashing that Article 6 assumed. A second choice would be the operand-stack prediction of 593 instructions for Files against today's 1,529: implement it for Files first, and if the count comes out far from 593 the conclusion is that the counting model is wrong and must be re-examined before Editor is touched.
Confidence: 5

# Answers — "7. Safety by Construction: Running Native Code Without Trusting It"

Note: I was not given the article, so every answer below is reconstruction from the question
wording plus general knowledge of native-code sandboxing. Where a question turns on a detail I
cannot derive, I say so first and then reason about what the answer must look like.

## 1.

I cannot know this without the article (the exact wording of the loader comment and the three
properties is article-specific). Read literally, "a contract, not a wall" means the list states
what the generated code promises to call and what the runtime promises to provide, but it is not
itself an enforcement mechanism: nothing physically stops native code from jumping elsewhere or
calling something off the list. It therefore concerns the control-flow / authority property (which
code may transfer control to which addresses, and which runtime services may be invoked), not
memory safety, which has to be enforced by the verifier or the MPU. A wall would be a hardware
check; a contract is an assumption the rest of the design is allowed to rely on.
Confidence: 2

## 2.

I cannot know this without the article, but the phrase strongly suggests recursion is absent as a
consequence of something else, most plausibly static stack allocation: because the call graph is
known and acyclic, every function's frame and total stack need can be fixed at compile time, and
"no recursion" falls out of that layout rather than being an explicit language rule. If a function
could be called before it is defined, the compiler would have to add a call-graph resolution or
fix-up pass — at minimum recording unresolved call sites with placeholder stack needs and
back-patching them once the callee is translated, which means the translation is no longer a
single order-independent pass. What is lost without it is the compile-time bound on stack depth:
the function's stack need would be unknown or assumed, so the "cannot overflow the stack" guarantee
would have to be replaced by a runtime check or by trusting the program.
Confidence: 2

## 3.

I cannot know this without the article, but the definition has to be recursive over the call graph:
a function's stack need is its own frame size plus the largest stack need among the functions it
calls (the maximum over its call sites, not the sum, because calls do not overlap in time). The
compiler can compute it the moment it finishes translating the function because, under
define-before-use, every callee is already translated and its stack need is therefore already a
known constant, and because calls are static and direct, so the set to take the maximum over is
enumerated in the function body. The result is a single number attached to the function, which
callers can then use without re-analysing the body.
Confidence: 2

## 4.

I cannot know this without the article, but this looks like a decrementing budget ("fuel") that
bounds execution. Subtracting 1 at each back-edge bounds only the number of loop iterations, so a
long loop body can still consume unbounded time per iteration; subtracting a larger amount — the
statically known cost of the loop body — bounds actual work, and is what you need for a real
time bound rather than an iteration count. A call to a typed function can be charged its
precomputed cost (its own bound is already known from section 7.4's analysis, so the call is just
a constant debit at the call site), whereas a call to a reactor function has no statically known
cost, so it can only be charged a fixed toll (or be accounted by the reactor itself on return)
and its internals must be trusted or bounded by the reactor.
Confidence: 2

## 5.

I cannot know this without the article, but if the compiler emitted an integer where a buffer
reference belongs, the technique that still confines the access is the runtime one: references as
handles/tags validated at the point of dereference, or base-plus-length bounds checks, so a
mistyped value is rejected or clamped when it is actually used. Static type checking accepts the
code because it has already run and is not re-run on the generated native code: it checks the
source program's types, not the compiler's output, so a bug in code generation is invisible to it.
That is precisely why a construction argument ("the compiler is correct") cannot replace a
mechanism that checks the value at use time.
Confidence: 2

## 6.

I cannot know this without the article, but the trade-off is the usual static-versus-hardware one.
The software verifier's advantage is that it needs no special hardware, costs nothing at run time,
and can express fine-grained, arbitrary access windows (and is portable across chips), and it also
catches errors before any code runs. PMP with user mode's advantage is that it enforces at run
time, independent of whether the verifier or the compiler was correct: a verifier bug, a missed
case, or malicious hand-written native code is still confined to its regions. In short: the
verifier gives precision and zero overhead, PMP gives a last line of defence that does not depend
on the proof being right.
Confidence: 2

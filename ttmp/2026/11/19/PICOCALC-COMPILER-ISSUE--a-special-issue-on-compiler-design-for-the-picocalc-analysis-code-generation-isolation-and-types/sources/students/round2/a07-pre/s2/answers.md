# Answers — "7. Safety by Construction: Running Native Code Without Trusting It"

No article was supplied in this directory, so the answers below are reconstructions from the
question wording plus general knowledge of compilers, sandboxing and RISC-V PMP. I flag each place
where I am guessing at the article's own vocabulary.

## 1.

I cannot know this without the article, because "the three safety properties" are named in the
chapter and I have not seen that list. Read plainly, the comment means that the loader publishes a
finite table of entry points into native code and nothing physically stops that code from jumping
elsewhere, dereferencing anything, or calling an address outside the table — the table only works
because code generation emits calls exclusively through it, so it is upheld by agreement between
loader and compiler rather than by hardware. On that reading it belongs to the third property,
by which I would expect the article to mean confinement of *authority* (native code may reach the
outside world only through the listed calls), as distinct from memory safety (property one) and
bounded time/stack (property two); if the article instead files it under isolation, be sure the
list is what is checked, not what is enforced.
Confidence: 2

## 2.

I cannot know this without the article, since it does not tell me which compilation strategy makes
recursion impossible "for free". The most likely by-product is single-pass, definition-before-use
translation: if a call may only name a function already translated, the call graph is acyclic, so
recursion — the only source of unbounded frame nesting — disappears without a separate cycle check
and without a fixpoint over call costs. To allow calling a function before its definition is seen,
the compiler has to gain a real call-graph phase: build the graph, either topologically order it or
iterate frame/stack costs to a fixpoint, and reject cycles (or demand explicit stack-depth
annotations for them). Without that addition, the compiler can no longer state a static worst-case
stack figure, so it must fall back on a dynamic stack-limit check or a hardware stack guard, and
the "no stack overflow by construction" claim becomes "overflow is trapped" instead.
Confidence: 3

## 3.

I cannot know this without the article, so this is my reconstruction of the definition. A function's
stack need is its own frame (locals, spilled temporaries, peak operand-stack depth while evaluating
its expressions) plus the maximum, over the call sites in its body, of the callee's stack need net
of whatever the frame already accounts for — the classic "frame + max over callees" recurrence, so
the answer is the deepest point reached during execution and not the number of stack frames. It
can be computed exactly when translation of the function ends because, under definition-before-use,
every function it can call has already been translated and has a finalized stack need; the body is
walked once, keeping a running peak and taking the max of already-known constants. No call graph
traversal or fixpoint is needed, which is why the figure costs nothing extra in a single pass.
Confidence: 3

## 4.

I cannot know this without the article whether "1 per back-edge" and "a larger amount" are the two
options considered or two levels of the same scheme, so I give the reasoning that constrains the
answer. Subtracting 1 at each back-edge makes the remaining fuel an iteration budget: total loop
iterations for the invocation are bounded by the initial budget, and termination becomes a property
of the counter rather than of the program. Subtracting a larger amount — roughly the cost of the
loop body, or the callee's known cost — bounds work or time rather than trip count, which is what
you need when an iteration can be long or when you want the budget to mean microseconds. I would
expect a call to a typed function to be charged nothing extra or its pre-computed cost (its cost is
already known statically and its fuel is spent inside the callee), while a call to a reactor
function is charged a fixed nontrivial amount per call, since nothing is known about how much work
the reactor will do and only the number of crossings can be bounded.
Confidence: 2

## 5.

I cannot know this without the article what the two techniques in 7.6 are, but the asymmetry the
question describes only works one way round. If the compiler mis-passes an integer where a buffer
reference belongs, a *software verifier* over the emitted code is the one likely to accept it,
because it sees integers and addresses, not source-level types: the value is well-formed machine
data in a register the verifier can bound, so it has no reason to complain; conversely, an
independent *type/capability check* is the one that would reject — except that the bug is in the
compiler, which is exactly what that check would be reading its facts from. So the technique that
still confines the access is the hardware/discipline-based one — region isolation or a checked
access path — because the bad address still lands inside the region the process is allowed to
touch, so the damage is limited to its own data rather than the loader, the reactor or another
module. The other technique accepts the code because the mistake is invisible at that level.
Confidence: 2

## 6.

I cannot know this without the article's framing, but the trade-off is standard enough to predict.
The software verifier wins on portability and cost: it needs no memory-protection hardware, no
second privilege mode and no trap on every crossing, it can enforce rules far finer than the
handful of power-of-two regions a PMP unit offers, and it rejects a program before it ever runs,
with a diagnostic pointing at the offending code. PMP with user mode wins on trust: it holds even
when the compiler or the verifier is wrong, which is precisely the assumption in question 5 — the
hardware does not read the proof, it just refuses the access — and it covers paths static analysis
cannot see, such as table-driven jumps or (if not excluded) DMA performed on the program's behalf.
The plausible conclusion of the section is that the verifier buys early warning and portability,
the PMP buys a floor under everything else.
Confidence: 2

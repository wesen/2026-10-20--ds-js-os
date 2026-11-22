# Pre-test answers

Written before reading `dense-brief.md`. Answers are from memory only.

---

**1. What does "whole-program type inference" mean, and why can it make a compiler slow?**

It means the compiler works out the types of names by looking at the entire program at once
instead of one file or one function at a time, so a function in one module can be typed by the
way a caller in another module uses it. It can be slow because the facts travel in both
directions: a change in one place can force re-checking everything that touches it, and the
compiler may have to iterate the inference to a fixed point. With many mutually dependent
functions the number of constraints grows fast, so inference can become quadratic or worse.

Confidence: 3

---

**2. In data-flow analysis, what is a fixpoint iteration, and what is widening for?**

A fixpoint iteration means you set an initial guess at each program point (usually "no
information yet"), then repeatedly push the information through the instructions and merge it
where control flow joins, stopping when a whole pass changes nothing — that stable state is the
fixpoint. Widening is a way to force that loop to terminate when the values form an infinite
chain, e.g. intervals: instead of climbing 0,1,2,3,… forever at a loop header you jump straight
to an over-approximation such as "any integer". You lose precision in exchange for a guarantee
of finishing.

Confidence: 3

---

**3. What is static single-assignment (SSA) form, and what does "sparse" analysis on SSA avoid?**

In SSA every variable is written exactly once in the text, and at places where two control-flow
paths meet you use a phi function to say "the value is the one from whichever branch we came
from". A sparse analysis uses this: because each definition reaches its uses through explicit
edges, you can put a fact at each definition and follow the use-def links instead of recomputing
facts at every program point. What it avoids is repeatedly walking every instruction and
re-merging facts at every basic block — the classic "dense" iterative data-flow sweep.

Confidence: 3

---

**4. What does a peephole optimizer do? Give one concrete pattern it removes.**

It looks at a small window of neighbouring instructions and applies local rewrites: if the window
matches a wasteful pattern, replace it with a shorter or cheaper one, then slide the window on
and repeat. One pattern: `push x` immediately followed by `pop y` becomes a single `mov y, x`.
Another: `add r, 0` or `mul r, 1` is deleted, and a store straight after a load of the same
address is dropped.

Confidence: 4

---

**5. WebAssembly code is written for a stack machine. Name one simple and one better way to translate stack-machine code into code for a register machine such as RISC-V.**

The simple way is to keep the operand stack in memory: put the stack pointer in a register,
and translate each WebAssembly instruction into a few RISC-V instructions that load, compute
and store at the stack top. The better way is to simulate the stack virtually while compiling a
basic block — the compiler keeps a small in-memory model of which virtual value sits in which
slot, hands out virtual registers instead of stack slots, and then does register allocation
(linear scan or graph colouring) so most values never touch memory. The better way removes
almost all the load/store traffic the simple way generates.

Confidence: 3

---

**6. Why is native machine code usually larger than bytecode for the same program?**

Because each machine instruction occupies several bytes — four bytes per instruction on RISC-V,
often more on variable-length ISAs — while a bytecode op is typically one or two bytes and does
a good deal of work per byte. Bytecode also comes with a compact table of operations the
interpreter dispatches on, whereas native code has to spell out every step explicitly. So the
same computation needs many more bytes when written as machine code.

Confidence: 3

---

**7. What is software fault isolation, and how does it differ from trusting the compiler?**

Software fault isolation means taking untrusted native code and mechanically ensuring it can only
touch memory inside its own sandbox — by masking or checking every address before a load or
store, and by confining every branch to a checked target — so that if the code misbehaves the
damage stays inside the sandbox. It differs from trusting the compiler because it assumes the
code producer may be hostile or simply buggy: instead of a promise that the generated code is
correct, you get a check or rewrite that you can verify after the fact, plus a small trusted
runtime that enforces the guard.

Confidence: 3

---

**8. A system gives each event handler a fixed time budget. Name two ways to stop a handler that loops for too long.**

One way is a watchdog: a timer interrupt fires at the deadline and the runtime aborts or unwinds
the handler, so the handler has to be written to be interruptible at that point. A second way is
to have every loop back-edge check a counter or deadline and bail out, which is cheaper and more
predictable but needs the compiler to insert the checks or to prove the loop is bounded and
reject it otherwise. (A third possibility is running the handler on a separate thread and killing
it, which most systems discourage because the thread's state is left inconsistent.)

Confidence: 2

---

**9. What is defunctionalization (or, if you prefer, how does a compiler turn `await` into a state machine)?**

Defunctionalization replaces functions used as values with plain data: a tagged record holding
the captured environment, plus one big `apply` function that switches on the tag and runs the
matching body. So a closure becomes an ordinary structure that the compiler can store, copy or
free without needing a function pointer in the object. For `await`, the compiler splits the
function at each await point into numbered states, keeps the locals in a heap frame object with
a program-counter field, and resuming simply jumps to the recorded state.

Confidence: 3

---

**10. What is a region (arena) in memory management, and what does it give you that a garbage collector does not?**

A region is one block of memory from which allocations are handed out cheaply and which is freed
all at once when the region ends. What it gives you is deterministic, constant-time deallocation
and no pause: no tracing, no reachability analysis, no roots, so freed memory comes back the
moment the region dies. The price is that you must know the lifetime of everything in the region
by hand or by static analysis, and you cannot free individual objects early.

Confidence: 3

---

**11. What is typestate? Give an example of a bug it prevents.**

Typestate refines the type of an object with the protocol state it is in, so that operations
that are only legal in one state are only type-checked when the object is known to be in that
state. An example: a `File` value that starts as `Closed`, becomes `Open` after `open`, and goes
back to `Closed` after `close`, so calling `read` on a `Closed` file is a compile error. That
prevents the classic use-after-close and read-before-open bugs.

Confidence: 4

---

**12. If a language forbids recursion, what can a compiler know about stack usage?**

If no function can ever call itself, directly or through a cycle of other calls, then the call
graph is acyclic and the deepest possible chain of calls is bounded by a number the compiler can
compute statically. That means the maximum stack consumption per task can be worked out as an
upper bound and the compiler can reserve exactly that, so the runtime does not need overflow
checks or a growable stack. It also means worst-case execution time analysis is tractable,
because there is no unbounded repetition through the call graph.

Confidence: 4

---

**13. State Amdahl's law in one sentence and say what it implies for choosing what to optimize.**

Amdahl's law says the speedup from improving one part of a program is capped by how much of the
total time that part actually accounts for — speedup = 1 / ((1 − p) + p/s) for a fraction p made
s times faster. It implies you should optimise the dominant cost and not spend effort on
something that only occupies a few percent, because even making it infinitely fast buys almost
nothing.

Confidence: 4

---

**14. What is the difference between a gradual type system and a fully static one?**

A fully static system checks every expression's type at compile time and refuses programs that
cannot be proven consistent, so nothing needs checking at run time. A gradual system lets some
parts be statically typed and others be untyped or `any`, checking what it can and inserting run
time checks where typed and untyped code meet. The aim is to let you add types piece by piece
instead of all at once.

Confidence: 3

---

## Notes on my own confidence

Lowest confidence: question 8 (I know the words "watchdog" and "budget" but not how such a
runtime actually implements them), and question 1 (I have seen "whole-program inference" but
never had to reason about its cost). Question 9 is also shaky — I can say the words
"state machine" but I could not hand-write the lowering.

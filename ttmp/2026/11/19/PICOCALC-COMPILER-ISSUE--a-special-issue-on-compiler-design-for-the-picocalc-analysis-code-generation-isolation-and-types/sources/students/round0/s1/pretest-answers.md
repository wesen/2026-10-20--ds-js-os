# Pre-test answers

Written before reading `dense-brief.md`.

**1. What does "whole-program type inference" mean, and why can it make a compiler slow?**
It means the compiler works out the types of expressions by looking at the whole program at once instead of checking whatever type annotations the programmer wrote. Because a function's type can depend on how every caller uses it, the compiler often has to revisit the same function many times as information flows around the program. On a large program that iteration can take a long time, and the result can also change if you add one new call site anywhere.

Confidence: 2

**2. In data-flow analysis, what is a fixpoint iteration, and what is widening for?**
You start with an optimistic or pessimistic guess for the facts at each program point and keep recomputing them until nothing changes; that stable state is the fixpoint. Widening is a trick for loops, where naive iteration may keep producing a bigger answer forever. You deliberately jump to a coarse value (for example "the set of everything" or an infinite bound) so the iteration terminates, at the cost of precision.

Confidence: 3

**3. What is static single-assignment (SSA) form, and what does "sparse" analysis on SSA avoid?**
In SSA every variable is assigned exactly once, and where control flow merges you use a special `phi` function to pick between the incoming versions. A sparse analysis puts facts directly on the definition of a variable and follows use-def links, instead of storing facts at every single program point and re-deriving them. That avoids walking over statements that cannot possibly change the answer.

Confidence: 3

**4. What does a peephole optimizer do? Give one concrete pattern it removes.**
It looks at a small sliding window of instructions and replaces known-useless combinations with shorter ones. A classic example: `load r1, [x]` followed immediately by `store r1, [x]` of the same value, or a `mov r1, r1`, or "push a; pop b" where the two are back to back. Another is removing a `jump` whose target is the very next instruction.

Confidence: 4

**5. WebAssembly code is written for a stack machine. Name one simple and one better way to translate stack-machine code into code for a register machine such as RISC-V.**
The simple way is to mirror the stack literally: keep the abstract stack in memory (or in a small array indexed by a stack pointer) and implement each Wasm opcode as a load, an operation, and a store. The better way is to do a forward pass that tracks the abstract stack in a virtual register list, emits real registers where possible, and relies on a register allocator (plus spilling only when needed) so no memory traffic is generated for values that stay in registers.

Confidence: 3

**6. Why is native machine code usually larger than bytecode for the same program?**
Bytecode is a compact, fixed-ish format designed for density: an opcode is one byte and operands are short indices. Native code has to spell out full instruction encodings, real register numbers, long offsets and addresses, and calling conventions, and it cannot rely on a separate interpreter to supply implicit context. Encoding size is paid per instruction, so the same operation often costs several bytes instead of one.

Confidence: 3

**7. What is software fault isolation, and how does it differ from trusting the compiler?**
SFI is a technique where untrusted code is transformed (or generated) so that every memory access and jump is checked or masked, so a bug or attack in that code can only touch memory inside its own sandbox. Unlike just trusting the compiler, the safety argument does not depend on the compiler being correct or the source code being well-behaved; it depends on a small, checkable property of the final machine code (for example, "all stores go through a masked base register").

Confidence: 2

**8. A system gives each event handler a fixed time budget. Name two ways to stop a handler that loops for too long.**
One is to instrument the code: insert a counter or a check at loop back-edges and branch out when the budget is exceeded. The other is to rely on an external mechanism, such as a timer interrupt that aborts the handler, or to forbid unbounded loops in the language so the worst case can be computed ahead of time.

Confidence: 3

**9. What is defunctionalization (or, if you prefer, how does a compiler turn `await` into a state machine)?**
Defunctionalization replaces functions-as-values with a tagged data type: each lambda becomes a record with a tag and its captured variables, and calls go through one dispatcher that switches on the tag. Turning `await` into a state machine is similar in spirit: the compiler precomputes where the suspension points are, stores the live locals in a heap object, and resumes by jumping into the code at the point it left off, selected by a saved state number.

Confidence: 2

**10. What is a region (arena) in memory management, and what does it give you that a garbage collector does not?**
A region is a chunk of memory that is freed all at once, rather than object by object. It gives you cheap, predictable allocation and deallocation (bump a pointer; reset the whole region) and a clear lifetime boundary. What it does not give you is automatic recovery of individual dead objects; you have to know when the whole region is dead, or you keep dead data alive.

Confidence: 3

**11. What is typestate? Give an example of a bug it prevents.**
Typestate tracks not just what type a value has but what state it is in, and makes the compiler reject operations that are wrong for the current state. Example: a file that must be opened before it is read, so reading a closed file is a compile error; or a protocol where you cannot send a second request before the first is acknowledged.

Confidence: 3

**12. If a language forbids recursion, what can a compiler know about stack usage?**
Because the call graph cannot contain a cycle, the compiler can compute the maximum call depth along any path and therefore a statically bounded worst-case stack size. That means it can size the stack once at compile time, check for overflow at load time instead of at runtime, and guarantee bounds for real-time purposes.

Confidence: 3

**13. State Amdahl's law in one sentence and say what it implies for choosing what to optimize.**
The speedup from improving part of a system is limited by the fraction of time that part takes: if a fraction p is improved by a factor s, total speedup is bounded by 1 / ((1-p) + p/s). It implies you should optimize the part that dominates the runtime, because making an already-small part infinitely fast buys almost nothing.

Confidence: 4

**14. What is the difference between a gradual type system and a fully static one?**
A fully static system requires every expression's type to be known and checked before the program runs, and typically rejects the program otherwise. A gradual system lets some parts be statically typed and some be dynamically checked through a boundary (like `any` in TypeScript or `Any` in Python), so a program can mix checked and unchecked code and pay for checks only where the two meet.

Confidence: 3

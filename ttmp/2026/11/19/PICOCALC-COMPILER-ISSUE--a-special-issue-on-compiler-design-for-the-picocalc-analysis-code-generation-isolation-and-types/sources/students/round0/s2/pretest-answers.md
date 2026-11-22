# Pre-test answers

Written before reading `dense-brief.md`. Answers are from prior knowledge only.

## 1. Whole-program type inference

I would say this means the compiler looks at the entire program at once — every function, every module — and works out the types of variables and expressions instead of requiring the programmer to write them down. It can be slow because a change in one place can force re-checking everywhere else, so you cannot compile files independently and you may need to iterate until types stop changing. With generics or polymorphic functions the amount of work can grow faster than the program size.

Confidence: 3

## 2. Fixpoint iteration and widening

A data-flow analysis starts by assuming nothing is known and repeatedly applies a transfer function over the program until the results stop changing; that stable state is the fixpoint. Widening is a trick for making that iteration terminate when the value domain is infinite (for example ranges of integers), by jumping to a coarse over-approximation such as "unknown" or "minus infinity to plus infinity" after a few rounds.

Confidence: 3

## 3. SSA and sparse analysis

In SSA form every variable is assigned exactly once, and each use is linked to a single unique definition, usually by renaming (`x.1`, `x.2`) and phi functions at merge points. A "sparse" analysis exploits this by attaching facts to def-use chains instead of recomputing facts for every program point, so it visits far fewer places — it avoids walking every statement when only a few definitions matter.

Confidence: 4

## 4. Peephole optimizer

It looks at a small sliding window of adjacent instructions and replaces patterns with cheaper equivalents, mostly local cleanups. A concrete example: `mov r1, r2` followed by `mov r2, r1` reduces to just the first move, or `add r1, r1, 0` / `mul r1, r1, 1` are deleted, or a store immediately reloaded from the same address is replaced by a register move.

Confidence: 4

## 5. Stack machine to register machine

The simple way is to simulate the stack: keep the abstract stack in memory or in a fixed scratch area, and emit each stack opcode as a load/store plus an arithmetic instruction, so the real machine stack mirrors the WebAssembly stack. The better way is to keep track of which stack slots are currently live in which registers and emit instructions that consume and produce registers directly, mapping each WebAssembly local to a fixed register where possible; even better, build a small expression tree per basic block and do a Sethi–Ullman style register allocation so you rarely spill.

Confidence: 3

## 6. Why native code is larger than bytecode

Bytecode is a densely packed instruction set with short encodings and implicit operands (the stack), so one byte often does the work of a whole instruction. Native code has to spell out registers, immediates and addresses in fixed-width encodings, needs prologues/epilogues, spills, alignment padding, relocation and calling-convention glue, and cannot reuse a generic interpreter loop the way bytecode does.

Confidence: 4

## 7. Software fault isolation

Software fault isolation (SFI) rewrites an untrusted module's machine code so that every memory access is masked or checked against the module's own data region and every branch stays inside the module's code region, so the module cannot read or write outside its sandbox even though it runs as native code in the same address space. Trusting the compiler is the opposite: you assume the code was produced correctly from a safe source language, which gives you no protection at all once the compiler is buggy or the input is hostile machine code.

Confidence: 3

## 8. Stopping a runaway handler

You can interrupt it: a timer or watchdog fires, control returns to the scheduler, and the handler is killed or resumed later (which requires either saving state or discarding it). Or you can prevent it: static analysis or a bytecode-level cost accounting proves an upper bound on the number of steps, so an over-long handler is rejected before it runs, or the code pays for each loop iteration with a decrementing budget counter and traps at zero.

Confidence: 4

## 9. Defunctionalization / await as a state machine

Defunctionalization replaces first-class functions with data: each lambda becomes a tag plus its captured environment, and every call site becomes a dispatch on the tag to the one piece of code that used to be the lambda body. For `await`, the compiler splits the function at each suspension point into numbered states, stores the locals plus the state index in a heap object, and on resume switches on the index to jump back to the right continuation.

Confidence: 3

## 10. Regions / arenas

A region is an area of memory from which objects are allocated and which is freed all at once, typically by a stack discipline or a scope; nothing inside is reclaimed individually. Compared to a garbage collector you get predictable, cheap allocation and deallocation (often one pointer bump and one reset), no tracing pauses, and no need to find the roots — but you give up reclaiming individual dead objects and you must get lifetimes right or you leak.

Confidence: 4

## 11. Typestate

Typestate tracks, in the type system, not just what an object is but which protocol state it is in, so operations are only allowed in states where they make sense. The classic example is a `File` that must be `open`ed before it can be `read` or `closed`; using it after `close`, or reading a closed file, becomes a compile-time error rather than a runtime failure. `if x != null` then dereferencing is a related idea for nullability.

Confidence: 3

## 12. Recursion forbidden

The compiler can compute a static bound on the maximum stack depth, because the call graph is acyclic and each function's frame size is known; in the strong case the whole call graph can be flattened, every call inlined or turned into a jump, and the total stack usage becomes one known constant. That makes worst-case stack usage provable, which matters for embedded targets with tiny stacks.

Confidence: 4

## 13. Amdahl's law

The speedup from optimising a part of a program is limited by the fraction of time the program spends in that part, so speeding up something that is 10% of the runtime by infinity still leaves you at most about 1.1x. It implies you should measure first and optimise the hot path — or, better, remove work entirely — rather than optimise code that hardly runs.

Confidence: 5

## 14. Gradual vs fully static typing

A fully static system requires every term to have a type the checker can verify before running, and the runtime carries no type tags for correctness. A gradual system mixes both: parts of the program can be checked statically, other parts are typed `any`/`dynamic` and checked at runtime, with consistency rules at the boundary; it is designed so you can migrate code from dynamic to static one piece at a time without rewriting everything.

Confidence: 3

# Pre-test (answer BEFORE reading anything else)

Answer each question in two to four sentences from what you already know. After each answer write `Confidence: N` where N is 1 (guessing) to 5 (certain). If you do not know, write "I do not know" — that is a useful answer.

1. What does "whole-program type inference" mean, and why can it make a compiler slow?
2. In data-flow analysis, what is a fixpoint iteration, and what is widening for?
3. What is static single-assignment (SSA) form, and what does "sparse" analysis on SSA avoid?
4. What does a peephole optimizer do? Give one concrete pattern it removes.
5. WebAssembly code is written for a stack machine. Name one simple and one better way to translate stack-machine code into code for a register machine such as RISC-V.
6. Why is native machine code usually larger than bytecode for the same program?
7. What is software fault isolation, and how does it differ from trusting the compiler?
8. A system gives each event handler a fixed time budget. Name two ways to stop a handler that loops for too long.
9. What is defunctionalization (or, if you prefer, how does a compiler turn `await` into a state machine)?
10. What is a region (arena) in memory management, and what does it give you that a garbage collector does not?
11. What is typestate? Give an example of a bug it prevents.
12. If a language forbids recursion, what can a compiler know about stack usage?
13. State Amdahl's law in one sentence and say what it implies for choosing what to optimize.
14. What is the difference between a gradual type system and a fully static one?

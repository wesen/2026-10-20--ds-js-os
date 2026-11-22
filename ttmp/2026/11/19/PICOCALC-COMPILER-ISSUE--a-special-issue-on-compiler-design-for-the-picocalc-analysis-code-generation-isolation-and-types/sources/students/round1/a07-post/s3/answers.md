# Answers to 7.9 Check your understanding

## 1

The loader restricts which reactor functions a module is allowed to *ask* for, but that restriction lives in the loader's bookkeeping and in the module's good behaviour, not in anything the processor enforces. Since every instruction of the module runs with firmware privileges and "its code can jump to any address", a module that decides to ignore the list can simply jump into any routine it likes. So the list is an agreement about what a well-behaved module will do, whereas a wall would be something the machine refuses to cross. This is the control-safety property from the section 7.1 table ("the program executes only its own code and the entry points it was given"), whose violation today is "a jump can go to any address".

Confidence: 5

## 2

The compiler registers a function name only after it has finished translating that function's body, so while `f`'s body is being read, `f` is not yet in the table and a self-call fails with `unknown function f`. For two functions, `f` calling `g` would require `g` to appear earlier in the file than `f`, and `g` calling `f` would require `f` to appear earlier than `g`; the two requirements contradict each other. The same ordering argument rules out any longer cycle, so every call goes from a later function to an earlier one and the call graph has no cycles. If the language later allows calling a function before its definition, this accident disappears, so the compiler must read all signatures first, build the call graph from the calls it finds, search that graph for a cycle and reject the program if one exists.

Confidence: 5

## 3

A stack bound is computable at compile time because the call graph is acyclic: with no recursion, the possible chains of calls form a finite set, and the longest possible chain is at most the number of functions in the file. Each function also has a frame size the backend fixes from its locals and its deepest operand stack, so the size of every link in every chain is known in advance. The bound is then the largest sum of function frame sizes along any chain of calls, plus the stack that the deepest reactor function reachable from that chain needs. The reactor part is one number because the reactor is C code with no recursion of its own and can be measured once.

Confidence: 5

## 4

Today the nucleus checks the turn budget only when the handler returns, and `while (true) { }` as native code simply never returns, so the check never runs: the kernel is stalled and every other world stops with it. With a fuel counter, the compiler puts a subtract-and-trap on the loop's back-edge, so on some iteration the counter reaches zero and the turn ends with a fault, exactly as a millisecond budget overrun does for the other engines. Fuel does not let the handler finish later: it terminates the turn as a fault rather than suspending and resuming the program, so a handler that legitimately needs more time must be written to split its work across turns, which Article 8 covers.

Confidence: 5

## 5

Address masking still confines the faulty access, because before every non-frame access the emitted code forces the address into the world's power-of-two data region with a mask and an add; the access then lands inside the world's own data whatever the comparison did, and the verifier only has to confirm that the mask is present, not that the bounds check is right. Pattern checking does not help here: it accepts a non-frame access only if it is part of the fixed sequence, and that sequence is still present and still matches the shape — it merely compares against *some* length word, possibly the wrong one. So the check can pass while testing an out-of-range index against an unrelated length, and the access escapes.

Confidence: 4

## 6

The verifier's advantage is that a reactor call costs a jump instead of a trap, and it needs no particular hardware, so it is cheap per call and available on any chip. PMP with user mode's advantage is coverage: it confines native code from any compiler, including CJI, whose output is far too varied to be checked by pattern, and it costs nothing per memory access. The hardware route is also the only one of the two that would still work if the code were produced by a compiler the project does not control.

Confidence: 4

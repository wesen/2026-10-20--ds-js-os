# Answers to "Check your understanding" (section 7.9)

## 1. "A contract, not a wall"

The loader publishes a list of functions a native module may call, and the module is expected to
honour it. Nothing enforces the list in hardware: because the module's own code can jump to any
address, once it is running it can leave the permitted entry points and land anywhere in memory.
That is what "a contract, not a wall" means — the list is a promise the firmware relies on, not a
barrier that stops a hostile module. The property concerned is control safety, the requirement that
a program execute only its own code and the entry points it was given. The same paragraph also
admits failures of memory safety ("can read and write anything") and time safety ("a module that
never returns stalls the kernel"), but the callable-function list is specifically about where
control can go.

Confidence: 5

## 2. A by-product of what, and what must be added

The absence of recursion is a by-product of the order in which the compiler records names: a
function's name enters the table of known functions only after the compiler has finished
translating its body, and a call is translated by looking the name up in that table. So a call can
only name a function defined earlier in the file; a function cannot call itself, and two functions
cannot call each other, because each would have to appear before the other. If the language later
allows a function to be called before it is defined — which Article 9 argues for as a convenience —
the compiler must add an explicit check: after reading all the signatures, build the call graph and
search it for a cycle, rejecting the program if one exists. Without that check the acyclicity
guarantee is gone, and with it the compile-time bound on stack use: the loader could no longer
refuse a program because its maximum stack requirement is too large, so a deep chain of calls could
overflow the world's stack at run time. Section 7.4 says the check itself is only a few dozen lines.

Confidence: 5

## 3. Stack need, and why it is computable during compilation

The stack need of a function is the size of its own frame plus the largest stack need among the
functions it calls; a called typed function contributes its own stack need, and a called reactor
function contributes the amount of stack that reactor function uses. The program's maximum stack
use is then the stack need of its entry function. The compiler can compute this the moment it
finishes translating a function because every callee is already translated: names are registered in
definition order, so a function can only call functions defined earlier in the file, whose stack
need is already known. The function's own frame size is fixed by the backend from its locals and its
deepest operand stack (Article 5), and reactor functions are non-recursive C code whose stack use is
measured once when the firmware is built, so both quantities are constants rather than run-time
unknowns.

Confidence: 5

## 4. Subtracting 1 versus subtracting a larger amount

Subtracting 1 at each back-edge bounds only the number of loop iterations, because every iteration
is charged exactly one however much work it does inside. Subtracting the greatest number of
instructions that one trip around the loop body can execute instead bounds executed instructions:
the amount is an upper bound on each iteration's true cost, so the counter is an upper bound on
total instructions, and a budget in milliseconds follows from the processor's speed. That
per-iteration amount ignores inner loops, which have back-edges of their own and charge themselves;
for an `if` the compiler takes the longer branch. A call to a typed function adds that function's
own greatest straight-line cost, which is known because the callee was compiled first.

A call to a reactor function cannot be charged by inspecting its code, so it must be charged its
worst case for the arguments it is given: for a search over a span, the length of the span. Working
through the arithmetic with the article's rules: suppose a loop body has 5 instructions of its own,
contains an `if` whose arms are 8 and 3 instructions, and calls a typed helper whose straight-line
cost is 30; the charge per iteration is 5 + 8 + 30 = 43. With a fuel grant of 100,000 the loop
therefore stops after at most 100,000 / 43 ≈ 2,325 iterations, and at 100 million instructions per
second the grant corresponds to 100,000 instructions, that is 1 millisecond.

Confidence: 4

## 5. An integer where a buffer reference belongs

Address masking still confines the access. Before every non-frame access the emitted code computes
`address = base + (address AND mask)`, with the region's base and mask held in two reserved
registers and the world's data region a power of two in size, so whatever value the faulty compiler
produced is forced to point inside the world's own data; the result is a wrong value in the world's
own memory, which is the world's own problem. Pattern checking accepts the code because the emitted
access sequence is complete and in the fixed order the verifier expects — load the length, compare,
trap if out of range, compute the address, access — and the verifier confirms only that the access
is bounds-checked against *some* length word. It never checks that the base address really is a
buffer, so the "length" is read from wherever the integer happens to point and the index is compared
with that. That is why the article says that with pattern checking alone, memory safety still depends
on the compiler keeping types straight.

Confidence: 5

## 6. One advantage each way

The software verifier's advantage is the cost of a reactor call: a jump, against "a trap, tens of
instructions or more" for PMP with user mode, and reactor calls are frequent. It also depends on no
particular chip feature, whereas the PMP route needs the processor to provide the registers and the
user mode. PMP's advantage is coverage: it confines native code from any compiler, including CJI's
output, which is far too varied to be accepted by a verifier that only knows the one shape the typed
backend emits. Both are listed as protecting against compiler errors and both cost nothing per
memory access with pattern checking (two instructions with masking), so neither of those is a
difference.

Confidence: 5

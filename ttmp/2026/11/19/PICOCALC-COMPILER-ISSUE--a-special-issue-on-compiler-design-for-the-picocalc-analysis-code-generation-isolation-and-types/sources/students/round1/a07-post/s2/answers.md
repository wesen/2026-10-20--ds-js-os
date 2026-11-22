# Answers to "7.9 Check your understanding"

## 1

The loader limits which reactor functions a module may call, but nothing enforces the limit:
the comment says the module "can jump to any address", so the list is a rule that trusted code
is expected to obey rather than a barrier the machine imposes. Since the same sentences say a
module "can read and write anything", the passage covers memory safety as well as control; the
phrase "contract, not a wall" is aimed at control safety, because the thing the contract
constrains is what the module may call and where it may jump. In the article's terms it is the
property that the program executes only its own code and the entry points it was given.
Confidence: 4

## 2

The compiler keeps a table of functions defined so far and enters a name only after the body
has been completely translated, so a call compiles only if the callee is already in the table.
Then for `f` to call `g`, `g` must come earlier in the file, and for `g` to call `f`, `f` must
come earlier; both cannot hold, and the same ordering argument kills any longer cycle. If the
language later allows forward references, source order no longer implies acyclicity, so the
compiler must read all the signatures first, build the call graph, and search it for a cycle,
rejecting the program if one exists. Without that check the bounded-stack argument silently
fails, because a recursive function makes the maximum depth unbounded.
Confidence: 5

## 3

Every function's frame size is a compile-time constant, fixed by its locals and its deepest
operand stack, and the call graph is finite and acyclic, so the deepest chain of nested calls
is finite and can be walked. The maximum stack use is that largest sum of frame sizes along any
chain of calls, plus the stack the deepest reactor function reachable from that chain needs.
The first quantity is summed over the program's own frames; the second is a constant, since the
reactor is C code with no recursion of its own, so it can be measured once. The loader can then
compare the total with the stack given to the world and refuse the program before it runs, with
no run-time stack check.
Confidence: 4

## 4

Today the nucleus only checks the turn budget when the handler returns, so `while (true) { }`
never returns, the check never runs, and the world keeps the processor forever, stalling the
kernel and every other world. With fuel, the compiler emits a decrement and a test on the
loop's back-edge; even the empty body reaches that back-edge on every iteration, so the counter
reaches zero, the trap fires, and the turn ends with a fault just as a budget overrun does for
the other engines. Fuel does not let the handler finish later: it stops the program and does
not resume it, so a program that needs more time must still split its work across turns.
Confidence: 5

## 5

Address masking still confines the faulty access. Whatever the bounds check did, the mask and
add emitted before every non-frame access force the computed address into the world's own
power-of-two data region, so the access lands in the world's memory, and the verifier only has
to confirm that the mask is present. Pattern checking does not confine it, because the emitted
sequence — load length, compare, trap, compute address, access — still has the right shape; the
check merely proves the access was compared against *some* length word, so a comparison against
the wrong register passes the verifier while protecting the wrong object.
Confidence: 4

## 6

The verifier needs no chip feature and costs almost nothing per operation: zero to two
instructions per memory access and a plain jump per reactor call, whereas PMP charges nothing
per access but a trap of tens of instructions or more for every reactor call. PMP, in return,
works for native code from any compiler, including CJI, whose output is far too varied to be
checked by pattern; the verifier accepts only code in the verified shape.
Confidence: 5

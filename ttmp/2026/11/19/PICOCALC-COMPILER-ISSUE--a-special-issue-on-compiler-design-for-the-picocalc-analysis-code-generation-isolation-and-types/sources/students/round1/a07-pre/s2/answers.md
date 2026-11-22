# Answers — "7. Safety by Construction: Running Native Code Without Trusting It"

*(Written without access to the article. Answers are reasoning from the question wording and from
general compiler/embedded knowledge; guesses about the article's own vocabulary are flagged.)*

## 1

"Contract" here means the list is a promise about the ABI surface the runtime offers: these are the
functions whose address, calling convention, and behaviour the native code may rely on, and the
loader author agrees that the list is stable. "Not a wall" means the list is documentation, not an
enforcement mechanism — nothing in the loader or the hardware stops native code from jumping to an
address that is not on the list, because a raw `bl` to a computed address is indistinguishable from a
legitimate call. So it concerns the isolation/control-flow property (the code can only reach what it
was given), and it is precisely the property that the list fails to establish by itself.

Confidence: 3

## 2

The argument is an ordering argument: if the language requires a function to be defined before it is
used, the call relation is a partial order that exactly follows source position, and a cycle
`f → g → f` would require `f` to appear both before and after `g`, which is impossible in a total
order of declarations. Since every call goes strictly "backwards" in the program text, the call graph
is acyclic, and termination of the call structure plus a finite call depth follow for free. If
forward references were allowed, the compiler would need a name-resolution pass over the whole
program before code generation, plus an explicit check that the call graph has no cycle (strongly
connected components or a topological sort) and a rejection or a different stack model when a cycle
is found.

Confidence: 3

## 3

It is possible because the call graph is acyclic and frames are fixed-size: there is no recursion, no
variable-length arrays or alloca, no dynamic dispatch, and no pointers-to-functions escaping, so the
set of possible call paths is finite and enumerable at compile time. The bound is computed by the
standard recurrence: a function's stack requirement is its own frame size (locals, saved registers,
spill slots) plus the maximum, over its callees, of that callee's requirement. So the two quantities
summed at each node are the function's own frame size and the worst-case requirement of its callees;
the whole-program figure is the maximum over entry points.

Confidence: 3

## 4

Today, `while (true) { }` becomes a two-instruction branch loop (`b .` after optimization), and when
the handler is entered the core simply never returns: the handler never completes, the supervisor
never gets a result, and everything scheduled behind it starves. Nothing in the generated code
checks the condition against a limit, so no amount of waiting helps — it is a livelock, and only an
external watchdog or a reset recovers the device. With a fuel counter the loop body debits fuel and
the counter eventually traps, so control returns to the supervisor with an "out of fuel" error
instead of hanging. Fuel therefore buys liveness of the system, not progress of that handler: the
work is still not finished and cannot be finished later from the same activation (at best the
handler is re-run from the start with fresh fuel, or reported as failed).

Confidence: 3

## 5

The technique that still holds is the hardware sandbox (PMP-style region limits), because it is
enforced by the memory protection unit on every access and does not depend on the generated code
being correct: if the faulty comparison lets the offset through, the write still lands on an address
outside the granted region and faults. A software/compile-time verification of the bounds checks does
not save you here, because its guarantee is conditional on the emitted instruction actually being the
one that was reasoned about — a bug that swaps the register operand breaks the premise of the proof,
and the verifier has no independent notion of which register holds the length. (If the article frames
the two techniques differently, the answer has the same shape: the hardware check is
unconditional, the software check is only as good as the compiler it certifies.)

Confidence: 3

## 6

The software verifier's advantage is that it needs nothing from the hardware: it runs on a plain
microcontroller with no PMP/MPU and no user mode, it can check properties a memory region cannot
express (types, calling convention, termination, immutability of the code image), and its regions and
policies are cheap to redefine per call because they are compile-time artefacts rather than a small
set of hardware region registers. PMP with user mode's advantage is that it does not have to be
correct about the program at all: it is a small, hardware-enforced trusted base that still contains
the damage when the verifier, the compiler, or the runtime is wrong. In short: the verifier is
portable and expressive, the hardware sandbox is sound even in the presence of compiler bugs.

Confidence: 3

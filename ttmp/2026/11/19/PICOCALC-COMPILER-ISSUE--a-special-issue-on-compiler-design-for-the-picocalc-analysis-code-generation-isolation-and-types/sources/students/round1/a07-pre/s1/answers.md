# Answers (written before reading the article)

## 1. "A contract, not a wall"

A contract is an agreement between parties who are assumed to keep it; a wall is a physical
obstacle that holds even against someone who does not cooperate. The comment therefore means that
the loader's list of callable functions is backed by the compiler promising to emit calls only to
those names (and the loader resolving only those names), not by hardware that traps an illegal
call. I cannot know this without the article, but of the three safety properties this must be the
one about *authority* or *interface* discipline — what the untrusted code is allowed to invoke in
the host — and not the memory-safety property, because a list of names cannot stop a computed
jump or a stray store.

Confidence: 2

## 2. Two typed functions cannot call each other

The usual argument is definition-before-use: a call is only legal to a function that has already
been compiled, and a function may not call itself, so every edge in the call graph points from a
later definition to an earlier one. An edge chain that always moves "backwards" through the
definition order is acyclic, so two functions cannot each be on the other's chain — mutual
recursion would require each to be defined before the other. If the language later allows calls
to a not-yet-defined function, the compiler must add a call-graph cycle check (a strongly
connected component or topological sort test over the whole program, not just the current
function) that rejects recursion, plus a way to read a forward declaration's signature.

Confidence: 3

## 3. Compile-time bound on stack use

Because there is no recursion and no dynamic stack allocation, the call graph is a finite DAG and
every frame size is known once the function is compiled, so the worst case is the worst path, not
an unbounded family of paths. The two quantities summed per function are the function's own frame
size and the largest stack bound among the functions it calls (with zero for a leaf); taking the
maximum over callees rather than the sum is what makes this a bound and not a gross
overestimate.

Confidence: 3

## 4. `while (true) { }` in a handler

As plain native code, the loop never exits and nothing can take the CPU back: there is no
scheduler and, in the setup the article seems to describe, no preemption that would matter, so the
handler spins forever and the device is wedged until a watchdog or a power cycle. With a fuel
counter, each loop back-edge (or each basic block) decrements a budget and the handler traps out
when the budget hits zero, so control returns to the loader and the fault can be reported and
contained. Fuel does not let the handler finish its work later in any real sense: it only bounds
how long the handler may run, so a handler needing more work than the budget will be killed every
time unless its work is split into fuel-sized chunks whose state is preserved across runs.

Confidence: 4

## 5. Compiler bug in a bounds check

The technique that still confines the access is the hardware region boundary (PMP-style
protection of the handler's own memory): the check is made by the hardware on the actual address,
so it does not depend on any register or comparison the compiler emitted. The software/typed
check fails here precisely because it *is* the faulty code — a comparison against the wrong
register simply passes an address it should have rejected, and the following access goes wherever
the pointer says. That is the general shape of the argument: one technique assumes the compiler is
correct, the other does not.

Confidence: 3

## 6. Verifier vs. PMP with user mode

The verifier can enforce things hardware cannot express at all — bounded stack use, termination
under fuel, the no-recursion and import-contract rules — and it does so with no runtime cost and
no dependence on special CPU features, so it also works on parts with no PMP or user mode. PMP
with user mode, in turn, is independent of the compiler being correct: it constrains what the
code actually does rather than what the analysis believes the code does, so it survives a
miscompilation, a verifier bug, or hand-written or malicious machine code that never went through
the analysis.

Confidence: 3

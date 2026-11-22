# Answers (no article provided)

## 1. "A contract, not a wall"

I cannot know this without the article, but the phrase reads as follows: the comment lists the
host functions a handler may call, and the loader resolves exactly those names, so the list is an
agreement between compiler and runtime (the compiler promises to emit only those symbols, the
loader promises to resolve only those) rather than a barrier that physically stops a program from
reaching anything else. A wall would be enforced by hardware or by a checking mechanism that
inspects the machine code; a contract is enforced only by the compiler's discipline, which is
exactly why it can be silently broken by a compiler bug. Which of the three safety properties it
concerns is not determinable from the quiz alone; my best reading is that it concerns the
capability/interface confinement property (a handler can only affect the world through the named,
declared surface) rather than memory safety (which is bounds checks) or time boundedness (which is
fuel).

Confidence: 2

## 2. Two typed functions cannot call each other

A function's body can only reference names that are already in scope, i.e. functions defined
earlier in the source; so if `f` calls `g` then `g` is defined before `f`, and for a mutual
recursion `g` calling `f` back would have to reference `f` before its definition, which the
language forbids. The argument is therefore a well-foundedness argument on definition order: call
edges strictly decrease definition position, so the call graph is acyclic and no cycle of length
two (or more) can exist. This also rules out a function calling itself, which is what makes the
stack bound of question 3 possible. To allow calling before definition, the compiler would need a
declaration pass (or at least signature collection) that builds a symbol table of all top-level
signatures before any body is type-checked and lowered, plus an explicit acyclicity check over the
resulting call graph — otherwise the whole termination/stack-bound argument collapses.

Confidence: 4

## 3. Compile-time stack bound

I cannot know the exact formula without the article, but the reason a bound exists is that the
language forbids recursion and any re-entry of a function: since call edges follow definition
order, every call chain is a strict subsequence of the definition list, so the number of frames is
bounded by the number of functions and the total is bounded by a sum over an acyclic call graph.
The two quantities summed are, most plausibly, (a) the size of a function's own frame (locals,
parameters, spilled temporaries) and (b) the largest stack bound among the functions it may call —
with the empty-callee case contributing zero. Written as an equation, `bound(f) = frame(f) +
max(bound(g) for g in callees(f))`, computed in definition order so the callee bounds are already
known; a variant of the same idea sums the frames along the deepest call chain, which is the same
number expanded out.

Confidence: 3

## 4. `while (true) { }` under native code and under fuel

Run today as native code, an empty infinite loop simply executes backward branches forever: the
handler never returns, nothing inside the sandbox is at fault, and the only exits are an external
reset, a watchdog, or power-off — the interpreter is starved and the machine appears hung. With a
fuel counter, the backward branch (or each basic block) debits fuel, and when the budget hits zero
the runtime traps, kills the handler and returns a "budget exhausted" error to the interpreter, so
the host survives. Fuel does not let the handler finish its work later: the trap is terminal for
that invocation, the handler's stack and locals are gone, and "later" would mean either an
unbounded resumption mechanism (checkpoints, which buys back the hang) or re-running the handler
from the beginning with a larger budget, which is a fresh attempt and not a continuation.

Confidence: 4

## 5. Bounds check against the wrong register

I cannot know which two techniques section 7.6 names, but the shape of the answer is that the two
are a compiler-emitted bounds check and an independent hardware confinement mechanism (an
MPU/PMP region, or a similar address-limit register set by the loader). If the check compares
against the wrong register, the check itself is compromised: it may accept an out-of-range index
and then perform the load or store, so the software technique gives no guarantee — it is exactly
the thing that broke. The hardware technique still confines the access because the limit is
programmed once at load time, outside the generated code, and the fault is raised by the memory
system on the actual address, independent of which register the comparison used; the faulty access
faults instead of escaping. The general principle is that the second technique's correctness must
not be a function of the first one's output.

Confidence: 3

## 6. Verifier vs PMP with user mode

An advantage of the software verifier over PMP plus user mode is portability and granularity: it
needs no particular memory-protection hardware, it can reject a bad handler at load time before a
single instruction runs, and it can reason about properties (such as the type-level acyclicity and
stack bound) that no runtime region check can express. An advantage of PMP plus user mode over the
verifier is that it does not depend on the verifier being correct: a bug in the checker, or a
handler that is well-typed but hostile, is still contained by the hardware at run time, whereas a
verifier's guarantee is only as good as the verifier and the compiler. The two are complements —
static argument for the properties that can be proven, hardware for the ones that cannot — which
is presumably why the article keeps both.

Confidence: 3

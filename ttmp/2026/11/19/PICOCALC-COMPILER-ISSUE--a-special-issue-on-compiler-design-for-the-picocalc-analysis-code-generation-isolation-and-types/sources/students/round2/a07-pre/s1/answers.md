# Answers — "7. Safety by Construction: Running Native Code Without Trusting It"

Note: I was given only the questions, not the article. These answers are reasoning from the
question wording and from the general shape of such a design (a small JS OS with a native-code
path). Where a specific number, name or definition is quoted from the article, I flag it.

---

## 1. "A contract, not a wall"

The phrase says the list of callable functions is an agreement the trusted side (compiler,
verifier, loader) honours when producing and accepting code, not a barrier enforced when the code
runs. Nothing at runtime checks that a native routine only calls the functions on the list; if you
hand-wrote or patched the machine code, you could call anything the CPU can reach. It therefore
concerns the isolation/authority property (the entry points a native module may use, and hence
which other components it can affect), not the property that bounds its own memory or its stack.
The memory and stack properties have to be held up by the other mechanisms even if this list is
violated.

Confidence: 2

## 2. The absence of recursion as a by-product

It is a by-product of the single-pass, definition-before-use translation order: because a function
can only call functions already translated, the compiler never has to reason about cycles in the
call graph in order to finish a function's frame or cost. If the language later permitted a call
before the definition, the compiler would have to add a deferred pass over the call graph — a
second pass, a placeholder-and-patch, or an iterative fixed point that propagates stack and cost
numbers around cycles until they stop changing (plus a check that the cycles are bounded). Without
that addition, a function's stack need and its cost could no longer be a constant known at the
moment translation of the function ends, so the static, compile-time bound on stack and work would
be lost and the loader would have nothing to trust.

Confidence: 2

## 3. Stack need, and why it is computable at the end of a function

I cannot know the article's exact wording, but the only definition that fits is recursive: a
function's stack need is its own frame size (locals plus spills plus saved registers) plus the
largest stack need among all functions it calls — the maximum over call sites, never a sum over
different call sites, because calls do not overlap in time. It is computable the moment
translation of the function finishes because every callee has already been translated and so has a
known constant stack need, and because there is no recursion, no callee's number can still be
pending (or depend on the current function). The result is a plain integer that can be checked
against whatever growth limit the runtime allows.

Confidence: 2

## 4. Subtracting 1 versus subtracting more at a back-edge

I cannot know this without the article, but the two charges look like two different measures of a
metered, decreasing counter. Subtracting exactly 1 at each back-edge bounds the number of loop
iterations (each pass through the loop costs one unit, so the counter runs out after at most
"initial value" iterations, which is a cheap but coarse bound on how much work a loop can do). A
larger amount bounds a weighted measure instead: it charges a back-edge by the cost of the work on
that path, so the counter bounds total work rather than iteration count, which lets you charge a
loop whose body is expensive without inflating the iteration bound. The natural reading of the
charging rule is that a call to a typed function is charged through that function's already-known
static cost (so it can be folded into the caller's totals, and possibly charged nothing extra at
the call site), whereas a call to a reactor function cannot be bounded statically at all and so
must be charged a fixed, larger amount at each call, or rejected.

Confidence: 1

## 5. An integer where a buffer reference belongs

If the two techniques are hardware region confinement (PMP-style memory protection around the
module) and a software verifier over the generated code, then the hardware confinement is the one
that still holds: whatever value is used as an address, the CPU can only reach the module's own
region, so the bad access is trapped or lands inside memory the module owns anyway. The verifier
accepts the code because it inspects the emitted instructions, not the compiler's intent — a
load/store with a bounded displacement still looks in-range when the thing it fails to track is
the provenance and type of the base value. That is exactly the failure mode worth naming: the
verifier checks the shape of the code, so a bug that produces well-shaped but semantically wrong
code slips past it.

Confidence: 1

## 6. Verifier versus PMP plus user mode

The verifier's advantage: it needs no special hardware, no user-mode privilege transitions and no
trap on entry — a call into native code can be an ordinary call with ordinary speed.
It also can enforce fine, per-module, byte-granular limits, where a hardware protection unit
usually only offers a handful of power-of-two regions.
PMP with user mode's advantage: its guarantee does not depend on the correctness of the compiler
or the verifier, so a compiler bug like the one in question 5 is still contained by the hardware
rather than by the analysis that was supposed to catch it.

Confidence: 2

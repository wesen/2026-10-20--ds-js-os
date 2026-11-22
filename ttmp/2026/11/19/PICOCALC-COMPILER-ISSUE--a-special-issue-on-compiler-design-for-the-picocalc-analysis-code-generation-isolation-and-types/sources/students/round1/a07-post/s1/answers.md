# Answers to §7.9 "Check your understanding"

## 1. "A contract, not a wall"

The loader limits *what a module may call* by handing it a fixed list of permitted entry points, and a module that was compiled honestly will only call those. But that list is enforced by agreement, not by the processor: the article says plainly that the module's "code can jump to any address", so nothing physically stops it from jumping over the list into the kernel or into any other code. A wall would be a mechanism that makes the forbidden jump impossible; a contract is only a promise that is not checked.

The property this concerns is **control safety** — the requirement that the program executes only its own code and the entry points it was given. It does not directly concern memory safety or time safety, although a jump anywhere can obviously be used to obtain both.

Confidence: 4

## 2. Mutual recursion and what must be added

Work the compiler's rule through. A name enters the table only when its body has been fully translated, and a call resolves the name against the table as it stands at that moment. So a self-call inside `f` fails, because `f` is not yet registered while `f` is being read: the article gives the exact diagnostic, `unknown function f`. For two functions, let `f` call `g`: then `g` must be fully defined before `f` is, i.e. `g` appears earlier in the file. Let `g` call `f`: then `f` must appear earlier. Both orders cannot hold at once, so the pair is impossible, and the same reasoning by induction excludes any longer cycle. Hence every call edge points backwards in file order and the call graph is acyclic.

If the language is later changed to allow forward calls (Article 9 wants this for convenience), the acyclicity is no longer a free by-product of reading order and must be made an explicit check. After all signatures have been read, the compiler must extract the call graph from the bodies, search it for a cycle, and reject the program if one is found. The article says this is a few dozen lines and warns that without it "the stack bound silently disappears".

Confidence: 5

## 3. Why a stack bound is computable, and the two quantities

A stack bound is computable because two things that are normally dynamic become static. First, there is no recursion, so the call graph is finite and acyclic (answer 2), which means the longest chain of nested calls is at most the number of functions in the program and can be found by one walk over the call graph. Second, each function's frame size is fixed by the backend from that function's locals and its deepest operand stack, so the frame size is a compile-time constant per function rather than something that depends on data.

The number is then formed as a sum of two terms:

    max_stack = max over all call chains C of ( sum of frame sizes of the typed functions on C )
                + ( stack needed by the deepest reactor function that chain can reach )

So, concretely, if the longest chain is `helper → scan → render → onEvent` with frames 16, 32, 48 and 64 bytes, the typed part is 160 bytes, and the reactor constant is added on top of that. The reactor part is a single measurable constant because the reactor is C code with no recursion of its own. A loader holding this number can reject an oversized program before executing any instruction, which is why no run-time stack check is needed.

Confidence: 4

## 4. `while (true) { }` today, and with fuel

Today the nucleus checks a native world's turn budget *after the handler returns*. A handler containing `while (true) { }` never returns, so the check is never reached; the module "stalls the kernel" and, in the language of §7.1, "a loop that never ends stops every world". Time safety fails completely, and the other worlds get no turns.

With a fuel counter the world is handed a number at the start of each turn, and the compiler emits, at every back-edge — the point in the loop body where control jumps back to the loop start — instructions that subtract from that number and trap at zero. `while (true) { }` has a back-edge and cannot avoid passing it, so after finitely many iterations the count reaches zero and the turn ends in a fault, exactly as a budget overrun does for the interpreted engines. The stall is converted into a clean termination.

Fuel does **not** let the handler finish its work later. The article is explicit: "Fuel stops a program; it does not schedule it." There is no saved continuation and no resumption; the turn is over. A handler that genuinely needs more time has to be rewritten to divide its work across turns, which the article defers to Article 8. (Fuel can be made to *measure* work accurately — subtracting the loop-body instruction count at each back-edge so the counter bounds executed instructions — but measuring the failure more precisely still does not repair it.)

Confidence: 5

## 5. Wrong-register bounds check: which technique still confines

**Address masking** still confines it. Masking does not inspect what the compiler meant; before every non-frame access it forces the address into the world's data region with a mask and an add, where the region's size is a power of two. So whatever the faulty compare decided, the store or load that follows still lands inside the world's own data. Its guarantee "depends on nothing but the mask being present, which the verifier can confirm", which is why a compiler bug cannot escape it.

**Pattern checking** does not help here. The verifier accepts a non-frame access only as part of the exact five-step sequence (load the length, compare, trap if out of range, compute the address, access), and the wrong-register bug leaves that sequence syntactically intact — the pattern still matches. All the pattern establishes is that the access was checked against *some* length word, and the bug is precisely that it is the wrong one, so a bad index can pass the compare and the access leaves the buffer. The article makes the related point separately: pattern checking "does not confirm that the base address really is a buffer".

Confidence: 5

## 6. One advantage each way

**Advantage of the software verifier:** each reactor call is only a jump, so it is cheap; PMP with user mode charges "a trap, tens of instructions or more" on every reactor call, and reactor calls are frequent. A second, equally usable advantage is that the verifier needs no special chip features, whereas PMP depends on how many entries the chip can spare.

**Advantage of PMP with user mode:** it works "for native code from any compiler, including CJI", because the hardware confines by address region rather than by the shape of the instruction stream. The verifier only accepts code in the one shape the backend emits, so it cannot be applied to CJI's far more varied output.

Confidence: 5

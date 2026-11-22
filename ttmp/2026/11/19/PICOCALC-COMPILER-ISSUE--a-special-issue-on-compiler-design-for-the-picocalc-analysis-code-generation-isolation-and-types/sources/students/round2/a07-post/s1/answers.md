# Answers to "Check your understanding" (Article 7)

## 1

The loader restricts *which* functions a module may call by publishing a list and expecting the module to obey it, but nothing in the loader stops a module from ignoring the list. The article quotes the source comment that "its code can jump to any address", so the restriction is an agreement the compiler is trusted to keep, not an enforced barrier — a "wall" would be a mechanism that refuses the jump at run time. This concerns **control safety**: the program should execute only its own code and the entry points it was given. The list of callable functions is a promise about what the code will *do*, not a limit the hardware or loader imposes. Memory safety is a separate matter (the comment also says a module can read and write anything, including the kernel).

Confidence: 4

## 2

It is a by-product of how the compiler registers names: a function's name is entered in the symbol table only after its body has been translated, so a call can only ever name an already-registered (earlier) function natively. No rule of the typed language says "recursion is forbidden"; the ban falls out of that one implementation detail. If the language is later changed to let a function be called before it is defined (which section 7.4 says Article 9 argues for), then the compiler must add an explicit check: after reading all the signatures, extract the call graph and search it for a cycle, rejecting the program if one is found. The article estimates this as "a few dozen lines". If the check is not added, the acyclicity is gone, and with it the compile-time bound on call depth and maximum stack use — the loader could no longer refuse an over-large program before running it.

Confidence: 5

## 3

Section 7.4 defines a function's **stack need** as the size of its own frame plus the largest stack need of anything it calls; a called typed function contributes its own stack need, and a called reactor function contributes the stack that that C function uses. The program's maximum stack use is then the stack need of its entry function. The compiler can compute this at the moment it finishes a function because every callee is defined *earlier* in the file (the very property that rules out recursion), so each callee's stack need was already computed and stored, and the largest can be taken immediately. The only quantities it cannot derive itself — the stack use of reactor C functions — are measured once when the firmware is built, since those functions do not recurse and so have a fixed stack cost. That makes the whole figure a compile-time number, so a loader can reject a too-greedy program before executing any of it.

Confidence: 4

## 4

Subtracting 1 at each back-edge bounds only the *number of loop iterations*; it counts trips round the loop, nothing finer. Subtracting a larger amount bounds *executed instructions*: the compiler charges the greatest number of instructions one trip round the body can execute, ignoring inner loops (they have their own back-edges). Working of the walk described: for an `if`, take the longer branch's count; for a call to a typed function, add that function's own greatest straight-line cost, which is known because it was compiled earlier, and do not add anything for its loops since those pay for themselves. Because each charge is an upper bound on the real cost of that iteration, the total is an upper bound on instructions executed, and dividing by the processor's instruction rate gives a budget in milliseconds. A reactor call must also be charged, and its charge has to be its worst case for the given arguments (for a search, the length of the span searched), because the cost depends on the data, not just on the call site.

Confidence: 4

## 5

**Address masking** still confines the access. Each world gets a power-of-two-sized data region with its base and a mask in two reserved registers, and every non-frame access is preceded by `address = base + (address AND mask)`. Whatever the compiler computed — including an integer standing in for a buffer reference — masking forces the address into the world's own data region with two instructions, so the stray access reads or writes the world's own memory and cannot touch the kernel. **Pattern checking** accepts the bad code because it only confirms the *shape*: it checks that a non-frame access appears as the fixed sequence "load length, compare, trap if out of range, compute address, access", and that every access is bounds-checked against *some* length word. Here the integer points somewhere arbitrary, the code reads a "length" from there, compares the index against it, and the sequence is complete — so the verifier passes it and the access goes astray. Pattern checking therefore leaves memory safety dependent on the compiler having kept types straight, which is exactly the guarantee a compiler bug breaks.

Confidence: 5

## 6

Advantage of the **software verifier**: it costs nothing per reactor call — the article's comparison table gives "a jump" against "a trap, tens of instructions or more" for PMP with user mode — so frequent reactor calls stay cheap, and it needs no special chip features (whereas PMP relies on the processor offering user mode and spare PMP entries). A second verifier advantage is precise language-level diagnostics plus a much smaller trusted base: a few hundred lines of C instead of a ~1,070-line JavaScript compiler and QuickJS. Advantage of **PMP with user mode**: it confines native code from *any* compiler, including CJI, whereas the verifier only accepts code emitted in the backend's fixed shapes. The article calls that "the hardware route's distinctive advantage", and it matters because CJI's output is far too varied to verify by pattern. PMP also protects against compiler errors outright, without needing masking to be added.

Confidence: 4

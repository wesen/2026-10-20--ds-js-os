# Answers to "Check your understanding" (Article 7)

1. It means the loader can only *tell* a module which reactor entry points it is
   allowed to call — the allowed list is a promise the module's code is expected to keep,
   not a barrier that makes breaking it impossible, because nothing stops a jump to an
   arbitrary address. The loader restricts what the module calls *through the table*, but a
   single jump instruction can bypass the table and land anywhere, including in the kernel.
   So the property concerned is control safety: the program executes only its own code and
   the entry points it was given. It is not the memory-safety clause ("can read and write
   anything"), although a jump out of the region is the usual way memory safety is lost too.
   Confidence: 5

2. A by-product of how the compiler registers names: it reads the file top to bottom, enters a
   function's name in its table only when it has *finished* translating that body, and
   translates a call by looking the name up in the table, so a function cannot call itself or
   anything defined later. Recursion is thus not forbidden by the typed language — it simply
   fails to compile with `unknown function f`. If the language later allows a call before the
   definition (as Article 9 proposes), the compiler must add an explicit check: after reading
   all signatures, search the extracted call graph for a cycle and reject the program if one
   exists, which the article says is a few dozen lines. Without that check the call graph is no
   longer guaranteed acyclic, so the bounded call depth, and with it the compile-time number
   for maximum stack use, silently disappears.
   Confidence: 5

3. The stack need of a function is the size of its own frame plus the largest stack need of
   anything it calls, where a called typed function contributes its own stack need and a called
   reactor function contributes the stack that that C function uses. The compiler can compute
   it the moment it finishes the function because calls only ever go to earlier functions: every
   callee has already been translated, so its stack need is already known. The frame size of the
   function itself is fixed by the backend from its locals and its deepest operand stack, and
   each reactor function's stack use is a fixed quantity measured once when the firmware is
   built. So finishing a function costs one pass over its calls taking a maximum of already-known
   numbers, and the whole program's maximum stack use is just the stack need of its entry function.
   Confidence: 5

4. Subtracting 1 at each back-edge bounds the number of loop iterations and nothing finer, while
   subtracting instead the greatest number of instructions that one trip around the body can
   execute — taking the longer branch of an `if`, and not counting inner loops, which have their
   own back-edges — bounds executed instructions, from which a budget in milliseconds follows
   from the processor's speed. A call to a typed function is charged that function's own greatest
   straight-line cost, which is known because the callee was compiled first and whose loops charge
   for themselves; a call into the reactor is charged its worst case for the actual arguments, for
   example the length of the span being searched. Because every charge is an upper bound on the
   real cost of one iteration, the counter remains an upper bound on the instructions executed.
   Confidence: 4

5. Address masking still confines the access: before every non-frame access the code rewrites the
   address as `base + (address AND mask)`, so whatever the compiler produced, the access lands
   inside the world's own power-of-two-sized data region and at worst yields a wrong value in the
   world's own memory. Pattern checking instead accepts the code because it only confirms that the
   access appears as the complete fixed sequence (load length, compare, trap if out of range,
   compute address, access) and that the index is checked against *some* length word. It never
   confirms that the base address really is a buffer, so an integer passed where a buffer reference
   belongs works fine: a "length" is read from wherever the integer points, the index is compared
   against it, the sequence is well formed, and the verifier accepts a wild access.
   Confidence: 5

6. The verifier's advantage: a reactor call costs a jump instead of a trap of tens of instructions
   or more, and it depends on no chip feature, so it needs neither spare PMP entries nor a software
   stack that tolerates user-mode worlds. PMP with user mode's advantage: it confines native code
   from *any* compiler, including CJI's far-too-varied output, whereas the verifier only accepts code
   in the one shape this backend emits. In short the verifier is cheaper per call but narrower, and the
   hardware route is more general but costs a trap per reactor call and is unproven on this chip.
   Confidence: 4

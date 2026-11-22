# Feedback from a student reader

## Passages I had to read twice

> "The world is given a number at the start of each turn. The compiler emits, at the end of every loop body where control jumps back to the loop's start (the **back-edge**), instructions that subtract from the number and trap if it has reached zero."

Unclear: it says "a number" and "subtract from the number" without saying by how much at first, and the third bullet later says the amount can be "the length of the loop body". So the reader cannot tell on the first pass whether the decrement is one unit or the whole body. It also does not say whether fuel is refilled per turn or per world lifetime, which matters for a handler that runs many turns.

> "It is the largest sum of frame sizes along any chain of calls, plus the stack needed by the deepest reactor function that chain can reach."

Unclear: a function can call two or three different reactor functions, so "the deepest reactor function that chain can reach" forces the reader to guess that you take the maximum over reactor calls reachable from the chain, and that the reactor's frames stack on top of the chain rather than replacing something. The article never gives a small worked example, so this is a rule I had to reconstruct rather than read.

> "Pattern checking confirms that every access is bounds-checked against *some* length word. It does not confirm that the base address really is a buffer, which still depends on the compiler having kept types straight."

Unclear on first reading whether this is a strength or a warning, and it is the only place where the two techniques are compared qualitatively before the table row "Every load or store that is not relative to `sp` is confined", whose meaning is only defined two paragraphs later. I had to read the whole of 7.6 before I understood that this sentence is saying pattern checking is the weaker of the two.

> "A -. "NOT POSSIBLE: scan is not yet defined" .-x B"

The label describes what `scan` cannot call, but the edge is drawn from `helper` to `scan`, so the arrow points from the target to the caller. I read it as "helper cannot call scan", which is the opposite of the intended point that `scan` cannot call `helper`.

> "| Language-based safety | ... | Partly present |"

"Partly present" in the "On this device" column is never justified in that section: 7.3 argues the source language is safe but the faithful-compilation part is unproven, and 7.6 is still hypothetical. I could not tell whether "partly" means "the source language only" or "source language plus something shipped".

## Terms used before they were explained, or never explained

- *world* — stated in the introduction as covered by Article 1, so never defined here.
- *turn budget* — deferred to Article 1, then used in 7.5 to explain fuel.
- *engine* — deferred to Article 1.
- *reactor* — deferred to Article 1, and its "28 functions" are never listed.
- *trap* — deferred to Article 1, yet central to 7.5 ("trap if it has reached zero").
- *nucleus* — never explained anywhere in the article; used in 7.5 and 7.7 as though known.
- *CJI* — never expanded or introduced; it appears for the first time inside a comparison table row ("native code from any compiler, including CJI").
- *WAMR* — "QuickJS and WAMR" with no expansion (presumably a WebAssembly runtime).
- *RV32* — used in the introduction and section titles ("emitted RV32 code") but never stated to be RISC-V 32-bit in this article; the reader must infer it from 7.7.
- *frame* — "frame slot", "frame size" used from 7.4 onward, defined only by reference to Article 5.
- *operand stack* — used in 7.4 with no definition.
- *slot* — "one contiguous slot inside the reactor" — what a slot is (allocation unit? address range?) is not explained.
- *handles* — "the idea of handles, which the nucleus already uses for files" — no explanation of what a handle is here.
- *reductions* — glossed only as "roughly function calls", which is not enough to know what is counted.
- *linker* — appears only in the trust table with a line count, never as a described component.
- *typed language* — never named or distinguished from "the source language"; the reader must assume they are the same thing.

## Claims I could not verify from the article itself

> "They measured an average of 4 percent added execution time [Wahbe et al. 1993]."

Missing: which programs, which machine, what the measurement included. The number is quoted from a citation with no method, so a reader cannot tell whether it applies to a compiler this small.

> "each process is given a budget of 4,000 *reductions*, roughly function calls, and is switched out when the budget is spent"

Missing: what exactly consumes a reduction and whether the budget is per scheduling slot. The claim is attributed to Erlang documentation only in the reference list, with no quoted rule.

> "Compiler frontend, backend, linker (about 1,070 lines of JavaScript)"

Missing: any breakdown of the 1,070, and how the count was taken. It is presented as a reason for trusting the verifier instead, so its accuracy matters.

> "The backend uses about twenty different instructions."

Missing: the list, and whether "about twenty" excludes pseudo-instructions and the fuel and trampoline sequences. Section 7.6's first check ("Every word decodes to one of the instructions the backend is permitted to emit") cannot be evaluated without it.

> "The verifier (a few hundred lines of C)"

Missing: a prototype, a size estimate, or an argument that the checks in the table can be done in that size. The article elsewhere is careful to say which claims are unevaluated ("plausible and unproven" in 7.7), but this number reads as measured.

> "Its charge can be computed from its arguments at the call."

Missing: one example of such a charge for one of the 28 reactor functions, and what happens when the argument is itself unbounded. Without an example I cannot see how this fits inside a fixed fuel budget.

> "The cost is two or three instructions per loop iteration" / "This costs two instructions per access and depends on nothing but the mask being present"

Missing: the actual emitted sequences. Both counts are plausible but unshown, and they are the article's main cost argument.

> "The firmware already uses PMP to separate code from data in internal memory."

Missing: where that is configured, and how many entries it consumes — which is precisely the "how many entries can be spared" question the next paragraph says is unknown. As written, the two sentences pull against each other.

> "The typed compiler reads a source file from top to bottom and keeps a table of the functions defined so far."

Missing: a citation or code listing. The whole of 7.4's acyclicity argument, and therefore the stack bound, rests on this implementation detail, and the article offers no evidence beyond assertion (the loader comment in 7.1 is quoted verbatim; this behaviour is not).

> "The reactor is C code with no recursion of its own, so its part is a constant that can be measured once."

Missing: the measurement, or even an order of magnitude.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| 7.1 | 5 | The quoted loader comment makes each of the three properties concrete, and the two tables separate properties from fault sources cleanly. |
| 7.2 | 4 | The four-mechanism table is the clearest thing in the article, but the "Partly present" entry and the unexplained "WAMR" leave gaps, and the "cost" column gives no figures. |
| 7.3 | 4 | The four-bullet argument is short and followable, but it leans on details (28 reactor functions, fixed field offsets) that live in Article 5. |
| 7.4 | 5 | The ordering argument is the best-reasoned passage in the article, and the caution about Article 9 is exactly what a careful reader needs. |
| 7.5 | 4 | Fuel is defined well and the three clarifications pre-empt the obvious confusions, but the decrement amount, per-turn refill and reactor charging stay vague. |
| 7.6 | 3 | The check table is useful once decoded, but "confined" is used before it is defined, the pattern-checking weakness is stated in one hard sentence, and the trust comparison arrives after the reader has lost the thread. |
| 7.7 | 3 | Honest about what is unknown, which is good, but CJI appears without introduction, and the "firmware already uses PMP" sentence undercuts the "how many entries can be spared" question. |
| 7.8 | 5 | An accurate seven-line summary that could stand as the abstract; every bullet traces to a section. |
| 7.9 | 4 | Five of the six questions are answerable from the text; question 5 is answerable only if the reader has already understood the hardest sentence in 7.6. |

## Questions that the article did not let me answer

- **Question 3 ("the two quantities that are summed")**: the article gives the frame-size sum and the reactor constant, so the answer can be assembled, but it never says that the reactor term is a *maximum over the reactor calls reachable from the chain*. I answered what the text supports and had to soften the wording.
- **Question 5**: answerable in direction (masking confines, pattern checking does not), but only because of a single parenthetical sentence. The article never says explicitly that a wrong-register compare still matches the fixed pattern; the reader has to infer it from "bounds-checked against *some* length word". A reader who skipped that clause would answer "both" or "neither".
- **Question 1**: answerable, but only if the reader accepts "contract, not a wall" as being about jumps rather than about the call list. The article's own table row supports that reading, but the phrase itself is never glossed.
- No question was unanswerable outright, but question 5 came closest, and question 3 required reconstruction rather than recall.

## One thing to add and one thing to cut

**Add**: one fully worked micro-example carried through sections 7.4 to 7.6. Take a three-function program (`helper`, `scan`, `render`) with stated frame sizes, compute the maximum stack number from the call graph, then show the four or five RV32 instructions emitted at the back-edge of one loop and the mask-and-add prologue of one store, with the fuel cost totalled. Every number in the article's argument (stack bound, two or three instructions per iteration, two per access, a few hundred lines of verifier) is currently asserted; a single example with real numbers would make all of them checkable and would give question 3 and question 5 something to verify against.

**Cut**: the CHERIoT sentence at the end of 7.7. It introduces a new architecture, a new term ("capabilities") and a parenthetical about handles in the nucleus, none of which bears on the decision the section is actually about (verifier versus PMP on this chip). It is the one place where the article asks the reader to hold a fact that nothing later uses.

# Feedback on "7. Safety by Construction: Running Native Code Without Trusting It"

## Passages I had to read twice

1. > "Their method reserves registers for addresses and inserts instructions before each store and jump that force the address into the program's own region, so that even a wild address lands inside the sandbox; a verifier then confirms that the inserted instructions are present."

This compresses the whole of software fault isolation into one sentence, and the phrase "force the address into the program's own region" is doing a lot of unexplained work for *jumps*, because a jump target cannot be masked the way a data address can. I only understood what was meant after reading the address-masking paragraph in §7.6, which appears eight pages later, and even then the jump case is still not really explained: forcing a data address into a region by masking works because the region is a power of two, but the same trick applied to a code address lands you in the middle of an arbitrary instruction, which is not a valid target. §7.2 should either say "for stores by masking and for jumps by a different check" or defer the whole mechanism to §7.6.

2. > "The number of instructions between two back-edges is known at compile time, so the amount subtracted at each back-edge can be the length of the loop body."

I had to re-read this because "the number of instructions between two back-edges" and "the length of the loop body" are not obviously the same quantity. With nested loops the inner back-edge is hit many times per outer iteration, and with `continue` in the source the instruction count actually executed per iteration is less than the body length. The sentence is fine as an informal upper-bound argument but reads as an exact identity.

3. > "It is the largest sum of frame sizes along any chain of calls, plus the stack needed by the deepest reactor function that chain can reach."

"Along any chain" and "that chain" — it is not stated whether the maximum is taken over chains of the typed sum and then the reactor constant added for that same maximizing chain, or whether the two maxima are taken separately and added. The two give different numbers. "Deepest reactor function" is also unquantified: deepest in what sense, and why is it the same for every chain?

4. > "The only indirect jump is the return at the end of a function, and the return address was loaded from the frame slot where the function's entry saved it."

I could not tell from this row whether a frame slot's contents are themselves verified (that it really is the saved return address and not something a store overwrote), or whether that is assumed. This is the crux of control safety across calls and it is dismissed in half a line.

5. > "Each indexed access is checked. `text.charCodeAt(at)` compares `at` with the stored length using one unsigned comparison, which also rejects negative values, and traps on failure."

I accept the claim, but "one unsigned comparison, which also rejects negative values" only clicks if the reader already knows that the comparison is unsigned and therefore treats a negative `i32` as a huge value. That is the whole trick and it is left implicit. One extra clause would fix it.

## Terms used before they were explained, or never explained

- **nucleus** — used in §7.5 and both tables in §7.6 and §7.7, never defined here, and not in the list of terms borrowed from Article 1. I had to guess it means the kernel/scheduler core.
- **CJI** — appears in the §7.7 comparison table ("any compiler, including CJI") and in the following paragraph ("CJI's output is far too varied to verify by pattern"), and is never expanded or justified anywhere in the article. This blocks the main point of that table row.
- **RV32** — in the introduction ("emitted RV32 code") and §7.8, never expanded; readable as "RISC-V 32-bit" only from context in §7.7.
- **slot** — "one contiguous slot inside the reactor", "inside the slot", "the start of the slot": used as a defined-sounding noun throughout §7.6 but never defined here.
- **frame / frame slot / frame access / operand stack** — used from §7.4 onward as if known; §7.4 point 2 defers to Article 5 for the *sizing* but never says what a frame is. The verifier table then leans on "frame slot", "frame access" and "offset below that constant".
- **world** — used from §7.1 ("every world") onward; explicitly deferred to Article 1, so this is declared, not a fault, but it is the most load-bearing word in the article.
- **turn budget** — deferred to Article 1 (declared).
- **engine**, **reactor**, **trap** — deferred to Article 1 (declared).
- **user mode / machine mode / supervisor mode** — machine and user are explained in §7.7, but "no supervisor mode" is invoked as a meaningful absence without saying what supervisor mode would have bought.
- **QuickJS / WAMR** — named in the §7.2 table (and WAMR once more in §7.5) without expansion; "WAMR's is available to the WebAssembly engine" is hard to parse if you do not already know WAMR is WebAssembly Micro Runtime.
- **metering** — introduced as "the same facility under the name of metering" without saying whether it is hardware or software.
- **reductions** — partially explained ("roughly function calls"), good enough.
- **back-edge** — explained inline in parentheses, good.
- **trampolines** — explained inline, good.
- **ESP-TEE** — "the vendor's own isolation framework", one clause only; the reader is not told what it isolates.
- **PMP** — explained, good.
- **SFI** — appears only inside a cited paper title, no expansion in the body text.

## Claims I could not verify from the article itself

1. > "They measured an average of 4 percent added execution time [Wahbe et al. 1993]."

No benchmark, workload, processor, or baseline is given, and no hint of what the 4 percent is a percentage *of*. A reader cannot check this and cannot judge whether it would transfer to this device.

2. > "A call names either a function defined in the same source or one of the 28 functions the reactor offers."

The number 28 is stated with no list, no table, and no source. If the count is wrong the whole "28 functions" figure is unverifiable, and the reader cannot tell which reactor functions exist, which matters for the fuel-charging discussion in §7.5.

3. > "The reactor is C code with no recursion of its own, so its part is a constant that can be measured once."

"Can be measured" is a promise, not a measurement. No number is given for the constant, so the reader cannot tell whether the bound is 200 bytes or 20 kB — i.e. whether the whole §7.4 argument is practically useful.

4. > "The backend uses about twenty different instructions."

No list of the instructions. Since §7.6's entire verifier design rests on this being a small, closed, decodable set, a table of the twenty would be the single most valuable missing artefact.

5. > "Compiler frontend, backend, linker (about 1,070 lines of JavaScript), QuickJS running them" ... "The verifier (a few hundred lines of C)" ... "The check is a few dozen lines".

Three separate size claims, none with a measurement command or a pointer to where the count comes from. The whole "size of the trusted component is the size of the risk" argument in §7.2 is quantitative and none of its quantities are evidenced.

6. > "The chip's reference manual documents machine and user modes for its main cores, with no supervisor mode, and up to 32 PMP entries. The firmware already uses PMP to separate code from data in internal memory."

The reference manual is cited generically with no section or page, and the second sentence — that the firmware already uses PMP — has no source at all. This is the factual basis for the entire §7.7 "plausible" verdict.

7. > "each process is given a budget of 4,000 *reductions*, roughly function calls"

The references list the `erlang:bump_reductions/1` documentation but the article neither quotes it nor explains what a reduction is precisely enough to confirm the 4,000 figure.

8. > "Native Client used this approach for jumps, treating a fixed pair of instructions as a single unit that may not be split."

A specific and checkable claim about NaCl's instruction-pair rule, given without a quoted rule, snippet, or page reference.

9. > "RockSalt later showed that such a validator can be small enough to be proved correct."

"Small enough" is the claim, and no size is given, so the comparison with "a few hundred lines" cannot be made.

10. > "With a verifier in place, what must be trusted changes as follows ... Source that may run natively: Any typed source."

The evidence offered is that the verifier *would* establish the listed properties ("A verifier for this code **would** establish the following") and that VeriWasm did something analogous. No verifier for *this* backend exists in the article, so the trust table's right-hand column is a design intention presented next to a left-hand column of measured facts.

11. > "The nesC language for TinyOS sensor nodes was designed around the same observation ... which its authors used for whole-program analysis of exactly this kind."

"Whole-program analysis of exactly this kind" — stack bounding specifically, or any whole-program analysis? No detail from the paper.

12. > "It demonstrates that the two mechanisms of section 7.2 combine well, each used where it is cheaper."

The Tock claim rests on the paper describing ARM and the *project documentation* covering RISC-V; the article itself notes this is not the same evidence, and the inference "demonstrates" is stronger than the cited material.

## Section scores

- **§7.1 What can go wrong — 5.** The quoted loader comment plus two small tables make the three properties and the three fault sources immediately concrete; the best section in the article.
- **§7.2 Four ways to confine code — 3.** The comparison table is genuinely useful, but the historical paragraphs that follow it are dense, load-bearing mechanisms (SFI forcing a *jump* into a region) are waved through in a clause, and the reader is sent away with citations rather than explanations.
- **§7.3 What the typed language already guarantees — 4.** The four bullets are a tight and convincing argument; it loses a point only because "one unsigned comparison, which also rejects negative values" is left as an exercise.
- **§7.4 No recursion, therefore a bounded stack — 4.** The mutual-recursion argument and the mermaid graph are the clearest passage in the article, and the honesty about "not stated as a rule of the language" is excellent; the stack-sum formula and "deepest reactor function" are the only murky parts.
- **§7.5 Time: fuel for loops — 4.** Fuel is defined, its limits are stated three times, and "fuel stops a program; it does not schedule it" is the right sentence to bold; the loop-body-instruction identity is slightly overclaimed and reactor charging is named but not shown.
- **§7.6 Verifying the output — 3.** The check table is the article's centrepiece and is well organised, but the two memory-safety techniques are given very uneven depth (masking is never given a worked address example), the return-address row is hand-waved, and every size claim lives here.
- **§7.7 The hardware route — 2.** It reads as a survey: PMP, user mode, Tock, "unproven", ESP-TEE, then CHERIoT, then a table. The one decisive sentence — that hardware confinement covers CJI when the verifier cannot — depends on an undefined acronym, and the section ends without telling the reader what to conclude.
- **§7.8 Key points — 5.** An accurate, complete summary; I used it to check my own answers and it agreed with them, which is exactly what a key-points section should allow.
- **§7.9 Check your understanding — 4.** Fair and answerable, though Q3's "two quantities" is ambiguous where the article gives a max-of-sums-plus-constant, and Q6 can be answered almost verbatim from one table.

## Questions that the article did not let me answer

All six quiz questions were answerable from the text — none had to be guessed — but two were answerable in *more than one defensible way*, which is a weaker kind of failure.

- **Q3 asked for "the two quantities that are summed".** The article's actual formula takes a maximum over chains of the sum of frame sizes, then adds a reactor constant, and never says whether the reactor constant is attached to the maximizing chain or maximised independently. I answered with the formula and flagged the ambiguity, but a stricter reading of the question ("two quantities") is not supported by the text as written. What is missing: the formula written out, and one worked numeric example.
- **Q6 asked for "one advantage" each way.** The table gives three advantages to the verifier (cost per access, cost per reactor call, no chip dependence) and one to PMP (works for any compiler), so there is no unique right answer and a student cannot tell which the author considers primary. What is missing: a sentence saying which trade-off actually decides the choice for this device.
- **Q5 was answerable only by combining §7.6 with care**, because §7.6 describes pattern checking as confirming the access "was bounds-checked against *some* length word" but never states explicitly that a wrong-register compare still matches the pattern. The step from "against some length" to "so a wrong length defeats it" is mine, not the article's.

## One thing to add

**A worked numeric example in §7.4 and §7.5.** Show a four-function program with its frame sizes, the three call chains it contains, and the arithmetic that yields, say, "this program needs 160 bytes of typed stack plus the 96-byte reactor constant; the loader gives each world 512 bytes, so it is admitted". Then show the four-instruction-ish loop with the fuel decrement in place and the count of iterations that produces. The article's two most important claims are quantitative and both are stated in symbols only; a reader currently has to trust the arithmetic of a paragraph rather than check the arithmetic of a number.

## One thing to cut

**The CHERIoT sentence at the end of §7.7.** "At the far end of the hardware spectrum, the CHERIoT architecture replaces addresses with unforgeable capabilities checked by the processor ... it is a different processor, mentioned here because it shows where the idea of handles, which the nucleus already uses for files, leads when hardware adopts it." It is a different processor, it cannot be used on this device, it advances no decision the reader has to make, and it introduces two more undefined notions (capabilities, and the files-as-handles analogy) in the article's weakest section. Cutting it would let §7.7 end on its own real question — what an experiment on this chip would measure — instead of on a processor the reader will never use. (The ESP-TEE aside is a close second for the same reason.)

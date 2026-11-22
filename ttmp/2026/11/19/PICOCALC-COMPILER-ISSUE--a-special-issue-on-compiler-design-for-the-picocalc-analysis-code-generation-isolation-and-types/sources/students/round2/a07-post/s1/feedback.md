# Feedback on Article 7 — "Safety by Construction: Running Native Code Without Trusting It"

Read as a student: cover to cover, then back for the quiz, looking terms up in `glossary.md` as needed.

## Passages I had to read twice

1. "What it may call is limited by the loader, and the comment adds: 'That is a contract, not a wall: its code can jump to any address.'" — I could not tell *how* the loader limits the calls. Is there a table the loader checks, a symbol table, a linker step? Without that, "contract" is described by its consequences only, and question 1 asks me to explain it.

2. The flowchart in 7.4 plus its caption. Solid arrows mean "order of definitions", dotted arrows mean "calls the compiler accepts", and the thick arrow means "a call the compiler rejects". Three arrow kinds in one small figure, and one edge (`B --> A` dotted, "B calls A") sits directly next to the thick `A ==> B` rejection of the reverse call — I had to re-read several times to see that A is the earliest function and therefore every dotted arrow points backwards.

3. "Every indexed access is checked. `text.charCodeAt(at)` compares `at` with the stored length using one unsigned comparison and traps on failure." — One example is given as if it covered all indexed accesses; it is not said whether every indexable value (buffer, record field, string) is accessed by the same instruction sequence or by different ones. This matters later, in 7.6, where pattern checking relies on "each indexed access as one fixed sequence".

4. "The last row is the difficult one" (7.6, on the verifier check table) and later "The last-but-one row is the hardware route's distinctive advantage" (7.7). Two positional references to table rows; each time I had to count rows to know what was meant. Naming the row instead ("the row about loads and stores"; "the row about code from any compiler") would have been faster.

5. "The amount is an upper bound on the true cost of each iteration, so the counter is an upper bound on executed instructions, and a budget in milliseconds follows from the processor's speed." — The leap from "instruction count" to "milliseconds" is asserted in half a clause. On a real chip with flash, memory wait states and interrupts, cost per instruction is not one constant, and nothing is said about how the processor speed figure is obtained nor how much slack is left.

## Terms used before they were explained, or never explained

Neither the article nor the glossary defines the following (terms that *are* covered elsewhere, e.g. slot, trampoline, reactor, fuel, PMP, back-edge, frame slot, are deliberately excluded):

- **RV32** — used from the opening paragraph onward and in section headings; the article never says it means 32-bit RISC-V, and the glossary has no entry.
- **`sp`** — appears in the verifier table (7.6) as if the reader knows it is the stack-pointer register; not defined in the text or the glossary.
- **linear memory** — "linear-memory accesses" in the VeriWasm sentence (7.6); the WebAssembly sense of a flat byte array is never given.
- **machine mode / user mode** — used in 7.7 before any explanation; the sentence that explains them ("firmware normally runs in machine mode, where it may do anything") comes *after* the first use.
- **supervisor mode** — "with no supervisor mode" (7.7); the reader is assumed to know the third RISC-V privilege level from the other two, which were themselves just introduced.
- **capabilities** — "unforgeable capabilities checked by the processor" (7.7, CHERIoT); the glossary has *handle* but never links it to "capability" or explains why it is unforgeable.
- **flash** — "A flash error in a cached module" (7.1) assumes the reader knows the device stores firmware in flash and what an error there looks like.
- **bounds check** — used from 7.3 onward in a load-bearing way ("a bounds check emitted with the wrong register"); no glossary entry, no definition.
- **ESP-TEE** — named as "the vendor's own isolation framework" without expansion (ESP Trusted Execution Environment) or a word on what it does.
- **mutation** (testing) — the article defines the *procedure* at length but never names the technique as used in the field, so a reader searching the term gets nothing to search with; see also "mutation testing" is not in the glossary.
- **reductions** — defined in the same sentence as "roughly function calls", which is fine, but "switched out" (preemption of an Erlang process) is never explained and the reader may not know processes can be preempted mid-work.

## Claims I could not verify from the article itself

1. "On their benchmark programs they measured an average of 4 percent added execution time [Wahbe et al. 1993]." — No information about the benchmarks, the access mix, the machine, or whether this is arithmetic-average or weighted. A reader cannot judge whether 4% is relevant to this device, whose profile differs.

2. "The backend uses about twenty different instructions; the table in Article 5 lists the common ones." — Article 5 is not in front of the reader, so the verifier's first check ("every word decodes to one of the instructions the backend is permitted to emit") cannot be assessed: the permitted set is undefined here, and "about twenty" is not a set.

3. "A call names either a function defined in the same source or one of the 28 functions the reactor offers (Article 10 describes the table that lists them)." — The number 28 is asserted; the list lives in another article, so the reader cannot check the count or whether some reactor function does something unsafe with its arguments.

4. "Because every callee is defined before its callers, the compiler can compute each function's stack need the moment it finishes translating it." — Missing step: this presumes one-pass emission where a finished function's frame size is already fixed by the backend. Article 5 is cited for that, but not quoted; without it, a reader cannot tell whether the front end can know the frame size of a function it just finished.

5. "Nucleus, reactor, loader" are trusted "in both cases" — asserted, not argued. Nothing in this article shows what the loader does to a stored native module, or why the reactor's own C code is exempt from the argument that C can be wrong.

6. "The chip's technical reference manual documents machine and user modes for its main cores, with no supervisor mode, and up to 32 PMP entries." — No chapter, page or quotation. Same for "The firmware already uses PMP to separate code from data in internal memory, an option visible in its build configuration" — the option is not named.

7. "The check is a few dozen lines" (cycle check) and "estimated at a few hundred lines of C" (verifier) and "an estimated two or three instructions per loop iteration" — all three are estimates with no measurement or counting method behind them.

8. "the verifier either rejects each changed module or that the changed module can do no harm when run" — no acceptance threshold is given (how many mutants, what fraction unrejected is tolerable), so the test as described cannot fail.

9. "The last-but-one row is the hardware route's distinctive advantage. CJI's output is far too varied to verify by pattern" — this is a claim about CJI's code shapes that the article never demonstrates, even by an example of a construct the backend cannot emit.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| 7.1 What can go wrong | 4 | The three-property table and the fault/defence table are the clearest thing in the article; the only gap is that the loader's "contract" is described by quotes rather than mechanism. |
| 7.2 Four ways to confine code | 4 | The "what must be trusted" column is genuinely useful; SFI is named for four authors and ZipCPU-style detail is spread across several papers without saying how the "high bits overwrite" works concretely. |
| 7.3 What the typed language already guarantees | 4 | The four bullets are a real argument, but one access example (`charCodeAt`) stands in for all indexed accesses and record offsets are waved through as "fixed". |
| 7.4 No recursion, therefore a bounded stack | 3 | The table-based argument is convincing once seen, but the figure works against it (three arrow kinds, one anti-example) and the stack-need definition is recursive in a sentence that must be parsed carefully. |
| 7.5 Time: fuel for loops | 3 | The core idea is clear; the "larger amount" charging rule is the hardest paragraph in the article, with inner loops, `if` branches, typed calls and reactor calls all handled in one long sentence, and the instruction-to-milliseconds step is unearned. |
| 7.6 Verifying the output | 3 | Very good material, but heavy: a seven-row table, two techniques, a precedent paragraph, mutation testing and a trust-comparison table, with two "last row"/"last-but-one row" references and no worked example of the emitted access sequence that pattern checking matches. |
| 7.7 The hardware route | 3 | The comparison table answers the design question cleanly, but "machine mode / user mode", "supervisor mode", "PMP entries" and "capabilities" all arrive fast, and the paragraph ends in three open questions plus CHERIoT, which dilutes it. |
| 7.8 Key points | 4 | Faithful summary of the article; each bullet is traceable to a section. |
| 7.9 Check your understanding | 4 | Six questions, well matched to the sections; question 1 leans on material (the loader's mechanism) that the article does not supply. |

## Questions that the article did not let me answer

- **Question 1** is answerable only in general terms. The article tells me the loader limits what a module "may call" and quotes that "its code can jump to any address", but it never says what the limit is made of (a table? a linker stub? the published list of 28 reactor functions?). I could say "_not a wall_" and "_control safety_", but not how the contract is expressed, which is half of what the question asks.
- **Question 5** is answerable, but the passage that settles it ("It does not confirm that the base address really is a buffer") is one long sentence with a hypothetical embedded, and I needed the 7.3 claim that references "originate only from the reactor" to make sense of *why* passing an integer is possible at all if the source language forbids it. A one-line "so a compiler bug, not a program, is what can do this" would have helped.
- The others were answerable from the text.

## One thing to add and one thing to cut

**Add:** one worked example traced end to end through 7.4 and 7.5 — a four-function program (a `while` loop containing an `if` and a call to an earlier typed function, plus one reactor call), showing the call graph, each function's frame size, the computed stack need, and the exact fuel charge placed on the loop's back-edge. A single such figure would do more for the two hardest sections than any prose, and would make the "instruction count to milliseconds" claim checkable.

**Cut:** the tail of 7.7 — the ESP-TEE sentence and the CHERIoT sentence. Both are interesting and both are side trips: they arrive after the reader has just been told that the three decisive facts about this chip are unknown, and they cost the section its ending. Move them to a footnote or to whichever article discusses handles.

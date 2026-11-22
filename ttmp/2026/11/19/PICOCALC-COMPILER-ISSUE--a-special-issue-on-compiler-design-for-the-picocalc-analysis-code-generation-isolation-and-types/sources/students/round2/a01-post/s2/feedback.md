# Feedback on Article 1, "The Machine, the Mission and the Vocabulary"

## Passages I had to read twice

1. "Each world has a **turn budget**, the longest time one uninterrupted piece of a turn may run." — Section 1.2 has just defined a turn as "the handling of one event by one world", which sounds like a single indivisible unit. "One uninterrupted piece of a turn" implies a turn can consist of several pieces and be interrupted and resumed, but the article never says so, and nothing later resolves it.

2. "Flash | 32 MB chip; the firmware image may use an 8 MiB partition, and files use about 8 MB" — I could not make the budget add up. The firmware image is given as 4.3–4.5 MB elsewhere in the same section and files as about 8 MB; it is not said whether the files live inside the same 8 MiB partition or in another one.

3. "In the stock system it runs in QuickJS; in the device firmware measured in this issue it has been compiled to native code by CJI, the first of the two compilers described below." — This arrives before CJI has been introduced, and it sits oddly against section 1.3, where CJI is the compiler that takes minutes (425 s for Editor, 1,475 s for Agenda) while the typed compiler takes seconds. It is not said whether the compositor was compiled on the device or at build time.

4. "The two engines also account for memory differently, so not all of the 182 KiB difference is code." — There are two different differences in the neighbourhood: the compiled sizes differ by 240,452 − 88,255 = 152,197 bytes (about 149 KiB), while the memory-used figures differ by 710 − 528 = 182 KiB. The sentence silently uses the memory figure, so "the 182 KiB difference" reads at first as a difference in code size.

5. "Between 58 and 169 times slower than a laptop core, measured by running the same compiler on the same inputs on both" — A range whose ends differ by a factor of three, with neither the compiler, the inputs nor the two machines' clock speeds named. I could not tell which number to use for any later estimate.

6. "A program cannot create a string or a buffer; the reactor owns a fixed set of them and lends them to the program." — How many strings and buffers, and how a program names or receives one, is not said. The example in 1.4 takes `text: string` as a parameter, so I could not tell where the caller's string comes from.

7. "by about a thousand where only part of an application is typed" — Working it out gives 523 ÷ 0.72 ≈ 730 and 206 ÷ 0.25 ≈ 820, or 1,475 ÷ 0.72 ≈ 2,050 on the original numbers, so "about a thousand" is a loose description of a range that actually spans 700 to 2,000.

## Terms used before they were explained, or never explained

- **UTF-16 code units** (1.3, in the definition of `string`) — not explained in the article and not in the glossary.
- **JSON** (1.2, "a JSON document") — not explained in the article and not in the glossary.
- **LCD** (1.1, 1.2, and the diagram) — never expanded or explained.
- **KiB and MiB** (1.1, 1.2, 1.5) — the units are used throughout and never defined, so the reader must know that 1 KiB = 1024 bytes.
- **"counted sequence"** (1.3, "a read-only counted sequence of UTF-16 code units") — the word "counted" is doing technical work here (a length stored with the data) and is never explained.
- **Library specialization** (1.3, in the CJI diagram as "Specialize library calls") — the article never explains what specializing a call means; the glossary has the entry only under Article 3.
- **stack** (1.1, "The stacks of the firmware's tasks") — the word is used as if known in Article 1; the glossary only touches stacks under the Article 5 and 8 entries.
- **firmware** (from 1.1 onwards, "the firmware image", "shipped in the firmware") — never defined, in article or glossary.
- **partition** (1.1, "an 8 MiB partition") — not explained (see the passage I had to read twice above).
- **RISC-V** (1.1) — "RV32" is glossed as the 32-bit kind of RISC-V core, but RISC-V itself is not.

## Claims I could not verify from the article itself

1. "Between 58 and 169 times slower than a laptop core, measured by running the same compiler on the same inputs on both" — missing: the identity of the laptop core, its clock, the compiler and inputs used, and why the ratio varies by nearly 3×. With no conditions given, the two numbers can support almost any conclusion.

2. "CJI can compile itself, and the self-compiled CJI runs on the handheld; the companion report describes how its output on the device was checked, byte for byte, against the workstation's." — missing: what was compared, on which programs, and what "byte for byte" covered. The whole of the evidence is deferred to a document the reader may not have.

3. "in the device firmware measured in this issue it has been compiled to native code by CJI" (the compositor) — missing: any measurement or at least a statement of whether this compile happened on the device, how long it took, and how a minutes-long compiler came to be used for a system component.

4. "QuickJS, the interpreter that already runs every JavaScript world, compiles the 16,326-byte Agenda source to bytecode in 37 ms on the same device." — missing: whether reading the file is inside or outside the 37 ms, and the size of the bytecode produced. Without those, the conclusion "compiling for an interpreter was never slow" rests on a single number that cannot be checked or compared with the other columns.

5. "The two engines also account for memory differently" — missing: how they differ. Since this is the only explanation offered for part of a 182 KiB gap, the reader cannot check or even estimate the split between code and overhead.

6. "The compiler emits 77 bytes of WebAssembly for the body, and the optional lowering step turns them into 103 RV32 instructions." — The arithmetic does check out (103 × 4 = 412 bytes; 412 ÷ 77 ≈ 5.35, "more than five times"), but the counts themselves are attributed to Article 2, Experiment 4 and cannot be reproduced from this article. It is also unclear whether the 77 bytes include the function's wrapper and local declarations or only the body proper.

7. "Editor's budget on the device is 200 ms" — missing: where that figure comes from, and whether it still holds once the same application runs 5.5× faster natively.

8. The whole of the tables in 1.3 and 1.5 — the article says the figures come from "the project's own measurement records", but gives no conditions for any row, so none of them can be checked here. The relations that *can* be checked do hold: 290.6 ÷ 52.9 = 5.49 ("5.5 times faster"), 240,452 ÷ 88,255 = 2.72 ("nearly three times larger"), and 768 − 710 = 58 KiB free.

## Section scores

- **1.1 The machine — 5.** Five resources, each with the design consequence it forces, is exactly what a reader needs; the damaged bits are only the 58–169× range and the flash arithmetic.
- **1.2 The operating system in eight terms — 4.** The eight bolded terms are defined crisply and in dependency order, but "one uninterrupted piece of a turn" muddies the definition of a turn and JSON and UTF-16 appear unexplained.
- **1.3 The mission and the two compilers — 4.** The framing question ("how much of the program must the compiler understand") plus the two pipeline diagrams teach the difference very well; the compile-time table's caveats are honestly stated, though the CJI-compositor remark in the previous section still jars.
- **1.4 One function through both pipelines — 5.** The strongest section: one small function, concrete emitted sizes, and arithmetic a reader can redo; it makes the whole "why CJI is slow" argument tangible.
- **1.5 Where the code runs, and what that costs — 3.** The trade is the heart of the issue, but the table is dense, the "182 KiB" sentence mixes two different differences, and "may run untrusted source" is asserted without tying it back to the protection row of 1.1.
- **1.6 Where the numbers come from — 3.** Honest about provenance, but it tells the reader that every figure lives elsewhere, which leaves nothing in this article checkable.
- **1.7 Key points — 4.** A faithful five-line recap of the article; useful, if slightly repetitive after 1.5.
- **1.8 Check your understanding — 3.** Most questions are answerable from the text, but question 1 asks "why" where the article only states the rule and its penalty.

## Questions that the article did not let me answer

- **Question 1, partly.** The article states the rule (a world that overruns is stopped and reported) and the remedy (save progress, ask for a timer, continue on the timer event), but the *why* is missing: it never says whether the nucleus schedules worlds cooperatively on one core, in which case a long loop would starve the keyboard, compositor and display driver. I answered "because it would be stopped" and had to guess at the real reason.
- **Question 2, slightly.** For QuickJS the answer has to be inferred from the one clause "the interpreter confines the program"; the article never states what QuickJS does with a fault (trap, end of turn, report), whereas it does state that for native code via the PMP row of 1.1.
- **Question 4, partly.** One reason is easy to give; but if the question is read as "explain the 182 KiB", the article's only tool is "the two engines also account for memory differently", which is not enough to answer it.
- Questions 3, 5 and 6 were answerable from the text as written.

## One thing to add and one thing to cut

**Add:** a short paragraph in 1.2 explaining *why* the turn budget exists — what the other worlds would suffer if one world's loop ran to completion (one sentence on the nucleus scheduling worlds, one on the keyboard and compositor starving). This is the missing premise of quiz question 1 and of every later article that talks about splitting work.

**Cut:** the sentence in 1.2 that says the compositor "in the device firmware measured in this issue it has been compiled to native code by CJI". It uses CJI before CJI is introduced, and it quietly suggests a minutes-long compiler is used for a system component with no word on when or where it ran; if the fact matters, it belongs in 1.3 with the compile-time table, where the reader has the numbers to judge it.

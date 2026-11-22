# Feedback on article.md (Section 1)

## Passages I had to read twice

- "Internal RAM | A few hundred kilobytes; 363,727 bytes free at one boot, 35,831 bytes free once all programs are running" — "at one boot" does not say which boot, and the drop from 363,727 to 35,831 is never explained. I could not tell whether those are two measurements of the same configuration or two different configurations.
- "Two RISC-V cores (RV32, with multiply, single-precision float and compressed instructions)" — "compressed instructions" first reads like data compression. It is the RISC-V C extension and the article never says so.
- "The rows are not a controlled comparison: the programs were rewritten in the typed language, and for Files and Agenda only part of the application is typed." — this arrives after I had already read the table as a measurement. The caveat belongs before the table.
- "0.20 s (Wasm), 0.25 s (RV32) for its typed part" — "its typed part" is not defined; I could not tell whether it means the typed subset of the source or a stage of compilation.

## Terms used before they were explained, or never explained

- "compressed instructions" — never explained (RISC-V C extension).
- "ELF file" (engine table) — used without explanation.
- "PSRAM" — used as a bare acronym.
- "linear memory" (WAMR row) — used without definition.
- "manifest" — relied on for "lists 22 worlds" and for claims, but never described as a file or format.
- "lowering" — appears in the diagram and twice in the text without definition.
- "768 KiB limit" (Section 1.5 table) — the first and only number for a world's memory limit; no earlier section gives it.
- "reactor" — defined, but the name is never justified, which made it hard to remember.
- "specialize library calls; repeat inference" (CJI diagram) — never explained in prose.

## Claims I could not verify from the article itself

- "Roughly 60–170 times slower than a laptop core on the compiler workloads measured in this project" — no laptop model, no workload, no measurement method.
- "The letters come from the book it was developed in, *Compiling JavaScript, Incrementally*" — no citation, no author, no way to check the book exists.
- "CJI can compile itself, and the self-compiled CJI runs on the handheld." — no evidence, no timing, no statement of how it was checked.
- "The system's manifest lists 22 worlds." — no excerpt of the manifest.
- "262 s originally; 206 s after optimization" and "1,475 s originally; 523 s after optimization" — no description of the optimization, so the improvement cannot be attributed.
- "The native version is 5.5 times faster per turn" — this I could check (290.6 / 52.9 = 5.49), so it is fine; but "nearly three times larger" (240,452 / 88,255 = 2.72) is only the size ratio, and the article never says *why* native code is bigger, which is quiz question 4.
- "Editor's budget on the device is 200 ms" — stated, but no source or table of other worlds' budgets.
- "QuickJS … compiles the 16,326-byte Agenda source to bytecode in 37 ms" — no method; also the earlier table gives Agenda as a 1,475 s / 523 s CJI compile, with no statement of when the bytecode measurement was taken.

## Section scores

- 1.1 The machine — 4. The table of limits is concrete and the MMU point is well made, but the RAM row is muddled and several chip terms go unexplained.
- 1.2 The operating system in six terms — 4. World, nucleus, turn, engine, compositor and reactor are each given a real definition in dependency order; only the engine table's vocabulary (ELF, linear memory) is dropped in unexplained.
- 1.3 The mission and the two compilers — 3. The two pipelines are clear, but the timing table mixes incomparable numbers and admits it only afterwards, and the CJI diagram labels (specialize, repeat inference) are not explained.
- 1.4 One function through both pipelines — 4. Following one function through both paths works well; the 77 bytes / 103 instructions figures are useful, though "trap" is only half explained (who catches it, and what the world sees, is unclear).
- 1.5 Where the code runs, and what that costs — 3. The trade-off is vivid, but the 768 KiB limit appears from nowhere and the size difference is measured without being explained.
- 1.6 Key points — 5. Faithful summary of the five things the section promised.
- 1.7 Check your understanding — 4. Six fair questions, all but question 4 answerable from the text.

## Questions that the article did not let me answer

- Question 4 (why the native Editor is larger) could only be answered by inference. The article gives the sizes and the 77 bytes → 103 instructions expansion for one function, but never states the cause of the whole-application size difference, and never mentions data sections, runtime support or reactor code. A sentence naming the cause would fix this.
- Question 1 could be answered from the text, but only in the text's words; the article never shows what "save its progress" looks like, so the answer felt recited rather than understood.
- Question 2 and Question 6 were fully answerable.

## One thing to add and one thing to cut

- Add: a short subsection near the start of 1.5 stating what a world's memory limit is (768 KiB), where it comes from, and where the memory goes in the native image — this would make the size table readable and would make question 4 answerable.
- Cut: the Files and Agenda rows about "its typed part" in the timing table, or move them to Article 3 where the controlled experiments live. The article itself says they are not a comparison, so carrying them here only teaches the reader a number it immediately asks them to distrust.

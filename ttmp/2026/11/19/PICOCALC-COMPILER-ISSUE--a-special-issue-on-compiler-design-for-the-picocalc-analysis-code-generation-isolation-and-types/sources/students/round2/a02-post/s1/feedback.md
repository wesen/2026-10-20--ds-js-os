# Feedback on "2. Measuring Before Optimizing"

## Passages I had to read twice

1. "An earlier trace of a different application measured 35.6 ms from the moment the compositor received a key to the moment the application's handler was called, and that interval contains no application code."
   Unclear why this is a usable stand-in for "everything before the application runs". Section 2.1 defines turn CPU time as nuclei-calls-handler to handler-returns, so this second number is not the same kind of interval as the 1.6 ms it is added to; the reader has to invent the model that the two are adjacent in one path. It also never says whether the 35.6 ms contains the keyboard driver, the message decode, or both.

2. "Two further steps were timed separately and are not part of that total. Loading the compiler's own source into the interpreter took 2.4 ms. Linking the WebAssembly into its reactor took 1.3 ms; the whole WebAssembly path, measured as one piece, took 29.9 ms."
   I could not tell which pieces make up the 29.9 ms. The table gives tokenize 8.0 ms plus rest of frontend 20.5 ms = 28.5 ms, which is not 29.9; adding the 1.3 ms link gives 29.8, which is. So the sentence seems to say that the "measured as one piece" number contradicts the claim that the two steps are "not part of that total".

3. "| Instructions in a store immediately followed by a load of the same slot | 34.1% | 33.4% | 34.3% |"
   Unlike its neighbours, this row's label is a description of an instruction pair, not of a class of instructions, so "34.1%" could be a share of all instructions, a share of stores, or a share of load-store pairs. I had to guess that it means a share of the total instruction count.

4. The boot numbers in 2.3: "That interval was 559 ms in one recorded boot", then "the interval was 462 ms", then "the time to first response fell from 2.04 s to 1.70 s".
   Three different sizes of "the same" startup are in play (559 ms, 462 ms, 2.04 s) and the article never says which interval contains which. The 559 ms is introduced as "between the storage system returning Agenda's file and Agenda's handler receiving it", which is clearly a slice of the 2.04 s, but nothing marks it as a slice.

5. "The unmeasured drawing time can only add to the denominator, so 4.3 percent is an upper limit."
   Correct, but it took me a moment: the sentence asks the reader to see that a larger denominator means a smaller share, in the same paragraph where "shorter is faster" intuitions are running the other way. One clause spelling out "adding time makes the share smaller, not larger" would have saved the reread.

6. "The typed compiler's native path is 58 percent frontend, of which tokenizing alone is 16 percent, and 41 percent translation to RV32."
   The table's own column adds to 99 percent (16 + 42 + 41), so the reader has to work out whether the missing 1 percent is rounding or a phase that was dropped from the summary.

## Terms used before they were explained, or never explained

- **Editor, Agenda, Files** — used as if known from the first mention ("the native Editor used 52.9 ms", "Agenda's file", the Experiment 1 table). The article never says what they are (applications? which ones?) and the glossary has no entry. This is the biggest hole: almost every table is about them.
- **RV32** — appears on nearly every page (RV32 backend, RV32 code, RV32 instructions). The glossary only says "native (RV32 machine code)" under *Engine*; nothing explains that it is a 32-bit RISC-V instruction set, or that the device is one.
- **WebAssembly** — the whole of section 2.4 and Experiment 2 turn on it. The glossary names it in parentheses under *Engine* (WAMR) and in *Lowering*, but never says what it is.
- **QuickJS** — a column heading in 2.4 ("Editor, QuickJS on a workstation") and a section heading in 2.5. The glossary only lists it as "QuickJS (JavaScript)" under *Engine*; that it is the interpreter the compiler itself runs on is never stated as a definition.
- **garbage collection** — carries question 4, which asks the reader to judge a claim about it. No entry in the glossary and no explanation of what is being collected or why it costs time.
- **Token** — the glossary defines *Token* [8] as "a number returned when a split-phase operation is started", which is a different meaning from the lexical tokens of section 2.4 ("Editor's source has 16,792 tokens"). A reader who does as instructed and looks it up is actively misled.
- **JSON** — "decode a JSON screen description" in 2.3, unexplained.
- **steady state** — "CPU time per world for one key press in steady state" in 2.6, unexplained.
- **logic analyzer** — offered in 2.6 as the way to obtain the missing key-to-pixel measurement, with no indication of what it does.

## Claims I could not verify from the article itself

1. "A profile of the same compiler on a workstation attributed 88 percent of all executed instructions to one analysis: the numeric range analysis."
   No table, no total instruction count, no method. This is one of the strongest claims in the article (it is what killed the GC hypothesis) and it is stated in one sentence with no supporting numbers anywhere in the text.

2. "its output for Agenda is 30,840 bytes (7,710 instructions of 4 bytes), the same size that the project's diary records for the device's build."
   The check depends on a diary the article does not reproduce and does not cite by location, so the reader cannot see the recorded figure. The arithmetic in the sentence is the only part that can be checked.

3. "The harness links the same QuickJS that the firmware uses and produces a WebAssembly module of 88,255 bytes, the same size as the one built on the device. Equal size is a plausibility check and not a proof that the bytes are identical."
   The article is honest about the limit, but still gives no device-side figure of its own; it again points to a comparison the reader cannot inspect.

4. "The two agree for all 161 functions of the three applications (120 in Editor, 34 in Agenda, 7 in Files), which shows that the script reads the code correctly."
   The 161 does add up (120 + 34 + 7), but no per-function data, worst case, or script output is shown, so "agree for all" is taken on trust.

5. "The running example `countUnit` was compiled and disassembled: 77 bytes of WebAssembly, 103 RV32 instructions. A version written by hand needs 13."
   The hand-written 13 is the whole argument of Experiment 4 and there is nothing to check it against; the article defers both versions to Article 5, so within this article the claim is unsupported.

6. "in the firmware that was profiled, the compositor had already been compiled to native code by CJI. The compositor was the largest consumer of time anyway."
   This is the load-bearing step from "the compositor is slow" to "native code is not the problem". No profile of the native compositor, no per-world CPU figure, and no build identifier are given; the article itself lists "CPU time per world for one key press" as missing, yet uses a per-world boot figure here.

7. "The device takes 1,988 ms for the WebAssembly path that takes 29.9 ms here, a factor of 66." / "Tokenizing alone, scaled by the same factor of 66, costs about half a second per boot."
   The factor of 66 is measured on the whole path and then applied to one phase. The article does not show that the slowdown is uniform across phases, so the derived per-token tokenizing cost (and therefore half of question 6) rests on an assumption stated nowhere.

8. "Not attributed to any world | 30 ms" (in the 559 ms table).
   The table is presented as a complete attribution, but 30 ms of it is unattributed and the text treats the accounting as exact ("One complete attribution does exist"). What the unattributed remainder is (interrupt time? the nucleus itself?) is not said.

## Section scores

| Section | Score | Reason |
| --- | :---: | --- |
| 2.1 Every timing has two ends | 5 | The table of four intervals is the clearest thing in the article; naming both end events, and the "does not include" column, is exactly the teaching promised. |
| 2.2 Amdahl's law, with denominators | 3 | The formula, the worked 4.3 percent and the 1.045 limit are right and well checked, but the model is built by adding two intervals of different kinds from different applications, and the warning not to act on it comes after the reader has already done so. |
| 2.3 A worked profile: one boot | 5 | Concrete, adds up (293 + 81 + 32 + 123 + 30 = 559), and connects the measurement to a change and to that change's measured effect. |
| 2.4 A compile profile for each compiler | 4 | Two well-structured tables, but the 29.9 ms WebAssembly path is introduced in a way that reads as contradicting the earlier statement, and the percentages never quite close. |
| 2.5 Four experiments run for this issue | 3 | Very dense; the Experiment 1 table has an ambiguous row, Experiment 2's "model, not an implementation" caveat arrives after the predictions, and several checks depend on records outside the article. |
| 2.6 What is still unmeasured | 4 | Good habit to tabulate the gaps, but the statistics paragraph (measurement bias, single runs) is compressed into two sentences and assumes the reader knows why alternating order is the remedy. |
| 2.7 What each outcome would imply | 5 | A small decision table that does real work: it converts an unknown measurement into a fork in the plan. |
| 2.8 Key points | 4 | Accurate summary, but "58 percent frontend ... and 41 percent translation" quietly rounds 16 + 42 + 41 = 99. |
| 2.9 Check your understanding | 4 | Questions 1, 3 and 5 map cleanly onto the text; questions 2 and 6 ask for work that the text only partly supplies (see below). |

## Questions that the article did not let me answer

- **Question 2 (share of the key-press path, and the Amdahl limit).** I could do the arithmetic, but not honestly call the result "the share of the measured key-press path": the numerator comes from the native Editor and the denominator's larger part from "a different application" and "different firmware builds", on a single trace. The article says as much, so the question invites the reader to compute a number it has just called a rough model. What is missing is one consistent pair of measurements of the same path.
- **Question 6 (the two per-token costs).** The 118 µs figure is stated directly and is easy. The 31 µs figure is only reachable by applying the whole-path factor of 66 to the workstation tokenizer, and the article never says the tokenizer's device time was measured; it is an extrapolation presented alongside a measured number without that distinction being marked in the question. What is missing is either a device-side tokenize measurement or an explicit "derived, not measured" label.
- The other four questions could be answered from the text, though question 4 needs the reader to treat both the 5.8 percent and the 1.2 percent as refuting evidence, and question 5 needs the reader to notice the caveat in Experiment 3 ("plausibility check and not a proof") as the model for Experiment 2's caveat.

## One thing to add and one thing to cut

**Add.** A short paragraph, before section 2.2, saying what Editor, Agenda and Files are, what "the device" is (a handheld running at 360 MHz), and that RV32 is the device's 32-bit RISC-V instruction set with WebAssembly and JavaScript as engines above it. Every table in the article is keyed on those names, and a reader arriving with only this article has to infer all of it; a glossary entry for each of the six names would serve the same purpose.

**Cut.** The "Framebuffer capture" row of the section 2.1 table. It is the only row whose "does not include" column says "anything about time; it is a correctness check", so it does not belong in a table that is teaching how to read intervals, and it spends the reader's attention on a subject the article never returns to. Cutting it leaves three intervals, all of them timings, which is cleaner.

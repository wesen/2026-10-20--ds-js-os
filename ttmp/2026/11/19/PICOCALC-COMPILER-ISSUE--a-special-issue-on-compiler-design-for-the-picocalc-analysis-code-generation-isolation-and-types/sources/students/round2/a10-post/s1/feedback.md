# Reader feedback on "10. Architecture and a Roadmap"

Read as a reader of the series: article.md front to back, with glossary.md consulted for every
term I did not already know. Notes below are only where the text failed to teach.

## Passages I had to read twice

1. "The number of functions is also stored in a header at the start of the reactor's code area, and the linker compares it with the length of the compiler's table."
   — I could not tell how a linker learns the length of a table that lives in a JavaScript file, or whether the assembly file's list is checked at all. The sentence is doing the work of the whole argument in 10.2 and it hides the mechanism.

2. "Article 2 presented evidence that the compositor is the largest consumer of time on the path to the screen, and noted that in the measured firmware it was already native code."
   — "already native" reads like a contradiction of the next paragraph, which treats the compositor as slow JavaScript. Only after finishing 10.3 do you see that "native" means "compiled by CJI, with CJI's garbage collector and text parsing still in it".

3. "The typed versions are four to six times longer than the programs they replace: a factor of 5.5 for Editor, and 4.4 for Agenda when its C reactor is counted."
   — "when its C reactor is counted" is the load-bearing clause: without the 869 lines of C, Agenda's typed source is only 468/307 ≈ 1.5 times longer. The multiplier is therefore a claim about a *counting convention*, and the convention is stated only once, in passing, in a parenthesis.

4. "Application code is under 10 percent of key press to pixels (Article 2's rough model gives under 5 percent of the measured part)"
   — two percentages with no sign of how they relate. Is the 5 percent a subset of the 10 percent? Which one would the measurement of step 0 test?

5. "CJI remains valuable as a workstation compiler that turns existing JavaScript worlds into native code for the firmware image."
   — "workstation compiler" appears nowhere else, and this is the pivot of the whole "take CJI off the device" decision, so the alternative role is described in half a sentence.

6. "Steps 0 to 4 are small and low-risk and do not depend on one another; they come first, with the measurement of step 0 run early because the larger steps 5 and 10 wait on its result."
   — But the diagram draws an arrow from 5 to 6 and from 4 to 7, so "do not depend on one another" and the figure need to be reconciled by the reader (the sentence only covers 0–4; I read it as covering more on the first pass).

## Terms used before they were explained, or never explained

- **code unit** (10.1 "no string operations beyond single code units"; 10.3 "17 rows of at most 49 characters. As 16-bit code units…"). Never defined; the glossary has no entry, and the whole byte count in 10.3 rests on it.
- **guard facts** (10.6, step 4: "guard facts for bounds checks"). Never explained anywhere; not in the glossary.
- **static stack bound** (10.6, step 6). Never explained; presumably the Article 7 stack-safety point, but the article does not say so.
- **mutation testing** (10.7, verifier prediction: "Mutation testing of emitted modules"). Never explained; not in the glossary, yet it is the stated way to falsify the central safety claim.
- **forward calls with a cycle check** (10.6, step 4). Never explained; I do not know what a cycle check protects against.
- **garbage collector / garbage-collected heap** (10.1 CJI runtime row; 10.3 step 4). Used as if known; no glossary entry, though the cost argument depends on it.
- **dynamic values** (10.1, CJI runtime row; 10.4 "the interpreter would still treat every number as a general value"). No glossary entry.
- **linker** (10.2). Assumed background; not in the glossary and no explanation of what it links here.
- **relocated at boot** (10.1, CJI compiler tool row; 10.6 step 2 "a boot-time relocation that had to be scheduled around"). Never explained, yet it is offered as a reason to delete a component.
- **16 KiB message limit** (10.3 step 3). Stated as fact with no definition of where the limit lives (protocol, queue, or buffer).
- **WIT** is *not* on this list: 10.2 explains it ("The WebAssembly Component Model's interface language") and the glossary covers the Component Model's neighbours. Nor are *fuel*, *trampoline*, *handle*, *verifier*, *arena*, *continuation*, *state machine* — all in the glossary.

## Claims I could not verify from the article itself

1. "The design notes budget up to six output bytes per input unit for this step" and later "The figure of six bytes per unit in step 2 is from the Editor's capacity design note in the project's records."
   — The note is never cited, quoted or linked; the same claim is asserted twice with no evidence. A reader cannot check whether six is a real bound or an exaggeration chosen to make text look expensive.

2. "Its build times of minutes make it unusable interactively, and it costs 660 kB and a boot-time relocation that had to be scheduled around."
   — No measurement is given for build time (which program? which hardware?), and 660 kB is stated without a build log or a way to reproduce it. This is the stated reason for roadmap step 2, the only step the article says can be done "now".

3. "The typed versions are four to six times longer than the programs they replace."
   — The Editor figure can be checked (1730/316 = 5.47) and Agenda's can be checked (468 + 869 = 1337, 1337/307 = 4.35), but the article never says whether C reactor lines *should* count as typed source. Without that rule the multiplier — the article's main argument for extending the language — is a choice, not a measurement.

4. "The project's device-language study considered compiling the typed language to JavaScript as the way to *run applications fast*, and rejected it for that purpose, because the interpreter would still treat every number as a general value."
   — The study is never described or cited. Since this passage pre-empts the obvious objection to 10.4, the reader needs at least where the study is and what it measured.

5. "A message is limited to 16 KiB" (10.3 step 3) and "A full Editor screen is 17 rows of at most 49 characters."
   — The second is checkable against the byte arithmetic (I get 833 × 2 = 1,666 bytes of text plus 17 × 4 = 68 bytes of headers = 1,734, which matches). The first has no source, and it is the constraint that decides whether the binary protocol even fits, so it matters.

6. "It is the one world whose speed every other world's responsiveness depends on."
   — Stated of the compositor with no measurement; the whole of step 10 is conditional on exactly this, and section 10.7 assigns the evidence to Article 2, which this article does not summarise numerically ("largest consumer of time" is not a figure).

7. "This is ordinary practice wherever two languages meet."
   — A general claim about industry practice with one example (WIT). It matters because it is offered in place of an argument for the interface description.

8. "Native code about 2.7 times smaller" (10.6, step 5).
   — No working shown here and the 2.7 is not derived from anything in this article; a reader must trust Article 5.

9. "When the typed compiler fails or is disabled, the firmware falls back to the original JavaScript application."
   — No description of how that fallback is chosen or triggered, so "the two can drift apart" cannot be evaluated.

## Section scores

- **10.1 What the firmware contains — 4.** The tables are concrete and the size figures give a foothold, but the length multiplier hides its counting rule and two terms (dynamic values, garbage collector) go undefined in the very row that costs the most.
- **10.2 One description of the reactor's functions — 3.** The failure mode (same length, different order) is explained well, but the mechanics of the existing check, and so of the fix, stay vague, and the WIT paragraph adds three new terms in one sentence.
- **10.3 A typed screen protocol — 4.** The five-step walkthrough is the clearest passage in the article and the byte arithmetic checks out; the "already native" sentence at the start works against it.
- **10.4 One source for both engines — 4.** The table of rewrites is excellent and the stated limit (a reference cannot catch source errors) is honest; the asm.js and TypeScript paragraphs are background the reader cannot check and one of them (the device-language study) is an appeal to an uncited document.
- **10.5 Fewer engines — 3.** The table of "needed as long as / could be removed when" is a good form, but the decision rests on "workstation compiler" and on build times that are asserted, not shown.
- **10.6 The roadmap — 3.** The table and graph are genuinely useful, but several steps are named with undefined terms (guard facts, static stack bound, cycle check), "small/medium/large" time classes are not tied to any observed task, and the figure contradicts the prose unless read carefully.
- **10.7 Predictions that would falsify the plan — 3.** The idea is admirable and the checks are specific; but four of the five rows depend on numbers from other articles that this article does not restate or derive, and the second row sets two thresholds (10 percent, 5 percent) without saying how they relate.
- **10.8 Key points — 4.** Accurate and compresses the sections well; it is nearly a second summary of the article, which is fine at the end of a series but repeats rather than adds.
- **10.9 Check your understanding — 4.** The questions are answerable and each maps to a section; none asked for a number that is not in the text.

## Questions that the article did not let me answer

All six were answerable in substance, but two only partly:

- **Question 1** is answerable as far as "catches a length mismatch, misses a reordering". What I could not get from the text is *how* the count check is performed (where the compiler's table length comes from at link time) and whether the assembly file is length-checked at all. So I can say what the check misses but not quite why the check is what it is.
- **Question 2** is answerable because the article labels steps 3 and 5 as remaining; but the reason "this step would remain with any protocol" is given for step 3 only, and for step 5 the reader must supply the reasoning ("that is the compositor's actual job" is stated in parentheses, which is enough, but barely).
- **Question 6** is answerable in form, but a reader who wants to know *why* 593 is the right number cannot find it here; only the instruction "implement it for Files first and count".

## One thing to add and one thing to cut

**Add:** one worked example carried all the way through — a single reactor function shown as a row of the compiler's table, its trampoline in `rv32-slot.S`, and its C prototype in `world.c`, then the same function in the proposed interface description, plus one row of a screen record written by the application and read by the compositor. Section 10.2's argument is entirely about files that must agree in order, and the reader never sees even one line of them; a dozen lines of real text would turn the central proposal from a description into something I could check and picture. It would also show what "which capability the function requires" and "how much fuel a call is charged" look like as fields.

**Cut:** the repeated six-bytes-per-unit sentence in 10.3 ("The figure of six bytes per unit in step 2 is from the Editor's capacity design note in the project's records"). Step 2 already says the design notes budget six bytes per input unit; restating the figure four sentences later, with the same missing citation, adds length without adding evidence — and the space is better spent on the one example above.

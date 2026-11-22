# Feedback on Article 2, "Measuring Before Optimizing"

## Passages I had to read twice

1. "The native Editor used 52.9 ms of CPU over a 33-turn session, which is 1.6 ms per turn." and, earlier in the same paragraph, "Apply it to one key press in Editor, which is one turn of the application."
   The step from "turn" to "key press" is asserted, not argued. A turn is defined as the handling of one event by one world, and events in this system include messages, not only key presses, so a 33-turn session is not obviously 33 key presses. If some turns were not key presses, the 1.6 ms figure is a per-event average being used as a per-key-press cost, and the article never says why that is legitimate.

2. "An earlier trace of a different application measured 35.6 ms from the moment the compositor received a key to the moment the application's handler was called, and that interval contains no application code."
   The application is not named, the firmware build is not named, and "different application" collides with the paragraph's earlier claim that Editor is the example. I could not tell whether the 35.6 ms belongs to the same Editor that supplies the 1.6 ms, and the sentence only becomes usable after the next paragraph admits the two numbers come from different applications.

3. "Two further steps were timed separately and are not part of that total. Loading the compiler's own source into the interpreter took 2.4 ms. Linking the WebAssembly into its reactor took 1.3 ms; the whole WebAssembly path, measured as one piece, took 29.9 ms."
   Three numbers are given with no statement of which contain which. I had to reconstruct that 8.0 + 20.5 + 1.3 = 29.8 ≈ 29.9, i.e. that the 29.9 ms WebAssembly path is tokenize, rest of frontend and link, and that the 2.4 ms source load sits outside it. The phrase "not part of that total" refers to the 48.7 ms native path, but it is placed where it also seems to refer to the 29.9 ms.

4. "in one run of the original build that took 1,480 s in total (the run quoted in Article 1 took 1,475 s)"
   A parenthetical alters the number the table is built on by five seconds without saying why. The table's 99.9 percent is computed against 1,480 s, so a reader who takes 1,475 s as the total cannot reproduce the shares, and there is no sentence explaining whether these are two runs of the same thing.

5. "The unmeasured drawing time can only add to the denominator, so 4.3 percent is an upper limit."
   The direction of the argument is right but only if the missing drawing time is assumed to lie *after* the handler returns. Since the 35.6 ms starts when the compositor received the key, part of the compositor's work may also sit before the handler, which would change what the denominator means. I re-read this several times trying to see where in the path the missing interval is.

6. "In the firmware that was profiled, the compositor had already been compiled to native code by CJI. The compositor was the largest consumer of time anyway."
   This is the load-bearing step that moves blame off the engines, and it rests on one firmware and one profile. "Anyway" carries a comparison that is not shown: there is no figure for what the same compositor would cost if it were not native.

7. "at least 35.6 ms before the application runs, 1.6 ms inside it, and an unmeasured time afterwards while the compositor draws" followed by "The WebAssembly Editor needs 8.8 ms per turn, so moving from WebAssembly to native code saved about 7 ms of a path that is longer than 37 ms."
   "Longer than 37 ms" has to be recovered by adding 35.6 + 1.6 in the head, and the sentence does not say that this is what it means. The comparison is also between two different builds' turn costs inside a model already declared rough.

## Terms used before they were explained, or never explained

- **segment** (section 2.3, "the nucleus logged which world ran in every segment", and the "Segments" column): never defined. It evidently means a scheduler timeslice, but the reader must guess, and the column counts (30, 44, 46) are meaningless without the definition.
- **RV32**: never defined. The glossary mentions "RV32 machine code" and "RISC-V" only incidentally (under *Engine* and *PMP*), but Article 2 uses RV32 as a target architecture on first appearance in the phase table with no explanation that it is 32-bit RISC-V.
- **WebAssembly**: never explained as a bytecode target or as anything at all. The glossary uses it freely; Article 2 requires the reader to already know what it is, while defining much easier ideas.
- **relocate** ("Load and relocate the compiler"): never explained, and it is 0.03 percent of a table that otherwise needs no such knowledge.
- **hash** ("Link, assemble to RV32, hash"): the third verb is never explained. It presumably means content hashing for the cache of Article 6, but a reader cannot tell why a compile would end with a hash.
- **reasoning about "denominators"** (the heading "Amdahl's law, with denominators"): the word is intended to mean "name your term p and your total", but it is a metaphor borrowed from the formula and is not explained.
- **logic analyzer** and **toggle a spare pin** (section 2.6, how to get the key-to-pixel measurement): hardware-testing vocabulary, not defined and not covered by the glossary. A reader who does not already do embedded work cannot act on the recommended method.
- **largest-block** ("Sample the allocator's free and largest-block figures"): never explained. Presumably heap fragmentation, but that is an inference.
- **control run** / **interleaved** ("each candidate is compared only with a control run interleaved with it"): the practice is described in the next sentences but the term itself is used as if known.
- **matched comparison** (section 2.3, "In a matched comparison of three boots with and without the change"): never explained. It is not stated what was matched.

## Claims I could not verify from the article itself

1. "The native Editor used 52.9 ms of CPU over a 33-turn session" and "An earlier trace of a different application measured 35.6 ms".
   No source is named for either trace: no file, no log name, no date, no firmware revision. Since section 2.5 is careful to give a revision (`60a38f0`) and a workspace path for the new experiments, the older measurements look unattributed by comparison, and the whole of section 2.2 rests on them.

2. "they are enough to form a hypothesis, which is that application code is no longer the largest part of a key press, and they are not enough to act on it."
   This is honest, but the confidence-bearing number (4.3 percent, 1.045×) is presented with three significant figures derived from numbers the article itself calls unrelated. No error bars, ranges or trial counts are given for either input, so the precision cannot be justified.

3. "In a matched comparison of three boots with and without the change, the time to first response fell from 2.04 s to 1.70 s for the WebAssembly build and from 2.13 s to 1.79 s for the native build, about 340 ms in each case."
   Three boots per configuration is exactly the situation section 2.6 later criticises ("Most device figures are one run, or three"), so the article applies a standard to others that it does not apply here. There is also no median, no range, and no statement of whether the boots alternated.

4. "A compiler improvement could not have found those 340 ms."
   The scheduler change and compiler work are not obviously independent, and the article offers no argument that the two effects are disjoint. The four comparisons quoted are between boots with and without the scheduler change, not between compiler changes, so the sentence is a conclusion about a comparison that was not run.

5. "A profile of the same compiler on a workstation attributed 88 percent of all executed instructions to one analysis: the numeric range analysis".
   The measurement is stated as a share of *executed instructions*, while the on-device table is a share of *time*, and the article never reconciles the two. Nothing says how instructions were counted (simulator, profiler, instrumentation), and no raw counts are given, so a reader cannot check that instruction share is a proxy for time share.

6. "the measurement showed 5.8 percent, and enlarging the heap saved 1.2 percent."
   The heap sizes used, the number of runs, and whether the 1.2 percent is a time or an allocation-count improvement are all missing, so the claim that the garbage-collection hypothesis is refuted is supported only in outline.

7. "As a check that the script compiles what the device compiles, its output for Agenda is 30,840 bytes (7,710 instructions of 4 bytes), the same size that the project's diary records for the device's build."
   The diary is not quoted, named or included in this article, so the check is a cross-reference a reader cannot follow. The article elsewhere notes that equal size is not proof of equal bytes (Experiment 3), so the standard used here is weaker than the one it states there.

8. "The device takes 1,988 ms for the WebAssembly path that takes 29.9 ms here, a factor of 66." then "Tokenizing alone, scaled by the same factor of 66, costs about half a second per boot".
   Scaling the tokenizer by a factor measured for a different workload assumes that every phase degrades equally under the interpreter. Nothing in the article tests that, and a regular-expression tokenizer and a type checker could plausibly behave differently on the device.

9. "Both figures say that the compiler's own speed is limited by the interpreter running it, and that the cheapest improvement is not to run it at all when the source has not changed (Article 6)."
   The cycle counts support "the interpreter is expensive". "The cheapest improvement" is a comparative claim about alternatives (faster backend, smaller source, caching) that no measurement in this article compares.

10. "Half or more of the emitted instructions move temporary values to and from memory" and the 16,544 / 13,255 predictions.
    These follow from the tables, but the tables give no per-application source sizes, function counts, or the rule set the model applies, so I could verify the arithmetic only for the divisions the article spells out.

## Section scores

- **2.1 Every timing has two ends — 5.** The four-interval table with a "Does not include" column is the clearest thing in the article; it makes the article's central complaint checkable.
- **2.2 Amdahl's law, with denominators — 2.** The formula is fine, but the worked example borrows two numbers from different applications and builds a headline 4.3 percent out of them while conceding they are unrelated; I finished the section less sure of the number than of the caveats around it.
- **2.3 A worked profile: one boot — 4.** The attribution table and the 84/5/146 ms breakdown add up and read cleanly; only "segment" and the bare "matched comparison of three boots" are unclear.
- **2.4 A compile profile for each compiler — 3.** The CJI table is good, but the typed-compiler table mixes three different denominators (share of the 48.7 ms native path, the 29.9 ms WebAssembly path, and phases outside both), and the per-token arithmetic has to be rebuilt by the reader.
- **2.5 Four experiments run for this issue — 4.** Clean, reproducible in form (revision, script location, function counts), and the interpretation of Experiment 2 is honest about being a model.
- **2.6 What is still unmeasured — 3.** The table is well designed, but the "How to obtain it" column needs hardware vocabulary the article does not supply, and the same rigor it demands is not applied to the 340 ms result in 2.3.
- **2.7 What each outcome would imply — 4.** A short, clear decision table; the terms "binary screen protocol" and "typed compositor" point forward without explaining themselves, which is acceptable for a forward reference.
- **2.8 Key points — 5.** Every bullet is traceable to a section and the numbers reproduce (8.0 + 20.5 = 28.5 → 58 percent; 20.2 → 41 percent).
- **2.9 Check your understanding — 4.** The questions mostly test the right things; question 5's second half and question 6's "what each one measures" both turn on distinctions the body states in passing rather than explains.

## Questions that the article did not let me answer

- **Question 2, "why is the share an upper limit":** answerable, but only by supplying an assumption the text does not state — that the missing drawing time all lies after the handler. If a reader instead assumes the unmeasured part could sit before the handler, the argument for "upper limit" does not go through as written. What is missing is one sentence locating the unmeasured interval in the path.
- **Question 5, "what does that check not establish":** the article says "This is a model, not an implementation; Article 5 states its assumptions", which is a pointer, not an answer. To say *what* the check fails to establish I had to reason from register pressure and spills, which Article 2 never introduces (Article 5 does, and the glossary's *Frame* and *Compile-time operand stack* entries belong to Article 5). The missing step is a sentence naming at least one reason an implemented register-keeping backend could fall short of the count.
- **Question 6, "what each one measures":** answerable only after reconstructing which phases the 1,988 ms contains and which the tokenizer figure always contained (see the third passage above). The distinction is implicit in the placement of the 29.9 ms sentence.
- Questions 1, 3 and 4 were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** one short paragraph in section 2.2, placed before the arithmetic, that names both inputs to the model as you would name an experiment — which application, which firmware revision, how many runs, where the log lives — and then states plainly that the two are being combined only to bound a fraction. This would make the article's most quoted number ("under 5 percent of a key press") traceable, and it would also settle my first two "read twice" passages, since the paragraph would have to say whether Editor is one of the two applications or neither.

**Cut:** the second half of section 2.2's third paragraph, from "The model is weak, and its weaknesses are instructive" to "The first item on any work list is therefore to measure the whole path once", reduced to one sentence. The caveats in it — different applications, different builds, single trace, hypothesis not finding — are already stated twice above, and repeating them dilutes the one useful instruction in it, which is that the whole path must be measured first.

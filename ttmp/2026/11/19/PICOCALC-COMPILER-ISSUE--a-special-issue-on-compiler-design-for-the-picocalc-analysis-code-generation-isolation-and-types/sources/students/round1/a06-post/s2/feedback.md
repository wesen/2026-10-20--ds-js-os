# Feedback

Reader notes on "6. When to Compile: Caches, Load-Time Generation and Tiers".

## Passages I had to read twice

- "The record holds the hash of the source, the hash of the compiled module, and the identity of the firmware build." Section 6.3 has just argued that the key must cover *five* inputs; this record covers three, and nothing says how "the identity of the firmware build" stands in for the reactor, the target engine and the function table. The gap made me re-read the five-row table to see whether the CJI design was an example or a counter-example.
- "The CJI installer stores the compiled module and the source in one of two slots on the file system and writes a small record to non-volatile storage." Two slots are mentioned and then never used again; combined with "the module and the source are written to storage first, and the record is updated last", I could not tell whether the new module overwrites the old one in the same slot (making "the old record pointing at the old, intact module" false) or goes to the other slot. The claim of safety only makes sense under the second reading, so I had to supply that assumption myself.
- "The measured effect is the one to expect for the typed compiler: a cold recompile of a small test program took 7,028 ms, and reuse of the stored module took about 1,450 ms at boot." Two sentences after a paragraph about CJI, so I read it as a CJI measurement, but the phrase "the one to expect for the typed compiler" makes it a prediction about something else. "Small test program" is not named and its compile times are not given, so I cannot tell whether 7,028 ms is impressive or slow.
- "about 0.01 s to load, plus hashing" vs. "reuse of the stored module took about 1,450 ms". These two figures describe the same operation (load a stored module at boot) and differ by a factor of about 145. I re-read 6.4 several times looking for what the extra 1.4 s is.
- "The middle row is the slim-binary design: it removes the frontend, which is Experiment 3 found to be about 58 percent of the native compile path". 58 percent of 3.1 s is about 1.8 s, leaving about 1.3 s, while the row says "about 1.2 s". Probably rounding and possibly different baselines, but the reader has to decide that, and the sentence structure ("which is Experiment 3 found") is broken.
- "This design was listed in the project's device-language document and not built. It follows from local checking with no further analysis." As written, "it" could be the design or the fact that it was not built; and "follows from local checking" reads as a claim about correctness that the link step immediately complicates.
- "The project has one instance of this idea already, applied at boot instead of at build: the JavaScript prelude ... is now compiled once per boot and the result shared." This is a caching instance, not a build-time instance, so the sentence announcing it argues against itself; I had to work out that the shared property is "compile once, reuse many times," not "compile before the device runs."

## Terms used before they were explained, or never explained

- *reactor* — used in the introduction and everywhere afterwards; deferred to Article 1, never described here.
- *engine* — same, deferred to Article 1; used in a table row ("The target engine") before any definition.
- *turn* — used in 6.5 for the unit in which savings per operation are quoted; deferred to Article 1.
- *tiers / tiered* — the article's title is "Tiers", but the definition only appears in 6.6.
- *CJI* — used from 6.1 as the name of one of "the two compilers"; the acronym is never expanded and the tool is never described.
- *typed compiler* — contrasted with "the CJI tool" throughout, with no statement of what makes one typed and the other not.
- *lower / lowering* — appears only inside table rows in 6.4 ("emit, lower, link", "Lower and link only"); never defined.
- *QuickJS* — introduced in 6.4 and 6.5's comparison as if known; no description of what it is or how it relates to the typed compiler.
- *world* — used for the unit that has a memory limit ("every world starts", "each world has a memory limit"); never defined.
- *RV32* — target name used from 6.2 on; never expanded (presumably RISC-V 32-bit).
- *SSA-form* — in the Haas et al. quotation, unexplained.
- *prelude* — "the JavaScript prelude" in 6.7; never explained what it contains.
- *slot* — "one of two slots on the file system"; the storage layout is never described.
- *record layout* — used inside the per-function key definition ("the hashes of the signatures and record layouts it mentions"); never explained.
- *confined / unconfined native code* — "the acceptance of unconfined native code inside an otherwise confined world" in 6.6; the confinement mechanism is never described here.
- *hash* — "a cryptographic hash" is used as if self-evident; no statement of what property is relied on (collision resistance) or which function.

## Claims I could not verify from the article itself

- "It saves 8.8 − 1.6 = 7.2 ms of processor time per turn." Missing: what the 8.8 ms and 1.6 ms are (presumably Article 2 measurements of native and WebAssembly Editor per turn), what a turn contains, and whether the 1.6 ms includes interpreter overhead that would also change.
- "Experiment 3 found to be about 58 percent of the native compile path". Missing: the Experiment 3 table, the definition of "frontend" (tokenize, parse, check only?), and why the remaining 42 percent is not exactly the 1.2 s quoted in the table.
- "about 0.01 s to load, plus hashing". Missing: the hashing cost for a 240 kB module on this processor, which is the whole point of the row and is left as "plus hashing". The 1,450 ms reuse figure elsewhere in the article suggests hashing and verification are not negligible.
- "a cold recompile of a small test program took 7,028 ms, and reuse of the stored module took about 1,450 ms at boot." Missing: which program, its size, the engine, and what accounts for the 1,450 ms (hashing? file system read? firmware identity check?). Without those, the two numbers cannot be compared with Editor's 3.1 s.
- "The measured ratio is inside that range: 4.76 bytes of RV32 per byte of WebAssembly function body for Editor." Missing: how the ratio was measured (whole module, or function bodies only, and where the boundaries are), and the flash totals that would follow from it.
- "The compiler is deterministic, and the harness built for Experiment 3 already produces a module of exactly the size the device produces." Missing: the evidence for determinism (which matters, since the whole cache rests on it) and the harness comparison.
- "the firmware partition is 8 MiB and holds about 4.4 MB." Missing: what occupies the other 3.6 MiB and whether the headroom is per-release or per-install; also "8 MiB" and "4.4 MB" mix units.
- "Editor has 120 functions and compiles in about two seconds, so the average function costs under 20 ms on the device." The arithmetic (2000 ms ÷ 120 ≈ 16.7 ms) checks out, but the "so" assumes uniform per-function cost, which compile time is unlikely to be (large functions, linking, memory pressure).
- "If native code saved one millisecond on every call into the application, the compile would be repaid after about 140,000 calls." The arithmetic is right (140.6 s ÷ 1 ms), but the premise is hypothetical and unrelated to any measured per-call figure, so the paragraph cannot be checked against 6.5's Editor numbers.
- "A new firmware release with a changed reactor does not strand previously installed applications, because they can be recompiled against it." Missing: what happens to an application whose source is no longer on the device, and whether the CJI record's firmware identity is what prevents the stranding in practice.
- Franz and Kistler's "can almost compensate for the extra time" and Franz's "little more time than the input of equivalent native code" are given as quotations from sources not included here; I can accept them as quotations but cannot check them.

## Section scores

- Introduction (unnumbered): 5 — the four learning objectives are stated concretely and each is actually delivered later.
- 6.1 Four moments: 5 — the four-row table with "who waits" answers the question directly and the placement of CJI and the typed compiler is unambiguous.
- 6.2 What compilation buys and costs: 4 — three gains and three costs are clearly paired with numbers, but the "must be trusted" cost is one clause forward-referencing Article 7.
- 6.3 A cache keyed by content: 3 — the five-input table is the best part of the article, yet the CJI record covers only three of the five inputs and the two-slot write-order story is under-specified.
- 6.4 Shipping a checked intermediate form: 3 — the three-row comparison is useful, but the 1.2 s vs 58 percent arithmetic does not close and the 0.01 s load clashes with the 1,450 ms reuse figure.
- 6.5 Break-even arithmetic: 4 — the calculation is fully shown and reproducible; the only missing piece is where the per-turn figures come from.
- 6.6 Tiers and mixed mode: 3 — tiering and the 4.76 : 1 ratio land well, but "confined world" is unexplained and the recommendation leans on Articles 3 and 5 that the reader does not have.
- 6.7 Doing the work before the device boots: 4 — the workstation-build idea is clear and the bundled-application plan is concrete; the "one instance of this idea already" example is a cache, not a build-time step, which muddles the paragraph.
- 6.8 A combined design: 4 — the flowchart is readable and matches the text; the "no" branch omits the verify step that the "yes" branch shows.
- 6.9 Key points: 4 — accurate summary; only "2.0 to 3.1 seconds" quietly rounds the 1.99 and 3.14 figures used elsewhere.
- 6.10 Check your understanding: 4 — all six questions are answerable from the text, though question 2 requires assuming the two-slot layout works as intended.

## Questions that the article did not let me answer

All six were answerable, but two only partly:

- **Question 2** (power loss between the two writes) is answerable only if the new write goes to the second slot. The article says "one of two slots" and never states the alternation, so a careful reader cannot tell whether the surviving record points at intact bytes or at a half-overwritten module. A single sentence about writable-slot alternation would close it.
- **Question 3** is answerable because the article quotes both differences (1.15 s and 7.2 ms); it would not have been answerable from the article's own measurements alone, since 8.8 ms and 1.6 ms per turn are only asserted here.
- **Question 4** asks why the design was worthwhile, and the article gives the reason in Franz and Kistler's words rather than its own; a reader must accept the quotation as the argument.

## One thing to add and one thing to cut

**Add:** one worked key computation, end to end — the five inputs, the record fields the CJI installer actually stores, and the mapping between them (which field stands in for the reactor, which for the target engine, which for the function table). Every other section of the article pays off in a concrete number or table; 6.3 alone leaves the reader to guess how its five-input principle becomes three stored fields, and that is the section the whole cache design rests on.

**Cut:** the CJI break-even paragraph in 6.5 ("If native code saved one millisecond on every call into the application, the compile would be repaid after about 140,000 calls"). It rests on an invented one-millisecond figure that is not connected to any measurement in the article, and it repeats the shape of the Editor calculation the reader has just worked through. Removing it would let 6.5 end on the sentence that actually matters — that caching changes the question from "should this be native" to "how often does this change".

# Reader feedback: Article 10, "Architecture and a Roadmap"

## Passages I had to read twice

- "The number of functions is also stored in a header at the start of the reactor's code area, and the linker compares it with the length of the compiler's table." The glossary calls the reserved region *the slot*, this sentence calls it "the code area", and it is not said which file the header lives in or who writes it. I had to guess that "code area" is the slot and that the header is emitted into the reactor's own data.
- "The remedy is an **interface description**: one file that states, for each function, its name, parameter types and result type, from which a build step generates the compiler's table, the trampolines and the C prototypes." It says prototypes, so the C bodies stay hand-written — but 10.8 says "One interface description should generate all three", and the figure labels the third file "the C implementation of each function". Whether the generated artefact is a prototype list or the implementations themselves changes how much work the step 3 item really is.
- "Because asm.js is a subset of JavaScript, an asm.js program means exactly what JavaScript says it means. The asm.js specification adds only the rules for recognizing which programs are in the subset." The second sentence is doing real work (the spec adds recognition, not semantics) but the phrasing made me re-read to see whether "adds only" was a limitation or the whole point.
- "`s.charCodeAt(i)` out of range | Traps | Returns NaN | A wrapper class with a checked method". Every other row gives a one-expression fix; this one suddenly requires a class, and it is not explained why a helper function would not do, nor where the class comes from.
- "Application code is under 10 percent of key press to pixels (Article 2's rough model gives under 5 percent of the measured part)". "Of the measured part" is ambiguous — 5 percent of the whole key-to-pixel time, or 5 percent of the sub-interval that was actually measured? The two readings give very different thresholds for the check.
- "Steps 0 to 4 are small and low-risk and do not depend on one another; they come first". The flowchart shows step 3 feeding steps 6, 8, 9 and 10, so the sentence reads as contradicting the arrows until one decides it only means "no dependencies *within* 0–4".
- "Note that in the measured firmware it was already native code. The cost lies in what the compositor is asked to do." This is the hinge of the whole section — the compositor is fast, so the cost is the JSON work around it — but "what the compositor is asked to do" is vague enough that I only understood it after reading the five-step list.

## Terms used before they were explained, or never explained

- **the device** — the whole article is about "the device", its flash, boot time and speed, but the machine is never named and its flash and RAM totals are never given, so the cost claims have no denominator.
- **JSON** — used as the name of the screen-update format in 10.3 and in the key points, never defined and not in the glossary.
- **ELF** — "Loads RV32 ELF modules" in 10.1; the format is never expanded or glossed.
- **driver** — "which today includes the compositor and the drivers" (10.5); the glossary's *World* entry mentions drivers but never says what one is.
- **capability** — 10.2 says the interface description must record "which capability the function requires"; the glossary defines *Claim* but not capability.
- **garbage collector / garbage-collected heap** — used in 10.1 and 10.3 as the thing a typed compositor would not need; the glossary defines *Arena* and *Region* but never garbage collection.
- **mutation testing** — the check column of the verifier prediction in 10.7; not explained anywhere.
- **interactive console** — appears in the QuickJS row of 10.5 as a separate reason to keep QuickJS; no earlier article summary introduces such a console.
- **relocated at boot** — the CJI tool row of 10.1; the relocation is referred to later in 10.5 ("a boot-time relocation that had to be scheduled around") but its cost and reason are never stated.
- **UTF-16 / UTF-8** — the conversion in step 2 of 10.3 is not explained; a reader who does not already know why the buffer is UTF-16 and what escaping costs cannot follow the six-bytes-per-unit figure.

## Claims I could not verify from the article itself

- "After two days of rapid work the device carries more machinery than any one design would have chosen." There is no record of the two days and no counterfactual design; "would have chosen" is a judgement presented as a premise for the whole article.
- "Together they are a cost in flash, in boot time and in the number of things a maintainer must understand." The flash cost is never totalled and the device's flash capacity is never stated, so I cannot judge whether 660 kB plus 43 kB plus reactors is large or small.
- "The design notes budget up to six output bytes per input unit for this step." The note is not reproduced and the figure is not derived; I would need to see how three UTF-8 bytes plus escapes reach six.
- "The figure of six bytes per unit in step 2 is from the Editor's capacity design note in the project's records." Pointing at an unpublished note is not evidence a reader can check.
- "Article 2 presented evidence that the compositor is the largest consumer of time on the path to the screen, and noted that in the measured firmware it was already native code." The measurement is not reproduced here, and "already native code" is asserted without saying what was native, so the reader must accept the premise before the section makes sense.
- "TypeScript 5.8 added an option that rejects every TypeScript construct with run-time behaviour" and "That proposal is at stage 1 of the committee's process". Both are external facts with a version number and a process stage; nothing in the article lets me check them, and neither is given a date in the text.
- "A compile-time operand stack gives 593 instructions for Files, where today there are 1,529 (Article 5)". Both counts appear without a definition of what is counted as an instruction (whole module? hot functions?), and neither is derived here.
- "With a cache, an unedited Editor costs under 100 ms at boot instead of 2–3 s (Article 6 expects 14 ms to load plus tens of milliseconds to hash)". "Tens of milliseconds" is a range, so the 100 ms threshold cannot be checked even in principle from this article.
- "The `await` transformation reproduces Editor's behaviour using no more than its current 71 state fields (Article 8, section 8.6)." The figure 71 is never shown or counted; the reader cannot tell what a "state field" is here in enough detail to check it.
- "A full Editor screen is 17 rows of at most 49 characters." I can check the arithmetic that follows (17 × 49 = 833 code units; 833 × 2 = 1,666 bytes; plus 17 × 4 = 68 bytes of row header gives 1,734), but the inputs 17 and 49 are stated, not measured, and the 4-byte header is asserted to be enough for style, indentation and length without saying how styles are encoded.

## Section scores

- **10.1 What the firmware contains** — 4. Two inventories are clear and the multipliers check out arithmetic (1,730/316 ≈ 5.5, 1,337/307 ≈ 4.4), but the sizes have no budget to compare against because the device is never described.
- **10.2 One description of the reactor's functions** — 3. The failure mode (same length, different order) is explained well and the figure helps, but the section then detours into WIT, resource handles, capabilities and fuel, and the reader loses track of whether the interface description is one flat list or needs three extra per-function fields.
- **10.3 A typed screen protocol** — 4. The five-step walkthrough and the byte count are the clearest part of the article; it loses a point for the undefined six-bytes-per-unit figure and for never saying how a style is encoded in four bytes.
- **10.4 One source for both engines** — 3. The table of rewrites is concrete and convincing, but the two "developments in the JavaScript world" are told at length and their relevance (neither is quite this language) is left for the reader to work out, and the reader is never told what the typed source actually looks like.
- **10.5 Fewer engines** — 5. The four conditional rows and the explicit "remove now" recommendation are the crispest reasoning in the article.
- **10.6 The roadmap** — 3. The table is excellent; the paragraph after the diagram is hard because the arrows and the prose disagree about what depends on what, and step 4 is a bundle of eight unrelated items with a single effort cell of "small each".
- **10.7 Predictions that would falsify the plan** — 4. Refutations with named fallbacks are exactly right, but the numbers they check (593, 71, 1,529) are not visible in this article, so the reader takes them on trust.
- **10.8 Key points** — 5. Accurate and shorter than the sections it summarises.
- **10.9 Check your understanding** — 4. The questions cover the article well; question 1 depends on the prototype-versus-implementation ambiguity noted above, so a careful reader may answer it more narrowly than intended.

## Questions that the article did not let me answer

All six questions could be answered from the text, with one caveat each:

- **Question 1** is answerable, but "how does the proposed interface description remove both?" only works if the generated C artefact includes the function order the trampolines rely on. The section says "the C prototypes" while 10.8 says "all three"; a reader who takes 10.2 literally can still answer the count half but must assume something about the order half.
- **Question 6** is answerable but only loosely: the "If it fails" column gives a direction ("look at hashing and load costs", "re-examine the counting model") rather than a decision rule, so "what the plan says to do then" is a short paraphrase of that cell rather than a procedure.

Everything else — the three text-only steps, the two rewrites for question 3, the limit of a same-source reference, and the arithmetic behind "`await` before the ports" — is stated plainly enough in the text.

## One thing to add and one thing to cut

**Add:** a cost budget. A short table giving the device's total flash and RAM next to the subtotals the article already reports (660 kB CJI tool, 43 kB typed compiler, 508 + 869 + 334 lines of reactor C, 485 lines of compiled compositor JavaScript) would turn "a cost in flash, in boot time" from an assertion into something the reader can weigh, and would let steps 2 and 11 in the roadmap be judged instead of believed.

**Cut:** the second half of the external-detour material in 10.4 — the asm.js sentence about what its specification "adds only", and the explanation that the type-annotations proposal is at stage 1 of the committee's process. The concrete table of rewrites already carries the argument that a JavaScript emitter is feasible; the procedural detail about two other projects' standing is the part a reader skips, and it competes for attention with the six constructs that matter.

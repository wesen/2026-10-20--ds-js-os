# Feedback on "10. Architecture and a Roadmap"

## Passages I had to read twice

- "A count of functions is also packed into a header word that the linker checks. If the order in the first two files ever differs, calls go to the wrong function with arguments of the wrong meaning, and no check detects it." The first sentence promises a check and the second says no check exists; I had to work out that the header check counts functions but does not compare their order.
- "The WebAssembly Component Model's interface language, WIT, is a current example and has a useful property for this system: it can declare a *resource* type, an entity 'that can only be passed around indirectly via handle values', with owned and borrowed handles." The quoted definition is circular for a reader who does not already know what a handle is, and it arrives in a single dense sentence.
- "Because it is a subset, its meaning is JavaScript's; only validation is new." I read this three times before seeing that "only validation is new" contrasts asm.js with other compilation targets, which add semantics of their own.
- "The project's device-language study considered and rejected compiling the typed language to JavaScript as a way to run applications, because arithmetic would still be boxed. The purpose here is different and does not depend on speed." The paragraph first rejects the idea and then adopts it; the distinction between "a way to run applications" and "a reference implementation" is only clear on the second reading.
- The table row "| CJI compiler tool on the device | Compiling unannotated JavaScript on the device is a goal | Now. ... |". A row whose "needed as long as" cell states a live goal and whose "could be removed when" cell says "Now" reads as self-contradictory until one realises the point is that the goal has been abandoned.
- "Three features of the ordering deserve a sentence each. Steps 0 to 4 are small, independent and low-risk, and they should be done first in any order." "In any order" contradicts the numbered order the table presents, so I was unsure whether the numbering inside 0–4 carries information.

## Terms used before they were explained, or never explained

- *nucleus* — used in the table and in 10.2, never defined anywhere in this article.
- *reactor* — given only as "Connects a fully typed application to the nucleus", which leaves the word unexplained.
- *world* — used throughout ("JavaScript worlds", "unported JavaScript worlds exist"), never defined.
- *CJI* — never expanded and never described; I inferred only that it is a compiler for unannotated JavaScript.
- *WAMR* — expanded nowhere; I inferred "WebAssembly runtime" from context.
- *RV32* — never expanded (I know it means 32-bit RISC-V, but the article does not say so).
- *ELF* — never expanded.
- *trampoline* — used twice before the reader can infer it means a one-instruction jump stub.
- *PMP* — appears once in the roadmap table as "worlds in user mode under PMP", never explained.
- *fuel* — charged per call in 10.2 and used as a step name, never defined.
- *guard facts* — step 8's unlock, never explained.
- *per-turn arena* — step 8's other unlock, never explained.
- *content key* — step 1's phrase, never explained.
- *state fields* / *liveness-based saving* — used in 10.7 and section 10.9 question 5-adjacent material without an explanation of how a field is saved.
- *unboxed integers* — used in the asm.js paragraph without explanation.
- *code unit* — "no string operations beyond single code units" assumes the reader knows UTF-16 code units.

## Claims I could not verify from the article itself

- "The typed versions are five to six times longer than the programs they replace." Counting the article's own numbers, Editor is 1,730 / 316 = 5.5× but Agenda is (468 + 869) / 307 = 4.35×. The evidence behind the range is not shown, so the claim holds for one application and not the other.
- "That is three engines, two compilers, two run-time systems and three reactors." The table lists QuickJS, WAMR and a "native loader" as candidates for engines, and the two run-time systems are not identified; the counts cannot be reproduced from the table alone.
- "a typed binary protocol ... A screen of 17 rows of 49 characters is under 2 kB in such a form." 17 × 49 = 833 characters, so this needs about 2.4 bytes per character. No record layout or field widths are given, so the figure cannot be checked.
- "The reactor's 28 functions are listed by hand in three files"; "Editor contains 104 such `writeLiteral` calls"; "about 1,730 lines of typed source". These are counts the reader must take on trust; no file or command is cited.
- "Step 5 | RV32 backend with a compile-time operand stack | medium | medium | Native code about 2.7 times smaller". The 2.7 multiplier appears only in the roadmap table; no measurement or derivation is given in this article.
- "A compile-time operand stack gives 593 instructions for Files, where today there are 1,529 (Article 5)". The 593 is a prediction, and no counting model is shown here, so the reader cannot see how it was reached.
- "Article 2 presented evidence that the compositor is the largest consumer of time on the path to the screen". This is the load-bearing evidence for step 10, and it is entirely in another article.
- "TypeScript 5.8 added an option that rejects every TypeScript construct with run-time behaviour" and "a proposal before the JavaScript standards committee would have engines ignore annotations ... (it is at the first of the committee's stages)". Both are asserted and left to the references; nothing in the article shows what the option rejects or accepts.
- "The design notes budget up to six output bytes per input unit for this step." The design notes are not part of the article.

## Section scores

- **10.1 What the firmware contains — 4.** The two inventory tables are clear and the component/role/size columns carry real information, though the summary sentence "three engines, two compilers, two run-time systems and three reactors" does not follow visibly from the table.
- **10.2 One description of the reactor's functions — 4.** The failure mode and the remedy are both clear; the density of unexplained terms (capability, fuel, handle) pulls it down.
- **10.3 A typed screen protocol — 4.** The five numbered steps are the best explanation in the article; the argument for *why* the compositor is expensive is deferred to another article, so the conclusion is only asserted.
- **10.4 One source for both engines — 3.** Interesting and well evidenced by the rewrite table, but the asm.js history, the erasable-syntax aside and the rejected-then-adopted device-language study make the reader work out the point unaided.
- **10.5 Fewer engines — 3.** The table is clear except for the CJI row, whose two columns read as contradicting each other, and "worlds" and "drivers" are undefined.
- **10.6 The roadmap — 5.** Effort, risk, unlocks and article reference in one table, plus three sentences justifying the ordering and a dependency diagram; this is the clearest section.
- **10.7 Predictions that would falsify the plan — 4.** The prediction/check/if-it-fails structure is exactly right; the individual numbers are unexplained, so the reader cannot judge how tightly each prediction constrains the plan.
- **10.8 Key points — 5.** Six bullets, each checkable against a section, no new material.
- **10.9 Check your understanding — 4.** All six questions are answerable from the text, but question 2's boundary ("only because of text") depends on how the reader classifies the compositor's tree walk.

## Questions that the article did not let me answer

All six questions can be answered from the article. Two answers are weaker than the questions imply:

- Question 2 asks for "the steps" that exist only because of the text exchange. The article lists five steps but never says which of them survive in a binary world; the reader must infer that step 3 still applies and that the walking part of step 5 disappears. A declarative "steps 1, 2 and 4 disappear" is missing.
- Question 1 asks "why does the proposed interface description prevent it?" The answer depends on the claim that a build step generates the files, but the article does not say whether the generated files are regenerated in CI or checked in, so the strength of "prevent" is not stated.
- Question 4 is answerable, but the article never explains *how* the two implementations are compared — "comparing screens" assumes a screen-comparison harness that is not described.

## One thing to add and one thing to cut

- **Add:** a short glossary of the project's own vocabulary (nucleus, reactor, world, CJI, capability, fuel, handle, PMP), placed before section 10.1. The article is written for readers who have read the earlier articles; a term list would let a first-time reader follow the architecture without six lookups.
- **Cut:** section 10.8 "Key points". Every bullet restates a sentence that appears in the section it summarises, and the roadmap table in 10.6 is a better summary of the same material; removing it would shorten the article without losing an idea.

# Feedback on article 4, "Making Inference Affordable, or Avoiding It"

## Passages I had to read twice

- "Ranges are computed for values nobody asks about | A proof is needed only for operations compiled as integer arithmetic pending that proof | Demand-driven analysis". I read this three times before decoding it: the "proof" here is the range proof that decides whether a provisionally-integer operation stays integer, and the glossary's *Demotion* entry [3] had to tell me what "provisional" meant. The row also says "nobody asks about" while the evidence says some operations do need the fact; the contrast (all values vs. the few consumers) is only stated two paragraphs later.
- "It can only become more precise." (table, dependency order row) together with "it also *raised* precision, because widening is applied only inside cycles and each component is narrowed before its results are used". The verdict is given before any mechanism, and the mechanism is a single subordinate clause. I had to reconstruct for myself that in a whole-program iteration a widened bound can leak across a loop boundary, whereas per-component solving narrows first and never widens outside a cycle.
- "The objection confuses two things." Two sentences pass before the two things (the formula and its result) are named, so the sentence reads as a bare dismissal on first pass.
- "A jump function stores an expression per argument instead of a result per program point, which is the property that matters on this device." The previous sentence gave a memory figure (4.5 MB to 7.3 MB inside an 8 MiB heap) and this sentence gives a reason, but the reason is stated as a fact about "this device" without saying which property (memory, not time) is the constraint. I re-read to decide whether the argument was about memory or about cache-friendliness.
- "Inside the body of `while (i < n)`, the value `i` is known to be less than `n`, and plain SSA uses the same name for `i` on both sides of the test." The illustration that follows is an `if`/`else`, not a `while`, and it introduces a free variable `n` that is never renamed, so I re-read to check whether the example matched the claim.
- "Range analysis and its relatives have been made incremental by expressing them as rules over relations and maintaining the derived facts under changes." I have no picture of what "rules over relations" looks like, so the sentence names a technique without letting me recognise it.
- "An experimental cache that stored complete per-function results avoided 62 percent of those 2,741 and cut 29 percent of compile time on a workstation, and it was rejected because storing complete results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap." 7.3 MB is still below the 8 MiB heap, so the stated cause does not obviously produce the stated rejection; I re-read looking for a missing step about headroom.

## Terms used before they were explained, or never explained

Neither the article nor `glossary.md` explains the following (I checked every one against the glossary as a reader):

- **counted strings** (section 4.2, "integers, booleans, counted strings and records") — never defined; the glossary lists `string` and `buffer` but not "counted", and a reader cannot tell whether it means length-prefixed.
- **dominance / dominance computation** (section 4.1, SSA paragraph) — used as though known, absent from the glossary.
- **topological order** (section 4.1, dependency order) — required to follow the algorithm, never explained.
- **narrowing** (section 4.1) — explained in a parenthesis in the article but not in the glossary, while its partner term *widening* is a glossary entry; inconsistent treatment.
- **rules over relations** (section 4.1, incremental analysis) — the Datalog style is never named or illustrated.
- **compositional** (section 4.1, "the fully *compositional* variant") — used as a term of art with no definition, in article or glossary.
- **sparse conditional constant propagation** (section 4.1) — named as "the standard algorithm of this kind" but never described; a reader cannot tell what it does beyond the one-line idea of sparse propagation.
- **uniform run-time representation of values** (section 4.2, under Generic code) — never explained; the boxed/tagged alternative is implied but not stated.
- **ABCD** (section 4.1, demand) — used as a proper name with no expansion of the acronym, though its purpose is described.
- **the companion report** (section 4.1, demand) — a dangling reference; no title, number or link, so a reader cannot follow it.

Terms that were used before the paragraph that explains them, but which the glossary does cover, so I am not counting them as failures: *summary*, *jump function*, *dense/sparse*, *SSA*, *strongly connected component*, *demotion* (the table's "provisionally compiled as integer arithmetic").

## Claims I could not verify from the article itself

- "Removing all 25 local annotations from one of its source files produced byte-identical output." Which file, which output (WebAssembly or RV32), checked with which command, and why removing an annotation could not change the result in some corner? Nothing in the article lets me check this, and "byte-identical" is a strong claim for an experiment reported in one sentence.
- "the project used one to remove 15.9 million run-time type dispatches from CJI's own code." No denominator (out of how many dispatches?), no before/after timing, no description of the measurement.
- "One-pass compilation in seconds on the device" (section 4.2 table, typed-compiler row). No program size, no compile time, no artifact named; "seconds" is the only quantity and it is not measured.
- "The system's 22 existing programs are not annotated." No list or count evidence; a reader cannot check the number or what "existing" ranges over.
- "solving component by component was the largest single gain, up to 450 times faster on one program, and it also *raised* precision". The precision half is only asserted; no before/after range for any value is shown, and "up to 450 times on one program" hides what the typical gain was.
- "it was rejected because storing complete results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap." As written, 7.3 MB still fits in 8 MiB; the missing step is how much headroom the compiler needs, or why 7.3 MB is unusable, so the rejection does not follow from the figures given.
- "with the range analysis removed altogether, CJI still needs 170 seconds for Agenda". The 25 minutes quoted at the top of this article is the whole compile; the article does not show how 25 minutes minus range analysis leaves 170 seconds, and I have not read Article 3 here.
- "the authors report execution well over ten times faster than the embedded interpreters it was compared with", offered as evidence that "the type annotations already present in the source do the work that inference and optimization do elsewhere". The comparison is against interpreters, which does not isolate the effect of annotations; the evidence that would support the claim is a typed-versus-untyped build with the same compiler.
- "The typed compiler does exactly this" (after defining bidirectional typing). No evidence in the article that the typed compiler implements a bidirectional algorithm rather than a simpler bottom-up pass; only the annotation-removal experiment is offered.
- "native compilation 'requires sound types for performance'" (Static Hermes quote). The quoted reason is stated but never connected to a measurement the article shows.

## Section scores

- **4.1 Five kinds of waste — 4.** The table gives each technique a measured motivation and an explicit "does the answer change?" verdict, and each subsection works through a small example; it loses a point because several mechanisms (why component order raises precision, what narrowing buys, what "rules over relations" means) are compressed into single clauses that a reader must reconstruct.
- **4.2 Declared boundaries — 4.** The definition of a declared boundary, the claim that checking becomes local, and the three costs are stated plainly and honestly, including the cost of porting existing code; it loses a point because "counted strings" and "one-pass in seconds" are unexplained and the four-row table mixes a language mechanism (Modula-2 definition module) with a wording rule (isolated declarations) without saying so.
- **4.3 Where the two families meet — 2.** The section is two paragraphs, and the meeting point is asserted rather than demonstrated: one CJI feature is named, but no function is shown compiled both ways, and "as the typed language grows towards records with methods, arrays and closures" has no example or timeline.
- **4.4 Key points — 4.** Each bullet is a fair one-sentence restatement of a section and the last bullet keeps the article's central distinction; it repeats the claims without their numbers, so it reads as a summary of a summary rather than as a checklist a reader could test themselves against.
- **4.5 Check your understanding — 3.** Every question is on-topic and four of six can be answered directly from the text with arithmetic (1, 3, 4, 6); question 2 depends on wording that appears only in the 4.1 prose, and question 5 asks for "practical consequences" that the article states as properties, never as consequences.

## Questions that the article did not let me answer

- **Question 5, second half ("two practical consequences ... for a compiler that runs on the handheld").** Section 4.2 gives the three properties of local checking (cost proportional to function size, any order, no effect on other functions' generated code) but never says what they buy on the device. The only consequence the article draws anywhere is in 4.4 ("only local checking gives interactive compile times"), and a second consequence, such as reusing a function's compiled output across builds, must be inferred from the no-cross-function-effect property; neither is spelled out where a reader answering the question would look.
- **Question 2** is answerable, but only by importing the "formula versus result" phrasing from the paragraph that begins "A natural objection is that facts flow from callers into callees"; a reader who only reads the section heading "Summaries: analyze a body once" will think the question is about caching results, which the article elsewhere says was rejected for memory.
- All other questions (1, 3, 4, 6) are answerable from the text as printed.

## One thing to add and one thing to cut

**Add:** a worked example in section 4.3 of one small function and its declared boundary, shown as the typed compiler would need it written, next to the unannotated form CJI accepts. Section 4.3 is the article's climax and it currently asks the reader to accept that the two languages meet on the strength of a comment annotation syntax; five lines of code would make the claim checkable and would also give question 6 something concrete to point at.

**Cut:** the sentence "For a restricted but useful class of range constraints, the exact best answer can even be computed in polynomial time with no widening at all [Su & Wagner 2005]." It is the only mention of that result, the "restricted but useful class" is never characterised, and nothing later in the article depends on it, so it is a reader's detour that costs attention at the exact place (the end of the dependency-order subsection) where the argument needs to stay on the main line.

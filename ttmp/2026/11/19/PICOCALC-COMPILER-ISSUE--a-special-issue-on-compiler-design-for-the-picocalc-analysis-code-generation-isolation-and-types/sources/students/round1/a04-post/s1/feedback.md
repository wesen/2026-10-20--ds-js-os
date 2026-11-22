# Feedback on `article.md` — "4. Making Inference Affordable, or Avoiding It"

## Passages I had to read twice

- "The summary is computed once *because it is a function of the facts, and does not contain them*." I had to re-read this twice; "a function of the facts" is doing a lot of work with no illustration. It became clear only after the following sentence about facts travelling around the call graph.
- "A summary must be recomputed only when the function's own text changes." Read alone this is confusing, because the text also changes when a callee's signature changes; and in section 4.2 a function's compilation depends on its callees' declarations. I had to decide for myself that summaries here concern only the body's internal dependence.
- "When a jump function would be too complicated to represent, the analysis records 'unknown' for that argument. The result is then less precise and still correct." The word "correct" is used without saying what correctness means for this analysis (safety? agreement with concrete execution?). A reader who does not already know abstract interpretation has to guess.
- "It does, on one condition: the representation must create a new name wherever a fact about a value can change." "A fact about a value" is not defined; I only understood it from the branch example that follows.
- "SSA itself can be built directly while parsing structured code, without a separate dominance computation." This arrives as a bare clause at the end of a paragraph. It is relevant to a one-pass compiler on the device, which is the whole point of the article, but the connection is never drawn.
- "the operations provisionally compiled as integer arithmetic" — "provisionally" is unexplained; I could not tell whether it means "speculatively chosen and later reverted" or "chosen by default and checked later".
- "The viper emitter requires type hints and treats annotated integers as machine words, so that arithmetic wraps at the word size, which is the same decision the typed compiler made for `i32`." I read this twice to check whether wrapping is presented as a benefit or a hazard, since wrapping arithmetic is usually a bug source in range analysis, the topic of section 4.1.
- "whether it fits in CJI's heap is an open, testable question." The article gives no reason to think a jump function is small, so the claim that it would fit better than a per-program-point result cache is asserted rather than argued.

## Terms used before they were explained, or never explained

- **CJI** — used in the first sentence and throughout; never expanded or defined in this article.
- **Agenda** — used as the name of a program or benchmark from the very first table row; never introduced here.
- **Article 3** and **the companion report** — referenced for most of the numbers, but not contained in the file, so the evidence base sits outside the article.
- **"the 11.7 million joins" / "11,760 function visits"** — the unit of measurement is never defined (per what? one build of Agenda?).
- **widening** — used in section 4.1 ("iteration, with widening followed by a refining step called narrowing") but never explained; a reader cannot tell what widening does or why it loses precision.
- **narrowing** — same; named only as "a refining step".
- **lattice-based analyses** — "lattice" is never defined, in a section that then builds an argument on incrementalizing lattice analyses.
- **π renaming** — introduced as "a renaming, written π", but how the renaming is represented and where it lives is not said.
- **abstract interpretation / soundness** — never used, though "still correct" and "sound types" depend on that notion.
- **worlds** — "The 22 existing worlds are not annotated" (section 4.2); "world" is never explained.
- **QuickJS** — named once as where unannotated worlds run, with no explanation of what it is.
- **specialization rounds** — "CJI's specialization rounds are the automatic version of the first"; neither the rounds nor "the first" is fully specified at that point.
- **"provisional"** integer operations — see above.
- **negative-zero error** — referred to as described in a report the reader does not have.
- **`isolatedDeclarations`, `.mli`, definition module** — the table assumes the reader knows what separate compilation means; the term itself is never defined.

## Claims I could not verify from the article itself

- "78.3% of 11.7 million joins had identical inputs" and "39.6 percent of writes into the table stored the value already there." These are the quantitative basis for the sparse-propagation argument, but the article gives no method: was the count instrumented, over how many builds, with what definition of "identical"? Only Article 3 is cited, and it is not present.
- "9,019 were skipped because the function's inputs had not changed. An experimental cache ... avoided 62 percent of the remaining visits and cut 29 percent of compile time on a workstation, and it was rejected because storing complete results raised peak memory from 4.5 MB to 7.3 MB." No description of the experiment, the workload, or the measurement setup is given, so this cannot be checked or reproduced from the text.
- "A jump function stores an expression per argument instead of a result per program point, which is the property that matters on this device. Whether it fits in CJI's heap is an open, testable question." The inference from "expression per argument" to "smaller" is not quantified, so the conclusion is an assertion.
- "One implementation for C made an interval analysis 5 to 110 times faster and extended its reach from programs of 111 thousand lines to 1.4 million." Cited, but no conditions are given (which analysis, compared against what, on which benchmarks); the spread from 5× to 110× is unexplained.
- "up to 450 times faster on one benchmark, and it also *raised* precision." A single benchmark is quoted without saying whether the gain was typical; the mechanism for the precision gain is only sketched ("widening is applied only inside cycles").
- "In the original implementation it removed on average 45 percent of executed bounds checks, using fewer than ten analysis steps per check." No benchmark suite is named, and "analysis steps" is undefined.
- "Removing all 25 local annotations from one of its source files produced byte-identical output." The file is not named and "byte-identical" is not tied to a shown experiment; a reader cannot tell whether this is a reproduction or a claim.
- "the project used one to remove 15.9 million run-time type dispatches from CJI's own code." No measurement method or before/after time is given, so the reader only learns a count.
- "with the range analysis removed altogether, CJI still needs 170 seconds for Agenda." Depends entirely on Article 3; no breakdown is shown here.
- "The authors report execution far faster than the embedded interpreters it was compared with." "Far faster" is not a number, so nothing can be checked.
- "there are 'no optimizations to speak of except for a simple peep-hole pass'" — the quotation is attributed to [Ball et al. 2019] but no page or section is given.

## Section scores

- **4.1 Five kinds of waste** — 4. The table is an effective map and the jump-function example is worked enough to follow, but the terms widening/narrowing and the measurement units are left undefined, and the passage on correctness is too compressed.
- **4.2 Declared boundaries** — 5. The definition of a declared boundary is the clearest paragraph in the article, the four-row comparison table earns its place, and the three costs are stated plainly.
- **4.3 Where the two families meet** — 3. It is short enough to be clear but leans on CJI facts (annotation-in-comments, 15.9 million dispatches) that a fresh reader has never been given, so it reads as a conclusion to a different article.
- **4.4 Key points** — 4. The bullets match the sections accurately; "computed once per function body because they describe a dependence" is the clearest statement of the point that section 4.1 fumbled.
- **4.5 Check your understanding** — 4. Every question is answerable from the text except that question 5 asks specifically about consequences "for a compiler that runs on the handheld" while the text mostly states generic properties; the questions are otherwise well matched to the material.

## Questions that the article did not let me answer

- **Question 5, partly.** It asks for "two practical consequences ... for a compiler that runs on the handheld". The article gives *properties* of local checking (cost proportional to function size, any order, edits not propagating) and one handheld fact (one-pass compilation in seconds on the device, in the Modula-2/TypeScript table). Connecting properties to handheld consequences — incremental rebuilds, no 170-second whole-program pass — required inference on my side. The article would need one sentence making that link explicit.
- **Question 4, borderline.** The article does say iteration is needed "inside a component that contains a cycle" and "never ... between components", and it names widening and narrowing. But because neither operation is explained, the answer can only be repeated, not understood. Nothing is missing factually; an explanation of widening and narrowing is what is missing.
- Questions 1, 2, 3 and 6 were fully answerable from the text.

## One thing to add and one thing to cut

**Add.** Two or three sentences, right after widening and narrowing are first named in section 4.1, explaining what widening does (jumping to a coarse bound to force termination on a cycle), what precision it costs, and why narrowing recovers part of that cost. Every question about the dependency-order remedy and the "raised precision" claim depends on this, and the article currently assumes the reader already knows it.

**Cut.** The paragraph in section 4.1 that describes the rejected per-function result cache ("An experimental cache that stored complete per-function results avoided 62 percent of the remaining visits ..."). It is a dead end presented with the most precise numbers in the section, and it competes with the jump-function argument it is supposed to motivate. If the memory-versus-time trade-off is worth teaching, it belongs in a footnote with the experiment described; as written it reads as an aside that makes the jump-function case *less* concrete than the worked `nextIndex` example alone.

# Feedback from a student reader

Read as a first-time reader of the series: `article.md` start to finish, keeping `glossary.md` open for lookup.

## Passages I had to read twice

- **3.2, the widening table.** "the upper bound has moved twice: widen to [0, +∞)" and then "| 4 | [0, 3] | [0, +∞): unchanged, so this is the fixpoint |". The left column is labelled "Pass", but the right column reports a *change of representation* rather than a new fact about `i`, so I could not tell whether the fixpoint is supposed to be pass 3 (the jump) or pass 4 (the first unchanged pass). The word "twice" is also unexplained: the upper bound has moved on every pass, so which two moves trigger the widening?
- **3.5, fourth table row.** "Running the range proof once after the last round instead of after every round, except where an early proof is needed for correctness". I cannot tell how many analyses that variant actually ran — one, or one plus some early ones — so the resulting "63%" cannot be interpreted.
- **3.4 vs 3.5, two attributions that seem to compete.** "A profile on a workstation attributed 88.0 percent of all executed instructions to the range analysis." and later "a timing of CJI's internal passes on a workstation attributed 94 percent of pass time to library specialization together with the inference it triggers." Both numbers are offered as the main cost, of what looks like the same time, in the same build. I had to read twice to guess that one is *instructions* and the other is *pass time*, and I still do not know whether the range analysis runs inside the specialization passes or beside them.
- **3.3/3.4 boundary.** "A demotion changes a variable's type, which can change other functions' types, so type solving must run again after it." Then 3.4 accounts for exactly seven range analyses and nothing else. I had to read twice to see whether the re-solving caused by demotions is inside those seven or on top of them.
- **3.1, the constraint inventory.** "the type of `x` includes the integer 3 that `area` passes and whatever `v` holds when `half` passes it". "Whatever `v` holds" puts no bound on the set, so I could not tell how a solver keeps this finite — that only becomes clear much later, from the discussion of finite type labels in 3.2.
- **3.4, the round list.** "Specialization therefore proceeds in rounds: specialize, infer, discover new call sites, specialize again." with "six rounds that add 12, 58, 1, 4, 3 and 1". The counts fall from 58 to 1 over five rounds; the article never says what makes a round stop producing helpers, so I read the numbers as unexplained data rather than as a trace.
- **3.6, the Self measurement.** "while almost two thirds were under a tenth of a second, in a system that still ran two to three times faster than the Smalltalk implementations of its day". "in a system" has no visible antecedent (third-generation Self?), and with no total number of pauses given, "two thirds" cannot be related to the 195 and 21 counts in the same sentence.

## Terms used before they were explained, or never explained

- **call site** — used in the 3.1 quotation and again in 3.4 ("a separate copy of `map` for each call site"); not defined in the article and not in the glossary.
- **profile / profiling** — 3.4 and 3.5 rely on "a profile on a workstation" without saying what a profile records (time, instruction counts, per-function totals).
- **helper** — 3.4 counts "12, 58, 1, 4, 3 and 1 specialized helpers" without ever saying that a helper is one of the specialized copies introduced two paragraphs earlier.
- **hash** — 3.5 row 1, "Link, assemble and hash", with no explanation of what is hashed or why hashing belongs in compile time.
- **claim** — 3.3 says CJI treats integer arithmetic "as a claim to be proved", but the glossary's *Claim* is a manifest permission checked by the nucleus. One word, two unrelated meanings, no disambiguation.
- **message send** — 3.6: Self "made every operation, including arithmetic, a message send"; neither article nor glossary says what a message send is.
- **bytecode** — 3.5, "QuickJS compiling the same source to bytecode"; assumed knowledge, absent from the glossary.
- **garbage collection** — 3.5 measures it at 85.9 s; the glossary defines *Arena* but never garbage collection.
- **`countUnit`** — 3.3 refers to "an addition such as `at + 1` in the `countUnit` example" from Article 1; the example is not reproduced here, so the reference is unusable while reading this article alone.
- **rounding to nearest** — 3.3 depends on it ("cannot be represented and is rounded to 2⁵³") without stating the rule; a reader who knows that 2⁵³ + 1 is *between* two representable numbers needs the tie-breaking rule to see why it goes down rather than up.

## Claims I could not verify from the article itself

- "Nearly twelve million joins to compile a sixteen-kilobyte source file is where the 25 minutes go." The join count and the pass/visit counts are given, but no join is timed, so the causal step is missing: 11,743,517 joins against 11,760 function visits means about a thousand joins per visit, and the article never explains how a single function visit produces a thousand joins. What is needed is joins-per-pass, or a cost per join from the profile.
- "The number of joins performed is a direct measure of how much work a range analysis does." Asserted without support; the preceding table suggests passes and visits are also measures, and the reader is not told why joins is the right one.
- "A profile on a workstation attributed 88.0 percent of all executed instructions to the range analysis." No method is given: which build, which variant of Agenda, what counted as belonging to the range analysis, and whether the source was the same 16,326 bytes.
- "Running the range proof once after the last round instead of after every round, except where an early proof is needed for correctness" → 1,475 s → 544 s, described as "63% of the time". I can check the arithmetic ((1475 − 544)/1475 = 63.1%), but not the claim it is used for. If seven analyses are 88% of the time, keeping one of them should save 88% × 6/7 ≈ 75%, not 63%; the gap is presumably the "except where an early proof is needed", whose extent is never quantified.
- "a larger heap saved 1.2%" — 1.2 percent of what: total compile time, or the 5.8 percent spent in garbage collection? The row cannot rule anything out without that.
- "Passes over the whole program, summed over the seven analyses | 95" and "averaging about fourteen passes each" — 7 × 14 = 98 ≠ 95, and 95 × 124 = 11,780 ≠ 11,760. No per-round pass counts are given, so neither total can be reconstructed, only checked for rough consistency.
- "the product is sometimes a fraction, and the multiply must be a floating-point operation" (3.1) — true for the example, but the article does not say what stops a compiler from emitting *both* paths and choosing at run time, which is the obvious objection to a reader who knows about guards.
- "of all the compilation pauses in that session, 195 exceeded a fifth of a second and 21 exceeded one second, while almost two thirds were under a tenth of a second" — the total number of pauses is missing, so the proportions cannot be checked.
- "CJI needs 170 seconds, and the typed compiler handles the typed functions of its version of Agenda in 0.5 to 0.7 seconds (Article 1)" — verification is deferred to another article, and the two programs are not the same program, so the comparison is suggestive only. The article's own caution paragraph says as much, which is honest but leaves the reader nothing to check.

## Section scores

- **3.1 Types as unknowns — 5.** The `scale`/`area`/`half` example carries the whole idea, and the change of compiled code when an unrelated caller appears is stated in one clean sentence.
- **3.2 Solving by iteration — 3.** Fixpoint and widening are taught well, but the one worked table is ambiguous about which pass is the fixpoint, and the join count is declared a measure of work instead of being shown to be one.
- **3.3 Why JavaScript integers need a proof — 4.** The three conditions and the `max + 2` experiment are convincing; I withhold a point only because the rounding rule that makes the JavaScript answer 1 is never stated.
- **3.4 Specialization multiplies the work — 4.** The rounds and the multiplication of analyses are clear and the totals add up to 79; the pass count of 95 is presented as data with no per-round breakdown.
- **3.5 The evidence that inference is the cost — 3.** This is the section the argument rests on, and it is where I had to read most slowly: two attribution percentages that appear to compete, an under-specified fourth row, an unquantified "1.2%", and undefined "hash".
- **3.6 The same wall, hit before — 4.** Four instances are compact and each is cited, though the Cartesian product algorithm is an algorithm rather than a piece of work that "met" the cost, Self appears twice in a list of four, and the pause statistics lack a total.
- **3.7 Key points — 4.** Faithful to the body and genuinely useful; it compresses honestly, if a little flatly ("JavaScript numbers are floating-point" is the only trace of 3.3's argument).
- (3.8 is the quiz, so I have not scored it.)

## Questions that the article did not let me answer

- **Question 4 (seven analyses, 95 passes)** is only half answerable. The seven follow directly from "once before the first round and again after each of the six rounds", but the article never says how many passes each of the seven analyses took. I could only report that 95/7 ≈ 13.6 matches "about fourteen" and that 11,760/95 ≈ 124 matches "about 124 functions per pass". A per-round table (round, helpers added, functions visited, passes) is what is missing.
- **Question 2 (fixpoint pass)** is answerable only if one accepts the reading that the fourth pass is the fixpoint because it is the first pass that changes nothing; the table's right column shows the jump on pass 3 and calls pass 4 "the fixpoint", but the phrase "widen to [0, +∞)" occupying a pass row invites the reading that widening *is* the fixpoint step. One sentence of prose would settle it.
- **Question 3 (where each result comes from)** is answerable for the CJI side from the text, but the JavaScript side requires the floating-point rounding rule, which the article does not give; I supplied it from outside knowledge.
- Questions 1, 5 and 6 were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** a per-round cost table for Agenda — for each of the seven range analyses, the number of functions in the program, the passes needed, and the joins performed, with the totals row that already exists. This converts the article's central arithmetic (7 analyses, 95 passes, 11,760 visits, 11.7 million joins) from four opaque totals into something a reader can check, and it would show directly how a thousand joins arise per function visit. It also makes Question 4 a real exercise instead of a division.

**Cut:** the paragraphs on RPython, Shed Skin and the Cartesian product algorithm in 3.6, compressed into one short paragraph of a sentence each. None of them is used again: they appear in the 3.7 bullet and nowhere else, they add no mechanism that Self has not already introduced, and each one's content is a single number reproduced from another source that this article cannot let the reader verify. Self should stay entire, since Question 6 depends on its two-compiler design.

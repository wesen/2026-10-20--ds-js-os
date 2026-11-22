# Feedback from a student read of Article 3

Read cover to cover in this directory, with `glossary.md` open alongside.

## Passages I had to read twice

1. > "The last row is the important one. Even with the numeric proof replaced, CJI needs 170 seconds, and the typed compiler handles the typed functions of its version of Agenda in 0.5 to 0.7 seconds (Article 1)."

   Two things stopped me. First, the previous paragraph was about the *fourth* row and its exception, so "the last row" arrives while I am still holding "the fourth row"; I had to go back and re-count rows. Second, the comparison is 170 s of CJI against 0.5–0.7 s of the typed compiler on "its version of Agenda" — I cannot tell whether that is the same 16,326-byte program, and if it is not, the ratio says less than it looks.

2. > "| 4 | [0, 3] | [0, +∞): unchanged, so this is the fixpoint |"

   The widening happened on pass 3 but the fixpoint is declared on pass 4, so the "iteration then stabilizes in a few passes" needs one pass that changes nothing just to notice it has stopped. The table never says that, and the without-widening column never terminates, so I could not tell whether plain iteration needs n passes or n + 1.

3. > "CJI therefore treats integer arithmetic as a claim to be proved by the range analysis."

   In the glossary a **Claim** is a manifest entry that a world may open a device or a directory. Here the word is a metaphor for "an unproven assumption". After reading the glossary first, this sentence pointed me at the wrong concept.

4. > "A profile on a workstation attributed 88.0 percent of all executed instructions to the range analysis. On the device, replacing the range analysis altogether (the last row of the next table) cut the time from 1,475 s to 170 s, which is also 88 percent."

   "Also 88 percent" of what? The first number is a share of executed instructions and the second a share of elapsed time, on a different machine, and I had to compute (1475 − 170) / 1475 = 88.5 myself to see that the agreement is real. "A profile on a workstation" also assumes I know what taking a profile is, and the article never says.

5. > "The 168 seconds of frontend time consist of parsing, type inference, specialization and the emission of intermediate code." … "The remaining cost is therefore attributed to solving for types across the program and specializing library code."

   The first sentence lists four components; the second attributes the whole 168 s to two of them. The reason the other two drop out (the 37 ms QuickJS measurement) is one paragraph above, so the logic is sound, but the two sentences stand in the same paragraph and appear to contradict each other on first read.

6. > "Each unknown begins empty and is enlarged only as far as some constraint requires."

   "Empty" is doing technical work here (no possible types yet, i.e. the bottom of the set) while the illustration in the same section mixes *values* into *types*: "the type of `x` includes the integer 3". It took me three passes over that list of constraints to see that the values are the evidence and the types are what gets accumulated.

7. > "in a system that still ran two to three times faster than the Smalltalk implementations of its day"

   Which system — the third-generation two-compiler Self, or Self generally? And "of its day" gives me no baseline. Both loose ends land in the same clause.

8. > "Specialization therefore proceeds in rounds: specialize, infer, discover new call sites, specialize again."

   Here "infer" means the type inference inside the new specialized copy, but section 3.4 has just described "the complete range analysis" as the thing run once per round. I could not tell whether the per-round work is type inference, range analysis, or both, and the sentence names a third thing again ("infer").

## Terms used before they were explained, or never explained

- **profile / "a profile on a workstation"** (3.4, 3.5) — never explained: what is recorded, and how a share of instructions is attributed to one analysis.
- **garbage collection**, **heap** (3.5) — used as known quantities; the glossary defines *arena* and *region* but not these.
- **bytecode** (3.5, "QuickJS compiling the same source to bytecode") — never explained.
- **intermediate form / intermediate code** (intro's definition of "frontend", and 3.5) — named twice, never defined; I do not know what is being emitted or why it is cheap.
- **significand / "exactly representable"** (3.3) — the 53-bit reason is missing, so the rounding of 2⁵³ + 1 has to be taken on trust (needed for quiz question 3).
- **message send** (3.6, Self) — "made every operation, including arithmetic, a message send" assumes Smalltalk-family vocabulary.
- **closures** (3.5, "no closures, no objects") — used in the caution paragraph without explanation and not in the glossary.
- **"specialized helpers"** (3.4) — the count of 79 is given before I am told a helper is a specialized copy of a library routine; I inferred it backwards from "specialized copy".
- **threshold** (3.2) — explained in the same clause, but "the constants that appear in the program together with a fixed list of round values such as powers of two" never says how thresholds are ordered or why they are safer than infinity.

## Claims I could not verify from the article itself

- > "A profile on a workstation attributed 88.0 percent of all executed instructions to the range analysis."

  Missing: how the profile was taken, on what machine, what the total instruction count was, and what the residual 12 percent was. It is corroborated by the drop from 1,475 s to 170 s, but corroboration of the *number* is not evidence of the *method*.

- > "a timing of CJI's internal passes on a workstation attributed 94 percent of pass time to library specialization together with the inference it triggers"

  Missing: the numbers, and any separation of the two causes. "Together with" merges specialization and inference into one figure, and this merged figure is what the article's thesis rests on. It cannot show which of the two dominates.

- > "Nearly twelve million joins to compile a sixteen-kilobyte source file is where the 25 minutes go."

  Missing: any time-per-join figure or a profile of the join operation. 11.7 million joins at, say, 100 ns each would be about 1.2 s, so the arithmetic a reader can do in her head points the other way; the article needs one sentence on what one join costs in CJI to make the connection.

- > "Agenda needs six rounds that add 12, 58, 1, 4, 3 and 1 specialized helpers, 79 in total."

  The sum checks (12 + 58 + 1 + 4 + 3 + 1 = 79), but what counts as *one* helper is never defined, so the individual counts are unverifiable.

- > "QuickJS compiling the same source to bytecode | 37 ms"

  Missing: whether this includes reading the file, how many repetitions, and which machine — the table header says "on the device unless noted" and nothing marks this row as measured elsewhere.

- > "Running the range proof once after the last round instead of after every round, except where an early proof is needed for correctness | Whole compile: 1,475 s → 544 s"

  Consistent with the stated 63 percent ((1475 − 544) / 1475 = 63.1 percent), but there is no per-round breakdown, so I cannot see which six analyses were removed, why the negative-zero exception is cheap, or how many analyses the reduced schedule keeps.

- > "the typed compiler handles the typed functions of its version of Agenda in 0.5 to 0.7 seconds (Article 1)"

  Points outside this article. From here I can verify neither the figure nor whether the compared program is the same source.

- > "195 exceeded a fifth of a second and 21 exceeded one second, while almost two thirds were under a tenth of a second"

  No total number of pauses is given, so "almost two thirds" cannot be checked against the other two counts, and "two to three times faster than the Smalltalk implementations of its day" names no baseline.

- > "PyPy's build documentation gives the time to translate the complete interpreter as about 20 minutes on a fast machine, with several gigabytes of memory."

  No pointer to that documentation in the references, and "fast machine" is undefined — yet the whole comparison with a handheld rests on that word.

- > "CJI uses as thresholds the constants that appear in the program together with a fixed list of round values such as powers of two."

  No measurement of thresholds anywhere: the article never shows Agenda compiled with and without them, so the claimed precision benefit is stated and not shown.

- > "The same build converted negative zero to zero."

  No example of where this is observable, so I cannot see why it is a correctness bug rather than cosmetic — and the article itself says the exception in the fourth row of the next table exists precisely because of negative zero, which made me want the example.

## Section scores

- **3.1 Types as unknowns — 5.** Three tiny functions carry the whole argument, the constraint list is explicit, and the quoted authority is placed where it helps rather than as decoration.
- **3.2 Solving by iteration — 4.** The widening table is the best thing in the article, but the fixpoint row (pass 4 after widening on pass 3) and the unterminated without-widening column are left for the reader to puzzle out, and `n` in the loop is never given a value.
- **3.3 Why JavaScript integers need a proof — 4.** The ±2⁵³ argument and the `max + 2` counterexample are convincing; missing are the rounding rule that produces the 1 and any example of what negative zero corrupts.
- **3.4 Specialization multiplies the work — 4.** The round-by-round counts and the workload table are concrete and the arithmetic checks out, but "infer", "range analysis" and "specialization" are used interchangeably and "helper" is undefined.
- **3.5 The evidence that inference is the cost — 3.** The five measurements rule out competitors cleanly, but the final attribution rests on a figure that merges two causes and on an admitted absence of a profile, so the section's own honesty undercuts its confidence.
- **3.6 The same wall, hit before — 4.** Four well-chosen precedents, each a tight paragraph; the Agesen point ("proportional to the number of distinct type combinations") is asserted rather than illustrated, and Self's pause statistics are more detail than the lesson needs.
- **3.7 Key points — 5.** Six bullets that match the six answers I had to produce; nothing in them is new.
- **3.8 Check your understanding — 4.** Well matched to the sections, and answerable in principle from the text; questions 2, 3 and 4 each need one step the text does not supply (the confirmation pass, the rounding rule, the per-analysis pass counts).

## Questions that the article did not let me answer

- **Question 2, partly.** "On which pass it produces the fixpoint" has two defensible answers from the table: pass 3, when the value stops growing, or pass 4, when a pass changes nothing. The article never says which convention it uses. The question also never says what `n` is, so I cannot state the bound the analysis is losing.
- **Question 3, partly.** I could explain the 1 only by supplying IEEE round-to-nearest-ties-to-even myself; section 3.3 asserts the rounding without giving the rule or the 53-bit significand. "Exact integer arithmetic" is also unspecified (I assumed 64-bit words), which I needed for the 2.
- **Question 4, partly.** The 95 is stated but the per-analysis pass counts are not, so "fourteen passes each" can only be back-derived (95 ÷ 7 = 13.6); the article presents it as though it were measured separately.
- **Question 5, partly.** Answerable, but only with the hedge the article itself supplies; the question asks what the cost "is attributed to" and the article admits no profile of that variant was taken, so the honest answer is an attribution, not a finding.
- **Question 1 and question 6** were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** one traced pass over the three-function program of section 3.1 — the constraint sets for `x`, `k`, `v` and `scale`'s result before and after each pass, ending in the fixpoint. Section 3.2 explains *that* passes repeat but never shows *one pass happening* on a program the reader has already met, and that single table would also make section 3.4's "seven analyses of fourteen passes" easier to picture.

**Cut:** the Self pause statistics ("195 exceeded a fifth of a second and 21 exceeded one second, while almost two thirds were under a tenth of a second … two to three times faster than the Smalltalk implementations of its day"). They cost two re-reads, cannot be checked from the article, and the lesson — a fast tier first, optimization only for hot code — survives without a single one of them.

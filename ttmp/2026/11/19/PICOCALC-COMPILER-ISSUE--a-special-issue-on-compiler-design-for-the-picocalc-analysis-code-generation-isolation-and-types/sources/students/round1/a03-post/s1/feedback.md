# Reader feedback: "3. Why Whole-Program Inference Costs Minutes"

## Passages I had to read twice

1. > "Solving means finding the smallest assignment of types that satisfies every constraint."

   "Smallest" is never defined. Smallest under what ordering? Section 3.2 then says information "grows" and uses the word "join", which in a lattice means the *least upper bound*, so "smallest" here is probably "least" in that lattice order. But the article never states the order, so a reader cannot tell whether "smallest" means fewest distinct types, most specific types, or least memory. The same gap recurs in 3.2 ("once it has all of them nothing more can be added"), where the relation between the labels "integer" and "number" is left implicit.

2. > "In the typed language of Article 1, `i32` arithmetic is defined to wrap around at 32 bits, so `at + 1` is always one add instruction."

   `at` is not defined anywhere; it appears to be a typo for `a + 1` or for a variable from Article 1. I also had to reread the logic: wrap-around is offered as the reason a typed add is one instruction, but the rest of section 3.3 argues that JavaScript cannot use integer add because values may leave ±2⁵³ — two different conditions (wrap-around semantics versus exact representability) that the paragraph runs together without separating them.

3. > "Running the range proof once after the last round, with a safety guard — 1,475 s → 544 s"

   I could not parse this row. Does 1,475 s mean the whole Agenda build in that variant, or the time of the single range proof, or the baseline before the change? The section says elsewhere that the build takes 1,480 s, and 1,475 s here is nearly the same number, so the arrow seems to compare two totals, but it is written as if it compares one component. "Safety guard" is also unexplained.

4. > "Termination requires that information only grows and that it cannot grow forever. For types this holds trivially: a variable can acquire the labels *integer*, *number*, *string* and a few others, and once it has all of them nothing more can be added."

   "A few others" is doing real work here — the reader is asked to accept a finiteness argument without being told the full set. And "nothing more can be added" is only true if the domain really is a finite set of labels; the article never says so.

5. > "the typed compiler handles the typed part of its version of the program in under one second"

   "Its version of the program" is ambiguous: a hand-typed port of Agenda, a subset rewritten by hand, or something generated? Without that, the comparison "170 s versus under one second" is not something I can weigh.

## Terms used before they were explained, or never explained

- **`at`** (3.3, "so `at + 1` is always one add instruction") — undefined, probably a typo.
- **"the typed compiler"** (3.5) — never introduced in this article; the reader has to guess it is the compiler for the typed language of Article 1.
- **"the frontend"** (3.5, "168 s in the frontend") — never defined, and it is surprising that whole-program type inference would be counted as frontend work.
- **QuickJS** (3.5 table) — used as a name with no description; only in 3.6 do we learn it is the handheld's fast first tier and an interpreter-grade compiler.
- **Agenda** — the article's running example program, never described beyond "16,326 bytes of source": no line count, no statement of what the program does or why it was chosen.
- **"standard values"** (3.2, "thresholds taken from the program's literals plus a set of standard values") — never listed.
- **"safety guard"** (3.5 table) — never explained.
- **"the device" / "the handheld"** — relied on throughout, defined only in earlier articles.
- **`n`** (3.2 loop, `while (i < n)`) — never bound or described; the trace quietly assumes `n` is unknown.
- **"turn" and "world"** — the opening says the article assumes their meaning from Article 1, but neither word appears again, so the assumption does no work and only raises a question.
- **"the typed part of its version of the program"** (3.5) — undefined scope.

## Claims I could not verify from the article itself

1. > "A profile on a workstation attributed 88.0 percent of all executed instructions to the range analysis."

   No profile output, no statement of what was counted as "range analysis" versus type inference, and no note on how a workstation profile relates to the on-device measurements that the rest of the table reports.

2. > "Nearly twelve million joins to compile a sixteen-kilobyte source file is the 25 minutes."

   The link between joins and wall-clock time is asserted, not shown. Missing: joins per second, or the fraction of the 1,480 s that the joins account for. Without one of those, "is the 25 minutes" reads as a figure of speech.

3. > "Running the range proof once after the last round... 1,475 s → 544 s — Repeated range analysis was 63% of the time."

   The arithmetic (1,475 − 544 = 931; 931 / 1,475 = 63.1%) only works if both numbers are whole-build totals, which is not what the row says. Evidence missing: a sentence saying what each of the two numbers measures.

4. > "Agenda needs six rounds that add 12, 58, 1, 4, 3 and 1 specialized helpers, 79 in total."

   The sum checks out (12 + 58 + 1 + 4 + 3 + 1 = 79). What is missing is the explanation of the "7 complete range analyses" for 6 rounds — is one analysis run before the first round, or after the last?

5. > "Even with the numeric proof replaced, CJI needs 170 seconds, and the typed compiler handles the typed part of its version of the program in under one second."

   No measurement row supports the "under one second" figure, and no row reports the 170 s with a breakdown (only that 168 s of it is frontend, which leaves 2 s for code generation plus everything else).

6. > "A build with the proof disabled computed `(max + 2) - max` as 2 where JavaScript gives 1, and converted negative zero to zero."

   `max` is not given a value, so I cannot reproduce either number. Missing: the concrete value of `max` (presumably 2⁵³ or 2⁵³ − 1) and the note that at that magnitude the `+ 2` is lost.

7. > "21 pauses exceeded one second and almost two thirds were under a tenth of a second, in a system that still ran two to three times faster than the Smalltalk implementations of its day."

   Cited, but the missing step is how many pauses there were in total — "almost two thirds under a tenth of a second" cannot be evaluated without the denominator.

8. > "Garbage collection — 85.9 s (5.8%); a larger heap saved 1.2%"

   Saved 1.2% of what — total time or the GC time? The unit is missing.

## Section scores

- **3.1 Types as unknowns — 4.** The three-function example and the "text did not change, code changed" point are excellent and do the section's job; it loses a point because "smallest assignment of types" and the ordering behind it are never defined.
- **3.2 Solving by iteration — 4.** Fixpoint, the `i` trace table, widening and join are all introduced clearly with a concrete table, but the finiteness argument for types hand-waves "a few others", and the three range flags (fraction, negative zero, NaN) are listed and then never used in the loop example.
- **3.3 Why JavaScript integers need a proof — 3.** The three conditions are stated well and demotion is a good idea, but the `at` typo, the muddling of wrap-around with exact representability, and the unreproducible `(max + 2) - max` example made this the section I trusted least.
- **3.4 Specialization multiplies the work — 5.** Clear motivation (general `map` versus per-call-site copies), clear mechanism, and a table whose internal arithmetic I could check — 79 helpers sums correctly.
- **3.5 The evidence that inference is the cost — 3.** The structure is right (each row rules out one cost), but three of the five numbers could not be interpreted as written, and the key comparison rests on a typed-compiler figure that is not in any row.
- **3.6 The same wall, hit before — 5.** The best-written section: three short cases with one lesson each, and the Self story leads directly into the "fast tier already exists" conclusion. Its only weakness is the pile of unneeded pause statistics.
- **3.7 Key points — 4.** An accurate summary that matches the sections, though it repeats the numbers that 3.5 left ambiguous.
- **3.8 Check your understanding — 4.** Five of the six questions are answerable straight from the text; question 5 is answerable only if the reader already guesses how to read the 1,475 s → 544 s row.

## Questions that the article did not let me answer

- **Question 5, in full.** I could answer it only by ignoring the ambiguous row and going straight to the "replacing the range proof by local rules" row, and by accepting the article's own attribution. The missing pieces are: what the 1,475 s and 544 s measure, and a measurement row for the typed compiler's "under one second" so the residual cost can be compared with something.
- **Question 2, partly.** The trace and the definition of widening are fully answerable. The question also asks "what it costs", and the article only says "a less precise answer" — it never shows what precision is actually lost, for example what range the widener would pick for `i` with a concrete `n` and threshold set. So I answered the cost in general terms only.
- **Question 6, partly.** Answerable, but only because 3.6 happens to say "which is QuickJS". Section 3.5 uses QuickJS as an unexplained name, so a reader who skimmed 3.6 would not know which component was meant.

## One thing to add and one thing to cut

**Add:** one worked widening example with real numbers — the same three-line loop with `n` unknown, the threshold set shown explicitly (program literals plus the standard values), and the actual sequence of ranges the solver goes through, ending at the widened fixpoint. This would make the "what it costs" half of question 2 answerable and would put a number on the less-precise answer.

**Cut:** the third-generation Self pause statistics ("21 pauses exceeded one second and almost two thirds were under a tenth of a second... two to three times faster than the Smalltalk implementations of its day"). The lesson of that paragraph is the two-compiler split and the fact that CJI has no hot-code restriction mechanism; the pause counts add decoration, are unverifiable from the article, and pull attention off the argument.

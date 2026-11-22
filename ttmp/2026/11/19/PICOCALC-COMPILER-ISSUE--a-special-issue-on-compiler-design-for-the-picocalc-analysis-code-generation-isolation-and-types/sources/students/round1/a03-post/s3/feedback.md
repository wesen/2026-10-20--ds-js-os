# Feedback on "3. Why Whole-Program Inference Costs Minutes"

## Passages I had to read twice

- "For types this holds trivially: a variable can acquire the labels *integer*, *number*, *string*
  and a few others, and once it has all of them nothing more can be added."
  Unclear: I could not see why acquiring *all* labels is the largest element, or whether the labels
  are ordered at all (is `integer` below `number`?). Growing "up" a lattice and "having all labels"
  only coincide if the join is set union, which the article never states.

- "CJI widens to thresholds taken from the program's literals plus a set of standard values."
  "Standard values" is never defined or listed, so the sentence tells me almost nothing concrete.

- "Running the range proof once after the last round, with a safety guard | 1,475 s → 544 s"
  The arrow is not explained: I inferred "before → after", but the row heading also mixes a change
  of schedule (once after the last round) with a change of time, so which change produced which
  number is ambiguous. "Safety guard" is also introduced here and never explained.

- "Replacing the range proof by local rules that need no whole-program facts | 170 s, of which
  168 s in the frontend"
  I read this twice because 168 of 170 seconds being "in the frontend" sounds like parsing, which
  section 3.5 has just ruled out as the cost (QuickJS parses in 37 ms). I still do not know what
  counts as "the frontend" here.

- "Agenda needs six rounds that add 12, 58, 1, 4, 3 and 1 specialized helpers, 79 in total" next to
  a table row "Complete range analyses | 7".
  Six rounds but seven analyses; the seventh is never accounted for.

## Terms used before they were explained, or never explained

- **CJI** — used in the first sentence and never expanded into words.
- **Agenda** — the benchmark program; never described (language? what it does?), only its size
  (16,326 bytes) appears later.
- **turn** and **world** — explicitly deferred to Article 1, so this article is not self-contained.
- **the typed language of Article 1** / **the typed compiler** — relied on for the main comparison
  in 3.3 and 3.5, defined only in another article.
- **constraint** — described informally as "the type of `x` includes whatever `area` passes", never
  as a formal object with a direction or a combination rule.
- **join** — defined in the last paragraph of 3.2 only after the quantity "range joins" is set up
  as the unit of work.
- **widening** — named and motivated, but the actual thresholds are never given (see above).
- **demoted / demotion** — introduced in bold-ish use without saying what the demoted operation
  becomes at run time.
- **optimizing tier / fast first tier** — "tier" is Self/VM jargon, used in 3.6 without definition.
- **frontend** — used in the 3.5 table, never defined.
- **safety guard** — used in the 3.5 table, never defined.
- **NaN**, **negative zero** — used as if familiar; the observable difference between `-0` and `0`
  is never said.
- **Cartesian product algorithm** — named as if it were a tool used here; the article never says
  whether CJI uses it.

## Claims I could not verify from the article itself

- "A build with the proof disabled computed `(max + 2) - max` as 2 where JavaScript gives 1, and
  converted negative zero to zero."
  Missing: the value of `max`. The error only makes sense near ±2⁵³, and without `max` I cannot
  reproduce the calculation or check the wrap-around story. Also missing: how the two builds were
  compared.

- "Nearly twelve million joins to compile a sixteen-kilobyte source file is the 25 minutes."
  This is the article's central causal claim, but the evidence is a count, not a time. Missing: the
  time per join, or a measurement showing that join work rather than being within a few percent of
  1,480 s. Note also that 25 minutes is 1,500 s while the table total is 1,480 s; the two numbers
  are not reconciled.

- "A profile on a workstation attributed 88.0 percent of all executed instructions to the range
  analysis."
  Missing: which input/program was profiled (Agenda?), which profiler, and whether instruction
  counts on a workstation transfer to the handheld.

- "the typed compiler handles the typed part of its version of the program in under one second."
  Missing: any measurement apparatus, the size of that program, and what "typed part" excludes.
  This number does much of the work in section 3.5 and has no support in the text.

- "Agenda needs six rounds that add 12, 58, 1, 4, 3 and 1 specialized helpers, 79 in total."
  The sum checks out (12 + 58 + 1 + 4 + 3 + 1 = 79), but nothing in the article shows how a round
  is counted or what a "helper" is (one specialized copy? a transitive closure of copies?), so the
  numbers cannot be checked.

- "The two activities multiply." / "Specialization therefore proceeds in rounds: specialize,
  infer, discover new call sites, specialize again."
  The mechanism is plausible and the round sizes are offered as evidence, but the article never
  shows that the 58 helpers of round two came from the 12 of round one rather than from ordinary
  first-round discovery.

- "in a system that still ran two to three times faster than the Smalltalk implementations of its
  day" and "21 pauses exceeded one second and almost two thirds were under a tenth of a second".
  These come from Hölzle & Ungar 1994 and cannot be checked here; the article also does not say
  which benchmark or machine they refer to, so I cannot judge whether they are relevant to a
  handheld.

## Section scores

- **3.1 Types as unknowns — 5.** The `scale` / `area` / `half` example is the clearest thing in the
  article and makes the "code changes when an unrelated caller appears" point undeniable.
- **3.2 Solving by iteration — 3.** Fixpoint, widening and join are all introduced here and all are
  needed, but the lattice ordering and the actual widening thresholds stay vague, so the three-line
  loop is traced but never actually finished.
- **3.3 Why JavaScript integers need a proof — 5.** Three explicit conditions, plus a concrete
  wrong-answer example; this is the section I trusted most, apart from the undefined `max`.
- **3.4 Specialization multiplies the work — 4.** The rounds mechanism is clear and the arithmetic
  is checkable, but the seventh range analysis and the definition of "helper" are left open.
- **3.5 The evidence that inference is the cost — 4.** The line of argument (rule out emission,
  GC, parsing; then remove the proof) is well built, though two numbers carry weight without any
  apparatus behind them.
- **3.6 The same wall, hit before — 3.** Four prior systems in one section is a lot; Self gets the
  detail and RPython/Shed Skin/Agesen get one paragraph each, so only Self is really taught. The
  drill-down numbers about Self's pauses distract from the one sentence the argument needs.
- **3.7 Key points — 5.** Accurate, and consistent with the body; useful for revision.
- **3.8 Check your understanding — 4.** Questions map onto the sections evenly, but question 2 asks
  for something (the widened bound for `i`) that the text does not supply.

## Questions that the article did not let me answer

- **Question 2, second half.** The article says widening jumps a bound "to the next constant that
  appears in the program or to infinity", but never says which it picks for `i` in this loop. The
  loop's only literals are `0` and `1`, and `n` is unconstrained, so I could not name the widened
  bound or the final stabilized range. I could only describe widening in general. Missing: one
  completed trace with the chosen threshold and the precision lost.
- **Question 5, partly.** I could identify the row (170 s with local rules), but the phrase "of
  which 168 s in the frontend" made the attribution ambiguous, since parsing was just ruled out as
  a cost. Missing: a definition of "frontend" in this table.
- The other four questions were answerable from the text.

## One thing to add and one thing to cut

- **Add:** a completed widening trace for the `while (i < n)` loop — the threshold actually chosen,
  the visit on which the range stabilizes, the final range, and what that costs in precision (for
  example, a bound that no longer proves `i` stays below 2⁵³). This would turn section 3.2 from an
  illustration into a worked example and would repair question 2.
- **Cut:** the Self performance statistics in section 3.6 — the 50-minute session, the 21 pauses
  over one second, and the comparison with Smalltalk. They are unverifiable from the article and
  the argument only needs the two-compiler design and the lesson drawn from it.

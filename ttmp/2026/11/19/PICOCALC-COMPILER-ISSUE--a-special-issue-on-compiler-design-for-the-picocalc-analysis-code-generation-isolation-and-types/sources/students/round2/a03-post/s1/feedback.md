# Reader feedback on "3. Why Whole-Program Inference Costs Minutes"

I read the article as a reader of this article alone, checking the issue glossary for terms. I
have no access to Article 1, so anything that depends on it is a gap for me.

## Passages I had to read twice

1. "the result must stay within the range where every integer is exactly representable, which
   is ±2⁵³". Later, in 3.3, `max` is "2⁵³ − 1, the largest integer that JavaScript's numbers
   represent exactly". These two statements disagree: 2⁵³ itself is exactly representable (as
   is every even integer above it), and the usual name for the bound is ±(2⁵³ − 1). I had to
   stop and decide which sentence to trust before I could follow the `max` example.

2. "Each pass enlarges the range by one, so plain iteration would need as many passes as the
   loop has iterations." "The loop has iterations" is not a property of a program text — `n`
   is never given a value — so I had to reinterpret this as "as many passes as the loop might
   run times", which is what makes the count unbounded.

3. "the upper bound has moved twice: widen to [0, +∞)". The "moved twice" rule is the whole
   trigger for widening here, but it appears only in a table cell. I could not tell from the
   prose whether the trigger is "moved at all", "moved twice", or "moved after a threshold
   was tried", and the prose about thresholds in the next sentences does not settle which rule
   CJI uses for the first jump.

4. "the amount of analysis is proportional to the number of distinct type combinations in the
   whole program, a quantity no single function's text reveals." I understood the shape of
   the claim but not its force — proportional in what unit, and is it a bound or an observed
   behaviour?

5. "one complete range analysis before the first round and again after each of the six
   rounds, seven times in all" followed by "seven analyses, averaging about fourteen passes
   each, visiting about 124 functions per pass", while the table says 95 passes in total.
   7 × 14 = 98, not 95. I had to work out that "about fourteen" is a rounded 13.57 and that
   the true per-analysis counts are 13 or 14.

6. "Repeated range analysis was 63% of the time" for 1,475 s → 544 s. The number is right
   ((1475−544)/1475 = 63.1%) but the wording "repeated range analysis was 63%" hides that
   the change also removed the *first* analysis in some cases and that the saved time is not
   the same as the total cost of the analyses (170 s of compile remained different). I read
   this row three times before accepting it.

## Terms used before they were explained, or never explained

- **bytecode** — "QuickJS compiling the same source to bytecode" (3.5). Not in the glossary,
  never defined; I inferred "some intermediate form" from the frontend definition.
- **garbage collection / heap** — the rows "Garbage collection 85.9 s" and "a larger heap
  saved 1.2%". Neither term is defined in the article or the glossary, and the article
  assumes the reader knows what a larger heap is and why it would help.
- **`countUnit` example, and `at + 1`** — cited in 3.3 as though I had it. It belongs to
  Article 1; here it is a dangling reference with no description of what the function does.
- **message send** — in the Self paragraph, "made every operation, including arithmetic, a
  message send" and later "sends could be bound at compile time". Sends are never explained,
  and a reader without an object-oriented background will not know what is being bound.
- **Smalltalk** — "two to three times faster than the Smalltalk implementations of its day".
  Named as a comparison with no explanation of what Smalltalk is or why the comparison is
  flattering.
- **loop head** — "Range known for `i` at the loop head". Common compiler shorthand, but not
  defined here or in the glossary; a beginner may read it as the loop body.
- **executed instructions** — "88.0 percent of all executed instructions". It is not said
  whether this is dynamic instruction count from a profiler or a sampling estimate, which
  matters when the article uses it as a measurement.
- **frontend** is defined, but **backend** is never used or defined, so "the rest of the
  frontend" has no named counterpart to contrast with.

## Claims I could not verify from the article itself

1. "A profile on a workstation attributed 88.0 percent of all executed instructions to the
   range analysis." No profile method, tool, input size or instruction total is given, and
   "workstation" is never specified, so this number cannot be checked or reproduced from the
   text.

2. "On the device, replacing the range analysis altogether (the last row of the next table)
   cut the time from 1,475 s to 170 s, which is also 88 percent." The arithmetic checks out
   ((1475−170)/1475 = 88.5%), but the two 88s are different quantities — a share of
   instructions and a share of wall-clock time. The article says they "agree" without
   explaining why they should, which is the one step a sceptical reader most needs.

3. "In the original build, a timing of CJI's internal passes on a workstation attributed 94
   percent of pass time to library specialization together with the inference it triggers."
   Specialization and the inference it triggers are merged into one bucket, so the sentence
   cannot support the article's own separation of "inference and specialization" from each
   other, and no pass inventory is given.

4. "Agenda needs six rounds that add 12, 58, 1, 4, 3 and 1 specialized helpers, 79 in total."
   I checked the sum (12+58+1+4+3+1 = 79, correct), but the article never says how a "round"
   is detected to have finished or why the second round adds 58 while later rounds add 1.

5. "the last row of the next table … The remaining cost is therefore attributed to solving
   for types across the program and specializing library code." The article itself concedes
   no pass-by-pass profile was taken. The step from "168 s is in the frontend" to "it is
   inference and specialization" is an argument, not a measurement, and the article does not
   give the size of the emission of intermediate code, which is the one remaining component
   it never quantifies.

6. "a build with the proof disabled used exact integer arithmetic and computed 2. The same
   build converted negative zero to zero." No evidence is given for the negative-zero part:
   no example, no observed versus expected output, no test name. I have to take it on trust.

7. "195 [pauses] exceeded a fifth of a second and 21 exceeded one second, while almost two
   thirds were under a tenth of a second". Internally consistent as a distribution, but the
   article does not say how pauses were counted in that 50-minute session, so I cannot judge
   whether the figures support "responsiveness".

8. "The typed compiler handles the typed functions of its version of Agenda in 0.5 to 0.7
   seconds (Article 1)." The comparison depends on a figure I cannot see, on a different
   program ("its version of Agenda"), so the final paragraph's contrast rests on an
   out-of-article number. The article deserves credit for immediately admitting this
   ("The typed compiler also does less …").

## Section scores

- **3.1 Types as unknowns — 5.** The three-function example is the clearest passage in the
  article; the point that editing a caller changes a callee's code lands without effort.
- **3.2 Solving by iteration — 4.** The idea of passes, fixpoint and widening is well
  explained, but the widening trigger ("moved twice") and the phrase "as many passes as the
  loop has iterations" need the reader to fill gaps.
- **3.3 Why JavaScript integers need a proof — 3.** The most important section for
  correctness, and the one where the ±2⁵³ / 2⁵³ − 1 contradiction and the dangling
  `countUnit` reference cost the most.
- **3.4 Specialization multiplies the work — 4.** The rounds-then-infer loop is clear and the
  numbers in the table add up, but "seven analyses, averaging about fourteen passes each" does
  not reconcile with 95 without the reader doing division.
- **3.5 The evidence that inference is the cost — 4.** Honest and well tabulated, with the
  concession about not having a profile; the weakness is that the two "88 percent" figures are
  different quantities presented as agreeing.
- **3.6 The same wall, hit before — 4.** Four well-chosen precedents with a clear lesson, but
  dense with names, dates and undefined vocabulary (message send, Smalltalk) that slows a
  reader without an OO background.
- **3.7 Key points — 5.** Accurate summary of the sections; I could use it as a checklist.
- **3.8 Check your understanding — 4.** Questions are well mapped to sections and mostly
  answerable, but question 4 asks for arithmetic that the text only gives in rounded form.

## Questions that the article did not let me answer

- **Question 4** — I could derive 7 (1 + 6 rounds), but not 95. The article gives only the
  average ("about fourteen passes each") and the total, and 7 × 14 = 98 ≠ 95. To answer
  exactly I would need the per-analysis pass counts, or the sentence rewritten to say
  "between thirteen and fourteen passes each".
- **Question 2** — answerable, but only by copying the table. The text does not say why the
  upper bound must "move twice" before widening; so I could state *that* it happens on pass 3
  but not *why* the rule picks pass 3.
- **Question 6** — answerable in substance, but "what CJI lacks compared with Self's design"
  is stated in one clause of 3.6; a reader who skimmed the Self paragraph would have nothing
  to fall back on, since 3.7 does cover it (one line).
- All others (1, 3, 5) were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** one worked pass of the loop example in 3.2 written out as the solver would actually
do it — "pass 1: `i` gets 0 from the initialiser; pass 2: the back edge adds `i + 1` = 1;
pass 3: …" — and the same in miniature for the three-function example of 3.1, listing the
constraints one by one. The article says the compiler "records the unknowns as constraints"
and then never shows the constraint list being solved, which is the single step I most wanted
to see performed.

**Cut:** the "without widening" column's ellipsis row of the 3.2 table, or the "moved twice"
cell, whichever is shorter to replace. Better: cut the "as many passes as the loop has
iterations" justification and replace it with one sentence saying the count is unbounded
because `n` is unknown. As it stands the table teaches the reader that widening is about
iteration counts, when the real reason is that the bound is a function of a run-time value.

*Second candidate to cut, if one cut is enough:* the fourth row of the 3.5 table (the
1,475 s → 544 s experiment) duplicates the fifth row's conclusion with a weaker design, and
its exception paragraph costs a paragraph for a corner case no reader of this article needs.

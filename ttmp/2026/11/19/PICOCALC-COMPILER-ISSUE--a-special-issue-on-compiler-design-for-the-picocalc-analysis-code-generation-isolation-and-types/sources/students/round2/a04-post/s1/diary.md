# Investigation entry

## Step 1: Reading the article and looking terms up in the glossary

I read `article.md` from start to finish without stopping, then reread it with
`glossary.md` open beside it, checking every bold term in the article against the
glossary entry. The goal was to build the map the article promises — five
analysis techniques, the waste each removes, and whether it changes the answer —
before attempting the quiz.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md`: read the
article and glossary, answer the quiz into `answers.md`, write `feedback.md` with
the prescribed sections, and write this diary.
**Inferred user intent:** The editor wants an honest pre-publication teaching test:
where the article fails to teach, phrased as a reader's experience rather than as
an expert review.
**Commit (code):** N/A — no repository changes, only new files in this directory.

### What I did
- Read `TASK.md`, then `diary-format.md`, to fix the required outputs and format.
- Read `article.md` in one pass, then a second pass cross-checking terms against
  `glossary.md`.
- Noted, during the second pass, each term that was bolded and defined in the
  article, each term that was bolded and only explained in the glossary, and each
  term used as if known with no explanation anywhere.

### Why
- The glossary is large and covers Articles 1–9, so most of Article 4's
  vocabulary was expected to be present; checking it meant the list of
  "unexplained terms" in the feedback is short and defensible rather than a
  list of everything technical.
- Reading once for flow and once for terms was deliberate: a first reading
  records where I stumbled, a second reading checks whether the stumble was my
  fault or the text's.

### What worked
- The waste table in section 4.1 is a genuine aid to reading: after it, the five
  repair subsections could be skimmed with the table in mind instead of being
  read cold.
- Section 4.2 needed almost no rereading. Its pattern (define the term, say what
  follows, tabulate four historical instances, then state the costs as a list)
  is the article at its clearest.
- The π example in the sparse-propagation subsection is the only place where an
  abstract technique is shown as code with comments; it made a sentence that had
  defeated me on the first pass ("plain SSA uses the same name for `i` on both
  sides of the test") suddenly obvious.

### What didn't work
- The five remedy subsections after the table (sparse, dependency order, demand,
  incremental) are one dense paragraph each, built out of citation-backed claims
  and no worked example. I read the sparse paragraph three times and still could
  not have written the algorithm; I could only repeat its conclusion.
- The demand row of the table has no measurement in its evidence cell — "A proof
  is needed only for operations compiled as integer arithmetic pending that
  proof" — while the other four rows have percentages or counts. That
  inconsistency cost me a reread.
- I looked up *narrowing* in the glossary and found only *widening*. The article
  defines narrowing inside a single long sentence, so the glossary lookup failed
  and I had to fall back on the article's parenthetical alone.
- "The general code" in the jump-function subsection is undefined; I had to
  connect it to the glossary's *Demotion* entry by inference, not by anything the
  article says.

### What I learned
- Article 4 assumes Article 3 has been read: the 25-minute figure, the 170-second
  figure, the negative-zero error, and the notion of a *pass* are all referred to
  rather than restated. As a reader of Article 4 alone I was reconstructing
  premises from one-clause reminders.
- The article's own honesty (the "What these remedies cannot do" subsection) is
  what makes the rest credible, but it also means a reader who only wants the
  design rule of section 4.3 has to carry a lot of negative results to get there.

### What was tricky to build
- Distinguishing "term explained late" from "term never explained". Several terms
  (*local type inference*, *bidirectional typing*, *narrowing*, *declared
  boundary*) are defined inline at first use, sometimes one clause later than the
  use. I recorded only terms with no explanation anywhere, per the task, and put
  the merely-late ones in the "read twice" list instead. The ordering/lifetime
  boundary here is the moment the term is first used versus the moment it is
  first defined, and the two are not the same for `narrowing` and for
  `topological order`.

### What warrants a second pair of eyes
- My judgement that the "170 seconds" paragraph should be cut is arguable: an
  editor may consider the concession essential to prevent overclaiming. I marked
  the alternative cut (the incremental row) in the feedback for that reason.
- The unit inconsistency (MB versus MiB in one sentence about the heap) may be a
  deliberate informal usage rather than an error; I reported it as something a
  reader cannot resolve, not as a mistake.

### What should be done in the future
- Add a worked example persisting across all five remedies; this is stated as the
  "one thing to add" in `feedback.md`.
- Consider a back-reference convention: when a figure is inherited from Article 3,
  say so in the sentence next to it rather than only in the opening paragraph.

### Code review instructions
- Nothing to run. Read `article.md` §4.1 (jump functions, sparse propagation) and
  §4.2 side by side to see the contrast in teaching density that drives most of
  the feedback.
- Validation command: none applicable; the deliverables are prose files in this
  directory.

### Technical details
- Article under review: Article 4, "Making Inference Affordable, or Avoiding It".
- Quiz: six questions in §4.5; answerability assessed against the article alone.
- Files written: `answers.md`, `feedback.md`, `diary.md`.

## Step 2: Answering the quiz

I answered all six questions in `answers.md`, numbered as asked, with two to six
sentences each and a `Confidence: N` line. Question 1 asked for a calculation, so
I showed the interval arithmetic step by step.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `answers.md` with per-question confidence.
**Inferred user intent:** Test whether the article actually equips a reader to
answer, and to record where confidence is low because the text is thin.
**Commit (code):** N/A.

### What I did
- Wrote six numbered answers in my own words, each ending with `Confidence: N`.
- For question 1, recorded `J₁ = i + 1`, then 5 + 1 = 6 and 7 + 1 = 8, giving [6, 8].
- For question 4, recorded 11,760 − 9,019 = 2,741 and explained why the skipped
  visits cannot be saved by a summary.
- For question 6, named `/*: Any[] */` annotations as the existing feature and
  said they would have to become mandatory.

### Why
- Confidence was set from the text, not from my prior knowledge of compilers. I
  gave 5 where the article says the thing outright and 4 where I had to supply one
  inferential step (question 6, where the article never states in one place that
  annotations are currently optional).

### What worked
- Questions 1, 2 and 4 are answerable by reading: the article works the analogous
  jump-function example, argues the formula-versus-result point explicitly, and
  states the 2,741 figure outright.
- The "does the answer change?" column made question 2 straightforward — the
  table's own "No, if the summary is exact" is the answer in miniature.

### What didn't work
- Question 1's underlying rule (adding a constant shifts both range endpoints)
  is never stated; it is only shown once. I answered it by pattern from the
  article's own `[0, 9] → [1, 10]`. Had the article's example been different I
  would have been guessing at the endpoint order.
- Question 6 required knowing annotations are optional today, which the article
  implies ("already accepts") but never says.

### What I learned
- Answerability is not the same as teachability. The article is answerable
  throughout, yet three of my six answers rest on a single example or a single
  table cell. That distinction is why the feedback scores sections lower than the
  quiz section.

### What was tricky to build
- Keeping answers to my own words while staying accurate to interval semantics.
  The temptation in question 3 was to describe lattice joins in vocabulary the
  article does not use; I kept to "the join of the two paths" and named the π
  names `i2` and `i3` exactly as the code sample does.

### What warrants a second pair of eyes
- Question 5's answer lists three consequences rather than the two asked for, on
  the grounds that the article presents the third (an edit cannot change another
  function's code) as equally practical. An editor may want the second consequence
  merged out.

### What should be done in the future
- State the interval rule for shifting a range by a constant somewhere in §4.1, so
  question 1 does not depend on a single unstated example.

### Code review instructions
- Check `answers.md` question 1 against the `nextIndex`/`clamp` example in
  `article.md` §4.1 to confirm the jump-function indices and the [6, 8] result.

### Technical details
- `J₁ = i + 1`; with input [5, 7] the argument of `clamp` is [6, 8].
- Visits: 11,760 total, 9,019 skipped, 2,741 bodies analyzed.
- Existing CJI feature: type annotations in comments, `/*: Any[] */`.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six sections the task prescribes, quoting passages
verbatim and keeping each criticism attached to a specific spot in the text.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Six named sections, each populated honestly, with
quotes and reasons rather than general impressions.
**Inferred user intent:** A defect list the editor can act on line by line before
publication.
**Commit (code):** N/A.

### What I did
- Collected five passages I had read twice, with quotes and reasons.
- Listed twelve terms that were unexplained or explained only after use, after
  checking each against `glossary.md`.
- Listed ten claims I could not verify, stating for each what evidence or step is
  missing.
- Scored each numbered section 1–5 with a one-sentence reason, splitting §4.1 into
  its table part and its technique subsections because they differ sharply in
  clarity.
- Answered the quiz-answerability section: none unanswerable, with three marginal
  notes.
- Named one addition and one cut, and offered an alternative cut.

### Why
- I kept the "unexplained terms" list short by checking the glossary for each
  candidate; a list including terms the glossary defines would be unfair to the
  article and useless to the editor.
- Section scores are split within §4.1 rather than averaged, because averaging a 4
  and a 3 would hide exactly the finding the editor needs: the map is clear but the
  repair subsections are not.

### What worked
- The verbatim-quote requirement forced me to locate each complaint at a specific
  sentence, which eliminated about half the vague impressions I started with.
- The "claims I could not verify" section was the easiest to fill and the most
  substantive: nine of the ten are citation-backed numbers reported without the
  machine, the benchmark, or the baseline needed to check them.

### What didn't work
- Scoring "each numbered section" is ambiguous when section 4.1 contains five
  subsections of differing quality. I chose to score the container and add two
  sub-scores; an editor expecting exactly five scores will find seven lines.
- I could not separate "the article omits context" from "the article assumes
  Article 3", so several unverifiable claims (the 25 minutes, the 170 seconds) are
  really Article 3's figures reported here without their machine. I noted this
  rather than penalising it twice.

### What I learned
- The weakest pattern in the article is not missing explanation but missing
  *machines and baselines*: "up to 450 times faster on one program", "under ten
  seconds", "well over ten times faster", "29 percent of compile time" are all
  speed claims without a device, and the article is otherwise careful to name the
  device.
- The article's strongest pattern is section 4.2's cost list — three costs stated
  as bullets with no hedging. That is the model the other sections should follow.

### What was tricky to build
- Judging "used before explained" fairly. `narrowing` is defined inline in the
  same sentence that uses it, so it is arguably not used-before-explained; but it
  is bolded nowhere and absent from the glossary, so a reader looking it up finds
  nothing. I included it with that qualification. The ordering boundary — bolded
  and defined versus unbolded and defined-in-passing — is the line I drew.

### What warrants a second pair of eyes
- The recommendation to cut either the 170-second paragraph or the incremental
  row. Both are defensible pieces of the article; my argument is only that the
  article has one redundancy and one under-supported technique, and that is the
  pair to choose between.
- The section score of 3 for §4.1's technique subsections is the harshest score I
  gave; a compiler-literate editor may find those paragraphs adequate and my
  difficulty merely a matter of background.

### What should be done in the future
- Add the carried-through worked example (the "add").
- Decide between the two candidate cuts (the "cut").
- For every speed figure, state the machine and the baseline in the sentence.

### Code review instructions
- Start with `feedback.md` "Claims I could not verify" and check each quoted
  figure against the corresponding reference in `article.md`'s reference list to
  see whether the missing detail is genuinely absent from the article.
- Cross-check the "unexplained terms" list against `glossary.md` to confirm none of
  them has an entry.

### Technical details
- Sections scored: 4.1 (4, plus 3 for its technique subsections), 4.2 (5, plus 4
  for the one-pass-compiler subsection), 4.3 (3), 4.4 (5), 4.5 (4).
- Delivery line required by `TASK.md`: the single word `DONE`.

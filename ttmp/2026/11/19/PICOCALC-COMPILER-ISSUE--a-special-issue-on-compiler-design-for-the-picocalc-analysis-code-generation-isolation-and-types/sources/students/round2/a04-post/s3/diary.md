# Investigation entry

## Step 1: Read the article end to end with the glossary open

I read `article.md` once straight through for sense, then a second time with `glossary.md` beside it,
looking up each technical term as a reader would rather than as a compiler person. The article is
part 4 of a series and repeatedly defers to Article 3 ("recall from Article 3", "the facts established
in Article 3"), which is not in this directory, so I checked whether the glossary carried the deferred
material. It does: *widening*, *join*, *range*, *fixpoint*, *demotion* and *demand-driven analysis* all
have entries, so deferral cost me nothing and I did not count those as missing terms.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read `article.md` fully, then produce `answers.md`, `feedback.md` and
`diary.md` in this directory, following `TASK.md` and `diary-format.md`.
**Inferred user intent:** An editor wants an honest pre-publication read that separates "this passage
is unclear" from "this claim is unsupported" from "this section works", so the article can be fixed
before it teaches the wrong thing.
**Commit (code):** N/A — no code changes; this session only writes three Markdown files.

### What I did
- Read `TASK.md` and `diary-format.md` first, to know the required outputs and their shape.
- Read `article.md` (sections 4.1 through 4.5 plus references) twice: once for structure, once term by term.
- Read `glossary.md` in full and cross-checked every technical term the article uses against it.
- Noted, in a scratch list, three categories as I went: passages I re-read, terms without a home, claims
  that needed evidence the article did not give.

### Why
- Reading twice (once fast, once slow) is what a reader actually does, and the second pass is where the
  unclear passages surface; a single pass would have hidden them behind momentum.
- Checking each term against the glossary, rather than against my own knowledge, keeps the feedback
  honest about what the *article plus glossary* fails to teach. Several terms I understand from
  elsewhere (topological order, dominance) are unexplained in both, and those are what I reported.

### What worked
- The section 4.1 table (waste / evidence / remedy / does the answer change) is a strong device: it made
  the five remedies distinguishable on first reading, and it is what I checked the rest of the section
  against.
- The `nextIndex` / `clamp` example is worked concretely enough that question 1's calculation is forced
  by the text rather than guessed.
- The glossary entries for *summary*, *jump function*, *SSA form* and *local checking* matched the
  article's usage exactly; no contradictions between the two documents.

### What didn't work
- The arithmetic in the summaries subsection does not audit cleanly. 11,760 − 9,019 = 2,741 (this checks
  out), but then "avoided 62 percent of those 2,741 and cut 29 percent of compile time" cannot be
  reconciled: 62% of 23% of visits is ~14.5% of the visits' work, so a 29% time cut needs the skipped
  visits to be almost free, which the article never says. I recorded this as an unverifiable claim
  rather than guessing at a missing figure.
- The narrowing sentence in the dependency-order subsection resisted parsing on two reads. "Widening
  first … and then narrowing, a second phase" never fixes the unit of the phases, and no example of a
  widen-then-narrow round is given anywhere, so I had to reconstruct it from memory of how interval
  analyses behave. That reconstruction is mine, not the article's, and I said so in the feedback.

### What I learned
- A well-built table can carry an otherwise dense section; section 4.1 is legible mainly because of it.
- The article's weakest points are not its hardest ideas (SSA, π functions are explained well) but its
  *cost* claims, where a precise memory number sits next to an unattributed time number.
- Deference to an earlier article in a series is safe here only because the glossary is complete; had the
  glossary not carried *widening* and *join*, section 4.1 would have been unreadable.

### What was tricky to build
- Deciding the boundary of "never explained". Many terms (QuickJS, RV32, `i32`, manifest) are article-1
  background that any reader of the issue will have; flagging them would bury the real gaps. I set the
  rule that a term is a problem only if neither the article's own prose nor the glossary defines it, and
  applied it mechanically.
- Judging the section scores without letting the worked example in 4.1 (which is excellent) pull the
  whole section's score up, when the section's numbers around it are the least checkable part.

### What warrants a second pair of eyes
- Whether the 62%/29% cache figures are simply missing a sentence about how compile time divides between
  skipped visits and analysed bodies — if that sentence exists in Article 3, the fix is a cross-reference,
  not a rewrite.
- Whether the "polynomial time, no widening" result (Su & Wagner 2005) is meant to apply to CJI's ranges,
  which carry fraction, negative-zero and NaN flags; the article does not say.

### What should be done in the future
- Add a worked widening/narrowing example (see the "one thing to add" in `feedback.md`).
- Replace the "rules over relations" sentence with a plain description of what an incremental analysis
  keeps and discards.

### Code review instructions
- Files touched this session: `answers.md`, `feedback.md`, `diary.md`. No source files, no commands run.
- To validate: check that `answers.md` has six numbered answers, each 2–6 sentences with a
  `Confidence: N` line; that `feedback.md` contains all six required headings; and that each quotation in
  the feedback can be found verbatim in `article.md`.

### Technical details
- Article sections scored: 4.1 (4), 4.2 (5), 4.3 (3), 4.4 (4), 4.5 (4).
- Key figures the article supplies: 25 min compile for a 16 kB Agenda app; 11,760 visits; 9,019 skipped;
  2,741 body analyses; 78.3% of 11.7 million joins with identical inputs; 39.6% of writes redundant;
  95 whole-program passes; 4.5 MB → 7.3 MB peak in an 8 MiB heap; 170 s with range analysis removed.

---

## Step 2: Answer the quiz questions

I answered section 4.5 in the order given, showing the arithmetic for question 1 and the subtraction for
question 4 rather than stating results. Question 2 I answered by separating "formula" from "result",
which is the distinction the article itself draws; question 3 I answered by constructing the fact that
plain SSA would lose, because the article shows the π renaming but never shows the loss.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `answers.md`, numbered like the questions, each answer in my own
words, 2–6 sentences, with a `Confidence: N` line after each.
**Inferred user intent:** The quiz is the editor's test of whether the article teaches; my answers are
the evidence, and the confidence numbers are the signal about which questions the text only half-supports.

### What I did
- Wrote six answers to `answers.md`, numbering 1–6 to match the six questions in 4.5 (the section is
  called "Check your understanding"; the task and article both have six, not five).
- For question 1: `J₁ = i + 1`; with `i ∈ [5, 7]`, evaluate by adding 1 to both ends, giving `[6, 8]`.
- For question 4: 11,760 − 9,019 = 2,741, then the argument for why that is the pool of *analysis* work.
- Appended a short note flagging which answers rest on a single example, with its own confidence line.

### Why
- Showing working matters for questions 1 and 4 because both have a specific wrong answer in reach (a
  jump function written as a result rather than an expression; 11,760 used as the savings pool).
- I kept answers to the article's own vocabulary (formula/result, π renaming, proportional-to-function-size)
  instead of importing outside terminology, so the answers double as a test of whether the article's words
  are sufficient.

### What worked
- Questions 1, 2, 4, 5 and 6 were answerable directly from the text; confidence 5.
- Question 3 was answerable but required one inference the article leaves implicit (that joining the
  branch facts would widen the interval back), so I marked it confidence 4.

### What didn't work
- Question 4's second half ("why is that the number that matters for judging what summaries could save")
  is answerable only in the weaker form "the other 9,019 visits did no analysis"; the article gives no
  time split, so I could not answer it in the stronger form about savings. I said this in the note rather
  than inventing a figure.
- The count is easy to get wrong: the article's introduction talks about "five analysis techniques" and
  section 4.1 about "five kinds of waste", while the quiz itself has six questions. I recounted against
  section 4.5 before numbering, and the numbering matches the article's, not the "five" elsewhere.

### What I learned
- Writing the answers is a sharper test than reading: question 3 exposed that the article never demonstrates
  the precision loss that π renaming repairs, which I had not noticed on the reading pass.
- The article's example (`nextIndex`) is unusually well chosen for a quiz — it is small enough to compute
  and rich enough to test the formula/result distinction.

### What was tricky to build
- Keeping each answer within 2–6 sentences while still showing working: answer 3 wanted to become a
  paragraph about interval joins, and the sentence limit forced it back to the article's own mechanism.
- Assigning confidence honestly. A 5 for question 6 is not a claim that the article's speculation is
  right, only that the article states it plainly enough to be restated — which is what I judged.

### What warrants a second pair of eyes
- Answer 3's reconstruction of the lost fact. It is correct as far as I can tell, but it is my reasoning,
  not the article's, and a second reader should confirm that the article does not elsewhere state the loss
  in a way I contradicted.
- Whether the editor wants the closing note in `answers.md` at all, or prefers answers only. I included it
  because it is the honest part of the quiz.

### What should be done in the future
- If the quiz is kept, question 4 should either drop the "savings" clause or the article should supply the
  time split between skipped visits and analysed bodies.

### Code review instructions
- File: `answers.md`. Check six answers, sentence counts, and that every `Confidence:` value is 1–5.

### Technical details
- Confidences assigned: Q1 5, Q2 5, Q3 4, Q4 5, Q5 5, Q6 5; closing note 3.
- Arithmetic shown: 5 + 1 = 6, 7 + 1 = 8 for Q1; 11,760 − 9,019 = 2,741 for Q4.

---

## Step 3: Write the feedback, including the parts that are unflattering to the article

I wrote `feedback.md` with the six required headings. The hard part was keeping the three complaint
categories apart: a passage being unclear, a term being undefined, and a claim being unsupported are
different failures and need different fixes, and it is easy to file all three under "confusing".

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with the six named sections, quoting passages verbatim
where asked, scoring each numbered section, and naming one addition and one cut.
**Inferred user intent:** Actionable pre-publication review: the editor needs to know exactly which
sentences to rewrite, not a general impression.

### What I did
- Wrote `feedback.md` with: Passages I had to read twice (6 quotations), Terms used before explained or
  never explained (8 items, plus an explicit note that glossary-covered terms are not counted),
  Claims I could not verify (9 quotations), Section scores (4.1–4.5), Questions the article did not let me
  answer, and one thing to add / one thing to cut.
- Checked each quotation against `article.md` by re-reading the surrounding paragraph, and adjusted the
  quotations to be one or two sentences as the task requires.
- Scored sections 4.1 = 4, 4.2 = 5, 4.3 = 3, 4.4 = 4, 4.5 = 4, each with one sentence of reason.

### Why
- I separated "terms" from "claims" strictly: a term problem is fixed by a definition, a claim problem is
  fixed by a number, a benchmark name or a citation, and mixing them would have produced a list the editor
  could not act on.
- The suggested addition (a worked widening/narrowing example) was chosen because it is the one place where
  the article *asserts* a precision benefit and *explains* nothing, which is the pattern most likely to
  mislead a reader into thinking they understood.
- The suggested cut targets the "rules over relations" sentence because it is the only place in the article
  that is pure unexplained vocabulary with no consequence stated for the reader.

### What worked
- Quoting the exact figures (62% of 2,741 → 29% of compile time) made the inconsistency demonstrable rather
  than a matter of taste; the reader of the feedback can redo the division themselves.
- Listing what the glossary *does* cover kept the term list short and credible: 8 items rather than 20.

### What didn't work
- I could not resolve whether several claims are simply missing a cross-reference to Article 3, so the
  feedback says "missing evidence" where the true fix might be "add a pointer to §3.x". I flagged this in
  the diary rather than in the feedback, since the article as published is what a reader gets.
- Section 4.3's score (3) is the least comfortable judgement: the design rule in it is the best single
  sentence in the article, but the section's argument for how CJI approaches the typed compiler is
  compressed into one paragraph with no intermediate steps.

### What I learned
- The article's explanatory writing is stronger than its evidential writing: every technique has a name,
  a citation and an intuition, and almost none has a number the reader can check end to end.
- A glossary can hide weaknesses: because *summary*, *SSA* and *local checking* are all defined, the
  article's dependence on earlier articles felt lighter than it is.

### What was tricky to build
- Distinguishing "I had to read this twice" from "this is wrong". Several re-read passages turned out to be
  correct but under-explained (the 2,741 arithmetic is fine; the 62%/29% conversion is not), and sorting
  them required doing the arithmetic rather than trusting my reaction.
- Choosing two systems (Static Hermes, AssemblyScript) to fault as under-evidenced without implying the
  whole comparison table is bad; section 4.2's table is the strongest evidence in the article.

### What warrants a second pair of eyes
- The claim about Static TypeScript: I say the ten-times figure is against interpreters and therefore does
  not support "declared types replace optimization". If the editor reads the STM paper differently, that
  item should be removed from the feedback rather than the article.
- The 15.9 million dispatches figure: I flagged it as unverifiable from this article, but it may be fully
  sourced in Article 3 or the companion report, in which case only a cross-reference is needed.

### What should be done in the future
- Add the cost accounting for the per-function result cache (how compile time splits between the 9,019
  skipped visits and the 2,741 body analyses), since that single sentence would make the whole summaries
  subsection checkable.
- Name the benchmark suite and the program behind the "450 times faster" figure.

### Code review instructions
- File: `feedback.md`. Verify each quotation appears verbatim in `article.md`; verify there are exactly the
  six required headings; verify the section scores cover 4.1 through 4.5 and no others.

### Technical details
- Feedback inventory: 6 double-read passages, 8 undefined terms, 9 unverifiable claims, 5 section scores,
  2 partially-answerable quiz questions (Q4, Q6) plus 1 thin answer (Q3), 1 addition, 1 cut.
- Cross-reference: the addition and the "What should be done in the future" item of Step 1 point at the same
  missing example, deliberately.

# Work diary — student read of Article 2, "Measuring Before Optimizing"

Session: reading `TASK.md`, then `article.md`, then quiz answers, then feedback.
Directory: `students/round1/a02-post/s3`.

## Step 1: Reading the article and the format

I read `TASK.md` first to fix the deliverable list (answers, feedback, diary), then read
`diary-format.md` so the diary would match its headings, then read `article.md` straight through once
without stopping. The plan was to read once for shape and keep a scratch list of every number I wanted
to check, because the article's whole claim is that numbers must be checkable.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four ordered steps in `TASK.md`: read the article, answer the
six quiz questions into `answers.md`, write `feedback.md` with six named sections, write `diary.md` in
the `diary-format.md` shape.
**Inferred user intent:** The editor wants an honest reader report on whether Article 2 actually
teaches, before publication — so arithmetic checks and flagged gaps matter more than praise.
**Commit (code):** none — no repository files were modified.

### What I did
- Read `TASK.md`, `diary-format.md`, and all of `article.md` (sections 2.1–2.9 plus references).
- Kept a scratch list of the numbers to re-derive: 1.6 ms/turn, 4.3%, 1.045, 559 ms table, 230 vs 235,
  29.9 ms, 51.1 ms, 118 µs/token, 2.66× and 3.32×.

### Why
- One uninterrupted pass first, because stopping to recompute every figure would have lost the
  argument's shape; the numbers are checkable afterwards, the shape is not.

### What worked
- The structure is easy to hold: 2.1 defines intervals, 2.2 gives the law, 2.3 and 2.4 apply it to boot
  and to compile, 2.5 lists experiments, 2.6–2.7 say what is missing and what would follow.
- The 559 ms table adds exactly to 559 (293 + 81 + 32 + 123 + 30), and the compositor is 52.4%, which
  supports the "more than half" sentence.

### What didn't work
- My first pass at the section 2.4 percentage column did not reconcile: 16 + 42 + 41 = 99, and against
  the visible RV32 path (51.1 ms) the rows give 16%, 40%, 40%. Only after subtracting the 2.4 ms
  self-evaluation row (denominator ≈ 48.7 ms) did 16/42/41 appear.
- `1,988 / 16,792` gives 118 µs, but half a second over 16,792 tokens gives 31 µs; I could not make the
  sentence in 2.4 self-consistent.

### What I learned
- "Share of the RV32 path" in this article does not include the row labelled as part of the RV32 path's
  own work; denominators are stated in prose only, if at all.

### What was tricky to build
- N/A — reading task, nothing was built.

### What warrants a second pair of eyes
- Whether "half a second" in 2.4 is meant to be the tokenizer's scaled cost (528 ms) or a rounding of
  something else; if it is 528 ms the per-token figure must be ~31 µs, not 118 µs.
- Whether 29.9 ms is 8.0 + 20.5 + 1.3 (29.8, rounding) and deliberately excludes self-evaluation.

### What should be done in the future
- Keep a per-table denominator note in the source text so readers do not re-derive it.

### Code review instructions
- Nothing to run. Re-check the arithmetic in section 2.4 by hand against the table.

### Technical details
- Intervals defined in 2.1: compile, turn CPU, first response after boot, framebuffer capture.
- Amdahl limit: 1 / (1 − p); p = 0.2 → 1.25.

## Step 2: Answering the six questions

I answered the questions from the text only, showing the arithmetic where the question asked for a
calculation and saying plainly where the text forced me to infer. Each answer carries a confidence
number, and I set those numbers honestly rather than uniformly high.

### Prompt Context
**User prompt (verbatim):** see Step 1 (`TASK.md` step 2).
**Assistant interpretation:** Write `answers.md`, numbered 1–6, two to six sentences each, working
shown, one `Confidence: N` line after each.
**Inferred user intent:** Test whether the quiz is answerable from the article alone; a low confidence
number is itself a finding for the editor.

### What I did
- Wrote `answers.md` with six answers.
- Q1: mapped "responds after power-on" onto the "first response after boot" row, named compositor
  layout/draw and the LCD transfer as the remaining wait.
- Q2: speedup = 1/(0.8 + 0.2/s) → limit 1/0.8 = 1.25, i.e. 25%.
- Q3: 2/559 ≈ 0.36%, bounded speedup ≈ 1.004, so scheduling (≈340 ms) beat compilation.
- Q4: 85.9 s / 1,479.1 s = 5.8%, and the heap enlargement saved only 1.2%.
- Q5: the 161-function reproduction validates the walk, not the predicted register-resident counts.
- Q6: one run cannot separate signal from noise; alternating order balances drift across control and
  candidate; median and range instead of a single figure.

### Why
- Confidence numbers were assigned by asking "could a second reader defend this from the page alone?",
  not by how plausible my answer felt.

### What worked
- Q2, Q3 and Q4 are fully determined by the text and I could show every step (1.6/37.2 = 4.30%,
  43,965/16,544 = 2.66 as a cross-check on prose elsewhere).

### What didn't work
- Q1 has no textual definition of the phrase in the question, so my answer rests on an assumption I had
  to label.
- Q5 asks "what does that check not establish"; the article's answer lives in Article 5, so I could
  only give the general form of the limitation.

### What I learned
- The quiz is answerable for the quantitative sections and weakest exactly where the article defers to
  other articles.

### What was tricky to build
- Keeping answers to six sentences: the Amdahl and Experiment 2 answers both wanted to sprawl.

### What warrants a second pair of eyes
- Q6: whether the alternating-order rationale is really in the text or only in the cited titles. I
  marked it as my inference and gave confidence 3.

### What should be done in the future
- If Article 2 keeps Q1, define "responds after power-on" in 2.1.

### Code review instructions
- Read `answers.md` alongside article sections 2.1, 2.2, 2.4 and 2.5.

### Technical details
- Native Editor: 52.9 ms / 33 turns = 1.60 ms per turn; WebAssembly 8.8 ms → saving ≈ 7.2 ms.
- Model walk: 43,965 / 16,544 = 2.66; 43,965 / 13,255 = 3.32.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six requested sections, quoting passages rather than paraphrasing them so
the editor can find each one. I grouped the arithmetic failures together because they are the finding
that matters most: this is an article about trusting numbers, and three of its own percentages did not
reconcile on first reading.

### Prompt Context
**User prompt (verbatim):** see Step 1 (`TASK.md` step 3).
**Assistant interpretation:** Produce six fixed sections: passages read twice, unexplained terms,
unverifiable claims, per-section scores, unanswerable quiz questions, one addition and one cut.
**Inferred user intent:** Give the editor a prioritised, actionable list — not a verdict on the writing
style.

### What I did
- Wrote `feedback.md` with all six headings in the required order.
- Seven quotations in "passages I had to read twice", each with the specific confusion.
- Twelve unexplained terms, one line each.
- Ten unverifiable claims, each with the missing evidence named.
- Scores 1–5 for 2.1 through 2.9 (2.4 lowest at 2) with a one-sentence reason each.
- Named Q1, Q5 and (partly) Q6 as not fully answerable from the text.
- Add: a denominator/sample-size note per table. Cut: the "Framebuffer capture" row in 2.1.

### Why
- I scored 2.4 lowest because it carries the article's central comparison and is where my arithmetic
  failed three times; scoring it generously would have hidden the most useful finding.
- I chose the framebuffer-row cut because it is a one-line fix that removes a category error, and I kept
  the 118 µs problem as a separate claim-level objection rather than a cut, since the paragraph may be
  salvageable with a corrected number.

### What worked
- Quoting exactly made the feedback checkable: every item can be found by searching the article text.
- The 559 ms table and Amdahl section produced no failures at all, which let me say clearly which
  sections are trustworthy.

### What didn't work
- I could not confirm whether 29.9 ms or 235 ms or 118 µs is a typo or a definition I misread; I recorded
  both readings instead of asserting an error. That means some feedback is "resolve this" rather than
  "this is wrong", which is weaker than the editor probably wants.

### What I learned
- Percentages whose denominator is only implied are the single most common source of doubt in this
  article; nearly every item in my claim list traces back to that.

### What was tricky to build
- Separating "I could not verify this" from "this is false". For 118 µs per token I had arithmetic
  evidence of inconsistency, but not of which side was wrong, so the wording had to stay conditional.

### What warrants a second pair of eyes
- Section 2.3's second trace (84 + 146 = 230 against a stated 235): whether that 5 ms is intentional.
- Section 2.4's RV32-path denominator: 48.7 ms vs 51.1 ms changes every share.

### What should be done in the future
- Verify the 2.4 arithmetic against the underlying `scripts/` output in the issue workspace before
  publication; the article cites `scripts/` and `various/` but quotes no raw numbers.

### Code review instructions
- Diff each quote in `feedback.md` against `article.md`; then re-derive the 2.4 table.

### Technical details
- Scores: 2.1 = 4, 2.2 = 4, 2.3 = 4, 2.4 = 2, 2.5 = 3, 2.6 = 3, 2.7 = 3, 2.8 = 3, 2.9 = 4.
- Unanswerable-from-text: Q1 (phrase not mapped to an interval), Q5 (assumptions deferred to Article 5),
  Q6 (reason for alternating order not given).

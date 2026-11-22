## Step 1: Answering a blind quiz about the inference-cost article

I was asked to act as a pre-publication student reader: answer a six-question quiz about an article on making compiler inference affordable, without having seen the article, then record the process. I read `TASK.md`, `quiz.md` and `diary-format.md`, answered all six questions in `answers.md` with a `Confidence` line after each, and wrote this diary entry.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the instructions inside `TASK.md`: read `quiz.md`, answer every question in `answers.md` (2–5 sentences each, numbered, with a confidence 1–5 line), then write `diary.md` in the `diary-format.md` format and reply with a single line `DONE`.
**Inferred user intent:** Test whether the teaching article's questions are answerable from general compiler knowledge alone, and to collect a reader's confidence profile so the editor can see which questions depend on article-specific facts.
**Commit (code):** N/A — no repository changes were requested beyond the two output documents.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory.
- Wrote `answers.md` with six numbered answers, each followed by `Confidence: N`.
- Wrote this `diary.md` following the "Investigation entry" format.

### Why
- The task explicitly separates answering from reading the source article, so I deliberately did not invent an article and did not claim facts I could not have.
- Where a question names something concrete from the article (Q1's `nextIndex`/`clamp` in section 4.1), I stated up front that I cannot know it, then gave the shape the answer would have to take, as instructed.
- Confidence levels were assigned by whether the question is about general, textbook-settled material (highest: Q2, Q3, Q4, Q6) versus article-specific code (lowest: Q1).

### What worked
- Q2 (summaries vs. callers), Q3 (phi nodes losing path conditions; gated SSA / pi-nodes), Q4 (fixpoints only at cycles, dependency order elsewhere) and Q6 (types replacing inference in Static TypeScript) all answered from settled compiler knowledge.
- Q5 (local checking) answered in general compositional-analysis terms, with a note that the article's chosen two consequences are unknowable to me.

### What didn't work
- Q1 could not be answered as asked. There is no source for `nextIndex` or its `clamp` in this directory, so the jump function and the range for `i` in `[5, 7]` had to be reconstructed from a guessed shape. Recorded as `I cannot know this without the article` with Confidence: 1. No command failed; the gap is informational.

### What I learned
- The quiz is structured so that the mechanism questions are answerable cold but the worked example is not — a useful signal for the editor: Q1 is the one item that a reader without the text cannot do, and it is a *computation*, so a reader who cannot do it also gets no feedback on whether section 4.1's formalism is followable.

### What was tricky to build
- Distinguishing "wrong answer" from "unanswerable question". The instruction allows both, but the honest form is to say which facts are missing and still deliver a falsifiable guess; I put the missing premise (`nextIndex`'s body, and the range of `n`) inside the guess so the editor can see exactly what the article would have to supply.

### What warrants a second pair of eyes
- Q1's reconstructed jump function: if the article's `nextIndex` has the form `clamp(i + 1, 0, n - 1)` or similar, my `[6, 8]` pre-clamp range should be checked against the intended answer, including whether the jump function is expected as a closed form or as an application to the caller's `n`.
- Q3's naming of extended SSA variants (gated SSA, pi/sigma nodes, SSI) — the article may use one specific name and treat the others as distinct.

### What should be done in the future
- If a second round is run, supply the section-4.1 excerpt and re-ask Q1 only, to measure whether the worked example is followable when the text is present.

### Code review instructions
- Read `answers.md` and check each answer is 2–5 sentences and carries exactly one `Confidence: N` line (N in 1–5).
- Compare Q1 and Q5 against the article's section 4.1 and its stated consequences of local checking.

### Technical details
- Files created: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Confidence assignments: Q1 = 1 (article-specific code), Q2 = 4, Q3 = 4, Q4 = 4, Q5 = 3, Q6 = 4.
- No network access was used and no files outside this directory were touched.

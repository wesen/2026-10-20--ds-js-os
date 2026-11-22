## Step 1: Answering a six-question quiz about an article I was not given

The task was a reader test: answer `quiz.md` about the article "8. Asynchrony as a Compiler
Transformation" using only prior knowledge and reasoning, then write `answers.md` and this diary. I read
`quiz.md`, `diary-format.md` and `TASK.md` in this directory only, wrote six short answers each with a
confidence score, and did not consult the web or any file outside the directory.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md literally: read the quiz, answer every question into
`answers.md` numbered like the questions (2–5 sentences each, `Confidence: N` line after each), write
`diary.md` in the diary-format.md shape, then reply with the single line `DONE`.
**Inferred user intent:** Test whether the quiz is answerable without the article — i.e. whether the
questions are self-contained enough, and where they leak article-specific detail an outside reader
cannot recover. The diary is the editor's evidence trail.
**Commit (code):** N/A — no repository commit was made or requested.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory.
- Wrote `answers.md` with six numbered answers plus a `Confidence:` line each, and a short preamble
  stating that the article was not available.
- Wrote this entry in the full investigation format.

### Why
- No compatibility shims, no code, no tests: the task is exclusively reading and writing prose files.
- I kept answers in "definition + what the answer would have to look like" form rather than inventing
  concrete variable names, because inventing specifics would fabricate evidence.

### What worked
- Questions 1, 5 and 6 were answerable in substance from general knowledge of CPS/state-machine
  compilation and cooperative scheduling; the reasoning is standard and does not depend on the article.
- Questions 2, 3 and 4 had inferable *shapes* (liveness rules, (operation, step) tag pairs,
  start/resume + state dispatch) even though the concrete identifiers are unknowable.

### What didn't work
- I could not answer any question with article-specific facts. Question 3 in particular asks for named
  fields of hand-written Editor code, which I have not seen; I recorded that plainly instead of guessing
  names.
- No commands failed; there was nothing to run.

### What I learned
- The quiz mixes two kinds of question: conceptual ones (5, 6, partly 1) that stand alone, and
  transcript-inspection ones (2, 3, 4) that require the article's code listings. Only the second kind
  is unanswerable for a reader without the text.

### What was tricky to build
- The main tension is TASK.md step 2: it asks me to say "I cannot know this without the article" *and*
  to still reason about the necessary form of the answer. I resolved it by stating the inability first,
  then giving the constraint-derived answer, and by keeping confidence low (2) for every
  article-dependent question, with only the conceptual definition in question 1 rated 3.

### What warrants a second pair of eyes
- Confidence calibration: questions 1, 5 and 6 got 3 rather than 4–5 because the article may use these
  words (`token`, `fuel`, `task`) in a narrower, project-specific sense than the general one I assumed.
- Whether question 4 expects `resume` to take a frame or a token; my answer hedges on both, and an
  editor may consider that hedging a weakness of the quiz (the signature should be quotable).

### What should be done in the future
- If this quiz is meant to be answerable pre-reading, questions 2, 3 and 4 should quote the relevant
  listing or be reworded as prediction questions ("what would have to be live, and why").

### Code review instructions
- Read `answers.md`; check that each of the six numbers from `quiz.md` has an answer and a
  `Confidence:` line, and that every article-dependent claim is flagged as such rather than asserted.
- Cross-check this entry against `diary-format.md` for field completeness. No validation commands apply.

### Technical details
- Files touched: `answers.md` (new), `diary.md` (new). Files read: `TASK.md`, `quiz.md`,
  `diary-format.md`. Tools used: `read`, `write` only. No network access, no files outside the working
  directory.
- Confidence distribution written: one 3 (question 1) and five 2s (questions 2–6); no 1s or 4–5s.

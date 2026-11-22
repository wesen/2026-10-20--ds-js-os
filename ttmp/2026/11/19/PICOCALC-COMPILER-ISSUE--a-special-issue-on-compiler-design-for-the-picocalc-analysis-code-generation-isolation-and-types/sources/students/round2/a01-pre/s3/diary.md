## Step 1: Answering the quiz blind, then recording the guesswork

I read `TASK.md`, `quiz.md` and `diary-format.md`, then answered all six questions in `answers.md`
without ever seeing the article they refer to. The point of the exercise is to find out which parts
of the article are inferable from first principles and which depend on facts only the text supplies,
so I marked every answer with a confidence number rather than smoothing over the gaps.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered instructions in `TASK.md`: read the quiz,
answer it from prior knowledge only, write `answers.md` with confidence lines, and write this
diary in the supplied format.
**Inferred user intent:** Measure how much a careful reader can reconstruct from the question
phrasing alone, so the editor knows which article passages actually carry information.
**Commit (code):** N/A — no repository, no commit made.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences and each followed by
  `Confidence: N`.
- Wrote this file, `diary.md`.

### Why
- `TASK.md` forbids the article and the web, so the only admissible inputs are the question wording
  and general knowledge about small cooperative-scheduler systems.
- Confidence lines are kept because a guess and a recollection should not look alike in a review
  pass over the teaching article.

### What worked
- Q1 (no preemption, so slices and yields) and Q3 (a compiler without annotations needs external
  type/effect facts) are answerable structurally; the reasoning holds for any such device.
- Q5 (application → message → surface world → driver world → bus → LCD) follows directly from the
  "worlds and messages" framing in the question.

### What didn't work
- Q2 asks me to *name* the three engines. I could not; I said so and gave the interpreter / VM /
  WASM ordering as a hypothesis instead. Naming them is a pure lookup.
- Q4 asks for *one reason from this article* for the 710 vs 528 KiB gap. Without the text the only
  available move is a plausible accounting argument (static linking and per-world reserves versus
  host imports), which may not be the reason the author gives.

### What I learned
- The quiz is written so that the isolation claim is testable from the outside: Q2 and Q6 both
  hinge on vocabulary the reader must have been given. Numbers (710, 528, 768 KiB) are unguessable
  but checkable, which makes them good markers for whether a reader actually read.

### What was tricky to build
- Deciding how to answer an unanswerable question. I chose the pattern the task asks for —
  "I cannot know this without the article" followed by the reasoning that constrains what the
  answer must look like — rather than inventing a definite but unverifiable answer.

### What warrants a second pair of eyes
- Q6: "hybrids" is the one term I had to guess at. If it means something more specific (for
  instance a world that is half native code and half interpreted script), my answer is in the right
  neighbourhood but may miss the author's definition. An editor should check that sentence first.

### What should be done in the future
- Re-run this quiz with the article, compare, and turn every answer I marked Confidence 2 into a
  candidate rewrite target in the article.

### Code review instructions
- Files: `answers.md` (this repository's only deliverable besides this diary). Check that each
  answer has a confidence line and that questions 2 and 4 begin by admitting the missing article.

### Technical details
- Constraints observed: no web access, no files outside this directory, no reading of the article.
- Confidence distribution: four answers at 3, two (`Q2`, `Q6`) at 2, none at 1 or 5.

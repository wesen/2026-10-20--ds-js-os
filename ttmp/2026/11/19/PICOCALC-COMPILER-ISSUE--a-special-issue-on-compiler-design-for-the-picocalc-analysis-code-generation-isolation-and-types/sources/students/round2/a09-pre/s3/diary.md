## Step 1: Answering the quiz without the article

I was asked to act as a student reader testing an article before publication. I read `TASK.md`,
then `quiz.md` (six questions about "9. Types That Pay for Themselves") and `diary-format.md`,
and answered all six questions from prior knowledge plus reasoning, writing the results to
`answers.md` and this entry to `diary.md`. No commands other than file reads and writes were
run; nothing was looked up on the web and no files outside this directory were touched.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the procedure in `TASK.md`: read the quiz, answer every
question without the article, write `answers.md` with per-answer confidence, then write this
diary entry in the given format, then reply with a single line `DONE`.
**Inferred user intent:** Wanted a controlled test of how much of the article is recoverable
from the questions alone—an editor's check on whether the questions are self-contained, whether
they leak their answers, and where the reader's prior knowledge has to substitute for the text.
**Commit (code):** N/A — no repository commit was made in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` with the file-reading tool.
- Wrote `answers.md`: answers 1–6, each 2–5 sentences followed by a `Confidence: N` line
  (my values: 2, 2, 3, 3, 3, 3).
- Wrote this entry as `diary.md` in the format from `diary-format.md`.
- Attempted no directory listing (no shell tool available in this session); only the four
  named files were read.

### Why
- Answering before reading the article is the whole point of the exercise, so I deliberately
  did not try to locate the article text or any neighboring draft of it.
- I kept each answer shaped as "what the fact would have to be, and why", so a reviewer can see
  which parts are reconstruction rather than recall.
- Confidence values stay at 2–3 rather than higher: no answer is anchored in a quotation from
  the article, and the ones I could reason about structurally (4, 5, 6, partly 3) are standard
  arguments that could still differ from this article's formulation.

### What worked
- All six questions had a recoverable structure. Questions 3–6 describe mechanisms precisely
  enough (a flow-sensitive loop fact with an explicit invalidation list; a signed-versus-unsigned
  bounds check; a per-turn arena; a linear grant through a two-branch `if`) that I could reason to
  a defensible answer without the text.
- Questions 1 and 2 ask for enumerated specifics ("name two of them", "name the four"), which is
  where reconstruction is weakest.

### What didn't work
- Nothing failed mechanically. The substantive shortfall: questions 1 and 2 ask me to *name*
  members of a list that exists only in the article. I could not name them; I said so explicitly
  and answered with the shape of the answer instead. My confidence there is 2 because the specific
  items I guessed (alignment/mode/kind fields; byte offset vs. logical line/column vs. visual
  cell vs. pixel) are plausible for an editor but are guesses, not recall.

### What I learned
- The six questions form a clear progression—representation (9.2), metadata/coordinate identity
  (9.3), flow-sensitive facts (9.4), value-domain-restricted integers (9.5), region lifetimes
  (9.6), linearity (9.7)—so `9.Types That Pay for Themselves` appears to be an argument that the
  type layer pays for its cost by deleting runtime checks. I inferred that from the questions
  only; I could be wrong about the ordering, since section numbers 9.5–9.7 appear nowhere in the
  quiz and were inferred from where the question topics fit.
- What a quiz can and cannot teach: mechanisms transfer ("an unsigned index makes the lower
  bound vacuous"), but names never do ("the three places in 9.2").

### What was tricky to build
- The hard part was holding to the instruction "say 'I cannot know this without the article' and
  then give your best reasoning" without letting the disclaimer swallow the reasoning, or the
  reasoning masquerade as recall. On questions 1, 2 and 5 I opened with the disclaimer and then
  committed to a concrete reconstruction; on 3, 4 and 6 I judged the mechanism to be recoverable
  from the question itself and answered directly, but still flagged the unnamed specifics.
- Question 6 was the subtlest: the question asks both about the residual obligation at the end of
  each branch (must be consumed or moved onward) and about whether the branches may differ. Those
  are separate questions—branch-local linearity permits different *actions*, but the join at the
  merge point constrains what both branches must *leave behind*, so I had to answer both without
  collapsing them.

### What warrants a second pair of eyes
- Whether my confidence numbers are calibrated: two 2s and four 3s may be generous if the article
  uses nonstandard terminology (a "Grant" that behaves more like a capability than a linear token,
  an arena rule phrased as "no up-pointers" versus "no finalizers"—I asserted both, and the
  article may state only one).
- Question 2's "specific mistake that tests tend to miss" is a claim about *this article's*
  observation. My answer (all coordinate systems coincide on short ASCII test input) is the
  most likely one but is genuinely a guess about a sentence I have not read.

### What should be done in the future
- If this is an evaluation of the quiz, the interesting signal is that Q1 and Q2 are unanswerable
  without the text while Q3–Q6 are answerable in outline from the question wording—which means
  Q3–Q6 may be leaking their answers through their premises (e.g. Q4 states the unsigned-index
  fix in the question). Worth a pass to decide whether that leak is intentional scaffolding.
- Compare these answers against the article to see which of my reconstructions were right; the
  mismatches are the best evidence of where the article's definitions are load-bearing and
  therefore where it needs to be most explicit.

### Code review instructions
- Read `answers.md` against `quiz.md`; every question number 1–6 should have an answer and
  exactly one `Confidence: N` line with N in 1..5. Then check this file against the template in
  `diary-format.md`.
- Validation is manual reading only; there are no tests or build steps in this directory.

### Technical details
- Files written: `answers.md` (six numbered answers, confidences 2/2/3/3/3/3), `diary.md`.
- Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Constraints observed: no web access, no files outside the working directory, no attempt to
  locate the article itself.

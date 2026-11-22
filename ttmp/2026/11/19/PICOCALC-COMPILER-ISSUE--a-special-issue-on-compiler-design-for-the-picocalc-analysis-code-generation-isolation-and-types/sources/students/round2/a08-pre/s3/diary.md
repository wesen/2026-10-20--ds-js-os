# Investigation entry

## Step 1: Answering a quiz about an article I was not given

The directory contained only the instructions (`TASK.md`), the quiz (`quiz.md`) and the diary format
(`diary-format.md`); the article itself, "8. Asynchrony as a Compiler Transformation", was deliberately
absent. I therefore wrote `answers.md` from general knowledge of continuation-passing/state-machine
compilation of async code plus careful reasoning about what each question implies, and marked every
answer with an explicit confidence and, where needed, the sentence "I cannot know this without the
article".

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md`: read `quiz.md`, answer all
questions into `answers.md` with per-answer confidence, write a `diary.md` step in the
`diary-format.md` shape, and finish with the single line `DONE`.
**Inferred user intent:** Test whether a reader without the article can still produce plausible,
honestly-hedged answers, and thereby learn which quiz questions are answerable from the text's own
internal logic and which are pure lookups.
**Commit (code):** none — no repository or git metadata was available or used.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory.
- Attempted to list the directory to be sure no article files were present; no directory-listing or
  shell tool exists in this harness, so I confirmed only that the three named files are readable and
  that no other file was referenced by them.
- Wrote `answers.md` with six numbered answers, each 3–5 sentences and followed by
  `Confidence: N` (N ∈ {2, 3}).
- Wrote this `diary.md`.

### Why
- The task says answers must come from what I can reason out, and that unknown facts must be declared
  rather than invented. So each answer first states the mechanism I can justify, then names the
  specific detail (variable names, field names, state constants) as unknowable.
- Questions 1, 4 and 6 are mechanism questions (what a token is, what an entry point is called with,
  why automatic waits are dangerous), so they can be answered structurally with moderate confidence.
- Questions 2, 3 and 5 hinge on details of the article's own example code, so they had to be hedged.

### What worked
- Question 1: a token as an opaque receipt identifying one pending operation, which must outlive the
  request and be handed back at completion — this follows from the very idea of a request/completion
  split and needs no article text.
- Question 6: the hazard of inserting a wait when fuel runs low is reachable purely from the
  definition of a wait (other tasks run; the world changes), so the answer is defensible without the
  article.
- Question 2: the justification for `stop` being dead is forced once one assumes the article is
  applying ordinary liveness analysis at the wait points.

### What didn't work
- The article's own names could not be recovered: I could not state the two tag fields in question 3
  or the exact set of saved variables in questions 2 and 3. I wrote `pc`/`phase` style guesses and
  labelled them as guesses. No tool failure occurred; the limitation is the missing source text,
  which was intentional.
- I could not verify whether `openFile` has exactly two waits before or after each wait, so answer 2
  is conditioned on that reading.

### What I learned
- A quiz can be designed so that its answers are partly derivable: naming a liveness question
  ("which variables are live, justify `stop`") already telegraphs that the answer is a liveness
  argument, and naming "two entry points, `start` and `resume`" telegraphs a state-machine
  compilation scheme.
- The unresolvable parts are exactly the article-specific choices (field names, state numbering,
  the precise remaining restriction in the frame-layout scheme), which is a useful signal about
  which parts of the article carry real content versus which restate the standard transformation.

### What was tricky to build
- Distinguishing "I can derive this" from "this only sounds right". Question 5 is the sharpest case:
  the claim "the unit that needs storage is the task, not the function" is intelligible (re-entrancy
  breaks per-function frames), but the *specific* layout discipline and the specific residual
  restriction (fixed task count? no recursion? fixed depth?) are article facts. I kept the reasoning
  and named the restriction as the unknown rather than asserting one.
- Question 4's phrasing "for each value of `frame.state`" implies a small enumerated state space, so I
  answered in terms of general categories (entry, one per wait site, terminal) instead of inventing
  numbers.

### What warrants a second pair of eyes
- Answer 2: if the article's `stop` is in fact live (e.g. used as a sentinel after the second wait),
  my "dead by liveness" justification is wrong and the article's justification is something else
  (e.g. it is recomputable, or it is a constant).
- Answer 3: I asserted *two* fields form the tag; the article might use a single integer pc plus a
  distinct code-location per continuation, in which case the "two fields" framing I invented is a
  misreading of what is likely a `pc`/`kind` pair.
- Answer 5: the "remaining restriction" could equally be "no async function may be called from more
  than one task" — different from what I listed.

### What should be done in the future
- Re-run the same quiz after the article is supplied, and diff the answers to see which reasoning
  steps survived. That would validate whether this style of quiz genuinely tests understanding.
- N/A for code follow-ups; no source files were modified.

### Code review instructions
- Files touched: `answers.md` (new), `diary.md` (new). Nothing else in the directory was changed.
- Review by reading `answers.md` against `quiz.md` and checking that every question has a
  `Confidence:` line and that unknowable details are flagged rather than asserted.

### Technical details
- Harness constraints observed: only `read`, `write`, `edit` were available (no shell, no directory
  listing, no web), and the article file was not present in
  `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a08-pre/s3`.
- Confidence values used: Q1 = 3, Q2 = 2, Q3 = 2, Q4 = 2, Q5 = 2, Q6 = 3.

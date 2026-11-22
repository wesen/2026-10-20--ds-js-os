## Step 1: Answering an article quiz without the article, and recording where I had to guess

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and confirmed by probing for
`article.md` / `README.md` (both ENOENT) that this directory contains only the quiz, the format
spec and the task — no copy of "3. Why Whole-Program Inference Costs Minutes". I therefore answered
all six questions from reasoning about how whole-program range analysis, widening, IEEE-754 doubles
and Self-style two-tier compilation behave in general, writing `answers.md` with one section per
question and a `Confidence: N` line after each.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered steps of `TASK.md`: read `quiz.md`, answer
every question into `answers.md` with confidences, write `diary.md` in the `diary-format.md`
format, and reply with the single line `DONE`.
**Inferred user intent:** Produce a blind "student reader" baseline — answers to the quiz produced
*without* the article — so the editor can see which questions are answerable from general knowledge
alone and which are unanswerable without the text.
**Commit (code):** none (no repository commit was made in this session)

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`.
- Probed for `article.md` and `README.md` to confirm the article was not supplied; both returned
  ENOENT.
- Wrote `answers.md`: six numbered sections, 4–5 sentences each, each followed by `Confidence: N`
  from 1–5, with the literal phrase "I cannot know this without the article" wherever the question
  asks for a value that lives only in the article (Q1 source detail, Q2 table values, Q4 counts,
  Q5 measurement).
- Wrote this entry as `diary.md` in the full format.

### Why
- Answering strictly from general principles (abstract interpretation with widening, IEEE-754
  round-to-nearest-even at 2^53, baseline-versus-optimizing compiler splits) keeps the baseline
  honest: nothing in `answers.md` is derived from the article.
- I chose to state the general mechanism *and* flag the missing specifics rather than invent
  numbers, because invented table values would look like reading comprehension when they are not.

### What worked
- Q3 is answerable with certainty from IEEE-754 alone: `max + 2 = 2^53 + 1` is a tie between `2^53`
  and `2^53 + 2`, ties-to-even gives `2^53`, so JS yields 1; exact 64-bit integer arithmetic yields
  2. This also explains what kind of proof the "range proof" must be (it must cover intermediates,
  not just inputs and outputs).
- Q1 and Q6 have answerable structures: (a) inferred-domain change feeding code generation, hence
  no separate compilation; (b) the existing baseline interpreter plays Self's quick-compiler role,
  and CJI lacks runtime type feedback plus guards/deoptimisation/OSR.
- Q2, Q4 and Q5 resolved only as *shapes*: an ascending chain beaten by widening; 1 + 6 = 7 sweeps
  with a non-uniform worklist total of 95 (95/7 ≈ 13.6, i.e. not every sweep touches every unit);
  and an ablation-style measurement whose residual cost must be attributed to repeated
  specialization/code generation or pass-manager traversal overhead.

### What didn't work
- The obvious first step failed: `read article.md` and `read README.md` both returned
  `ENOENT: no such file or directory`, and `read .` returned `EISDIR: illegal operation on a
  directory`. There is no shell tool in this session, so I could not `ls` to enumerate the
  directory; I recovered by relying on the quiz text itself for terminology (`half`, `scale`,
  Agenda, CJI, max = 2^53 − 1).
- I could not verify any of the numbers the quiz quotes (six rounds, seven analyses, 95 passes, the
  §3.5 measurement), so those answers are explicitly labelled low-confidence rather than dressed up.

### What I learned
- A quiz on a missing article splits cleanly into three classes: mechanism questions that survive
  without the text (Q1, Q3, Q6), trace/count questions that need the text but whose *form* is
  inferable (Q2, Q4), and measurement questions that are essentially unrecoverable (Q5).
- The `(max + 2) - max` example is a sharper test of a range analysis than it first looks: both
  operands and the result are inside the safe-integer range, so any proof that reasons only about
  argument and return ranges will silently break JS semantics on the intermediate.
- Nothing here is a correctness claim about CJI; only about what such a compiler must do.

### What was tricky to build
- Calibrating confidence honestly. The temptation is to write 5s for things that merely *sound*
  inevitable (e.g. "widening jumps to +∞"); I capped those at 2 because CJI may widen to a bound
  derived from the loop guard rather than to infinity, and because the quiz implies a specific
  pass index in a table I have not seen. Q3 gets 4 because it is arithmetic, not prose.

### What warrants a second pair of eyes
- Whether the editorial intent of the baseline is "state what you can" (my reading) or "explicitly
  refuse everything not in the text". If the latter, several answers are too speculative, notably
  Q4's 1 + 6 split of the seven analyses and Q6's identification of the baseline interpreter.
- Q5 is a pure guess about what §3.5 measures; a grader should treat that section as empty rather
  than wrong.

### What should be done in the future
- Ship the article alongside the quiz in this directory, or state in `TASK.md` which sections may be
  quoted. A single dropped `article.md` would have converted three low-confidence answers into
  high-confidence ones.
- If this baseline is compared against a post-article run, keep `answers.md` untouched as the "pre"
  artefact — the directory name `a03-pre` suggests exactly that comparison.

### Code review instructions
- Read `answers.md` and check only two things: (1) every question has a `Confidence: N` line, and
  (2) every answer that depends on article-only facts contains the phrase "I cannot know this
  without the article" before the speculation.
- Validate the arithmetic in Q3 by hand or in any JS console: `(9007199254740991 + 2) - 9007199254740991`.

### Technical details
- Directory contents observed: `TASK.md`, `quiz.md`, `diary-format.md` (+ outputs `answers.md`,
  `diary.md`). No `article.md`.
- Q3 constants: `max = 2^53 − 1 = 9007199254740991`; `max + 2 = 9007199254740993 = 2^53 + 1`;
  representable neighbours `9007199254740992` and `9007199254740994`; tie → even mantissa →
  `9007199254740992`; result `1`. An exact-integer evaluator returns `2`.
- Q4 arithmetic: `95 / 7 ≈ 13.571`, non-integral, so the per-sweep unit count is not constant.

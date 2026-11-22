## Step 1: Blind pre-read attempt on "9. Types That Pay for Themselves"

I read `quiz.md` and `diary-format.md`, then wrote `answers.md` with six blind answers, since the
article itself was not provided. The exercise is clearly a baseline: the editor wants to see what
a reader can reconstruct from the question wording alone, so I separated what is genuinely
inferable from general type-system knowledge (items 1, 2) from what is specific to the article's
own examples and vocabulary (items 3, 5, and partly 4 and 6), and marked confidence accordingly.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md literally: read `quiz.md`, answer all six questions in
`answers.md` with a `Confidence: N` line each, write this diary in the `diary-format.md` shape, and
reply with the single line `DONE`.
**Inferred user intent:** Produce an uncontaminated baseline of reader comprehension before the
article is revealed, and a record of which questions are answerable from general knowledge versus
which depend on article-specific content.
**Commit (code):** N/A — no repository, no code changes.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory
  `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--.../students/round1/a09-pre/s3`.
- Wrote `answers.md`: six numbered answers, 3–5 sentences each, each followed by a `Confidence: N` line.
- Wrote this `diary.md` using the full entry format from `diary-format.md`.

### Why
- The task explicitly forbids using the article and forbids the web, so every answer had to come
  from reasoning about the question's own wording plus general compiler/type-system knowledge.
- I chose to name my uncertainty explicitly ("I cannot know this without the article") where the
  question referenced an internal specific — the loop in section 9.4, the exact arena rules —
  because inventing the article's content would defeat the purpose of the baseline.

### What worked
- Questions 1 and 2 were answerable with reasonable confidence (4 each): exhaustiveness as a
  closed-set check that turns extension into compile errors, and nominal newtypes over the same
  32-bit representation as zero-cost run-time but non-zero ergonomic cost.
- Question 6 was answerable in outline from the standard linear-types recipe: exactly-one-use on
  every path, no duplication, agreement at the join.

### What didn't work
- Question 3 could not be answered as asked: it refers to "the loop of section 9.4" — a specific
  fact, recorded at a specific point, invalidated at a specific point. No failure or diagnostic to
  report; I recorded the general shape (loop-header fact, re-established per iteration, no need to
  cross the back-edge) and marked confidence 2.
- Question 5 likewise names "the two rules" of the article's per-turn arena. I reconstructed the
  most plausible pair (allocate only within the owning turn; nothing escapes the turn / bulk reset)
  but flagged it as a guess. Same for question 4's exact unsigned-index argument.

### What I learned
- The question set is structured so that the *genre* is legible without the text: nominal types,
  flow-sensitive range facts, arenas/regions, linear capabilities. That suggests the chapter's
  spine is "types that eliminate checks or whole classes of bug at no run-time cost."
- Distinguishing "I know this domain" from "I know this article" is the actual deliverable here,
  and the confidence numbers are doing real work rather than decorating the answers.

### What was tricky to build
- The main difficulty is calibration: answer 3 and answer 5 are the ones where a confident-sounding
  invented detail would look most plausible and be most wrong. I kept those concrete-sounding but
  labelled as reconstruction, and priced that in the confidence line. Answer 6 has an ordering
  subtlety worth stating precisely — the obligation is per-path, so it is not enough that the two
  branches together consume the grant once; each branch must discharge it, and early exits still
  owe the use.

### What warrants a second pair of eyes
- Whether my confidence ratings cluster too high on 1/2/6 (I gave 4, 4, 3) given that I have not
  read a line of the article. A reviewer comparing against the text should check in particular
  whether the chapter's `Unit`/`Point` example really is zero-cost erasure or whether it carries a
  wrapper the article argues is optimised away.
- Whether answer 3's "no need to survive the back-edge" reasoning matches the article's actual
  framing — mine is the standard loop-header argument, but the article may be making a subtler
  point about not carrying facts across a jump at all.

### What should be done in the future
- Once the article is available, re-score these six answers against it to get a per-question
  "inferable from the question alone" signal — that is more useful to the editor than the raw
  answers.
- If this baseline is repeated, keeping the answer files immutable before the reveal matters more
  than answer quality.

### Code review instructions
- Read `answers.md` (six answers with confidence lines) and this file. Validation is editorial, not
  executable: confirm every question number 1–6 appears in `answers.md`, each answer is 2–5
  sentences, and each is followed by exactly one `Confidence: N` line with N in 1..5.
- Confirm no file outside this directory was read and no network access was used.

### Technical details
- Files created: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Confidence assigned: Q1 = 4, Q2 = 4, Q3 = 2, Q4 = 3, Q5 = 2, Q6 = 3.
- Questions answered with article-independent reasoning: Q1, Q2 (high), Q4, Q6 (partial).
- Questions explicitly marked "I cannot know this without the article": Q3, Q5.

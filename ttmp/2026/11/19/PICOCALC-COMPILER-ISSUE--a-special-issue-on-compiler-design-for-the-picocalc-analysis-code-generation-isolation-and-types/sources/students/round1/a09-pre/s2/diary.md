## Step 1: Pre-publication blind pass over the type-system quiz

I read `TASK.md`, the six questions in `quiz.md`, and the required entry format in `diary-format.md`,
then answered all six questions in `answers.md` from general compiler and type-system knowledge
without access to the article. Four answers (Q1, Q2, Q4, Q6) rest on standard, well-established
mechanics — exhaustiveness checking, nominal types erased at run time, signed-vs-unsigned bounds
elimination, and linearity across branches — so they could be written with reasonable confidence.
Two could not be answered honestly: Q3 names a specific loop in section 9.4 and Q5 asks for "the two
rules" as the article states them, so both were answered as statements of what the answer must look
like, with confidence 1 and 3 respectively.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md` inside this directory: read
the quiz, answer it blind to `answers.md` with per-answer confidence, write a formatted diary entry,
and finish with the single line `DONE`.
**Inferred user intent:** The editor wants an untainted baseline of what a careful reader can infer
from the questions alone, so that after publication the article can be checked for whether its
specific claims are actually guessable, and for which questions leak their answer and which do not.
**Commit (code):** N/A — no repository, no version control in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`; no article text was present in the directory.
- Wrote `answers.md` with six numbered answers, each two to five sentences, each followed by a
  `Confidence: N` line (N in 1–5).
- Wrote this diary entry in the full `diary-format.md` shape.

### Why
- The point of a blind pass is defeated by reasoning backwards from the article, so I deliberately
  did not look for a draft, outline or neighbouring directory, and did not go outside the directory.
- For Q3 and Q5 I chose to say "I cannot know this without the article" up front rather than
  manufacture a confident-sounding reconstruction, because a fake 4 on a section-specific question
  would corrupt the baseline the editor is trying to measure.

### What worked
- Q1, Q2, Q4, Q6: answered directly. The mechanisms are standard enough that the article cannot
  plausibly be making a different point.
- Q4 in particular is fully determined by the question's own wording: a signed `at < text.length`
  cannot exclude negative `at`, and an unsigned index type collapses the two sub-goals into one test.

### What didn't work
- Q3: the question references "the loop of section 9.4" and a "fact the compiler records", and I have
  no way to identify the fact. Answer given is a schema, not a content answer.
- Q5: the question asks me to "state the two rules", which presumes the article's own enumeration.
  My answer is a plausible pair (arena-scoped allocation, wholesale reset at turn boundary) but the
  article may split the rules differently — e.g. as (allocation) and (no escaping references), with
  the reset treated as a consequence rather than a rule.

### What I learned
- The quiz itself reveals the article's structure: it walks through exhaustiveness, nominal
  integer types, a loop-local range fact, the signed/unsigned bounds-check elimination trick, a
  per-turn arena, and a linear permission type. That is a coherent "types pay for themselves" thesis
  where each type buys a specific optimization or a specific class of bug removed.
- Q4 and Q6 are the two questions whose answers are essentially forced by the question, which are
  the weakest tests of comprehension if used as-is.

### What was tricky to build
- Keeping each answer at two to five sentences while still giving the reasoning and not just the
  conclusion. Q3 kept wanting to become a long speculative essay about dataflow facts, so it was cut
  back to: what shape the fact must have, where it dies, and why the back-edge does not matter.

### What warrants a second pair of eyes
- The Q5 pairing. If the article's two rules are "no allocation after the turn starts" plus "no
  references escape", then my "reset at the boundary" is a mechanism, not a rule, and my answer is
  mis-framed even though it gestures at the right safety condition.
- Whether Q3's intended answer even involves a mutation point. A loop-invariant-fact story
  (length cached, index bounded by a constant after a guard) is also consistent with the wording.

### What should be done in the future
- Re-run this pass against the published article and diff `answers.md` line by line, scoring each
  question on whether a careful reader could get it. Q3 and Q5 are the priority checks; Q4 and Q6
  probably need rewording so the answer is not implied by the question.

### Code review instructions
- Files: `answers.md` (six numbered answers plus confidence lines), `diary.md` (this entry).
  Validation is manual: confirm every question number 1–6 appears exactly once in `answers.md`, that
  each answer has a following `Confidence:` line, and that sentence counts stay in the 2–5 range.

### Technical details
- Constraints honoured: answers written before any article was read; no network use; no files
  written outside the working directory; appended format reused verbatim from `diary-format.md`.
- Confidence distribution: 4, 4, 1, 4, 3, 4. The single low score is Q3, the only question naming a
  concrete numbered section; Q5 is mid because its schema is right but its grouping is guessed.

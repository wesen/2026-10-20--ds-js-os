## Step 1: Pre-reading quiz on the register-machine code generation article

This step is the "before" half of an editorial experiment: answer the quiz for the article cold, so
the editor can compare what a reader infers from the section headings and vocabulary alone against
what the article actually says. The article text was deliberately not supplied — the working
directory contains only `TASK.md`, `quiz.md` and `diary-format.md` — so every answer had to be
reconstructed from the six question wordings plus general knowledge of stack-machine to
register-machine translators. I wrote `answers.md` with six numbered answers, each followed by a
`Confidence:` line, and no attempt was made to look up the source.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps of `TASK.md`: read the quiz, answer it cold into `answers.md`, write this diary entry in the `diary-format.md` shape, then reply `DONE`.
**Inferred user intent:** Produce a genuine untainted baseline of reader comprehension, for later comparison with the same reader after seeing the article; honesty about missing information is worth more here than plausible-sounding completeness.
**Commit (code):** N/A — no repository commit was made in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`; confirmed no article file exists in the directory.
- Wrote `answers.md` with six answers (2–5 sentences each) and a `Confidence: N` line per answer.
- Wrote `diary.md` (this file) in the required investigation-entry format.

### Why
- The task explicitly forbids using outside sources and asks for "I cannot know this without the article" where facts are unavailable, so the value of the output is in separating deduction from recall.
- Answering in the shape of the questions (translation, join, branch, measurement) lets the editor see *where* the quiz leaks its own answers: questions 3 and 6 describe enough of the mechanism that a reader can rederive the principle even without the text.
- I considered writing only "cannot know" for questions 1, 2, 4 and 6, but rejected that: the task asks for best reasoning about what the answer would have to look like.

### What worked
- Questions 3, 5 and 6 were answerable at the level of principle with no article access: join-point consistency is a standard correctness invariant, and validating a cost model against an existing backend is a well-understood calibration argument.
- Question 2's instruction count could be derived from first principles (lazy descriptors plus one add plus one store), giving 2 instructions, and question 1's naive count gave roughly 10 — a ratio the article can be checked against.

### What didn't work
- Exact numbers were unobtainable: the section 5.3 percentage of redundant jumps, the exact naive listing/count in question 1, and the two specific items in section 5.9's hand-written loop are all article facts. I recorded them as "I cannot know this without the article" and supplied a fallback guess plus the reasoning that constrains the guess, marking them at confidence 1–2 rather than inventing a figure.
- Instruction counts in questions 1 and 2 are ISA-dependent (one-address vs three-address ALU, presence of memory/immediate operand forms), so both counts are ranges with the assumption stated, not single authoritative numbers.

### What I learned
- The quiz wording itself carries most of the article's argument: "lazy constants" plus "agreed locations" plus "one operation at a time" is enough to predict the whole thesis, and a reader who has written one stack-to-register translator can score most of it blind.
- Because of that, low predictability on questions 1, 2, 4 and 6 is not evidence that the article is unclear — those are exactly the places where the quiz cites measurements rather than principles.

### What was tricky to build
- Keeping "what the answer would have to look like" separate from "what the answer is". The temptation was to phrase guesses as findings; the fix was to state the shape of the required result first (e.g. "the claim section 5.3 would have to support is that the redundant jump is needed in only a minority of `if`s") and only then offer a number flagged as a guess.
- Calibrating the confidence numbers so they are informative: 4 for the join-point invariant (standard compiler fact, restated by the question itself), 3 for reasonings that depend on my assumption about the backend's shape, 2 where ISA or corpus details change the answer, 1 nowhere — nothing here was pure coin-flipping, but questions 1 and 4 are close to it.

### What warrants a second pair of eyes
- Answer 1's instruction count and answer 2's count should be checked against the article's own listings; the *ratio* is the claim that matters, and if the real numbers differ from ~10 and ~2 the reductions reported in the article may rest on a different accounting convention (e.g. counting the spill store as part of the op, or counting pairs like load+add as one "instruction").
- Answer 6 names liveness/loop-invariance and fused compare-and-branch; if section 5.9's loop instead demonstrates strength reduction or pointer-increment induction variables, my two picks are simply the wrong two even though the "whole-region knowledge" argument holds.

### What should be done in the future
- Run the same quiz again after the reader has the article, and diff the two `answers.md` files plus the confidence numbers; the delta is the measurement the editor wants.
- Record which questions were unanswerable purely because they depend on a number from the text, so the article can be checked for whether those numbers are highlighted in prose or buried.

### Code review instructions
- Compare `answers.md` against `quiz.md`: every question 1–6 must have an answer and exactly one `Confidence: N` line with N in 1–5.
- Validation is by inspection only; there are no tests or builds in this directory.

### Technical details
- Files produced: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Stated assumptions: frame layout `y @0`, `x @4`, operand slots `@8` and `@12`; naive backend materialises every operand-stack value to its slot; models A and B are the compile-time-operand-stack variants discussed in the article.
- Confidence distribution: 4 (one answer), 3 (three answers), 2 (two answers); no answer claimed certainty.

## Step 1: Answering the review quiz without the article

I was asked to act as a student reader for an unpublished teaching article, "9. Types That Pay for Themselves", of which only the quiz was provided. The exercise is a blind-reader test: answer the six questions from prior knowledge and reasoning alone, marking honestly where an answer depends on facts that only the article could supply. I read `quiz.md` and `diary-format.md`, then wrote `answers.md` with one numbered answer and one `Confidence: N` line per question.

Two questions (9.2's bare-integer sites, 9.3's four coordinate systems) are pure retrieval from text I do not have, so I answered with the epistemically honest form the task asked for: state that the specific facts are unknowable, then describe the constraint the answer must satisfy and the most plausible instance. Four questions (the loop invariant, the signed-versus-unsigned bounds check, the per-turn arena, the linear grant) are general enough that standard compiler and type-theory reasoning gets most of the way, so those carry higher confidence; in each case I flagged which sub-claims are inference rather than knowledge.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the instruction file and perform its steps: answer the quiz, write `answers.md`, write `diary.md` in the given format, finish with the single line `DONE`.
**Inferred user intent:** Validate that the article's questions are answerable by a careful reader who has not seen the text, and expose which questions leak information that is only available in the article — a calibration check on the prose, not a test of my compiler knowledge.
**Commit (code):** N/A — no commit was made; this directory is not a git working tree as far as I could observe.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory (a09-pre/s2).
- Wrote `answers.md` with six numbered answers, each followed by a `Confidence: N` line (N in 1–5).
- Wrote this `diary.md` entry following the format in `diary-format.md`.

### Why
- The task explicitly forbids using the article, so every answer names its basis: retrieval (impossible) versus inference (possible).
- Confidence values were assigned by source of knowledge: 2 for answers whose substance is invented-but-plausible, 3 where I inferred the framework and filled in the details, 4 where the answer follows from standard type-system reasoning almost independently of the article.

### What worked
- All six questions could be given a shape-preserving answer, which suggests the quiz is answerable in outline by a prepared reader.
- Questions 4 and 6 (signed bounds check, linear grant) are fully determined by general knowledge; no article dependence at all.

### What didn't work
- My first pass at `answers.md` was mis-numbered: I produced seven entries for six questions because I split the section 9.4 answer (the fact, the discards, the reason no cross-iteration memory is needed) into two paragraphs numbered 3 and 4. I detected it while re-reading the file against `quiz.md` and rewrote the whole file rather than patching numbers, so that every answer-to-question mapping is now explicit.
- I could not list the directory: the available tools are `read`, `write`, `edit` only, and `read` on a directory returns `EISDIR: illegal operation on a directory, read`. I therefore do not know whether other materials (a draft, notes, prior student answers) exist in this directory.

### What I learned
- The task design makes "I cannot know this without the article" the expected answer for two of six questions; the remaining four are calibrated to be reachable, which is probably deliberate — a fully unanswerable quiz would not tell the editor anything.
- Restating the constraint an answer must satisfy is more useful to an editor than guessing a confident-sounding fake, so the unknowable answers describe the invariant (e.g. "the conversion is the identity on ASCII so the bug hides until tabs or wide glyphs appear") rather than fabricated section content.

### What was tricky to build
- Distinguishing "I know this generally" from "I know this about *their* codebase" throughout: for example, the three discarding events in a flow-sensitive analysis are standard (write, unknown call, control-flow join), but whether *their* section lists the loop back-edge as a separate third event or folds it into the join is unknowable. I stated the general triple and explicitly marked the article-specific detail as unverifiable.
- Same difficulty in question 1: replacing an `Int` with an enum often changes nothing in emitted code, so the interesting consequence is not "the code gets faster" but "the checker moves an error earlier and codegen can drop an unreachable default arm". Getting that the *right* answer is subtle rather than obvious required reasoning about enum layout, not recall.

### What warrants a second pair of eyes
- Answer 1 asserts that enum substitution leaves generated code essentially unchanged except for exhaustive-switch simplification. If the article actually makes a representation change (tag width, niche packing, a jump table replacing an if-chain), my answer is wrong in its central claim even though its confidence is only 2.
- Answer 2's list of four coordinate systems is a guess at a well-known class of bug; the real answer may name systems I did not list at all (for example a bidirectional rope cursor versus a flat offset).
- Answer 5's two arena rules are my reconstruction; the second rule is the load-bearing one, and if the article's first rule is actually about alignment or monotonic allocation only, the answer has the right subject and the wrong content.

### What should be done in the future
- Provide the article text (or an excerpt of sections 9.2–9.4) so questions 1, 2, 3 and 5 can be graded for correctness rather than for plausibility.
- If the point of the exercise is calibration, compare my confidence values against the article's actual content: answers 1, 2 and 5 should be scored low, answers 4 and 6 high, and any mismatch is a sign that the quiz does not signal where its knowledge lives.

### Code review instructions
- Start at `answers.md` and check numbering against `quiz.md` one-to-one; there must be exactly six entries.
- Verify every answer is followed by exactly one `Confidence: N` line with N an integer from 1 to 5 inclusive.
- Read `answers.md` for whether each claim is labelled as knowledge or inference; the labelling, not the correctness, is what this step can be held to.

### Technical details
- Files touched: `answers.md` (created, then rewritten once), `diary.md` (this file). `TASK.md`, `quiz.md`, `diary-format.md` read only.
- Confidence distribution: 2, 2, 3, 4, 3, 4 — mean 3.0; two answers below 3, two at 4, none at 1 or 5.
- Tooling constraint: no directory listing available; `read` on `.` fails with `EISDIR`.

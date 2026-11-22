## Step 1: Answering the quiz on "Safety by Construction" without the article

I was asked to act as a student reader and answer six quiz questions about an article on running
native code without trusting it, using only what I already know and can reason out, then record
the work in this diary. I read `TASK.md`, `quiz.md` and `diary-format.md`, wrote `answers.md` with
one numbered answer per question and a `Confidence:` line after each, and wrote this entry. I did
not have the article, so several answers are explicitly reconstructed rather than recalled.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md`: read the quiz, answer
every question from prior knowledge and reasoning into `answers.md` with confidence ratings, write
this diary entry in the prescribed format, and finish with the single line `DONE`.
**Inferred user intent:** The editor wants to see how legible and self-contained the article's
questions are — which ones a reader can answer from general compiler knowledge and which ones
depend on facts only present in the text. That distinction is the useful signal for editing.
**Commit (code):** N/A — no repository commit was requested or made.

### What I did
- Read `TASK.md` (instructions), `quiz.md` (six questions), `diary-format.md` (required entry
  format).
- Attempted to list the working directory by reading it; the read tool returned
  `EISDIR: illegal operation on a directory, read`, so I worked from the three known filenames.
- Wrote `answers.md`: answers 1–6, each two to five sentences, each followed by `Confidence: N`.
- Wrote this file, `diary.md`.

### Why
- Per the task, I answered from reasoning first and declared ignorance only where the question
  depends on article-specific facts (the exact identity of section 7.6's two techniques, the exact
  stack-bound formula, which of the three safety properties the loader comment addresses).
- I kept the "I cannot know this without the article" sentence literal where required, so the
  editor can grep for exactly the questions that are under-specified in the text.
- Confidence ratings were assigned by evidence type: structural derivation from language rules
  (high), standard compiler practice (medium), guesswork about the article's own terminology (low).

### What worked
- Questions 2 and 3 could be answered from first principles with reasonable confidence: if the
  language requires definition-before-use, the call graph follows definition order, so it is
  acyclic, mutual recursion is impossible, and a stack bound exists as a sum over an acyclic
  callee relation.
- Question 4 also fell out cleanly from standard practice: an empty `while (true)` is a hang in
  native code and a terminal budget trap under fuel; fuel bounds time but gives no continuation.
- Question 6's structure (static proof of properties hardware cannot express vs. hardware
  enforcement independent of checker correctness) is a standard complementary-arguments framing
  and needed no article.

### What didn't work
- I could not enumerate the directory: `read .` failed with `EISDIR: illegal operation on a
  directory, read`. Recovery: I assumed no other input files exist and proceeded with the three
  filenames named in `TASK.md`. If the directory holds additional fixtures (e.g. an excerpt, a
  section list, a glossary), my answers are missing that context and questions 1, 3, 5 and 6
  suffer directly.
- No compiler, test suite or command was run, so none of the behavioural claims in `answers.md`
  are empirically verified; they are predictions about a system I have not seen.

### What I learned
- The quiz is written as if the reader has the article: three of six questions ("which of the
  three safety properties", "the two quantities that are summed", "the two memory-safety
  techniques in section 7.6") refer to enumerated lists by reference, not by content. Those are
  unanswerable without the text and are the ones most likely to need inline restatement.
- The article's three safety properties are probably memory safety, bounded execution, and
  capability/interface confinement — inferable only because questions 4, 5 and 1 each seem to
  target one, but this is my reconstruction, not a recollection.

### What was tricky to build
- The main ambiguity was question 3's "two quantities". A per-function bound has the form
  `frame(f) + max(bound(callee))`, i.e. own frame size plus worst callee bound; the alternative
  reading is "sum of the frames along the deepest call chain", which is the same quantity
  unrolled. I gave the first as primary and noted the second, because the article's own wording
  decides between them and I could not check it.

### What warrants a second pair of eyes
- Question 1: whether "a contract, not a wall" is meant as a capability statement or as a
  statement about relying on the compiler (i.e. trust in code generation). I chose the capability
  reading at confidence 2; the editor should confirm against the actual comment.
- Question 5: I assumed the two techniques are "compiler-emitted bounds checks" and "hardware
  region confinement (MPU/PMP)". If section 7.6 instead pairs bounds checks with, say, tagged or
  capability memory, my "why the other does not confine the access" reasoning would need
  redrafting.

### What should be done in the future
- Restate the enumerated lists (three safety properties, two summed quantities, two techniques in
  7.6) inline in the quiz, or mark those questions as "article-dependent" so a reader does not
  produce a plausible but wrong reconstruction.
- Re-run this exercise with the article available and diff the answers against it; the diff is the
  direct measure of how much the questions rely on unstated text.

### Code review instructions
- Files to review: `answers.md` (six answers plus confidence lines), `diary.md` (this entry).
- Validation: confirm `answers.md` has exactly six numbered answers, each two to five sentences,
  each followed by `Confidence: N` with N in 1–5; confirm this entry contains every heading from
  `diary-format.md`.

### Technical details
- Inputs read: `TASK.md`, `quiz.md`, `diary-format.md`. No other files were found or opened.
- Confidence assignments: Q1 = 2, Q2 = 4, Q3 = 3, Q4 = 4, Q5 = 3, Q6 = 3.
- Questions answered with an explicit "I cannot know this without the article" clause: 1, 3, 5
  (and 6 partially, where the two technique names are unknown).
- Claims asserted about the system under discussion are predictions, not observations; nothing was
  compiled or executed.

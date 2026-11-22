## Step 1: Answering the quiz on "Why Whole-Program Inference Costs Minutes" without the article

I read `TASK.md`, then `quiz.md` and `diary-format.md`. The task is a blind read: six questions about an
article I have not been given, answered from reasoning alone, each with a confidence number, plus this
diary entry. I wrote `answers.md` with one numbered section per question, marked explicitly where an
answer depends on facts only the article could supply.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered instructions in `TASK.md`: read the quiz, answer
all questions into `answers.md` with confidence lines, write this diary in the `diary-format.md` shape,
then reply `DONE`.
**Inferred user intent:** The editor wants a measurement of how much of a teaching article a careful
reader can reconstruct from the quiz alone — i.e. which claims are inferable from general compiler
knowledge and which are article-specific — before publication.
**Commit (code):** none — no repository or commit was available in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (no other files were consulted; no web access used).
- Wrote `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a03-pre/s2/answers.md` with six numbered answers of 2–5 sentences and a `Confidence: N` line each.
- Wrote this `diary.md`.

### Why
- Answered from first principles (IEEE-754 rounding, abstract-interpretation widening, nested
  fixpoint arithmetic, tiered-compilation design) rather than guessing article prose, so that the
  editor can see which parts of the chapter are self-supporting and which are load-bearing detail.
- Chose to state "I cannot know this without the article" only where genuinely necessary (Q5, and
  partially Q2/Q4), and in those cases still supplied the shape the answer must take, per the task.

### What worked
- Q3 is fully derivable and I am confident in it (Confidence 4): `max + 2 = 2^53 + 1` is not
  representable as a double and rounds to nearest even `2^53`, so `(max+2) - max = 1`; int64 arithmetic
  gives 2. This also pins down what the range proof in the article must be proving — safe-integer range
  for every intermediate.
- Q1, Q2, Q6 were answerable in outline: whole-program fact flow changing an untouched function's code
  (Q1); per-pass growth `[0,0] → [0,1] → [0,2]` then widening to a coarse top with fixpoint on the
  following pass, cost = lost precision (Q2); interpreter as Self's fast tier, missing hot-code trigger
  and deoptimisation (Q6).
- Q4's `1 + 6 = 7` reading (initial analysis plus one re-analysis per round) fits the numbers cleanly.

### What didn't work
- No failures in the sense of commands or tests; there is nothing executable here. The concrete
  limitation: I could not verify any number against the article, so every figure I state is either
  arithmetic I did myself (Q3) or a reconstruction (Q4's 95, Q2's pass index).

### What I learned
- The quiz is written so that the *structure* of the argument survives without the text, but the
  measurements do not: section 3.5's evidence (Q5) is not recoverable at all.
- Confidence ordering in my answers is: Q3 (4) > Q1/Q2/Q6 (3) > Q4 (2) > Q5 (1). If the editor wants a
  sharp picture of reader uptake, those are the numbers to look at.

### What was tricky to build
- Distinguishing "I know this from general knowledge" from "this can only come from the article". Q2
  and Q4 mix both: the mechanism is general, the pass count and the fixpoint row are article facts.
  I resolved it by giving the mechanism concretely and flagging the specific table entry as unknown,
  rather than refusing the whole question.

### What warrants a second pair of eyes
- Q4: my `1 + 6 = 7` explanation is a hypothesis. If the article instead counts one analysis per round
  plus a final verification, the arithmetic reads differently and the "95" decomposition changes.
- Q6: I assumed the handheld's fast tier is the existing interpreter and that the missing piece is
  hot-code detection plus deoptimisation/OSR. If CJI already has an interpreter-compiler split, the
  gap may instead be profiling only.

### What should be done in the future
- Compare `answers.md` against the real article to score the blind answers, especially the Q2 pass
  index and the Q4 decomposition, which are the two places a reader is most likely to invent detail.
- If this exercise is repeated, ask the quiz to state the table rows in the question so Q2 and Q4 are
  answerable rather than reconstructed.

### Code review instructions
- Read `answers.md` top to bottom; check that each section has 2–5 sentences and a `Confidence` line,
  and that "I cannot know this without the article" appears only in Q5 (plus qualified in Q2/Q4).
- No build or test commands apply; this directory contains only the task, quiz, format and the two
  files I wrote.

### Technical details
- Files written: `answers.md`, `diary.md`.
- Answer confidences: Q1 = 3, Q2 = 3, Q3 = 4, Q4 = 2, Q5 = 1, Q6 = 3.
- Key derivations used: IEEE-754 spacing 1 in `[2^52, 2^53]` and 2 in `[2^53, 2^54]`, round-half-to-even
  (Q3); abstract-interpretation iteration with widening to top and fixpoint one pass after widening
  (Q2); nested fixpoint cost `rounds × analyses × passes` over a whole-program call graph (Q4);
  Self's tiered compiler with invalidation and on-stack replacement (Q6).
- Article title under test: "3. Why Whole-Program Inference Costs Minutes"; section anchors referenced
  by the quiz: 3.1, 3.2, 3.5.

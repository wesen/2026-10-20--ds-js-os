## Step 1: Answering the quiz blind, to test what the article actually carries

I was asked to act as a student reader testing an unpublished teaching article without being given
the article itself: only `quiz.md`, `TASK.md` and `diary-format.md` were present. The point is to
find out which questions are answerable from general reasoning about sandboxing and compiler
design, and which ones only the text can settle — those are the places where the article has to do
real work rather than restate what a careful reader already thinks.

I read all three files, answered all six questions in `answers.md` with a confidence number each,
and wrote this entry. I did not modify `quiz.md`, `TASK.md`, `answers.md` after the fact, or
`diary-format.md`. No commands were run and no web lookup was attempted (the prompt forbids it).

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow `TASK.md`: read `quiz.md`, answer every question from prior
knowledge into `answers.md` (2–5 sentences, numbered, `Confidence: N` after each), then write
`diary.md` in the format of `diary-format.md`, and finish with the single line `DONE`.
**Inferred user intent:** Get a baseline of what a reader can reconstruct *without* the article, so
the editor can tell which explanations the article genuinely supplies and which it leaves to the
reader's inference.
**Commit (code):** N/A — no repository commit was made.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory.
- Wrote `answers.md` with six numbered answers of 3–5 sentences each, each followed by
  `Confidence: N` (values 2, 3, 3, 4, 3, 3).
- Wrote this `diary.md`.

### Why
- Answering from reasoning rather than guessing names forces me to mark the boundary explicitly:
  where I only reproduce a plausible design, I said so instead of inventing the article's
  vocabulary.
- I kept the questions' order and numbering so the editor can diff my answers against the article
  section by section.

### What worked
- Q4 (`while (true)`, fuel) was answerable from first principles and I answered it at confidence 4:
  a pure spin loop with no preemption wedges the machine; a fuel counter converts it into a bounded
  run that traps and yields control; and fuel bounds time but does not schedule completion.
- Q2 (mutual recursion excluded by definition-before-use, call graph follows definition order and
  is therefore acyclic) was reconstructible at confidence 3, including what the compiler would have
  to add for forward references: a whole-program cycle check and forward signatures.
- Q6 was answerable at the level of *kind*: a verifier reaches properties hardware cannot express
  (termination, stack bounds, import discipline) at zero runtime cost; PMP with user mode is
  independent of the compiler being correct.

### What didn't work
- No failures observed; nothing was executed, so there are no diagnostics to report.

### What I learned
- The questions themselves leak a lot of the article's structure: three safety properties, a
  native loader with a call table, compile-time stack accounting, a fuel counter, and exactly two
  memory-safety techniques in section 7.6. That let me answer by triangulation rather than memory.
- The leak is also a trap. Several answers depend on the article's exact terms and claims — the
  *names* of the three properties (Q1), whether "the contract" is enforced by the compiler alone or
  jointly with the verifier (Q1), the exact pair of summed quantities in the stack bound (Q3), and
  the identity of the two techniques in 7.6 (Q5). In those places I named the shape of the answer
  and flagged it rather than asserting the terminology.

### What was tricky to build
- The hard part was distinguishing "a fact I can derive" from "a design choice I am guessing".
  Q3 is the clearest case: the fixed-point/maximum-over-callees form of the stack bound is forced
  by the no-recursion property, but *which* two quantities the article sums (frame size plus
  deepest callee chain, versus frame size plus something else such as saved-register slots) is not
  forced at all — I stated the version the reasoning compels and marked it confidence 3.
- Q1 needed a judgement call: I ruled out the memory-safety property because a list of names cannot
  stop a computed jump, and assigned it to the authority/interface property. That inference is only
  as good as my guess about what the three properties are.

### What warrants a second pair of eyes
- Whether my Q1 mapping is right: the phrase "contract, not a wall" is exactly the kind of line the
  article uses to make a precise point, and my reading may be the opposite of the intended one (for
  instance the article may argue the list *is* a wall because the loader never resolves anything
  else, and that the interesting part is that the wall is at the loader, not at the CPU).
- Q5: if the two techniques in 7.6 are not "compiler-inserted bounds checks" plus "PMP region
  confinement" but, say, "typed IR" plus "region isolation", my answer explains the right principle
  under the wrong labels.

### What should be done in the future
- Re-run this quiz with the article supplied, and diff: any question where my confidence-2/3 answer
  conflicts with the text marks a passage the article should tighten or a fact it assumes.
- Have the editor confirm the vocabulary used in Q1, Q3 and Q5 so the answers can be checked for
  substance rather than wording.

### Code review instructions
- Read `answers.md` and check each `Confidence:` line against the corresponding question; the
  intended signal is the *pattern* (all of it reconstructible except terminology and section
  specifics), not the individual sentences.
- No validation commands; no code, no tests, no build.

### Technical details
- Files touched: `answers.md` (created), `diary.md` (created). Read only: `TASK.md`, `quiz.md`,
  `diary-format.md`.
- Constraints honoured: answers written before any article text was available; 2–5 sentences each;
  `Confidence: N` with N in 1–5; diary in the prescribed section format.

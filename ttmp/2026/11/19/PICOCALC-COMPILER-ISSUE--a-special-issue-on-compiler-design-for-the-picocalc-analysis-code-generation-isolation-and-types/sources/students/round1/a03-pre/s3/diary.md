## Step 1: Pre-article quiz attempt on "Why Whole-Program Inference Costs Minutes"

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and confirmed that the article itself is not
present in this directory (`article.md` and `context.md` both return ENOENT). I then answered all six
questions in `answers.md` from prior knowledge of whole-program type/range inference and of Self's
two-compiler design, marking explicitly wherever the question asks for a fact only the article holds.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md`: read the quiz, answer it
without the article, record a diary entry in the required format, and finish with `DONE`.
**Inferred user intent:** Test whether a reader with compiler background but no access to the text
can reconstruct the article's argument, and use the confidence marks to show where the article's
specific numbers and names are load-bearing for comprehension.
**Commit (code):** N/A

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`.
- Attempted `context.md` and `article.md` to check whether any source material was supplied; both
  ENOENT, consistent with the task's premise.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences and followed by `Confidence: N`.
- Wrote this entry in `diary.md`.

### Why
- The task is deliberately a blind read; guessing at section numbers or inventing measured
  figures would make my answers look better and be useless as feedback to the editor. Stating
  "I cannot know this without the article" plus the required shape of the answer tells the editor
  whether the prose depends on cited data or on reasoning a reader can supply.
- Confidence was set by evidence available to me: mechanism-level questions (1, 2, 3) rest on
  standard dataflow/JS semantics, so 4; the six-round count and the ablation numbers (4, 5) are
  article-specific, so 3 and 2; the Self comparison (6) is 3 because the Self half is documented
  knowledge but the handheld-side names are guesses.

### What worked
- Questions 1, 2, 3 and 6 could be answered structurally: the change-`half`-changes-`scale`
  phenomenon, iterate-then-widen on a loop head, `+` overloading/double representation, and the
  fast-compiler/slow-compiler split with deoptimization are all reconstructible from general
  compiler knowledge.
- Every answer states its own confidence, and the two weak ones (4 and 5) say plainly which facts
  are missing.

### What didn't work
- `read article.md` → `ENOENT: no such file or directory`. Same for `context.md`. No recovery
  attempted beyond these two probes: the task says the article is not given, so absence is the
  expected state, not a fault to fix.

### What I learned
- The quiz's questions are almost all mechanism questions with one or two anchored numbers
  ("six rounds", "section 3.5 measurement"). That is a good sign for the article: a reader who has
  never seen it can still follow the argument, provided the numbers are presented as evidence for a
  mechanism rather than as the mechanism itself.
- My guesses about component naming on the handheld side were the shakiest part, which suggests the
  article probably introduces at least one term (the analogue of Self's fast compiler) that has to be
  defined on first use or the comparison section will not land.

### What was tricky to build
- Not applicable in the engineering sense; the tricky part was answering question 2 without inventing
  intervals. The resolution was to answer in the form "narrow on visit one, one back-edge step per
  visit, widening to a coarse bound later" and to name the cost (lost precision → overflow checks /
  boxed arithmetic / fallback path) instead of the digits.

### What warrants a second pair of eyes
- Question 5: if the article's ablation actually removes something other than range analysis — for
  instance if it disables whole-program inference entirely rather than just the interval domain —
  then my attribution to type propagation and specialization construction is aimed at the wrong
  target and the editor should treat that answer as unreliable.
- Question 6: whether the handheld's existing interpreter really is the intended analogue, or whether
  the article points at a separate baseline code generator, changes the answer's first half.

### What should be done in the future
- Re-run this same quiz after reading the article and diff the two answer sets; the gaps will show
  exactly which sentences carry information a first-time reader cannot supply.

### Code review instructions
- Read `answers.md` for the six answers and confidence marks; read `quiz.md` alongside to check that
  each answer is numbered to match and that no answer silently asserts an article fact.
- Verify the claim that the article is absent by reading `article.md` in this directory.

### Technical details
- Files written: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Answer shape per question: 2–5 sentences, then a line `Confidence: N` with N ∈ {1..5}.
- Concepts used: map/monotone dataflow with widening over loops; whole-program type inference as a
  fixpoint over the call graph; JS `+` as double arithmetic plus string concatenation with
  `valueOf` side effects; Self's fast-then-optimizing compiler pairing with hotness feedback and
  deoptimization/on-stack replacement.

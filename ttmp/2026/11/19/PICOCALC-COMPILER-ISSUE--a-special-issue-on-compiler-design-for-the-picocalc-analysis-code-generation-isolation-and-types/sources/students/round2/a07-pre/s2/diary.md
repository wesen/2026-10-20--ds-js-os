## Step 1: Answering the pre-publication quiz without the article

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and confirmed by trying `article.md` that no
copy of the article exists in this directory — the quiz is meant to be answered cold. I wrote
`answers.md` with one answer per question, 2–5 sentences each, a `Confidence` line after each, and
an explicit "I cannot know this without the article" wherever the answer hinges on the chapter's own
vocabulary or numbers, followed by the reasoning that constrains what the answer must be.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four steps in `TASK.md`: read `quiz.md`, answer all six
questions blind into `answers.md` with per-answer confidence, write `diary.md` in the
`diary-format.md` format, and finish with the single line `DONE`.
**Inferred user intent:** The editor wants a measurement of what a reader can reconstruct from the
questions alone, so the gap between my answers and the real article shows which questions leak their
answer and which depend on material the reader has not seen.
**Commit (code):** N/A — no repository, no commits available in this session.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (the only files needed).
- Attempted `read article.md`; it returned ENOENT, which confirms the article is deliberately absent.
- Wrote `answers.md` with answers 1–6, each ending in a `Confidence: N` line.
- Wrote this `diary.md`.

### Why
- Answering before reading the article is the point of the exercise; I did not try to locate the
  chapter elsewhere in the repository tree, per the instruction to work only in this directory.
- I separated "what I know" from "what the article must say" instead of inventing section numbers,
  function names or counters I have never seen.
- Confidence was kept low (2–3) because every question names sections 7.4–7.6 of a text I have not
  read; a 4 or 5 would misrepresent the evidence.

### What worked
- Questions 2, 3, 5 and 6 are answerable in shape from compiler theory: the DAG call graph implied
  by definition-before-use, the frame + max-over-callees stack recurrence, the "verifier sees code,
  hardware sees an address" asymmetry, and the standard static-analysis vs. MPU trade-off.
- Question 5's asymmetry ("which one still confines, why does the other accept") is self-describing
  enough that only one assignment of the two techniques fits.

### What didn't work
- `read article.md` → `ENOENT: no such file or directory` for
  `.../a07-pre/s2/article.md`. Recovery: treated the absence as intended and answered blind.
- No filesystem listing tool is available in this session, so I could not enumerate the directory to
  prove there is no differently named draft; I inferred it from the task wording.

### What I learned
- Several questions are answerable structurally but not terminologically: I could say what a
  "contract, not a wall" must mean, but not which of three unnamed safety properties it is filed
  under.
- The device context (PicoCalc, RP2350 with Hazard3 RISC-V cores) makes "PMP with user mode" a
  concrete option alongside a software verifier, which strongly suggests section 7.6 compares a
  static checker with hardware region protection plus privilege separation.

### What was tricky to build
- Question 4 is the hardest to reconstruct: "subtracting 1 at each back-edge" versus "a larger
  amount" admits at least two readings (iteration budget vs. work budget; or charge-1 as the cheap
  default vs. charge-body-cost as the precise option). I stated the reading that makes both halves
  meaningful and bound termination to the counter, and left the call-charging rule explicitly
  hedged.
- Question 1 required guessing the triple of safety properties; I named memory safety, bounded
  time/stack and confined authority, and flagged the guess.

### What warrants a second pair of eyes
- Whether the "larger amount" in 7.5 is a per-loop cost or a per-call cost into the reactor — my
  answer may have merged two distinct charges.
- Whether the loader's function list is described as concerning authority or isolation; the verdict
  in answer 1 flips depending on which property the article intends.

### What should be done in the future
- When the real article is available, diff `answers.md` against it and mark each answer right,
  wrong, or right-for-the-wrong-reason; questions 1 and 4 are the ones most likely to be wrong on
  terminology while right on spirit.

### Code review instructions
- Compare `answers.md` against `quiz.md` for question coverage (six answers, six `Confidence`
  lines) and against sections 7.4–7.6 of the article once available.

### Technical details
- Files written: `answers.md`, `diary.md`.
- Confidence distribution: 1 question at 3 for the definitional-adjacent items (2, 3) and 4 at 2
  (1, 4, 5, 6); none at 1 or 5.
- Answering assumption: single-pass compiler with definition-before-use, frame = locals + temporaries
  + peak operand stack, and a fuel-style budget decremented at back-edges.

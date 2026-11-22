## Step 1: Answer an article quiz blind and record the investigation

The task was to sit in for a student reader by answering a six-question quiz about an article on
compile-time strategy ("6. When to Compile: Caches, Load-Time Generation and Tiers") that was
deliberately withheld, then to record the process. I read `TASK.md`, `quiz.md` and `diary-format.md`,
confirmed the working directory contained no article text, answered all six questions in
`answers.md` with per-answer confidence, and wrote this entry.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the numbered instructions in `TASK.md`: read `quiz.md`, answer
every question into `answers.md` (2–5 sentences each, numbered, with a `Confidence: N` line), write
`diary.md` in the `diary-format.md` shape, and finish with the single line `DONE`.
**Inferred user intent:** Test whether the article is self-contained and teachable by measuring what
an uninformed reader can reconstruct from question wording alone, and where the article must supply
facts.
**Commit (code):** N/A — no repository or commit was used; files were written directly.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory.
- Attempted to enumerate the directory for an article file; none is present, and no shell tool was
  available, so the only inputs were the three files above.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences, each followed by `Confidence: N`.
- Wrote this `diary.md`.

### Why
- Answering blind is the point of the exercise, so I did not search for the article or for the
  Picocalc compiler sources; I reasoned from general knowledge of tiered compilation, atomic
  two-slot installs, and Franz & Kistler's slim binaries.
- I kept the "I cannot know this without the article" phrasing wherever a question names a specific
  number or a specific field, then stated what the answer would have to look like, so the editor can
  see the difference between a derivation and a guess.

### What worked
- Q2 (two-slot write ordering) and Q4 (slim binaries / WebAssembly) are reconstructible with
  reasonable confidence, because the ordering constraint and the size-versus-load-time trade-off
  follow from the design itself rather than from the article's measurements.
- Q1 and Q3 were answerable in *shape*: Q1 because a missing toolchain field implies a derived digest,
  Q3 because the arithmetic form of a break-even is forced even without the figures.

### What didn't work
- I could not retrieve or verify any figure from section 6.5 or 6.6. No article file exists in this
  directory, so Q3, Q5 and Q6 could not be answered numerically; Q6 in particular is a pure guess
  between plausible bases (duplication vs. code-only, or uncompressed vs. compressed) and is marked
  `Confidence: 1`.

### What I learned
- The question set encodes a lot of the article's structure: WebAssembly is the portable intermediate
  form, "turns" are the session unit over which compile cost is amortized, and Editor is the running
  example whose native image is measured against a memory ceiling and against its WebAssembly size.
- The two-ratio question in 6.6 only makes sense if there is a stated reason the ratios differ, which
  means the article probably explains the duplication or measurement basis explicitly.

### What was tricky to build
- Choosing how to phrase answers that must be honest about ignorance while still being useful. The
  solution was a fixed pattern: disclaim in the first clause, then describe the constraint that pins
  the answer down, so a wrong guess is visibly a guess and a right one is visibly derived.
- Assigning confidence: I reserved 3 for answers where the mechanism is forced by the design, 2 where
  the mechanism is plausible but the article could differ in detail, and 1 for the two-ratio question
  where multiple readings are equally consistent with the wording.

### What warrants a second pair of eyes
- Whether Q1's "field that covers them" really is a digest/ABI-identifier rather than, say, a
  reactor-provided capability set; and whether Q6's two ratios are duplication-based (my guess) or
  optimization- and compression-based. Both should be checked against sections 6.1 and 6.6.

### What should be done in the future
- Re-run this same quiz with the article supplied and diff the two answer sets; the delta is the
  clearest measure of how much the article actually teaches versus how much the question wording
  leaks.
- If the article intends Q3 to be checkable arithmetic, section 6.5 should print the two figures
  (extra native compile cost, per-turn saving) so a reader can do the division without hunting.

### Code review instructions
- Review `answers.md` for the 2–5 sentence bound and the presence of a `Confidence: N` line directly
  after each of the six answers; review `diary.md` against the section headings in `diary-format.md`.
- No build or test commands apply; validation is by reading the two files.

### Technical details
- Inputs: `TASK.md`, `quiz.md`, `diary-format.md`. Outputs: `answers.md`, `diary.md`.
- Answer/confidence map: Q1 → 2, Q2 → 3, Q3 → 2, Q4 → 3, Q5 → 2, Q6 → 1.
- Handling for unknowable items: literal string "I cannot know this without the article" followed by
  the form the answer must take.

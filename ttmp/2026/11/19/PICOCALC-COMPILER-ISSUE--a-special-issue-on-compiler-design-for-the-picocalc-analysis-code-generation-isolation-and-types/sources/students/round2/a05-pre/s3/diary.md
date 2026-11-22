## Step 1: Answering a blind quiz about code generation from a stack machine to a register machine

I was given only a quiz, not the article it tests, so this step is a calibration exercise: read the
six questions, answer them from general compiler knowledge, and mark clearly which parts require
facts from the missing text. I worked only inside this directory and did not consult the web. I
produced `answers.md` with six numbered answers, each two to five sentences and each followed by a
`Confidence: N` line, and I am recording the process here.

### Prompt Context
**User prompt (verbatim):** "Read `TASK.md` and carry out every step in order."
**Assistant interpretation:** Follow the five numbered instructions in `TASK.md`: read `quiz.md`,
answer all questions from prior knowledge into `answers.md` with per-answer confidence, write
`diary.md` in the format of `diary-format.md`, then reply with a single line `DONE`.
**Inferred user intent:** The editor wants a measure of what a reader can reconstruct without the
article, so the gaps and the confidence numbers are as useful as the answers themselves.
**Commit (code):** n/a — no repository state was changed beyond the two output files.

### What I did
- Read `TASK.md`, `quiz.md` and `diary-format.md` in this directory.
- Wrote `answers.md` with answers to all six questions, each with a `Confidence:` line.
- Wrote this `diary.md` in the prescribed section layout.

### Why
- The two translation questions (1 and 2) are answerable from first principles, so I worked them
  out concretely: one store per push and one or two loads per pop gives roughly 10 instructions for
  the naive backend, versus 3 for the lazy compile-time operand stack.
- For questions 3, 4, 5 and 6 I marked explicitly that the section-specific content is unknowable
  without the article, and then stated what shape the answer must take. Inventing a table value or a
  section quote would have made the calibration useless.
- I chose to keep the answers to the requested length rather than writing a full essay, since the
  task fixes two to five sentences per answer.

### What worked
- Questions 1 and 2 went cleanly: the instruction counts follow from the stated design (explicit
  operand-stack slots at offsets 8 and 12 versus lazy constants and locals), so the comparison
  "about one third of the naive code" is defensible.
- Question 6 was answerable in kind even without the section: liveness across the back edge and
  strength reduction are the standard things a per-operation translator cannot see.

### What didn't work
- No commands failed; no tool errors were observed. The main obstacle was structural: `quiz.md`
  references sections 5.3, 5.5, 5.8 and 5.9 of an article that is not present in this directory, so
  four of the six questions could not be answered factually. I did not attempt to guess the missing
  numbers, and I flagged each such answer with confidence 1 or 2.

### What I learned
- The questions that survive without the text are exactly the ones that ask about mechanism rather
  than measurement: what the backend emits and why, and what a single-pass translator structurally
  cannot see. The questions that fail are the ones that lean on the article's own table and on its
  enumeration of special cases, which suggests the article carries real empirical content in 5.3 and
  5.8 that a reader could not otherwise supply.
- The scale of my uncertainty: confidence 1 on the two "name the cases" / "compute the KiB"
  questions, 2 on the branch-shape measurement and the loop, 3 on the translation counts, where the
  count is forced by the design but the exact mnemonic choice is not.

### What was tricky to build
- Answering question 1 required inventing a plausible instruction sequence, since the quiz gives
  offsets but not the article's register conventions. I resolved this by keeping the count
  parameter-free — one materialise-plus-store per push, loads plus an arithmetic instruction plus a
  store per binary operation — so the answer stays true under any reasonable encoding. The same
  applies to question 2, where the "3 instructions" figure depends on folding the constant into
  `add eax,1` rather than materialising it.

### What warrants a second pair of eyes
- Whether my guessed two cases in question 3 match the article's actual two cases; the article's
  pair may well be "the value is the block's single use" and "the value is already in the location
  the successor expects", or something about terminal positions rather than dead values.
- Whether question 1's expected count is 10 or a different number under the article's own emitted
  code; an off-by-two here would be a fair criticism, since the offsets suggest a specific stack
  layout.

### What should be done in the future
- Re-run this quiz against the reader who has the article in hand, and diff the two answer sets to
  find which sections are genuinely informative and which merely restate what a reader could infer.
- If a calibration study is intended, supply the article's tables as data so that questions 4 and 5
  can be checked rather than deferred.

### Code review instructions
- Start with `answers.md`: check the instruction counts in answers 1 and 2 item by item against the
  offsets given in the quiz, and check that every answer has exactly one `Confidence:` line.
- Compare this file's structure against `diary-format.md`; every section heading is present.

### Technical details
- Output files: `answers.md` (6 numbered answers, 6 confidence lines) and `diary.md`.
- Design points used in the answers: explicit operand-stack slots cost one store per push and one or
  two loads per pop; lazy constants and lazy locals let a `get`/`const` pair vanish into a single
  `mov`/`add` pair; a per-operation translator has no liveness or loop information, hence no
  cross-edition register residency and no strength reduction.
- No measurements, table values or section quotations were available to me, and none were invented.

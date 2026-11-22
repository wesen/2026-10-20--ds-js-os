## Step 1: Answering the section-3 quiz without the article

I was given `TASK.md` in this directory with a six-question quiz about an article, "3. Why
Whole-Program Inference Costs Minutes", that I do not have. I read `quiz.md` and `diary-format.md`,
answered all six questions in `answers.md` from general reasoning about whole-program type and
range inference, marked the places where the answer depends on a table, number or named component
that only the article contains, and recorded a confidence score per answer.

The intent of the exercise looks like a teaching check: find out which parts of the article are
carried by the prose (a reader can reconstruct them) and which parts are carried only by the
artifact — the visit-by-visit range table, the section 3.5 timing, and the name of the component
standing in for Self's first compiler. Those three are precisely where I had to write "I cannot
know this without the article".

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow `TASK.md` literally: read `quiz.md`, answer every question in
`answers.md` with 2–5 sentences plus a `Confidence:` line, then write `diary.md` in the
`diary-format.md` layout, then reply with the single line `DONE`.
**Inferred user intent:** Produce honest, unassisted student answers so the editor can see which
questions test comprehension and which depend on facts only the article supplies.
**Commit (code):** N/A — no repository commit was made or requested.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (all in the current directory).
- Wrote `answers.md` with six numbered answers, each 3–5 sentences and each followed by a
  `Confidence: N` line.
- Fixed one typo ("gener ated" → "generated") in `answers.md` with a single targeted edit.
- Wrote this `diary.md` in the full investigation-entry format.

### Why
- Answers had to be written before any access to the article so the measurement stays clean;
  I did not look outside this directory, per the instruction to work only inside it.
- Each answer states the mechanism first and the consequence second, because the quiz asks
  "explain why" and "what does that imply" as separate clauses.
- Where the article is required, the answer says so explicitly and then describes the *shape* the
  answer must take (growing loop range then a jump to the lattice top; a before/after timing whose
  residual is still of the same order; a first compiler that runs code immediately). That keeps the
  guess falsifiable instead of smuggling in an invented fact.

### What worked
- Questions 1, 3 and 4 were answerable from reasoning alone with reasonable confidence (3, 4, 3):
  shared constraint nodes explain the `half`/`scale` coupling, `+` overloading plus double
  semantics explains the missing integer add, and fixed-point iteration explains the need for a
  sixth specialization round.
- The article's structure is legible from the questions alone: 3.1 separately-compiled functions
  are invalidated, 3.2 a range table with widening, 3.3 a JavaScript arithmetic example, 3.4 the
  Agenda specialization rounds, 3.5 an attribution measurement, 3.6 a comparison against Self.

### What didn't work
- No failures observed. No shell tool is available in this session, so nothing was executed; I
  verified `answers.md` only by re-reading the written content, and `diary.md` likewise.

### What I learned
- The quiz's real discriminator is not "can you explain inference" but "did you look at the
  numbers". Questions 2, 5 and 6 cannot be closed without the artifacts, and I flagged them rather
  than inventing ranges or timings.
- Self's two-compiler design (simple compiler first, optimizing compiler in the background with
  on-stack replacement and deoptimization) is the reference frame the whole article assumes; the
  handheld's problem is that the same split exists but without the concurrency and the safety net.

### What was tricky to build
- The tension in the instructions: give a best guess, but never state an unknown as fact. My
  resolution was to write "I cannot know this without the article", then reason about the
  constraint the answer must satisfy, keeping concreteness out of the parts that need the article
  (no invented ranges such as `[0,3]`, no invented timings).

### What warrants a second pair of eyes
- Answer 6: I guessed that the existing JavaScript interpreter plays the role of Self's fast first
  compiler and that CJI lacks background compilation / on-stack replacement. If the article names a
  different component (a bytecode interpreter, or the previous tier of the CJI pipeline itself),
  that answer is wrong in its first clause, not just in detail.
- Answer 1: I offered two possible coupling mechanisms (shared polymorphic node vs. shared shift in
  inline/representation decisions). The article almost certainly picks one.

### What should be done in the future
- If these answers are to be scored, keep them as the unassisted baseline and compare against a
  second pass made after reading section 3; the delta will show which sections under-explain.
- Consider marking in `quiz.md` which questions require the tables/measurements, since those are
  guaranteed to be unanswerable cold.

### Code review instructions
- Start with `answers.md`: check that every numbered question has a `Confidence:` line and 2–5
  sentences, and that questions 2, 5 and 6 contain the "I cannot know this without the article"
  caveat.
- Then check this file against `diary-format.md` for section coverage.
- No commands to run; this is prose only.

### Technical details
- Files written in this directory: `answers.md`, `diary.md`.
- Format constraints applied: answers numbered as `## 1.` … `## 6.`; each answer 3–5 sentences; each
  followed by `Confidence: N` with N ∈ {2,3,4}.
- Not attempted: any search outside the directory, any web access, any invented measurement.

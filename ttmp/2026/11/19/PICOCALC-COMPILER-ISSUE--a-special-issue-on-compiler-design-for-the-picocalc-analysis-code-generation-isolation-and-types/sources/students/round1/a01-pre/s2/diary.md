## Step 1: Blind pre-reading pass over the compiler-design quiz

I was asked to act as a student reader testing a teaching article before publication, but the
article itself — "1. The Machine, the Mission and the Vocabulary" — was deliberately withheld; only
`quiz.md` was supplied. I read the six questions, wrote an answer to each in `answers.md` from
general reasoning about a single-address-space, single-core device with many isolated "worlds", and
attached a confidence number to every answer. I was able to give real reasoning for all six, but
could not name any of the article's own vocabulary, so every answer carries the "I cannot know this
without the article" caveat and confidence stays at 2–3.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." TASK.md reads: "You
are a student reader helping an editor test a teaching article before it is published. Work only
inside this directory. Do not search the web. 1. Read `quiz.md`. It contains questions about an
article you have NOT been given. 2. Answer every question from what you already know and can reason
out. Write the answers to `answers.md`, numbered like the questions. Two to five sentences each. If
a question depends on facts you cannot know without the article, say 'I cannot know this without
the article' and then give your best reasoning about what the answer would have to look like.
3. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain). 4. Write
`diary.md`: one step, in the format of `diary-format.md`, recording what you did, which questions you
could answer and which you could not, and why."
**Assistant interpretation:** Perform a pre-publication clarity test of the article by answering its
quiz ahead of reading it, then document the attempt in the required diary format.
**Inferred user intent:** Find out which questions are answerable from the surrounding context alone
and which ones genuinely depend on the article's own definitions, so the editor knows where the
text needs to carry more weight.
**Commit (code):** N/A — no repository commit; documents only.

### What I did
- Read `TASK.md`, `quiz.md`, and `diary-format.md` in `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round1/a01-pre/s2`.
- Confirmed the directory contained no article file to read (only the three task documents), so the
  pass was genuinely blind.
- Wrote `answers.md` with six numbered answers, 2–5 sentences each, each followed by `Confidence: N`.
- Recorded this single step in `diary.md`.

### Why
- Answering before reading is the only way to test whether the article's vocabulary is discoverable
  from the quiz and from prior knowledge, which is the editor's actual question.
- The instruction to state "I cannot know this without the article" up front, before the reasoning,
  keeps the reader from mistaking a plausible guess for recalled fact.

### What worked
- Questions 1, 5, and 6 were answerable in shape: cooperative scheduling on a shared single core, a
  message chain from application to display driver, and bytecode-versus-typed-machine-code as the
  product distinction (confidence 3 each).
- Questions 2, 3, and 4 were answerable only as constraints — the answer must differ per engine, must
  be type information declared outside the function body, and must be a build-layout difference —
  since the specific names, numbers of worlds, and build inventory live only in the article.

### What didn't work
- No failures observed. I could not verify any answer against the source text, because the source
  text is not in the working directory by design. Everything in `answers.md` is reasoning, not
  reporting, and must be treated that way by the editor.

### What I learned
- The quiz is heavily dependent on the article's private vocabulary: engine names, world names, and
  the CJI acronym are not inferable, so questions 2, 4, and 5 are effectively tests of whether the
  reader read the text, not of whether the concepts are self-evident.
- Six questions spanned three categories: mechanism (1, 5), quantitative interpretation (4, 6), and
  compiler-interface detail (3). Question 4 is the most fragile — a byte count alone rarely has a
  single cause.

### What was tricky to build
- The tension between "answer every question" and "do not invent article facts". I resolved it by
  describing the shape the answer would have to take (per-engine verdict, out-of-body type
  information, message chain) rather than asserting named entities, and by keeping confidence at 2
  wherever the answer depended on names I had not seen.
- Question 6 mixes two different cost models (JIT-style compile-and-go versus whole-program
  optimization); comparing 37 ms with 523–1475 s directly would be a category error, so the answer
  separates them.

### What warrants a second pair of eyes
- Whether question 4's "one reason" is actually stated in the article or is an inference the article
  leaves to the reader; if the latter, the question may be unfair as written.
- Whether `countUnit` in question 3 is a function whose two missing facts are indeed globals and
  object shapes as I guessed, or something else entirely (e.g. the size of an integer type, or the
  interface of a host builtin).

### What should be done in the future
- Re-read `answers.md` against the article after it arrives, and mark which guesses were right; that
  difference is the real measure of how much the article has to carry explicitly.
- If the editor wants a cleaner signal, add a control quiz for readers who have read the article.

### Code review instructions
- Start at `answers.md`; every answer should open with either a claim or the "I cannot know this
  without the article" sentence, and every answer must be followed by a `Confidence:` line.
- Cross-check `quiz.md` for six questions and `answers.md` for six matching sections.

### Technical details
- Files written: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Constraints in force: work only inside the student directory; no web access; the article is not
  available and must not be reconstructed as if it were.
- Answer/confidence summary: Q1 shape-known (3), Q2 names-unknown (2), Q3 names-unknown (2),
  Q4 cause-unknown (2), Q5 names-unknown (2), Q6 product distinction reasoned (3).

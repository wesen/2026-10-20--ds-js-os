## Step 1: Answering a quiz about an article I was not given

I read `quiz.md` and `diary-format.md`, then answered all six questions from prior knowledge and
reasoning alone. Two questions could be answered in general terms only; one of them depends on a
function body I have never seen, so it is explicitly marked as unknowable without the article.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the instructions in `TASK.md`: read the quiz, answer every
question into `answers.md` with a confidence rating, write this diary entry in the required format,
and finish with the single line `DONE`.
**Inferred user intent:** Test whether a reader without the source article can still produce
plausible answers, and to have the gaps and guesses recorded honestly for the editor.
**Commit (code):** N/A — no repository commits were made.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (all in the current directory).
- Wrote `answers.md` with six numbered answers, each 2–5 sentences, each followed by
  `Confidence: N`.
- Wrote this `diary.md`.

### Why
- The task is explicitly a blind-reader exercise, so I did not search the web and did not look for
  the article elsewhere on disk; only the local directory was used.
- Where a question hangs on a fact I cannot derive (the body of `nextIndex`), I said so plainly and
  then described the shape the answer must take, rather than inventing code.

### What worked
- Q2 (what a call summary is), Q3 (plain SSA loses the branch predicate; gated SSA / SSI restore it),
  Q5 (local checking and its consequences for a small machine) are general compiler knowledge and
  could be answered directly, with confidence 4.
- Q4 (iterate only over cycles/back edges; solve acyclic code in dependency order once) was
  answerable in outline; confidence 3 because the article's exact ordering may differ.
- Q6 was answerable at the level of "static types give unboxed representations and static dispatch,
  so the peephole-pass compiler does not need to rediscover them"; confidence 3 because I am
  generalising from the Static TypeScript work rather than from this article's text.

### What didn't work
- Q1 could not be answered concretely: I do not know `nextIndex`'s body, so I cannot state which
  expression is the first argument of `clamp`. I recorded both likely cases (identity → [5,7],
  `x+1` → [6,8]) but did not present either as the answer.
- No command-line failures: no builds or tests were run for this step.

### What I learned
- The quiz is written for a reader who has the article; several questions ("for the function
  `nextIndex` in section 4.1", "much faster than an interpreter") are anchored to specifics that are
  invisible from the questions alone.
- Without the text, the reliable answers are the ones about mechanism (summaries, SSA forms,
  fixpoints, locality); the unreliable ones are the ones about this article's particular examples and
  measured claims.

### What was tricky to build
- The boundary between "reason it out" and "guess". For Q1 the honest position is that the jump
  function is computable in principle but not from the given material, because the jump function is
  determined by the argument expression, which lives in the missing source. I kept the reasoning
  explicit and the confidence low (2) so an editor can tell the difference between my inference and
  the article's statement.

### What warrants a second pair of eyes
- Whether the article defines "jump function" exactly as I assumed — a map from the caller's value
  to the callee's parameter value, applied to an interval — and whether it uses "summary" to mean a
  reusable input-to-output relation. My answers lean on those readings.
- Q6: my claim that the win comes from representation and dispatch rather than from optimisation
  passes is an inference from similar compilers, not a quotation.

### What should be done in the future
- Give the reader the article (or at least the body of `nextIndex` and the section 4.1 text) if Q1
  and Q6 are meant to be answerable concretely; otherwise mark those questions as
  comprehension-of-article items so a blind reader is not scored on them.

### Code review instructions
- Check `answers.md` top to bottom for numbering (1–6), sentence counts, and the presence of one
  `Confidence: N` line after each answer.
- Validate the last line of this step is the single word `DONE` in the chat reply, not in a file.

### Technical details
- Terminology used in the answers: jump function `J` such that the callee's first parameter receives
  `J(x)`; interval range as an inclusive `[lo, hi]` pair; gated SSA / pi-nodes / SSI as the extended
  SSA families that name a value per branch outcome; dependency-order solving as a topological sweep
  with fixpoint iteration restricted to strongly connected components (loops, mutual recursion).

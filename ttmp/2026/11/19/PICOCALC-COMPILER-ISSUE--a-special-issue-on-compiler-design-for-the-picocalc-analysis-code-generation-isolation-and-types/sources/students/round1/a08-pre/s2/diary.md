## Step 1: Answering a quiz for an article I was not given

**User prompt (verbatim):** "Read TASK.md and carry out every step in order."

I read `TASK.md`, `quiz.md` and `diary-format.md`, then wrote `answers.md` with one numbered answer per
question, each followed by a `Confidence:` line, and this diary entry. No article text was available in
the directory, so every answer is reasoning from the terms in the questions themselves rather than
reading comprehension of the source.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the local task instructions and execute the four steps: read the
quiz, answer it from prior knowledge into `answers.md` with confidence ratings, write a formatted
diary entry, and reply with the single line `DONE`.
**Inferred user intent:** Test whether a reader without the article can still produce a plausible,
self-aware reading of a compiler-design article's quiz, and whether the reader flags its own
uncertainty instead of inventing article-specific detail.
**Commit (code):** none — no repository commit was requested or performed.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (all in the current directory).
- Wrote `answers.md`: six numbered answers, 2–5 sentences each, each with a `Confidence: N` line.
- Wrote this `diary.md` following the entry format from `diary-format.md`.
- Did not search the web, per the reading constraints.

### Why
- The quiz is answerable in two layers: (a) the general mechanism (token + `state` tag + saved live
  variables, fixed storage, no reentrancy) which is standard hand-rolled async/await machinery, and
  (b) the article's specific choices (local names, literal `state` numbers, the exact live/dead split
  in `openFile`), which cannot be recovered without the text.
- I therefore split each answer into the invariant the answer must satisfy plus the parts I cannot
  know, rather than guessing concrete names.

### What worked
- Questions 3, 5 and 6 were answerable from the terminology alone: "defunctionalized continuation" =
  tag plus environment dispatched by a `switch`; fixed-address state implies a single static instance
  and hence no concurrent/second instance; a wait is a reentrancy point so automatic insertion can
  break atomicity and force unplanned live-variable saves.
- Confidence ratings: 4 for Q3, 3 for Q1/Q5/Q6, 2 for Q2/Q4.

### What didn't work
- No failure occurred, but a real limitation: I had no way to list the directory (only `read`/`write`/
  `edit` are available), so I could not confirm whether an article file or earlier chapters exist in
  this folder that would have made Q2 and Q4 answerable exactly.

### What I learned
- The quiz's phrasing ("justify `stop`", "three possible values of the `state` field") shows the
  article uses a hand-written switch-based resumption scheme with a small, fixed number of suspension
  points, not a general coroutine runtime — which is consistent with a no-heap, no-recursion embedded
  language.
- The advice against automatic waits only makes sense if waits are cheap only at points the
  programmer has already made safe, which matches the fixed-token, one-instance design.

### What was tricky to build
- Distinguishing "dead because its last use precedes the wait" from "not live because it is itself
  part of the token" for `stop`. The defensible reading is the former: `stop` is consumed at the
  suspension decision and no post-wait path reads it, so it needs no field.

### What warrants a second pair of eyes
- Answers 2 and 4 (Confidence 2) contain guesses about structure only. A reader with the article
  should check: the exact live set at the second wait, and whether the three `state` values are
  numbered 0/1/2 with 0 meaning "start".
- Answer 5 asserts "no recursion, one instance per function"; if the article's language permits
  multiple instances via an explicit pool of tokens, the fixed-address claim would need a different
  justification (one token per instance, allocated per object rather than per function).

### What should be done in the future
- Provide the article (or at least the `openFile` source fragment) alongside the quiz, so the
  article-specific questions can be graded rather than only reviewed for plausibility.

### Code review instructions
- Nothing to build or run. Review `answers.md` for the six answers and their confidence lines, and
  `diary.md` for format conformance to `diary-format.md` (all sections present).

### Technical details
- Files touched: `answers.md` (new), `diary.md` (new).
- Answer lengths: 4–5 sentences each; confidence distribution: 4×1, 3×3, 2×2.
- Unknowable-without-article items, flagged with the required phrase: Q2 (live set, `stop`) and Q4
  (literal `state` values).

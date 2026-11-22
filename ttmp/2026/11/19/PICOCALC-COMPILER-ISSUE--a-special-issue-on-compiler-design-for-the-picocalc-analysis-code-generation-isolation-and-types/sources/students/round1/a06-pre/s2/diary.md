## Step 1: Answering the section 6 quiz without the article

I was asked to act as a pre-publication student reader: read a quiz about an article I was not given,
answer every question from prior knowledge and reasoning alone, mark each answer with a confidence
score, and then record the session. I read `TASK.md`, `quiz.md` and `diary-format.md`, answered all six
questions in `answers.md`, and wrote this entry. The interesting part was keeping the two kinds of
answer separate: general compiler/cache reasoning that I can actually defend, and the specific numbers
and citations that exist only inside the article.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the workflow described in `TASK.md`: read `quiz.md`, answer every
question in `answers.md` with confidences, then write `diary.md` in the `diary-format.md` shape, and
finish with the single line `DONE`.
**Inferred user intent:** The editor wants a blind read of the quiz to find out which questions can be
answered from a competent reader's background knowledge and which are unanswerable without the text —
i.e. which questions leak or depend on article-specific facts (figures in 6.5, Franz and Kistler's
reasoning, the section 6.3 input list, the name of the handheld's portable form).
**Commit (code):** N/A — this directory is not a git working tree as far as this step is concerned; only
markdown artefacts were produced.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (in that order, plus the second two in one batch).
- Wrote `answers.md` with six numbered answers, each two to five sentences, each followed by
  `Confidence: N`.
- Wrote this `diary.md` following the full entry format.
- Did not read any file outside this directory, and did not search the web.

### Why
- Answering blind is the point of the exercise; looking for the article elsewhere would defeat the test
  the editor is running.
- I used the explicit escape hatch "I cannot know this without the article" for q3, q4 (partially) and
  q5 rather than inventing numbers, and then still gave the reasoning that constrains what the answer
  must look like, since the task asks for both halves.
- Confidence scores were assigned by separating (a) structural arguments I can derive, from (b) claims
  that would require the article's measurements or wording.

### What worked
- Q1, q2 and q6 were answerable from general knowledge of build caches and two-phase persistence:
  cache validity is a function of all inputs including compiler identity; write-the-record-last gives a
  commit point so a torn cache degrades to a miss; per-function caching still needs a link/patch and a
  record rewrite because the changed body's address and size propagate.
- Q4's *reason* was recoverable from what I know of the Franz–Kistler slim-binaries work (space bought
  at the price of decode time), even though I could not verify how the article frames it.

### What didn't work
- Q3 and q5 are unanswerable as stated. Both require the numeric figures from section 6.5 ("compute how
  many turns", "what are the two memory figures that show it"), and I have no access to them. I could
  only supply the formula `turns = (C_native − C_slim) / s` and the shape of the memory comparison; the
  actual arithmetic and KB values were left blank on purpose rather than guessed.
- I could not name the article's term for the form that plays the slim binary's role on the handheld. My
  best guess is the typed compiler's portable intermediate representation, but that is a guess at
  naming, not knowledge.

### What I learned
- The quiz is written so that three of six questions (1, 2, 6) test transferable design reasoning and
  three (3, 4, 5) test recall of article-specific evidence. If the goal is to check whether a reader
  engaged with the text, the second group does that; the first group can be passed without the text,
  which is worth knowing before publication.
- A concrete, honest way to be graded on unanswerable questions is to state the invariant the answer
  must satisfy: repayment period is a ratio of extra compile cost to per-turn saving, and native-code
  pressure is a resident-bytes-versus-available-bytes comparison.

### What was tricky to build
- The ordering constraint in q2 is the subtle part. It is tempting to write the record first because the
  record is what the loader looks for, but that inverts the failure mode: a record naming a module that
  does not exist (or is half-written) is a correctness bug, whereas an unreferenced module blob is only
  wasted space, recoverable by a sweep. So the module-then-record order is what makes a power loss
  between the writes land on the safe side — the device finds an orphan module and no valid record, and
  the cache entry must be treated as cold.
- For q6 the tempting-but-wrong answer is "nothing else, since no signature changed". Signature
  stability removes the need to recompile the 119 other bodies and their callers, but not the need to
  relocate the new body and refresh the module record, because addresses and the module hash did change.

### What warrants a second pair of eyes
- Whether the section 6.3 input list really includes the compiler's own source/identity as a graded
  input, or only a version string; and whether it also includes target ABI, flags, and any runtime or
  prelude that is linked in. My q1 answer depends on that list, and I assumed a superset.
- Whether the article's cache invalidation on a firmware update is by compiler hash, by version bump, or
  by simply clearing the cache partition on update. The third possibility would make q1's answer "no,
  but for a blunter reason".
- Whether the per-function cache in q6 is described as requiring a full module relink or only a
  patched-in trampoline; my answer assumes relocation and record rewrite.

### What should be done in the future
- When the article is available, check my three low-confidence answers (q3 = 2, q4 = 2, q5 = 1) against
  section 6.5 and the Franz–Kistler discussion, and fill in the real numbers.
- Consider whether q3/q5 should carry the figures in the question text if the quiz is meant to be
  answerable by a reader who has skimmed, or keep them as a check that the figures were actually read.

### Code review instructions
- Read `answers.md` top to bottom; each item is self-contained and the `Confidence:` line is the last
  line of that item.
- Read `quiz.md` alongside to confirm one-to-one numbering (1–6) and that no question was skipped.
- This diary was written against `diary-format.md`; check that all sections are present and in order.

### Technical details
- Cache correctness rule used in q1: a cache entry is valid only if every input that influenced the
  output bytes is unchanged; the typed compiler's own source is such an input, so a firmware update that
  changes the compiler invalidates every entry it produced.
- Commit-point rule used in q2: module bytes first, record last; power loss between writes leaves an
  orphan module (safe, sweepable) and no valid record, so the next load treats the module as a miss.
- Break-even formula used in q3: `turns_to_repay = (C_native − C_load_time) / saving_per_turn`; caching
  moves the extra cost from per-load to once, so repayment is amortised across sessions.
- Per-function invalidation used in q6: 1 of 120 bodies recompiled, 119 bodies and all callers reused,
  but relocation of the new body plus a module-record rewrite (size, hash, entry addresses) is still
  mandatory.
- Unverifiable items, flagged as such in `answers.md`: the section 6.5 figures (q3, q5), the article's
  rendering of Franz and Kistler's justification, and the article's name for the handheld's portable
  load-time form (q4).

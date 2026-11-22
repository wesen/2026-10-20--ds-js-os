# Investigation entry

## Step 1: Answering a pre-publication quiz without the article

I was asked to act as a student reader testing a teaching article before publication, working only
inside `s2/`. The directory contains `TASK.md`, `quiz.md` and `diary-format.md` but no article. For
the article "2. Measuring Before Optimizing" I answered the six questions in `answers.md`, one
number per question with a `Confidence:` line, from general reasoning about profiling, Amdahl's law,
boot-path measurement and cost-per-token accounting. No answer that required a table cell, a world
name or a reported millisecond value could be given as fact, and each of those is opened with
"I cannot know this without the article" before I speculate about the required shape of the answer.

The split was clean: none of the six questions was answerable as stated, but three of them
(2, partly 4 and partly 6) contain enough internal structure to derive the arithmetic or the logic
regardless of the missing numbers, and those are the ones where I could say something that stays
true whatever the article says. The remaining three (1, 3, 5) are pure retrieval — a table boundary,
a named world, a specific validation check — where any confident-sounding answer would be invention.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the three numbered steps of `TASK.md`: read `quiz.md`, write
`answers.md` answering every question with a confidence rating, then write `diary.md` in the
`diary-format.md` format, and finally reply with the single line `DONE`.
**Inferred user intent:** Test whether a reader with no access to the source article produces
honest, calibrated answers — the editor wants to see where the quiz is answerable from general
knowledge (a bad question, or a fair inference question) and where it silently depends on facts only
the article supplies.
**Commit (code):** none — no repository commit was made in this step.

### What I did
- Read `TASK.md` in full, then `quiz.md` and `diary-format.md` before writing anything.
- Confirmed no article file was present by attempting to read the directory itself (it returned
  `EISDIR: illegal operation on a directory, read`, i.e. no listing was available and no article was
  among the named files).
- Wrote `answers.md` with six numbered answers, each 3–5 sentences and each followed by
  `Confidence: N` (N from 1 to 5).
- Wrote this diary entry as a single step in the `diary-format.md` schema.

### Why
- The task explicitly withholds the article, so the only defensible method was to separate
  "derivable from the question's own internal logic" from "retrievable only from the article" and
  label the second kind out loud rather than dressing up a guess as an answer.
- Question 2 and question 6 are arithmetic/definition questions in disguise: Amdahl's ceiling is
  `1/(1-share)` and marginal-vs-average cost is a definition, so I gave those as formulas with a
  worked illustration instead of a number. That is more useful to the editor than a fabricated
  percentage, because the editor can drop the real numbers in and check the reasoning.
- Confidences were kept at 1–2 deliberately. Everything above 2 would have implied access to
  measurements I do not have; a 5 here would be miscalibration, not confidence.

### What worked
- The question text itself carried useful constraints: question 1 says the interval ends at "first
  response" and that something is still waited for afterwards, which rules out "first response =
  ready"; question 4 says *two* numbers, which forces one about cost and one about frequency or
  heap pressure; question 6 says *two* per-token costs for the same compiler, which forces a
  marginal/average or compile/execute split.
- Writing the answer shape as a formula (`T_app/T_total`, `1/(1-share)`) means the answers remain
  checkable once the real figures are substituted.

### What didn't work
- No measurement, no article text and no shell access were available, so nothing could be verified
  against a source. `read` on the working directory produced
  `EISDIR: illegal operation on a directory, read` rather than a file listing; I did not work around
  this, since the task already states the article was not given.
- Attempting to name the "largest world" in question 3 or the validation check in question 5
  produced nothing but plausible-sounding filler, which I discarded rather than shipping.

### What I learned
- A quiz written against a specific article is mostly unanswerable without it, and the honest answer
  is largely a statement about what the missing artifact must contain. The exercise is a calibration
  test as much as a comprehension test.
- Several questions leak their own answers' structure (the "two numbers" and "two costs" phrasings),
  which is worth knowing when judging question quality: a reader with no article can reconstruct the
  *form* of the answer but never the *values*, so those questions are good at catching bluffing and
  poor at measuring comprehension of the argument.

### What was tricky to build
- The hard boundary was refusing to let a derived formula slide into a fabricated number. For
  question 2 I had to keep "share = `T_app/T_total`" strictly separate from any concrete percentage,
  and for question 3 keep "defer the dominant world's work off the boot path" labelled as the likely
  change rather than the reported one. Mixing the two is exactly the failure mode this exercise is
  designed to detect.

### What warrants a second pair of eyes
- Whether questions 1, 3, 4, 5 and 6 are intended as recall or as inference. If the intent is
  inference, the article needs the relevant table row or figure to be inferable from the question
  text; as written, five of six require facts that exist only in the article, which will make the
  whole set unscoreable for a reader who has not read it.
- My guesses about "world" (question 3) and the Experiment 2 validation check (question 5) are the
  weakest items in `answers.md` and should not be read as claims about the article's content.

### What should be done in the future
- If this quiz is meant to work pre-publication, pair it with a short excerpt or accept a scoring
  rule that credits "identifies what information is missing plus the correct answer shape".
- Re-run the same quiz after the article is supplied; comparing the two passes would separate
  comprehension from calibration.

### Code review instructions
- Files to read: `answers.md` (six numbered answers, each terminated by a `Confidence:` line) and
  this file. Compare against `quiz.md` question by question.
- Validation: check that every question number 1–6 appears exactly once in `answers.md`, that every
  answer is followed by `Confidence: N` with `1 <= N <= 5`, and that no answer asserts a specific
  article number (ms, percentage, world name) as fact.
- No build or test commands apply; this step produced prose only.

### Technical details
- Answer file contract: `## N. <restated question>` heading, 2–5 sentences, then `Confidence: N`.
- Derived relations used: `share = T_app / T_total`; Amdahl ceiling with infinite application
  speedup `= 1 / (1 - share)`; marginal vs average per-token cost as slope vs total/tokens.
- Environment constraints: cwd `students/round2/a02-pre/s2`; no web access; no article file present;
  `read` on a directory returns `EISDIR: illegal operation on a directory, read`.

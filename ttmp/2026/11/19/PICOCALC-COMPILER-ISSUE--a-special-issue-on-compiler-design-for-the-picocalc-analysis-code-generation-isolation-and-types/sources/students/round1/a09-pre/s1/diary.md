## Step 1: Answering a quiz about an article that was not supplied

I read `TASK.md` first, then `quiz.md` and `diary-format.md`. The directory contains only those files plus the answers I produced, so there was no article text to consult; every answer is reconstructed from the question wording, general type-system knowledge, and the section references the quiz itself drops (9.4, per-turn arena, linear `Grant`).

I wrote `answers.md` with all six questions answered in order, 2–5 sentences each, followed by a `Confidence:` line. Questions 1, 2, 4 and 6 were answerable on principle because they describe standard features (exhaustive matching, nominal newtypes, unsigned index types, linearity) whose consequences do not depend on the article's particular wording. Questions 3 and 5 depend on facts that only the article supplies — the exact fact recorded in the section 9.4 loop and the exact phrasing of the two arena rules — so I recorded "I cannot know this without the article" inline and then reasoned about what the answer must look like.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four procedural steps in `TASK.md`: read the quiz, answer it blind, add confidences, and write a diary in the given format.
**Inferred user intent:** Test whether a reader without the article can still produce useful answers, and get an honest signal about which questions are actually article-dependent.
**Commit (code):** N/A

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory.
- Attempted to list the directory (the `read` tool rejected the directory path); confirmed the only inputs present are the two instruction files and the quiz.
- Wrote `answers.md` (6 numbered answers, each with a `Confidence:` line).
- Wrote this diary entry using the format from `diary-format.md`.

### Why
- Answering blind is the point of the test, so I did not invent article quotes or fake section content.
- I used the section numbers and identifiers the quiz itself mentions ("9.4", "per-turn arena", "`Grant`", "`Unit`/`Point`") as the only ground truth available.
- Confidence numbers were set per-question rather than uniformly, because the questions differ a lot in how much they rely on the missing text.

### What worked
- Q2 and Q4 came out clean and high-confidence: equal representation erases at run time, and a signed comparison genuinely cannot prove non-negativity.
- Q1 and Q6 follow directly from the definitions of exhaustiveness and linearity, so the article's phrasing should not change them.

### What didn't work
- `read` on the working directory returned `EISDIR: illegal operation on a directory, read`. No shell tool is available, so I could not enumerate files; I recovered by reasoning from the two files I was given and assuming no third source exists.

### What I learned
- The quiz leaks substantial structure: keyed sections, a specific loop, a named linear type. That is enough to reconstruct plausible answers but not to confirm them.
- Questions that ask "state the two rules" and "state the fact" are essentially requests for verbatim article content; those are the ones an editor should treat as unanswerable out of context.

### What was tricky to build
- Q3 required guessing both what the fact is and where it dies. The hard part is the loop back-edge: the correct shape is that the fact is re-established per iteration by the condition re-check, so nothing needs to be carried around the loop. Writing that as reasoning rather than as fact was the ordering constraint.
- Q5 required separating the "no escape" rule from the "reset after last use" rule; a single sloppy sentence would have collapsed two distinct obligations into one.

### What warrants a second pair of eyes
- Q3 and Q5's confidence of 3 is a guess about the article's actual wording. If the article's section 9.4 loop tracks something other than index bounds (for example an aliasing or non-null fact), my answer is directionally right but substantively wrong.

### What should be done in the future
- Run this quiz against a second reader with the article, and diff the answers to see which questions are load-bearing for comprehension versus merely recall.

### Code review instructions
- Validate by comparing `answers.md` against the article: check Q3's "fact" and Q5's "two rules" first, since those are the only two answers that claim article-specific content.

### Technical details
- Inputs: `TASK.md`, `quiz.md`, `diary-format.md` (current working directory).
- Output: `answers.md` (6 answers, confidence 3–5), `diary.md` (this file).
- No code was executed; no tests exist in this directory.

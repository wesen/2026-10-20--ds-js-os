## Step 1: Answering a quiz for an article that was not provided

The task was to pre-test a teaching article by answering its quiz blind, then recording the process.
I read `TASK.md`, then `quiz.md` (six questions on "10. Architecture and a Roadmap"), then
`diary-format.md`. I checked for an article draft (`article.md`, `README.md`) and for pre-existing
`answers.md`/`diary.md`; none exist, and this directory contains only the three instruction files,
so the article was genuinely absent and every answer had to be reconstructed or marked unknowable.

I wrote `answers.md` with all six answers, 2–5 sentences each, each followed by a `Confidence:` line
(1–5), and this diary in the required full format. Questions 1, 2, 5 and 6 depend on article facts
(which mistake the linker check targeted, the actual five steps of §10.3, the figures in §10.1, the
predictions in §10.7) and are explicitly marked "I cannot know this without the article" before the
reasoning; questions 3 and 4 are answerable from general compiler knowledge and are not.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered steps in `TASK.md`: read the quiz, answer it blind into `answers.md`, add diary entries in `diary-format.md`'s format, reply with `DONE`.
**Inferred user intent:** Calibrate the article: find out what a reader can and cannot infer without the text, so the editor knows which points are underspecified or unguessable rather than merely hard.
**Commit (code):** none — no repository writes outside this directory, no VCS operation performed.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in that order.
- Probed for `article.md`, `README.md`, `answers.md`, `diary.md`: all `ENOENT`. Attempted `read` on `.` and got `EISDIR`, so I have no directory listing and cannot rule out other files by name I did not guess.
- Wrote `answers.md`: six numbered answers, one sentence-count-compliant block each, one `Confidence:` line each (2, 2, 4, 3, 2, 1).
- Wrote `diary.md` in this format.

### Why
- Answered from first principles rather than refusing, because the task explicitly asks for "best reasoning about what the answer would have to look like" when the article is missing.
- Marked knowability per question instead of once globally, because the six questions split cleanly into article-dependent (1, 2, 5, 6) and knowledge-dependent (3, 4), and the editor needs that split.
- Chose confidence numbers from the strength of the derivation, not from how convincing the prose sounds: 4 only where the claim is a general property of erasure-based compilation (Q3), 1 where I was inventing an example prediction to demonstrate the required form (Q6).

### What worked
- Q3 and Q4 answered without article dependence: integer truncation/wrapping and enum/sum-type materialisation for Q3; shared-front-end blindness and target-specific properties for Q4. These are checkable claims independent of the article's wording.
- The question wording carried enough structure to reconstruct the *shape* of Q1, Q2, Q5 and Q6 even without their content — e.g. Q1's "count in the header, checked by the linker" fully determines what such a check can and cannot catch.

### What didn't work
- `read` on `.` returned `EISDIR: illegal operation on a directory`, and no listing tool is available, so the only evidence that the article is absent is the `ENOENT` on four guessed filenames plus the task's own framing. If a draft exists under another name (e.g. `10-architecture.md`, `draft.md`), I missed it and the "cannot know" markers would be wrong.
- Q1, Q2, Q5, Q6 content: not recoverable. Q5 in particular cannot be answered in the terms asked ("use the figures of section 10.1") because the figures are numbers I do not have; I answered the ordering logic and stated the conditional it depends on.

### What I learned
- The quiz is unusually well-designed as a blind test: four of six questions are answerable *in form* from their own premises, which means a reader's failure on those is informative about the article's clarity, while Q3 and Q4 leak enough to be answered from general knowledge and so say little about the article.
- Writing "I cannot know this without the article" and then still producing the reasoning skeleton is different from guessing; the skeleton is what the editor can compare against the real text.

### What was tricky to build
- Deciding whether §10.3's five steps could be partly deduced. Only the split is deducible (which steps are representation-bound vs. work-bound); the enumeration is not. I resolved it by giving the deducible split and labelling the enumeration as unknown, rather than presenting a five-item list as if recalled.
- Q6 asks for "one prediction from section 10.7" — a false-precision trap. I resolved it by stating an example prediction as an example and describing the refutation/response structure the answer requires.

### What warrants a second pair of eyes
- Whether the article draft exists somewhere in this directory under a name I did not probe. Without a listing tool this is unverifiable from here.
- My Q1 claim that a count check "misses a consistently wrong count": if the linker derives the count from the symbol table rather than from a hand-written literal, that mistake is not available, and the answer would need adjusting.

### What should be done in the future
- Ship the article (or a stub with its headings) alongside the quiz; a blind pre-test is only useful when the absence is intentional and the directory contents are enumerable.
- Give readers a way to list the directory, or state that no other files exist.

### Code review instructions
- Files: `answers.md` (six answers + confidence), `diary.md` (this entry). No code, no tests, no commands beyond file reads/writes.
- Check: sentence counts within 2–5 per answer, `Confidence: N` present on every answer, and that every genuinely article-dependent claim carries the "I cannot know this without the article" marker.

### Technical details
- Answers and confidence: Q1 = 2, Q2 = 2, Q3 = 4, Q4 = 3, Q5 = 2, Q6 = 1.
- Article-dependent (marked unknowable): Q1 (which mistake the check was written for), Q2 (the actual five steps and which three are text-only), Q5 (the §10.1 figures), Q6 (the actual §10.7 predictions).
- Article-independent reasoning: Q3 (erasure requires re-materialising fixed-width integer semantics and enum/sum-type runtime representations), Q4 (a same-front-end second backend detects back-end divergence, not shared front-end error, and says nothing about target-specific properties).

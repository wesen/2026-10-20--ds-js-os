# Investigation entry

## Step 1: Answering the unread-article quiz on "Measuring Before Optimizing"

The task is a blind read: `quiz.md` asks six questions about an article that was deliberately not supplied, and I had to answer from reasoning alone, marking where the article's facts are unreachable. I read `TASK.md`, `quiz.md` and `diary-format.md` first, answered all six questions in `answers.md` with a `Confidence: N` line each, and then wrote this entry.

Two answers were fully derivable without the article. Question 2 is Amdahl's law with a 20 percent share: 1 / (0.8 + 0.2/∞) = 1.25, so 1.25× is the ceiling; that needed no source material and I am certain of it. Question 3 is arithmetic on the numbers the quiz itself supplies, 2 ms out of 559 ms being about 0.36 percent, so the interpretation follows directly — application boot code is not the bottleneck. Questions 1, 4 and 5 depend on facts only the article holds: where exactly the 2.1 interval closes, which two numbers in 2.4 refute the garbage-collection hypothesis, and which check validates Experiment 2's model. For those I said plainly that I could not know them and then argued about what shape the answer must take. Question 6 is method rather than fact, so I answered it fully from experimental-design reasoning.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, then follow its numbered steps: read the quiz, answer every question into `answers.md` with confidence ratings, write `diary.md` in the format of `diary-format.md`, and finish with the single line `DONE`.
**Inferred user intent:** Test whether the article's questions are answerable by a reader who has not seen the article — i.e. whether the questions are self-contained, fair, or leak their answers — and collect a calibration signal from the confidence ratings.
**Commit (code):** N/A — no repository commit was made; files were written directly in the working directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (in that order) in `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--.../students/round1/a02-pre/s3`.
- Wrote `answers.md` with six numbered answers, each 3–4 sentences and each followed by `Confidence: N`.
- Attempted to `read` the current directory to see whether any supporting file existed; it returned `EISDIR: illegal operation on a directory, read`, so no listing was available and no other files were consulted.
- Wrote this `diary.md` in the full format from `diary-format.md`.

### Why
- The rule "work only inside this directory" and "do not use the web" ruled out looking up the article, the project, or the PicoCalc hardware; answers had to come from the quiz text plus general knowledge.
- I kept reasoning independent of private context I happen to infer from the directory name (a PicoCalc compiler/analysis article about a CJI interpreter) and did not assert hardware or interpreter details as article facts.
- Confidence ratings were set to reflect the distinction between things I computed (5) and things only the article can state (2).
- Answering in prose-with-caveat form rather than leaving blanks preserved the diagnostic value: a wrong-but-confident answer and an honest "cannot know" tell an editor different things about a question.

### What worked
- Questions 2 and 3 were answerable with certainty from the quiz text alone: Amdahl's 1.25× ceiling, and 2/559 ≈ 0.36 percent making application-side boot optimization pointless.
- Question 6 was answerable from experimental-design reasoning: ten runs to see spread and drop warm-up artifacts, alternating order to keep monotone drift (battery, thermal, cache/filesystem state) from being charged to one configuration.
- For questions 1, 4 and 5 I could still describe the necessary shape of the answer — a lower-bound interval ending at handoff to the app, a pair of magnitude numbers (GC time and allocation/collection count) refuting GC, and an independent cross-check of the model's walk plus the admission that a model yields predicted cost, not wall-clock time.

### What didn't work
- Reading the working directory as a file failed: `EISDIR: illegal operation on a directory, read`. There is no directory-listing tool available, so I could not confirm whether the directory contained anything besides the four files named or implied by `TASK.md`. Recovery: proceeded with only the files the task told me to read.

### What I learned
- The quiz is mostly fair but not fully self-contained: four of six questions (1, 3, 4, 5) lean on section-specific numbers or definitions the reader does not have. Questions 2 and 6 stand alone as reasoning/method questions.
- Question 3 and Question 4 are structurally similar — both turn on comparing a small measured quantity to the 559 ms interval — which suggests the article's didactic core is "compare magnitudes before optimizing".

### What was tricky to build
- The hard boundary was calibrating confidence honestly. The temptation is to answer questions 1, 4 and 5 fluently because the surrounding frame (boot time on a small device, a GC hypothesis, a model walk) makes plausible answers easy to construct. I chose to name the unknowable part first and then reason about the shape, so my guess cannot be mistaken for a retrieved fact.

### What warrants a second pair of eyes
- Whether my reading of Question 1 is even in the right direction: I assumed "responds" ends at application entry or first frame and that the user then still waits for data load and full render, but the article may define the interval the other way round (ending only at an interactive screen). If so my answer inverts the article's point.
- My answers to 4 and 5 are guesses about which numbers and which check the article uses; they should not be scored as comprehension.

### What should be done in the future
- Publish the article section that defines the measurement interval (2.1) and the two refuting numbers (2.4), or quote them inside the quiz so questions 1, 4 and 5 can be graded rather than merely shape-matched.
- If this round is about question fairness, record per-question readability from several readers; one reader cannot separate "hard" from "unanswerable without the article".

### Code review instructions
- Files to inspect: `answers.md` (six numbered answers with confidence lines), `diary.md` (this entry), `quiz.md` (source questions), `TASK.md` (instructions).
- Validation: confirm `answers.md` has exactly six numbered entries, each 2–5 sentences, each followed by `Confidence: N` with N in 1..5; confirm no external sources were used.

### Technical details
- Working directory: `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round1/a02-pre/s3`.
- Files read: `TASK.md`, `quiz.md`, `diary-format.md`. Files written: `answers.md`, `diary.md`.
- Confidence assigned: Q1 = 2, Q2 = 5, Q3 = 4, Q4 = 2, Q5 = 2, Q6 = 4.
- Arithmetic used: 1/(1-0.2) = 1.25; 2/559 ≈ 0.0036 = 0.36 percent; 559 - 2 = 557 ms.
- No commands were run beyond file reads/writes; no network access; no files outside this directory were touched.

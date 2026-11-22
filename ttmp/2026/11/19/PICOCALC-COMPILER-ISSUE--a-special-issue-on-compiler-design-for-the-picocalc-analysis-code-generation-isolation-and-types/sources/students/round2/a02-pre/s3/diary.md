## Step 1: Answering a quiz about an absent article

I was asked to read a teaching article and answer six questions about it, but the directory contains only the quiz, the task, and the diary format — no article text. I read all three files, then answered each question from the reasoning each one makes available: the arithmetic of shares and speedup bounds in Q2, the logic of what a GC hypothesis requires in Q4, and the structure of a cross-validation check in Q5. Where a question needed a specific number, table entry, or world name from the article, I said so plainly, answered with "I cannot know this without the article," and then wrote what shape the missing answer would have to take.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read `TASK.md`, then follow its four steps: read `quiz.md`, answer every question in `answers.md` with 2–5 sentences and a `Confidence:` line, write `diary.md` in the format of `diary-format.md`, and reply `DONE`.
**Inferred user intent:** Test whether the quiz is answerable by a reader who has not seen the article — i.e. whether the questions leak the answers or depend on facts only the text supplies. The confidence ratings and the diary are the evidence the editor wants.
**Commit (code):** none (no repository operations performed)

### What I did
- Read `TASK.md`, `quiz.md`, and `diary-format.md` in the working directory.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences plus a `Confidence: N` line (N in 1–5).
- Wrote this `diary.md`.

### Why
- The task forbids web lookup and limits work to the current directory, so the only admissible inputs were the three files present.
- Marking exactly which parts were reasoned versus guessed keeps the confidence numbers honest and gives the editor a signal about which questions are self-contained (Q2's method) and which are pure recall of the text (Q3, Q6).

### What worked
- Q2 was fully answerable as a method: share = application time / total time, maximum speedup = 1/(1 − share), and the share is an upper limit because non-application components cannot be optimized away. This is the one question whose answer does not depend on the article's specific numbers.
- Q1, Q3, Q4, Q5, Q6 were each answerable only at the level of "what the answer would have to look like," so they are written that way.

### What didn't work
- No article was available. I could not look up the section 2.1 table, the two section 2.2 measurements, the 559 ms boot-profile breakdown, the two GC numbers in 2.4, the Experiment 2 validation check, or the two per-token costs. Recovery: state the gap explicitly in each answer rather than invent plausible-looking figures.

### What I learned
- Several questions (1, 2, 3, 6) are constructed so that a reader who understands the setup can describe the *shape* of the answer without the figures, which suggests the article's argument is about measurement discipline rather than about the particular numbers.
- Q4 is the one question where a wrong guess is most tempting: "which two numbers refute GC" invites quoting a GC-time percentage, but a GC-time percentage would support the hypothesis, so the refuting pair must be a heap-pressure figure and a collection-frequency figure.

### What was tricky to build
- Distinguishing "I can reason this out" from "I am pattern-matching a plausible-sounding chapter." The rule I applied: if the answer required a specific value, name, or table cell, it got "I cannot know this without the article" plus the constraint the value must satisfy; if the answer followed from arithmetic or from the logic of hypothesis testing, it was answered directly.

### What warrants a second pair of eyes
- Whether Q5's expected check is a cross-validation against an independently established count (my assumption) or something else entirely, such as a unit test on a known input file — these are different claims about what the script's validation buys.
- Whether Q3's "world" is really the runtime/VM world, as I supposed, or a different partition of the boot profile.
- Whether Q6's two per-token costs are phase-scoped (front end vs. full pipeline) or condition-scoped (warm vs. cold); I presented both possibilities without choosing.

### What should be done in the future
- Provide the article text alongside the quiz when running this exercise; without it, five of six answers can only be scored on plausibility, not on accuracy.

### Code review instructions
- Start with `answers.md`; verify each claim that a specific figure, table entry, or world name exists against the article's sections 2.1–2.4.
- Check the arithmetic in answer 2 (`share = A/T`, bound `= 1/(1 − A/T)`) and the GC argument in answer 4 (needs pressure and frequency, not a GC-time share).

### Technical details
- Output contract: `answers.md` has answers numbered 1–6 to match `questions` in `quiz.md`, each followed by `Confidence: N`.
- Confidence values assigned: Q1 = 2, Q2 = 4 for the method / 1 for the numbers, Q3 = 1, Q4 = 1, Q5 = 2, Q6 = 1.
- No files outside this directory were read; no network access was used.

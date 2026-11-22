## Step 1: Answering the pre-reading quiz blind, then recording the attempt

I was asked to act as a student reader testing an unpublished teaching article. The article itself was
not given to me — only `quiz.md`, six questions about it — so this step is purely an exercise in
answering from prior knowledge and inference, and in being honest where the answer is unavailable. I
read `TASK.md`, `quiz.md` and `diary-format.md`, then wrote `answers.md` with all six answers, each
followed by a `Confidence:` line, and this diary entry.

The pattern that emerged is worth stating plainly: roughly half of the questions are about general
systems ideas (cooperative scheduling, sandboxed runtimes, message-passing through a display owner,
why a statically linked image is bigger than a hosted one) and I could reason those out. The other
half hang on the article's private vocabulary — the names of "the three engines", "CJI", `countUnit`,
and what exactly "hybrid" means in its taxonomy — and there guessing produces something that reads
like an answer but is not one. I flagged those explicitly rather than dressing up a guess as fact.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the instructions in `TASK.md`: read the quiz, answer it blind, write `answers.md` in the required format with confidence scores, and write `diary.md` in the format of `diary-format.md`.
**Inferred user intent:** The editor wants to see what a reader can reconstruct from the questions alone, both to test question quality (are they self-contained? do they leak answers?) and to get an honest baseline for what the article must actually teach. The confidence numbers and the "I cannot know this" admissions are the actual measurement, not a formality.
**Commit (code):** N/A — no repository commit was made in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory `…/students/round2/a01-pre/s1`.
- Wrote `answers.md`: six numbered answers, 3–5 sentences each, each followed by `Confidence: N` (N on its own line, 1–5).
- Read `answers.md` back to check formatting, then edited it to make the "I cannot know this without the article" phrasing consistent in answers 2, 5 and 6, where the first draft had only implied it.
- Wrote this `diary.md`.

### Why
- Answering blind is only useful if the answers are distinct enough that the editor can see the boundary between "known" and "article-specific". Hence the explicit split: reason the general mechanism, then name the part that requires the text.
- I kept each answer to a mechanism plus its consequence rather than listing possibilities, because a list of possibilities is unreadable as a baseline.
- Question 2 asks for three names and a per-engine safety property. A wrong but plausible triplet (typed compiler / native Editor / WebAssembly Editor) is more informative to the editor than a refusal, so I gave the triplet *and* marked the confidence at 1.

### What worked
- Questions 1, 4 and 5 were answerable in outline from general knowledge: cooperative scheduling under a single core; static linking vs. host imports as a size explanation; and message-passing to a display-owning world as the only sane path to the LCD.
- The format requirements were unambiguous: numbering like the questions, 2–5 sentences, trailing `Confidence:` line.

### What didn't work
- First draft of `answers.md` was written in one pass and had a formatting defect: answer 6's reasoning had collapsed into the same paragraph as its framing sentence, and the "I cannot know this without the article" phrase was missing or paraphrased in answers 2, 5 and 6, contrary to the task's wording. No command or tool failed; the defect was caught by reading the file back and fixed with three targeted edits in a single `edit` call.
- I initially wrote answers 1–6, then overwrote the whole file once to restructure it. That was wasteful: one write with the right structure would have done.

### What I learned
- The quiz is not self-contained and does not appear to leak its answers either: without the article, three of six questions resolve only to "the answer must be some named thing plus a property that follows from the isolation model".
- Question 4 (710 KiB vs 528 KiB against a 768 KiB limit) is the question most likely to be answerable straight from the article's own table and least answerable from outside it — the numbers are given but the reason is not, so it is a good test of whether the article actually *explains* the difference or merely reports it.

### What was tricky to build
- The hard part is the boundary discipline: it is easy to slide from "here is the mechanism such an article would describe" into "here is what the article says". The symptom in a draft is confident phrasing attached to proper nouns I invented. The fix was to attach every invented name to an explicit hedge and to put the confidence score low enough (1–2) that the editor can weight it correctly.

### What warrants a second pair of eyes
- Whether my guessed engine triplet (typed compiler, native Editor, WebAssembly Editor) matches the article's actual three, since questions 2, 4 and 6 all lean on it. If it is wrong, only question 1 survives cleanly.
- Whether answers 1 and 5 are too generic to be useful as a baseline: they describe the mechanism a reader *should* be able to induce, but they may tell the editor less than a flat "cannot know" would.

### What should be done in the future
- If this round is repeated with the article available, the same six questions should be answered again and diffed against these, so the value the article adds is visible per question.
- Consider adding to the quiz a question or two that a careful reader *can* settle from general knowledge, to calibrate the others against.

### Code review instructions
- Files: `answers.md` (six numbered answers, `Confidence:` lines 3, 1, 1, 2, 2, 2) and this `diary.md`.
- Check: each answer is 2–5 sentences; every answer has a trailing `Confidence: N` with N in 1–5; every answer that depends on article-private facts says so in the task's words.
- Validation: read `answers.md` top to bottom against `quiz.md`; there is no build or test command in this directory.

### Technical details
- Directory contents used: `TASK.md`, `quiz.md`, `diary-format.md`. No source code, no build system, no tests.
- Answer/confidence map: (1) cooperative yielding, 3; (2) three engines and fault containment, 1; (3) facts CJI needs outside `countUnit`, 1; (4) why native > Wasm in size, 2; (5) application → LCD message path, 2; (6) "hybrid" and table comparability, 2.
- Reasoning sources: general knowledge of cooperative schedulers, WebAssembly sandboxing and host imports, static vs. dynamic linking budgets, capability-based display ownership. No web access used, per the task constraints.

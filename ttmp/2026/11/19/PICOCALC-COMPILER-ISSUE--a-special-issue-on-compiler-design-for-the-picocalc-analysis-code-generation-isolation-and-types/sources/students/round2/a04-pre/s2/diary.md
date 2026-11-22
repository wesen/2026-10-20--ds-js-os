## Step 1: Answering the quiz blind, then recording how far reasoning gets

I read `TASK.md`, `quiz.md` and `diary-format.md`, confirmed the directory contains nothing else (no
article, no excerpts, no figure data), and then answered all six questions in `answers.md` using only
prior knowledge plus reasoning about what the answers would have to look like. The incentive was
diagnostic: the editor wants to know where a reader who has only the quiz can and cannot follow, so I
marked each answer with a confidence number instead of silently filling the gaps.

Outcome: three questions (2, 3, 5) were answerable in substance because they rest on general
program-analysis reasoning — parametric summaries, φ-node joins destroying correlation with guarding
predicates, and compositional/local reasoning versus whole-program fixpoints. Three questions (1, 4,
6) are pinned to the article's own artifacts: the body of `nextIndex`, a measured visit/body-analysis
split from the Agenda compile, and the specific CJI feature named in section 4.3. For those I said
plainly that I could not know them and then described the shape the answer must take.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered steps of `TASK.md`: read the quiz, answer every question in `answers.md` with a `Confidence: N` line, write `diary.md` in the format of `diary-format.md`, and reply with exactly one line.
**Inferred user intent:** Stress-test an unpublished teaching article by simulating a student reader who lacks the text, so the editor learns which questions are self-supporting and which depend on information only the article supplies.
**Commit (code):** N/A — no repository or VCS present in this directory; only three authored markdown files were read and two created.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`; listed the directory to confirm no article, appendix, or data file exists here.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences ending in a `Confidence: N` line (N = 2 for the article-pinned questions, 3 for the reasoning-only ones).
- Used the explicit phrase "I cannot know this without the article" for questions 1, 4 and 6, and then reasoned about the required form of each answer.
- Wrote this entry following the section headings of `diary-format.md`, including the sections that do not really apply to a reading task, marked N/A or qualified rather than deleted, to keep the format intact.

### Why
- The task forbids going outside the directory, so the article could not be retrieved; guessing silently would have corrupted the test, which is why every gap is stated openly.
- Confidence 3 was reserved for answers where I know the underlying analysis principle but not the article's wording or notation; 2 where the answer is essentially "the article must say roughly this"; nothing was marked 4 or 5 because none of the six has a verifiable source here.
- Considered writing a single hedging note at the top instead of per-question hedging, and rejected it: the editor needs per-question signal.

### What worked
- Questions 2, 3 and 5 have standard, well-established answers (parametric/interprocedural summaries; φ-node LUB losing the guarding predicate, with e-SSA/σ-nodes, GSA or π-nodes as the remedies; local/compositional checking with declared contracts), so those answers stand on their own merits regardless of what section 4 says.
- Answer 4's structural claim does not need the raw number: the count of body analyses is bounded by the number of distinct functions and is the only work summaries can remove, so total visits overstate the payoff.

### What didn't work
- Question 1 could not be computed at all: the numeric interval depends on which expression reaches `clamp`'s first parameter, and that expression lives in `nextIndex`, whose body is not available. Recovery: state the identity-map case explicitly ([5, 7]) and describe what changes for an affine or non-monotone argument.
- Question 6 could not be resolved: "the two families of remedy" and the specific existing CJI feature are article-internal coinages. Recovery: propose the two most plausible readings (cheap analysis vs. declared information) and name the candidates for the CJI feature (optional declared types/annotations, native signature tables, lazily compiled per-function units) rather than asserting one.
- The 11,760 / body-analysis split in question 4 is a measurement; there is no data file here to recompute it from.

### What I learned
- The quiz leaks real structure of section 4 even without the text: there is a summary notion formalized as a "jump function", a call to `clamp` inside `nextIndex`, an Agenda benchmark whose visit counts were instrumented, a discussion of why plain SSA is insufficient, and a convergence argument in 4.3 — so the article is about interprocedural range/type inference under a tight compile-time and memory budget.
- A reader without the article can still demonstrate understanding of the underlying compiler theory, which suggests the article's questions mostly test transfer rather than recall — except 1, 4 and 6.

### What was tricky to build
- The main tension is the task's request for 2–5 sentence answers versus the instruction to also say "I cannot know this". The resolution used was a two-part sentence structure: an explicit statement of the missing fact, followed by the strongest available reconstruction, so a reader of `answers.md` can separate quotation-worthy content from inference.
- A second tension: `diary-format.md` is designed for implementation work and asks for commit hashes, validation commands and code-review instructions, none of which exist for a pure reading task. Rather than falsify them, they are marked N/A with the reason.

### What warrants a second pair of eyes
- Whether my reconstruction in question 3 matches the article's actual vocabulary — the article may use "extended SSA" for one specific form (e-SSA is the most likely candidate, but GSA and π-nodes are also called extended forms), and the editor should check that the quiz is not ambiguous on this point.
- Whether my reading of "jump function" (caller-state-to-callee-entry transfer, composed with the callee summary) is the same sense used in 4.1; if the article means something narrower, question 1 may be unanswerable even with the text in hand.

### What should be done in the future
- If this blind-answer method is to be repeated, place the article in a sibling directory and give the reader an explicit prohibition, rather than relying on absence — absence also removes the ability to check whether question 1 is well-posed.
- For question 4, the article (or a small data file) should carry the visit/body-analysis breakdown, since the question tests a specific measurement and cannot be answered from reasoning.

### Code review instructions
- Start with `answers.md`: verify each of the six entries corresponds 1:1 to `quiz.md`, that each is 2–5 sentences, and that each ends in a `Confidence: N` line with N in 1–5.
- Verify the three article-dependent questions (1, 4, 6) each contain the required "I cannot know this without the article" phrasing and are not merely hedged.
- Confirm this file uses every heading from `diary-format.md` in order.

### Technical details
- Files read: `TASK.md`, `quiz.md`, `diary-format.md`. Files created: `answers.md`, `diary.md`. No network access, no files outside the working directory, no build step, no tests.
- Confidence assignments: Q1 = 2, Q2 = 3, Q3 = 3, Q4 = 2, Q5 = 3, Q6 = 2.
- Article-dependent: Q1 (needs `nextIndex` body), Q4 (needs Agenda visit/body-analysis counts), Q6 (needs section 4.3's CJI feature and the naming of the two remedy families). Reasoning-dependent: Q2 (parametric summaries), Q3 (φ-node LUB and extended SSA), Q5 (local checking and its costs).

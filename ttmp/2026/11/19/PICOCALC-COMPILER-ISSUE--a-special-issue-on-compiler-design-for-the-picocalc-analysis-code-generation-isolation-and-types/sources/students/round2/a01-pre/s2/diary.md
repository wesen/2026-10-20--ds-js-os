## Step 1: Answer the quiz cold, without the article

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and checked the working directory, which contains no article, no prior `answers.md` and no prior `diary.md`. The task is explicitly a blind test of the quiz, so I answered all six questions from reasoning about the subject matter only, marked each answer with a confidence value, and recorded this step in the required format.

The honest outcome is that the quiz is mostly unanswerable as stated, and the reason is structural rather than laziness: four of the six questions (2, 3, 4, 6) ask about proper nouns and measurements that exist only inside the article. "The three engines", "`countUnit`", "710 KiB / 528 KiB", and "Files and Agenda are hybrids" are facts about a specific program, not derivable consequences of the subject. For those I wrote "I cannot know this without the article" and then reconstructed what the answer would have to look like from general knowledge of small cooperative-scheduler systems, compiler/calling-convention requirements, and image-size accounting. Questions 1 and 5 could be answered in shape, because they ask about mechanisms (yielding instead of blocking, messages instead of shared pointers) that any such design must have.

Confidence values (2–3 everywhere) reflect that: I am confident about the form of the answers and not about their content. My guesses for question 2 (interpreter safe, WebAssembly sandboxed, native compiled engine able to corrupt the whole address space) and question 4 (native image carries its own allocator, runtime copies, padding, possibly multiple engines; WebAssembly leans on host library code) are the most likely to be wrong in naming while right in spirit. Question 6 is the weakest: "hybrid" could equally mean mixed-language, or a world that is both a service and a store entry, and the compile-time-table argument follows from whichever sense the article uses.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md literally: read `quiz.md`, answer all questions blind, give each a confidence, write a diary entry in `diary-format.md` style, finish with one line `DONE`.
**Inferred user intent:** Test whether the quiz is answerable without the article, and whether the reader signals uncertainty instead of confabulating specifics.
**Commit (code):** N/A — no repository commit was made; only `answers.md` and `diary.md` were written.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory.
- Attempted to list the directory by reading `.` (returned `EISDIR: illegal operation on a directory, read`); no directory-listing tool is available, so I inferred the file set from the task text and observed no article file.
- Wrote `answers.md` with six numbered answers, each followed by a `Confidence: N` line (N = 3, 2, 2, 2, 2, 2).
- Wrote this `diary.md`.

### Why
- Blind answering was required, so I did not look for the article elsewhere or on the web (also forbidden by the addendum).
- Where a question named an article-internal fact I said so explicitly rather than inventing engine names, symbol details or byte counts.
- Confidence numbers were kept low and uniform-ish because the article's vocabulary (CJI, "worlds", "engines", "islands") is unrecoverable from the quiz alone.

### What worked
- Questions 1 and 5: answerable at the level of mechanism. Any such device must slice long-running work and yield to a supervisor, and any isolated display service must be reached by message rather than a shared framebuffer pointer.
- Questions 2, 3, 4, 6: the "what the answer would have to look like" framing produced plausible reconstructions (isolation strength per execution mode; calling convention plus value layout as the two out-of-function facts; static-vs-hosted image size accounting; mixed code/data deferring compilation to run time).

### What didn't work
- `read` on the directory path `.` failed with `EISDIR: illegal operation on a directory, read`. Recovery: I relied on `TASK.md`'s file names and on the fact that the exercise states the article was not provided.
- No direct evidence exists in this directory for any of the named specifics, so four answers rest on analogy only.

### What I learned
- The quiz assumes a shared vocabulary ("worlds", "engines", "CJI", "hybrids") that a cold reader cannot reconstruct; an editor testing the article should expect these answers to be wrong on specifics and to prove only that the questions are article-dependent.
- Answering blind still works as a test of question phrasing: a reader can tell "this is a mechanism question" from "this is a lookup question", which is itself useful feedback for the editor.

### What was tricky to build
- The tension in instruction 2: "answer every question" versus "say you cannot know". I resolved it by always producing a substantive answer while prefacing the unanswerable ones with the exact required sentence, so the editor can separate what was reasoned from what was looked up.
- Keeping confidence honest: the temptation is to mark reasoned reconstructions as 4 because they sound coherent, but coherence is not evidence about this particular article, hence 2.

### What warrants a second pair of eyes
- Whether my guessed sense of "hybrid" (question 6) matches the article's; if it means mixed-language worlds instead of code-plus-data worlds, my comparison argument inverts.
- Whether "CJI" is a compiler or a compiler-plus-runtime concept; question 3's two facts depend on that, and I assumed a compiler that must infer types and calling conventions from program-wide information.

### What should be done in the future
- Re-answer this quiz with the article in hand, and diff against these blind answers to learn which questions actually discriminate reader comprehension from prior knowledge.
- Consider adding to the directory listing or task text an explicit statement of which files exist, since a directory listing tool is not available.

### Code review instructions
- Starting files: `answers.md` (six answers, confidence lines), `diary.md` (this entry).
- Validation: count six numbered items in `answers.md`, and check each is followed by exactly one `Confidence: N` line with N in 1–5, and that answers 2, 3, 4, 6 contain the sentence "I cannot know this without the article".

### Technical details
- Files written: `answers.md`, `diary.md`. No source code, no commits, no network access.
- Confidence distribution: one 3, five 2s; no 4s or 5s because no answer is supported by the article text.
- Directory: `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a01-pre/s2`

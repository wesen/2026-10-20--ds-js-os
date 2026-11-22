## Step 1: Answering the quiz blind, then recording what I could and could not know

I was asked to help test a teaching article by answering its quiz before seeing the article, so I read
`quiz.md` and `diary-format.md` first, then wrote `answers.md` with one numbered answer and a
`Confidence:` line per question. The quiz covers a compiler transformation that turns asynchronous
code into explicit frames with `start`/`resume` entry points, so I answered from general knowledge of
async/await lowering (C#, Rust, JS, state-machine coroutines) and marked the article-specific parts as
unknowable rather than guessing at names and code.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md: read `quiz.md`, answer every question without the
article into `answers.md` (2–5 sentences each, `Confidence: N` after each), then write `diary.md` in
the `diary-format.md` format, then reply with one line.
**Inferred user intent:** Produce a blind-reader baseline so the editor can see which questions are
answerable from the text and which leak information or depend on unstated article facts.
**Commit (code):** none — no repository commit was made in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in this directory.
- Wrote `answers.md`: six numbered answers, each 2–5 sentences, each followed by `Confidence: N`.
- Attempted to list the directory contents; the `read` tool returned `EISDIR: illegal operation on a
  directory, read`, so I did not confirm whether other files (e.g. the article) were present.

### Why
- The task explicitly forbids using the article, so reasoning from the general shape of the
  transformation was the only available method.
- I chose to state "I cannot know this without the article" on the questions that hinge on specific
  identifier names, field names and call signatures (Q2, Q3, Q4) instead of inventing them, since
  invented specifics would be worse than useless to an editor checking the article.

### What worked
- Q1, Q5 and Q6 were answerable at a conceptual level: the token/ownership idea, the
  "storage belongs to the activation not the function" argument, and the "a wait lets the world change"
  argument are all standard and the question wording pins down enough to answer.
- Q2's method is answerable even without the variable list: liveness after a wait is a
  use-on-some-reachable-path question, and I gave the criterion for justifying `stop`.

### What didn't work
- Listing the directory: `read` on `.` failed with `EISDIR: illegal operation on a directory, read`.
  No recovery was needed since the task only requires `quiz.md`, `answers.md` and `diary.md`.

### What I learned
- The quiz assumes a hand-written Editor implementation as a worked comparison against generated
  code, and a section 8.6 that argues per-task rather than per-function frame allocation. Neither
  detail is derivable; both had to be answered structurally.
- Confidence differs sharply by question: 3 for the conceptual ones, 2 for those naming exact fields
  or signatures.

### What was tricky to build
- The main difficulty is ordering/lifetime boundaries in the answers, mirroring the article's own
  subject: an answer to Q2 is only correct relative to a specific wait site, and I had to phrase it as
  "relative to the continuation", because a variable dead at the second wait may be live at the first.
- For Q4 I had to describe `resume`'s dispatch without knowing the numbering convention, so I stated
  the invariant ("every state except the initial one labels a wait site") rather than a table.

### What warrants a second pair of eyes
- Q3 and Q4: if the article really does present the tag as two named fields and `resume` as taking a
  token, my answers are close but my naming is probably wrong; an editor should check whether the
  structure I described is the one taught.
- Q5's "restriction remains" clause: I guessed static, bounded task storage with no unbounded
  recursive waiting. If the article's restriction is something else (for example, no waits inside
  loops, or a fixed frame pool), the answer is wrong in substance, not just in wording.

### What should be done in the future
- Re-answer Q2–Q4 against the actual article and diff against this baseline to see which questions
  merely test naming versus which test understanding.
- If the directory listing tool is needed again, use a shell command rather than `read`.

### Code review instructions
- Start with `answers.md`; check each answer for the required 2–5 sentence length and the presence of
  exactly one `Confidence: N` line directly after it. No build or test commands apply.

### Technical details
- Files written: `answers.md` (this step), `diary.md` (this file).
- Answer/confidence pairs: Q1 3, Q2 2, Q3 2, Q4 2, Q5 3, Q6 3.
- Constraint observed: no web access, work confined to the current directory, article not read.

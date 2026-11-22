## Step 1: Answering a quiz about an article I was not given

The task asked me to read `quiz.md`, answer every question from prior knowledge and reasoning
alone, write `answers.md` numbered like the questions with a `Confidence:` line after each, and
then record the step here in the format of `diary-format.md`. I checked the directory first for a
copy of the article (`article.md`, `section7.md`) so I would not have to guess; neither exists, and
the only readable files were `TASK.md`, `quiz.md` and `diary-format.md`.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered instructions in `TASK.md`: read the quiz,
answer it without the article, add confidence ratings, and write this diary entry; finish with the
single line `DONE`.
**Inferred user intent:** Test the quiz questions for answerability before publication — i.e. find
out which questions can be answered from the question text alone and which depend on details of
the article that a reader cannot reconstruct.
**Commit (code):** N/A (no repository operations performed)

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`.
- Probed for `article.md` and `section7.md`; both returned ENOENT, confirming the article is absent.
- Wrote `answers.md` with all six questions answered in 2–5 sentences each, each followed by a
  `Confidence: N` line.
- Wrote this file, `diary.md`.

### Why
- The task explicitly forbids the web and restricts work to this directory, so the absence of the
  article is part of the test, not an obstacle to route around.
- I chose to state "I cannot know this without the article" only where the answer genuinely hinges
  on article-specific wording (the loader comment in 7.1, the by-product in 7.4, the exact stack
  definition, the charge rules in 7.5, the two 7.6 techniques, the verifier/PMP comparison), and
  then to supply the shape the answer must have, which is what the task asks for.
- All confidence values are 2: the general reasoning is sound but every answer is anchored on a
  section I have not read, so higher values would be dishonest.

### What worked
- All six questions were at least partially reconstructable from their own wording: 1 is about
  enforcement versus documentation, 2 about static stack allocation and define-before-use, 3 about
  a recursive max-over-callees definition, 4 about a cost/fuel budget at back-edges versus calls,
  5 about a dynamic check surviving a codegen type bug, 6 about static proof versus hardware
  enforcement.
- The quiz is internally consistent: 7.4 supplies the stack need that 7.5's call charging reuses,
  so questions 3 and 4 corroborate each other.

### What didn't work
- `read article.md` → ENOENT; `read section7.md` → ENOENT. Recovery: none available by design, so I
  answered inferentially and marked the uncertainty. No other failures observed.

### What I learned
- The questions are answerable in outline without the article but not in detail: none of them can
  be answered with a verbatim definition or a number (frame sizes, toll amounts, property names).
  Questions 3 and 4 are the most article-dependent, because a "definition from section 7.4" and a
  specific charging rule cannot be guessed, only approximated.
- Question 1's phrasing ("a contract, not a wall") is the clearest signal in the quiz: it is a
  rhetorical distinction between documentation and enforcement, which is a good discriminator for
  whether a reader actually read the section.

### What was tricky to build
- The hard part was calibration: writing answers that are substantively useful (not just "cannot
  know") while not inventing article-specific facts such as the names of the three safety
  properties or the exact stack-need formula. I resolved this by phrasing the reconstructions as
  constraints ("must be", "has to be") rather than as quotations.

### What warrants a second pair of eyes
- Whether my guess for question 5 has the techniques the right way round: I assumed the static
  type checker is the one that "accepts the code" because it never sees generated code. If the
  article's two techniques are instead a verifier and a runtime tag check, both would reject it
  and the question would be malformed — worth checking against the section.
- Question 2's "what must be added" could equally be a forward-declaration pass, a two-pass call
  graph computation, or a back-patching fix-up; the answer names all three as one family.

### What should be done in the future
- If this quiz is meant to be answerable pre-reading, questions 3 and 4 should be softened: asking
  for "the definition from 7.4" cannot be answered without 7.4. If it is meant as a
  comprehension check, that is fine and the current wording works.
- Consider giving students the section titles only, so they can at least name the three safety
  properties rather than infer them.

### Code review instructions
- Files to inspect: `answers.md` (six numbered answers, each with `Confidence: N`), `diary.md`,
  and `quiz.md` for comparison. Validation is manual: confirm the numbering 1–6 matches, every
  answer is 2–5 sentences, and every answer is followed by exactly one confidence line.

### Technical details
- Answers written: 6. Confidence distribution: six answers at 2, none at 1, none at 3+.
- Explicit "cannot know" openers: questions 1, 2, 3, 4, 5, 6 — all six, each followed by a
  reconstructed answer.
- Assumed vocabulary: "typed function" = compiled, statically analysable function; "reactor
  function" = runtime/host-provided function with opaque cost; "back-edge" = loop branch;
  PMP = RISC-V physical memory protection; user mode = unprivileged execution mode.

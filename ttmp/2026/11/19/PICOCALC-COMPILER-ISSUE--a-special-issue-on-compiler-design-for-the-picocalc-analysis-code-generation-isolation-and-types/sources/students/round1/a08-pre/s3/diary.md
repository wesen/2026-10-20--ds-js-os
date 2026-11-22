## Step 1: Answering the quiz on "Asynchrony as a Compiler Transformation" without the article

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and confirmed that no article text was
present in the directory — the task explicitly says the quiz is about an article I have not been
given. I therefore answered all six questions from general knowledge of explicit-state asynchrony
(event loop, token-per-request, hand-rolled state machine) and from internal consistency between
the questions, marking every place where an article-specific identifier or number would be needed.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the three numbered instructions in `TASK.md`: read `quiz.md`,
answer every question in `answers.md` with a `Confidence: N` line each, and write `diary.md` in the
format of `diary-format.md`; then reply with the single line `DONE`.
**Inferred user intent:** Editor wants a pre-read comprehension baseline — what a careful reader can
and cannot infer from the questions alone, to see whether the quiz leaks or presupposes too much.
**Commit (code):** N/A — no repository commit was made.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--.../students/round1/a08-pre/s3`.
- Attempted `read` on the directory itself to list contents; it returned `EISDIR: illegal operation on a directory, read`.
- Attempted `read` on `answers.md`; returned `ENOENT: no such file or directory` (file did not exist).
- Wrote `answers.md` with answers 1–6, each 2–5 sentences followed by `Confidence: N`.
- Wrote this `diary.md` following the full investigation-entry format.

### Why
- The task forbids web access and says the article was not supplied, so the only defensible method
  is: answer what is structurally inferable, and label the rest as unknown-but-constrained.
- Confidence values were assigned conservatively: 4 where the concept is generic compiler/async
  knowledge (token identity, defunctionalization); 3 where I am confident of the mechanism but not
  of the article's stance (fixed-address frames, the anti-auto-wait argument); 2 where the answer
  requires the example's literal variable names or state constants.

### What worked
- Questions 1, 3 and 5 are answerable from domain knowledge alone: token as request handle, token
  fields as tag + captured environment (defunctionalized continuation), static frame justified by
  non-reentrancy/single-threaded event loop with the one-live-instance consequence.
- Questions 4 and 6 are answerable in shape: `state` must partition "fresh / suspended at wait 1 /
  suspended at wait 2" with the state stored before yielding, and the anti-auto-wait argument
  reduces to "other code runs while you are suspended and can clobber what you depend on".

### What didn't work
- I could not answer question 2 concretely. Exact live/dead sets depend on the literal `openFile`
  body, and the justification of `stop` depends on whether `stop` is a loop bound, a sentinel, or a
  state name. I stated the unknown, then gave the liveness rule that any correct answer must satisfy.
- I could not enumerate the three literal `state` values, only their required semantics.
- No file listing was available through the provided tools, so I could not verify by inspection that
  no copy of the article was sitting in the directory under an unexpected name.

### What I learned
- The quiz is heavily coupled: question 6 depends on the clobbering argument of question 5, and
  question 3's "tag" is question 4's `state` field. Answering them in order forces the reader to
  build one consistent model, which suggests the article builds one worked example and reuses it.
- The phrase "the token fields are defunctionalized continuations written by hand" plus "placed at a
  fixed address" implies the example is a hand-written explicit state machine whose token is a
  global/static struct per async function — the "manual" version of a transformation the article
  presumably then automates.

### What was tricky to build
- The hard part is calibration, not content: distinguishing "I know how this must work" from "I know
  what this article says". Underlying cause is that the vocabulary (token, fuel, wait, state) is
  project-specific shorthand; symptom is a strong temptation to invent plausible field names and
  present them as facts. Resolution: never state an identifier I have not seen, and restate the
  invariant instead of the name.

### What warrants a second pair of eyes
- Question 5's confidence of 3: my "at most one in-flight instance" answer assumes the justification
  really is absence of reentrancy. If the article justifies fixed addresses differently (e.g. by a
  whole-program static allocation scheme for all frames, with a single-threaded scheduler the only
  constraint), then the derived restriction would be weaker — one instance per *scheduler*, not per
  program. An editor should check whether the article's restriction is stated as strongly as I did.
- Question 6: I asserted the reason is interference during suspension. A competing reading is that
  the objection is about expressibility — fuel exhaustion can occur at a point where no suspension
  is representable. I hedged by giving both, which may be more than the article intends.

### What should be done in the future
- Re-answer questions 2 and 4 against the real text, specifically to replace my semantic paraphrase
  of the `state` values with the article's literal constants and to name the actual live/dead
  variables at the second wait.
- If this baseline is meant to measure leakage, compare my inferred model against the article to see
  which questions gave away their answers in their own wording (Q5 → Q6 seemed to).

### Code review instructions
- Files: `answers.md` (six answers, each terminated by a `Confidence: N` line), `diary.md`.
- Validation: read `answers.md` and check (a) numbering 1–6 is complete and in order, (b) every
  answer is 2–5 sentences, (c) every answer has exactly one `Confidence:` line in 1–5, (d) claims
  that require the article are prefixed by the "I cannot know this without the article" statement.

### Technical details
- Working directory: `.../students/round1/a08-pre/s3`; only `TASK.md`, `quiz.md`, `diary-format.md`
  were readable in it. No article file was present or supplied.
- Confidence distribution: Q1 = 4, Q2 = 2, Q3 = 4, Q4 = 2, Q5 = 3, Q6 = 3.
- Model used across answers: token = (tag = `state`, saved variables = copied locals/spills);
  entry = `switch (state)` jumping to the label after the corresponding wait; state written before
  yielding to the event loop; one static token record per async function ⟹ no concurrent instances.

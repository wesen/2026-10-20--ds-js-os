## Step 1: Answering a quiz about an article I was not given

I read `TASK.md`, then `quiz.md` and `diary-format.md`. The task is deliberately blind: six questions
about an article titled "9. Types That Pay for Themselves" that does not exist in this directory, and
I was told not to use the web. So the work was to separate what I can reason out from general knowledge
of editors, compilers and type systems from what genuinely requires the article's text, answer the
former, and say so plainly on the latter rather than inventing section contents.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read `quiz.md`, write `answers.md` with one numbered answer per question
each two to five sentences plus a `Confidence: N` line, then write `diary.md` in the format of
`diary-format.md`, and finish with the single line `DONE`.
**Inferred user intent:** An editor is checking whether the article is self-sufficient — which
questions can be answered from general knowledge alone, and which only the article can settle. Honest
confidence labelling is the actual product here; a plausible-sounding fabrication would be worse than
useless.
**Commit (code):** none — no repository was touched, only new files written.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (all three are short; read in full).
- Wrote `answers.md` with six numbered answers, each followed by `Confidence: N`.
- Wrote this `diary.md`.

### Why
- I answered from reasoning wherever the question's own wording constrained the answer: Q4 (signed vs
  unsigned bounds check), Q6 (linear types over an `if`) are near-universal facts, so I answered them
  concretely and gave them the highest confidence.
- For Q1, Q2, Q3 I opened with "I cannot know this without the article", then gave the shape the
  answer would have to take, as the task instructs. The section numbers were evidence: 9.2 wants three
  bare-integer meanings, 9.3 wants four coordinate systems, 9.4 wants an invariant surviving a loop.
- I did not invent code, file names or quotations from the article. Naming a specific enum or struct
  from the source would have been fabrication.

### What worked
- Reasoning held for the questions with a fixed logical core: Q4's lower-bound argument, Q5's arena
  rules (no escape; reset only with no live borrows), Q6's exactly-once-per-path rule.
- Cross-reading the questions against each other helped. Q3 supplies the "diagnostic event" that also
  appears in Q5's motivation; Q4's unsigned index is the same trick Q2 needs for byte-offset columns.

### What didn't work
- No command failed. My real problem was scope: for Q1, Q2 and Q3 I could not name the actual
  identifiers, so those answers are pattern-matching against how editors and compilers usually look,
  not reading. Confidence: 2, 3, 2 respectively. If the editor's goal was to test recall of the
  article's specific list, those three answers do not demonstrate it.

### What I learned
- The question set is a probe for "can a new reader recover the argument without the prose?" Q4, Q5
  and Q6 are recoverable. Q1–Q3 are not, because they are enumerations of local facts: which integers,
  which coordinate names, which event list. That split is itself the interesting finding.
- Answering "I cannot know" and then reasoning anyway is more informative than a confident blanket
  guess, but only if the guessed part is visibly marked off from the known part.

### What was tricky to build
- The boundary between deduction and invention. Q2 is the danger zone: four coordinate systems in an
  editor is nearly determined (offset / logical line-column / wrapped visual position / screen cell or
  pixel), yet the specific mistake tests miss depends on which conversion the article actually calls
  out. I chose the identity-at-the-origin failure mode because it explains "tests tend to miss it"
  structurally — tests that only exercise ASCII at column zero cannot distinguish the systems — rather
  than because I know the article says so.

### What warrants a second pair of eyes
- Q1: my three candidate bare integers (movement direction, mode, edit-record kind) are a guess from an
  editor's shape; verify against 9.2's actual list.
- Q3: I read "three kinds of event" as write-through-alias, diagnostic re-entry, and index/pointer
  escape. If the article's three are e.g. call, assignment and return, my framing of "why nothing needs
  to be remembered" still stands but the names are wrong.
- Q6: I inferred the operations are renew/revoke from the word "Grant"; if the disposal verbs differ,
  only the vocabulary is wrong, not the linearity rule.

### What should be done in the future
- Ask for the article, or for 9.2–9.4, before answering enumerative questions. A blind pass is good
  for Q4–Q6 and structurally unreliable for Q1–Q3.
- Re-run this quiz with the article present and diff the two answer sets. Questions whose answers do
  not change are the ones the article communicates redundantly; the ones that change are the ones that
  carry load.

### Code review instructions
- Start with `answers.md`; check that each answer is 2–5 sentences and carries exactly one
  `Confidence: N` line with N in 1–5 (six lines total). Then check this diary against the template in
  `diary-format.md` for missing headings.
- No build, test or validation command applies: no source code, no repository.

### Technical details
- Files written: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Confidence vector: Q1 2, Q2 3, Q3 2, Q4 4, Q5 3, Q6 4.
- Three of six answers (Q1, Q2, Q3) open with the explicit "I cannot know this without the article"
  marker; the other three are answered as deductions.
- The article's only concrete artifacts available to me were its title and the section numbers 9.2,
  9.3, 9.4 that the quiz cites.

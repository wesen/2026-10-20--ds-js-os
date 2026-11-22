## Step 1: Answering a quiz about an article I was not given

I read `TASK.md`, then `quiz.md` and `diary-format.md`. The task is a blind read: six questions about
section 7 ("Safety by Construction: Running Native Code Without Trusting It") of a teaching article
that is deliberately not present in the directory, so every answer had to be reconstructed from the
question wording, general compiler and embedded-systems knowledge, and the internal consistency
between questions. I wrote six numbered answers to `answers.md`, each two to five sentences with a
`Confidence:` line, and flagged in the preamble that the article's own vocabulary is a guess.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md literally: read the quiz, answer it blind, write
`answers.md`, then write a diary entry in the `diary-format.md` format.
**Inferred user intent:** Test whether a reader without the article can infer the article's
arguments (ABI contracts, acyclicity of the call graph, static stack bounds, fuel, PMP vs. software
verification) — i.e. an editor's check that the piece is inferable rather than only explainable.
**Commit (code):** none — no repository or VCS operations were performed.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`.
- Wrote `answers.md` with answers 1–6 and a `Confidence: N` line after each.
- Wrote this `diary.md` in the full investigation format.

### Why
- I answered rather than abstaining because TASK.md explicitly asks for "your best reasoning" even
  where the article is needed; abstaining per-question would have produced no signal for the editor.
- I used confidence 3 throughout: the questions name concrete mechanisms (contract vs. wall,
  definition-before-use, fuel, bounds-check registers, PMP with user mode), which pins the answers
  well, but the article's exact three safety properties and the exact pairing in 7.6 are unknown.

### What worked
- Structural questions (2, 3) are near-determined: definition-before-use implies a total order,
  hence an acyclic call graph, hence a finite call-path enumeration and a frame-size recurrence.
- Question 4 is answerable from the shape of the generated loop and from what a fuel counter can and
  cannot buy (liveness vs. completion).

### What didn't work
- No failures of commands were observed; no commands other than file reads/writes were needed.
- I could not verify the article's naming: which three safety properties it enumerates (Q1) and
  which two techniques 7.6 actually contrasts (Q5). Both required hedging inside the answer.

### What I learned
- The quiz is structured so that Q2+Q3 depend on each other: the same no-forward-reference rule that
  makes the call graph acyclic is what makes the static stack bound computable, and Q2's "what must be
  added" is exactly the cycle check that Q3 relies on.
- Q5 and Q6 only make sense if the article contrasts a compile-time/software verifier against a
  hardware sandbox, with the point that only the latter survives a compiler bug.

### What was tricky to build
- Q5 was the delicate one: a faulty bounds-check comparison is a defect *inside* the object that the
  software verifier certified, so the verifier's guarantee is vacuous unless it reasons about the
  emitted instructions rather than the source. I therefore argued the hardware region limit holds and
  the software argument does not, and stated the general shape in case 7.6 pairs the techniques
  differently.

### What warrants a second pair of eyes
- Whether the article's three safety properties are really (isolation, termination, memory safety);
  my Q1 answer assumes the list concerns isolation.
- Whether the target actually has PMP/user mode or whether Q6 is a conditional ("what PMP with user
  mode *would* give you") — this changes the framing of answers 5 and 6 but not their logic.

### What should be done in the future
- A second pass with the article in hand to replace each hedged clause with the article's own terms,
  and to check whether the article's stack bound is stated as a recurrence or as a flat sum.

### Code review instructions
- Read `answers.md` side by side with `quiz.md`; check each answer is 2–5 sentences and followed by a
  `Confidence:` line. Validation is manual: no build or test command applies to these files.

### Technical details
- Files produced: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Confidence distribution: six answers at 3, none at 4 or 5, because every question turns on at least
  one unstated article-specific term.

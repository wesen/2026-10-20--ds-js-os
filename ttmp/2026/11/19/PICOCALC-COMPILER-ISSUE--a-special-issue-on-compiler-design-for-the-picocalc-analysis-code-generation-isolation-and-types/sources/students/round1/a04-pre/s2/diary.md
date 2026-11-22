## Step 1: Answering an unseen article's quiz from reasoning alone

I was asked to act as a student reader testing a teaching article before publication. The article
itself was not provided — only `quiz.md`, six questions on section 4 of "Making Inference Affordable,
or Avoiding It" — so this step was an exercise in answering from background knowledge about range
analysis, SSA, summary-based (modular) analysis, and Static TypeScript, while marking clearly where
the article's specific content is unavailable to me. I wrote `answers.md` with one numbered answer
per question and a `Confidence:` line after each, then this diary entry.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the five numbered instructions inside `TASK.md`: read `quiz.md`,
answer every question from prior knowledge only (no web), write `answers.md` with numbered answers of
two to five sentences each plus a `Confidence: N` line, write `diary.md` in the `diary-format.md`
format, and finish with the single line `DONE`.
**Inferred user intent:** Obtain an uncontaminated "cold read" of the quiz — what a competent reader
can and cannot infer without the article — so the editor can see which questions leak their own
answers, which depend on unstated notation, and where the prose is doing real work versus being
guessable.
**Commit (code):** N/A (no repository, no commits; working directory contains only task scaffolding).

### What I did
- Read `TASK.md`, `quiz.md` and `diary-format.md` with `read` (no other files exist in the directory).
- Wrote `answers.md`: six numbered answers, each followed by `Confidence: N`.
- Confidence assigned: Q1 = 2, Q2 = 3, Q3 = 4, Q4 = 3, Q5 = 2, Q6 = 3.
- Wrote this file, `diary.md`, as a single step in the prescribed full format.

### Why
- Answering before seeing the article is the whole point of the test; I deliberately did not try to
  locate a copy of the article elsewhere (and the instructions forbid the web anyway).
- Two to five sentences per answer keeps each answer falsifiable: the editor can check whether my
  reasoning lands on the article's actual claim or drifts.
- For Q1 and Q5 I opened with "I cannot know this without the article" as instructed, then gave the
  best available reasoning, rather than fabricating a body for `nextIndex` or a definition for
  "local checking".
- I kept general-knowledge answers (Q2, Q3, Q4, Q6) separate from guesswork so the confidence numbers
  mean something.

### What worked
- Q3 (extended SSA: σ/π-nodes, e-SSA/HSSA, predicate renaming on edges) and Q6 (Static TypeScript
  supplies types, field layouts, absence of polymorphism and unboxed integer representation, so the
  peephole pass needs no inference) are standard material and could be answered substantively.
- Q4 was answerable on principle: iteration only in cyclic regions (loop headers, back edges, φ nodes),
  a single topological pass everywhere else — this is the standard work-list/reverse-post-order story.
- Q2 turned out to be a clean logic question rather than an article-dependent one: a summary is a
  function of the callee's inputs, so caller churn changes the input range, not the summary's validity.

### What didn't work
- Q1 could not be answered exactly. The body of `nextIndex` and the section 4.1 definition of "jump
  function" are unknown; I gave a name-based reconstruction (`clamp(i + 1, 0, n - 1)`, jump function
  J(x) = [x+1, x+1], argument range [6, 8], result `[6, min(8, n - 1)]`) and labelled it confidence 2.
  If the article's `nextIndex` is `clamp(i + d, …)` for a symbolic `d`, or takes a direction argument,
  my numbers are simply wrong.
- Q5's term "local checking" is the author's own; I could not verify which of two readings is meant
  (per-definition modular checking against callee summaries vs. checking performed on the device
  itself). I answered the first and flagged the second in one sentence.

### What I learned
- A quiz on an unseen text still discriminates well: four of six questions were answerable from
  general knowledge of program analysis, which means those questions mostly test whether the reader
  recognises standard machinery rather than whether they read this particular article. That is useful
  editorial information but also a hint that those questions may be too generic.
- The two questions that genuinely require the article (Q1, Q5) are exactly the ones that use the
  article's own vocabulary — a function name and a coined term — so coined terms and worked examples
  are the load-bearing parts of the text.

### What was tricky to build
- The main difficulty was containment: writing answers precise enough to be checkable without letting
  invented specifics masquerade as facts about the article. The solution was a fixed rhetorical shape —
  explicit "I cannot know this" sentence first, then a reconstruction clearly marked as such, then a
  confidence number that encodes the doubt.
- A second boundary problem was scope discipline: Q1 invites me to "write the jump function", which
  presupposes a notation I have never seen; I answered in interval-transformer terms
  (input interval → output interval) and stated that assumption instead of guessing at syntax.

### What warrants a second pair of eyes
- Q1: confirm whether the intended answer is the naive `[6, 8]` or the refined `[6, min(8, n-1)]` after
  intersecting with `clamp`'s postcondition; if the article intends the conditional/degenerate case, my
  answer is incomplete.
- Q5: the editor should check whether my two "practical consequences" (bounded resident memory,
  per-function incremental cost) are the ones the article actually draws, since a handheld-specific
  claim about RAM and latency is verifiable against the article and not against my reasoning.
- Q4: my answer assumes monotone transfer functions and finite-height domains; if the article's domain
  is not finite-height, "terminates at a fixpoint" would need widening and my confidence of 3 may be
  too high.

### What should be done in the future
- Ask the editor for the article text before Q1- and Q5-style questions are used as a comprehension
  check; or rewrite those questions to be answerable from the section excerpt alone.
- If this cold-read exercise is repeated, record the ground-truth answers next to mine so the gap between
  "generic knowledge" and "this article's content" is measurable rather than anecdotal.
- N/A for code, tests and docs — no code was touched.

### Code review instructions
- Files: `answers.md` (six numbered answers, each with `Confidence: N`), `diary.md` (this entry),
  sources read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Validation: confirm each question number 1–6 appears exactly once in `answers.md`, that every answer
  is followed immediately by a `Confidence:` line with an integer 1–5, and that the answers file
  contains no claim presented as article fact without an "I cannot know this without the article"
  marker where applicable.
- No build or test commands apply; the directory is documentation only.

### Technical details
- Conventions used in `answers.md`: jump function read as an interval transformer; `clamp(x, lo, hi)`
  summarised as "result ∈ [lo, hi] and in the range of x"; extended SSA read as σ/π (predicate) nodes
  per Ananian's e-SSA and HSSA; planning as reverse-post-order work-list with re-queueing on cyclic
  dependencies only.
- Limits: no access to the article, no network, no other files in the directory; the reconstruction in
  Q1 is name-based and the definition in Q5 is an inference from context.
- References: none external — all statements are from general knowledge of compiler construction and
  the `MakeCode`/Static TypeScript design notes as commonly summarised.

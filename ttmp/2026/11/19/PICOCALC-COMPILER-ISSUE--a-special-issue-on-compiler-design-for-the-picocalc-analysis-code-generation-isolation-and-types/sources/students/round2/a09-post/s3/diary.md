# Work diary — student read of Article 9 ("Types That Pay for Themselves")

## Step 1: Read the article and look up terms in the glossary

I read `article.md` from the opening paragraph to the references without skipping, then re-read
sections 9.2 to 9.5 a second time because the cost figures and the bounds-check rule are where I kept
losing the thread. As I went, every term I did not know went to `glossary.md`; I kept a list of the ones
the glossary also did not have (`RV32`, `code point`, `code unit`, `refinement`, `state record`, `ABCD`,
`substructural`, `least privilege`).

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md literally: read the article front to back, use the glossary
as a reader would, then produce `answers.md`, `feedback.md` and this diary.
**Inferred user intent:** The editor wants evidence about where the teaching text fails for a reader,
not a summary of the article or a repository investigation.
**Commit (code):** n/a — documentation-only session, no code touched.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (all 12 sections plus references), `glossary.md`.
- Noted each hard term at the point of first use and checked it against the glossary's eight categories
  (The system / The compilers / Program analysis / Code generation / Loading and caching / Safety /
  Language design).
- Kept a running list of sentences that contradicted each other or that asked for a number I could not
  derive.

### Why
- Reading the glossary *while* reading, rather than afterwards, is the only way to tell a term that is
  "explained later in the article" from one that is never explained at all.
- Two readings of the dense sections, because a first pass hides contradictions: they only appear when
  you try to apply a rule to the article's own example.

### What worked
- The glossary resolves most of the vocabulary: `claim`, `handle`, `nucleus`, `reactor`, `turn`,
  `arena`, `region`, `linear type`, `typestate`, `effect system`, `distinct type`, `enumeration`,
  `flow-sensitive typing` all have entries, so those terms are not gaps.
- The section structure (Observation / Mechanism / Cost) is easy to follow and made note-taking quick.

### What didn't work
- I could not check any of the numeric cost claims (20 instructions for a bounds check, about four with
  the improved backend, seven-to-nine for the hand-written loop, 404 traps, 85 `charCodeAt` calls,
  28 reactor functions) because no listing, manifest excerpt or file excerpt appears in the article.
  I did not invent numbers to fill the gap; the feedback records them as unverifiable.
- Section 9.4's rule failed my apply-it check: the guarded body of the example contains
  `text.charCodeAt(at)`, which is a call, so "discarded ... any call is made" would kill the very fact
  the access needs. I re-read the rule and the example twice and found no sentence that excludes
  built-ins. That is recorded in `feedback.md` rather than resolved by guessing.
- Section 9.2's "the generated code is the same as today's" contradicts its own observation (values
  14/15, five members replaced by small integers). Unresolved.

### What I learned
- The article's admission test is three-part and is used consistently: local checking, no added
  run-time checks, observed problem. Several sections make sense only if you keep criterion 1 in mind,
  e.g. why guard facts are discarded at every call.
- The typed language's real limits (no allocation, no forward calls, no `else`/`for`/`break`) are what
  make most of the proposed checks single-pass; the additions in 9.9 interact with that.

### What was tricky to build
- Deciding what counts as "explained": a one-clause gloss such as "Sized types carry bounds on data
  sizes" is not a definition a reader can use. I settled on the rule that if I could not restate the
  term in my own sentence afterwards, it went on the list — which is why `sized types`, `session types`
  and `liquid types` are listed even though the article gestures at each.

### What warrants a second pair of eyes
- My claim that 9.7's one-pass effect computation depends on the define-before-use restriction that 9.9
  wants to remove. If the author intended the explicit cycle check to also preserve that property, one
  sentence would fix it; if not, the ordering in 9.10 is affected.
- My reading of "storing it in the state" as a *consuming* operation for a linear grant in 9.6, which
  does not obviously square with "must be used exactly once".

### What should be done in the future
- Have a second reader attempt the same apply-the-rule check on 9.4 and 9.6; both are the sections
  where the mechanism must be used, not merely understood.

### Code review instructions
- Files produced: `answers.md`, `feedback.md`, `diary.md`, all in this directory.
- Validation: each of the six quizzes in `article.md` "9.12 Check your understanding" has a numbered
  answer with a `Confidence: N` line; `feedback.md` has the six required sections in the requested
  order; every quoted passage in `feedback.md` was copied from `article.md` verbatim.

### Technical details
- Article: 12 numbered sections, 6 proposed features, 2 deferred, 24 references.
- Confidence values I assigned: 3, 4, 3, 4, 4, 4 — lower where the article's wording, not my reading,
  is the limit.

## Step 2: Answer the quiz in `answers.md`

I answered all six questions in `answers.md`, numbered as in section 9.12, in my own words and with the
working shown where a question asks for a count or a translation (the `a🙂b` byte/code-unit/code-point
arithmetic in Q2, and the signed-versus-unsigned comparison argument in Q4). Each answer ends with a
`Confidence: N` line.

### Prompt Context
**User prompt (verbatim):** see Step 1 (TASK.md item 2).
**Assistant interpretation:** Answer from the article only, two to six sentences each, show working,
state confidence honestly.
**Inferred user intent:** Test whether the quiz is answerable from the text alone, and surface the
questions that are not.

### What I did
- Worked the six questions in order against the article text, quoting section numbers in my head but
  answering in my own sentences.
- Where a claim was in doubt, I answered with what the article says and lowered the confidence rather
  than filling in from general knowledge.

### Why
- The quiz is the article's own test of comprehension, so answering it is the most direct measurement
  of whether the teaching worked.

### What worked
- Q2, Q4, Q5 and Q6 are fully answerable: the mechanisms are stated in words that can be reused.
- Q2's counting is pleasant to check by hand: `a` (1 byte, 1 unit, 1 point), `🙂` (4 bytes, 2 units,
  1 point), `b` (1, 1, 1) gives 6 bytes, 4 units, 3 points — matching the article.

### What didn't work
- Q1's second half asks what changes in the generated code; the only possible source is the article's
  assertion, which conflicts with the 14/15 observations. I answered with the assertion and marked
  `Confidence: 3`.
- Q3 asks for exactly three kinds of discarding event; the article lists two assignments plus "any
  call", and the example makes "any call" ambiguous. Same treatment: article's wording, lower
  confidence.

### What I learned
- A quiz question that asks "what does X change in the output" needs the article to show output. Here
  it does not, so the question tests recall of a claim rather than understanding of a mechanism.

### What was tricky to build
- Keeping answers in my own words without importing knowledge from outside the article (I know what
  UTF-16 surrogate pairs are, but the article never says so, and my answer had to rest on its counts).

### What warrants a second pair of eyes
- Q4: my statement "the existing check is one unsigned comparison, which also rejects negative indices"
  is a paraphrase of the article's sentence; a reviewer should confirm that this is the intended reading
  rather than my inference.

### What should be done in the future
- N/A.

### Code review instructions
- Compare `answers.md` question by question with `article.md` 9.12; every answer should be traceable to
  a sentence in the article.

### Technical details
- Six answers, each 3–5 sentences, each with a confidence line; two confidences deliberately below 4.

## Step 3: Write `feedback.md`

I wrote the feedback with the six required sections in the required order, quoting the passages that
stopped me and separating three kinds of complaint: unclear writing, undefined vocabulary, and claims
that carry numbers I cannot check here. I gave each numbered section a score and one sentence of reason,
and closed with one addition and one cut.

### Prompt Context
**User prompt (verbatim):** see Step 1 (TASK.md item 3).
**Assistant interpretation:** Report only where the article fails to teach, with quotes, and keep
findings to what the article and glossary actually contain.
**Inferred user intent:** Give the editor a prioritised list of fixes before publication.

### What I did
- Six "read twice" passages, each a one- or two-sentence quote plus what was unclear.
- A term list of fourteen lines; checked each against `glossary.md` before writing it down.
- Twelve unverifiable claims, each with the missing evidence named.
- Scores: opening 4, 9.1 4, 9.2 3, 9.3 4, 9.4 2, 9.5 4, 9.6 3, 9.7 4, 9.8 3, 9.9 4, 9.10 4, 9.11 5.
- One addition: a worked before/after listing for the instruction counts. One cut: the 9.4 ladder table.

### Why
- I scored 9.4 lowest because it is the only section whose mechanism I could not apply to its own
  example without making an assumption the text does not grant.
- I chose the ladder table to cut because it adds four undefined terms to a section that needs one rule,
  and because the sentence introducing it contradicts criterion 1.

### What worked
- The Observation / Mechanism / Cost template made scoring mechanical: a section scored high when all
  three parts were concrete and low when one part rested on an unshown number or an undefined term.

### What didn't work
- I could not verify any of the repository-based observations, and per my brief I did not try (no
  repository search, no web). Those items are recorded as unverifiable from the article, not as errors.

### What I learned
- The glossary covers the system and compiler vocabulary thoroughly but has almost nothing for the type
  theory that this article is about: none of `refinement`, `dependent types`, `liquid types`,
  `substructural`, `gradual typing` is defined there, which is why an article made of them reads harder
  than the earlier, system-focused ones.

### What was tricky to build
- Keeping the term list honest: penalising a term for being glossed in a subordinate clause felt
  harsh, but the rule "could I restate it afterwards" kept the list defensible and consistent.

### What warrants a second pair of eyes
- Whether the "generated code is the same as today's" claim is a genuine error or shorthand for "same
  shape with different constants". If it is shorthand, one word ("same shape") removes the finding.

### What should be done in the future
- Add type-theory entries to `glossary.md` alongside the proposed article fixes; the two efforts address
  the same complaint from different ends.

### Code review instructions
- `feedback.md`: check that every quoted sentence exists in `article.md` verbatim and that each section
  score is followed by exactly one sentence of reason.

### Technical details
- Findings: 6 passages, 14 terms, 12 unverifiable claims, 12 section scores, 1 addition, 1 cut.

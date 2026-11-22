# Investigation entry

Work diary for the student-reader pass over `article.md` (section 8, "Asynchrony as a Compiler
Transformation"). All work in the current directory; no network used.

## Step 1: Reading the article and the format

I read `TASK.md` and `diary-format.md` first so I knew the four deliverables and the shape of this
file, then read `article.md` straight through once without stopping to take notes, and a second
time with the quiz questions in view.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered instructions inside `TASK.md`: read the
article, answer its quiz into `answers.md`, write `feedback.md` in the five prescribed sections,
and write this diary in the `diary-format.md` format.
**Inferred user intent:** An editor wants a fresh reader's honest report on where the article
fails to teach, before publication.
**Commit (code):** N/A — no repository work, no commit made.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (full text, ~9 sections plus references).
- Listed the structural facts I would need later: 2 waits in `openFile`, 5 token fields, 71 state
  fields, 3 live variables at wait 2, frame states 0/1/2.

### Why
- Reading the whole article before the quiz was required, and it also prevents the temptation to
  answer questions only from the section that looks relevant.

### What worked
- One pass followed by a targeted second pass was enough; the article is short and its section
  headings map almost one-to-one onto the quiz questions.

### What didn't work
- No failures. I did try to check the two quotations attributed to Adya et al. and the phrasing
  attributed to Embassy against an internal source and found none quoted elsewhere in the article,
  so I recorded them under unverifiable claims rather than as errors.

### What I learned
- The article depends on definitions (`reactor`, `turn`, `world`, `fuel`) delivered in Articles 1
  and 7; a reader who has not read those cannot follow 8.1. That constraint shaped my feedback.

### What was tricky to build
- Deciding whether the `state = 1` branch of the generated function was an error: the source tests
  a local `ok` from `await`, the generated code tests `event.ok`. I concluded it is an unstated
  assumption (the completion event carries the result), not a bug, but I flagged it because the
  reader cannot tell the difference from the text alone.

### What warrants a second pair of eyes
- My claim that `stop` is dead at wait 2 because it is recomputed each outer iteration. That rests
  on the hand-written `editorNormalize` slice, which recomputes `stop` from `state.sourceLength`
  per call; if the real Editor code carried `stop` in a field, the article's table would be wrong.
- The count "five tokens and 71 state fields" — I could not verify it and did not dispute it.

### What should be done in the future
- Quote the actual test names or failure output behind the three hazards in 8.2, and add the
  caller/callee frame-resumption example promised in 8.6.

### Code review instructions
- Compare the listing in 8.2 with the outline in 8.5 for the `ok` / `event.ok` and `DONE(0)`
  mismatch, and with the liveness table in 8.4 for the `stop` and `text` rows.

### Technical details
- Deliverables written: `answers.md` (6 answers, each with a `Confidence:` line),
  `feedback.md` (six required sections), `diary.md` (this file).
- Constraints observed: no web access, no files outside the working directory.

## Step 2: The quiz

I answered all six questions in `answers.md`, two to six sentences each, in my own words, with
working shown wherever a question asked for a list or a translation (the liveness split in Q2, the
three state values in Q4).

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer section 8.9's questions, numbered as asked, each followed by
`Confidence: N`.
**Inferred user intent:** Test whether the article alone is sufficient to reproduce its own
central claims.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with answers 1–6 and confidence values 5, 4, 4, 5, 4, 5.

### Why
- Six short paragraphs each; I kept the justifications explicit (naming which reads make a
  variable live, naming the resume point per state) rather than summarising, since the task asked
  for working.

### What worked
- Q1, Q4 and Q6 were answerable almost verbatim from 8.1, 8.5 and 8.7; confidence 5.
- Q2 came out well because the article's table supplies both the verdicts and the reason for
  `stop`.

### What didn't work
- Q3: I could restate tag = "which token is non-zero" and saved variables = `unitsRead`,
  `unitsWritten`, `sourceLength`, but the dispatcher listing that would demonstrate the "jump to
  the code" half is elided with `{ ... }`, so confidence stayed at 4.
- Q5: the no-recursion argument is stated but its premise ("acyclic call graph") comes from
  Article 7, not from this article; again confidence 4.

### What I learned
- The parts I answered most confidently are the ones with a table or a numbered listing. Prose
  argument (defunctionalization, static allocation) was harder to restate precisely.

### What was tricky to build
- Q2's treatment of `text`: the table defers it to prose two paragraphs down. I resolved it as
  "not saved, reacquired after the yield", which follows from the `string`/`buffer` rule in 8.4.

### What warrants a second pair of eyes
- Q3's confidence of 4: if the intended answer is that the *frame* in 8.5 is the defunctionalized
  continuation rather than the token fields, my mapping of tag/saved variables is subtly off.

### What should be done in the future
- N/A; the answers are as complete as the text allows.

### Code review instructions
- Check `answers.md` Q4 against the `openFile.step` outline for the resume targets, and Q2 against
  the 8.4 table.

### Technical details
- Confidence distribution: 5, 4, 4, 5, 4, 5 — the two 4s (Q3, Q5) both trace back to material
  imported from other articles or elided in listings.

## Step 3: The feedback report

I wrote `feedback.md` in the five prescribed sections plus the add/cut pair, choosing quotations
short enough to be one or two sentences each and attaching a specific missing step to every
unverifiable claim.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the editorial report: double-taken passages, undefined terms,
unverifiable claims, per-section scores, quiz questions the text could not support, and one
addition plus one cut.
**Inferred user intent:** Actionable, honest criticism — the failure modes, not praise.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md`: 5 transcribed passages, 11 term lines, 7 unverifiable claims, 9 scored
  sections (8.1–8.9), 3 partial quiz gaps, 1 add and 1 cut.
- Scores given: 4, 5, 4, 4, 3, 4, 5, 5, 4. Lowest is 8.5.

### Why
- I scored 8.5 lowest because it is the section the title promises and it is the only one whose
  code is internally inconsistent with the code it rewrites.
- My "add" (a full worked trace with frame contents and the real `loop` + `br_table` shape) and my
  "cut" (the Lauer & Needham sentence) were chosen to serve the same weakness: evidence instead of
  gesture.

### What worked
- The passages section was easy to fill: every one of the five is a place where the article asserts
  a connection the reader must supply (control flow implied by a token, "see below" with no row,
  `event.ok` from nowhere).

### What didn't work
- My first pass at "Terms used before they were explained" ran to more than twenty items because
  nearly every noun (`world`, `typed`, `reactor`) is imported. I cut it to terms that actually
  blocked a sentence, since a longer list would read as a complaint rather than a report.

### What I learned
- The article's real difficulty is not jargon but elision: `{ ... }` in the dispatcher, `...` in
  the handler, "see below" without a footnote, one line for caller-resumes-callee.

### What was tricky to build
- Separating "term used before definition" from "claim I could not verify" for `WorldState` and
  for the 71-field count. I put the definitions in the terms section and the numbers in the claims
  section, and cross-referenced them only implicitly.

### What warrants a second pair of eyes
- Whether "nucleus" is genuinely undefined in this article or is a deliberate synonym for
  "reactor"; I read it as a distinct component and it is never introduced.
- Whether the `DONE(0)` in the failure branch of `openFile.step` is meant to match the `return 0`
  of the wished-for source. I reported it as inconsistent; it may be intended as the same value
  wrapped in a supervisor result.

### What should be done in the future
- If the article is revised, re-run this reader pass with the same six questions to see whether
  Q3 and Q5 rise to confidence 5.

### Code review instructions
- Cross-check every quotation in `feedback.md` against `article.md` (they are copied verbatim),
  and confirm the scores cover all numbered sections 8.1 through 8.9.

### Technical details
- Sections scored: 8.1 (4), 8.2 (5), 8.3 (4), 8.4 (4), 8.5 (3), 8.6 (4), 8.7 (5), 8.8 (5),
  8.9 (4). Mean ≈ 4.2.
- Files touched in this session: `answers.md` (created), `feedback.md` (created),
  `diary.md` (created). `article.md` and `TASK.md` read only, unmodified.

# Work diary: testing article 5 for the editor

## Step 1: Reading the article from start to finish

I read `article.md` in one pass as a student would, without taking notes on the first read, then
re-read the sections that carry numbers. My intent was to see where a reader loses the thread
rather than to grade the writing, so I marked every place where I had to stop and reconstruct
something the text had not given me.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task spec, then read `article.md`, answer its quiz in
`answers.md`, write `feedback.md` in the prescribed sections, and write this diary.
**Inferred user intent:** The editor wants a genuine first-reader signal on a teaching article
before publication: which passages fail to teach, which terms arrive unannounced, and which claims
are taken on faith.
**Commit (code):** N/A — no repository changes, only three new markdown files in this directory.

### What I did
- Read `TASK.md` for the procedure and `diary-format.md` for this format.
- Read `article.md` in full (13 numbered sections plus references).
- Kept a running list, in my head, of: passages needing a second read, undefined terms,
  unverifiable numbers.

### Why
- Reading in one pass first is what a student does, and the moments that force a re-read are exactly
  the data the editor asked for. Reading with the checklist in hand from the start would have
  produced a tidier list but a less faithful one.

### What worked
- The article's structure is easy to hold in memory: 5.1 machine models, 5.2 hand translation,
  5.3 the waste table, 5.4–5.7 four techniques in increasing power, 5.8 the counting model,
  5.9–5.11 the limits and alternatives, 5.12 key points. The "each row of the table corresponds to a
  known technique" sentence at the end of 5.3 is the best signposting in the piece.
- The `bump` table in 5.2 and the `let a = b + c` table in 5.5 use the same statement, which let me
  compare "10 instructions" to "4 instructions" directly rather than trusting the prose.

### What didn't work
- I could not reconcile the "41 instructions" total for `bump` with the 15 instructions actually
  displayed (10 in the `let` table, 5 in the branch snippet). I tried to account for the other 26 by
  inventing a prologue and an epilogue, and could not make it land on a number I trusted. No
  diagnostic to report, just an unresolved gap; recorded in `feedback.md` under unverifiable claims.

### What I learned
- The article's argument depends on exact instruction counts, and exact counts are the one thing a
  reader cannot check from a prose article. Every headline number (55.3%, 34.1%, 2.7×, 3.3×) rests on
  Experiment 1 and 2, which live in Article 2 and are not reproduced here.
- Section 5.5 is markedly clearer than sections 5.6–5.7. The difference is that 5.5 gives the reader
  a table with a before-state and an after-state for the same code, and the others give only prose.

### What was tricky to build
- Nothing was built. The tricky part of *reading* was keeping two layers apart: the WebAssembly
  frontend (which decides whether `&&` leaves 0/1 on the stack) and the RV32 backend (which decides
  whether a comparison is materialised). Section 5.6 mixes the two in four paragraphs and I had to
  re-read to see that the "pending comparison" fix lives in the backend while the "short-circuit
  condition" fix lives in the frontend.

### What warrants a second pair of eyes
- Whether my reconstruction of `i32.const` codegen (one instruction plus one store) matches the real
  backend. Question 1's answer of 10 is my assumption, not the article's statement.
- Whether "the frame therefore need not be kept up to date between joins and calls" is a genuine
  contradiction with the flush rule or just an infelicitous sentence. I read it as the latter.

### What should be done in the future
- Ask the author to confirm the constant-push rule and the full `bump` listing; both would remove
  ambiguity in the quiz and in section 5.2.

### Code review instructions
- Compare `answers.md` question 1 against the `local.get` / `i32.add` / `local.set` rows of the 5.2
  table; the pattern I extended to `i32.const` is the same load-then-store pair.

### Technical details
- Files touched: `answers.md`, `feedback.md`, `diary.md` (all new). No source changes.
- Assumed frame layout for the quiz: `y`@0, `x`@4, stack slots @8 and @12.

---

## Step 2: Answering the "Check your understanding" questions

I worked the six questions in order, treating 1 and 2 as calculations that must be shown rather than
stated, and 3–6 as short conceptual answers to be justified from the text.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer all six questions in `answers.md`, numbered as in the article,
two to six sentences each, with a `Confidence: N` line after each.
**Inferred user intent:** The quiz doubles as a comprehension test of the article: if a question
cannot be answered from the text alone, that is itself a finding about the article.
**Commit (code):** N/A.

### What I did
- Q1: extended the 5.2 table pattern to `local.get y`, `i32.const 1`, `i32.add`, `local.set x`,
  using the offsets the question supplies; counted 10.
- Q2: applied the 5.5 lazy-entry model to the same statement; the local read costs one load at the
  point of use and the constant folds into `addi`; counted 3.
- Q3: argued from "code after the join is emitted once", which is stated in 5.5.
- Q4: combined the forward-pass argument with the 4 KiB / 1 MiB reach and quoted the 1,009 / 1,008
  measurement.
- Q5: separated what exact reproduction proves (the walk decodes correctly) from what it does not
  (that models A and B are implementable, runnable, or free of hidden cost assumptions).
- Q6: picked loop-invariant length loading and bounds-check elimination, and named the kind of
  knowledge each needs.

### Why
- I deliberately showed the instruction-by-instruction table for Q1 and Q2 because "count the
  instructions" is only meaningful if the reader can audit the count. A bare number would hide my
  assumption about constants.
- For Q5 I resisted writing "it proves the model is right", which is how the section could be
  misread. The exact match validates the baseline rules only.

### What worked
- Q3, Q4, Q6 were straightforward: the text states each required fact explicitly (the emitted-once
  rule, the branch reaches, and the three named optimisations).
- The 5.5 table gave me a template for Q2 that transferred cleanly to a statement with a constant.

### What didn't work
- Q1 cannot be answered exactly. The article never shows what the backend emits for `i32.const`, and
  no example in 5.2 contains a constant. I chose `li` + `sw` (10 instructions total) and flagged in
  the answer that 9 is a defensible alternative if the backend stores a literal directly. This is my
  one guessed answer; I marked it Confidence 4 rather than lower because the push-then-store pattern
  is clearly the backend's model, but the reader should know it is an inference.
- Q2 exposed a second, related gap: section 5.5's example `a + 1` → `addi t0, t0, 1` works only
  because `a` is already in a register. With `y` in the frame the load is still needed, so the model
  saves less than the reader may expect. The rule is recoverable, but it is never stated.

### What I learned
- The distinction between "one instruction in ten does arithmetic" (5.2) and my Q1 count (two of ten,
  because `li` also does work) is a nice illustration of why the constant rule matters.
- The article's honest limitations paragraph in 5.8 is what makes Q5 answerable at all. Without it,
  the question would have been unanswerable from the text.

### What was tricky to build
- Keeping Q5's two halves separate: "establishes" versus "leaves unproven". The subtlety is that the
  flush count (155) and the register-allocation costs (two instructions per save/restore) are *inside*
  the model but are *not* exercised by the exact-match validation, because today's backend has no
  flushes and no register-allocated locals. I had to reason that through rather than read it.

### What warrants a second pair of eyes
- Q1's count of 10 versus a possible 9. This is the answer most likely to be marked wrong by an
  author who knows the backend.
- Q2's count of 3. If the backend is allowed to keep `x` in `t0` and only spill at a later join, the
  count is still 3, so I am reasonably confident; but if the model forbids forwarding a register
  result to a local store, it would be 3 anyway. Low risk.

### What should be done in the future
- If the editor wants the quiz to be answerable without guessing, add one sentence to 5.2: "a
  constant is materialised into a temporary and pushed like any other value."

### Code review instructions
- Check `answers.md` Q1/Q2 tables line by line against the 5.2 and 5.5 tables.

### Technical details
- Both answers use the offsets given in the question; a third stack slot would be needed for a deeper
  expression, which is why the question fixes only two.

---

## Step 3: Writing the feedback

I turned my three running lists (re-reads, undefined terms, unverifiable claims) into the six
sections the task asks for, then scored each numbered section and picked one addition and one cut.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with exactly the six requested sections, quoting
passages for the first and third, one line per term for the second.
**Inferred user intent:** The editor needs actionable, specific criticism — a quotation and a reason,
not an impression — plus a decision (what to add, what to cut) that can be acted on directly.
**Commit (code):** N/A.

### What I did
- Wrote six quoted passages under "Passages I had to read twice", each with the reason it stalled me.
- Listed ten terms under undefined-or-late: "the world's turn", "PR", SSA, Amdahl's law, trap, typed
  byte arrays, QuickJS/native compile path/link step, the `1f` label, the RV32 mnemonics, and the
  RV32 vs RV32I naming.
- Wrote eleven numbered unverifiable claims, each with the evidence or step that is missing. One I
  marked as verified (17/13 = 1.31) so the list is not indiscriminate.
- Scored sections 5.1–5.13, one sentence each.
- Answered "Questions that the article did not let me answer" and named Q1 and Q2 as partly
  unanswerable, Q5 as answerable only via the limitations paragraph.
- Chose one addition (a full annotated 41-instruction listing of `bump`) and one cut (section 5.11).

### Why
- I scored 5.5 and 5.9 highest because they both do the thing the rest of the article struggles with:
  show the state before and after for the same concrete code. I scored 5.11 lowest because it changes
  subject and its numbers are unsourced.
- For the addition I chose the `bump` listing rather than, say, more Experiment data, because it fixes
  three problems at once: the unverified 41, the unanswerable Q1, and the missing frame setup that
  5.7 assumes.
- For the cut I chose 5.11 rather than trimming citations, because cutting citations would remove
  things a reader can look up, while 5.11 removes a whole tangent.

### What worked
- The unverifiable-claims section was easy to write because every number in the article is traceable
  to Experiment 1, 2 or 3, which are not in this file. Grouping them by experiment rather than
  quoting each separately kept the list readable while staying honest.
- Cross-checking 175,860 − 53,020 = 122,840 against "about 110 to 123 kilobytes" gave me one claim I
  could confirm, which made me trust my reading of the tables.

### What didn't work
- I could not produce a good "quote" for section 5.11's problems because the issues there are
  structural (wrong topic, three orphan numbers) rather than local. I fell back to describing the
  section as a whole in the scores and in the cut suggestion. That is a weaker piece of feedback than
  the rest.
- My first attempt at the review-scale list had thirteen scores all at 3 or 4, which told the editor
  nothing. I went back and committed to real differences — using 5 for the two sections that teach,
  2 for the one that does not belong.

### What I learned
- The article's weakest habit is citing a rule as a quotation ("spill the PR that contains the value
  whose next use is farthest in the future") where a one-sentence paraphrase in the RV32 setting
  would teach more. The quotations are accurate but they import vocabulary the reader does not have.
- Conversely, its strongest habit is the before/after table. Every place with such a table scored 4
  or 5; every place without one scored 3 or below.

### What was tricky to build
- Deciding whether "the frame need not be kept up to date between joins and calls" is a contradiction
  or a compression. I settled on "compression written as if it were a retraction" and said so, because
  the alternative reading (that flushes do not touch the frame) would make the previous paragraph
  meaningless. Recording the uncertainty seemed better than picking one and sounding certain.

### What warrants a second pair of eyes
- The claim that Q1 is unanswerable. If the author considers "push a constant" obvious by analogy with
  the `bump` table, my strongest criticism of 5.2 evaporates, though the 41-instruction gap stands.
- The section-5.11 cut. It is a judgement about article scope, not about correctness, and the author
  may consider compiler throughput part of the story.

### What should be done in the future
- If the editor acts on the addition, the quiz should be re-tested with a second reader to confirm Q1
  becomes answerable without inference.

### Code review instructions
- Read `feedback.md` top to bottom against `article.md`; every quotation should be findable verbatim
  in the article (all are, except where I quote a table row).

### Technical details
- Scores given: 5.1 = 4, 5.2 = 3, 5.3 = 4, 5.4 = 3, 5.5 = 5, 5.6 = 3, 5.7 = 3, 5.8 = 4, 5.9 = 5,
  5.10 = 3, 5.11 = 2, 5.12 = 5, 5.13 = 4.
- Deliverables in this directory: `answers.md`, `feedback.md`, `diary.md`.

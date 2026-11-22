# Investigation entry

## Step 1: Reading Article 8 and the glossary

I read `TASK.md` first, then `article.md` straight through without stopping, then `glossary.md` from start
to finish. After that I went back through the article section by section with the glossary open, noting
every term I had to look up and every term that was in neither place.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Act as a student reader testing the article before publication: read it, answer its quiz, and report where it fails to teach, writing three files.
**Inferred user intent:** The editor wants an honest read-only trial of the article's teachability, not praise or copy-editing; the deliverables are `answers.md`, `feedback.md` and this diary.
**Commit (code):** N/A — read-only session, no code changed.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (sections 8.1–8.9 plus references), `glossary.md`.
- Second pass over 8.2–8.6 with the glossary index in mind; kept a running list of terms and quotes.
- Files touched: none. Files created later: `answers.md`, `feedback.md`, `diary.md`.

### Why
- Reading the article once without the glossary, then once with it, imitates what a reader actually does and separates "hard to understand" from "undefined term".

### What worked
- The single-pass read was enough to follow 8.1, 8.5, 8.7 and 8.8; those sections never needed a second look.
- Keeping the glossary open on the second pass quickly showed which gaps are real: `await`, `async`, `task`, `unit`, `scalar`, `preview`, `CR`/`LF` have no glossary entry and no in-text definition.

### What didn't work
- No file-listing tool was available, so I could not confirm whether other readers' output sits in this directory or what file names were expected beyond the three named in `TASK.md`. I used exactly the three names given.

### What I learned
- The article's hard parts are not the concepts (continuation, defunctionalization, liveness are all defined cleanly) but the *correspondence* between the hand-written fields and the generated frame, which is presented in three different notations.

### What was tricky to build
- Deciding what counts as "explained": `frame` has two senses in the glossary, one of which covers this article, so I did not report it; `task` is defined in 8.6 but used from 8.2, so I reported it as used-before-explained rather than undefined.

### What warrants a second pair of eyes
- My liveness verdict for `stop` (dead at wait 2 because it is recomputed at `loop_test` before any read) depends on reading the elided body as "the outer loop recomputes `stop` each iteration". If the real code recomputes it elsewhere, the verdict changes.

### What should be done in the future
- N/A.

### Code review instructions
- Cross-check my quotes against `article.md`; they are copied verbatim, including the typos ("the code for any given task", "the `switch` itself").

### Technical details
- Article sections scored: 8.1–8.9. Quiz has six questions. Editor figures quoted in the article: five tokens, 71 state fields, 80 scalar fields limit, 200 ms turn budget, 64 KiB file, 4,096-unit slices.

## Step 2: Answering the quiz

I answered all six questions in `answers.md`, numbered like the article, keeping each to two to six
sentences and adding a `Confidence:` line. Where a question asked for a calculation I showed the reasoning
(the liveness argument for `stop`, the three-valued tag, the per-state behaviour of `resume`).

### Prompt Context
**User prompt (verbatim):** See Step 1 — "carry out every step in order", step 2 of `TASK.md`.
**Assistant interpretation:** Answer section 8.9 from the article alone, in my own words, with self-rated confidence.
**Inferred user intent:** Check whether the article actually supplies what each question demands; low confidence is itself the finding.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and confidence lines (4, 4, 4, 4, 3, 5).

### Why
- Answered from the text only, without external knowledge, so that any point I could not settle shows up as a low confidence rather than being papered over.

### What worked
- Q2, Q5 and Q6 came out cleanly from 8.4, 8.6 and 8.7 respectively.
- The frame table in 8.5 independently confirms the three variables named in 8.4, so Q2 is cross-checkable inside the article — a good sign.

### What didn't work
- Q1: the article never says whether the stored token must be cleared when the completion arrives; I answered at confidence 4 on the strength of the generated-code rule and the "discard a pending preview" anecdote, not on an explicit statement.
- Q3: the only source for `reading` is one sentence in 8.3, and `reading` appears in no code listing, so I answered at 4 knowing I could not verify that the field exists as described.
- Q4: what `resume` is called with had to be read off the `(event, state)` parameter list in the pseudocode; and the `await ... = ok` versus `token` mismatch made me unsure whether `ok` arrives in the event or as the awaited value. Confidence 4, but I could not have written `case 1` unaided.
- Q5 dropped to 3: the sentence "each callee has exactly one caller position recorded in the caller's `state`" is dense and I am not certain I read it correctly.

### What I learned
- All six questions are answerable, but two of them (Q3, Q4) are answerable only by copying a single sentence or a pseudocode line, which is the difference between "answerable" and "testable".

### What was tricky to build
- The tag question. The pair (`readToken`, `reading`) encodes *three* states (none / wait 1 / wait 2), and the article describes it as "two fields" without saying that the pairing is the encoding. I had to construct that reading myself before answering.

### What warrants a second pair of eyes
- My Q2 answer treats `text` as a live-but-forbidden variable rather than a dead one. The article's own table says "must not be live", which contradicts a plain liveness analysis over the wished-for source, where `text` is read inside the copy loop. If the intended reading is different, my justification of the table's row is wrong.

### What should be done in the future
- The article should state explicitly whether a token field is zeroed on completion, and whether a `string`/`buffer` live across a wait is a rejection or a rewiring.

### Code review instructions
- Read `answers.md` 3 and 4 against article 8.3 and 8.5 side by side; those are the two answers most sensitive to a single sentence.

### Technical details
- Confidence values: Q1 4, Q2 4, Q3 4, Q4 4, Q5 3, Q6 5.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections: passages read twice, terms, unverifiable claims,
per-section scores, unanswerable questions, and one addition plus one cut. Every criticism is attached to
a verbatim quote so the editor can find it.

### Prompt Context
**User prompt (verbatim):** See Step 1 — step 3 of `TASK.md`.
**Assistant interpretation:** Report where the article fails to teach, quoting rather than paraphrasing, and score each numbered section.
**Inferred user intent:** An actionable pre-publication report: what to fix, in what order, and what is merely taste.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md`: 6 passages, 10 terms, 7 unverifiable claims, 9 section scores, 6 quiz verdicts, 1 addition + 1 cut.

### Why
- Section scores are 1–5 with one sentence each so the editor can triage; I reserved 5 for sections that needed no second pass (8.1, 8.8).

### What worked
- The unverifiable-claims list found a real internal inconsistency: `typedSdkFileRead` returns a token (8.5) but is `await`-ed for an `ok` flag (8.2), with nothing connecting the two.
- The `reading` field in 8.3 turned out to be the clearest single failure: a field that the quiz asks about and that no listing contains.

### What didn't work
- I could not check the 71-state-field figure at all; there is no record listing in the article and no way to count from the `kind === 4` snippet. I marked it unverifiable rather than assuming it is wrong.
- I could not check the quoted [Gay et al. 2003], [Adya et al. 2002], [Reynolds 1972] text against the sources, since I was asked not to use the web; I treated cited quotations as verified and only flagged quotations with no locatable source (Embassy documentation).

### What I learned
- The article's weakest section is not the most technical one (8.6) but 8.4, where a table mixes liveness facts with design rules in a single column.
- Several unverifiable claims (the three Editor test anecdotes) are doing most of the persuasive work for "stack ripping is a hazard"; they need paths or a listing.

### What was tricky to build
- Deciding where to cut the line on "unverifiable". I separated three groups: facts cited with a reference (accepted), facts about this project's own code with no listing (flagged), and forward references to Article 10 (flagged as outside the article).

### What warrants a second pair of eyes
- My proposed addition — a single table tying source variable → hand-written field → frame field → tag value — assumes the article's three notations really are the same mapping. If they are not, the right fix is to correct the notations, not to tabulate them.

### What should be done in the future
- After revision, re-run this reader test on 8.3 and 8.4 only; those are where the pass/fail hinge.

### Code review instructions
- Check each quote in `feedback.md` against `article.md` by grep; check the section scores against the article's own section numbering (8.1–8.9, where 8.9 is the quiz and 8.8 the key points).

### Technical details
- Scores: 8.1 5, 8.2 3, 8.3 3, 8.4 3, 8.5 4, 8.6 3, 8.7 4, 8.8 5, 8.9 4.
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. No source files were read or modified outside this directory.

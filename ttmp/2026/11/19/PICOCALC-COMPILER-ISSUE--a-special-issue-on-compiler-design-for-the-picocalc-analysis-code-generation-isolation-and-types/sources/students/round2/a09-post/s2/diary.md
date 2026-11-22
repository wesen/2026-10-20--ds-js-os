# Work diary

## Step 1: Reading the article and the glossary

I read `TASK.md`, then `article.md` from start to finish in one pass without stopping to look anything up, then re-read the six feature sections (9.2–9.8) with `glossary.md` open beside them. Reading first and looking up second turned out to be the right order: the article uses a lot of house vocabulary (*world*, *reactor*, *nucleus*, *turn*, *claim*, *handle*) that the glossary defines well, and stopping at each one on the first pass would have buried the argument of each section under its terms.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Work the four numbered steps of `TASK.md` as a student reader of the article in this directory: read it, answer its quiz into `answers.md`, write `feedback.md` in the required sections, and keep this diary.
**Inferred user intent:** The editor wants to know, before publication, where the article fails to teach — not a summary or a proofread, but an honest record of what a prepared reader could and could not get out of the text.
**Commit (code):** N/A (no repository work, no commits in this session).

### What I did
- Read `TASK.md`, `article.md` (all of 9.1–9.12 plus references), `glossary.md`, and `diary-format.md`.
- Made a first-pass list of every term in the article that was neither defined in the text nor present in the glossary, and checked each one against the glossary before keeping it: several candidates were already covered (*claim*, *arena*, *typestate*, *region*), and I dropped those.
- Marked the six cost claims in 9.4 and re-derived the arithmetic of the `a🙂b` byte/unit/code-point counts.

### Why
- Read-then-look-up, rather than look-up-then-read, because the glossary is organised by article and would otherwise be a lookup table consulted 40 times per page.
- I derived the `a🙂b` counts rather than trusting them, since a reader's ability to check one worked example is a good proxy for whether the rest of the section is checkable.

### What worked
- The house vocabulary was not a problem: every system term I needed was in the glossary, filed under "The system".
- The `a🙂b` example checks out: 1 + 4 + 1 = 6 UTF-8 bytes, 1 + 2 + 1 = 4 UTF-16 code units, 3 code points for U+0061, U+1F642, U+0062. That gave me confidence that the article's numeric examples are meant to be checkable.
- Section 9.2 and the 9.10 summary table were readable once, with no second pass.

### What didn't work
- The 9.4 instruction counts do not reconcile on any reading I could find: "about four: load the length, compare and branch, and the trap itself" names three things plus a trap, against a hand-written version that costs "two". No diagnostic to report — this is a prose gap, not a failing command.
- I could not compute anything for "wrapped rows", the fourth coordinate system in 9.3, because the article never says what one is or gives a wrapped-row value for the example.

### What I learned
- The article's cost arguments are of two different kinds. 9.2, 9.3, 9.6 and 9.7 argue "no run-time cost" from the mechanism itself, and those arguments I could follow and check. 9.4 and 9.5 argue from instruction counts that live in listings printed in other articles, and those I could only take on trust. That split became the backbone of the feedback.
- The glossary's type list (`i32`, `bool`, `string`, `buffer`, `record`) is the *current* language, so a reader who checks it while reading 9.3 or 9.4 will think `index`, `distinct` and `enum` are mistakes rather than proposals.

### What was tricky to build
- Distinguishing "term the article defines late" from "term the article never defines". The state record is used from 9.2 and given its rule only in 9.5; "dependent types" is used in 9.4 and never defined at all. I kept the two cases in separate feedback sections (passages I re-read, versus terms never explained) rather than merging them, since the fix differs.

### What warrants a second pair of eyes
- Whether my reading of the fact-discarding rule in 9.4 is what the author meant: "an access `s.charCodeAt(i)` needs no upper-bound check" while "any call" discards the fact. I read the access as consuming the fact rather than invalidating it; a reader who reads it strictly would find 9.4 self-contradictory.
- Whether "storing it in the state" should count as consuming a linear `Grant` (9.6) — the article asserts it does, and the arena rule in 9.5 forbids storing references in state, which reads like a tension until one notices a handle is a scalar.

### What should be done in the future
- Re-read Article 2 (Experiment 1), Article 4 (ABCD, local checking), Article 5 (operand stack, the seven-instruction loop) and Article 7 (bounds checks, acyclic call graph, fuel) to check whether the numbers this article borrows are stated there. Step 1's finding that 9.4 depends on another article's listings is the reason.

### Code review instructions
- Start with `article.md` §9.4 and §9.5, the two sections whose evidence is external to the article; compare against the feedback sections "Claims I could not verify" and the section scores.
- Files produced: `answers.md`, `feedback.md`, `diary.md`.

### Technical details
- `article.md`: 12 numbered sections, 6 feature proposals (enums, distinct types, guard facts + `index`, regions/arena, linear handles/typestate, reactor-usage effects), 2 deferred directions (resource bounds in types, gradual typing), one 6-row summary table.
- `glossary.md`: 9 groups; terms carry the article number that introduces them, all ≤ 9.

## Step 2: Answering the quiz

I answered the six questions in 9.12 into `answers.md`, in the article's own order and numbered the same way, two to six sentences each with a `Confidence:` line. The constraint I set myself was to answer only from the text, and to write the confidence number honestly rather than uniformly — a question I answered by quoting a single sentence should not be scored the same as one I had to infer.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer 9.12 into `answers.md`, numbered like the questions, 2–6 sentences each, in my own words, with working shown where a question asks for a calculation, and a `Confidence: N` line after each.
**Inferred user intent:** A quiz that the article's own text can grade, so the confidence numbers become evidence about which sections teach and which only assert.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six answers and six `Confidence:` lines, plus a short "Notes on confidence" section explaining the three non-5 numbers.
- For question 2, wrote out the byte / code-unit / code-point counts of `a🙂b` and the concrete offset mismatch (code-point column 2 corresponds to code-unit offset 3).
- For question 4, wrote the signedness argument explicitly: `at = -1` satisfies a signed `at < text.length`, so only the upper half of the check is discharged.

### Why
- Two to six sentences forced me to state the mechanism rather than point at the section, which is the test of whether I had understood it.
- Showing the calculation for question 2 rather than quoting "six bytes, four code units and three code points" tests the article's most checkable example.

### What worked
- Questions 1, 3, 4 and 5 were answerable by locating one or two sentences and paraphrasing: the enumeration examples (9.2), the three discarding events (9.4), the unsigned `index` argument (9.4), and the two arena rules (9.5) are all stated outright.
- Question 6 was answerable from a single sentence that anticipates the doubt: "They need not have consumed them in the same way; one branch may revoke a grant that the other stores."

### What didn't work
- Question 2's fourth coordinate system: I could write the name "wrapped rows" and nothing more, because 9.3 defines neither the term nor the mapping, and gives no wrapped-row count for `a🙂b`. Scored 4, not 5, for that reason alone.
- Question 3's phrase "the three kinds of event" does not match the text's own enumeration. The text gives "until `i` or `s` is assigned or any call is made" — two kinds of event, three instances. I answered with the three instances (assignment to `i`, assignment to `s`, any call) and flagged the mismatch rather than silently choosing.

### What I learned
- Answering the quiz was a better diagnostic than the reading pass. Reading, 9.4 felt clear; answering question 4 showed that its clarity comes from one well-written sentence ("the guard `at < text.length` is exactly the comparison the bounds check would make"), which is exactly the kind of sentence the rest of the section lacks for its cost claims.
- Four of six questions ask for a mechanism that the article states in a single sentence, and the two that ask for a *number* (question 2's counts) or a *list of four* (question 2) are where the article is thin. The quiz is therefore easier than the article's own evidence standard.

### What was tricky to build
- Question 6 required deciding what "the same set of handles" quantifies over. Reading it as "the same number of handles" makes the following sentence nonsense, so I read it as "the same handles"; that decision is recorded in the notes at the end of `answers.md` so an editor can disagree with it explicitly.

### What warrants a second pair of eyes
- Answer 4's last step: I assert that an unsigned guard "implies the whole check" for an `index`-typed variable. The article says this in one sentence; I could not test it against a case where the length is a computed expression rather than a field, and I did not try to construct one.

### What should be done in the future
- If the article is revised, question 2 should either drop the fourth coordinate system or the section should define it; and question 3 should say "which events" rather than "the three kinds of event" unless the text is rewritten to list three kinds.

### Code review instructions
- Read `answers.md` against `article.md` §9.2, §9.3, §9.4, §9.5, §9.6 — one answer per section, in order.
- Validation: every claim in `answers.md` should be traceable to a sentence in the article; where it is not, the confidence line should be below 5.

### Technical details
- Conflicts found between quiz wording and text: question 2 (wrapped rows undefined), question 3 ("three kinds of event" versus two kinds / three instances), question 6 ("the same set of handles" ambiguous).
- Confidence distribution: 5, 4, 5, 5, 5, 4.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections, in the required order. The hard part was not finding complaints — there were plenty — but separating the three categories the editor asked for, because they overlap: a passage I re-read is often a claim I could not verify, and a term used before explanation is often why I re-read a passage. I resolved it by keeping quotes in the first section, bare one-line entries in the second, and reserving the third section for claims about the world or the repository rather than about the prose.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Write `feedback.md` with the six named sections, scoring each numbered section 1–5 with one sentence of reason, and quoting rather than paraphrasing wherever I criticise.
**Inferred user intent:** Actionable editing notes that an author can act on section by section, with enough quoted evidence that they do not have to re-read the whole article to find the problem.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: 8 quoted passages, 14 term entries, 12 unverifiable claims, a 12-row section score table, three quiz-answerability notes, and one add / one cut.
- Cross-checked every term in the "never explained" list against `glossary.md` before keeping it, and dropped all the house vocabulary that the glossary covers.
- Chose to score 9.4 and 9.5 at 3 and 9.8 at 3, keeping 9.2, 9.10 and 9.11 at 5, so the scores say *where* the article is weak rather than averaging to a vague middle.

### Why
- I quoted rather than paraphrased in the first section because a paraphrase of an unclear passage is itself unclear, and the author needs the exact wording to see the ambiguity.
- I separated 9.4's problem (numbers I cannot check) from 9.5's problem (facts I need in order to picture the design) even though both scored 3, because the fixes are completely different: 9.4 needs a listing, 9.5 needs a paragraph on where the memory comes from.
- For "one thing to cut" I picked a sentence for coherence rather than for length, and said so, because the instruction is about editing judgement, not word count.

### What worked
- The claim-by-claim pass over 9.4 and 9.5 produced the most useful feedback, because those are the two sections where the article asks the reader to trust a number.
- Scoring 9.2 and 9.11 at 5 gave the table contrast: it shows the article can do this (enumerations, key points) and where it stops doing it.

### What didn't work
- I could not verify any of the 12 external claims, and I have deliberately not softened them into "perhaps". Nothing in the directory contains the code, so the honest position is that they are unverifiable *from the article*, which is what was asked.
- The "one thing to cut" was genuinely hard: most of the article's bulk is load-bearing. The capturing-types sentence was the only paragraph I could remove without the argument losing a step.

### What I learned
- The article is strongest exactly where it is narrowest: 9.2 and 9.3 change no generated code, and both are argued entirely from within. The trusting passages all involve *cost* — instructions per check, instructions per allocation, 105× slowdowns — which is where a reader has no way to push back.
- Reading with the task's categories in mind changed what I noticed. On the plain read I would have said "9.5 is clear"; trying to answer "what would I need to implement it?" exposed the missing memory budget in one question.

### What was tricky to build
- The boundary between "terms used before explained" and "passages I had to read twice". The state record is the clear case: it is both a term used early and the reason I re-read 9.5. I listed it in the terms section and did not quote it again in the passages section, to avoid double-counting the same defect.

### What warrants a second pair of eyes
- My score of 3 for 9.8 may be harsh, since a section whose purpose is to say "do not build this" does not need a worked example in the same way 9.4 does. An editor may reasonably move it to 4.
- The recommendation to add an instruction listing assumes such a listing exists in Article 2 or Article 5. I have not read those articles in this session, so the suggestion may be "add a pointer" rather than "add a listing".

### What should be done in the future
- If the editor wants the cost claims audited rather than flagged, the next step is to read Articles 2, 4, 5 and 7 and check the borrowed numbers at source; the list under "Claims I could not verify" is written so each item can be checked off one at a time.

### Code review instructions
- Read `feedback.md` top to bottom; each section is independent. The section-score table is the summary an author would act on first.
- Validation: every item in "Terms used before they were explained" should be absent from `glossary.md` — I checked all of them, but a second check is cheap.

### Technical details
- Sections scored: 9.1–9.12. Distribution: one 5-heavy group (9.2, 9.10, 9.11), one 3-group (9.4, 9.5, 9.8), the rest 4.
- Deliverables in this directory: `answers.md`, `feedback.md`, `diary.md`. `article.md` and `glossary.md` were not modified.

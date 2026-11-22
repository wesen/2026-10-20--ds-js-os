# Work diary — student read of "Safety by Construction"

## Step 1: Read the task and the article end to end

I opened `TASK.md` first, which told me to read `article.md`, answer its quiz into `answers.md`, write `feedback.md` with six named sections, and write this diary in the format of `diary-format.md`. I then read `article.md` straight through without stopping, then read `diary-format.md` so I knew what shape this file had to take. Nothing was run; the session was reading and writing only.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, follow its four numbered instructions in sequence, and finish with the single line `DONE`.
**Inferred user intent:** An editor wants an honest pre-publication reader's report: does the article teach, where does it fail, and can a reader answer the quiz from the text alone.
**Commit (code):** N/A — no code changed; only three markdown files were created.

### What I did
- Read `/TASK.md`, `article.md` (sections 7.1–7.9 plus references), and `diary-format.md`.
- Noted on the first pass where I stumbled, without fixing anything yet: the fuel decrement amount in 7.5, the reactor term in the stack bound in 7.4, the "confined" row of the 7.6 table, and the mermaid edge direction in 7.4.

### Why
- Reading once without note-taking was deliberate, so that "passages I had to read twice" would reflect a genuine first read rather than a search for problems.

### What worked
- The article's own structure made the first pass easy to map: 7.1 properties, 7.2 mechanisms, 7.3–7.5 source-level promises, 7.6 verifying output, 7.7 hardware, 7.8 summary, 7.9 quiz. The 7.8 key points acted as a check that I had understood each section.
- Quoting the native loader comment in 7.1 meant I could answer question 1 from the text rather than from background knowledge.

### What didn't work
- No command or tool failures occurred. There were no diagnostics to record.
- My first reading of 7.6 was genuinely disordered: the seven-row check table uses `sp`, "frame access" and "confined" before any of the three is defined, and I had to go back to section 7.5 and then forward to the mask/add paragraph to assign meanings. That is a reading failure caused by ordering, not by my unfamiliarity.

### What I learned
- The article is careful about hedging (7.7 says outright "plausible and unproven"), which made the unhedged numbers in 7.6 ("a few hundred lines of C") stand out as inconsistent.
- Much of the load-bearing detail lives in Article 1 and Article 5, so my reading was partly of a fragment rather than a self-contained text; I had to decide, per question, whether deferral counted as a teaching failure.

### What was tricky to build
- The hardest thing to do honestly was separate "I could not answer" from "I had to think". Only question 5 came near the first category, and it needed one parenthetical clause in 7.6 to be rescued. I recorded that nuance rather than calling the question unanswerable, because it is not.

### What warrants a second pair of eyes
- My claim that a pattern check can still match when the compare uses the wrong register: the article supports it only with "bounds-checked against *some* length word". Someone who knows the actual emitted sequence should confirm that a wrong-register compare would not break the pattern outright.

### What should be done in the future
- If the article is revised, ask a second reader to answer question 5 with the pattern-checking paragraph covered, to see whether section 7.6 stands without it.

### Code review instructions
- Read `answers.md` beside section 7.9 of `article.md`, and `feedback.md` beside the passages it quotes, to check that every quote exists and is attributed to the right section.

### Technical details
- Article under review: `article.md`, sections 7.1–7.9, 18 references.
- Files produced: `answers.md`, `feedback.md`, `diary.md`.
- Scope limits: current directory only; no web access; no reading of Article 1, Article 5, Article 6, Article 8, Article 9 or the native loader source, all of which the article cites.

## Step 2: Answer the six quiz questions

I wrote `answers.md` with one numbered answer per question, two to six sentences each, plus a `Confidence: N` line. I wrote them from the article alone, in my own words, and showed the reasoning where a question asked for an argument rather than a fact.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer all six questions in 7.9, numbered as the article numbers them, with confidence ratings.
**Inferred user intent:** Test whether the quiz is answerable from the text without outside knowledge, and whether the article's explanations actually transfer.

### What I did
- `answers.md`: six answers, each with a confidence line; question 2 and question 3 carry the argument in numbered steps rather than a conclusion.
- Question-by-question confidence: 1 → 5, 2 → 5, 3 → 5, 4 → 5, 5 → 4, 6 → 4.

### Why
- I gave 5 only where the article states the answer more or less explicitly (the ordering argument, the no-return stall, the three properties). I gave 4 where I had to combine two separated passages: 7.6's pattern-checking caveat, and the cost rows of the 7.7 comparison table.

### What worked
- Questions 1, 2 and 4 were answerable almost directly from quoted or tabulated text; 7.1's tables and 7.4's ordering argument did the work.
- Question 6 was answerable from the 7.7 comparison table, but only by reading "Cost per reactor call: a jump" versus "a trap" as an advantage rather than a cost column.

### What didn't work
- Question 3 asks for "the two quantities that are summed". The article's sentence gives the frame-size sum and then "the stack needed by the deepest reactor function that chain can reach". That phrase is ambiguous about max-over-reachable-reactor-calls, so my answer states the maximum-over-reachable reading explicitly and I noted the inference instead of presenting it as quoted.
- Question 5: my first draft answered "masking, because it does not depend on the compiler being right", which is too loose. Address masking still depends on the compiler having emitted the mask. The narrower and correct point is that the verifier can confirm presence of a two-instruction sequence, whereas it cannot confirm a comparison tested the right length word. I rewrote the answer to say that.

### What I learned
- The distinction in 7.6 is between trusting a compiler to have chosen the right *register* (unverifiable cheaply) and trusting it to have emitted a *fixed instruction pair* (verifiable), not between trusting and not trusting the compiler at all. That distinction is what makes question 5 work.

### What was tricky to build
- Question 4's "does fuel let the handler finish its work later?" invites the wrong answer. The article is explicit that fuel ends the turn with a fault, and that continuing work is Article 8's business. I answered no, quoting "Fuel stops a program; it does not schedule it", and added that a legitimate handler must divide work across turns.

### What warrants a second pair of eyes
- My answer to 5 argues that a wrong-register compare still satisfies the fixed pattern. If the real emitted sequence binds specific registers positionally, a wrong-register bug might fail the pattern and be caught — which would change the answer from "only masking confines" to "masking confines unconditionally; pattern checking confines unless the bug also breaks the pattern". The article does not settle this.

### What should be done in the future
- The article should show the actual emitted bounds-check sequence so that question 5 has a definite answer rather than a plausible one.

### Code review instructions
- Compare each answer to the section named in it; check that no answer adds facts not present in `article.md`.

### Technical details
- Answer file: `answers.md`. Questions: `article.md` §7.9.
- Sections relied on: 7.1 (properties table), 7.2, 7.3, 7.4 (ordering argument and caution), 7.5 (fuel clarifications), 7.6 (checks table, masking), 7.7 (comparison table).

## Step 3: Write the feedback report

I wrote `feedback.md` with the six required sections in the required order, quoting short passages verbatim and naming what was missing each time. I scored each numbered section from 1 to 5 with one sentence of reason, listed which quiz questions the text did not fully support, and chose one addition and one cut.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce an editor-facing report covering unclear passages, undefined terms, unverifiable claims, per-section scores, unanswerable questions, and one addition plus one cut.
**Inferred user intent:** Give the editor actionable, located criticism rather than a general impression.

### What I did
- `feedback.md`: five quoted passages I had to reread, sixteen undefined or late-defined terms, ten unverifiable claims, nine section scores with a table, three quiz questions flagged as partly unsupported, and one add / one cut.
- Section scores: 7.1 → 5, 7.2 → 4, 7.3 → 4, 7.4 → 5, 7.5 → 4, 7.6 → 3, 7.7 → 3, 7.8 → 5, 7.9 → 4.
- Addition proposed: one worked micro-example (three functions, stated frame sizes, computed stack bound, the emitted back-edge and mask sequences with instruction counts).
- Cut proposed: the CHERIoT sentence closing 7.7.

### Why
- I scored 7.6 and 7.7 lowest because both introduce vocabulary at the point of use rather than before it, and both ask the reader to hold a table row in mind until a paragraph explains it.
- I chose the worked example as the addition because nearly every quantitative claim in the article is asserted without a number a reader can check: the stack bound, "two or three instructions per loop iteration", "two instructions per access", "a few hundred lines of C".
- I chose the CHERIoT sentence as the cut because it is the only passage that adds a new architecture and a new term without affecting the section's conclusion.

### What worked
- Quoting the loader comment and the tables made several criticisms easy to justify with the article's own words, for example the tension between "the firmware already uses PMP to separate code from data" and "what is not known is how many entries can be spared".

### What didn't work
- Scoring the quiz section (7.9) as if it were teaching content is slightly unfair to it; the score of 4 reflects the article's coverage of the material the questions test, not the questions themselves. I did not change the number but stated the basis in the reason column.

### What I learned
- The article's weakest habit is deferral without marking: it forwards *world*, *turn budget*, *engine*, *reactor* and *trap* to Article 1 in one sentence, then uses them as if defined — and unlike those five, *nucleus* and *CJI* are never forwarded anywhere.
- Its strongest habit is stating what is unknown; 7.7's "plausible and unproven" paragraph is the model the rest of the article should follow when quoting sizes and costs.

### What was tricky to build
- Deciding what counts as an unverifiable claim rather than a citation. I kept a claim only when the article gives a number or a rule and no way to check it, and I listed the missing evidence for each; purely attributed attributions ("Native Client used this approach for jumps") I left out because a citation is adequate for them.

### What warrants a second pair of eyes
- The term list may be generous: *frame* and *operand stack* are explicitly credited to Article 5, so an editor may consider them properly deferred rather than unexplained. *nucleus*, *CJI* and *handles* are the ones I would defend as genuine gaps.

### What should be done in the future
- If the article adds the worked example, re-score 7.4, 7.5 and 7.6; each lost points for numbers a reader could not check.
- Replace "the deepest reactor function that chain can reach" with an explicit maximum and a one-line formula.

### Code review instructions
- Check each quoted passage in `feedback.md` against `article.md` for exact wording, and check that each section score matches a section number that exists (7.1 to 7.9).

### Technical details
- Feedback file: `feedback.md`. Report sections, in order: Passages I had to read twice; Terms used before they were explained, or never explained; Claims I could not verify; Section scores; Questions the article did not let me answer; One thing to add and one thing to cut.
- Limits: no access to the other articles or to `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c`, so the loader quotes were taken as the article reports them.

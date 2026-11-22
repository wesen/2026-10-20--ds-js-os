# Investigation entry

## Step 1: Reading the article and the glossary

I read `article.md` once without any aids, then read `glossary.md`, then went back through the article section by section looking up terms as a reader would. The aim was to arrive at the quiz having already marked the places where I had to stop, so that the feedback would record real hesitation rather than a reconstruction after the fact.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Work through the four numbered instructions in `TASK.md` in order: read the article (consulting `glossary.md` as a reader), answer the "Check your understanding" questions into `answers.md`, write `feedback.md` with the six required sections, then this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest pre-publication test of a teaching article — specifically, evidence about whether the article teaches what it claims to teach, and where a motivated reader is left without enough to proceed.
**Commit (code):** N/A — no repository operations, this is a reading and writing task.

### What I did
- Read `TASK.md`, `article.md`, `glossary.md`, `diary-format.md` in one go; files are small (articles ~350 lines).
- Second pass over `article.md` section by section (10.1–10.9), checking each unfamiliar term against the glossary.
- Checked the article's own arithmetic as a reader would, since two of the quiz questions depend on numbers: Editor 1730 / 316 = 5.47 (article says 5.5); Agenda (468 + 869) / 307 = 1,337 / 307 = 4.35 (article says 4.4); screen size 17 × 49 = 833 code units, 833 × 2 = 1,666 bytes of text, 17 × 4 = 68 bytes of headers, total 1,734 bytes (article says 1,734).

### Why
- Glossary-first reading is the only way to answer the task's instruction to "report only terms that neither the article nor the glossary explains": a term I happened to know still counts as explained if the glossary has it.
- Recomputing the figures distinguishes "claim I could not verify" from "claim I verified and it holds". Several numbers in the article are checkable in one line of arithmetic and those do not belong in the feedback's unverified list.

### What worked
- The glossary covers the issue-wide vocabulary well: *world*, *nucleus*, *engine*, *reactor*, *trampoline*, *fuel*, *verifier*, *arena*, *continuation*, *typestate*, *PMP*, *compile-time operand stack* all resolved without guessing. I used it about a dozen times.
- The three checkable arithmetic claims all came out right to the rounding the article used, so I had no arithmetic corrections to report.

### What didn't work
- Four terms in the article are absent from the glossary and unexplained in the text: *code unit*, *guard facts*, *static stack bound*, *mutation testing*. I marked each in place rather than looking them up, per the no-web rule.
- `article.md` line-level inspection via grep was not attempted; I read the whole file, which was feasible at this size but means my quotation of passages relies on my own transcription. I re-read each quoted passage against the file before writing `feedback.md`.

### What I learned
- The article is unusually good at stating its own limits (10.4's "a reference derived from the same source cannot reveal an error in the source's logic"), which makes the places where it *does* assert without evidence — build times of minutes, 660 kB, the six-byte budget — stand out more sharply.
- The article's argument structure is: inventory (10.1) → four proposals (10.2–10.5) → ordering (10.6) → falsification (10.7). The four proposals are the "structural changes" promised in the introduction, so that promise is kept.

### What was tricky to build
- Deciding what counts as a "term used before it was explained" rather than merely "a term I did not know". My rule: it goes in the list if (a) the glossary has no entry *and* (b) the article introduces it without a gloss at that point. That rule is why *WIT* and *fuel* are excluded and *code unit* and *guard facts* are included.
- The Agenda multiplier: 4.4 only appears if 869 lines of C reactor are counted as part of "the typed version". The article says so in a parenthesis, so the figure is verifiable but the convention behind it is a choice. I recorded it as both a checked number and an unverifiable claim, which felt contradictory until I separated "the arithmetic is right" from "the rule for what to count is unargued".

### What warrants a second pair of eyes
- My claim that the count check in 10.2 may not cover the assembly file's list at all. The article says the linker compares the count with "the length of the compiler's table"; if the real build also compares the assembly list, my feedback on 10.2 is unfair and should be softened.
- The 16 KiB message limit: I asserted in the feedback that it is the constraint deciding whether the binary protocol fits, based on 1,734 bytes being far below it. If the limit applies per world or per turn rather than per message, that point is weaker.

### What should be done in the future
- If the article is revised, add the worked example of one reactor function in all three files plus the proposed description; that was my single strongest criticism and the cheapest fix.
- Someone with access to the project's records should check whether the "device-language study" and the "Editor capacity design note" can be cited by name, since three claims lean on them.

### Code review instructions
- No code. Read `answers.md` and `feedback.md` against `article.md`; the quotations in `feedback.md` are the checkable part.

### Technical details
- Environment: single directory, no web access, no build. Files read: `TASK.md`, `article.md`, `glossary.md`, `diary-format.md`. Files written: `answers.md`, `feedback.md`, `diary.md`.

## Step 2: Answering the quiz

I answered the six questions in 10.9 into `answers.md`, numbered as asked, two to six sentences each, in my own words, with the arithmetic shown where a question turns on a number. Each answer ends with a `Confidence: N` line.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `answers.md` in the form instruction 2 specifies: numbered like the questions, 2–6 sentences, own words, working shown for calculations, `Confidence: N` after each.
**Inferred user intent:** The editor wants to see whether the quiz can be answered from the text alone, and where a confidence number is low, that flags a teaching gap.
**Commit (code):** N/A.

### What I did
- Wrote six answers (Q1 count-check scope, Q2 which screen steps are text-only, Q3 why deleting annotations is insufficient, Q4 what a same-source reference can and cannot catch, Q5 why `await` precedes the ports, Q6 one prediction and its refutation).
- Used the article's own figures in Q3 (the rewrite table), Q5 (5.5 and 4.4, and the twelve applications), and Q6 (593 versus 1,529).
- Kept each answer within the sentence limit; counted sentences rather than paragraphs.

### Why
- I chose two constructs from 10.4's table (i32 `+` needing `(a+b)|0`, i32 `*` needing `Math.imul`) for Q3 because the question asks for two *specific* constructs, and those two are the ones whose rewrites the article spells out exactly. I mentioned two more briefly for completeness.
- For Q6 I picked the Files instruction-count prediction because it is the only row whose numbers are both restated in this article, so a reader can attempt the check without Article 5.

### What worked
- All six questions are answerable from the text plus the glossary. That is the main result of this step.
- Q2 and Q4 have answers that the article states almost explicitly (steps 3 and 5 "would remain"; the limit on a derived reference), so they were quick to write with high confidence.

### What didn't work
- Q1 cannot be answered fully from the text: the article says the linker compares the count with the compiler table's length but never says how the linker obtains that length, nor whether the assembly file's list is checked. I answered the part that is stated and said so. I kept confidence at 4 rather than 5 for that reason.
- One sentence-limit near-miss: my first draft of Q5 was seven sentences (it restated the multiplier derivation as a separate step). I merged the derivation into one sentence.

### What I learned
- Writing the answers exposed that the article's prose carries more of the argument than its tables: the roadmap table's "Unlocks" column reads as fact, but the *reason* for the ordering (the obsolescence argument for `await`) exists only in 10.6's prose paragraph. A reader who skipped that paragraph would find Q5 hard.

### What was tricky to build
- Fixing confidence values honestly. Confidence 5 would mean "the text states this and I can check it"; I reserved 4 for answers where the text states the conclusion but leaves me supplying one inference. No answer fell to 3, which I take as a good sign for the article.

### What warrants a second pair of eyes
- Q1: whether "the linker compares it with the length of the compiler's table" is meant to cover the assembly list too. My answer says the check misses reordering and says nothing about the assembly file being unchecked, which is the cautious reading.

### What should be done in the future
- If the article is revised, 10.2 should say in one clause how the count check is performed, which would let Q1 be answered at confidence 5.

### Code review instructions
- Compare each answer's quoted figures with `article.md` sections 10.1, 10.2, 10.3, 10.4 and 10.7.

### Technical details
- Arithmetic used in answers: 833 × 2 + 17 × 4 = 1,734 bytes; 1,730 / 316 ≈ 5.5; (468 + 869) / 307 ≈ 4.4. None contradicted the article.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, favouring quoted passages over paraphrase so that the editor can locate each complaint, and scoring each numbered section with a reason.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** `feedback.md` must contain exactly the six headed sections listed in instruction 3, with quotations, one-line term entries, per-section scores 1–5 with a one-sentence reason, the unanswerable quiz questions, and one addition plus one cut.
**Inferred user intent:** Actionable, located criticism rather than general impressions — the editor is deciding what to change before publication.
**Commit (code):** N/A.

### What I did
- Collected six passages during the reading pass and quoted the shortest span that shows the problem in each.
- Listed nine unexplained or thin terms, then deliberately noted which familiar-looking terms the glossary *does* cover, so the list is not read as "everything I did not know".
- Separated "claims I could not verify" into nine items, each with the missing evidence named (uncited design note, uncited device-language study, unstated counting rule, unsourced 16 KiB limit, no measurement behind the compositor claim).
- Scored sections 10.1–10.9 from 3 to 4; no section fell to 1 or 2, and none reached 5.
- Chose the addition (a worked example of one reactor function across the three files and the proposed description) and the cut (the repeated six-bytes sentence in 10.3).

### Why
- I put the term list in the form "term (where it appears) — what is missing" so the editor can fix each by adding one glossary entry or one gloss.
- I gave scores of 3 to the sections that name undefined components in their tables (10.2, 10.5, 10.6, 10.7) rather than to the most abstract ones, because the undefined components are the actual teaching failure: a reader cannot follow a roadmap whose steps are named with terms the article never introduces.
- The addition had to be the highest-leverage fix. The article argues for generating three files from one description and never shows one line of any of them, so one example converts the central proposal from assertion to demonstration.

### What worked
- Every criticism has a quoted location, so the feedback can be checked line by line against `article.md`.
- The verified/unverified split held up: I could report that the article's own byte arithmetic and multipliers come out right, which makes the remaining unverified claims (build times, 660 kB, six bytes per unit, the study) sharper and more credible as criticisms.

### What didn't work
- I could not verify whether the article's claim that the compositor is the largest consumer of screen-path time is fairly attributed to Article 2, since only this article was in scope. I recorded it as an attribution I cannot check rather than as an error.
- The "one thing to cut" section forced a single choice; there were two candidates (the repeated six-byte sentence and 10.8, which restates 10.1–10.5). I chose the repetition inside 10.3 and named 10.8 as the runner-up in the section text — but the section is supposed to be one line each, so that note is slightly against the brief.

### What I learned
- Section 10.7, the falsifiability table, is the article's best structural idea and also its weakest section in practice: four of five rows lean on numbers from other articles that this one does not restate. A teaching article that promises "here is how you would know I am wrong" should carry the numbers it asks the reader to check.
- The article's honesty about its own limits (10.4) makes its silent assertions (build times, sizes) feel like lapses rather than normal hand-waving. Readers calibrate trust on the honest parts and are then surprised.

### What was tricky to build
- Distinguishing "term used before it was explained" from "term never explained". *Trampoline* is used in 10.2 before the reader meets the glossary entry, but the glossary has it and 10.2 explains the role in the same paragraph, so it goes unmentioned. *Code unit*, by contrast, has neither a glossary entry nor a gloss, and the article's only quantitative claim about message size rests on it. The rule I settled on is stated in the term list itself so the editor can see the criterion.
- Scoring. A section can be clear prose yet unteachable because one term is undefined; I tried to score the teaching outcome rather than the writing quality, which is why 10.7 scores 3 despite being well written.

### What warrants a second pair of eyes
- My 10.2 criticism (that the mechanism of the count check is not described) depends on how much a reader is expected to know about linkers. If the series' earlier articles describe the header and the linker check, this criticism should move from "never explained" to "assumed from Article 1".
- The claim that the binary protocol fits inside the 16 KiB message limit is mine, not the article's; I use it to argue the limit is the deciding constraint. Someone should confirm the limit's scope before that point is taken up.

### What should be done in the future
- Add the worked example of one reactor function in all three files plus the proposed interface description, and one screen record row.
- Either cite the device-language study and the Editor capacity design note, or drop the figures that rest on them.
- Give *code unit*, *guard facts*, *static stack bound* and *mutation testing* one-line glossary entries, since each is the sole unexplained word in a sentence that carries a quantitative or falsifiable claim.

### Code review instructions
- Read `feedback.md` beside `article.md`; each item quotes a locatable span. Highest-value checks: the 10.2 count-check scope, the Agenda counting convention, and the 16 KiB limit's scope.

### Technical details
- Scores given: 10.1 = 4, 10.2 = 3, 10.3 = 4, 10.4 = 4, 10.5 = 3, 10.6 = 3, 10.7 = 3, 10.8 = 4, 10.9 = 4.
- Unexplained-term list: code unit, guard facts, static stack bound, mutation testing, forward calls with a cycle check, garbage collector, dynamic values, linker, relocated at boot, 16 KiB message limit.
- Unverified-claim list: nine items, of which the checkable arithmetic (1,734 bytes; 5.5; 4.4) was removed after verification.

# Investigation entry

## Step 1: Reading the article end to end

Read `article.md` straight through with `glossary.md` open, then reread the passages where a conclusion depended on a number I had not been given. Working notes were kept only in memory and then distilled into `feedback.md`; the article's arguments are mostly arithmetic, so most of the difficulty was checking subtractions rather than parsing prose.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four instructions in `TASK.md`: read the article, answer its quiz into `answers.md`, write structured feedback into `feedback.md`, and keep this diary; then reply with a single line `DONE`.
**Inferred user intent:** Pre-publication teaching review: find out whether a competent reader can actually learn from the article and do its exercises, and where the text has to be repaired.
**Commit (code):** N/A.

### What I did
- Read `TASK.md`, then `article.md` (sections 6.1–6.10 plus references) in one pass, and `glossary.md` as a lookup table.
- Checked every calculation in 6.3, 6.4, 6.5 and 6.6 by hand: 3.14 − 1.99, 1.99/120, 3.14/120, 8.8 − 1.6, 1150/7.2, 240/88, 0.41 × 3.14, 4.76/2.66, 4.76/3.32, 710/768, 528/768.
- Wrote reading notes as candidate feedback items: passages requiring a second pass, undefined terms, unverifiable claims, per-section clarity.

### Why
- The instructions separate comprehension ("can a reader follow it") from verifiability ("can a reader check it"), so the notes were kept in those two buckets from the start rather than being reconstructed at the end.
- Checking the arithmetic first was deliberate: it is the article's main form of argument, so an arithmetic slip would outrank any prose complaint in importance.

### What worked
- Section 6.5 checked out exactly: 8.8 − 1.6 = 7.2 ms, 1150 / 7.2 = 159.7 ≈ 160 turns. So did 240/88 = 2.73 ≈ 2.7, 0.41 × 3.14 = 1.29 ≈ 1.3 s, 4.76/3.32 = 1.43 and 4.76/2.66 = 1.79, and 1.99/120 = 16.6 ms, 3.14/120 = 26.2 ms against the stated "17 ms or 26 ms".
- The five-input table in 6.3 lines up one-to-one with the installer's record fields, so that section could be verified from the text alone.
- Question 5 and question 6 were answerable in a single reading because both figures and their denominators are printed in 6.6.

### What didn't work
- The subtraction "3.14 − 1.99 s" is presented as the cost of "translate to RV32 and link only" while the table cell says "about 1.2 s". 3.14 − 1.99 = 1.15, so either 1.2 is a rounding of 1.15 (unlabelled) or it is a second measurement (unattributed). I could not resolve which from the text; recorded in `feedback.md` rather than guessed at in `answers.md`.
- The 6.5 conclusion switches units from turns to key presses without a conversion, which blocks a precise reading of the answer to question 3.
- Two CJI compile figures, 7,028 ms (boot compile) and 7,047 ms (rebuild after a damaged module), are 19 ms apart; I could not tell whether that is a coincidence of two runs or one number reported twice. Recovery: quoted both verbatim in the feedback and stated the ambiguity instead of harmonising them.

### What I learned
- The article is strongest where it makes a design decision explicit and then defends it with a table (6.1, 6.3, and the storage comparison in 6.4); it is weakest where it reports a measurement made elsewhere and then builds three conclusions on it (6.2, 6.7).
- Terms are the recurring failure: "import table" in the 6.8 diagram, "frontend"/"backend", "link", and "RV32" all appear as known vocabulary while the glossary covers only "lowering", "trampoline" and "engine".
- The glossary is well organised for the series but is no substitute for the article, because several load-bearing terms (flash, link, hash, frontend) never made it in.

### What was tricky to build
- Deciding the boundary between a term the article explains inline and a term it never explains. The rule applied: a term counted as explained only if the gloss appears at or before first use and defines the word itself, not merely its context. That is why "frontend" (glossed) is listed as a minor gap but "backend" (used bare in 6.6) is not.

### What warrants a second pair of eyes
- Whether question 3 should be reworded or the 6.5 text given an explicit turns-per-key-press figure; my answer assumes one turn per key press.
- Whether the "temporary interpreter" in 6.2 is a fact a reader is expected to know from Article 1; if so, it needs a pointer, because nothing in this article establishes it.

### What should be done in the future
- Give every reused measurement a provenance note (article, experiment, what was timed) at first use, since nine conclusions reduce to arithmetic on numbers printed elsewhere.
- Unify "reactor's function table" and "import table" in prose and diagram.

### Code review instructions
- Compare `feedback.md` "Passages I had to read twice" against sections 6.2, 6.4 and 6.8 of `article.md`; those are where the reader stalls. No commands are needed beyond reading the three markdown files.

### Technical details
- Article under review: `article.md`, sections 6.1–6.10, 3 tables in-text plus one mermaid flowchart, 9 references.
- Terms checked: all of `glossary.md`. Terms reported missing: import table, link/linker, frontend, backend, flash/firmware image, RV32, Experiment 3, device-language document/study, well-formedness, hash, turns-per-key-press.

## Step 2: Answering the quiz

Answered the six questions of section 6.10 into `answers.md`, numbered as asked, two to six sentences each, with the arithmetic of question 3 shown line by line. Confidence lines were assigned per answer according to how much the text itself supplied.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer from `article.md` and `glossary.md` only, in my own words, and be honest where the article does not settle the question.
**Inferred user intent:** Test whether the text is self-sufficient — if an answer needs information from outside the article, that is a finding for the feedback.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and a `Confidence: N` line after each.
- Question 3: showed 1,150 ms / 7.2 ms ≈ 160 turns, then split the answer into the boot-compile case and the cached case.
- Question 6: computed 240/88 = 2.73 to confirm the stated 2.7, and explained that the shared reactor dilutes the ratio.

### Why
- Confidence was set low (4) on questions 1, 3 and 4 because each requires accepting a fact the article asserts without demonstration: that compiler and reactor are "all part of the firmware image", that a key press is a turn, and that the slim-binary penalty was acceptable.
- Question 2 and questions 5 and 6 got 5 because the text states all the needed material directly.

### What worked
- Five of the six answers could be written from the article alone; question 6 in particular is fully determined by 6.6's own sentence about the reactor being the same C code in both modules.
- The two-slot write order (question 2) is stated as an explicit rule plus its power-loss consequence, so the answer needed no interpretation.

### What didn't work
- Question 3's conclusion ("a loss in any session shorter than 160 key presses") cannot be answered precisely; the calculation is in turns, the conclusion in key presses, and the conversion is nowhere. Answer given in turns with a note.
- Question 1 felt like a trap at first: the record has no compiler or reactor field, which appears to contradict 6.3's five-input key. Only the mapping table in 6.3 resolves it. Answered with that table cited.

### What I learned
- The quiz is fair: every question points at a specific, stated fact, and none requires material from Articles 1–5 beyond figures that are quoted inline (except the 14 ms load time, which no question asks for).

### What was tricky to build
- Keeping answers within two to six sentences while showing working: question 3 needed the arithmetic written out and the conclusion split in two, so the sentence budget was tight.

### What warrants a second pair of eyes
- My assumption of one turn per key press in answer 3. If a key press can produce several turns, the break-even point in key presses rises in proportion.

### What should be done in the future
- If the 6.5 sentence is fixed to say "160 turns", answer 3's caveat disappears and the question becomes fully closable from the text.

### Code review instructions
- Read `answers.md` against section 6.10 and check that each answer stays within two to six sentences and that the `Confidence:` lines are present and justified.

### Technical details
- Confidence values: Q1 4, Q2 5, Q3 4, Q4 4, Q5 5, Q6 5.
- Arithmetic shown: 3.14 − 1.99 = 1.15 s; 8.8 − 1.6 = 7.2 ms; 1150/7.2 ≈ 160; 240/88 = 2.73; 710/768 ≈ 0.92; 528/768 ≈ 0.69.

## Step 3: Writing the feedback

Pulled the reading notes into `feedback.md` under the six required headings, with quotes kept short and each complaint tied to a specific place in the text. The hardest part was separating "I did not understand this" from "the article does not support this", which are different problems requiring different fixes.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the six named sections, quote passages rather than paraphrasing them, score every numbered section, and name one addition and one cut.
**Inferred user intent:** An actionable repair list for the editor, ordered by what blocks a reader rather than by what is stylistically irritating.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: passages read twice (8 items), terms (11 items), unverifiable claims (9 items), section scores (10 items, 6.1–6.10), quiz questions that could not be answered, and one add / one cut.
- Quoted each problem passage in one or two sentences and named what was missing (an assumption, a unit, a definition, a method).
- Chose the "measurements used" box as the addition and the Maté paragraph as the cut.

### Why
- Section scores were assigned by asking one question per section: could I restate its conclusion and check it without leaving the article? 6.1 and 6.5 score 5 because I could; 6.2, 6.4 and 6.7 score 3 because I could state the conclusion but not check it.
- The addition was chosen to match the largest cluster of findings — nine of the unverifiable claims are numbers imported from elsewhere — rather than to add new material.
- The cut was chosen to be the least costly removal: the Maté paragraph's point is restated by the surrounding sentences.

### What worked
- The unverifiable-claims list converged on a single theme (numbers without provenance), which made the "one thing to add" recommendation obvious rather than arbitrary.
- Quoting the ambiguous passages verbatim surfaced the units problem in 6.5 (turns vs key presses) that I had only half-noticed while reading.

### What didn't work
- Scoring 6.8 was awkward: the flowchart is easy to follow but its label contradicts the prose, so structure and precision disagree. Scored 3 on the basis that a wrong term in a diagram propagates into the reader's vocabulary.
- I could not judge 6.7's Moddable and MicroPython paragraphs beyond noting that I cannot check them without the web, which the task forbids. Recovery: reported them as the reason for the 3 score and said plainly what I could not verify.

### What I learned
- The article's real weakness is not obscurity but borrowed authority: several numbers arrive with a citation to another article in the series and none of the measurements' conditions travel with them.
- Its real strength is the decision tables; each one reduces a design question to rows a reader can check.

### What was tricky to build
- Enforcing the "one or two sentences" length on quotes while keeping them intelligible out of context: most problem passages needed their neighbouring clause to make sense, so a few quotes carry a leading ellipsis.

### What warrants a second pair of eyes
- The 6.4 score of 3 and the recommendation to cut the sensor-network material pull in opposite directions; an editor may prefer to keep the history and shorten the storage discussion instead. My reason for preferring the history's removal is that the storage table is what the reader acts on.
- Whether "hash" and "flash" genuinely need glossary entries or are reasonable assumed background for this series' audience.

### What should be done in the future
- Add glossary entries for link/linker, frontend/backend, flash and firmware image, hash, and RV32; reconcile "import table" with "reactor's function table".
- State a turns-per-key-press figure in 6.5 or change the sentence to turns.
- Add the measurements box before 6.5.

### Code review instructions
- Read `feedback.md` top to bottom against `article.md`; verify each quote exists verbatim in the article and that each section score has a reason. Spot-check the five arithmetic claims in the "Claims I could not verify" section to confirm the numbers are as quoted.

### Technical details
- Sections scored: 6.1 (5), 6.2 (3), 6.3 (4), 6.4 (3), 6.5 (5), 6.6 (4), 6.7 (3), 6.8 (3), 6.9 (4), 6.10 (4).
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. No changes to `article.md`, `glossary.md`, `TASK.md` or `diary-format.md`.

# Investigation entry

## Step 1: Reading the article and the glossary

I read `article.md` straight through once without stopping to take notes, then a second time with `glossary.md` open beside it, marking every number and every term I could not resolve on the spot. The article is short enough to hold in one sitting (nine numbered sections plus a quiz), but it is dense with measurements, and several of them are quoted rather than derived, so the second pass was mostly about separating "number I can check" from "number I have to trust".

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Perform the four steps of `TASK.md` in order: read, answer the quiz, write feedback, write this diary, then reply `DONE`.
**Inferred user intent:** An editor wants a reader's honest report on where a pre-publication teaching article fails to teach, including a scorable quiz attempt as evidence.
**Commit (code):** n/a — no repository changes, only three new markdown files.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (full), `glossary.md` (full).
- Collected a list of ~40 candidate hard spots and cut it down to the ones that survived a second reading.
- Checked every arithmetic claim in the article by hand: 1.99 s / 120, 3.14 s / 120, 3.14 − 1.99, 0.41 × 3.14, 1.15 s / 7.2 ms, 4.76 / 3.32, 4.76 / 2.66, 240 / 88, 710 / 768, 140.6 s / 1 ms.

### Why
- Reading twice with the glossary open is the only way to distinguish "term the series defines elsewhere" from "term nobody defines"; the task asks specifically for the second kind.
- Recomputing the numbers separates the article's verifiable arithmetic (the break-even section) from its borrowed or assumed figures (the 1.2 s estimate, the 4.76 ratio).

### What worked
- The break-even arithmetic in §6.5 reproduces exactly: 3.14 − 1.99 = 1.15 s; 8.8 − 1.6 = 7.2 ms; 1.15 / 0.0072 = 159.7 → "about 160 turns".
- The CJI field-mapping table in §6.3 answers quiz question 1 directly and correctly.
- The two ratios in §6.6 are consistent with the module sizes: 240 / 88 = 2.73 → "a factor of 2.7".

### What didn't work
- I could not derive the 4.76 ratio. The article gives function count (120) and module sizes (240 kB, 88 kB) but never the aggregated function-body byte totals, so `4.76` is a bare measurement with no visible inputs. Recorded in `feedback.md` under unverifiable claims rather than as an error, since nothing contradicts it.
- I could not reconcile the three CJI timing figures (7,028 ms, 20 ms, 1,450 ms) into one comparison because their time origins are not stated.

### What I learned
- The article's weakest points are not its arguments but its *provenance*: the cases that teach well are the ones where the arithmetic is on the page (§6.5, §6.6); the cases that do not are the ones where a number arrives without its inputs (§6.2 memory peaks, §6.4's 1.2 s subtraction, §6.7's 627 → 198 ms).
- The glossary's `slot` entry has exactly two meanings and the article quietly uses a third (file-system storage slot A/B). A series glossary is only useful if new senses get added as they appear.

### What was tricky to build
- Deciding the boundary between "explained too late" and "explained adequately". My rule: if §6.3's appositive or the glossary sentence lets a careful reader reconstruct the meaning, it is late but acceptable; if I had to guess from context, it goes on the list. Under that rule "function table" stays (with a note), "import table" and "cryptographic hash" go on the list.
- Attributing ambiguity to a passage rather than to my own reading. Where the cause was my inference, such as "the same bytes on workstation and device", I filed it as an unverifiable claim, not as unclarity.

### What warrants a second pair of eyes
- Whether the subtraction 3.14 − 1.99 s really isolates translation to RV32. If the native build's frontend differs at all from the WebAssembly build's, the 1.2 s figure in the §6.4 table — and hence the whole middle row — is not sound, and that row is the article's pitch for the slim-binary design.
- Whether 710 KiB against a 768 KiB limit leaves enough headroom for the interpreter or runtime the world also needs; the article presents the limit as the binding constraint and the number as "close to it" without stating the remaining 58 KiB is enough.

### What should be done in the future
- Add the missing provenance for 1.5 MB / 2.5 MB, 43 kB / 660 kB, 4.76, 120 functions and the 8 MiB / 4.2 MiB partition figures, or drop the figures to one significant digit and label them estimates.

### Code review instructions
- Files produced: `answers.md`, `feedback.md`, `diary.md`. No source files touched. Validation is by reading: each answer must be 2–6 sentences with a `Confidence: N` line, and every feedback section must be present.

### Technical details
- Article: 9 content sections (§6.1–§6.9) plus §6.10 quiz of 6 questions and a 11-item reference list.
- Quiz answerability: 6/6 answerable; 2 required joining two paragraphs (Q4, Q6).

## Step 2: Answering the quiz

I answered all six questions from the text alone, writing out the working wherever a question asks for a number, then assigned a confidence to each. Only Q6 was less than certain: the reason the two ratios differ *is* stated in §6.6, but only in a parenthesis, so my answer is right for the wrong reason if a reader is expected to justify it independently.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer the six numbered questions in `answers.md`, numbered like the questions, 2–6 sentences each, with a `Confidence: N` line after each.
**Inferred user intent:** Give the editor a scored attempt that shows which questions the text actually supports.
**Commit (code):** n/a.

### What I did
- Wrote `answers.md` with six sections, each one paragraph of 2–6 sentences plus `Confidence: N`.
- Showed arithmetic in full for Q3 (1.15 s / 7.2 ms) and for the ratio check in Q6 (240 / 88).

### Why
- The task's sentence limit forced one point per question; I kept the article's own vocabulary (*firmware identity*, *frontend*, *function body*) rather than inventing terms.

### What worked
- Q1–Q5 were answerable in 3–5 sentences with confidence 5.
- Q3's arithmetic is fully determined by the text; no assumption needed.

### What didn't work
- Q6: I could not independently *derive* why the ratios differ; I had to lift the parenthetical explanation about the shared reactor. Confidence lowered to 4 and the point recorded in `feedback.md`.

### What I learned
- Questions phrased "give the reason they still considered the design worthwhile" expect the *motivation* (portability), not the *evidence* (the timing report). §6.4 buries the motivation behind the numbers, which is why I flagged it in the feedback.

### What was tricky to build
- Keeping to "2 to 6 sentences, in your own words" while showing working: I put the division inline rather than as a separate block so the paragraph still reads as prose.

### What warrants a second pair of eyes
- Q5: my "roughly 92 percent of the limit" is my own arithmetic (710/768), not the article's; if the editor wants only article claims, that clause should come out.

### What should be done in the future
- N/A.

### Code review instructions
- Read `answers.md`; check each answer is 2–6 sentences and that no answer introduces a fact not in `article.md`.

### Technical details
- Confidence assignments: Q1 5, Q2 5, Q3 5, Q4 5, Q5 5, Q6 4.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections, quoting short passages rather than paraphrasing them so the editor can jump to the text. The hard part was the section scores: scoring §6.4 a 3 while its table is one of the most useful things in the article felt inconsistent until I separated "useful to quote" from "sound as an argument", and the unstated assumption behind the 1.2 s subtraction is what pulled the score down.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with exactly the six sections named in `TASK.md`, honest where the article fails, and mentioning only terms that neither the article nor the glossary explains.
**Inferred user intent:** Actionable pre-publication review.
**Commit (code):** n/a.

### What I did
- Wrote `feedback.md`: 6 passages read twice, 8 term lines, 10 unverifiable claims, 10 section scores (6.1–6.10), 2 strained questions (no unanswerable ones), 1 addition, 1 cut.

### Why
- I quoted exact sentences so each complaint is checkable against the text; for the cut I chose a sentence whose removal costs nothing, rather than a paragraph whose removal would cost a step in the argument.
- I did not list terms the glossary covers (*reactor*, *engine*, *turn*, *lowering*, *trampoline*, *world*) even where they are used before Article 6 defines them locally, because the task restricts the list to terms nothing explains.

### What worked
- The four section-5 score of §6.3 and five of §6.5 are well supported: the first has a table whose columns are exactly the five inputs, the second shows all its arithmetic.
- The "add" recommendation (define the function/import table with a worked call-index example) follows directly from the undefined diagram label.

### What didn't work
- No failures in the mechanics; the difficulty was judgement, not tooling.

### What I learned
- The article's clearest sections are the ones where a table's rows are the *inputs of a computation* (§6.3) rather than *options* (§6.4), because the option rows invite the reader to check a sum that is never shown.

### What was tricky to build
- Distinguishing "used before explained" from "never explained" for *prelude*: it is glossed in one clause, so it is arguably explained. I kept it on the list because the gloss does not say what compiling it means or how the result is shared, and §6.7's 627 → 198 ms claim depends on that mechanism.

### What warrants a second pair of eyes
- My claim that §6.6's recommendation rests entirely on Article 5 is a judgement from one article; a reader with the whole issue may find that §6.6 is adequately supported elsewhere.

### What should be done in the future
- If the editor accepts the "add" suggestion, the glossary's *slot* entry should gain its third meaning at the same time, since §6.3 uses it and §6.6/§6.3 both depend on the reader knowing which slot is meant.

### Code review instructions
- Read `feedback.md` top to bottom; every quote should be findable verbatim in `article.md` (I checked each). Section scores should cover 6.1 through 6.10 with no gaps.

### Technical details
- Score distribution: two 5s (§6.1, §6.5), six 4s (§6.2, §6.3, §6.6, §6.8, §6.9, §6.10), two 3s (§6.4, §6.7).
- Files in this directory after the session: `TASK.md`, `diary-format.md`, `article.md`, `glossary.md` (untouched) and `answers.md`, `feedback.md`, `diary.md` (new).

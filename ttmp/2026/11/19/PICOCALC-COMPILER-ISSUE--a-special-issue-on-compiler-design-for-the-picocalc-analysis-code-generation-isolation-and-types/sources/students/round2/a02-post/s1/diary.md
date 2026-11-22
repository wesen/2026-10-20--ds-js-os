# Investigation entry

## Step 1: Reading the article and the glossary

I read `article.md` straight through once without stopping, then re-read sections 2.2 and 2.4 with `glossary.md` open beside them, looking up each unfamiliar term the way a reader would. The intent was to form an honest first impression of where the teaching holds and where it drops, before doing any arithmetic, so that the rereads I noticed afterwards are real rather than artefacts of already knowing the answers.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** TASK.md asks for four steps in order: read the article and glossary, write `answers.md`, write `feedback.md`, write `diary.md`, then reply with one line `DONE`.
**Inferred user intent:** An editor wants a pre-publication test of whether the article actually teaches, with the reader's confusion reported candidly rather than smoothed over.
**Commit (code):** none — this is a review task, no code changed.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (sections 2.1 to 2.9 plus references) and `glossary.md` in full.
- Checked every arithmetic claim in the text as I went: 52.9/33 = 1.60, 1.6/37.2 = 4.3 percent, 1/(1−0.043) = 1.045, 293+81+32+123+30 = 559, 84+5+146 = 235, 8.0+20.5+20.2 = 48.7, 1,988/16,792 = 118 µs, 175,860/36,917 = 4.76, 43,965/16,544 = 2.66, 43,965/13,255 = 3.32, 120+34+7 = 161.

### Why
- Reading first and computing afterwards separates "this sentence is unclear" from "this sentence's number does not add up", which the feedback needs to keep apart.
- Looking terms up in the glossary rather than relying on my own knowledge was the point of the exercise; my own background would have hidden several of the gaps I recorded.

### What worked
- All internal arithmetic in the article checks out except the percentage columns, which sum to 99 rather than 100 (both 2.4 and 2.8), and the 29.9 ms WebAssembly path, which matches 8.0 + 20.5 + 1.3 rather than the two-step sum the text implies is excluded.
- The section 2.1 interval table is self-sufficient: question 1 is answerable from it alone.

### What didn't work
- The glossary lookup for "Token" returned a definition of a split-phase operation token, which is not the sense used in section 2.4 ("16,792 tokens"). No recovery was needed, but it is a genuine trap and it is recorded in the feedback.
- Editor, Agenda and Files have no glossary entry, so no lookup path exists; I inferred from context that they are applications and marked this as a gap rather than silently filling it.

### What I learned
- The article's own honesty ("the model is weak, and its weaknesses are instructive") makes it easy to excuse numbers that are not shown, such as the 88 percent range-analysis figure or the diary's device build size. Being a reader rather than an editor, I had to keep asking what I could actually see in the text.
- The strongest teaching in the article is where a measurement is tied to a decision (2.3 and 2.7); the weakest is where a measurement is quoted without its table (the workstation profile).

### What was tricky to build
- Nothing was built. The tricky judgement call was deciding whether the two weak measurements in 2.2 make question 2 unanswerable or merely uncomfortable. I settled on "answerable but illuminated as weak", because the article supplies both numbers and both caveats.

### What warrants a second pair of eyes
- Whether my cut suggestion (dropping the framebuffer-capture row) loses a point the series makes later; Article 6 onward may lean on capture timings.
- Whether the "Editor/Agenda/Files" gap is real for this series' intended reader, who may have read Article 1 and know all three.

### What should be done in the future
- Check the glossary's *Token* entry against Article 8 to see whether a second sense is needed, or a disambiguation like the one *Slot* already has.

### Code review instructions
- N/A for code. Validate the arithmetic claims above against sections 2.2, 2.3, 2.4 and 2.5.

### Technical details
- Article revision referenced by the text: `60a38f0`. Article sections reviewed: 2.1–2.9 plus references (Amdahl 1967, Georges et al. 2007, Mytkowicz et al. 2009).

## Step 2: Answering the six questions

I answered the six questions in 2.9 in my own words, showing working for the two that ask for a calculation, and gave each a confidence from 1 to 5. I deliberately answered only from the article plus the glossary, and let the confidence numbers drop where the article left me guessing.

### Prompt Context
**User prompt (verbatim):** see Step 1 ("Read TASK.md and carry out every step in order." — TASK.md step 2)
**Assistant interpretation:** Write `answers.md`, numbered like the questions, two to six sentences each, with a `Confidence: N` line after each answer and visible working where a calculation is asked for.
**Inferred user intent:** To find out which questions the text actually supports, and to catch questions that look answerable but are not.
**Commit (code):** none.

### What I did
- Wrote `answers.md` with six numbered answers, each followed by `Confidence: N`.
- Showed working for question 2 (share and Amdahl limit) and question 6 (both per-token costs, including the 8.0 ms × 66 derivation of the second one).

### Why
- Question 2 needed the intermediate sum (35.6 + 1.6 = 37.2 ms) written out, because the article presents the two numbers separately and never adds them.
- Question 6 needed the 8.0 × 66 ≈ 528 ms step shown, since that multiplication appears nowhere in the article; it is the reader's own inference.

### What worked
- Questions 1, 3, 4 and 5 came out at confidence 4–5 straight from the text.
- Question 5's "what it does not establish" half is well supported by Experiment 3's own wording ("a plausibility check and not a proof").

### What didn't work
- Question 6's second cost cannot be traced to a device measurement; the article derives it. I answered it but recorded confidence 4 and said in the answer that it is an extrapolation.
- Question 2's share is arithmetic on two measurements the article itself says come from different applications and firmware builds, so the answer is a number about a hypothetical path, not about a real key press.

### What I learned
- Question 4 asks for "two numbers", and the text supplies a percentage (5.8) and an effect size (1.2 percent), not two costs; that is a fair reading but not the only one, which is why I gave both explicitly.

### What was tricky to build
- Distinguishing "upper limit" reasoning in question 2: adding unmeasured time enlarges the denominator and so lowers the share, which is the opposite of the direction the naive intuition suggests. I spelled the clause out in the answer.

### What warrants a second pair of eyes
- Whether question 6 intends the 118 µs and 31 µs pair (my reading) or the 42,000 and 11,000 cycle pair.

### What should be done in the future
- If the editor wants question 6 to be fully answerable, add the device-side tokenize measurement to section 2.4.

### Code review instructions
- N/A.

### Technical details
- Confidence given: 5, 5, 5, 4, 4, 4. Amdahl form used: speedup = 1 / ((1 − p) + p / s), limit 1 / (1 − p).

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, quoting short passages rather than paraphrasing them, and scoring each numbered section. I tried to keep the "terms" section to items that neither the article nor the glossary explains, as instructed, and to keep "claims I could not verify" to claims where the missing evidence is identifiable.

### Prompt Context
**User prompt (verbatim):** see Step 1 ("Read TASK.md and carry out every step in order." — TASK.md step 3)
**Assistant interpretation:** Produce `feedback.md` with the six named sections: passages read twice, terms unexplained, unverifiable claims, section scores, unanswerable questions, one thing to add and one to cut.
**Inferred user intent:** Actionable pre-publication notes, not a general impression.
**Commit (code):** none.

### What I did
- Wrote `feedback.md` with all six sections in the requested order, quoting passages with the original wording.
- Scored sections 2.1 to 2.9; scores range 3 to 5, with 2.2 and 2.5 lowest.
- Chose to add a paragraph naming Editor, Agenda, Files, the device, RV32 and WebAssembly, and to cut the framebuffer-capture row from the 2.1 table.

### Why
- I kept the term list short and specific (nine items) rather than listing every word a beginner might not know, because the instruction was only to report terms that neither the article nor the glossary explains.
- The cut is chosen so that no argument is lost: the framebuffer row is the one row in the interval table that is explicitly not about time.

### What worked
- The 559 ms table and the 2.7 decision table needed no criticism; they are the clearest parts and the scores reflect that.
- Every arithmetic check I ran in Step 1 turned into a concrete item (the 99 percent column, the 29.9 ms mismatch).

### What didn't work
- I could not tell whether the ambiguous Experiment 1 row ("store immediately followed by a load of the same slot") is a units problem in the table or a phrasing problem in the label, so the feedback reports the ambiguity without proposing a fix.
- I had no way to check the 30,840-byte diary comparison or the 88,255-byte module comparison, so those are listed as unverifiable rather than as errors; they may well be right.

### What I learned
- The article's repeated appeal to records outside itself (the project's diary, the device build, Article 5, Article 6) is what most weakens it as a standalone teaching text, and that pattern only became visible when I listed the claims one by one.

### What was tricky to build
- Scoring 2.3 and 2.7 at 5 while scoring 2.5 at 3 felt inconsistent at first, since 2.5 contains the data that 2.3's conclusions rest on. The resolution is that density and ambiguity in the tables, not the quality of the reasoning, is what costs 2.5 its points.

### What warrants a second pair of eyes
- My claim that the glossary's *Token* entry actively misleads a reader here; if Article 8 needs that sense and lexical tokens are obvious, a disambiguation line may be enough.
- Whether the missing glossary entries for Editor, Agenda and Files are a series-level decision (Article 1 may define them) rather than an Article 2 defect.

### What should be done in the future
- Reproduce the 30,840-byte device build record and the 88,255-byte module record inside the article, or cite where a reader can see them, so Experiments 1 and 3 stop depending on invisible evidence.

### Code review instructions
- N/A. Verify the quoted passages against the original wording in `article.md` sections 2.1–2.6.

### Technical details
- Section scores given: 2.1 = 5, 2.2 = 3, 2.3 = 5, 2.4 = 4, 2.5 = 3, 2.6 = 4, 2.7 = 5, 2.8 = 4, 2.9 = 4.
- Files written this session: `answers.md`, `feedback.md`, `diary.md`.

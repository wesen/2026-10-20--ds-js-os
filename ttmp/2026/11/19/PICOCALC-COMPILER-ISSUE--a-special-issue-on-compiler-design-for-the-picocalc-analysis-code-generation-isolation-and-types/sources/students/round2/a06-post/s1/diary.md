## Step 1: Reading the article and the glossary

I read `article.md` straight through once, then re-read the sections that carry numbers (6.3, 6.4, 6.5, 6.6) with `glossary.md` open beside it, looking up terms as a reader would. I noted every place where a term appeared before its definition, and every place where a figure was asserted without a route to checking it.

### Prompt Context
**User prompt (verbatim):** "Read `article.md` from start to finish. The series has a glossary, `glossary.md`; look terms up there as a reader would, and report in your feedback only terms that neither the article nor the glossary explains."
**Assistant interpretation:** Do a full read, use the glossary as the intended support apparatus, and judge terminology failures only against both documents together.
**Inferred user intent:** The editor wants to know which terminology gaps survive the glossary, since gaps the glossary already covers are not worth fixing in the article.
**Commit (code):** N/A — no repository writes for this step.

### What I did
- Read `article.md` in full (one read call, whole file).
- Read `glossary.md` and `diary-format.md` in one batch.
- Kept a running list of candidate unclear terms: import table, frontend, capsule, hash, prelude, confined, ELF, firmware partition.
- Re-checked each against the glossary before keeping it.

### Why
- Reading the glossary after the article would hide exactly the failures I was asked to find, so I consulted it while reading, in the order the article raised each term.

### What worked
- The glossary is well cross-referenced by article number, which made it fast to decide whether a term was "explained elsewhere". Eight of my candidates survived that test.
- The boot-cost table in 6.4 and the key table in 6.3 are self-contained enough to check by arithmetic.

### What didn't work
- No tool failures. The one thing I could not do is check the arithmetic of 6.4's middle row: the table says "about 1.2 s" and the prose justifies it with 3.14 − 1.99, which is 1.15. I recorded this as a real inconsistency rather than assuming a typo, since 1.2 also happens to be near 41 percent of 3.14 (= 1.29), so two different derivations are in play.

### What I learned
- Most jargon is covered; what is missing is not vocabulary but *definitions of quantities*: the article never says how the 4.76 ratio was measured, and the recommendation in 6.6 depends on a model in Article 5 that this article does not restate.

### What was tricky to build
- N/A (reading only). The closest difficulty was deciding whether "import table" in the 6.8 flowchart is a genuine second name for the reactor's function table or an error; I treated it as an unexplained synonym because the article does not say either way.

### What warrants a second pair of eyes
- Whether 6.4's "about 1.2 s" is meant to include the link step. If it does not, the middle row of that table is optimistic by exactly the amount the row is trying to demonstrate.

### What should be done in the future
- Add the reconciliation paragraph recommended in `feedback.md`.

### Code review instructions
- Not applicable; this step produced no code.

### Technical details
- Files read: `article.md` (~10 KB), `glossary.md`, `diary-format.md`. No files written.

## Step 2: Answering the quiz

I answered the six questions in 6.10 into `answers.md`, using only the article, and showed working for the calculation in question 3. Every answer was checked against the section that supports it before being written down.

### Prompt Context
**User prompt (verbatim):** "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show working where a question asks for a calculation or a translation. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain)."
**Assistant interpretation:** Produce a self-contained answer file in my own words, with explicit arithmetic and a calibrated confidence per answer.
**Inferred user intent:** The confidence lines are the real data: they tell the editor which questions the text only half-supports.
**Commit (code):** N/A — content only.

### What I did
- Wrote `answers.md` with six numbered answers, each 4–6 sentences, each followed by `Confidence: N`.
- Redid the arithmetic by hand: 3.14 − 1.99 = 1.15 s; 8.8 − 1.6 = 7.2 ms; 1.15 / 0.0072 ≈ 159.7 ≈ 160 turns; 240 / 88 ≈ 2.73.
- Cross-checked Q1, Q2 against 6.3, Q4 against 6.4, Q5 and Q6 against 6.6.

### Why
- I chose to state the working as a chain of equalities rather than prose, so a reader can spot a mistake in my answer instead of having to trust it.

### What worked
- Questions 1, 2 and 3 are fully determined by the text, so they got confidence 5; Q6 also got 5 because section 6.6 supplies the missing half of the explanation.
- Q4 and Q5 are answerable but require selecting among several candidate figures, so I gave them 4.

### What didn't work
- Q3 asks the reader to repeat section 6.5's own worked example; my answer is therefore close to a transcription, and I flagged that in `feedback.md` as a weakness of the question rather than of my answer.

### What I learned
- Q6 is answerable only because section 6.6 says in passing that each module "also contains its reactor". Without that clause the two ratios would look like a contradiction, not an explanation.

### What was tricky to build
- Q5 asks for "two memory figures". There are three candidates (768 KiB limit, 710 KiB native use, 528 KiB WebAssembly use). I gave the limit plus both footprints, and noted in the answer which two show the pressure (710 versus 528 against a 768 ceiling).

### What warrants a second pair of eyes
- My Q4 framing: I read "the reason they still considered the design worthwhile" as portability outweighing a twofold load time. The article supports this, but Franz & Kistler's own text is cited only in summary, so my answer inherits the article's summary rather than the source.

### What should be done in the future
- If the article is revised, Q3 should be changed so the reader computes something 6.5 has not already computed.

### Code review instructions
- Read `answers.md`; check the three arithmetic chains in answer 3 and the two ratios in answer 6.

### Technical details
- File written: `answers.md`. All numbers taken from `article.md` 6.1, 6.3, 6.4, 6.5, 6.6. No external sources consulted.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections, quoting passages verbatim where I could, and scored each of the ten numbered sections. I kept the "terms" and "claims" sections disjoint: the first lists vocabulary, the second lists assertions I could not check.

### Prompt Context
**User prompt (verbatim):** "Write `feedback.md` with these sections: Passages I had to read twice ... Terms used before they were explained, or never explained ... Claims I could not verify from the article itself ... Section scores ... Questions that the article did not let me answer ... One thing to add and one thing to cut."
**Assistant interpretation:** Structured critique only — no rewriting of the article, and no praise padding.
**Inferred user intent:** The editor needs actionable defects ranked by location, not a general verdict.
**Commit (code):** N/A — content only.

### What I did
- Wrote `feedback.md` with the six sections in the requested order.
- Quoted six passages for "read twice", eight terms, seven unverifiable claims, ten section scores, and the add/cut pair.
- Took each section score back to the section to justify it in one sentence.

### Why
- I put the arithmetic inconsistency (1.15 vs "about 1.2 s") in both "read twice" and "claims I could not verify", because it is the one defect that changes a number the article then uses to make a recommendation.

### What worked
- The section scores discriminate usefully: 6.1, 6.3 and 6.9 score 5, while 6.4, 6.6 and 6.7 score 3, which matches where I actually slowed down.

### What didn't work
- No failures in producing the file. The judgement call was the "one thing to cut": the Maté paragraph is genuinely useful background, so my cut is arguable. I chose it because its conclusion is stated again one paragraph earlier and the text itself says "the reasoning has the same shape".

### What I learned
- The article's weakest pattern is not jargon but *borrowed evidence*: the 41 percent profile, the 2.66–3.32 prediction and the 8.8/1.6 ms turn timings all live in other articles, and section 6.6's recommendation rests entirely on the last two.

### What was tricky to build
- Keeping "terms never explained" honest against the glossary. I discarded several candidates (reactor, engine, turn, SSA form, lowering, verifier) that the glossary does cover, even though they read as jargon, because the task said to report only terms neither document explains.

### What warrants a second pair of eyes
- Whether the missing load-time verification of native code (my claim 4) is a real omission or is covered by Article 7 in a way a reader of Article 6 alone cannot be expected to know. My feedback assumes the latter.

### What should be done in the future
- The add-paragraph and cut-paragraph recommendations in `feedback.md`, in that order; the arithmetic reconciliation is the higher-value fix.

### Code review instructions
- Read `feedback.md` against `article.md`: check that every quotation is exact and that each section score can be defended from the section itself.

### Technical details
- File written: `feedback.md`. Cross-checked against `article.md` (sections 6.1–6.10) and `glossary.md`. No web access used, per instructions.

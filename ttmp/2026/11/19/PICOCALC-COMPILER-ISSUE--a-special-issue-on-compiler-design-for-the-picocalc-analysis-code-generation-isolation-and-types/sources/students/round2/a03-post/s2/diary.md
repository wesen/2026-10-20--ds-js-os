# Investigation entry — student read of Article 3 (CJI whole-program inference)

## Step 1: Reading the article and the glossary

I read `glossary.md` first, as a reader would when the series tells her a glossary exists, and then read `article.md` from start to finish in one sitting, keeping a list of every term I met that the glossary did not already define.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** The task file asks for four steps in order: read `article.md` with `glossary.md`; answer the quiz in `answers.md`; write `feedback.md` in five named sections; write this diary with one step per activity.
**Inferred user intent:** The editor wants an honest pre-publication read that locates where the teaching fails, not praise.
**Commit (code):** N/A (no repository operations in this directory).

### What I did
- Read `TASK.md`, `diary-format.md`, `glossary.md`, then `article.md` (sections 3.1–3.8 plus references).
- Kept a side list of undefined terms while reading, and a list of passages that sent me backwards.

### Why
- Reading the glossary first is what the series invites, and it let me catch the case where a glossary term is reused in a different sense ("claim" in 3.3).

### What worked
- The glossary covered most of the load-bearing vocabulary: *frontend*-adjacent terms, widening, join, fixpoint, demotion, library specialization, tier, abstract interpretation.
- The arithmetic in section 3.4 is internally consistent and I could check it: 12+58+1+4+3+1 = 79; 95 ÷ 7 ≈ 13.6 ("about fourteen"); 95 × ~124 ≈ 11,760 visits.

### What didn't work
- No shell access in this directory, so file inventory was by direct read only; I could not list the directory to confirm whether other articles in the series are present and therefore could not follow the "(Article 1)" cross-reference for the 0.5–0.7 s figure.

### What I learned
- The article's weakness is not its structure (six sections, each with one job) but its evidence section: section 3.5 is honest about what it did not measure, and that honesty makes the remaining attribution feel thinner, not thicker.

### What was tricky to build
- Nothing to build. The tricky part of reading was section 3.2's table: widening fires on pass 3, the fixpoint is declared on pass 4, and the without-widening column never terminates, so the reader has to invent the convention.

### What warrants a second pair of eyes
- Whether "1,475 s → 170 s is also 88 percent" (88.5 percent) and "1,475 → 544 s is 63 percent" (63.1 percent) are meant as rounded or as exact; both round consistently, but the article never says.
- Whether the 94 percent figure in 3.5 ("specialization together with the inference it triggers") is intended to support the thesis or merely to be consistent with it.

### What should be done in the future
- If the editor can supply a pass-by-pass profile of the no-range-analysis variant, section 3.5 stops hedging.

### Code review instructions
- Compare `feedback.md` against section 3.5 of `article.md` for the four claims listed as unverifiable; compare the "terms" list against `glossary.md` to confirm none of them is in fact defined there.

### Technical details
- Article under test: `article.md` (3. Why Whole-Program Inference Costs Minutes). Quiz: section 3.8, six questions. Series glossary: `glossary.md`.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, numbered like the questions, two to six sentences each, showing working where a question asks for a calculation, with a `Confidence:` line after each.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer from the article only; do not import outside reading; state the arithmetic explicitly.
**Inferred user intent:** Check whether the six questions are answerable from the text as written, and whether the arithmetic the article implies actually closes.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and confidence 5, 4, 5, 4, 5, 5.
- Did the arithmetic in the open where it was needed: (2⁵³ − 1) + 2 = 2⁵³ + 1 rounds to 2⁵³, so 2⁵³ − max = 1; 95 ÷ 7 ≈ 13.6; 95 × 123.8 = 11,760; (1475 − 170) / 1475 = 88.5 percent.

### Why
- Question 3 is the only one that asks for a derivation rather than a recall, so I wrote the rounding out step by step instead of repeating the article's assertion.

### What worked
- Questions 1, 5 and 6 map one-to-one onto passages that say exactly what is needed.
- Question 4's numbers close exactly, which is why I marked it 4 rather than 3: the answer is recoverable even though the article does not print the per-analysis counts.

### What didn't work
- Question 2's "on which pass it produces the fixpoint" is genuinely ambiguous (widen on 3, confirm on 4); I answered 4 and flagged it.
- Question 3 needed the ties-to-even rule, which the article never states; I supplied it and said so in the answer and again in the feedback.

### What I learned
- Three of six questions (2, 3, 4) need one small step the text does not supply. That is a reasonable ratio for teaching, but the editor should know which three.

### What was tricky to build
- Question 5: the honest answer has to reproduce the article's own hedge ("no pass-by-pass profile was taken"), otherwise it overstates the evidence.

### What warrants a second pair of eyes
- My confidence of 4 on question 2 — a stricter reader might say the article's table *does* fix pass 4 as the answer.

### What should be done in the future
- Add the one-pass trace proposed in `feedback.md`, which would let question 2 be answered without guessing the convention.

### Code review instructions
- Each answer cites a section; check `answers.md` question N against section 3.N for the load-bearing sentence.

### Technical details
- Confidence scale used: 1 guessing, 5 certain. Answers 3 and 4 show working; answer 1 restates the demotion argument of 3.1/3.3; answer 6 uses the Self two-compiler story of 3.6 plus the 170 s residual of 3.5.

## Step 3: Writing the feedback

I wrote `feedback.md` in the five sections the task names, then added the required section scores section-by-section from 3.1 to 3.8.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Report only terms that neither the article nor the glossary explains; quote passages of one or two sentences; say what evidence is missing for each unverifiable claim.
**Inferred user intent:** Give the editor an actionable list, ordered by where the reader actually stumbled.
**Commit (code):** N/A.

### What I did
- Wrote eight "read twice" passages with the reason each stalled.
- Listed nine terms with a one-line reason each.
- Listed eleven claims with the specific missing evidence or step.
- Scored 3.1–3.8 (5, 4, 4, 4, 3, 4, 5, 4), gave four partly-unanswerable quiz questions, and named one addition and one cut.

### Why
- I grouped terms by where they first appear so the editor can fix them in place rather than in a glossary appendix.
- I put the arithmetic I could check into the "claims" list as well, so that "unverifiable" and "internally inconsistent" stay separate categories: nothing here was inconsistent once I did the division.

### What worked
- The strong asymmetry was easy to report honestly: sections 3.1 and 3.7 need no fixing at all, while 3.5 is the section most likely to be argued about.

### What didn't work
- I could not check any of the cited works (Self, RPython, Shed Skin, Agesen, Cooper & Torczon) from this directory and the task forbids the web, so "unverifiable" here means "unverifiable from the article", which is what the task asked, but it is not the same as "wrong".
- My "terms" list may overreach on *closures* and *message send*: a reader with a compiler course would not have stumbled. I left them in with a note rather than drop them silently.

### What I learned
- The single most useful observation for the editor is the one-join cost gap: 11.7 million joins is asserted to explain 1,475 s, and a reader's own estimate (11.7M × ~100 ns ≈ 1.2 s) lands three orders of magnitude short. One sentence of per-join cost would close it.

### What was tricky to build
- Deciding whether the "94 percent of pass time to specialization together with inference" line counts as a claim I could not verify or as a passage I had to read twice. It is both; I put it in both lists with different framings rather than duplicating the whole argument in each.

### What warrants a second pair of eyes
- Whether the ambiguity I found in quiz question 2 is a real defect or a matter of convention the series establishes elsewhere (presumably Article 4 on demand-driven analysis).
- Whether "cut the Self pause statistics" loses evidence the editor considers important for the argument that interactive pauses were the price of customization.

### What should be done in the future
- If the editor accepts the addition, the one-pass trace should be written by someone who can run CJI's solver on the three-function example, so the sets in the table are real rather than plausible.

### Code review instructions
- Start at `feedback.md`, sections "Section scores" and "Claims I could not verify"; the arithmetic claims can be checked with a calculator against the tables in `article.md` sections 3.4 and 3.5.

### Technical details
- Scores are 1 (lost) to 5 (clear) per numbered section, 3.1 through 3.8 inclusive.
- Terms reported were checked against `glossary.md` entry by entry before being listed.

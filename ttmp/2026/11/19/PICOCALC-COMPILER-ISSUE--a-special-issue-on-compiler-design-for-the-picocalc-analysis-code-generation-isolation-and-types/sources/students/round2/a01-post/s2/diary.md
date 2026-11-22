# Work diary — student reading of Article 1

## Step 1: Read the article and the glossary

I read `article.md` end to end once without stopping, then went back section by section with `glossary.md` open beside it, looking up each bolded term as a reader of the series would. I marked every passage where I had to stop, and every term that arrived before or without an explanation.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md`: read `article.md` with `glossary.md`, answer the quiz into `answers.md`, write `feedback.md`, write this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest test of whether the article teaches, not a summary of it, so that weak sections can be fixed before publication.
**Commit (code):** N/A — documents only, no code changed.

### What I did
- Read `article.md` in full (8 numbered subsections, 1.1–1.8).
- Read `glossary.md` in full and checked each bolded term of section 1.2 against it.
- Read `diary-format.md` for the required structure of this file.
- Kept a running list of hard passages, undefined terms and unverifiable numbers while reading.

### Why
- Reading the glossary as a reader would is the only way to separate "explained somewhere in the series" from "never explained".
- Reading straight through first, then closely, catches both structure problems and local ambiguities.

### What worked
- Section 1.4 (one function through both pipelines) needed no second reading; its numbers can be rechecked by hand (103 × 4 = 412 bytes, 412 ÷ 77 ≈ 5.35).
- The bolded-term approach in 1.2 made it easy to see exactly which terms the article itself takes responsibility for.

### What didn't work
- No tool failures. The one thing I could not do is confirm anything outside this directory: the article repeatedly points at a companion report, Article 2, Article 3 and "measurement records", none of which are in this folder, so provenance claims had to be recorded as unverifiable rather than checked.

### What I learned
- The article is strongest when it shows a calculation the reader can redo, and weakest where it inherits numbers from elsewhere without conditions.
- Several apparent contradictions dissolve on arithmetic: 768 − 710 = 58 KiB free holds; 290.6 ÷ 52.9 = 5.49 matches "5.5 times faster"; 240,452 ÷ 88,255 = 2.72 matches "nearly three times larger".

### What was tricky to build
- The hardest judgement was the "182 KiB" sentence in 1.5. Compiled sizes differ by 152,197 bytes while memory used differs by 182 KiB; the sentence uses the second while seeming to talk about code. Deciding that this is an ambiguity worth reporting (rather than a mistake) took two readings of both tables.

### What warrants a second pair of eyes
- The flash budget row in 1.1: firmware image 4.3–4.5 MB in an 8 MiB partition plus "files use about 8 MB" — an editor should confirm whether these are the same partition.
- The claim that the compositor was compiled to native code by CJI: whether that compile is on-device or at build time changes what the issue's whole argument implies.

### What should be done in the future
- Add conditions (machine, inputs, what is timed) to the 58–169× processor ratio, or drop it in favour of a single measured figure.

### Code review instructions
- Compare `answers.md` against section 1.8 of `article.md`; compare each item in `feedback.md` against the quoted sentence in the article.

### Technical details
- Files touched: `answers.md` (new), `feedback.md` (new), `diary.md` (new). `article.md` and `glossary.md` read only.

## Step 2: Answer the quiz

I answered all six questions in `answers.md`, in my own words, two to six sentences each, with a `Confidence:` line after each, and showed the arithmetic in questions 3 and 4 where numbers were involved. Where the article only supported part of an answer I said so in the answer itself and recorded the gap in `feedback.md`.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer section 1.8 using only the article and glossary, marking confidence honestly.
**Inferred user intent:** To find out whether the quiz is answerable from the text alone — a quiz that cannot be answered exposes a gap in the teaching.
**Commit (code):** N/A.

### What I did
- Wrote six answers to `answers.md` with confidence 4, 4, 4, 4, 5, 5.
- Recomputed the size and memory relations from the tables to check the article's arithmetic before relying on it.

### Why
- Confidence 5 was reserved for questions whose answers are stated almost verbatim (the message path, the hybrid definition); 4 for answers that combine two or three statements from different subsections.

### What worked
- Questions 3, 5 and 6 fell straight out of sections 1.2, 1.4 and 1.3 respectively.
- The "two facts CJI needs elsewhere" question is well designed: the answer is literally in 1.4, and answering it forces the reader to understand the whole-program point.

### What didn't work
- Question 1 asks "why" and the article gives only the rule and its penalty, so my answer circled back on the rule. I flagged this rather than inventing a scheduling model.

### What I learned
- Question 2 is answerable but the QuickJS half has to be inferred from a single clause, which is a sign the engine table's "Isolation" column does more work than the prose behind it.

### What was tricky to build
- Question 4: giving "one reason" is easy, but a reader who tries to explain the full 182 KiB runs out of article. I gave the code-density reason with its arithmetic and mentioned the second reason as separate.

### What warrants a second pair of eyes
- Whether "the interpreter confines the program" is intended to mean QuickJS traps safely; the article never says what happens to a faulting JavaScript world.

### What should be done in the future
- Either reword question 1 to "what must a world do when its work is too long" or add the reason to 1.2.

### Code review instructions
- Each answer cites a subsection; check the citation supports the claim.

### Technical details
- Confidence values: Q1 4, Q2 4, Q3 4, Q4 4, Q5 5, Q6 5.

## Step 3: Write the feedback

I wrote `feedback.md` in the six required sections: passages read twice, terms used before explanation, claims I could not verify, per-section scores, unanswerable quiz questions, and one addition plus one cut. Every item quotes the article so the editor can locate it.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Report only terms that neither the article nor the glossary explains, and quote claims rather than paraphrasing them.
**Inferred user intent:** Actionable, located criticism that the editor can act on line by line, with no padding.
**Commit (code):** N/A.

### What I did
- Quotes in `article.md` re-read before being copied into `feedback.md`.
- Checked each term in my undefined list against `glossary.md` so that nothing already glossed (trap, lowering, bytecode, linear memory) appears there.
- Scored sections 1.1–1.8 from 1 to 5 with one sentence of reason each.
- Chose one addition (the reason the turn budget exists) and one cut (the compositor-CJI sentence).

### Why
- Filtering the term list against the glossary is the difference between a useful report and a list of terms the series already defines.

### What worked
- The per-section scoring made the pattern obvious: the concrete, calculable sections (1.1, 1.4) score highest; sections that hand numbers over from elsewhere (1.5, 1.6) score lowest.

### What didn't work
- No failures; but the "claims I could not verify" section grew long because almost every number in the article is sourced to a document outside this directory.

### What I learned
- A teaching article that defers its evidence is not wrong, but it must at least state the conditions of each measurement inside itself, otherwise a careful reader cannot distinguish a data point from a marketing claim.

### What was tricky to build
- Separating "unclear prose" from "missing evidence" — the "182 KiB" sentence and the 58–169× ratio could go in either section; I put the sentence under passages-read-twice and the ratio under both, with the missing conditions named.

### What warrants a second pair of eyes
- My claim that "firmware", "JSON", "UTF-16" and "KiB/MiB" are absent from the glossary: the editor should confirm these are not defined earlier in the issue, since I only have Article 1 and `glossary.md` here.

### What should be done in the future
- Give every number in 1.3 and 1.5 a conditions line, or mark clearly which figures are illustrative.

### Code review instructions
- Start at `feedback.md`, section "Claims I could not verify", item 1, and cross-read section 1.1's processor row.

### Technical details
- Scores: 1.1 = 5, 1.2 = 4, 1.3 = 4, 1.4 = 5, 1.5 = 3, 1.6 = 3, 1.7 = 4, 1.8 = 3.
- Undefined-term list: UTF-16 code units, JSON, LCD, KiB/MiB, "counted sequence", library specialization, stack, firmware, partition, RISC-V.

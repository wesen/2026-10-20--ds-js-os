# Investigation entry

## Step 1: Reading "3. Why Whole-Program Inference Costs Minutes"

I read `article.md` once from start to finish without stopping to take notes, to find out where the
argument lost me on a first pass. I then read it a second time with the six quiz questions open
beside it, marking every name, number and load-bearing "therefore".

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Work through the four steps of `TASK.md`: read the article, answer the quiz into `answers.md`, write `feedback.md` with the required sections, then this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest student's-eye test of a teaching article before publication, especially the places where it fails to teach, not a polished endorsement.
**Commit (code):** none — the working directory is not a git repository and no code was changed.

### What I did
- Read `article.md` in full (eight sections, 3.1 to 3.8, plus references).
- Read `diary-format.md` before writing anything, so the later steps would fit the required headings.
- Re-read sections 3.1, 3.2, 3.3 and 3.5 a second and in one case a third time.

### Why
- A single pass would have recorded only my first confusion; the second pass is what separated "this is genuinely unclear" from "I was reading too fast".
- Sections 3.1 and 3.5 are where the article makes its two central moves (types are unknowns; inference is where the time goes), so those were the ones worth the extra reading.

### What worked
- The article is short enough to hold in mind at once, and its structure (mechanism → iteration → why JS needs a proof → specialization → evidence → history → key points) was easy to follow; I could predict section 3.6's content before reading it.

### What didn't work
- My first pass through 3.1 left me believing I understood the constraint example; only when I tried to write the answer to question 1 did I find that the constraints as written do not connect `half`'s argument to `scale`'s parameter. Recovery: I reconstructed the missing edge from the prose sentence before it ("Adding `half` changes the answer") and flagged the gap in the feedback rather than papering over it in the answer.

### What I learned
- Reading for comprehension and reading for the quiz are different tasks: several passages felt clear until I had to state them in my own words.

### What was tricky to build
- Nothing to build; the difficulty was entirely in distinguishing "the article is unclear here" from "I am missing background".

### What warrants a second pair of eyes
- My claim in `feedback.md` that `(max + 2) - max` with `max = 2**53` gives 2 in JavaScript, which I used to argue the article's anecdote is unverifiable as written. I reasoned it out on paper and did not run it, so an editor should check the arithmetic before trusting that particular criticism.

### What should be done in the future
- If the article is revised, the constraint graph suggested under "One thing to add" would let a reader answer question 1 without reconstructing edges.

### Code review instructions
- Starting files: `article.md` (source), then `answers.md` and `feedback.md` side by side, to check that every criticism in the feedback is consistent with what I actually wrote in the answers.
- Validation: there is nothing to run; the check is whether each quoted passage in `feedback.md` appears verbatim in `article.md`.

### Technical details
- Article under review: article 3 of a series, six prose sections plus a key-points list and a six-question quiz, with five tables; I did not count the words. Measured system is CJI compiling a 16,326-byte program called Agenda in 1,480 s (≈ 24.7 minutes, consistent with the title's "25 minutes").

## Step 2: Answering the six quiz questions

I wrote `answers.md` before reading any criticism back into the article, so the answers reflect what
the text alone supported. Each answer is numbered like the question, given in my own words, and ends
with a `Confidence: N` line.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer questions 1–6 of section 3.8 in two to six sentences each, showing working where a calculation or a trace is asked for, and rate my own confidence honestly.
**Inferred user intent:** The editor wants to see which questions the text actually equips a reader to answer, so confidence values matter as much as the answers.
**Commit (code):** none.

### What I did
- Wrote six answers to `answers.md`, adding `Confidence: N` after each.
- Showed working in three places: the visit-by-visit range trace in Q2, the "12+58+1+4+3+1 = 79" check in Q4, and the "1,475 − 544 = 931; 931/1,475 ≈ 63 %" subtraction in Q5.

### Why
- The trace in Q2 is the article's own pedagogical device (the table of visits), so reproducing two more rows proves whether I internalised it rather than paraphrasing it.
- In Q4 and Q5 the article states totals without showing their derivation; re-deriving them is the cheapest test of whether the numbers are consistent.

### What worked
- Q1, Q3, Q4 and Q6 were fully answerable from the text, and the arithmetic in Q4 (79 helpers) and Q5 (63 %) both checked out, which raised my trust in the tables.
- Q2's trace matched the article's table row for row, so the widening explanation had in fact taught me the mechanism.

### What didn't work
- Q5: I could reproduce the measurement and repeat the article's conclusion but not defend it, because the step from "168 s in the frontend" to "therefore type inference" is asserted rather than shown. Recovery: I lowered the confidence to 3 and said in the feedback exactly what is missing, rather than inflating the answer to look complete.
- Q2: I could not say *which* threshold widening picks, because the article's two descriptions of that rule do not match; I answered at the level the text supports.

### What I learned
- A quiz can expose a weak argument that a plain read hides: the question forced me to spend the article's evidence instead of just recognising it.

### What was tricky to build
- Keeping answers to the 2–6 sentence range while still showing working. The Q2 trace wanted to become a table; I kept it in prose with the three visits inline.

### What warrants a second pair of eyes
- Q6's identification of QuickJS with Self's first-tier compiler is my reading of two sentences that never say it outright ("The handheld already has its fast first tier, which is QuickJS"). It is the intuition the article clearly intends, but it is inference, not quotation.

### What should be done in the future
- If the article is revised to state what the frontend covers, my Q5 answer could rise to confidence 5.

### Code review instructions
- Starting file: `answers.md`; check that the `Confidence: N` values match the honest state of the answer — 3 for Q5 is deliberate.
- Validation: verify `12+58+1+4+3+1 = 79` and `(1475-544)/1475 ≈ 0.631`.

### Technical details
- Confidence assigned: Q1 = 5, Q2 = 4, Q3 = 5, Q4 = 5, Q5 = 3, Q6 = 4.

## Step 3: Writing the feedback

I then wrote `feedback.md` with exactly the six requested sections, choosing quotations that are
verbatim from the article and keeping each entry to one or two sentences of quotation plus a
statement of what was unclear.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the criticism file with the six named sections, quoting rather than paraphrasing the article, and scoring each numbered section 1–5 with one sentence of reason.
**Inferred user intent:** The editor needs actionable, locatable defects — a quote they can search for and a diagnosis they can act on — not general impressions.
**Commit (code):** none.

### What I did
- Wrote `feedback.md` with the six sections in the requested order.
- Scored all eight numbered sections (3.1–3.8) and gave each one sentence of reason.
- Listed eight passages read twice, twelve terms, eight unverifiable claims, three partly answerable quiz questions, one addition and one cut.

### Why
- I quoted rather than summarised so every item can be checked by searching the article; an editor cannot act on "some of section 3.5 felt thin".
- I chose the *cut* from the material I could not verify (the Self pause statistics) rather than from the material I merely found dull, because a claim with no denominator is a real liability in an article whose selling point is measurement.
- I chose the *addition* as the constraint graph because it repairs three separate complaints (the missing edge in 3.1, the demotion re-solve in 3.3, why specialization makes new call sites in 3.4) with one artefact.

### What worked
- Quoting made the feedback much sharper than my reading notes: several complaints collapsed into the same two root causes — the article describes its mechanisms twice in two registers, and it asserts the final inferential step in both 3.1 and 3.5.
- The arithmetic checks gave me positive findings as well as negative ones (79 helpers, 63 %, 85.9/1,480 ≈ 5.8 %), so the feedback is not uniformly hostile.

### What didn't work
- I first wrote the "terms used before explained" list as prose paragraphs; it obscured how many items there were. Recovery: rewrote it as one line per term, as the task asked.
- I initially scored section 3.5 a 4 out of deference to how well built its table is; on re-reading I moved it to 3, because the section's job is to carry the article's thesis and its central step is missing.

### What I learned
- The most useful criticism is structural: "this passage describes one mechanism in two inconsistent ways" is more actionable than any number of "this sentence was confusing".
- The two genuinely unverifiable passages (the `max` anecdote and the Self pause figures) are the ones where a careful reader is most likely to stop trusting the rest, because the article's authority rests on measurements.

### What was tricky to build
- Deciding whether the `max` anecdote is "unclear" or "unverifiable". It is both, and the ordering matters: the missing fact is not a definition (a term) but a value (a quantity), which is why it belongs under unverifiable claims and not under terms. I put it in the second bucket and explained the arithmetic I attempted.

### What warrants a second pair of eyes
- My criticism of "the smallest assignment of types" depends on how the article orders type assignments. If the intended order is "fewer types = smaller" (set inclusion reversed), the sentence is defensible and my complaint is only about the missing definition, not about a contradiction. An editor should decide which it is before rewriting.
- The claim that 11,760 function visits should be a multiple of 95 whole-program visits is my inference about what "visit" means; the article never defines it.

### What should be done in the future
- Add the value of `max` and the exact code for the disabled-proof experiment; add the total pause count to the Self figures or drop the percentages.

### Code review instructions
- Starting file: `feedback.md`; confirm each quotation appears verbatim in `article.md` and that the section scores are consistent with the number of complaints listed for that section (3.1 and 3.5 are scored lowest and carry the most items).
- Validation: `grep -F` each quoted string against `article.md`.

### Technical details
- Section scores given: 3.1 = 3, 3.2 = 4, 3.3 = 5, 3.4 = 4, 3.5 = 3, 3.6 = 4, 3.7 = 5, 3.8 = 4.
- Cross-checks performed: 12+58+1+4+3+1 = 79; (1475−544)/1475 ≈ 63.1 %; 85.9/1480 ≈ 5.8 %; 1,480 s ≈ 24.7 min; 11,760/95 ≈ 123.8 (the rejection case).

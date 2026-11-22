# Investigation entry

## Step 1: Reading the article

I read `article.md` from start to finish once without a pen, then a second time with a calculator, checking every sum, share and ratio the article states. The second pass was where the work actually happened: three passages did not add up, and finding that changed how I read the rest.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." (Task step 1: "Read `article.md` from start to finish.")
**Assistant interpretation:** Read the whole article attentively enough to answer questions about it and to report honestly where it fails to teach.
**Inferred user intent:** The editor wants a reader's report on teachability, not a summary; arithmetic slippage matters as much as unclear prose.
**Commit (code):** N/A — no repository changes requested.

### What I did
- Read `TASK.md`, `article.md` and `diary-format.md` in full.
- Re-read sections 2.2, 2.3 and 2.4 line by line with arithmetic checks: Amdahl limits, the boot table sum, the CJI phase shares, the typed-compiler phase shares and the 66× device factor.

### Why
- The article's whole argument is numeric, so a sentence that does not match its own table undermines the lesson rather than the reader's attention.

### What worked
- The boot table adds up exactly (293 + 81 + 32 + 123 + 30 = 559 ms).
- The CJI phase table is self-consistent: frontend 1,479.1 of 1,480.8 s is 99.9 percent, load 0.034 percent, link and hash 0.081 percent, and 85.9 / 1,479.1 = 5.8 percent.
- Amdahl arithmetic checks: 1/0.9 = 1.111 for the 10 percent example, 1.6 / 37.2 = 4.3 percent, 1/(1 − 0.043) = 1.045, 52.9 / 33 = 1.60 ms per turn, 8.8 − 1.6 = 7.2 ms.

### What didn't work
- The typed-compiler table's shares (16 / 42 / 41) imply a denominator of 48.7 ms, but the text says the WebAssembly path "takes 29.9 ms here"; no row or sum in the table gives 29.9 ms. Factor 1,988 / 29.9 = 66.5 is consistent only with the number I cannot derive.
- "each token costs about 118 microseconds": half a second / 16,792 tokens is about 31 µs, not 118 µs. And 42,000 cycles in 118 µs implies a 356 MHz clock, which is never stated.
- Section 2.3's second compositor trace gives 84 + 146 = 230 ms of a stated 235 ms, against 293 ms in the main table.

### What I learned
- Three separate numeric inconsistencies cluster in section 2.4, not spread out, which suggests the typed-compiler profile was assembled from more than one run and the text kept numbers from different ones.
- The article is much more careful about method (2.6) than about its own arithmetic.

### What was tricky to build
- Deciding whether a mismatch was my error or the article's. The rule I used: only flag it if no row, sum or stated factor in the article reproduces the number.

### What warrants a second pair of eyes
- The 29.9 ms denominator and the 118 µs per-token figure are the two that a subject-matter reviewer should confirm before publication; both are load-bearing for the "compiler's speed is limited by the interpreter" conclusion.

### What should be done in the future
- Every number in 2.4 should be regenerable from a named table column, with the clock frequency and the WebAssembly body byte counts appended.

### Code review instructions
- Starting point: `article.md` section 2.4, the "Typed compiler phase" table and the paragraph beginning "The device takes 1,988 ms". Recompute the shares and the per-token cost.

### Technical details
- Machine-checked sums: 8.0 + 20.5 + 20.2 = 48.7 ms; 2.4 + 8.0 + 20.5 = 30.9 ms; neither is 29.9 ms. 1,988 / 48.7 = 40.8; 1,988 / 30.9 = 64.3; 1,988 / 29.9 = 66.5.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, two to six sentences each, showing the calculation wherever a question asks for one, and added a confidence line to each. I answered from the article alone and marked the places where I had to supply an assumption.

### Prompt Context
**User prompt (verbatim):** see Step 1 (task step 2: answer the "Check your understanding" questions, numbered, 2–6 sentences, `Confidence: N` after each).
**Assistant interpretation:** Produce graded answers that expose, through the confidence values, which questions the text did not fully support.
**Inferred user intent:** The confidence lines are diagnostics for the editor, so they must reflect what the text supports, not what I know from elsewhere.
**Commit (code):** N/A

### What I did
- Wrote `answers.md` with six numbered answers, each ending in a `Confidence: N` line.

### Why
- Question 1 asks about a report ("1.8 seconds after power-on") that the article never mentions; answering it requires importing the "first response after boot" definition, so the answer says so explicitly rather than pretending the number is in the text.

### What worked
- Questions 2, 3 and 4 are fully supported by the text: 1/(1 − 0.2) = 1.25; 2/559 = 0.36 percent so 559/557 = 1.004; and the 5.8 percent with the 1.2 percent heap saving.
- Question 5 is answerable in outline: the counting model's self-check reproduces the existing backend for all 161 functions, which validates the walk but says nothing about feasibility of the predicted 16,544 / 13,255.

### What didn't work
- Question 1 cannot be answered from the text without an assumption, since 1.8 s is absent from the article and "responds" is undefined for that report. I answered it and flagged it at confidence 3 rather than leaving it blank, because the *method* the article teaches does determine where any such interval ends if the report uses the project's definitions.
- Question 6 invites a mechanism (alternating order cancels drift) that the article does not spell out; I included it but kept confidence at 4.

### What I learned
- A quiz can be answerable in spirit and unanswerable in detail; the difference is exactly what the editor needs to see.

### What was tricky to build
- Question 5's second half asks what the check does *not* establish. The article defers the assumptions to Article 5, which I cannot read, so I had to name general omissions (register pressure, spills, calling conventions) and be clear they were my inference.

### What warrants a second pair of eyes
- Whether my answer to question 1 asserts more than the text allows in saying the interval ends when the nucleus accepts the screen description.

### What should be done in the future
- If the article keeps question 1, section 2.1 should contain a worked example using an externally reported number.

### Code review instructions
- Compare each answer against `article.md`; the arithmetic in answers 2, 3 and 5 should reproduce from the article's own numbers.

### Technical details
- Answer 2: 1/0.80 = 1.25, and 1/(0.80 + 0.02) = 1.22 for a tenfold local improvement. Answer 3: 2/559 = 0.36 percent; 559/557 ≈ 1.004; the 340 ms came from the scheduler, not the compiler.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, quoting each passage that cost me a reading and keeping the claims I could not verify separate from the prose complaints. I then scored sections 2.1–2.8 and chose one addition and one cut.

### Prompt Context
**User prompt (verbatim):** see Step 1 (task step 3: `feedback.md` with six named sections).
**Assistant interpretation:** Report teachability honestly, with quotes, and keep arithmetic gaps distinct from style.
**Inferred user intent:** The editor needs actionable, specific criticism before publication, including which quiz questions the article fails to support.
**Commit (code):** N/A

### What I did
- Wrote `feedback.md` with: passages read twice (six quotes), terms used before explanation (twenty items), unverifiable claims (ten quotes), section scores 2.1–2.8, unanswerable quiz questions, and one addition plus one cut.

### Why
- I scored 2.4 at 2 and 2.8 at 2 because that is where my trust broke: 2.4 has three arithmetic inconsistencies, and 2.8 firms up as key points what the body calls hypotheses.
- I scored 2.1 and 2.6 at 5 because they are genuinely excellent and the report should say so, not only complain.

### What worked
- The distinction between "terms borrowed from Article 1" (a stated, acceptable choice that still costs a standalone reader) and "terms never explained anywhere" (WebAssembly reactor, lowering, segment, engine) produced a sharper diagnosis than one combined list.

### What didn't work
- I could not verify the 88 percent instruction share, the 340 ms scheduler saving, the 161-function match, or the RV32-bytes-per-WebAssembly-byte ratios, because none of the underlying counts are printed. I listed them as missing evidence rather than as errors, since I cannot tell whether they are wrong or merely unsupported.
- I could not check anything against the repository (`scripts/`, `various/`, revision `60a38f0`), and the task forbids leaving this directory, so every experiment result is taken on trust.

### What I learned
- The most damaging problem is not a wrong number but an unreproducible one: 29.9 ms with no derivation teaches the reader to accept numbers they cannot check, which is the opposite of the article's thesis.

### What was tricky to build
- Deciding how many terms to list. I kept every term whose absence forced a re-read, and did not list words a general programmer knows.

### What warrants a second pair of eyes
- The claim that "more than half" is contradicted by the 50.0 percent printed for Files; if the 50.0 percent is a rounding of something like 50.4, the sentence is only misleading, not wrong.

### What should be done in the future
- Add the borrowed-terms block; cut the "Segments" column; reconcile the two compositor traces; give the clock frequency and the WebAssembly body byte counts.

### Code review instructions
- Check `feedback.md` against `article.md` section by section; the arithmetic reproductions in 2.3 and 2.4 are the places where the report is most likely to be contested.

### Technical details
- Section scores: 2.1 = 5, 2.2 = 3, 2.3 = 3, 2.4 = 2, 2.5 = 3, 2.6 = 5, 2.7 = 4, 2.8 = 2.

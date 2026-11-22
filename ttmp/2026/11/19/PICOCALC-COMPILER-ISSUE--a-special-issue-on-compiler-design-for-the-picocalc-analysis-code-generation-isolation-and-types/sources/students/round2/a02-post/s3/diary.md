# Investigation entry

## Step 1: Reading Article 2 and its glossary

I read `article.md` once straight through, then went back through the glossary entry by entry while re-reading, because the task asks me to report only terms that *neither* the article nor the glossary explains. The article is short enough to hold in one pass, but the numbers are dense: two boot profiles, an Amdahl model built from two unrelated traces, and two compiler phase tables that use different denominators. My intent here was to end with an accurate map of which numbers come from which measurement, so the quiz step would not become a search exercise.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." (see Step 1)
**Assistant interpretation:** Read `article.md` in full, consulting `glossary.md` as a reader would, and note unclear passages, unexplained terms and unverifiable claims.
**Inferred user intent:** The editor wants an honest pre-publication read-through that finds where the teaching fails, not a summary of the article.
**Commit (code):** N/A — no repository commit was made in this session; only three new files were written under this directory.

### What I did
- Read `TASK.md` and `diary-format.md`.
- Read `article.md` end to end (sections 2.1–2.9, references).
- Read `glossary.md` end to end and cross-checked every term that appears in Article 2.

### Why
- The task's first requirement is order: read, then quiz, then feedback, then diary. I kept that order so the quiz answers reflect a first reading rather than hindsight from the feedback pass.

### What worked
- The glossary resolved most of my vocabulary gaps: *world*, *turn*, *engine*, *compositor*, *nucleus*, *reactor*, *lowering*, *CJI*, *typed compiler*, *frame*, *branch over a jump*.
- Section 2.1's table with its "Does not include" column was the most useful single device in the article; it names both ends of each interval, which is exactly what the article claims is usually missing.

### What didn't work
- Three terms are neither in the glossary nor explained in Article 2: *segment* (section 2.3, and the "Segments" column), *RV32* (used as a target architecture with no definition), and *WebAssembly* (used constantly, never described). The glossary's *Engine* entry says "native (RV32 machine code)" but never says what RV32 is or that it is 32-bit RISC-V.
- The hardware-testing vocabulary in section 2.6 — "toggle a spare pin", "logic analyzer", "largest-block figures" — is also outside the glossary, so the recommended measurement method is not actionable for a reader without embedded experience.

### What I learned
- The article's central complaint is self-consistent: it never measures anything that ends at the LCD, and the one model it builds (4.3 percent application share) rests on two traces from different applications and different firmware builds. The article admits this repeatedly, which is honest but makes the confession longer than the argument.
- Two different totals are given for what reads like the same CJI run: 1,480 s in the section 2.4 table, and "the run quoted in Article 1 took 1,475 s" in the same sentence. The table's percentage column is computed against 1,480 s.

### What was tricky to build
- Reconstructing the typed-compiler table's denominators. The 48.7 ms "native path" is tokenize + rest of frontend + lower, but the accompanying text also gives a 29.9 ms "whole WebAssembly path" and two phases outside both (2.4 ms source load, 1.3 ms link). I resolved it only by checking that 8.0 + 20.5 + 1.3 = 29.8 ≈ 29.9, which the article never states.

### What warrants a second pair of eyes
- Whether the "Share of the native path" column is the right denominator for a reader who is being told about the WebAssembly path 29.9 ms figure two sentences later. A copy edit here would help more than any prose change.
- Whether "matched comparison of three boots" in section 2.3 meets the standard section 2.6 sets ("Most device figures are one run, or three ... at least ten times").

### What should be done in the future
- The editor should decide whether *segment*, *RV32* and *WebAssembly* become glossary entries; the first two are cheap to add and the third is currently assumed knowledge.
- The 1,475 s / 1,480 s discrepancy needs a decision: one total, or a sentence explaining the two runs.

### Code review instructions
- Files touched: `answers.md`, `feedback.md`, `diary.md` in this directory. No source or article file was modified.
- Validation: check that each `answers.md` entry is 2–6 sentences and ends with `Confidence: N`; check that `feedback.md` uses exactly the seven required section headings.

### Technical details
- Article under review: `article.md`, "2. Measuring Before Optimizing", sections 2.1–2.9.
- Vocabulary reference: `glossary.md`, 6 groups (system, compilers, program analysis, code generation, loading and caching, safety, language design).

## Step 2: Answering the six quiz questions

I answered all six questions in `answers.md`, in my own words, showing the arithmetic wherever a question asked for a computation. Questions 2 and 6 needed working shown, so I wrote out the divisions explicitly (1.6 / 37.2, 1 / 0.957, 1,988 / 16,792, 8.0 × 66 / 16,792) and checked each against the article's stated results before committing to a confidence number.

### Prompt Context
**User prompt (verbatim):** see Step 1 — "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show working where a question asks for a calculation or a translation. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain)."
**Assistant interpretation:** Six numbered answers, 2–6 sentences, own wording, arithmetic shown, each followed by a confidence line.
**Inferred user intent:** Test whether a careful reader can actually get the answers out of the text, and record where confidence drops as a signal of teaching failure.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered sections.
- Chose confidence 5 for questions 1 and 3 (both answerable from a single table or a single paragraph), 4 for questions 2, 4 and 6, and 3 for question 5.

### Why
- I assigned lower confidence where I had to supply reasoning the article does not state, rather than where the arithmetic was harder. Question 5 got 3 because "what the check does not establish" is answered in the text only by a pointer to Article 5.

### What worked
- The arithmetic reproduces cleanly: 52.9/33 = 1.60 ms; 1.6/37.2 = 4.30 percent; 1/0.957 = 1.045; 85.9/1,480 = 5.80 percent; 1,479.1/1,480 = 99.94 percent; 1,988/16,792 = 118.4 µs; 118.4 µs × 360 MHz = 42,600 cycles; 8.0 × 66 = 528 ms per boot, /16,792 = 31.4 µs = 11,300 cycles; 293/559 = 52 percent; 8.0 + 20.5 = 28.5 → 58.5 percent; 20.2/48.7 = 41.5 percent.
- Question 4 has a neat pair of numbers (5.8 percent, then 1.2 percent saved) that refute the garbage-collection hypothesis outright, so that answer came easily.

### What didn't work
- Question 2's second half, "why is the share an upper limit", does not work as written without an extra assumption. The article says the unmeasured drawing time "can only add to the denominator", which is true only if that missing time lies after the handler returns; since the 35.6 ms starts when the compositor received the key, some compositor work could sit before the handler. I answered with the article's assumption made explicit rather than pretending the text was complete.

### What I learned
- Question 6 turned out to be the hardest arithmetic in the quiz, not because it is hard but because the two per-token figures measure different scopes and the article never labels them side by side: one is the whole WebAssembly compile, the other is the tokenizer alone, scaled by a factor of 66 borrowed from a different workload.
- Precision in the article exceeds its inputs: 4.3 percent and 1.045× come from two unrelated single traces, and I recorded that as a confidence-4 rather than confidence-5 answer.

### What was tricky to build
- Keeping answers within 2–6 sentences while showing working. The constraint pushed the arithmetic into compact inline expressions such as "1.6 / 37.2 = 0.0430". Sentence counting was the practical limit; I did not try to trim lower-confidence answers, since the reasoning was the point.

### What warrants a second pair of eyes
- My question 5 answer asserts that register pressure and spills could eat the predicted gain. That is my inference from general compiler knowledge, not from Article 2, which only defers to Article 5. If the editor wants the answer restricted to what Article 2 supports, that sentence should be cut.
- My question 3 answer states "0.52" for the compositor's share; the article says "more than half", which agrees, but I supplied the arithmetic myself.

### What should be done in the future
- Section 2.4 would be easier to test on if the two per-token figures were given in one sentence with their scopes attached. That single change would move question 6 from confidence 4 toward 5 for most readers.

### Code review instructions
- File: `answers.md`. Verify each numbered entry is 2–6 sentences and that the last line of each is `Confidence: N`.
- Recompute: 1,988/16,792; 8.0 × 66/16,792; 293/559; 85.9/1,480.

### Technical details
- Inputs used: section 2.1 table (interval ends), section 2.2 (52.9 ms, 33 turns, 35.6 ms, 8.8 ms), section 2.3 (559 ms, 293 ms, 2.04 s → 1.70 s, 2.13 s → 1.79 s), section 2.4 (1,480 s, 85.9 s, 5.8 percent, 1.2 percent, 1,988 ms, 29.9 ms, 16,792 tokens, 360 MHz), section 2.5 (161 functions, 120/34/7, 16,544, 13,255).

## Step 3: Writing the feedback

I wrote `feedback.md` in the seven required sections, quoting short passages and saying what was unclear rather than what I would have written. The intent was to separate three different failure modes — prose that needed a second reading, vocabulary that was never supplied, and claims that could not be checked from this article alone — because they have different fixes.

### Prompt Context
**User prompt (verbatim):** see Step 1 — "Write `feedback.md` with these sections: **Passages I had to read twice** ... **Terms used before they were explained, or never explained** ... **Claims I could not verify from the article itself** ... **Section scores** ... **Questions that the article did not let me answer** ... **One thing to add and one thing to cut**".
**Assistant interpretation:** Seven-headed feedback document, quoting evidence and giving per-section scores 1–5 with a reason each.
**Inferred user intent:** Give the editor an actionable list ordered by reader pain, with enough quotation to locate each problem.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with the seven headings the task names, in that order.
- Scored sections 2.1–2.9: 5, 2, 4, 3, 4, 3, 4, 5, 4.
- Named a concrete add (a provenance paragraph for the two section 2.2 measurements) and a concrete cut (the repeated hedging in section 2.2's third paragraph).

### Why
- I scored 2.2 lowest because it carries the article's most quotable number while conceding that the number is built from unrelated traces. That is a teaching risk rather than a factual error, which is why it is 2 and not 1.
- I scored 2.1 and 2.8 highest because both are checkable: the interval table names its exclusions, and every key-point bullet can be reproduced from the body.

### What worked
- Every "claim I could not verify" is anchored to a quotation, and the strongest ones are structural rather than cosmetic: the 52.9 ms and 35.6 ms traces have no source while section 2.5 is careful to give a revision and a workspace path; and the "matched comparison of three boots" fails the standard section 2.6 sets two pages later.
- The section 2.4 additive check (8.0 + 20.5 + 1.3 ≈ 29.9) gave me a defensible way to show that the table mixes denominators, instead of just asserting it.

### What didn't work
- "Questions that the article did not let me answer" came out short because, honestly, all six were answerable in some form. I recorded three as *partially* answerable — question 2 (upper limit), question 5 (what the check does not establish), question 6 (what each per-token figure measures) — and said what was missing in each case. I did not inflate the list to look thorough.

### What I learned
- The article's honesty is a strength and also the source of its main prose problem: it states the same caveats (different applications, different builds, single trace, hypothesis not finding) three times in section 2.2, so the caveats crowd out the arithmetic.
- The glossary is genuinely good for the system and compiler vocabulary; its gaps are at the *hardware measurement* end, which is odd given that section 2.6 tells the reader to attach a logic analyzer.

### What was tricky to build
- Choosing quotes short enough to be locatable but long enough to be fair. Several of my "read twice" items only make sense with two adjacent sentences, for example the pair "the whole WebAssembly path, measured as one piece, took 29.9 ms" and "Two further steps were timed separately and are not part of that total", which have to be read against each other to show the ambiguity.

### What warrants a second pair of eyes
- My score of 2 for section 2.2 is the judgement most likely to be contested; it depends on how much weight the editor wants a teaching article to put on one admittedly rough model.
- Two of my "never explained" terms — *RV32* and *WebAssembly* — may be considered domain background that Article 1 supplied. Article 2 does say it assumes Article 1's terms, so if Article 1 defined them, those two lines should be dropped from my list rather than added to the glossary. I could not check Article 1 because it is not in this directory.

### What should be done in the future
- If the article is revised, re-run this quiz with a fresh reader after the section 2.4 table is relabelled and the 1,475 s / 1,480 s discrepancy is settled; those two changes should raise question 6 and shake loose any remaining "read twice" items in 2.4.

### Code review instructions
- File: `feedback.md`. Confirm the seven headings appear exactly as the task names them, that every quoted passage is verbatim from `article.md`, and that all nine numbered sections (2.1–2.9) have a score.
- Spot-check quotes against `article.md` with a text search.

### Technical details
- Section scores: 2.1 = 5, 2.2 = 2, 2.3 = 4, 2.4 = 3, 2.5 = 4, 2.6 = 3, 2.7 = 4, 2.8 = 5, 2.9 = 4.
- Terms listed as unexplained: segment, RV32, WebAssembly, relocate, hash, "denominators", logic analyzer / spare pin, largest-block, control run / interleaved, matched comparison.

# Investigation entry

## Step 1: Reading the article

I read `article.md` from start to finish in one pass, then re-read the tables in sections 2.3, 2.4 and 2.5 with a calculator because the numbers are the substance of the article. `TASK.md` and `diary-format.md` were read first so I knew what output was required. The article is a measurement-methods piece: it has a small amount of prose and a lot of tables, so reading it is mostly reading tables.

The main difficulty was that the prose claims are checkable but the tables do not print the denominators, so several percentages had to be reverse-engineered. I decided to record every place where the arithmetic did not close rather than silently accepting it, since the editor asked specifically to learn where the article fails.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, then do what it says: read the article, answer the quiz into `answers.md`, write `feedback.md` with the six required sections, write this diary, and reply `DONE`.
**Inferred user intent:** The editor wants an honest student-eye test of a teaching article before publication, especially about whether the numbers in it can be followed and checked.
**Commit (code):** N/A — no code changed in this session.

### What I did
- Read `TASK.md`, `article.md` and `diary-format.md` with the `read` tool.
- Re-derived the arithmetic in sections 2.2, 2.3, 2.4 and 2.5 by hand.

### Why
- The task asks for feedback on whether the article teaches; the article's subject is checking measurements, so its own numbers get the same treatment.

### What worked
- Section 2.1's table is self-contained and unambiguous: four intervals, each with both end events and an explicit "does not include" column.
- The 2.3 boot table sums exactly: 293 + 81 + 32 + 123 + 30 = 559 ms, matching the stated 559 ms.
- Amdahl's limit 1 / (1 − p) reproduced correctly for p = 0.1 (1.111) and p = 0.2 (1.25).
- 1.6 / (35.6 + 1.6) = 4.30 percent, which the article rounds to 4.3, and 1 / (1 − 0.043) ≈ 1.045, matching the stated "factor of 1.045".
- 8.8 − 1.6 = 7.2, matching "about 7 ms".

### What didn't work
- Could not reproduce 29.9 ms as "the WebAssembly path" from the 2.4 table: 8.0 + 20.5 + 1.3 = 29.8, but adding the 2.4 ms compiler-evaluation row gives 32.2.
- Could not reconcile "the tokenizer alone costs about half a second per boot" with "each token costs about 118 microseconds": 500 ms / 16,792 ≈ 31 µs, while 118 µs × 16,792 ≈ 1.98 s, which is the whole device compile.
- The second compositor trace in 2.3 sums to 230 ms, not the stated 235 ms, and its 235 ms does not match the 293 ms compositor row above it.
- No recovery was needed for these; they became feedback items rather than errors in my own work.

### What I learned
- That cycle counts in the article ("roughly 42,000 processor cycles" for 118 µs) imply a clock near 350 MHz, which the article never states; a reader cannot check the figure.
- That the "at most 4.3 percent" bound depends on the unmeasured drawing time sitting outside the denominator, which the article asserts rather than derives.

### What was tricky to build
- N/A for code. The tricky part of the reading was reconstructing implied totals: the "Share of the RV32 path" percentages in 2.4 only make sense if the RV32 path totals about 50 ms (since 8.0 ms is 16 percent of it), and that total is never printed.

### What warrants a second pair of eyes
- Whether the 29.9 ms figure was meant to include the 2.4 ms compiler-evaluation row and the 1.3 ms link, and whether the 118 µs per token is a typo for about 31 µs or a deliberate statement about total compile time per token.
- Whether the two compositor traces in 2.3 are from the same or different boots; the 235/293 ms difference is large enough to matter.

### What should be done in the future
- Add explicit totals (RV32 path, WebAssembly path, device clock) so every percentage in the article can be recomputed by the reader.
- Give the second compositor trace a consistent denominator or cut it.

### Code review instructions
- N/A — documents only. Outputs are `answers.md`, `feedback.md`, `diary.md`.

### Technical details
- Amdahl limit: speedup → 1 / (1 − p); p = 0.2 gives 1.25.
- Boot profile: compositor 293 ms of 559 ms = 52.4 percent, consistent with "more than half".
- CJI: 85.9 s GC of 1,479.1 s frontend = 5.8 percent, as stated.
- Experiment 2: 43,965 / 16,544 = 2.66 and 43,965 / 13,255 = 3.32, both matching the stated factors.

## Step 2: Answering the quiz

I wrote `answers.md` with six numbered answers, each two to six sentences, and a `Confidence: N` line after each. Where a question asked for a calculation (questions 2 and 3) I showed the working; where it asked for a location (question 1) I named the end event from the 2.1 table and the exclusions column.

The hard part was question 1, because the quoted report ("Agenda responds 1.8 seconds after power-on") does not say which of the article's four intervals it means, and there is no power-on-to-first-response row in the table. I answered using the "first response after boot" interval and marked confidence 3 rather than pretending the text settles it. The other answers came straight from the text and I marked them 4 or 5.

### Prompt Context
**User prompt (verbatim):** see Step 1 (the single prompt, "Read TASK.md and carry out every step in order.").
**Assistant interpretation:** Answer section 2.9 in my own words into `answers.md`, numbered like the questions, with a confidence line each.
**Inferred user intent:** The editor wants to see whether the quiz can actually be answered from the article alone, and where the reader had to guess.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six answers and six `Confidence:` lines (3, 5, 5, 5, 4, 4).

### Why
- Showing the arithmetic for questions 2 and 3 makes the answers checkable, which is what the article itself demands of measurements.

### What worked
- Questions 2, 3, 4 and 6 were fully answerable and I could show the numbers: 1/0.8 = 1.25; 2/559 ≈ 0.36 percent; 85.9 s and 1.2 percent; and the two citations in 2.6.
- Question 5 was answerable: the walk reproduces the current backend's count and matches all 161 functions, which does not prove the new backend is implementable or fast.

### What didn't work
- Question 1 could not be pinned to one interval with certainty; my answer states the likely end event and the residual wait, but relies on my own interpretation of the quoted report.
- Question 5's second half ("what the check does not establish") required me to supply the reasoning, since the article only says it validates the walk.

### What I learned
- That four of six questions are answerable from the text alone, so the quiz is mostly sound; the weak spot is the framing of question 1 against the 2.1 table.

### What was tricky to build
- Keeping answers to two to six sentences while showing working. Question 2 needed the limit argument, one substituted number, and a concrete example, which is already three sentences before any caveat.

### What warrants a second pair of eyes
- My confidence of 3 on question 1 is the only place where I am guessing; if the editor intended "responds" to mean something else, the expected answer changes.

### What should be done in the future
- Add a "power-on to first response" row to the 2.1 table so question 1 has an unambiguous referent.

### Code review instructions
- Read `answers.md` against `article.md` sections 2.1–2.6; spot-check the two divisions in answers 2 and 3.

### Technical details
- Answer 3 uses the Amdahl limit with p ≈ 0.0036, giving a ceiling of about 1.0036×, i.e. at most about 2 ms of the 559 ms.
- Answer 4 pairs the 5.8 percent share with the 1.2 percent measured saving, both from the CJI table.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, quoting short passages and pairing each with what was unclear. Every arithmetic conflict I found while reading became a bullet in one of two places: a "read twice" item if the trouble was comprehension, or a "could not verify" item if the trouble was a missing number. Then I scored each numbered section from 2.1 to 2.9 and ended with one addition and one cut.

The hardest section to write was the scores: section 2.3 has a table that sums perfectly and a second trace that does not, so a single score of 1 to 5 has to average two very different qualities. I gave it 2 and said why in one sentence, rather than splitting the score.

### Prompt Context
**User prompt (verbatim):** see Step 1 (the single prompt, "Read TASK.md and carry out every step in order.").
**Assistant interpretation:** Produce `feedback.md` with exactly the six named sections, quoting where quotations are asked for.
**Inferred user intent:** A pre-publication teaching review that names concrete failing passages rather than general impressions.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: 5 "read twice" items, 13 term lines, 11 unverifiable claims, 9 section scores, 2 quiz questions that were hard or impossible, and one add plus one cut.

### Why
- The task asks for one line per term and a quoted passage per claim, so I kept both lists terse and specific.

### What worked
- The arithmetic checks gave objective, quotable failures: 293 + 81 + 32 + 123 + 30 = 559 (good), 84 + 146 = 230 ≠ 235 (bad), 1,988 / 29.9 ≈ 66 (good only with an assumed total), 500 ms / 16,792 ≈ 31 µs ≠ 118 µs (bad).
- Experiment 2's ratios check out exactly: 43,965 / 16,544 = 2.66 and / 13,255 = 3.32.

### What didn't work
- I could not verify the cross-check in Experiment 1 ("equals the size recorded in the project's own diary") because the diary is not quoted and I am not permitted to go outside this directory; it went into the unverifiable list rather than being called wrong.
- I could not check the claim that the harness module is "identical in size" to the device build (88,255 bytes) for the same reason.

### What I learned
- That the article's weaknesses cluster in section 2.4 and are all of one kind: percentages without printed denominators, so a reader who checks numbers loses trust precisely in the section that argues for checking numbers.
- That the language-level gap (CJI, nucleus, RV32, QuickJS, "reactor") is real but second-order compared with the arithmetic gap, because the article openly defers terms to Article 1.

### What was tricky to build
- The section scores forced a choice between several dimensions (prose clarity, arithmetic consistency, term load). I scored on whether a first-time reader could follow and check the section, which is why 2.3 and 2.4 scored low despite good prose.

### What warrants a second pair of eyes
- My suggested "one thing to cut" is the second compositor trace; if the 235 ms and 293 ms come from different builds, the honest fix is to relabel rather than delete. Someone with access to the traces should decide.
- My reading that "118 microseconds" is an error for about 31 µs, rather than a deliberate per-token share of total compile time.

### What should be done in the future
- Print totals in every table and state the device clock, so all percentages and cycle counts are recomputable.
- Say explicitly whether the two traces in 2.3 are from the same boot.

### Code review instructions
- Read `feedback.md` alongside section 2.4 of `article.md` and check the two conflicting token-cost figures; then check the 2.3 sentence "A second trace split the compositor's share further" against the 293 ms row.

### Technical details
- Cycle estimate implied by the article: 118 µs at about 350 MHz gives about 41,300 cycles, matching the stated "roughly 42,000" only if the clock is about 356 MHz, which is never given.
- RV32 bytes/instruction implied by Experiment 1: 30,840 / 7,710 = 4.0 for Agenda.

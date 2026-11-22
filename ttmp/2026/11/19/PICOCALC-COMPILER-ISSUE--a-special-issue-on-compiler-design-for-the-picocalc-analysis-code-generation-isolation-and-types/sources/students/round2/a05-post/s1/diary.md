# Investigation entry

## Step 1: Reading the article as a reader, with the glossary at hand

I read `article.md` once end to end without taking notes, then a second time with `glossary.md` open and
a tally sheet for every number the article asserts. The intent was to arrive at the quiz with only what
the article gives a stranger, and to mark each place where I had to stop.

### Prompt Context
**User prompt (verbatim):** "Read `article.md` from start to finish. The series has a glossary, `glossary.md`; look terms up there as a reader would, and report in your feedback only terms that neither the article nor the glossary explains." (from `TASK.md`, step 1)
**Assistant interpretation:** Read both files fully, treat the glossary as the only permitted outside aid, and keep a list of unexplained terms and unverifiable claims.
**Inferred user intent:** The editor wants to know where the article fails to teach a competent but uninformed reader, without being told about gaps the glossary already covers.
**Commit (code):** N/A — no repository changes, only reading.

### What I did
- Read `TASK.md`, then `article.md` (all 13 sections plus references), then `glossary.md`.
- Checked every arithmetic claim in the tables: instruction byte counts (43,965 × 4 = 175,860; 16,544 × 4
  = 66,176; 13,255 × 4 = 53,020), the size ratios (2.66 and 3.32), the store/load percentage
  (7,490 × 2 / 43,965 ≈ 34.1%), the flush share (155 / 16,544 ≈ 0.94%), the branch-over-jump reachability
  (1,357 of 1,358), and the hand-written loop split (4 + 7 + 2 = 13).
- Counted the instruction listings in 5.2 by hand to confirm the 10-instruction `let a = b + c` and the
  11-instruction `if (a > 0)`.

### Why
- The article's argument is quantitative, so a wrong number would be a teaching failure independent of
  prose quality; checking them was cheaper than trusting them.
- Reading twice (unhurried, then with a pen) separates "hard to understand" from "hard to remember".

### What worked
- The 5.2 tables are self-checking: each row pair maps a WebAssembly operation to its RV32, so a reader
  can count instructions without trusting the totals. All the byte and ratio arithmetic in 5.8 and 5.3
  reconciles exactly.
- The glossary genuinely covers the vocabulary the article leans on: branch over a jump, compile-time
  operand stack, flush, frame, join, leaf function, peephole optimizer, slot, register/stack machines.

### What didn't work
- My attempt to reproduce model A's 15 instructions for `bump` from the rules stated in 5.8 failed: I
  counted 18 (entry 4, `b + c` 4, `if` 2, `a + 1` 3, `return` 2, exit 3). Recovery: recorded it as an
  unverifiable claim in `feedback.md` rather than as an error, since the rules are said to live in
  `scripts/03-register-cache-model.mjs`, which is not in this directory.

### What I learned
- Several claims in 5.7 and 5.8 are only checkable if you have the model script; the article states the
  register budgets (15 caller-overwritable, 5 set aside, 11 of 12 saved) but not the arithmetic that turns
  them into "10 locals" and "11 locals".
- The article's weakest teaching spot is not any single paragraph but the ordering: 5.5 says the entry
  list has three kinds, 5.6 adds a fourth, and 5.3 promises sections in the order of a table whose rows
  they do not follow.

### What was tricky to build
- N/A (reading task). The one genuinely hard reading was `lhu t2, 4(t2)` in 5.9: the string layout
  (length at offset 0, characters at offset 4, two bytes each) is never stated and has to be reverse
  engineered from `slli t2, t0, 1` and the `+ 4` displacement.

### What warrants a second pair of eyes
- Whether model A really produces 15 instructions for `bump`, and whether the "58 KiB of memory to spare"
  figure and the code-size saving are measured in the same pool (RAM versus flash).
- Whether the peephole ceiling of "17 percent" is meant as 17% of all instructions or of the pair
  instructions; the sentence reads correctly but only after working the definition of the 34.1% row.

### What should be done in the future
- Publish the model script or a per-function extract of its output with the article so the counts in 5.8
  and the leaf-function and stack-depth figures can be checked.
- Identify "Experiment 4" with a citation in 5.2, as Experiments 1, 2 and 3 are.

### Code review instructions
- To verify: open `article.md` sections 5.2, 5.3, 5.8 and count the tables; compare against the checks
  listed under "What I did". No files were modified.

### Technical details
- Files read: `TASK.md`, `article.md`, `diary-format.md`, `glossary.md`.
- Files written in later steps: `answers.md`, `feedback.md`, this file.
- Verified identities: 43,965×4=175,860; 16,544×4=66,176; 13,255×4=53,020; 43,965/16,544=2.66;
  43,965/13,255=3.32; 175,860−66,176=109,684 B≈107 KiB; 175,860−53,020=122,840 B≈120 KiB;
  14,980/43,965=34.1%; 155/16,544=0.94%; 1,008+274+75=1,357 of 1,358 pairs.

## Step 2: Answering the quiz from the text alone

I answered the six questions in `answers.md`, numbering them as the article does and adding a confidence
line to each. The rule I set myself was that every step had to be traceable to a sentence in the article,
not to what I happen to know about compilers.

### Prompt Context
**User prompt (verbatim):** "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show working where a question asks for a calculation or a translation. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain)." (from `TASK.md`, step 2)
**Assistant interpretation:** Produce six short answers, showing the instruction tables for questions 1 and 2 and the byte arithmetic for question 5, each with a 1–5 confidence.
**Inferred user intent:** Find out whether the quiz is answerable from the article, and where the reader had to guess.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six answers and confidence lines: 5, 4, 5, 5, 4, 5.
- For question 1, built the ten-instruction table (2 + 2 + 4 + 2) by mirroring the article's
  `let a = b + c` listing with `y` at 0, `x` at 4 and stack slots at 8 and 12.
- For question 2, showed the compile-time list after each of the four operations and used the article's
  own `addi t0, t0, 1` short form for the constant, giving three instructions.
- For question 5, worked in bytes: 175,860 − 66,176 = 109,684 ≈ 107 KiB, and cross-checked that the byte
  rows in the table are exactly four bytes per instruction.

### Why
- Working in bytes rather than trusting the printed KiB figure is the only way to show the reader's
  arithmetic; the article gives both columns but never says they differ by the factor of 4.
- I chose not to soften confidence on the questions I could answer cleanly, and to drop it to 4 where a
  single sentence carried the answer (question 2's `addi` rule, question 5's unstated RAM/flash pool).

### What worked
- Questions 1, 3 and 4 were mechanical: the article contains the exact shape of the answer.
- Question 6 was the best question in the set — naming the two optimisations forces the reader to see
  that both need knowledge spanning the loop, which is the section's whole point.

### What didn't work
- Question 2 is under-determined without section 5.5's `addi` sentence: a literal reading of "lazy
  constants" still allows materialising the constant with `li`. I gave 3 and showed the 4-instruction
  alternative in the working, which slightly exceeds the six-sentence limit's spirit but keeps the
  reasoning honest.

### What I learned
- The quiz is answerable end to end, which is not typical for a section this dense; the article's habit of
  showing both the wasteful and the improved translation of the same statement is what makes it so.
- The one place the quiz outruns the text is question 5's "why that amount matters for Editor in
  particular", which depends on a 58 KiB figure imported from Article 2 without unit or source.

### What was tricky to build
- Question 1 required committing to an offset convention. The article's `bump` uses `sp`-relative
  offsets that mix locals (0, 4, 8) and stack slots (12, 16); I followed that convention exactly rather
  than inventing a separate stack pointer for the operand slots.

### What warrants a second pair of eyes
- The intended answer to question 2: 3 instructions (using `addi`) or 4 (materialising the constant).
  The article supports 3, but a grader with a different answer key would mark it wrong.
- The intended reading of question 1's "count the instructions": whether the frame-setup instructions
  count. I counted only the ten belonging to the statement, as in the article's own 5.2 table.

### What should be done in the future
- Add to question 2 "assume the constant can be used directly as an immediate" so the answer is unique.
- Add to question 5 the source of the 58 KiB figure, or make the question ask only for the KiB.

### Code review instructions
- Compare `answers.md` question 1 against the 5.2 table and question 5 against the 5.8 table; both should
  reconcile instruction-for-instruction and byte-for-byte.

### Technical details
- Question 1: 10 instructions (2 + 2 + 4 + 2). Question 2: 3 instructions (`lw t0, 0(sp)`;
  `addi t0, t0, 1`; `sw t0, 4(sp)`). Question 5: 109,684 bytes saved ≈ 107 KiB, ratio 2.66.

## Step 3: Writing the feedback report

I wrote `feedback.md` in the six requested sections, quoting each problem passage verbatim so the editor
can find it, and scoring each numbered section. Where I could check a number, I said so; where I could not,
I named the missing evidence rather than guessing.

### Prompt Context
**User prompt (verbatim):** "Write `feedback.md` with these sections: Passages I had to read twice … Terms used before they were explained, or never explained … Claims I could not verify from the article itself … Section scores … Questions that the article did not let me answer … One thing to add and one thing to cut." (from `TASK.md`, step 3)
**Assistant interpretation:** A structured report with quotes, per-section scores and exactly one addition and one cut.
**Inferred user intent:** Actionable revision notes ordered by where readers actually stumble, not a general review.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: seven quoted passages I reread; five unexplained terms; seven unverifiable
  claims; scores for all thirteen numbered sections; a note that all six quiz questions were answerable but
  two only just; and one addition (a worked model-A listing for `bump`) and one cut (the trap/interrupt
  paragraph in 5.5).
- Filtered the term list against `glossary.md` and against in-text definitions, so terms like *flush*,
  *join*, *leaf function*, *spill*, *loop inversion* and *range-check elimination* — all defined where they
  are used — were dropped.

### Why
- Quotes with section numbers make the report usable without a second read of the article.
- I scored 5.6, 5.7 and 5.8 at 3 rather than 2: each is comprehensible sentence by sentence, but each
  asks the reader to hold too many new ideas at once, which is a density problem rather than an obscurity.

### What worked
- Checking each table's byte column against its instruction count (×4) gave a positive finding worth
  reporting: the quantitative spine of the article is internally consistent.
- Keeping the "could not verify" list to specific numbers kept it short and testable.

### What didn't work
- I could not determine whether the 58 KiB figure refers to RAM available to Editor or to code space, so
  my comment on it is phrased as a question rather than a correction. Recovery: flagged under both
  "claims I could not verify" and "questions the article did not let me answer".

### What I learned
- The article's real difficulties cluster at section boundaries — the fourth kind of entry (5.6), the
  register budgets (5.8), the string layout (5.9) — rather than inside explanations, which are uniformly
  careful.

### What was tricky to build
- The "passages I had to read twice" section required distinguishing genuine ambiguity from my own slow
  reading. The test I applied: could I point to a specific missing link (a definition, an ordering, an
  arithmetic step)? The seven quoted passages each had one; several other dense paragraphs did not.

### What warrants a second pair of eyes
- Whether the model-A count of 15 for `bump` is right and my 18 is wrong (most likely: I may have counted
  frame setup that the model omits).
- Whether cutting the trap/interrupt paragraph loses a correctness argument the author needs for a later
  article.

### What should be done in the future
- Answer the 58 KiB question in the text; it is the only support for the claim that the gain matters.
- State the string memory layout once in 5.9, or drop the `lhu t2, 4(t2)` line and describe it in prose.

### Code review instructions
- Check that every item in the term list is genuinely absent from both `article.md` and `glossary.md`;
  that was the stated filter.
- Check the section scores cover all thirteen numbered sections (5.1–5.13); they do.

### Technical details
- Files written: `feedback.md`, plus `answers.md` and this `diary.md`.
- Cross-checks quoted in the report: 7,490×2/43,965=34.1%; 175,860−66,176=109,684 B; 1,357/1,358 pairs
  short-reachable; 4+7+2=13 for the hand loop.

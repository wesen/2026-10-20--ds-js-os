# Investigation entry

## Step 1: Reading the article, with the glossary open

My job here was not to build anything but to read `article.md` from start to finish the
way a student would, and to note where the teaching fails. I read it once straight
through without stopping, then re-read the sections that carry arithmetic with
`glossary.md` beside me, checking every term the article used against the glossary
entry, and recomputing every percentage and multiplier I could from numbers printed in
the article.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task list, then execute its four numbered items in sequence: read the article against the glossary, answer the quiz, write structured feedback, and write this diary.
**Inferred user intent:** The editor wants an honest pre-publication read by someone who is not the author, with the failures of explanation located precisely enough to fix.
**Commit (code):** N/A — this session produces documents, not code.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (5.1–5.13 plus references) and `glossary.md` in full.
- Re-read sections 5.2, 5.3, 5.4, 5.5, 5.7 and 5.8 with a calculator, checking:
  - 7,490 pairs × 2 ÷ 43,965 = 34.1% (matches the table);
  - 175,860 ÷ 4 = 43,965, 66,176 ÷ 4 = 16,544, 53,020 ÷ 4 = 13,255 (the byte row is the instruction row × 4, as 5.1 promises);
  - 43,965 ÷ 16,544 = 2.66 ("2.7 times"), 43,965 ÷ 13,255 = 3.32 ("3.3 times");
  - 175,860 − 66,176 = 109,684 B = 107.1 KiB and 175,860 − 53,020 = 122,840 B = 120.0 KiB ("107 to 120 KiB" checks out);
  - 155 ÷ 16,544 = 0.94% ("under one percent" checks out);
  - 70.2 − 55.3, 65.8 − 52.5, 61.9 − 50.0 = 14.9, 13.3, 11.9 (does **not** match "11 to 14 percent" in 5.7);
  - 17 ÷ 13 = 1.31 ("within a factor of 1.3" checks out);
  - 120 + 34 + 7 = 161 functions (matches "all 161 functions").
- Wrote notes on passages that needed a second read into `feedback.md`.

### Why
- Recomputation, rather than trust, is the only way to answer the task's request for claims that could not be verified: a number I can redo from printed figures is verifiable even though the underlying program is absent, and a number I cannot redo is a finding.
- Reading against the glossary, rather than from memory, is what makes the "terms never explained" list defensible: a term is only a failure if it is in neither place.

### What worked
- The article's internal consistency is good: the three application instruction totals agree between 5.3 and 5.8, and the byte counts are exactly four times the instruction counts. This let me separate "unverifiable because the script is not here" from "wrong", and only one figure was wrong.
- The instruction table in 5.1 covers every mnemonic used in every listing; I never met an unexplained instruction.

### What didn't work
- I could not open `scripts/03-register-cache-model.mjs` or `various/03-register-cache-model.txt`, which section 5.8 cites as the source of most of its numbers. The task restricts me to this directory, the files are not here, and so four separate claims (leaf-function count, stack depths, the 228 `&&`/`||` blocks, the 155 flush instructions) remain unverified.
- The figure `_assets/handheld-rv32-instruction-mix.png` is referenced but I could not open it from here either; I said nothing about the figures rather than guess.

### What I learned
- The single largest teaching gap is not a missing definition but a missing example: section 5.5 asserts the flush rule as a correctness requirement and never shows a flush anywhere in the article.
- Second largest: the 41-instruction tally in 5.2 presents six top-level rows of which only two correspond to listings shown to the reader, so 20 of the 41 instructions are asserted.

### What was tricky to build
Nothing was built; the tricky part was the arithmetic bookkeeping. Two errors had to be distinguished: the "11 to 14 percent" range in 5.7 which does not follow from the 5.3 table (a real inconsistency), and the 5-register figure in 5.8 which contradicts the "seven temporaries" of 5.7 (also real, but a modelling assumption rather than a slip, so I reported it as undefended rather than as wrong).

### What warrants a second pair of eyes
- Whether "11 to 14 percent" is a typo for "12 to 15" or whether the two rows of the 5.3 table are not meant to be subtracted. Only the author can say.
- Whether the 5 temporaries in the model and the 7 temporaries in 5.7 are reconciled somewhere in the script.

### What should be done in the future
- Quote a short excerpt of the model script's output inside the article, so that at least the leaf count and stack depths are checkable without leaving the page.

### Code review instructions
- Read `answers.md` (working shown for questions 1, 2 and 5) and `feedback.md` (numbered findings). No commands are needed; the checks are arithmetic on figures printed in `article.md`.

### Technical details
- Article evaluated: `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a05-post/s3/article.md`, sections 5.1–5.13.
- Constraints observed: no web access, no files outside this directory, no use of `scripts/` or `_assets/`.

---

## Step 2: Answering the quiz

Six questions, each asking for a translation, a rule, a measurement or a division. I wrote
each answer out in full – listings where the question asks for a translation, lists where
it asks for a list, and the arithmetic written down where it asks for a calculation – and
attached a confidence number, being careful to lower it where I had to infer a rule the
article only implies.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Item 2 of the task: answer the six questions of section 5.13 into `answers.md`, numbered, two to six sentences each, in my own words, with working shown and a `Confidence: N` line after each.
**Inferred user intent:** Test whether the article actually teaches enough to be worked, and see where a careful reader has to guess.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with answers 1–6.
- Q1: ten instructions, laid out line by line as a listing, matching the shape of the `let a = b + c` table in 5.2.
- Q2: a four-row table (operation, compile-time list, emitted RV32) giving three instructions; the list states `[local y]`, `[local y, const 1]`, `[register t0]`, `[]`.
- Q3: trap (nothing reads the frame afterwards) and hardware interrupt (registers are saved and restored).
- Q4: single forward pass, 4 KiB vs 1 MiB reach, therefore always the long form; measurement 1,009 pairs in Editor, of which 1,008 are within reach.
- Q5: 175,860 − 66,176 = 109,684 B ≈ 107.1 KiB, ratio 2.66, against 58 KiB of spare memory.
- Q6: the hoisted `text.length` load (needs to know the loop does not write it) and the removed bounds check (needs the loop condition's implication); I named loop inversion as the article's third.
- Confidence values: 5, 4, 5, 5, 5, 4.

### Why
- Q2 got 4 rather than 5 because the article never shows the constant-operand emit sequence for `i32.add`; I had to combine "`a + 1` becomes `addi`" (5.5) with the register-operand table (5.5) to get three instructions.
- Q6 got 4 because the question says "two things" and the article lists three, so there is a small ambiguity about which two are expected; I answered with two and named the third.

### What worked
- Q1 was straightforward because the `if (a > 0)` listing in 5.2 demonstrates that `i32.const` costs `li` plus `sw`, which is the only extra fact Q1 needs beyond the `b + c` table.
- Q5 was fully determined by printing the subtraction and the division, and the answer then cross-checks against the article's own "107 to 120 KiB" sentence, which was satisfying.

### What didn't work
- My first pass at Q2 gave four instructions, counting the store of the constant to a stack slot. Section 5.5's "`a + 1` becomes the single instruction `addi t0, t0, 1`" rules that out; the constant never reaches a slot. Corrected to three.

### What I learned
- The quiz is answerable from the text, with one qualification (Q2) and one dependency on a fact stated in prose rather than in a table (Q5 and the 58 KiB).

### What was tricky to build
- Deciding whether a lazy local read emits its `lw` at the `i32.add` or earlier. The article's table settles it: the load appears on the `i32.add` row, so before that row the value is still "local y" and nothing has been emitted for it.

### What warrants a second pair of eyes
- Answer 2's register choice (`t0` for the sum) and answer 5's rounding (107.1 KiB, "about 107") are mine, not the article's; an author might number the slots or registers differently.

### What should be done in the future
- Add a constant-operand row to the 5.5 table so Q2 needs no inference.

### Code review instructions
- Compare `answers.md` Q1 with the table in `article.md` §5.2, and Q5 with the byte row in §5.8: the byte counts are 4 × the instruction counts.

### Technical details
- Answer format: numbered headings, 2–6 sentences, `Confidence: N` on its own line.
- Arithmetic in Q5: 175,860 − 66,176 = 109,684; 109,684 / 1024 = 107.11; 175,860 / 66,176 = 2.657.

---

## Step 3: Writing the feedback

With the answers in hand I went back through my marginal notes and sorted them into the
six sections the task demands, keeping only terms that are in neither the article nor the
glossary, and quoting passages rather than paraphrasing so the editor can find them. I also
scored each numbered section and named the one thing to add and the one to cut.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Item 3 of the task: write `feedback.md` with the six named sections, quoting passages, scoring each numbered section 1–5 with one sentence of reason, and naming one addition and one cut.
**Inferred user intent:** A defect list an editor can act on, ordered by where a student actually gets stuck.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: Passages I had to read twice (5 quotations); Terms used before explained or never explained (5 items, after checking each against `glossary.md`); Claims I could not verify (8 quotations with the missing evidence named); Section scores (5.1–5.12, plus the 5.5 "rule at control-flow joins" subsection, each with a one-sentence reason); Questions the article did not let me answer (Q2 in full, Q1 and Q5 partly, Q3/Q4/Q6 clear); One thing to add and one thing to cut.
- Kept out of the term list everything the glossary covers, even where the article itself is thin: `reactor`, `world`, `abstract interpretation`, `back-edge`, `SSA form`, `trap`, `slot`.

### Why
- I reported the "11 to 14 percent" mismatch rather than silently fixing it, because the task asks for claims I could not verify and this is a claim I could actively contradict.
- I put the missing flush example under "one thing to add" rather than under "unclear passages", because the rule is stated clearly; what is missing is a demonstration, which is a different defect.
- The scores are relative to each other, not to an absolute standard: 5.4 and 5.7 got 3 because those sections caused me to reread, not because they are bad.

### What worked
- Structuring the unverifiable claims as quote-then-missing-evidence made it obvious that they almost all reduce to one cause: the model script and its output are outside the article.
- Checking the glossary entry by entry turned a vague feeling ("there is a lot of jargon") into five specific items, four of which are genuinely absent from both documents.

### What didn't work
- I could not check the two figures, so my section score for 5.3 is based on the table alone and may be harsh if the graph carries the missing mapping.
- I could not settle whether "5 temporaries" in 5.8 is an error or a documented assumption of the script, so I recorded it as undefended, not as wrong.

### What I learned
- The article's honesty about the limits of its own model (5.8: counts but does not generate, ignores compressed encodings) is unusually good, and it is why I trusted the numbers enough to spend effort recomputing them.
- Dense citations are the main obstacle to reading, not the technical content: the paragraph in 5.5 with TCC, Lua, Ertl, Liftoff and Titzer is the one place where I stopped reading for content and started skimming.

### What was tricky to build
- Separating "read twice because the sentence is badly built" (5.4's "saves a memory access and no instruction", 5.7's "two classical policies choose which") from "read twice because the idea is hard" (the flush rule). Only the first kind belongs under unclear passages.

### What warrants a second pair of eyes
- My claim that "the current value of local i" needs a kill rule is a correctness concern, not a stylistic one: if the implementation keeps a pending local entry across a write to that local, it reads a stale value. The article should state the invalidation rule even if the code happens to get it right.

### What should be done in the future
- Attach the model script's output to the article, or quote an excerpt.

### Code review instructions
- Read `feedback.md` top to bottom; each quotation is taken verbatim from `article.md` and can be searched for directly.

### Technical details
- Sections scored: 5.1 (5), 5.2 (4), 5.3 (3), 5.4 (3), 5.5 (4), 5.5 subsection (4), 5.6 (4), 5.7 (3), 5.8 (4), 5.9 (4), 5.10 (4), 5.11 (3), 5.12 (5).
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. No file outside this directory was read or modified.

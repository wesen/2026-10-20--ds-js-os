# Diary: student read of "5. Code Generation: From a Stack Machine to a Register Machine"

## Step 1: Reading the article end to end with the glossary open

I read `TASK.md` first, then `article.md` from §5.1 to §5.13 and the references, then `glossary.md` in full so I would know what was already promised elsewhere in the issue. I read the article once through without stopping, then re-read §5.2, §5.3, §5.4 and §5.8 while following the arithmetic row by row.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." (TASK.md step 1: "Read `article.md` from start to finish. The series has a glossary, `glossary.md`; look terms up there as a reader would, and report in your feedback only terms that neither the article nor the glossary explains.")
**Assistant interpretation:** Read the whole article as a student would, using the glossary as the only permitted reference, and note passages, unclear terms and unverifiable claims while reading.
**Inferred user intent:** The editor wants a reader's report of where the teaching fails, not a proofread or a rewrite.
**Commit (code):** N/A — no repository changes; only the three review documents.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md`, `glossary.md`.
- Checked the glossary entries for `Slot`, `Join`, `Flush`, `Compile-time operand stack`, `Branch over a jump`, `Leaf function`, `Peephole optimizer`, `Trap`.
- Recomputed every arithmetic claim in the article as I met it: 4+10+11+10+3+3 = 41; 14,980/43,965 = 34.1%; 155/16,544 = 0.94%; 7+34+120 = 161; 8+7 = 15; 175,860/66,176 = 2.66.

### Why
- The task forbids the web, so the glossary and the article's own tables are the only evidence I am allowed to use.
- Checking the sums while reading is the only way to separate "claim I cannot verify" (needs outside evidence) from "claim that is simply wrong" (bad arithmetic), and the editor needs that distinction.

### What worked
- Every percentage in §5.3 that can be derived from counts is internally consistent with its stated count.
- The §5.2 translation table is self-explanatory; I could reproduce it for a new statement without help.
- The instruction table in §5.1 covers every mnemonic used in every listing in the article.

### What didn't work
- "RV32 could express the whole test as one instruction, `blez a, after_if`" (§5.2) does not hold for a local stored at offset 8; a load is needed first. I could not reconcile the sentence with the rest of the section and recorded it as a passage I read twice.
- §5.8's model-B register budget (10 in a leaf, 11 in saved registers) is not derivable from the text without rebuilding the arithmetic, and "two instructions each" is never disambiguated.
- The figure files under `_assets/` are referenced by the prose but contain no numbers I can cite, so nothing in my report rests on them.

### What I learned
- Most of the article's numbers come from artefacts kept elsewhere (`scripts/03-register-cache-model.mjs`, `various/03-register-cache-model.txt`, "the project's records", Articles 2 and 4). A reader inside this document can verify ratios and sums but not the inputs to them.
- "Experiment 1–4" is a cross-article numbering scheme that the article never introduces, which makes four sentences unusable for a reader who starts here.

### What was tricky to build
- Distinguishing a term the glossary explains from one it does not (`Slot` has two meanings and is glossed; `flash` and `calling convention` are not), and keeping the term list to genuinely unexplained items as the task requires.

### What warrants a second pair of eyes
- My claim that the `blez a, after_if` sentence is inconsistent with locals living in the frame: worth confirming against the real backend, because if the backend does cache `a` in a register at that point then the sentence is right and the frame tally is wrong instead.
- My reading of "pay two instructions each to save and restore them" as 2 instructions per register: the §5.8 counts for `bump` and `countUnit` would settle it, but I could not see them.

### What should be done in the future
- Add the per-function instruction listings behind the 41 / 15 / 5 row of the §5.8 table, so a reader can check the model instead of trusting it.

### Code review instructions
- Read `answers.md` for what a reader could actually produce, and `feedback.md` for the reasons; the two disagreement points above are the ones worth checking against the compiler.

### Technical details
- Verified sums: 41 (function tally), 10 and 11 (per-statement counts), 14,980 = 7,490 × 2 and 34.07% of 43,965, 155/16,544 = 0.94%, 161 = 7+34+120, 15 = 8+7 caller-overwritable registers, 2.66 = 175,860/66,176, 109,684 B = 107.1 KiB, 122,840 B = 120.0 KiB, 13 = 4+7+2 for `countUnit`.

## Step 2: Answering the six quiz questions

I answered the six questions in §5.13 in order, doing the two translations by hand on paper first and then writing them as tables in `answers.md`, with a `Confidence: N` line after each answer.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." (TASK.md step 2: "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show working where a question asks for a calculation or a translation. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain).")
**Assistant interpretation:** Produce a student's own answers, with visible working for question 1 (a translation), question 2 (a translation) and question 5 (a calculation), and an honest confidence rating.
**Inferred user intent:** The editor wants to know whether the section actually enables the reader to do these five things that the introduction promises.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers, each 4–6 sentences and each with tables where the question asks for a translation.
- Question 1: followed the §5.2 pattern mechanically to get 10 instructions with the given offsets 0, 4, 8, 12.
- Question 2: built the compile-time list operation by operation, transferred the `addi` rule from §5.5's `a + 1` remark, and got 3 instructions.
- Question 5: computed 109,684 bytes = 107.1 KiB and the 2.66 ratio, and cross-checked against the article's "107 to 120 KiB" range using model B's 53,020 bytes.

### Why
- Tables keep the translations checkable instruction by instruction, which a paragraph of prose would not.
- I deliberately did not invent an answer to the second half of question 5: I stated the hedge and lowered the confidence to 3 rather than presenting the 58 KiB figure as something I could substantiate.

### What worked
- Questions 1, 3, 4 and 6 came straight out of the text; confidence 5 on each.
- The 107.1 / 120.0 KiB arithmetic exactly reproduces the article's stated "about 107 to 120 KiB", which confirms that the quoted range is model A to model B and not something else.

### What didn't work
- Question 5's "why that amount matters for Editor in particular" cannot be answered from the text: the 58 KiB of free memory has no source and it is unclear whether compiled code lives in RAM or flash. I answered as far as the text allows and marked confidence 3.
- Question 2 has no worked precedent for a constant operand in a compile-time-list translation; the `addi` form is stated in prose for a different expression, so my answer is a transfer, not a reading. Confidence 4.

### What I learned
- The compile-time-list table in §5.5 is a strong teaching device: having seen `b + c` I could do `y + 1` without hesitation, and the only unknown was the immediate rule.
- The `bump`/`countUnit` distinction (41 vs 103 today) means question 1's "count the instructions" is answerable by pattern, which is a good sign for the section.

### What was tricky to build
- Keeping question 1's answer to exactly 10 instructions required care about which register is popped first: in §5.2 the right operand goes to `t1` and the left to `t0`, so `add t0, t0, t1` has the operands the right way round. Reversing that would compute `1 + y` and still look plausible in text.

### What warrants a second pair of eyes
- My question 2 answer assumes the backend may fold a pending constant into `addi` when the other operand is a local read; if the model instead emits `lw`/`li`/`add`, the answer is 4 instructions and my confidence of 4 is too high.

### What should be done in the future
- Add one worked example of a constant folded into an immediate in the §5.5 table, so question 2 is a recall rather than a transfer.

### Code review instructions
- Compare `answers.md` question 1 against the §5.2 table line by line; every emitted instruction should map to one cell of the article's table.

### Technical details
- Question 1: `lw t0,0(sp)` / `sw t0,8(sp)` / `li t0,1` / `sw t0,12(sp)` / `lw t1,12(sp)` / `lw t0,8(sp)` / `add t0,t0,t1` / `sw t0,8(sp)` / `lw t0,8(sp)` / `sw t0,4(sp)` = 10.
- Question 2: `lw t0,0(sp)` / `addi t0,t0,1` / `sw t0,4(sp)` = 3, with lists `[local y]`, `[local y, const 1]`, `[reg t0]`, `[]`.
- Question 5: 175,860 − 66,176 = 109,684 B = 107.1 KiB; 175,860 − 53,020 = 122,840 B = 120.0 KiB; ratios 2.66 and 3.32.

## Step 3: Writing the feedback report

I wrote `feedback.md` with the six required sections, choosing quotations I had actually stumbled on rather than the ones that looked weakest in isolation, and scoring each numbered section.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." (TASK.md step 3: "Write `feedback.md` with these sections: Passages I had to read twice … Terms used before they were explained, or never explained … Claims I could not verify from the article itself … Section scores … Questions that the article did not let me answer … One thing to add and one thing to cut.")
**Assistant interpretation:** Report teaching failures with quotations, keep the term list to what neither the article nor the glossary explains, score sections 1–5, and give one concrete addition and one concrete cut.
**Inferred user intent:** The editor needs an actionable list before publication, in the reader's voice, with reasons rather than verdicts.
**Commit (code):** N/A.

### What I did
- Six quoted passages, each with the specific confusion named (the 17-percent halving, model B's "two instructions each", the `blez a` sentence, the trap/interrupt paragraph, the frame layout, the spill contradiction between §5.7 and §5.8).
- Seven terms that neither the article nor the glossary explains: `flash`, `KiB`/`MiB`, `calling convention`, `Experiment 1–4`, `bounds check`, `expression tree`, `hardware interrupt`. I dropped `operand stack`, `flush`, `spill`, `peephole`, `leaf function`, `SSA` and `slot` after finding them defined in the article or the glossary, as the task requires.
- Ten unverifiable claims, each with the missing evidence named (backend source, Experiment 4, the model script, the 58 KiB figure, "the project's records", and four Editor statistics).
- Section scores 5.1–5.12 with one sentence each, from 5 down to 2 for §5.8.
- Add: a worked model-B translation of `bump`. Cut: the linear-scan and Sethi–Ullman sentences in §5.7.

### Why
- I quoted the shortest span that contained the difficulty so the editor can find it quickly.
- I scored §5.8 lowest because it carries the article's central prediction and is the only section whose numbers I could not audit; §5.1 highest because it is the only section that needed no second reading.
- For the cut I chose material that is neither used by the proposed design nor examinable by the quiz, rather than simply the longest paragraphs.

### What worked
- The "claims I could not verify" list separates cleanly into (a) claims delegating to another article or an external artefact and (b) the one claim (§5.2's `blez a`) that appears to be simply wrong. That split should be useful to the editor.
- Every score has a citable reason, and the low scores coincide with the passages I had to read twice, so the report is internally consistent.

### What didn't work
- I could not judge the two figures (`_assets/handheld-rv32-instruction-mix.png`, `_assets/handheld-register-model-editor.png`) as teaching aids, since their data duplicates the tables; I therefore left them out of the add/cut recommendation rather than guess.
- My first draft of the term list included `operand stack` and `slot`; both are defined in §5.1 or the glossary, so the task's rule made me remove them.

### What I learned
- The article's weakest points are almost all where a number from another document is presented as a premise rather than as a result: 41 instructions, 161 functions, 31 leaves, 228 blocks, 58 KiB.
- Its strongest points are the two instruction-by-instruction tables, which is why my "add" is another table of the same kind.

### What was tricky to build
- Deciding whether "Experiment 1–4" belongs under terms or under unverifiable claims; I listed it in both, once as an unexplained identifier and once as a missing artefact, because the difficulty is different in each case.

### What warrants a second pair of eyes
- The §5.8 score of 2 is the harshest judgement in the report. If the editor intends the model script to be read alongside the article, the score should rise and the "unverifiable" entries for 161 functions and 31 leaves should be softened to cross-references.
- My claim that §5.7's "the compiler must spill one, and Best's rule says which" contradicts §5.8's "counts no spills" assumes the two sentences describe the same backend; if §5.7 is describing the future design and §5.8 the model, one clarifying clause would remove the contradiction.

### What should be done in the future
- Publish the model output (`various/03-register-cache-model.txt`) as an appendix or link, and introduce the Experiment numbering once, in a sentence, so later articles can cite it.

### Code review instructions
- Open `feedback.md` beside `article.md` at §5.2, §5.3, §5.4, §5.7 and §5.8; those five sections contain all six quoted passages and all six lowest-scoring items.

### Technical details
- Scores: 5.1 = 5, 5.2 = 4, 5.3 = 3, 5.4 = 4, 5.5 = 4, 5.6 = 4, 5.7 = 3, 5.8 = 2, 5.9 = 4, 5.10 = 3, 5.11 = 3, 5.12 = 4.
- Unanswerable: question 5 in part (the 58 KiB premise), question 2 in part (the immediate-folding rule is stated only in prose for `a + 1`).

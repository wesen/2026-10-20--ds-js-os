## Step 1: Read the article, the task, and the diary format

I read `TASK.md`, then `diary-format.md` to learn what was expected of this file, then `article.md` end to end without stopping to take notes, then once more section by section where the numbers were. The aim was to arrive at the quiz with a fair reading rather than a hostile one: I wanted to be able to say which questions the text genuinely supports.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** `TASK.md` asks for four artefacts in this directory — read the article, answer its "Check your understanding" questions into `answers.md`, write `feedback.md` with six prescribed sections, and write this diary — then reply with the single line `DONE`.
**Inferred user intent:** The editor wants a pre-publication reader's report that finds where the teaching fails, so the article can be fixed before it is printed. The honesty requirement in the task is the point of the exercise, not boilerplate.
**Commit (code):** N/A — no repository operations were requested or performed.

### What I did
- Read `TASK.md`, `diary-format.md`, and `article.md` (all 13 numbered sections plus the reference list) with `read`.
- Worked the arithmetic in the article by hand while reading: 43,965 × 4 = 175,860; 16,544 × 4 = 66,176; 13,255 × 4 = 53,020; 43,965/16,544 = 2.66; 43,965/13,255 = 3.32; 155/16,544 = 0.94%; 7 + 34 + 120 = 161; 17/13 = 1.31.
- Noted, per section, the places where a term arrived before its explanation, and the places where a number arrived without a method.

### Why
- Reading the whole article before answering anything, rather than answering each quiz question as I reached it, was deliberate: several questions (2, 5, 6) depend on sections that come after the one that provokes them, and answering out of order would have produced a worse set of answers and a worse report.
- Checking the arithmetic was the cheapest way to separate "asserted figure" from "derivable figure", which is the distinction the feedback file is organised around. It also showed that every byte figure in 5.8 is exactly four times an instruction count, which is a consistency check the article never points out.

### What worked
- Verifying that the three applications' function counts add to 161 established that 5.8's validation claim covers the same population as Experiment 1's table.
- Confirming that 175,860 = 43,965 × 4 means the "bytes of code" row is derived, not measured, which made it easy to write the units criticism without overstating it (the row is fine; the prose sentence about kilobytes mixes decimal and binary).

### What didn't work
- I could not reconcile two sentences in 5.4: "It can turn `sw t0, 12(sp); lw t0, 12(sp)` into the store alone, and it cannot delete the store without knowing that slot 12 is never read again." Read literally the second clause denies the first. I tried several readings (the load becomes a `mv`; the pair becomes a single store; the store becomes a single load) and none makes both halves true at once, so I recorded it as an ambiguity rather than guessing which one the author meant. No command was involved; the failure was interpretive, and the recovery was to describe the contradiction in `feedback.md` instead of resolving it.
- I could not count the 41 instructions of `bump`, because 27 of them are never printed. Recovery: I said so explicitly in the feedback under "Claims I could not verify" and in the note on quiz question 1.

### What I learned
- The article's strongest teaching move is the four-row table in 5.5 (WebAssembly / compile-time list after / emitted RV32), and its weakest is paragraph-level prose about who else had the same idea. That contrast set the shape of the feedback.
- The "Check your understanding" questions are honest about the chapter's argument: question 5 asks the reader to separate what the counting model validates from what it merely predicts, which is exactly the distinction the article's own limitation paragraph makes. A reader who skips 5.8 cannot answer it, which is presumably intentional.

### What was tricky to build
Not applicable in the code sense: no program was written or changed. The one construction that took care was the answer to quiz question 2, where the instruction count depends on whether the pending constant is allowed to fold into an `addi` immediate. The article supports folding with the clause "`a + 1` becomes the single instruction `addi t0, t0, 1`", but that clause is in prose while the comparable worked example (`let a = b + c`) is a table, so a reader could reasonably answer three or four instructions. I answered three, showed the alternative, and recorded the ambiguity.

### What warrants a second pair of eyes
- Whether the 5.4 peephole paragraph is a drafting error or my misreading. If the author meant "the load can be replaced by a copy of the register that was just stored", the paragraph is fine and my "Passages I had to read twice" item 3 should be struck.
- Whether "10" and "11" in model B are derivable from a rule stated elsewhere (Article 2, perhaps) rather than being arbitrary. I treated them as unexplained because they are unexplained *here*.

### What should be done in the future
- If the article is revised, add the full `bump` listing and the peephole repair in 5.4; then re-run this reader test to see whether questions 1 and 2 become answerable from the text alone.
- N/A for code or tests.

### Code review instructions
- Starting files: `answers.md`, `feedback.md`, and this diary, all in the current directory. Cross-check each feedback quote against `article.md` §5.4, §5.5, §5.7, §5.8 and §5.9 before accepting it; the quotes are short and exact on purpose so they can be found by search.
- Validation: no commands to run. The arithmetic in Step 1 above can be re-checked with any calculator.

### Technical details
- Article sections: 5.1–5.13 plus references. Quiz questions: 6, all answered.
- Figures verified: 43,965 × 4 = 175,860; 16,544 × 4 = 66,176; 13,255 × 4 = 53,020; 2.66 ≈ "2.7"; 3.32 ≈ "3.3"; 155/16,544 = 0.94% ≈ "under one percent"; 7 + 34 + 120 = 161; 17/13 = 1.31 ≈ "about 1.3"; 1,008 of 1,009 branch pairs in reach.
- Figures not verifiable from the article: the 41-instruction count for `bump`; "about half of it" in 5.4; 31 leaf functions; deepest stack 8; 228 `&&` blocks; 155 flushes; Experiment 3's 41%/16% split; the 483 ms → 259 ms link step; the 25–30% compressed-encoding claim (cited, not shown).

## Step 2: Answer the six quiz questions

I answered all six questions into `answers.md`, numbered as in the article, with the instruction trace laid out as a table for questions 1 and 2 and the compile-time list shown after each operation as the question requires. Each answer is five to six sentences and ends with a confidence line.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The task requires answers "in my own words", two to six sentences each, with working shown where a calculation or translation is asked for, and a `Confidence: N` line after each.
**Inferred user intent:** To find out whether the article actually teaches the material, by seeing whether an attentive reader who is not a compiler engineer can produce correct answers *from the text*.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and six `Confidence:` lines.
- For question 1, translated `x = y + 1` as a ten-row trace with slot 0 at offset 8 and slot 1 at offset 12, following the `bump` table row for row.
- For question 2, gave the list after each of the four operations and the three emitted instructions (`lw t0, 0(sp)`; `addi t0, t0, 1`; `sw t0, 4(sp)`), with the four-instruction alternative noted.
- For question 6, named the hoisted length load and the missing bounds check, and added loop inversion as a third item noted separately so as not to appear to be padding the required two.

### Why
- I kept the trace tables in the same column order as the article's table (WebAssembly / Emitted RV32 / Purpose), because consistency with the source is the cheapest way for the editor to check my work.
- I answered question 2 with three instructions rather than four because the article's `addi` clause supports folding, and I recorded the alternative in the answer rather than in the feedback only: a reader's confusion should show up in the answer, not just in the critique.

### What worked
- Question 1 and question 2 come out as ten instructions and three instructions respectively, which is a much sharper contrast than the article's own 10-versus-4 for `bump` — the constant case makes the technique look better, which is worth the editor knowing.
- Questions 3, 4 and 6 were answerable straight from the text, so their confidence is 4 or 5.

### What didn't work
- Question 1's middle push is not in the article. I had to choose an instruction for `i32.const 1` (`li t0, 1`) and say that I chose it. There is no way to answer question 1 purely from the text, because the current backend is never shown pushing a constant.
- Question 2's intended count has the same problem in reverse: the general rule for constants is stated once, in prose, about a different expression.

### What I learned
- The article's worked example uses only locals, so the quiz tests a case (a constant operand) that the example never covers. That is a small but real gap between the teaching and the testing.
- Question 5 turned out to be the most demanding, and not because of the model: it asks the reader to articulate the difference between validating a baseline and validating a prediction, which the article states well but does not flag as a distinction worth carrying away.

### What was tricky to build
The trickiest piece was deciding how much to show for question 1. The task says "show working where a question asks for a calculation or a translation", and a translation here means nine or ten instructions with purposes; showing all of them in a table is longer than six sentences, so I let the table carry the working and used the prose for the observations (one arithmetic instruction, the store-load pair, the `li` assumption). The same tension applies to question 2. I judged that a table plus short prose satisfies both the "two to six sentences" and the "show working" requirements, since the sentence limit plainly refers to the prose.

### What warrants a second pair of eyes
- The confidence numbers are self-reports and should be read as such. 4 on question 1 means "I am confident of the count and of the pattern, and I know exactly which instruction I invented." If the editor's answer key says `addi t0, x0, 1`, my answer is still consistent.
- Question 6 says "name two things"; I named two and then a third. If the intended pair was loop inversion plus range-check elimination rather than hoisting plus range-check elimination, my answer still contains both of those.

### What should be done in the future
- If `bump`'s full listing is added to §5.2, question 1's `i32.const` row could be checked against the real backend rather than reconstructed, and question 1 would move from confidence 4 to 5.

### Code review instructions
- Start at `answers.md`. Check answer 1 row by row against the table in §5.2: the pop order (right operand into `t1` first) and the push target (slot 0, offset 8) both follow the article's convention.
- Check answer 2's list notation against §5.5's bullet list: `[local y]`, `[local y, const 1]`, `[register t0]`, `[]`.

### Technical details
- Conventions used: stack slot 0 = lowest operand-stack offset; `i32.add` pops the right operand into `t1` and the left into `t0`, matching §5.2; the sum is pushed back to slot 0, matching §5.2's `sw t0, 12(sp)` after the add.
- Answer counts: Q1 = 10 instructions (1 arithmetic); Q2 = 3 instructions (4 if the constant needs a register); Q6 = hoisting, range-check elimination, plus loop inversion noted separately.
- Confidence values: 4, 4, 5, 5, 4, 4.

## Step 3: Write the feedback report

I wrote `feedback.md` with the six prescribed sections, quoting short exact passages so the editor can find them, and scoring all thirteen numbered sections (plus the unnumbered join subsection of 5.5) from 1 to 5.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Six fixed sections: passages read twice, terms used before explanation, unverifiable claims, per-section scores, unanswerable quiz questions, and one addition plus one cut. The task's framing — "the editor needs to know where the article fails to teach" — sets the tone: specific and useful, not deferential.
**Inferred user intent:** A prioritised list of fixes that a revising author can act on, with enough quotation to locate each problem without re-reading the whole chapter.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with all six required sections, in the order given.
- Quoted five passages under "Passages I had to read twice", each one or two sentences, with the specific confusion stated.
- Listed sixteen terminology bullets, one line each, grouped by whether the term arrives before its explanation or never gets one at all.
- Listed twelve unverifiable claims, each with the missing evidence or step named.
- Scored all thirteen numbered sections plus the join subsection, with a one-sentence reason each.
- Chose the addition (full `bump` listing or a per-statement tally) and the cut (the TCC/Lua/Ertl/Liftoff/Titzer roll call in 5.5, compressed to one sentence).

### Why
- I quoted exact sentences rather than paraphrasing, because a paraphrase of an unclear passage is usually clearer than the original and hides the problem.
- I put the section scores in a table with the score in its own column, so a reader can scan them without reading the reasons. The reasons are the part that matters; the numbers are only an index into them.
- For the cut I chose the passage whose removal loses the least *teaching* while losing the least scholarship, and I said how to keep the scholarship in one sentence. A cut that also loses a citation would not be a fair trade.

### What worked
- Writing the arithmetic checks first made the "claims I could not verify" section sharper: I could say "the byte row is derived from the instruction row and checks out" and then criticise only the prose sentence that reports it in mixed units, instead of dismissing the whole table.
- Distinguishing "unverifiable because the method is missing" from "wrong" kept the report honest. Nothing I checked was arithmetically wrong; the problem was always an absent method or an absent listing.

### What didn't work
- My first pass at "one thing to cut" nominated the reference list, which was wrong: the citations are the article's main claim to authority and cutting them would gut it. I threw that away and re-read 5.5 for a passage that is long *and* redundant, which is the only fair kind of cut.
- I initially scored 5.4 as 3 on the grounds that the peephole idea is clear. Re-reading the contradictory sentence, I lowered it to 2: the section's whole purpose is to tell the reader what a peephole pass can and cannot do, and at the critical sentence it does not.

### What I learned
- The chapter is strongest exactly where it is most concrete — the instruction trace in 5.2, the entry list and table in 5.5, the loop listing in 5.9 — and weakest where it summarises other people's systems. That is a general pattern worth telling the editor: concreteness is doing the teaching, and the historical paragraphs are not.
- The most damaging single defect is probably not the peephole contradiction but the missing 41-instruction listing. `bump`'s 41 → 15 → 5 → 4 is the chapter's spine, and 27 of the 41 instructions are invisible, so the reader cannot audit the spine. I said so in both the "claims" section and the "add" recommendation.

### What was tricky to build
The difficulty was calibrating severity. A student reader tends to report everything as a failure, which is useless to an editor; the task asks for where the article "fails to teach", so I tried to reserve low scores for places where I was actually lost and could name the sentence that lost me, and to give 5s where the article did its job (5.2, 5.5, 5.12). The three sections at 2 or 3 (5.4, 5.7, 5.10, 5.11) are the ones where I could point at a specific broken or missing explanation rather than a general feeling of density.

### What warrants a second pair of eyes
- The 5.4 quotation is the item most likely to be my error rather than the author's; if so, that section's score should go back up and item 3 of "Passages I had to read twice" should be deleted.
- The claim that "two instructions each to save and restore" is ambiguous: if the model charges one `sw` and one `lw` per saved local, the sentence is correct and only terse, and my item 8 in "Claims" is too harsh.
- Whether "typed compiler" is defined in Article 3 and therefore fair to use here. I flagged it as undefined *in this article*, which is what the task asks, but an editor might reasonably decide a chapter may rely on its predecessors' definitions.

### What should be done in the future
- Add the `bump` listing (§5.2) and repair the peephole paragraph (§5.4). Both are small edits with large effects on questions 1 and 4 of the quiz.
- Define `li`/`addi`/`slt` and the `i32` notation once, in 5.1's instruction paragraph, and gloss "PR" inside the Best's-algorithm quotation.
- Report the 110–123 kilobyte figure in the same unit as the 58 KiB figure.

### Code review instructions
- Start at `feedback.md`. Each quotation can be found by searching `article.md` for its distinctive fragment: "operand-stack slots at offsets 12 and 16", "The comparison is computed as a number", "into the store alone", "keep up to 10 locals in registers", "about 110 to 123 kilobytes".
- Check that every section 5.1–5.13 has a score and that the join subsection is scored separately, as noted.

### Technical details
- Section scores: 5.1 = 4, 5.2 = 5, 5.3 = 4, 5.4 = 2, 5.5 = 5, join rule = 5, 5.6 = 4, 5.7 = 3, 5.8 = 4, 5.9 = 4, 5.10 = 3, 5.11 = 3, 5.12 = 5, 5.13 = 4.
- Counts reported: 5 passages read twice; 16 terminology bullets (several covering more than one term, e.g. `li`/`addi`/`slt` and loop-invariant code motion/range-check elimination/loop inversion); 12 unverifiable claims; 6 quiz questions, of which 3, 4 and 6 are fully answerable from the text while 1 and 2 require reconstruction and 5 depends on 5.8's limitation paragraph.
- Nothing in the article was found to be arithmetically wrong. The failures reported are missing methods, missing listings, and missing definitions.

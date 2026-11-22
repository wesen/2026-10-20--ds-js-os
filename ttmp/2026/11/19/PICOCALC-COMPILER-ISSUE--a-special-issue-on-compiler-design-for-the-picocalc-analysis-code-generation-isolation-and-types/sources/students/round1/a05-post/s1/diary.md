# Investigation entry

## Step 1: Reading the article once, uncritically

I read `article.md` end to end without taking notes on the first pass, aiming only to follow the argument from the stack-machine model through the four techniques to the counting model. The goal was to find out where I lost the thread naturally, before analysis made me rationalise the gaps.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Act as a student test-reader: read the article, answer its six quiz questions into `answers.md`, write structured criticism into `feedback.md`, and record the session in `diary.md`.
**Inferred user intent:** Find out where a teaching article fails to teach, before publication, from someone who has not seen the surrounding articles or the compiler.
**Commit (code):** n/a — no code touched, only new markdown files in this directory.

### What I did
- Read `TASK.md`, `diary-format.md`, then `article.md` (~340 lines, sections 5.1–5.13 plus references) in full in one `read` call.
- Kept a running mental list of three things while reading: unfamiliar terms, sentences I had to re-parse, and numbers stated without a table.
- Deliberately did not read `feedback.md`/`answers.md` from any sibling directory, to stay inside this one as instructed.

### Why
- Reading straight through first, rather than answering questions as I hit them, is the only way to judge whether a *later* section retroactively explains an earlier confusion. Several confusions did in fact get resolved this way (the branch-over-jump form is explained in 5.2 but only justified quantitatively in 5.3).
- I treated the article as a reader with no access to Articles 1, 2 or 9, which is what the task implies and is the harsher test.

### What worked
- The article's spine is genuinely easy to follow: 5.1 sets up machine models, 5.3 gives a table whose rows the following sections take "in order of increasing power", and 5.12 maps back onto them. I could reconstruct the outline from memory after one pass.
- The four-instruction table in 5.5 (`local.get b` → `[local b]` → nothing) is the clearest single artifact in the article; I understood the technique immediately from it, before reading any of the historical names.

### What didn't work
- No failures of tooling. The one process mistake: I wrote a placeholder bullet ("This is the same shape as ...") into the first draft of `feedback.md`'s first section and had to remove it with a follow-up `edit`. Exact artifact quoted, in a file the editor will not see.
- My first read of section 5.4 left me thinking the paragraph contradicted itself about store deletion. That is recorded as a genuine "read twice" item rather than suppressed, because the confusion was the article's fault, not mine.

### What I learned
- The article is written for a reader who has the measurements of Article 2 open in another window. Numbers like "there are 228 such blocks in Editor" or "31 of 120 functions are leaves" are asserted as if already established.
- Section 5.11 is structurally unlike the rest: every other claim of measurement gets a table, and 5.11's two percentages get none.

### What was tricky to build
- Nothing was built. The tricky part was epistemic: separating "I cannot answer this" from "I can derive this but the article did not confirm it". Question 1 is the hard case — I could derive the `i32.const` translation from the stated rule, but the article never shows that row, so I had to mark the answer as derived and lower its confidence.

### What warrants a second pair of eyes
- My arithmetic on the counting model: I checked 43,965/16,544 = 2.657 ("2.7 times"), 43,965/13,255 = 3.317 ("3.3 times"), 175,860 − 66,176 = 109,684 ≈ 110 KB and 175,860 − 53,020 = 122,840 ≈ 123 KB, and 17/13 = 1.31 ("a factor of about 1.3"). All consistent. An editor should confirm I have not paired the wrong column, since I only had the table, not the experiment.
- Whether "PR" really means pseudo-register in the Cooper & Torczon quote. I flagged it as never expanded but did not assert the expansion as fact in the feedback, since I cannot check the book from here.

### What should be done in the future
- If the editor wants a stronger test, a second reader who *has* read Articles 1 and 2 should repeat this and compare which confusions survive; my list is probably inflated by missing background that the series assumes.
- The two unverifiable-statistics complaints (228 `&&` blocks, 31 leaf functions) could be resolved by adding source pointers rather than new numbers.

### Code review instructions
- Read `answers.md` first (it shows what the article does and does not let a reader do), then `feedback.md`. No build or test command applies; validation is whether the quoted passages appear verbatim in `article.md`.

### Technical details
- Files written this step: none. Files read: `TASK.md`, `diary-format.md`, `article.md`.
- Article length sections 5.1–5.13; quiz has six questions; the counting table has seven rows and five columns.

## Step 2: Answering the six quiz questions

I worked the two translations by hand on paper first, then wrote them up as tables in the article's own style, and checked each of my numbers against the article before committing to a confidence rating. The intent was to produce answers that show working, not just conclusions, because that is where the article is easiest or hardest to follow.

### Prompt Context
**User prompt (verbatim):** "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show working where a question asks for a calculation or a translation. After each answer add a line `Confidence: N`."
**Assistant interpretation:** Six numbered answers, prose of 2–6 sentences, with tables/working for Q1 and Q2, each followed by a confidence line from 1 to 5.
**Inferred user intent:** Test whether the article's own exercises are fair — answerable from the text alone — and surface any question that is not.
**Commit (code):** n/a.

### What I did
- Q1: built the ten-instruction translation for `x = y + 1` with `y` at 0, `x` at 4, slots at 8 and 12, in a three-column table (WebAssembly / RV32 / count).
- Q2: built the three-instruction version with the compile-time list shown after each operation.
- Q3–Q6: answered in prose, quoting the article's own justification where it exists ("This is a correctness requirement"; "shows that the walk decodes and interprets the code correctly"; "an intermediate representation and data-flow analysis").
- Wrote `answers.md` with the confidence lines.

### Why
- I kept the slot offsets exactly as the question gives them (8 and 12 for the operand stack) rather than reusing 5.2's 12 and 16, because getting that wrong would make the answer look like a copy of the worked example instead of a new one. The instruction count comes out the same as 5.2's `b + c` (ten), which is a useful check.
- I added a note under Q1 admitting the `i32.const` row is my extrapolation. Without that note the answer would look more certain than the text supports.

### What worked
- Q2 is fully supported by 5.5, including the explicit "`a + 1` becomes the single instruction `addi t0, t0, 1`", so I could give it confidence 4 rather than 3.
- Q3, Q4 and Q6 are squarely answerable; Q3 in particular quotes the article's own reason, so confidence 5 is honest.

### What didn't work
- Q1 cannot be confirmed from the article and I marked it confidence 3 with a note. This is the one place where the quiz asks the reader to extend a table that the article did not finish.
- Q5's wording ("what does that leave unproven") tempted me to over-claim; I had to re-read 5.8's limits paragraph to make sure I was citing stated limits (free temporary always available, compressed encodings ignored, counts not generated code) rather than inventing my own.

### What I learned
- The article's numbers that *are* in tables are internally consistent, which raised my trust in the ones that are not — but trust is not verification, so I still listed them in `feedback.md`.
- Quiz design: five of six questions are answerable, one is only derivable. That is a good ratio for a draft.

### What was tricky to build
- Deciding how much "working" to show for Q1 without reproducing 5.2 verbatim. I solved it by keeping the same table shape but pointing out the one structural difference (constant instead of second local), which also became evidence for the feedback.

### What warrants a second pair of eyes
- My claim in Q1 that substituting a constant does not change the current backend's count (still ten instructions). That follows from the per-operation rule, but if the real backend folds `i32.const` into `i32.add` the answer would be eight. The editor can settle this in one glance at the backend.
- My reading of `slt t0, t1, t0` as `i32.gt_s` with swapped operands in Q4's supporting context. It does not affect the answer, but it is an inference.

### What should be done in the future
- Add the `i32.const` row to 5.2's table; it would make Q1 fully answerable and cost one table row.

### Code review instructions
- Check `answers.md` Q1/Q2 tables against `article.md` 5.2 and 5.5 for offset and instruction-count agreement.
- No commands to run.

### Technical details
- Q1 answer: 10 instructions (2 push `y`, 2 push const, 4 add, 2 store to `x`).
- Q2 answer: 3 instructions (`lw t0, 0(sp)`; `addi t0, t0, 1`; `sw t0, 4(sp)`).
- Confidence ratings: Q1 3, Q2 4, Q3 5, Q4 5, Q5 4, Q6 5.

## Step 3: Writing the criticism

I turned the reading notes into `feedback.md` in the six required sections, and for each candidate complaint checked that I had a verbatim quote and could name specifically what was missing. The aim was to be useful to an editor rather than thorough: a vague "some terms unclear" line would be worthless, so every item names a term, a quote or a number.

### Prompt Context
**User prompt (verbatim):** "Write `feedback.md` with these sections: **Passages I had to read twice** ... **Terms used before they were explained, or never explained** ... **Claims I could not verify from the article itself** ... **Section scores** ... **Questions that the article did not let me answer** ... **One thing to add and one thing to cut**."
**Assistant interpretation:** Six headed sections, quotes verbatim, one line per term, per-section score 1–5 with one sentence of reason.
**Inferred user intent:** A triage list an editor can act on: which paragraphs to rewrite, which terms to define, which numbers need a source, and one concrete addition and deletion.
**Commit (code):** n/a.

### What I did
- Five "read twice" passages, each quoted, each with a diagnosis (missing operand loads in the `if` snippet; unreproducible "41 instructions"; "the world's turn"; a forward reference to the counting model from 5.5; the store-delete sentence in 5.4).
- Twelve term entries, splitting genuinely undefined (`PR`, `trap`, `SSA`, "lowering", QuickJS, Amdahl) from under-glossed (the RV32 mnemonics, `1f`).
- Nine unverifiable claims, all quoted, each with what evidence is missing — plus two entries (#8, #9) explicitly marked as *not* complaints, to keep the list honest.
- Section scores 5.1–5.13, with 5.11 lowest at 2.
- Answerability audit of the six quiz questions, concluding Q1 is derivable-but-unconfirmed and the rest are supported.
- One addition (full `bump` instruction count) and one cut (second half of 5.11, or failing that the byte-array anecdote).

### Why
- I chose the `bump` count as the addition because the article's method *is* counting and its headline function is only half accounted for; this is the single change with the most teaching value per line.
- I chose 5.11 as the cut target because it is the only section whose evidence is prose-only, so cutting there both removes redundancy and points at the real defect. I gave a second, narrower cut in case the editor prefers to move rather than delete.
- I flagged my own arithmetic checks in the 5.8 score sentence so the editor knows which numbers I actually verified rather than skimmed.

### What worked
- The section-scoring forced a concrete judgement: 5.11 at 2 versus 5.1 and 5.12 at 5 made clear that the article's weakness is concentrated in one section, not spread evenly. Without the scoring step I would have written a bland "some numbers lack sources".
- Cross-checking the 5.8 ratios (2.7x, 3.3x, 110–123 KB, 1.3x) all came out right, which let me say something positive and specific instead of only complaining.

### What didn't work
- My first draft of the "read twice" section began with a stray placeholder line (a non-quote formatted as a quote). I caught it on re-reading the file and removed it with `edit`. If the editor had opened the draft, one section would have started with a fragment of my own note.
- I could not resolve "the world's turn" with certainty; I guessed the event-loop reading and said so. That guess is the weakest item in the whole file.

### What I learned
- Most of the article's weak spots are the same weak spot: a precise number with no table behind it (31 leaf functions, 228 `&&` blocks, stack depth 8, 41%, 483→259 ms, 2–3 s compile time). Grouping them as a pattern is more persuasive than listing them one by one, so I said so explicitly in the 5.7 and 5.11 score reasons.
- The article defines its own jargon inconsistently: `frame`, `slot`, `flush`, `leaf function`, `peephole optimizer` are all explained well; `PR`, `trap`, `SSA`, `lowering` are not. That contrast is worth mentioning to the editor because it shows the fix is cheap.

### What was tricky to build
- Keeping the "Claims I could not verify" section from becoming a list of everything cited. I resolved it by restricting entries to numbers *about this project* that a reader might want to check, and by explicitly marking the two external-citation items as non-complaints. A feedback file that complains about the bibliography would be ignored.

### What warrants a second pair of eyes
- My score of 3 for 5.9. I complained that the loop snippet does not show where `t1` and `a0`/`a1` come from, but the prose does state the three missing optimisations plainly, so a kinder reader might give it 4. This is the score I am least sure of, and the one whose adjustment would change least.
- My claim that the `if` snippet "omits two missing loads" — worth an editor's confirmation against the real backend output, since if the backend really emits that exact five-line sequence then something else explains the operand order.

### What should be done in the future
- Add source pointers (article/section or experiment id) beside each project statistic; this would resolve five of the nine unverifiable claims without new experiments.
- Add a one-row `i32.const` entry to 5.2's table and extend the `bump` count to all 41 instructions. Both are small edits with direct payoff for the quiz.

### Code review instructions
- Start at `feedback.md` "Section scores" to see the shape of the criticism, then read the two detailed sections it summarises.
- Validation is textual: every blockquote in `feedback.md` should be findable in `article.md`. I have kept them verbatim including the article's own typos where present (e.g. `slt  t0, t1, t0` with its double space).

### Technical details
- Files created: `answers.md`, `feedback.md`, `diary.md`.
- Score distribution over 5.1–5.13: two 5s (5.1, 5.12), five 4s (5.3, 5.5, 5.6, 5.8, 5.13), five 3s (5.2, 5.4, 5.7, 5.9, 5.10), one 2 (5.11). No section scored 1.
- Untouched: `article.md`, `TASK.md`, `diary-format.md`, and everything outside this directory.

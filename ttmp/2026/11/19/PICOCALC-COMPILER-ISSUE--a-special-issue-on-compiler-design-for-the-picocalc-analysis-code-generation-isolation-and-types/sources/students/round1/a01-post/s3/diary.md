# Investigation entry

## Step 1: Reading Article 1 end to end

I read `article.md` once straight through without taking notes, then reread the two tables in 1.1 and 1.5 because those numbers are the ones the quiz leans on. The article is short enough to hold in mind, so the main work was noticing which numbers were definitions (turn budget, 768 KiB limit) and which were measurements I had no way to check.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." — the task file itself says: read `article.md` from start to finish; answer its "Check your understanding" questions to `answers.md`; write `feedback.md` with a fixed set of sections; write `diary.md` in the format of `diary-format.md`.
**Assistant interpretation:** Act as a student reader of a pre-publication teaching article: read it, take its quiz honestly, and report where it fails to teach.
**Inferred user intent:** The editor wants a real reader's friction report — not praise — so that gaps in definitions, missing evidence and unanswerable quiz items can be fixed before publication.
**Commit (code):** N/A — this session writes only documents.

### What I did
- Read `TASK.md` (the instructions), `diary-format.md` (this format), and `article.md` (Article 1, sections 1.1–1.7) in full.
- Located the six quiz questions in section 1.7 and the evidence for each in 1.1, 1.2, 1.3, 1.4 and 1.5.
- Cross-checked the arithmetic in the tables myself: 290.6 ÷ 52.9 ≈ 5.49 ("5.5 times faster per turn"), 240,452 ÷ 88,255 ≈ 2.72 ("nearly three times larger"), 768 − 710 = 58 ("58 KiB free"), 710 ÷ 528 ≈ 1.34 for the memory ratio.
- Noted which claims had no supporting step in the text (laptop slowdown range, 2–6× WAMR figure, self-hosting CJI, 77 bytes → 103 instructions, firmware size).

### Why
- Answering the quiz before the critique keeps the two documents independent: answers are what a reader could produce, feedback is why some answers were weak.
- I checked the table ratios because several quiz answers depend on them and a wrong ratio would have shown up as my own error rather than the article's.

### What worked
- The dependency-ordered definitions in 1.2 (world → claims → nucleus → turn → engine → compositor → reactor) meant I did not have to guess at any vocabulary in 1.3–1.5.
- The single running example `countUnit` in 1.4 made Question 3 answerable directly from the text.
- The mermaid flowcharts (nucleus message path; the two pipelines) matched the prose, so the two readings of each did not contradict each other.

### What didn't work
- No tooling here for arithmetic or building anything; I did the ratios by hand and could not run a compiler to check the "77 bytes" / "103 instructions" claim. No failures beyond that.

### What I learned
- The article's weakest spot is not the compiler comparison (1.3–1.4 are excellent) but the runtime costs in 1.5, where two different kinds of size (code bytes and reserved RAM) sit in adjacent rows.
- "Compiled size" and "memory used" are not interchangeable, and the "nearly three times larger" sentence silently refers to the first while the nearby 58 KiB figure refers to the second.

### What was tricky to build
- Confidentiality of my own reading: for Question 4 I had to separate what the article explains (lowering expands Wasm into more instructions) from what I supplied from general knowledge (no interpreter overhead, inlined checks). Keeping that boundary explicit is why the answer carries `Confidence: 2` and a sentence saying which part is my guess.

### What warrants a second pair of eyes
- Whether Question 4 is intentionally testing synthesis or is simply mis-posed: it quotes the memory figures (710 vs 528 KiB) but the article's only size explanation concerns code bytes (240,452 vs 88,255).
- Whether "anything touched with the cache disabled must fit here" is a real constraint the author wants readers to internalise, since the term "cache" is never introduced.

### What should be done in the future
- Once Article 3, 5 and 7 are readable, revisit Claim list in `feedback.md` to confirm the deferred explanations actually arrive.

### Code review instructions
- Start with `answers.md` (six numbered answers, each ending in `Confidence: N`), then `feedback.md` (six required sections), then this diary.
- Validation: `answers.md` should have exactly six numbered sections matching 1.7; `feedback.md` should contain all six required headings verbatim from `TASK.md`.

### Technical details
- Files read: `TASK.md`, `diary-format.md`, `article.md`. Files written: `answers.md`, `feedback.md`, `diary.md`.
- No code executed; all arithmetic done mentally and stated in the answer text.

## Step 2: Answering the quiz

I wrote `answers.md` with six answers in my own words, two to six sentences each, showing the ratios for Question 4 where a calculation was implied. Each answer ends with `Confidence: N`, and I gave 2 where I was reconstructing the author's reasoning (Question 4) and 4 where the article supports the answer but not quite in the words I used (Questions 2, 5, 6).

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the deliverable described in step 2 of `TASK.md`: numbered answers, own words, `Confidence: N` line after each.
**Inferred user intent:** See which questions a careful reader can answer from the text alone, and where the article leaves the reader guessing.
**Commit (code):** N/A.

### What I did
- Drafted each answer from the section it belongs to (Q1 → 1.2, Q2 → 1.2, Q3 → 1.4, Q4 → 1.5, Q5 → 1.2, Q6 → 1.3).
- Added a parenthetical note after Answer 2 flagging that "other worlds continue" is my inference for interpreter faults, not stated text.
- Shaded confidence down on Q4 to 2 and said in the answer which half is mine.

### Why
- The task asks for honesty about where the article fails, so an over-confident Q4 would have hidden the defect I later report in the feedback.

### What worked
- Q1, Q3 and Q5 fell out of the text almost immediately; confidence 4–5 with no hedging needed.

### What didn't work
- Q4: the question asks for a *reason* but the article supplies only a size *example* (77 bytes → 103 instructions) and no explanation of the memory overhead. I could give the example, not the reason. Recovery: answer with the example, mark the rest as inference, confidence 2, and report the gap in `feedback.md`.
- Q6: answerable only because I already knew what bytecode is; the article uses the term undefined.

### What I learned
- A question can be answerable and still be unfair: Q4 needs facts the section does not give, which is a different failure from a question I simply could not answer at all.

### What was tricky to build
- Keeping two to six sentences while showing working. For Q4 the working (two ratios) plus the hedge plus the caveat barely fits, and I let it run to four sentences.

### What warrants a second pair of eyes
- My Answer 2 hedges on "damage other worlds"; if the author considers the isolation column sufficient, that hedge is unnecessary caution rather than a defect.

### What should be done in the future
- If 1.5 gains a memory breakdown, Q4's answer should be rewritten upward to confidence 4–5.

### Code review instructions
- Read `answers.md`; check each section number against 1.7 and each `Confidence:` value against the hedging in the answer text.

### Technical details
- Confidence values: Q1 5, Q2 4, Q3 5, Q4 2, Q5 4, Q6 4.
- Only computation performed: 240,452 ÷ 88,255 ≈ 2.72; 710 ÷ 528 ≈ 1.34; 290.6 ÷ 52.9 ≈ 5.49; 768 − 710 = 58.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, quoting short passages for the "read twice" and "could not verify" sections rather than paraphrasing them, and scoring each of the seven numbered sections 1.1–1.7. The hardest part was keeping the "claims I could not verify" list about the article's own evidence and not about my general ignorance of embedded systems — several things I doubted (RISC-V, PSRAM) are just background knowledge the article assumes, which I recorded under terms rather than under claims.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with exactly the section headings listed in step 3 of `TASK.md`.
**Inferred user intent:** Give the editor an actionable list: unclear passages, undefined terms, unsupported claims, per-section grades, unanswerable quiz items, and one addition plus one cut.
**Commit (code):** N/A.

### What I did
- Collected quotes while reading and answering, then sorted them into the required sections; six "read twice" quotes, twelve term lines, ten unverifiable claims, seven section scores, three problematic quiz questions, one add and one cut.
- Scored 1.1 = 4, 1.2 = 4, 1.3 = 5, 1.4 = 5, 1.5 = 3, 1.6 = 3, 1.7 = 4.
- Chose as the "add" a breakdown of the native Editor's 710 KiB and the reason lowered code is bigger; chose as the "cut" the 1.6 key-points list, which restates the body almost verbatim.

### Why
- Quoting exact text makes each complaint checkable by the editor instead of a matter of taste.
- I graded 1.5 lowest because that is where my own answer was weakest, so section scores and confidence ratings agree.

### What worked
- The "claim vs measurement" split was productive: three numbers in the article are internally consistent and checkable (5.5×, 2.7×, 58 KiB) while others (60–170×, 2–6×, self-hosting CJI) have no working shown, which is a useful distinction for the editor.

### What didn't work
- No failures. One limitation: I could not check whether later articles deliver the deferred explanations, so the "cannot verify" list may be partly answered by Articles 3, 5 and 7 — I said so explicitly in the diary rather than in the feedback, since the feedback must judge this article on its own.

### What I learned
- The most common defect in this draft is not error but *deferral*: "Article 3 explains why", "Article 5 examines those 103 instructions one by one". That is fine for a series but it means this article asserts its central causal claim rather than showing it.

### What was tricky to build
- Section 1.6 as a scored section: it is a summary, so grading it for "clarity" is odd, and I had to state in one sentence why a restatement earns a 3.

### What warrants a second pair of eyes
- Whether the "cut" should really be the key points (some readers rely on them) rather than the second paragraph of 1.1, which repeats the isolation point already made in the table.
- Whether my term list is too harsh: "bytecode", "ELF" and "WebAssembly" may be deliberate assumed knowledge for this issue's audience, in which case they belong in a one-line glossary rather than a definition in the body.

### What should be done in the future
- A one-paragraph glossary of the eight assumed terms would clear most of the term list cheaply.

### Code review instructions
- Check `feedback.md` heading-by-heading against the six bullets in `TASK.md` step 3; confirm every quoted passage appears verbatim in `article.md`.

### Technical details
- Section scores: 1.1 = 4, 1.2 = 4, 1.3 = 5, 1.4 = 5, 1.5 = 3, 1.6 = 3, 1.7 = 4.
- Quiz questions flagged as problematic: 4 (missing size/memory explanation), 6 (bytecode undefined), 2 (containment only implied).

## Step 1: Answering the quiz blind and recording what could not be answered

I read `TASK.md`, then `quiz.md` and `diary-format.md`. There is no article in the directory — `article.md` does not exist — and the task explicitly says the article was not given and that I must not use the web, so every answer in `answers.md` comes from the question text itself plus what the vocabulary of JS-based operating systems implies. I wrote six numbered answers of two to five sentences each, with a `Confidence: N` line under each, and said plainly on the questions whose answers are facts about the article that I cannot know them without the article, followed by what the answer would have to look like.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered instructions in `TASK.md`: read the quiz, answer it blind into `answers.md` with confidence ratings, write `diary.md` in the diary-format, and end the reply with a single line `DONE`.
**Inferred user intent:** Testing whether a reader with only the questions — no article — can be honest about the boundary between what is inferable and what is article-private. The confidence numbers are the data the editor presumably wants: where questions leak their own answers through their wording.
**Commit (code):** N/A — no git commit made.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`; confirmed `article.md` is absent (read returned ENOENT).
- Wrote `answers.md` with answers 1–6 and a `Confidence:` line after each.
- Wrote this `diary.md` following the template in `diary-format.md`.

### Why
- Answers were kept to the 2–5 sentence range requested, and each written to stand alone rather than pointing at the article.
- Confidence was set low (2) wherever the answer names article-specific proper nouns or measurements, and higher (3–4) only where the reasoning is forced by the question's own internal logic.

### What worked
- Q1 (why not run to completion): the number "768 KiB limit" in Q4 and the word "world" together force the answer — cooperative yielding to a scheduler, message-driven resumption. Confidence 4.
- Q5 (application to LCD): the question says "in terms of worlds and messages", which fixes the shape of the answer even without the article. Confidence 3.
- Q6 (37 ms vs 523–1,475 s): the ratio is so extreme that the only sane reading is bytecode-with-no-analysis versus whole-program native code generation with inference; the question's phrasing "what is different about what the two compilers *produce*" points at output artifacts rather than optimisation passes. Confidence 3.

### What didn't work
- Q2 required naming three engines. Only QuickJS (Q6), WebAssembly (Q4) and CJI (Q3, Q6) are named anywhere in the quiz, so the "three engines" almost certainly *are* those three — but I could not confirm that the article's three are exactly this set, or that its isolation claims match my mapping. Marked Confidence 2 rather than presenting the guess as fact.
- Q3 required naming two things `countUnit`'s text omits. I can reason out plausible ones (representation of the argument; type/effect of the operations inside; the calling convention from call sites) but cannot know which two the article picks. Confidence 2.
- Q4 required the article's own reason for 710 KiB vs 528 KiB. My answer (native duplicates runtime/driver glue that wasm imports) is a good guess, not a retrieved fact. Confidence 2.

### What I learned
- The quiz leaks more than expected: Q1's premise, Q5's requested vocabulary, and Q6's ratio each encode the conclusion inside the question. Q2, Q3 and Q4 are the genuinely article-dependent ones, because they ask for names and for a stated reason.
- That the figures 710/528 KiB sit under a 768 KiB ceiling tells me the memory number is a per-world quota, not total device RAM — the Editor nearly filling it is the point of the comparison.

### What was tricky to build
- The honesty requirement. It is tempting to write a confident-sounding answer to Q2 or Q4 and let it read as knowledge. The task's phrasing ("say 'I cannot know this without the article' and *then* give your best reasoning") wanted both halves in the same answer, so each such answer opens with the disclaimer and continues with reasoning rather than stopping at the disclaimer. Ordering mattered: disclaimer first, so the confidence rating cannot be read as a claim about the article's content.

### What warrants a second pair of eyes
- The confidence ratings on Q2, Q4 and Q6. If the article's actual answer to Q2 is a different trio of engines, my Confidence 2 is still too high; a reviewer should check whether "2" is being read as "probably right" when it should read as "the guess could be wrong in its nouns while right in its shape".
- Whether my Q3 answer accidentally states as fact a detail (a `unit` with fields, a counter that may wrap) that contradicts the article's definitions.

### What should be done in the future
- Run the same quiz against a reader who *has* the article and diff the two sets of confidence numbers; the gap is the measure of how much the questions give away.
- If this directory is meant to be reusable, note in `TASK.md` that the article is deliberately absent, so a later reader does not spend time looking for it, as I briefly did.

### Code review instructions
- Read `answers.md` and check each `Confidence:` line against that answer's hedge words; the two should agree.
- Verify `answers.md` has exactly six numbered answers and six confidence lines, and that `diary.md` follows every heading in `diary-format.md`.

### Technical details
- Files created: `answers.md` (six answers, six confidence lines); `diary.md` (this entry).
- Absence confirmed: `article.md` → ENOENT in the working directory.
- Confidence distribution: Q1 = 4, Q2 = 2, Q3 = 2, Q4 = 2, Q5 = 3, Q6 = 3. Mean 2.67.
- No commands run beyond file reads and writes; nothing outside the current directory was touched and no network access was used.

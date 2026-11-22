# Investigation entry: student read of "Why Whole-Program Inference Costs Minutes"

## Step 1: Reading the article and the task

I read `TASK.md` first to fix the order of work, then `diary-format.md` so the diary shape was known before I started, and then `article.md` end to end in one pass without taking notes. Only after that did I go back over sections 3.1–3.5 line by line, because the first pass told me where the numbers live and the second pass is where the doubts appeared. Reading twice was necessary: the article's argument is cumulative (unknowns → iteration → widening → the integer proof → specialization → measurements), and the measurement table in 3.5 only makes sense once you know what the range analysis is.

### Prompt Context
**User prompt (verbatim):** "You are a student reader helping an editor test a teaching article before it is published. Work only inside this directory. Do not search the web. Be honest: the editor needs to know where the article fails to teach." Followed by the numbered list: read `article.md`; answer the "Check your understanding" questions into `answers.md` (2–6 sentences each, own words, show working, `Confidence: N` line after each); write `feedback.md` with the six named sections; write `diary.md` in the format of `diary-format.md` with one step for reading, one for the quiz and one for the feedback; finish by replying with one line: DONE.
**Assistant interpretation:** Act as a test reader, not an editor: produce the three files in this directory, record honest comprehension failures, and do not rewrite or fix the article.
**Inferred user intent:** The editor wants a signal about where the draft stops teaching — specifically unidentified terms, unverifiable numbers and unanswerable quiz questions — before publication, and wants that signal in a fixed format so several student readers can be compared.
**Commit (code):** N/A — no repository work in this session.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (complete, 8 sections plus references).
- Second pass over 3.1–3.5 with the tables checked arithmetically.

### Why
- The task fixes the order, and the diary format fixes the structure, so reading them first avoided rework.
- A second pass was needed because the first pass produced an impression ("clear exposition, suspicious numbers") that had to be turned into named passages.

### What worked
- One pass sufficed to follow the core argument: `scale`/`area`/`half`, the `i` loop table, and the round counts (12 + 58 + 1 + 4 + 3 + 1 = 79, which does check out).

### What didn't work
- First-pass reading of the section 3.5 table failed outright: I could not tell what "1,475 s → 544 s" measures. Re-reading did not resolve it, only located it. Recovery: recorded as a "read twice" item rather than guessing.

### What I learned
- The article depends on Article 1 for "turn", "world", "the device" and "the typed compiler", then never uses the first two — so the stated dependency is partly decorative.

### What was tricky to build
- Deciding whether a number was *wrong* or merely *underspecified*. My rule: if I could check the arithmetic, check it (79 helpers: fine; 63% from 1,475 and 544: only works under one reading), and otherwise report it as unverifiable rather than as an error.

### What warrants a second pair of eyes
- Whether "+ set of standard values" in the widening description refers to a documented list elsewhere in the series; if it does, my complaint may be a cross-article reference problem rather than a gap.

### What should be done in the future
- N/A — reader role only.

### Code review instructions
- Files: `answers.md`, `feedback.md`, `diary.md` in this directory. No commands to run; validation is reading against `article.md` section numbers.

### Technical details
- Article sections: 3.1 types as unknowns, 3.2 iteration/widening/join, 3.3 integer proof, 3.4 specialization rounds, 3.5 measurements, 3.6 prior art, 3.7 key points, 3.8 quiz.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, one numbered section each, in my own words, with the working shown where the question asks for a trace or a translation. Where the article asked for a calculation I did the arithmetic rather than quoting a figure: the `i` trace ([0,0], [0,1], [0,2]) and the joins-per-visit reasoning for widening. Each answer ends with a `Confidence: N` line.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Enumerate `answers.md` 1–6, satisfying the length and confidence-line requirements.
**Inferred user intent:** The editor wants to see whether a careful reader can answer from the text alone, and where confidence drops to reveal under-taught points.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers, each 4–6 sentences plus `Confidence: N`.

### Why
- Four of the six answers are "find the sentence and restate it"; two (questions 2 and 3) require reconstructing an argument, so those got the most sentences.

### What worked
- Questions 1, 2, 4 and 6 were answerable directly and I gave confidence 5 for each.
- Question 3's two reasons are both spelled out in 3.3's bullet list, so confidence 5 there was also fair.

### What didn't work
- Question 5 could not be answered from the row it points at. I answered from the "replacing the range proof by local rules" row and marked `Confidence: 4`, because "what is that cost attributed to" is answered by the article's assertion rather than by a shown measurement. I did not invent a reading of "1,475 s → 544 s".

### What I learned
- My confidence tracked a single variable: whether the article gave a number I could re-derive myself. Where it did (79 helpers, the `[0, k]` trace), confidence was high; where it only asserted (88.0%, "is the 25 minutes"), it dropped.

### What was tricky to build
- Question 2 asks "what it costs" as well as "what widening does". The article answers this with the two words "less precise". Writing a longer answer would have meant inventing an example the article does not give, so I answered in general terms and recorded the gap in `feedback.md` instead.

### What warrants a second pair of eyes
- My answer to question 6 depends on the reader connecting 3.5's QuickJS row to 3.6's "which is QuickJS". A reader who read only 3.5 might legitimately name a different component; worth confirming that the intended answer is QuickJS.

### What should be done in the future
- N/A.

### Code review instructions
- Compare each answer against the section named in its question; check that no answer cites a fact the article does not contain.

### Technical details
- Confidence values: 5, 5, 5, 5, 4, 5.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, ordered as the task lists them. For every criticism I quoted the text and named what was missing, because an editor cannot act on "this was confusing" but can act on "this row does not say which quantity the 1,475 s refers to". The section scores were the hardest part: most sections are genuinely well written, and low scores had to be justified by specific defects rather than by difficulty of subject matter.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with the six named sections, quoting where required.
**Inferred user intent:** Actionable, honest, quotable criticism keyed to locations in the draft.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md`: 5 "read twice" passages, 10 undefined-term lines, 8 unverifiable claims, 8 section scores, 3 partly-unanswerable quiz questions, and one add / one cut.
- Checked the arithmetic before calling anything a problem: the 63% claim (931/1475 = 63.1%) and the 79 helpers were verified; the 1,475 s versus 1,480 s relation was not resolvable and was reported as ambiguity rather than error.

### Why
- Reporting a number as "wrong" without being able to recompute it would have been dishonest, and the task explicitly asks for evidence or steps that are missing.
- I scored sections on whether they taught, not on whether the underlying subject is easy: 3.6 (prior art) got 5 because its lesson is unmistakable, while 3.5 (measurements) got 3 despite being the article's evidential core.

### What worked
- The "claims I could not verify" list is the most solid part: each item names a missing quantity (joins per second; the value of `max`; the denominator for "almost two thirds"; whether 1.2% is of total time or of GC time).

### What didn't work
- My first draft of the "section scores" section scored 3.3 at 4 on the grounds that its three bullet conditions are clear. On re-reading, the `at` typo and the wrap-around / ±2⁵³ conflation mean the section's *reasoning* is unclear even though its *list of conditions* is clear, so I lowered it to 3. Recovered by re-reading the paragraph, not by changing the criterion.

### What I learned
- The article's weakest points are not conceptual but numeric: every place it says "this is the cost" without a denominator is where a reader's trust drops.

### What was tricky to build
- Separating "term never explained" from "claim never evidenced". The same sentence often does both (e.g. "safety guard" in the 3.5 table is both an undefined term and an unevidenced change), so I listed it twice rather than merging, to keep both lists usable.

### What warrants a second pair of eyes
- Whether my proposed cut (the Self pause statistics) is really expendable, or whether the editor needs those pause numbers to motivate the two-compiler design that the article's next instalment depends on.

### What should be done in the future
- If the widening thresholds and the "standard values" set are documented in a companion article, add a cross-reference in 3.2 instead of listing them here.

### Code review instructions
- Read `feedback.md` alongside `article.md` 3.3 and 3.5, which are where the score of 3 and most of the unverifiable claims come from.

### Technical details
- Scores: 3.1 → 4, 3.2 → 4, 3.3 → 3, 3.4 → 5, 3.5 → 3, 3.6 → 5, 3.7 → 4, 3.8 → 4.

## Step 1: Read the article start to finish

I read `TASK.md` first to fix the four deliverables, then read `article.md` in one pass from §9.1 to the reference list, taking notes on each section's observation, mechanism and cost. The article is a survey of seven type-system additions to an embedded typed language, each argued against a three-part admission criterion, so my reading job was to hold the criterion in mind and ask of each section whether the mechanism and the cost actually follow.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Produce the three student-reader artefacts (answers, feedback, diary) for the article in this directory, working only inside it.
**Inferred user intent:** The editor wants an honest first-read report: which parts teach, which parts fail to teach, and where the prose assumes prior articles.
**Commit (code):** N/A — no code in this repository; deliverables are markdown.

### What I did
- Read `TASK.md` and `diary-format.md`.
- Read `article.md` in full, once, without looking ahead to the quiz.
- Recorded per-section notes: the observation, whether the mechanism was shown in code, and whether the stated cost was checkable.

### Why
- Reading the quiz first would have biased which sections I considered clear; the task asks which parts of the *article* failed to teach, not which parts the quiz happened to probe.

### What worked
- The repeated structure (Observation / Mechanism / Cost) plus the §9.10 summary table made it possible to reconstruct each section from one line of the table.
- The `FindPhase` match example (§9.2), the `Unit`/`Point` pair (§9.3) and the `at < text.length` loop (§9.4) gave me three examples concrete enough to reason about.
- The string example `a🙂b` = 6 bytes / 4 code units / 3 code points checked out by hand, so I had one verified data point to calibrate the rest of the numbers against.

### What didn't work
- I could not resolve two figures in §9.4: "seven instructions without the check and would have nine or ten with it" versus "each removed check saves about four instructions". No listing is given, so I recorded the contradiction rather than guessing a reconciliation.
- Several observations (§9.2's key handler returning 14 and 15, the "404 trap instructions", the "28 reactor functions") have no file or line reference and depend on articles not present in this directory. I could not check them and said so in `feedback.md`.

### What I learned
- The article is a sequel: §9.1 admits this ("depends on Article 4 ... Article 7 ... Article 8"), and a large share of my confusion came from terms the earlier articles evidently define — world, reactor, manifest, fuel counter.
- "Costs nothing at run time" is the organising idea; it is what makes enumerations, distinct types, effects and linear types comparable to a bounds-check removal that *saves* run time.

### What was tricky to build
- Keeping two questions apart: "do I understand this mechanism?" versus "does the article justify this mechanism?" For §9.4 I understood the mechanism well while distrusting the numbers, and I had to record both.

### What warrants a second pair of eyes
- The §9.4 instruction counts, and whether the unsigned index type of §9.4 is meant to be an instance of the distinct types of §9.3 or a separate feature (it appears in §9.4's prose but not in the §9.10 summary table).
- Whether "the existing check uses one unsigned comparison" is true of the actual generated code; the article asserts it without a listing.

### What should be done in the future
- N/A for this step; follow-ups are in the later steps and in `feedback.md`.

### Code review instructions
- Files: `article.md` §9.4 (both instruction counts), §9.5 ("nucleus"), §9.10 (missing unsigned index type from the table).

### Technical details
- Sections read: 9.1–9.12 plus references (23 entries).
- Constraint observed: no web access, no files outside this directory, no sibling student directories consulted.

## Step 2: Answer the quiz

I answered all six questions in §9.12 into `answers.md`, two to six sentences each, numbering matching the questions and adding a `Confidence` line. For questions that asked for reasoning rather than recall (Q3, Q4, Q6) I wrote out the working: the loop with the fact marked, the unsigned-comparison argument, and the two-branch obligation.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer from the article's text only, in my own words, showing working, and mark confidence honestly rather than inflating it.
**Inferred user intent:** The confidence ratings should expose which answers the text supported and which it left the reader to invent.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and six `Confidence: N` lines (values: 5, 5, 4, 4, 5, 4).
- Included a short code block in answer 3 to show where the fact is recorded and where it dies.

### Why
- Q1, Q2, Q5 are near-quotations of the article's own claims, so 5 was easy to justify.
- Q3, Q4, Q6 needed inference beyond the text, so I marked them 4 and named the missing step in `feedback.md` instead of raising the score.

### What worked
- Q2's arithmetic (`Unit`/`Point` costing nothing because the representation is unchanged) and Q5's two rules are stated in single sentences in the article, so my answers could stay short and exact.
- Writing the loop out for Q3 made the invalidation point obvious: the fact dies at `at = at + 1`, which the article implies but does not say.

### What didn't work
- Q4 is only half-answerable: the article says a signed guard cannot cover `at >= 0` and that an unsigned index type fixes it, but never shows how such a type is declared or how its arithmetic interacts with `i32`. My answer leans on §9.3's distinct types to fill the gap, and I flagged that in `feedback.md`.
- Q3's "where it becomes invalid" has no operational definition of "a call that could change the length"; I answered using the article's wording verbatim and kept confidence at 4.

### What I learned
- The article's mechanism sections are stronger than its cost sections: I could explain every mechanism, but I could not verify any number except the `a🙂b` example.

### What was tricky to build
- Answering a "why is that valuable" question (Q1) without recycling the article's adjective "cheapest"; I had to separate the error-prevention value (the compiler enumerates the sites to fix) from the cost value (no generated-code change).

### What warrants a second pair of eyes
- Whether my Q6 answer is too strong: I claimed the `else` branch must also consume the grant, which follows from "on every path", but the article's only example is an `if` whose branches both consume. If a branch is statically dead or throws, the rule may need qualification the article does not give.

### What should be done in the future
- If the article is revised, add a worked two-branch linear-type example, which would let Q6 be marked objectively.

### Code review instructions
- File: `answers.md`; cross-check each answer against the section named in `feedback.md`'s score list.

### Technical details
- Answers given: 6 of 6; confidence distribution 5,5,4,4,5,4; one answer contains a code block, two contain arithmetic or derived reasoning.

## Step 3: Write the feedback

I wrote `feedback.md` with the six required sections, choosing quotes that were short enough to be recognisable and specific about what stalled me. I kept the section scores separate from the "could not verify" list so the editor can see that a section can be clearly written and still rest on unchecked numbers — §9.2 scores 5 while three of its observations are unverifiable.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Report where the article fails to teach, with quotes and named missing evidence, and finish with one concrete addition and one concrete cut.
**Inferred user intent:** Actionable revision notes rather than praise; the editor asked specifically to be told where it fails.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: Passages I had to read twice (6 quotes), Terms used before explained or never explained (15 lines), Claims I could not verify (9), Section scores (12), Unanswerable quiz questions (Q4 partly, Q3 gap, Q6 thin), Add/Cut.
- Kept one positive note, the `a🙂b` example, because it was the only arithmetic I could check and it changed how I judged the rest.

### Why
- I scored §9.8 at 2 despite it being reference-rich: it has no example, and the Hume quotation is used in place of an explanation.
- I scored §9.4 at 3 rather than lower because its one-sentence guard rule is genuinely clear; the score reflects the contradiction and the dense lower-bound paragraph, not the whole section.
- For Add I chose the §9.4 listing because it fixes a real contradiction and supports the article's strongest claim. For Cut I chose §9.8 because it is the only section I could remove without losing a mechanism the reader needs.

### What worked
- The inconsistency in §9.4 stood out only because I had to compare two sentences in the same section while scoring it; putting the scores and the unverified claims side by side surfaced it.
- Quoting the exact sentence for each "read twice" item forced me to distinguish "unclear prose" from "missing background article", which are different fixes for the editor.

### What didn't work
- I could not verify the observation counts (404 traps, 85 `charCodeAt` calls, 28 reactor functions) because the repository sources they refer to are not in this directory, so those entries say "no file or line reference" rather than "wrong".
- I have no way to judge the effort estimates ("a few dozen lines", "medium to large"); I listed them as unverifiable rather than scoring them as errors.

### What I learned
- The article's weakest pattern is citation stacking: §9.6 names four vocabularies and §9.8 names six works in two paragraphs, which reads as authority rather than teaching.
- The article's strongest pattern is "one sentence you can implement": the guard-fact rule and the "both branches must have consumed the same handles" rule are both quotable and testable.

### What was tricky to build
- Separating "terms never explained here" from "terms explained in Article 4/7/8". The article admits its dependencies up front, so I listed the dependent terms but said where the definition presumably lives, instead of calling every one a defect.

### What warrants a second pair of eyes
- My claim that §9.4's two instruction counts contradict each other: they could refer to different backends or different loops, in which case only the wording is at fault. The editor should check against Article 5.
- My decision to score §9.11 (Key points) 5 while scoring the sections it summarises lower; it is defensible because the bullets match their sections, but a reader could see it as inconsistent.

### What should be done in the future
- Add the §9.4 instruction listing and cut §9.8, as stated in `feedback.md`.
- Give file/line references for the observations in §9.2 and §9.5, so a reader can check them.

### Code review instructions
- File: `feedback.md`; start with the Section scores table and the "Claims I could not verify" list, which are the two sections an editor can act on immediately.

### Technical details
- Counts in the feedback: 6 doubled-back quotes, 15 term lines, 9 unverifiable claims, 12 section scores (9.1–9.12), 3 quiz questions flagged, 1 add and 1 cut.

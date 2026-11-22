# Investigation entry

## Step 1: Reading the article end to end

I read `TASK.md` first to fix the deliverable list, then `diary-format.md`, then `article.md` in one pass from the title to the last reference. The article is section 4 of a longer series, so a large part of my reading effort went into tracking which facts were established here and which are imported from "Article 3," the "companion report," and the project's own compiler.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Perform the four-step student-reviewer protocol in `TASK.md`: read the article, answer the quiz, write structured feedback, write this diary, then reply `DONE`.
**Inferred user intent:** The editor wants an honest signal about where a teaching article fails to teach, before publication.
**Commit (code):** N/A — no repository commit made; only the three new markdown files.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (all files present in the working directory).
- Kept running notes on unfamiliar or undefined terms and on any quoted number whose method was not given.

### Why
- I had to read the format file before writing anything, since the diary has a required structure.
- I read the article once without stopping to answer questions, so that judgments about "read twice" passages would reflect a genuine first pass rather than a search for quiz answers.

### What worked
- The article's section 4.1 summary table gave me a working skeleton of the whole argument on the first read: five wastes, five remedies, one column on whether the answer changes.
- The worked `nextIndex` example supplied everything quiz question 1 needed, including the interval endpoints.

### What didn't work
- No tooling failure. One reading failure: my first pass through the sentence "The summary is computed once *because it is a function of the facts, and does not contain them*" did not produce a usable understanding; I only got it on re-reading, and recorded that in the feedback.

### What I learned
- The article is built as a split: section 4.1 keeps whole-program inference and optimizes it; section 4.2 removes the need for it. That split is the spine, and the quiz follows it almost one question per technique.

### What was tricky to build
- Distinguishing "claims I could not verify" from "claims cited to literature I do not have." I decided that a claim counts as unverifiable when the article gives me no method, conditions, or number I can reason about — not merely when it points at a paper.

### What warrants a second pair of eyes
- Whether my reading of quiz question 3 is what the article intends. I answered in terms of one name carrying two branch facts, which forces the join; the article's own phrasing is "must create a new name wherever a fact about a value can change," and I am not certain those are the same statement.

### What should be done in the future
- Ask the editor for Article 3, so the measurement claims could be checked rather than only flagged.

### Code review instructions
- Start at `article.md` §4.1 and §4.2; both new files (`answers.md`, `feedback.md`) reference them by section number.

### Technical details
- Files read: `TASK.md`, `diary-format.md`, `article.md`. Files written: `answers.md`, `feedback.md`, `diary.md`. No code was compiled or run; this session is reading and writing only.

## Step 2: Answering the six quiz questions

I answered the six questions in order into `answers.md`, two to six sentences each, showing the interval arithmetic for question 1 and quoting the article's own wording where a definition was asked for. Each answer ends with a `Confidence` line.

### Prompt Context
**User prompt (verbatim):** see Step 1 — TASK.md step 2.
**Assistant interpretation:** Answer in my own words, show working where a calculation or translation is asked for, and rate confidence 1–5 honestly.
**Inferred user intent:** Test whether the article's explanations actually transfer to a reader who has just finished it.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers, each with a `Confidence: N` line.
- Question 1: wrote `J₁ = i + 1` and applied it to both endpoints, 5+1=6 and 7+1=8, giving [6, 8].
- Question 6: answered that the source's type annotations supply the information, using the Static TypeScript peephole-pass quotation and the Static Hermes "sound types for performance" line.

### Why
- I showed the endpoint substitution explicitly rather than only stating [6, 8], because the task asks for working on a calculation and because the article's own example only gives [1, 10] from [0, 9] without the intermediate step.
- I kept confidence at 4 rather than 5 on questions 3 and 5, where my answer is consistent with the text but completes it with my own inference.

### What worked
- Questions 1, 2, 4 and 6 were answerable directly from single passages; confidence 5 was justified there.
- Question 3 was answerable but needed me to reconstruct the mechanism; I marked it 4.

### What didn't work
- Question 5 asks for consequences "for a compiler that runs on the handheld," and the article mostly states generic properties of local checking. I answered with one property-to-consequence inference (incremental rebuilds) that the article does not spell out, and recorded that gap in `feedback.md` rather than inventing more.

### What I learned
- The quiz questions map one-to-one onto the five remedies plus Static TypeScript, so answering them doubles as a check that section 4.1's table really did its job. Four of six were answerable at confidence 5, which suggests the table works as a teaching device.

### What was tricky to build
- Question 3. The article gives the conclusion ("with that renaming, sparse analysis preserves the precision of the dense analysis") but not the failure argument, so I had to derive that one name for both branch outcomes forces the analysis to record only the join of the two ranges. If my derivation is wrong, the answer is wrong in a way the text cannot correct.

### What warrants a second pair of eyes
- The question 3 answer relies on a mechanism the article asserts only implicitly. The editor may want an explicit sentence in §4.1 about what goes wrong with a single name.

### What should be done in the future
- If the article is revised, re-answer question 5 to see whether the handheld link became explicit.

### Code review instructions
- `answers.md`, questions 1, 3 and 5 are the ones worth checking against `article.md` §4.1–4.2.

### Technical details
- Quiz answers: jump function `J₁ = i + 1`; [5, 7] gives [6, 8]. No other arithmetic in the quiz.

## Step 3: Writing the feedback report

I wrote `feedback.md` with the six required sections: passages read twice, unexplained terms, unverifiable claims, per-section scores, unanswerable quiz questions, and one addition plus one cut. I went back through the article section by section to collect exact quotations so that every criticism points at a specific sentence.

### Prompt Context
**User prompt (verbatim):** see Step 1 — TASK.md step 3.
**Assistant interpretation:** Produce a structured, honest critique with quoted evidence, not a general impression.
**Inferred user intent:** The editor needs to know precisely where the article fails to teach, in a form that can be acted on line by line.
**Commit (code):** N/A.

### What I did
- Collected fifteen undefined-term lines, eleven unverifiable-claim entries with quotations, eight twice-read passages, five section scores, two quiz-question caveats, and a paired add/cut recommendation.
- Scored section 4.2 highest (5) and 4.3 lowest (3), with one sentence each.

### Why
- I quoted rather than paraphrased in the first two sections so the editor can search the manuscript for each item.
- For unverifiable claims I distinguished "no method given" from "cited to a paper I cannot read," and concentrated on the former, since those are fixable inside the article.

### What worked
- The undefined-terms list produced a clear, actionable cluster: widening and narrowing are named as the mechanism that makes dependency-order solving both faster and more precise, and are never explained. That became my "one thing to add."
- The measurement-unit problem (11.7 million joins, 11,760 function visits — per build? per program?) surfaced repeatedly and looks like a genuine editorial gap.

### What didn't work
- I could not verify any of the paper-derived numbers (5×–110×, 45 percent bounds checks, 450×), because the web is off-limits and the papers are not in this directory. Rather than drop them, I listed them with the specific evidence that is missing.

### What I learned
- The article's weakest structural point is not any single paragraph but its dependence on out-of-file material: "Article 3," "the companion report," CJI, and Agenda are all load-bearing and all undefined here. A reader arriving at section 4 cold cannot check the motivation for any of the five remedies.

### What was tricky to build
- Choosing the "one thing to cut." The candidate I settled on is the rejected result-cache paragraph, because it is the only passage that spends its precision on a dead end. The alternative was the "what these remedies cannot do" paragraph, but that one carries an argument the article needs.

### What warrants a second pair of eyes
- My section 4.2 score of 5 may be generous. It is the clearest section, but it also assumes familiarity with separate compilation and interfaces, which the definitions section flags; an editor may judge that the same gap deserves a lower score.

### What should be done in the future
- If Article 3 is available, re-check the unverifiable-claims list; several entries may collapse into "verifiable, see Article 3, paragraph N."

### Code review instructions
- Read `feedback.md` section by section against `article.md`; every quotation should match exactly. The scores and the add/cut pair are the parts most open to disagreement.

### Technical details
- Deliverable structure fixed by `TASK.md` step 3; diary structure fixed by `diary-format.md`. All work confined to this directory, no web access used.

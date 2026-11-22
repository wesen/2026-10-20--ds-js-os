# Investigation diary: student read of Article 9

## Step 1: Reading the article and the task

I read `TASK.md` and `diary-format.md` first, then `article.md` straight through in one sitting, as
the task asked. The article is section 9 of a series, "Types That Pay for Themselves", and it
proposes seven type-system additions, each justified by a criterion of three conditions. My intent
for this step was only to read and note, not to judge, so I kept a scratch list of passages that
stopped me and terms I did not recognise. Nothing was edited in this step.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read `article.md` end to end, then produce `answers.md`, `feedback.md`
and `diary.md` per the instructions in `TASK.md`, and reply with the single line `DONE`.
**Inferred user intent:** The editor wants an honest test of whether the article teaches, from a
reader who knows some type theory but not this project's internals.
**Commit (code):** N/A — no code was changed.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (all of it, including the reference list).
- Kept a running list of unclear passages, undefined terms, unverifiable claims and section scores.

### Why
- Reading the article completely before writing anything was explicit in the task, and separating
  reading from judging keeps the feedback from being biased by the quiz.

### What worked
- The article's structure (observation, mechanism, cost, summary table, key points) made it possible
  to read once for the argument and then re-read only the passages I had flagged.

### What didn't work
- No failures. The only friction was that the article assumes Articles 4, 5, 7 and 8, which I do not
  have here, so several sentences point outside the text. I recorded those as "cannot verify" rather
  than guessing what the other articles say.

### What I learned
- The strongest sections are the ones that show code (9.2, 9.6); the weakest are the ones carried by
  citations (9.8, parts of 9.5).

### What was tricky to build
- N/A in this step: reading only.

### What warrants a second pair of eyes
- Whether my reading of the guard-fact rule in 9.4 ("a call that could change the length") is the
  author's intended reading; if the author meant "every call kills the fact", the section's value
  argument changes.

### What should be done in the future
- If the article is revised, decide whether criterion 1 ("in one pass") excludes per-function
  summaries, because 9.4 and 9.7 both seem to need them.

### Code review instructions
- N/A: no code.

### Technical details
- Files read: `TASK.md`, `diary-format.md`, `article.md`. No files written in this step.

## Step 2: Answering the quiz

I answered the six questions in 9.12 in my own words, keeping each to two to six sentences and adding
a `Confidence:` line. Where the question asked for a calculation or a translation I showed the
working: the six-byte/four-code-unit/three-code-point example from 9.3 for question 2, and the
`at = -1`, `length = 10` signed-versus-unsigned comparison for question 4.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Write `answers.md` with numbered answers in my own words, showing
working, each followed by a confidence value from 1 to 5.
**Inferred user intent:** The editor wants to know not merely whether the quiz is answerable but how
certain a reader feels, since a confidently wrong answer exposes a teaching failure.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers plus `Confidence:` lines (5, 5, 4, 4, 5, 4).
- Question 1: exhaustive matching turns the new value into a set comparison and the compiler lists
  every `match` to update.
- Question 2: prevents cross-coordinate-system passing; working from `a🙂b`; no run-time cost because
  the representation is unchanged.
- Question 3: the fact `at < text.length`, invalidated by assigning `at` or `text` or by a
  length-changing call, and re-established on each iteration so no back-edge propagation is needed.
- Question 4: signed guard says nothing about `at >= 0`; the unsigned index type makes the guard
  itself unsigned, so it implies the whole check.
- Question 5: no arena reference in the state record, none live across a wait; copy into
  application-lifetime storage.
- Question 6: both branches must consume the grant exactly once, so their residual handle sets agree.

### Why
- I flagged the questions where I had to infer rather than quote (3 and 6) with confidence 4, to make
  the uncertainty visible to the editor.

### What worked
- Question 2's working came straight from the article's own example, which is the clearest single
  sentence in section 9.3.

### What didn't work
- Question 6 could only be answered by choosing between two readings of "both branches must have
  consumed the same handles". I answered under the reading "each path consumes it exactly once",
  which is the only reading that makes the earlier sentence "a path that forgets is a compile error"
  consistent. I did not find a sentence in the article that settles it, so the answer is an inference.

### What I learned
- The quiz questions are well matched to the sections: five of six map onto a mechanism with a
  stated rule, and only question 6 lands on an ambiguous sentence.

### What was tricky to build
- Question 4, because the article's claim that the existing check is "one unsigned comparison, which
  also rejects negative indices" is compressed. I had to reconstruct the unsigned reinterpretation
  (0xFFFFFFFF <u 10 is false) to see how a single signless comparison covers both bounds.

### What warrants a second pair of eyes
- My answer to question 3 assumes the loop condition counts as re-establishing the fact each
  iteration; the article says this explicitly, but it also means the optimisation disappears as soon
  as the test is hoisted into a helper call, which the section does not mention.

### What should be done in the future
- Add one worked example (accepted and rejected) for the linear-handle `if` rule so question 6 has a
  citable answer.

### Code review instructions
- Read `answers.md`; check question 6 against §9.6.

### Technical details
- Output: `answers.md`. Confidence values: Q1 5, Q2 5, Q3 4, Q4 4, Q5 5, Q6 4.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six sections the task lists: passages read twice, terms used before
explanation, unverifiable claims, section scores, unanswerable questions, and one addition and one
cut. I quoted rather than paraphrased wherever I could, so the editor can find the text.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with the six specified sections, quoting the
problem text and naming what is missing.
**Inferred user intent:** The editor needs actionable, located criticism rather than a general
impression.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with six quoted passages read twice, sixteen undefined terms, eleven
  unverifiable claims, a score for each of sections 9.1 to 9.12 with one sentence of reason, three
  quiz questions discussed as partly or wholly under-answered, and one addition (a worked compile
  error for §9.3) and one cut (the Hume level-stack quotation in §9.8).

### Why
- Quoting one or two sentences per item is what the task asked for, and it also keeps me from
  inventing problems that are not in the text.
- I scored §9.8 lowest (2) because almost every sentence there is a citation plus a one-clause
  summary, and §9.2 highest (5) because it is the only section where the defect, the mechanism, the
  check and the benefit are all on the page.

### What worked
- The section-scores list forced a comparison between sections that reading alone had not produced:
  the pattern is that sections with code are clear and sections with citations are not.

### What didn't work
- I could not verify the numeric claims (404 traps, seven versus nine or ten instructions, "about
  four instructions", 105 times slower) because the article gives no file, listing or method. I
  recorded them as unverifiable rather than checking them, which is a limit of this session, not
  necessarily of the article. Also, the instruction counts in §9.4 look mutually inconsistent
  (two to three instructions per check versus "about four" saved per check); I flagged that but did
  not resolve it, since the underlying listings are in Article 5, which I do not have.

### What I learned
- The article's honesty about cost is a strength in 9.2 and 9.9 and a weakness in 9.8, where the
  cost of the rejected features is stated but the benefit is only cited.
- Terms such as "world", "reactor", "nucleus" and "manifest" are load-bearing and entirely
  undefined here, which means a reader arriving at Article 9 alone cannot follow the arena or effect
  sections at all.

### What was tricky to build
- Deciding whether "not explained in this article" is a fair complaint, given the article is one of a
  series. I kept those items but phrased them as "explained in a sibling article, not here", so the
  editor can judge whether a glossary pointer is enough.

### What warrants a second pair of eyes
- My score of 3 for §9.5 and §9.6 may be harsh if the intended reader has read Articles 4, 7 and 8;
  an editor should re-score those with the earlier articles in hand.
- The claim that the §9.4 instruction counts are inconsistent is worth checking against the actual
  Article 5 listing before it is reported as an error.

### What should be done in the future
- Add a short glossary or a "terms defined in earlier articles" box, since at least sixteen terms are
  assumed.
- Reconsider the §9.10 ordering rationale: linear handles are placed last, yet their motivating story
  depends on the arena and effect machinery ordered before them.

### Code review instructions
- Read `feedback.md` section by section against `article.md`; the quotations are exact and can be
  searched for with a text search.

### Technical details
- Output: `feedback.md`. Section scores: 9.1 = 4, 9.2 = 5, 9.3 = 3, 9.4 = 3, 9.5 = 3, 9.6 = 3,
  9.7 = 4, 9.8 = 2, 9.9 = 3, 9.10 = 4, 9.11 = 5, 9.12 = 4.

# Investigation entry

## Step 1: Reading the article

I began by reading `TASK.md`, then `diary-format.md` for the required entry shape, then
`article.md` straight through without stopping to take notes. The article is short enough to hold in
one pass, but dense: it moves from type inference as constraint solving, to fixpoint iteration and
widening, to the JavaScript integer proof, to specialization rounds, to a measurement table, to four
prior systems. My intent was to get the argument's shape first and judge clarity only afterwards, so
that confusion I felt during the first pass could be recorded honestly rather than reconstructed.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered steps in `TASK.md`: read the article, answer
the six quiz questions in `answers.md`, write the four-part-plus feedback in `feedback.md`, and write
this diary.
**Inferred user intent:** Use a student reader as a test of whether the teaching article actually
teaches, and get a concrete list of the places where it does not.
**Commit (code):** N/A — no repository commit was made in this directory.

### What I did
- Read `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round1/a03-post/s3/TASK.md`
- Read `diary-format.md` and `article.md` in the same directory.
- No commands were run; only file reads.

### Why
- I read `diary-format.md` before the article because the diary format demands fields (prompt
  context, what didn't work) that are easy to lose if written from memory at the end.
- I deliberately did not annotate during the first read, because a second pass with a pen would have
  produced cleaner, more plausible complaints than the ones a real reader has.

### What worked
- Reading straight through made the article's spine obvious: "inference is where the 25 minutes go,
  here are five numbers and four precedents."
- Section 3.1's three-function example and section 3.3's list of three proof conditions were
  understandable on the first pass with no re-reading.

### What didn't work
- No failures of tooling. The only failed call was my initial attempt to `read` the directory itself,
  which returned `EISDIR: illegal operation on a directory, read`; I recovered by reading the known
  filenames directly.

### What I learned
- The article assumes Article 1 for the words *turn*, *world*, *CJI* and "the typed compiler". A
  reader entering at Article 3 cannot resolve those from this text alone.

### What was tricky to build
- N/A for this step; the difficulty was comprehension, recorded in `feedback.md`.

### What warrants a second pair of eyes
- Whether "Agenda" and "CJI" are meant to be understood without Article 1, or whether the series
  assumes linear reading. If the latter, the article should say so in its first paragraph.

### What should be done in the future
- Read Article 1 before Article 3 if a second round of testing is wanted, to distinguish "unclear
  here" from "defined earlier".

### Code review instructions
- Compare `feedback.md` section "Terms used before they were explained" against the first two
  paragraphs of `article.md`.

### Technical details
- Files: `TASK.md`, `diary-format.md`, `article.md`. Article length: 8 numbered sections plus
  references. No code executed.

## Step 2: The quiz

I answered all six questions in `answers.md`, two to six sentences each, in my own words, with a
`Confidence: N` line after each. Where a question asked for a calculation or a trace I showed it:
question 2 reproduces the three visits from the table, and question 4 shows the sum
12 + 58 + 1 + 4 + 3 + 1 = 79 so the "79 in total" claim is checked rather than repeated.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer the "Check your understanding" questions using only the article,
marking confidence honestly.
**Inferred user intent:** Find out whether the article's own quiz is answerable from its own text.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and confidence ratings 5, 4, 5, 5, 4, 4.
- Checked the arithmetic in section 3.4 (79 helpers) and in section 3.5 (1.2 s, 85.9 s, 37 ms,
  1,475 s, 544 s, 170 s) for internal consistency.

### Why
- I rated question 2 at 4 rather than 5 because the trace is supplied verbatim in the table but the
  widened value for `i` is not, so half the question is answered by description rather than fact.
- I rated question 5 at 4 because the row's wording ("of which 168 s in the frontend") pulls against
  the section's claim that parsing is cheap.

### What worked
- Questions 1, 3, 4 and 6 were answerable by quoting or lightly paraphrasing a single passage each.
- Question 6 was answerable because the article names QuickJS as the handheld's fast first tier and
  then states plainly that CJI has "no mechanism to restrict it to the code that matters".

### What didn't work
- Question 2's second half: the article never says which threshold widening chooses for `i`. The
  loop has no literal other than `0` and `1`, and `n` is unconstrained, so I could not name the
  widened bound. I wrote the general mechanism instead of inventing a number.

### What I learned
- The quiz is answerable at the level of "describe the mechanism" for every question, and only
  question 2 asks for a specific value the body does not give.

### What was tricky to build
- Distinguishing an answer I derived from the text from an answer I supplied from outside knowledge
  about abstract interpretation. I kept the answers tied to the article's own vocabulary
  (unknowns, fixpoint, widening, join, proof, demotion, tier) and did not import outside terms.

### What warrants a second pair of eyes
- Answer 5's attribution sentence. The article's support is "170 s, of which 168 s in the frontend"
  plus a comparison to the typed compiler; whether that is enough to attribute the residual to
  inference is a judgement the editor may want to check.

### What should be done in the future
- If question 2 is kept, section 3.2 must show a completed widening step.

### Code review instructions
- Read `answers.md` against `article.md` sections 3.1–3.6 and check that no answer uses a fact not in
  the article.

### Technical details
- `answers.md`: 6 answers, each ending with `Confidence: N`. Confidence distribution: three at 5
  (questions 1, 3, 4) and three at 4 (questions 2, 5, 6), none below 4, because every question but
  number 2 was explicitly covered.

## Step 3: The feedback

I wrote `feedback.md` in the six required sections, quoting rather than paraphrasing the passages that
slowed me down. The hardest part was separating the two categories "had to read twice" and "terms
never explained": several sentences belonged to both (the phrase "plus a set of standard values"
appears in a passage I re-read and also introduces an undefined term), so I kept the quoted passage
under the first heading and listed the bare term under the second.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce structured criticism of the article, including per-section
scores and a concrete add/cut pair, from a student reader's position.
**Inferred user intent:** A pre-publication triage list, ordered so the editor can fix the worst
teaching failures first.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with sections: Passages I had to read twice; Terms used before they were
  explained, or never explained; Claims I could not verify from the article itself; Section scores;
  Questions that the article did not let me answer; One thing to add and one thing to cut.
- Scored sections 3.1–3.8 as 5, 3, 5, 4, 4, 3, 5, 4, each with one sentence of reason.
- Verified every quoted fragment character-for-character against `article.md`.

### Why
- I scored 3.2 and 3.6 lowest because those are where I actually lost the thread, not where the
  prose was merely long.
- I put the "one thing to add" on a completed widening trace because it repairs both the weakest
  scored section and the one quiz question I could not finish; a single fix for two problems seemed
  the most useful advice.
- I chose the Self pause statistics as the cut because they are the least verifiable material per
  line of text, and the argument only needs the two-compiler design.

### What worked
- Quoting exact strings made the report checkable: each quote can be found in `article.md` by
  search.
- The arithmetic check on 79 helpers and the note that 25 minutes is 1,500 s while the table totals
  1,480 s both came out of reading the tables with a pencil.

### What didn't work
- I could not establish whether "Agenda" is a program, a benchmark, or a module, so my complaint
  about it may be wrong if Article 1 defines it clearly. I flagged it as a term rather than stating
  it as a defect.
- I could not verify any citation, since I was told not to use the web. Several "claims I could not
  verify" entries are therefore about missing *internal* evidence rather than about the cited papers
  being wrong.

### What I learned
- The article's evidence is strongest where it rules things out (emission, GC, parsing) and weakest
  where it attributes a remainder: 168 of 170 seconds "in the frontend" needs one more sentence to
  be usable.

### What was tricky to build
- The boundary between "unclear writing" and "missing knowledge". For example, "once it has all of
  them nothing more can be added" is a real gap in the text (the ordering of the type lattice is
  never given), but a reader who knows dataflow analysis fills it in silently. I marked it as a
  re-read, since the article elsewhere explains its terms, so the omission is inconsistent with its
  own standard.

### What warrants a second pair of eyes
- The claim that "Nearly twelve million joins ... is the 25 minutes" is the article's thesis, and the
  text supports it only with a join count and a share of instructions from a workstation profile.
  An editor should decide whether that is sufficient before publication.

### What should be done in the future
- Fix the two undefined table terms ("safety guard", "frontend") and the unreconciled 1,480 s vs
  25 minutes, since those are cheap edits with high payoff.

### Code review instructions
- Start at `feedback.md` section "Questions that the article did not let me answer", then compare
  question 2 of `article.md` §3.8 with the widening paragraph in §3.2.

### Technical details
- `feedback.md` sections: 6, as required. Section scores cover numbered sections 3.1–3.8. Two
  problems identified as unanswerable/partly unanswerable from the text: quiz questions 2 and 5
  (5 only partially).

# Investigation entry

## Step 1: Reading the article from start to finish

I read `TASK.md` and `diary-format.md` first to learn what output was expected, then read
`article.md` once straight through without stopping to take notes, and once more section by
section while drafting the feedback. The article is a design chapter about confining native code
on an embedded device: it names three safety properties, four confinement mechanisms, a stack
bound that follows from the absence of recursion, a fuel counter, and a verifier for emitted
RV32 code. Article 1 and Article 5 are cited for vocabulary and for the shape of the emitted
code, and neither was available to me in this directory.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four tasks in `TASK.md`: read the article, answer its
quiz in `answers.md`, write `feedback.md` with the six named sections, and write this diary in
the `diary-format.md` format.
**Inferred user intent:** The editor wants an honest teaching review from a reader who has only
this article, to find where the text fails to teach before publication.
**Commit (code):** N/A — no repository work, no commits.

### What I did
- Read `TASK.md`, `diary-format.md`, and `article.md` in full with the `read` tool.
- Attempted to list the working directory to see whether Articles 1 and 5 were present; the
  attempt failed (see "What didn't work").
- Re-read sections 7.4, 7.5 and 7.6 a third time, since the quiz questions cluster there.

### Why
- The task is a comprehension test, so a single scanning read would have produced confident but
  shallow feedback. A second pass per section was the only way to separate "written confusingly"
  from "I read too fast".

### What worked
- The article's own structure carried the read: 7.1 quotes the loader comment, and 7.8 restates
  the whole argument, so I could check my reading of 7.3 to 7.6 against the summary.

### What didn't work
- `read` on the directory itself returned
  `EISDIR: illegal operation on a directory, read`. No shell tool was available in this session,
  so I could not list the directory or confirm whether the companion articles are nearby; I
  proceeded on the assumption that they are not, and treated every reference to Article 1 and
  Article 5 as unavailable.

### What I learned
- The article leans much harder on its companion articles than the first page admits. "World",
  "turn budget", "reactor", "nucleus", "operand stack" and the frame layout are all load
  bearing, and only the first few are explicitly delegated to Article 1.

### What was tricky to build
- Distinguishing what I inferred correctly from what the text actually said. In 7.4 the phrase
  "finished translating its body" is the entire basis of the no-recursion argument, and my first
  reading of it was wrong; noticing that took a deliberate third pass.

### What warrants a second pair of eyes
- Whether the missing companion articles are legitimately assumed (a series reader has them) or
  whether the standalone reader must be served. My feedback assumes the latter, which may be
  harsher than the editor intends.
- Whether my guess about the direction of the crossed edge in the 7.4 mermaid diagram matches
  the author's intent.

### What should be done in the future
- Provide Articles 1 and 5, or a one-page glossary, to the next reader, so that feedback can
  separate gaps in this article from gaps in the series.

### Code review instructions
- Files written this step: none. Next steps write `answers.md`, `feedback.md`, `diary.md`.
- Validation: `read article.md` should still be unchanged; the three output files are new.

### Technical details
- Tools used: `read` only. No commands were run, so no command output exists except the EISDIR
  diagnostic quoted above.
- Files read: `TASK.md`, `diary-format.md`, `article.md` (about 1,600 words of body plus a
  reference list of 15 entries).

---

## Step 2: Answering the "Check your understanding" questions

I answered all six questions in `answers.md`, numbered as in the article, each with a short
justification and a `Confidence:` line. The intent was not to produce textbook answers but to
show the editor exactly how far a careful reader gets, so I wrote down the reasoning that the
text supports and marked the questions where I could only paraphrase the article back at itself.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer the six questions from the article alone, two to six
sentences each, in my own words, showing working for the calculation and translation parts.
**Inferred user intent:** Detect which quiz questions are answerable from the text and which are
answerable only from the author's head.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and a `Confidence:` value from 1 to 5 after each.
- Question 2: wrote the ordering argument in full, plus the forward-reference remedy (build the
  call graph from all signatures, search for a cycle, reject).
- Question 3: named the two summed quantities — the largest sum of program frame sizes along a
  call chain, and the constant stack need of the deepest reachable reactor function.
- Question 4: traced `while (true) { }` both today (the budget is checked only on return) and
  with fuel (decrement and test at the back-edge, trap, turn ends as a fault), and answered the
  "later" sub-question explicitly with "no, fuel stops and does not resume".
- Question 5: chose address masking, and gave the reason pattern checking fails — the sequence
  keeps its shape and is compared against *some* length word, not the right one.
- Question 6: gave jump-versus-trap as the verifier's advantage and any-compiler-including-CJI
  as PMP's.

### Why
- The instructions asked for answers in my own words with working shown, so I deliberately did
  not copy phrases such as "past a back-edge" without re-explaining them.
- Marking confidence low where I had to guess (question 1, and the second half of question 5)
  is more useful to the editor than a uniformly high score.

### What worked
- Questions 2, 4 and 6 fell out of the text almost directly; the arguments in 7.4, 7.5 and the
  7.7 comparison table are strong enough to answer from without guessing.

### What didn't work
- Question 3 could only be answered by restating the article's single dense sentence; I could
  not explain why the reactor term is a constant, because the article never shows the reactor's
  stack use being measured.
- Question 5's "why the other does not" depends on the phrase "does not confirm that the base
  address really is a buffer", and I could not construct the concrete failure the author had in
  mind, so my answer there is an inference, hence confidence 4.

### What I learned
- The quiz is a good instrument: three questions are clean, and three expose sentences that the
  author understands better than the text does.

### What was tricky to build
- Question 1 has two plausible answers. "Is a contract, not a wall" clearly concerns control
  safety, but the same quoted sentence also says a module can read and write anything, so memory
  safety is equally in scope. I answered control safety and noted the ambiguity rather than
  hiding it.

### What warrants a second pair of eyes
- Question 1's expected answer, so the quiz can be made unambiguous.
- Question 3's intended reading of "the deepest reactor function that chain can reach": once or
  once per call.

### What should be done in the future
- Either define the reactor's stack term in 7.4 or drop it from question 3.

### Code review instructions
- File: `answers.md`. Check that each `Confidence:` line reflects genuine uncertainty, and that
  questions 1, 3 and 5 are marked as partly unanswerable rather than glossed.

### Technical details
- Contract followed: two to six sentences per answer, own words, `Confidence: N` after each.
- Confidence values written: 4, 5, 4, 5, 4, 5.

---

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections, quoting short passages verbatim rather than
paraphrasing so the editor can find them. The hardest part was resisting the urge to praise:
the article is good, so nearly every note had to be pinned to a specific sentence to be useful.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the review with sections for double-reads, unexplained
terms, unverifiable claims, per-section scores, unanswerable quiz questions, and one addition
plus one cut.
**Inferred user intent:** An actionable pre-publication defect list, ranked by where the reader
actually gets lost, not a general impression.
**Commit (code):** N/A.

### What I did
- Wrote six quotes under "Passages I had to read twice", each with what specifically was unclear:
  the word "finished" in 7.4, the reactor stack term, the crossed mermaid edge, the nested-loop
  fuel charge, the "really is a buffer" limit of pattern checking, and the mask-and-add sequence.
- Listed twelve terms used before explanation or unexplained, headed by CJI, the nucleus, RV32
  and slot.
- Listed twelve claims with the missing evidence for each, including the 4 percent figure, the
  "about twenty different instructions", "about 1,070 lines of JavaScript", the 28 reactor
  functions, and "the check is a few dozen lines".
- Scored sections 7.1 to 7.9 (5, 4, 4, 4, 3, 3, 3, 5, 4) with one sentence of reason each.
- Named questions 1, 3 and 5 as partly unanswerable and said what was missing in each case.
- Chose as the addition a worked end-to-end example (source, annotated RV32, verifier verdict)
  and as the cut the 7.4 diagram together with the CHERIoT sentence.

### Why
- I paired every criticism with a fix, because "unclear" alone gives the editor nothing to act on.
- I scored 7.6 at 3 despite it being the article's core: it is the section where I most needed
  help and got the least, so the low score is a signal about difficulty, not about quality.

### What worked
- Cross-checking 7.8 against 7.3 to 7.6 gave me a reliable test: anything in the key points that
  I could not re-derive from the sections above it belonged in the feedback.

### What didn't work
- Judging section 7.7 fairly. I could not check any of its hardware facts, so "3" partly reflects
  unverifiability rather than bad writing; I said so in the reason so the score is not misread.

### What I learned
- The single most expensive omission is the missing instruction list and the missing emitted
  listing. Almost every unverifiable claim in 7.6 collapses into "I never saw the code".

### What was tricky to build
- Keeping the quotes short enough to be usable. Several passages that bothered me were long
  paragraphs with one bad clause; I trimmed to the clause and named the paragraph by section.

### What warrants a second pair of eyes
- Whether the "one thing to cut" is right. The diagram and the CHERIoT aside are my choices
  partly because they are the only passages that are both optional and wrong-ish; an editor who
  values the survey material would cut something else.
- The claim that "pattern checking passes a wrong-register bug" is my inference from one
  sentence; the author should confirm it before I would let anyone publish it.

### What should be done in the future
- If the article gets the worked example, questions 3 and 5 should be revisited; both may become
  answerable without further text.

### Code review instructions
- File: `feedback.md`. Verify that each quoted passage is verbatim against `article.md`, that the
  nine section scores match the numbered sections 7.1 to 7.9, and that every unverifiable claim
  names the missing evidence rather than just doubting the claim.

### Technical details
- Sections scored: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9. The unnumbered "References" and
  the title are not scored.
- Output files in this session: `answers.md`, `feedback.md`, `diary.md`. `article.md` was not
  modified.

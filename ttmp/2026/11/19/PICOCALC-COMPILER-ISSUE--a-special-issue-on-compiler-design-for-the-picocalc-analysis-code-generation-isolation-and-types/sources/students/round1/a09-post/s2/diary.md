# Investigation entry

## Step 1: Reading the article and the two format files

I began by reading `TASK.md`, which defines three deliverables and a diary. Before touching the article I read `diary-format.md` so that the diary would not have to be rewritten afterwards. Then I read `article.md` from start to finish in one pass, without taking notes, and marked mentally where I stumbled.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, then execute its four numbered steps: read the article, answer the quiz into `answers.md`, write structured feedback into `feedback.md`, and write this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest trial read of a teaching article before publication: a signal about which parts teach and which parts do not, in a form that can be acted on.
**Commit (code):** N/A — no repository or git history is present in this working directory.

### What I did
- Read `TASK.md`, `diary-format.md`, then `article.md` in full (sections 9.1–9.12 plus references).
- Attempted to list the directory with a read call; it failed with `EISDIR: illegal operation on a directory, read`, so the only files I know about are the three I was pointed at.

### Why
- Reading `diary-format.md` first avoided a second pass over the whole session; the format is long and its fields ("what didn't work", "what was tricky to build") constrain how I record the reading, not just the writing.

### What worked
- One uninterrupted read left a clear picture of the overall argument: a three-part criterion, six admitted features, two deferred directions, one non-type-theory section, then a summary table.
- The summary table in 9.10 turned out to be the best map of the article and I used it as an index while answering the quiz.

### What didn't work
- The directory could not be listed with the tools available (no shell), so I could not check whether an answer template or prior student's files exist. Risk: my file names may collide with an expected convention. `TASK.md` names them explicitly (`answers.md`, `feedback.md`, `diary.md`), so I followed it literally.

### What I learned
- The article is a second-order text: most of its load-bearing terms (reactor, world, manifest, trap) are defined in Articles 4, 5, 7 and 8 and only referenced here. As a reader of the standalone article I am expected to supply that vocabulary; as a reviewer I noted each place where that expectation is not met.

### What was tricky to build
- Nothing was built. The hardest part of reading was holding the two instruction counts in section 9.4 in mind simultaneously; the contradiction only became visible on the third encounter, when "saves about four instructions" was read against "nine or ten with it".

### What warrants a second pair of eyes
- Whether the 9.4 instruction numbers conflict is the one finding that, if wrong, changes the feedback's headline. A reader with Article 5 to hand should confirm the baselines before editing.
- Whether "both branches must have consumed the same handles" (9.6) means same disposition or merely same count; I read it as the latter and flagged the ambiguity rather than resolving it.

### What should be done in the future
- Read `article.md` once for structure and a second time with the quiz in hand; several answers (Q3, Q4) depended on single sentences whose significance only appeared when the question pointed at them.

### Code review instructions
- Files: `answers.md`, `feedback.md`, `diary.md` in this directory. Validation is reading, not running: check that each answer is 2–6 sentences with a `Confidence:` line, and that every feedback section exists with quoted passages.

### Technical details
- Article sections scored: 9.1–9.12. Quiz has six questions, all answerable in outline, two (`Q4`, `Q6`) answerable only in outline.

## Step 2: Answering the quiz

I answered the six questions into `answers.md`, in the article's order and numbered the same way, then added a `Confidence:` line to each. Where a question asked for a mechanism I named the sentence in the article that licenses the answer, and for Q2 and Q3 I showed the intermediate step rather than only the conclusion.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Step 2 of `TASK.md`: answer the "Check your understanding" questions, 2–6 sentences each, in my own words, showing working, with a confidence from 1 to 5.
**Inferred user intent:** The editor wants evidence that the text actually supports its own exercises; a wrong but confident answer is more useful to them than a correct guess copied from the wording.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and a `Confidence: N` line after each.
- Q2: did not do arithmetic on `a🙂b` beyond what the article states, because the question asks what the distinct type prevents and costs, not for a recount of the string.
- Q3: split the answer into the recorded fact, the two invalidation events plus the call case, and the back-edge reason.
- Q4: added the wrap-around argument, since the article's own wording ("the guard is itself an unsigned comparison") was the part I could not parse.
- Q6: answered with "exactly one consuming operation per path" plus the typestate refinement, and recorded confidence 3.

### Why
- I kept the answers to the article's vocabulary (`turn arena`, `guard fact`, `consuming operation`) instead of paraphrasing into standard terminology, so that a mismatch between my answer and the text would be visible to the editor rather than hidden by my own synonyms.
- I gave confidence 3 on Q6 rather than 5 even though my answer is probably what the author intends, because the sentence in 9.6 admits two readings.

### What worked
- Q1, Q2, Q5 are answered almost verbatim by single sentences in 9.2, 9.3 and 9.5; confidence 5 on each.
- Q3 was answerable at confidence 4 once I noticed that the assignment step inside the loop is what makes the fact expire, which the section states but does not point at.

### What didn't work
- First draft of Q4 argued the lower bound was handled because "the compiler knows `at` is never negative" — that is circular, since a signed `at` can be negative. I discarded it and rebuilt the answer from the unsigned-comparison remark in 9.4, and logged the sentence as ambiguous in `feedback.md`.
- First draft of Q6 asserted that both branches must reach the same disposition (both revoke or both store). The article's list of permitted operations does not support that, so I weakened the answer and moved the disagreement into the feedback.

### What I learned
- Question 4 and question 6 are the two places where the quiz is harder than the text that is supposed to prepare for it; that is a property of the article, not of the questions, and it became the main content of the "Questions that the article did not let me answer" section.

### What was tricky to build
- The 2–6 sentence limit is tight for Q3 and Q5, which each carry an enumeration. I compressed by making each sentence carry one clause of the rule, and moved the extra material (costs, instructions) into 9.5's last sentence. Two of the six answers sit at six sentences exactly.

### What warrants a second pair of eyes
- Q1: I claim the compiler reports six errors. That follows from "lists every `match` that must be updated" only if each of the six places actually matches on that enumeration; a place may `if`-test the integer instead, in which case no error is reported. This is worth flagging to the editor as an assumption the question itself makes.

### What should be done in the future
- The article would benefit from one deliberately non-exhaustive `match` shown failing, which would make Q1 self-evident.

### Code review instructions
- File: `answers.md`. Check each answer against the quoted section; check the confidence numbers are not uniformly high (5 twice, 4 three times, 3 once).

### Technical details
- Sentence counts: Q1 3, Q2 4, Q3 3, Q4 3, Q5 4, Q6 4. Confidence: 5, 5, 4, 4, 4, 3.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six sections `TASK.md` prescribes, quoting the passages that stopped me and separating three kinds of complaint: passages I misread, terms I did not have, and claims I could not check. I then scored all twelve numbered sections and answered the two closing questions about what to add and what to cut.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Step 3 of `TASK.md`: a structured critique with quoted passages, term list, unverifiable claims, per-section scores, unanswerable questions, and one addition plus one cut.
**Inferred user intent:** Actionable editing input: quotes so the editor can find the passage, scores so weak sections are visible at a glance, and exactly one addition and one cut so the response cannot be dodged.
**Commit (code):** N/A.

### What I did
- Quoted six passages, each one or two sentences, with the specific confusion named.
- Listed fourteen terms used before definition or never defined, one line each.
- Listed eleven claims I could not verify, each with the missing evidence or step.
- Scored sections 9.1–9.12 from 1 to 5 with one sentence of reason each; 9.4 and 9.8 are the low points at 2.
- Named Q4 and Q6 as answerable only in outline, and gave the missing sentence for each.
- Chose as the addition a worked instruction listing for the bounds check, and as the cut the second half of 9.8.

### Why
- The addition was chosen to repair the article's only internal contradiction (2–3 instructions to add a check versus about 4 saved by removing one) rather than to add a new topic.
- The cut was chosen on the article's own criterion: 9.8's two paragraphs start from no observation in the repository and propose nothing to build.

### What worked
- Grouping the criticism by kind made the scores easy to justify: 9.4 scores 2 mainly because of one contradiction, 9.8 because of unexplained names, and both are documented above rather than asserted in the score table.
- The summary table (9.10) made it possible to check that each feature promised in the introduction is actually delivered by a section; all seven are.

### What didn't work
- I could not verify any repository measurement (404 traps, 85 `charCodeAt` calls, 28 reactor functions, 768 KiB) because I have no shell and no access to the repository from this directory. All of these are recorded as unverifiable rather than as errors, which is weaker than the editor may want; a reader with the repository should re-check items 1, 2, 7 and 8 of that list.

### What I learned
- The article's weakest habit is citing a number that a reader cannot reproduce from the page. Four of the eleven unverifiable claims are counts, and the one contradiction is between two counts.
- Its strongest habit is the observation/mechanism/cost triple with an explicit cost line; the sections that follow it (9.2, 9.3, 9.5, 9.7) are the ones that read cleanly.

### What was tricky to build
- Scoring 9.1, 9.10 and 9.12 as high as 5 while scoring 9.4 as 2 required being explicit about what each score measures: clarity of that section on its own, not importance or correctness of the whole article. That distinction is stated inside the score list only implicitly and could be misread.

### What warrants a second pair of eyes
- The claim of a contradiction in 9.4 is my central negative finding. If "under the improved backend of Article 5" is a different code generator from the one that produced "seven instructions", the contradiction dissolves and the add/cut recommendation should be revisited.
- Whether 9.8 really lacks a repository observation: the turn budget in Article 7 may count as one, in which case my reason for cutting that paragraph is weaker than stated.

### What should be done in the future
- Publish the article with a short glossary of the terms inherited from Articles 4, 5, 7 and 8; the fourteen-term list in the feedback is a ready starting point.

### Code review instructions
- File: `feedback.md`. Check that every quote appears verbatim in `article.md`, that all six required headings are present, and that all twelve sections have a score.

### Technical details
- Scores over twelve numbered sections 9.1–9.12: five at 5 (9.1, 9.2, 9.10, 9.11, 9.12), three at 4 (9.3, 9.7, 9.9), two at 3 (9.5, 9.6), two at 2 (9.4, 9.8). Sum 47, mean 3.92.

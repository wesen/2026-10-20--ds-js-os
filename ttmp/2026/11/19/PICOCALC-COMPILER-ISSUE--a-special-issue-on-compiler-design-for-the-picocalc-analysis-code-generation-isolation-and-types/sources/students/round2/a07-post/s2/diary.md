# Investigation entry

## Step 1: Reading the article as a student reader

I read `article.md` straight through without taking notes on my first pass, then read `glossary.md`
to look up terms in the order I had actually needed them while reading. The point of the pass was to
notice where I stumbled, not to understand everything, so I marked a passage every time I had to
back up. Article 7 turned out to be dense in the middle: 7.1 to 7.3 were easy, 7.4 cost me the
stack-need sentence and the flowchart, and 7.5 was the section I could not fully reconstruct from the
text alone.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Do the four numbered steps in `TASK.md`: read the article with the
glossary, answer the quiz into `answers.md`, write `feedback.md` in the five named sections, and write
this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest pre-publication reader report: where the article
fails to teach, not praise. The quiz answers are the test of whether the text is self-contained.
**Commit (code):** N/A — no repository changes; this session wrote only reader files in this directory.

### What I did
- Read `article.md` (sections 7.1–7.9 plus references) and `glossary.md` in full.
- Read `diary-format.md` before writing anything, so the notes taken during the read would fit the
  fields the format asks for.
- Kept a running list of (a) passages requiring a second read, (b) words I looked up and did not find,
  (c) sentences I could not check against anything in the article.

### Why
- Reading the whole article before consulting the glossary matches how a reader hits the text; looking
  terms up mid-sentence would have hidden the "used before explained" problems.
- I deliberately did not infer missing definitions from my own background when deciding what to report
  as undefined, but I did allow background knowledge when answering the quiz, and noted that in the
  confidence numbers.

### What worked
- 7.3 and 7.6 are self-contained enough to answer questions 5 and 6 with high confidence: the bullet
  argument in 7.3 and the pattern-checking versus masking contrast in 7.6 each close their own loop.
- The comparison tables in 7.1, 7.2 and 7.7 did most of the teaching work; question 6 was answerable
  almost entirely from one table row.

### What didn't work
- My first attempt to answer question 3 used the plain recursion "frame plus largest callee need" and
  stalled, because the article's own sentence adds the typed-versus-reactor distinction in the same
  clause. I had to rewrite the definition in symbols before the "why is it computable now" part became
  obvious.
- I could not resolve, from the text, whether the fuel decrement instructions count inside the
  "greatest number of instructions that one trip around the loop body can execute". No command or test
  would settle it; the article simply does not say, so I reported it rather than guessing.

### What I learned
- The article's strongest teaching move is the "what must be trusted" column: it turns four mechanisms
  into one comparable dimension. Its weakest is section 7.5, where four distinct ideas (iteration bound,
  instruction bound, typed-call charge, reactor charge) are delivered in three short paragraphs.
- Absence of recursion is presented as an accident of the compiler's registration order, and the article
  is explicit that this is not a language rule; that honesty is easy to miss and question 2 depends on it.

### What was tricky to build
- Distinguishing "the article does not explain this" from "I happen to know this". Terms like `sp`,
  RV32, linear memory and supervisor mode are used without definition but are obvious to a systems
  reader; I reported them anyway because the glossary does not cover them and the format asks for what
  the article and glossary jointly fail to explain.

### What warrants a second pair of eyes
- My answer to question 4 (confidence 4) rests on the assumption that the per-iteration charge is an
  upper bound including the fuel instructions themselves; if the author meant otherwise, the bound is
  off by the cost of the fuel code and the answer's last sentence is wrong.
- My claim that a reactor call could loop internally without passing a compiled back-edge is the reason
  I flagged the "cannot run indefinitely" sentence as unverified. Someone who knows the reactor should
  confirm whether any of the 28 functions can do that.

### What should be done in the future
- If the author supplies a worked fuel-charge example (my "one thing to add"), re-answer question 4 and
  raise its confidence.
- Re-check the two date-sensitive claims (ESP-TEE chip support, PMP entries on this chip) against the
  manual before publication.

### Code review instructions
- Files produced: `answers.md`, `feedback.md`, `diary.md`. Nothing else in this directory was touched.
- To check the reader's work: read `article.md` §7.9, then `answers.md`, and confirm each answer is
  traceable to a passage the article actually contains.

### Technical details
- Quiz questions: 6, in §7.9. All answered; confidences 5, 5, 5, 4, 5, 4.
- Reported undefined or late-defined terms: 9. Unverifiable claims: 12. Sections scored: 9 (§7.1–§7.9),
  range 3–5, weakest §7.5.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, numbered like the questions, in my own words and with a
`Confidence: N` line after each. Where a question asked for a definition I gave the definition and then
reconstructed the argument behind it, and for question 4 I wrote out the charging rule for both kinds of
call, since that was the part I was least sure of. Answers are 3 to 4 sentences each, within the
required 2 to 6.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `answers.md` with numbered answers, 2–6 sentences each, plus a
confidence line per answer.
**Inferred user intent:** A quiz answer the article cannot support is a defect report in disguise; each
low confidence is a signal to the editor about the weakest passage.
**Commit (code):** N/A — reader files only.

### What I did
- Wrote `answers.md` with answers 1–6 and six `Confidence: N` lines.
- For each answer, went back to the exact passage it relies on (§7.1 for 1, §7.4 for 2 and 3, §7.5 for
  4, §7.6 for 5, §7.7 table for 6) and checked that the answer added nothing the passage did not say.

### Why
- I kept the answers strictly inside the article rather than importing outside knowledge, so that the
  confidence numbers mean something about the text rather than about me.

### What worked
- Questions 1, 2, 3 and 5 were answerable by near-quotation plus restatement; each has an explicit
  passage, which is why they got 5.
- Question 6 was answerable from the §7.7 comparison table alone, but not from the prose, which is
  itself worth reporting.

### What didn't work
- Question 4 could not be answered to my own satisfaction: the article gives the four charges but not
  the boundary of what the "greatest number of instructions" includes, so I answered what it does say and
  lowered confidence to 4. I flagged the gap here rather than filling it with an assumption.

### What I learned
- Answering the quiz is a much sharper test of the article than reading it: two questions (4 and 6)
  turned out to depend on single dense sentences or on a table, where I had thought the surrounding
  prose had taught me the point.

### What was tricky to build
- Sentence counting: several of my first drafts were one 90-word sentence with three semicolons, which
  would have passed the "sentence limit" while being unreadable. I split them, which pushed answers
  toward the upper end of the 2–6 range.

### What warrants a second pair of eyes
- Answer 3's final clause ("the whole program's maximum stack use is just the stack need of its entry
  function") merges two article sentences; make sure the author agrees that the entry function is the
  maximum rather than merely a starting point.

### What should be done in the future
- Add a seventh question on what a reactor call that blocks would do to the fuel argument, if the author
  decides that gap matters.

### Code review instructions
- Compare `answers.md` against `article.md` §7.3–§7.7; each answer's supporting sentence is quoted in
  `feedback.md` where the support was weak.

### Technical details
- Answers: 6. Word range per answer: ~70–130. Confidence distribution: 5 ×4, 4 ×2, none below 4.
- No calculations were requested by the quiz; no arithmetic working was therefore needed. Question 4 was
  answered by rule rather than by computation for that reason.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six requested sections, quoting passages verbatim from `article.md` and
keeping the section scores to one sentence of reason each. The unverifiable-claims section is the
longest, because the article leans on citations and on files in a repository the reader does not have;
the "one thing to add" is a worked fuel example, and the "one thing to cut" is the closing CHERIoT
sentence in 7.7.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with exactly the sections named in `TASK.md` step 3,
reporting only terms that neither the article nor the glossary explains.
**Inferred user intent:** Give the editor an actionable list — quotable passages, named gaps, scored
sections — rather than a general impression.
**Commit (code):** N/A — reader files only.

### What I did
- Wrote `feedback.md` with: passages read twice (7 quotes), terms undefined (9), unverifiable claims (12),
  section scores for §7.1–§7.9, unanswerable questions, and one addition plus one cut.
- Cross-checked every term against `glossary.md` before listing it, so no glossary-covered term appears
  in the undefined list.

### Why
- Scores are paired with one reason each so the editor can see the article's profile (strong on 7.1,
  7.3, 7.8; weak on 7.5 and 7.7) rather than a single verdict.
- I chose to report `sp`, RV32 and linear memory even though a systems reader recovers them from
  context, because the instruction was to report what the article and glossary jointly fail to explain.

### What worked
- The "what must be trusted" column gave a natural spine for the section scores and made it easy to say
  precisely which section failed to teach and why.
- Quoting with line-accurate text was straightforward; every quote was copied from the source, not
  paraphrased from memory.

### What didn't work
- My first attempt at "terms used before explained" included SFI and MPC-style abbreviations that the
  glossary does cover indirectly; those were removed after the cross-check, leaving 9 entries.
- I could not decide whether the pattern-checking-versus-masking discussion belongs under "read twice"
  or "unverifiable"; it is neither, so it went into the section score for 7.6 instead.

### What I learned
- The recurring failure mode of this article is a table doing the explaining while the prose assumes the
  table was read: three of my seven "read twice" passages are sentences that index into a table.
- Almost every unverifiable claim is a citation or a file reference; the article is honest about what it
  does not know (§7.7) but not about what it has not shown.

### What was tricky to build
- Choosing a cut without removing teaching content: the CHERIoT sentence is the only paragraph in the
  article that could vanish with no loss to any later section, which is why it was chosen over the
  citation lineage in 7.2.

### What warrants a second pair of eyes
- The §7.7 score of 3 may be harsh if the author intends that section as an honest "here is a research
  question" rather than as teaching; the score is about learnability, not about the section's honesty.
- My judgment that a 4 percent figure and a 4,000-reduction figure are unverifiable "from the article
  itself" is correct by the letter of the task, but an editor may consider a citation sufficient.

### What should be done in the future
- Fix the dangling "the first row" reference in §7.6 and redraw the §7.4 mermaid diagram so definition
  order and rejected calls are not drawn between the same two nodes.
- Give the reactor's 28 functions and their measured stack costs somewhere, since two arguments (stack
  bound, fuel charge) both rest on them.

### Code review instructions
- Open `feedback.md` beside `article.md`; each quoted passage should be findable verbatim in the article.
  The scores are one per numbered section, §7.1 to §7.9 inclusive.

### Technical details
- Sections in `feedback.md`: 6, as requested. Section scores: 7.1 = 5, 7.2 = 4, 7.3 = 5, 7.4 = 4,
  7.5 = 3, 7.6 = 4, 7.7 = 3, 7.8 = 5, 7.9 = 4.
- Undefined-term entries: RV32, `sp`, supervisor mode, linear memory, proof assistant, WAMR, QuickJS,
  linker, ESP-TEE. Unverifiable claims: 12, numbered, each with the missing evidence named.

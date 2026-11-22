# Investigation entry — student read of Article 2

## Step 1: Reading the article and the glossary

I read `article.md` straight through once without stopping, then re-read it section by section with
`glossary.md` open beside it, looking up every term I did not already own: compositor, nucleus, turn,
engine, CJI, lowering, range, reactor. I noted which terms were missing from both places rather than
stopping to resolve them, and I re-derived every arithmetic claim in the article so that the quiz
answers could be shown with working.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Work through the four numbered steps of `TASK.md`: read the article with
the glossary, answer the quiz, write reader feedback, and write a work diary in the given format.
**Inferred user intent:** The editor wants an honest report of where the article fails to teach,
obtained by actually doing the reader's work rather than by skimming for typos.
**Commit (code):** none — no repository changes were made or requested.

### What I did
- Read `TASK.md`, then `article.md` (all nine sections plus references), then `glossary.md` in full.
- Read `diary-format.md` to get this format before writing anything.
- Checked the one asset the article references, `_assets/handheld-compile-phases.png`; it does not
  exist in this directory.
- Recomputed, on paper: 1.6 / (35.6 + 1.6); 1 / (1 − p); 293 + 81 + 32 + 123 + 30; 84 + 5 + 146;
  1,988 / 16,792 and the cycle conversion at 360 MHz; 8.0 / 16,792 × 66 and its cycles; the phase
  shares 8.0 / 48.7, 20.5 / 48.7, 20.2 / 48.7; 43,965 / 16,544; 85.9 / 1,480.

### Why
- The article's whole argument is numerical, so a reader who cannot redo the arithmetic cannot judge
  it. Recomputing is how I found which figures are derived and which are asserted.
- I looked terms up only in `glossary.md`, as an ordinary reader would, so that the "never explained"
  list reflects real reading and not my own background knowledge.

### What worked
- The arithmetic in sections 2.2, 2.3 and 2.4 checks out: 4.3 percent, 1.045, 559 ms total, 99.9
  percent frontend, 118 µs and roughly 42,000 cycles per token, 31 µs and roughly 11,000 cycles for
  tokenizing, 2.66× fewer instructions.
- Every quiz question turned out to be answerable from the text, which is unusual and worth saying.

### What didn't work
- `read _assets/handheld-compile-phases.png` returned
  `ENOENT: no such file or directory, access '.../s2/_assets/handheld-compile-phases.png'`. No
  recovery was possible inside this directory, so the figure's numbers go unverified and are recorded
  as such in `feedback.md`.
- I could not list the directory (reading `.` returned `EISDIR`), so I cannot say whether other
  supporting files exist.

### What I learned
- The article's central move is definitional, not experimental: a timing is only a timing once both
  end events are named. Nearly all my objections reduce to a missing endpoint or an unexplained
  denominator.
- Its own standard (section 2.6: at least ten runs, alternating order, median and range) is stricter
  than its own evidence (three boots, single traces). The article says this about itself, which is
  disarming but also means the reader must keep two registers going: what is measured and what is
  modelled.

### What was tricky to build
- Deciding whether "one key press is one turn" is stated or assumed. The glossary defines a turn as
  one event in one world, which makes multiple turns per key press at least as likely as one, so the
  4.3 percent share rests on an unstated premise. I resolved it by treating the passage as a stated
  model with an unstated premise, and saying so in both `answers.md` and `feedback.md`.

### What warrants a second pair of eyes
- My Question 6 answer depends on accepting the factor-66 scaling for the tokenizer. If the author
  intended 31 µs to be a measured figure, my confidence of 3 is too low; if it is extrapolated, the
  article should say so.
- Whether "store immediately followed by a load of the same slot, 34.1 percent" is a percentage of
  instructions or of stores changes how large the temporaries problem looks; my reading could be wrong.

### What should be done in the future
- The editor should either supply `_assets/handheld-compile-phases.png` or drop the reference, and
  should state the denominator of the 34.1 percent row.

### Code review instructions
- Check `answers.md` against section 2.9 questions 1–6 for one-to-one numbering and the six-sentence
  limit; check `feedback.md` for a quoted line under every heading except the scores.
- Validation is manual: grep the quoted passages in `feedback.md` against `article.md` to confirm each
  quote is verbatim.

### Technical details
- Recomputations used: 1.6/37.2 = 0.0430; 1/0.957 = 1.0449; 118 µs × 360 MHz ≈ 42,480 cycles;
  0.476 µs/token × 66 = 31.4 µs ≈ 11,300 cycles; 43,965/16,544 = 2.66; 85.9/1,480 = 5.8 percent.

## Step 2: Answering the six quiz questions

I answered `answers.md` from the article alone, numbering the answers like the questions, keeping each
to two to six sentences, and showing the arithmetic in Questions 2 and 6 and the row lookup in
Questions 1 and 3. Each answer carries a confidence line, and I set those deliberately rather than
uniformly.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `answers.md` with numbered answers, working shown where asked,
and a `Confidence: N` line from 1 to 5 under each.
**Inferred user intent:** Test whether the quiz is answerable from the text, and surface the questions
that only look answerable.
**Commit (code):** none.

### What I did
- Wrote `answers.md` with six numbered answers, arithmetic shown in Q2 and Q6, and a confidence line
  under each.
- Set confidence 5 for Q1–Q3, 4 for Q4–Q5 and 3 for Q6.

### Why
- Q1 is a pure table lookup with an explicit "does not include" column, and Q2's arithmetic is fully
  given, so those deserve 5. Q6 asks for a figure I could only obtain by accepting an unargued
  scaling factor, so 3 reflects that the number is restatable but not trustworthy.

### What worked
- All six were answerable; the article supplies both the numbers and the reasoning for Q2, Q3 and Q4
  in a form I could paraphrase without guessing.

### What didn't work
- Q5's second half ("what does that check not establish") is deferred by the article to Article 5, so
  part of my answer is inference rather than quotation. Not a failure of the article exactly, but it
  kept me from confidence 5.

### What I learned
- Writing the answers exposed which claims are load-bearing: three of six questions turn on the
  section 2.2 model, whose two inputs come from different applications and different builds — a
  weakness the article admits but which still carries most of the quiz.

### What was tricky to build
- Keeping to two to six sentences while showing working. I merged the derivation into prose in Q2
  rather than using displayed equations, which keeps the sentence count honest but makes the answer
  denser than I would write for myself.

### What warrants a second pair of eyes
- Q2's final clause, that the share is an upper limit because drawing time can only enlarge the
  denominator. A grader should confirm this is the intended reading and not merely the arithmetic
  reading.

### What should be done in the future
- If the article is revised, Question 6 should either say that the tokenizing figure is extrapolated
  or come with a device-side measurement.

### Code review instructions
- Read `answers.md` against the six questions; check that no answer exceeds six sentences and that
  every answer has a confidence line.

### Technical details
- Q2 working: p = 1.6/(35.6+1.6) = 0.0430; bound = 1/(1−p) = 1.045.
- Q6 working: 1,988/16,792 = 118 µs ≈ 42,480 cycles; 8.0/16,792 × 66 = 31.4 µs ≈ 11,300 cycles.

## Step 3: Writing the reader feedback

I then wrote `feedback.md` with the six required sections, quoting each passage I had to read twice
verbatim and pairing it with what specifically was unclear, separating terms that are never defined
from claims whose evidence is missing, and scoring each numbered section with a one-sentence reason.
I closed with one addition and one cut.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Write `feedback.md` in the six prescribed sections, honestly reporting
where the article fails to teach, using only what is in this directory.
**Inferred user intent:** Give the editor actionable, evidence-backed criticism rather than praise, so
the article can be repaired before publication.
**Commit (code):** none.

### What I did
- Wrote `feedback.md` with sections: Passages I had to read twice (8 quoted passages), Terms used
  before explained or never explained (10 lines), Claims I could not verify (11 quoted claims),
  Section scores (2.1–2.8), Questions the article did not let me answer, One thing to add and one
  thing to cut.
- Scored sections: 2.1 = 5, 2.2 = 3, 2.3 = 4, 2.4 = 3, 2.5 = 4, 2.6 = 4, 2.7 = 5, 2.8 = 4. Section
  2.9 is the quiz and is covered by the question section instead.
- Fixed a malformed first draft of item 3, which had begun with stray text before the quote.

### Why
- I scored 2.2 and 2.4 lowest because those are the two sections whose conclusions rest on inputs
  that are not derived in the text: a turn-per-key-press assumption, and a workstation-to-device
  scaling factor. The sections that scored 5 are the ones built from tables with both endpoints named.
- I separated "never explained" from "unverifiable" carefully, because a term I could look up is a
  different complaint from a number I cannot check.

### What worked
- Quoting exactly one or two sentences per passage kept the criticism concrete and lets the editor
  grep the quotes back into the article.

### What didn't work
- I could not verify the section 2.4 figure because the file is absent, so the image is recorded as
  unverifiable rather than as wrong. No recovery was possible without leaving this directory, which
  the task forbids.
- I found no way to check the two "same size as the device build" claims from the text; both remain
  open, and both are load-bearing for Experiments 1 and 3.

### What I learned
- The article's weakest points are denominators and endpoints, not prose. Almost every entry in the
  unverifiable list asks "out of what?" or "ending when?".
- Its honesty is also a trap for a reviewer: several criticisms I wanted to make are pre-admitted in
  section 2.6, so the useful criticism is not "you only ran three trials" but "you state a 340 ms
  figure that three trials cannot support".

### What was tricky to build
- Choosing the one thing to add and the one to cut. The article is dense and nearly every paragraph
  earns its place; I picked the timeline figure because it would repair the most passages at once, and
  the second boot's fine decomposition because it is the only paragraph whose endpoint is unstated and
  whose conclusion nobody uses.

### What warrants a second pair of eyes
- My "one thing to cut" is partly defended on the ground that the 146 ms of "other messages" is left
  unexplained; if the author intends to open that up in a later article, the section should stay and
  the sentence should be fixed instead.
- The claim that "a compiler improvement could not have found those 340 ms" is criticised as an
  inference. A grader may read the boot profile as sufficient evidence, in which case my criticism is
  too strong.

### What should be done in the future
- Restore or remove the missing figure; state the source of the 360 MHz clock and of the 8.8 ms per
  turn; give the diary entry behind the 30,840-byte comparison; report a median and a range for the
  three-boot scheduler comparison.

### Code review instructions
- Cross-check every quotation in `feedback.md` against `article.md` for verbatim accuracy.
- Confirm each scored section 2.1–2.8 appears exactly once and that each score has one sentence of
  reason, and that no term listed under "never explained" is in fact defined in `glossary.md`.

### Technical details
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. Files read: `TASK.md`,
  `article.md`, `glossary.md`, `diary-format.md`. Files missing: `_assets/handheld-compile-phases.png`.

# Diary

## Step 1: Pre-test answers

Read `TASK.md`, then `pretest.md`, and answered all fourteen questions from prior knowledge before touching the brief, recording a confidence score on each.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md's four steps in order: pre-test answers, read the brief, write reactions, write this diary.
**Inferred user intent:** The editor wants an untainted baseline of what a student reader knows, to calibrate the teaching series against it.
**Commit (code):** N/A — documents only.

### What I did
- Read `pretest.md` (14 questions), wrote `pretest-answers.md` with 2–4 sentence answers and `Confidence: N` on each.
- Also read `diary-format.md` early, to know what the last step had to produce.

### Why
- The pre-test is only useful if it is written before the brief; reading the format file first does not leak any subject matter, so the ordering was safe.

### What worked
- Confidence ratings spread from 3 to 5; items 3, 4, 13 were solid, items 1, 2, 5, 7, 9, 11, 14 were shaky guesses.

### What didn't work
- No failures observed.

### What I learned
- My weakest pre-test areas were fixpoint/widening mechanics and stack-machine-to-register translation, which is exactly where the brief is densest.

### What was tricky to build
- Keeping answers honest: the temptation is to write the "textbook" answer and claim confidence 4. Recording 3 where I was reconstructing from neighbouring knowledge was deliberate.

### What warrants a second pair of eyes
- Whether a reader's pre-test answers should be graded/compared against the brief by the editor, or just filed.

### What should be done in the future
- N/A.

### Code review instructions
- Read `pretest-answers.md`; check that no answer shows knowledge only present in `dense-brief.md` (in particular the terms "fuel", "arena per turn", "defunctionalized continuation" were used only at the level of the definitions I already had).

### Technical details
- Format: question number, prose answer, `Confidence: N` (1–5). No web access, no files other than the pretest were read before writing.

## Step 2: Reading the brief

Read `dense-brief.md` once, straight through, marking every term and every claim I could not follow.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Step 2 of the task, now permitted since the pre-test is written.
**Inferred user intent:** Get a first-read inventory of comprehension gaps while the reaction is fresh.
**Commit (code):** N/A.

### What I did
- Read the whole brief in one pass; noted 46 terms, 20 claims, and per-section impressions as I went.

### Why
- A second, annotated pass would have produced tidier notes but less honest ones — the first read is where the confusion actually is.

### What worked
- Sections "Code generation" and "Isolation" read as arguments with a cause and an effect; I could restate both.

### What didn't work
- The section "Why one compiler is slow and the other fast" resisted comprehension: four historical systems (Self, RPython, Shed Skin, Static TypeScript) and four named analyses, and the load-bearing sentence is an assertion with no measurement behind it.

### What I learned
- The brief's difficulty is not vocabulary density per se; it is that several sentences rely on prior knowledge of one specific codebase (tickets, reactor, WorldState, the three hand-written lists) that the brief never describes.

### What was tricky to build
- Distinguishing "term I cannot explain" from "claim I cannot follow". Some items are both (e.g. "ABCD", "the WorldState token fields"). I filed a term under terms and, where the *reasoning* was also missing, quoted the whole sentence under claims.

### What warrants a second pair of eyes
- My reading of "no latency in the tickets reaches the LCD" may be wrong; the editor should confirm whether "tickets" here means issue tickets, instrumentation records, or OS message objects.

### What should be done in the future
- The brief needs a one-paragraph glossary of project-local nouns (turn, ticket, reactor, slot, WorldState) before any of it lands in print.

### Code review instructions
- Compare my 46 terms against the brief; any term listed twice, or listed but obviously defined in the text, should be struck.

### Technical details
- 7 `##` sections; 20 quoted claims; scores assigned 2–4 with none at 1 or 5.

## Step 3: Reactions file

Wrote `brief-reactions.md` in the six required sections, then this diary.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Step 3 of the task: the six-section reaction document.
**Inferred user intent:** Give the editor an actionable gap list: what to define, what to argue, what to draw, and in what order to teach it.
**Commit (code):** N/A.

### What I did
- `brief-reactions.md` with: Terms I could not explain (46, quoted in context); Claims I could not follow (20, each with what is missing); Clarity by section (7 scores, 3/2/4/4/4/2/3); Questions (18); A teaching order (8 lessons); What example would help most (3 worked examples plus one honourable mention).
- `diary.md` (this file).

### Why
- I ordered the claims by where they appear in the brief rather than by severity, so the editor can read them beside the source. The teaching order is not the brief's order: the brief starts with conclusions ("what I would do next") and I would start with the device.

### What worked
- The three requested examples converged on one theme: the brief states ratios and shapes but never shows an artefact (a compile log, a basic block, an `await` frame).

### What didn't work
- No failures observed. One limitation: without the codebase I could not check any of the brief's numbers, so all my doubt is about framing, none about measurement.

### What I learned
- The strongest section of the brief (Isolation) is strong because it is a chain of implications; the weakest (Type system directions) is weak because it is a list. That is probably the rule for the whole series: every lesson should be a chain, not a list.

### What was tricky to build
- Keeping "Questions I would ask the author" from collapsing into "Terms I could not explain" restated as questions. I tried to make each question ask for a decision, a number, or a missing invariant.

### What warrants a second pair of eyes
- Whether 46 terms is a fair count or an over-count — some are ordinary CS words (user mode, liveness analysis) that a reader "should" know. I listed them anyway, because the task says to list every term I could not explain to a classmate, and that is the honest threshold.

### What should be done in the future
- If there are other readers, diff their term lists: terms only I flagged are a sign of my own gaps, terms all readers flagged are a sign of the brief's gaps.

### Code review instructions
- Read `brief-reactions.md` top to bottom; spot-check five of the 20 quoted claims against `dense-brief.md` for exact wording.

### Technical details
- Every quoted claim is verbatim from `dense-brief.md`; section scores use the task's 1–5 scale (1 = lost, 5 = clear) and none reached 5.

# Work diary — student read of Article 7

## Step 1: Read the article, the glossary and the diary format

I read `TASK.md` first, then `article.md` from start to finish in one pass without stopping to look anything up, then `glossary.md` and `diary-format.md`. The intent was to get the honest experience of a first reader — where I stumble on the first pass is what the editor needs to know — before I started checking definitions.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered steps of `TASK.md`: read the article with the glossary, answer the six quiz questions into `answers.md`, write `feedback.md` in the six required sections, and write this diary.
**Inferred user intent:** The editor wants a pre-publication teaching review from a reader's point of view: where the article fails to explain, not what the article gets wrong technically.
**Commit (code):** N/A — this directory is not a git repository I was asked to commit to.

### What I did
- Read `TASK.md`, `article.md`, `glossary.md`, `diary-format.md` in full.
- Noted during the first pass: the 7.4 flowchart, the "larger amount" paragraph in 7.5, and the two "last row" references in 7.6/7.7.
- Second pass: checked every unusual term against `glossary.md`.

### Why
- Reading the article once before the glossary keeps the first-pass experience authentic; a reader does not stop mid-section to look up a term he has not yet noticed is undefined.

### What worked
- The article's three tables in 7.1 and the trust-comparison tables in 7.6/7.7 carried most of the argument for me; on a re-read I could reconstruct a section from its table alone.

### What didn't work
- No failures of tooling. The one reading failure was mine: I took the solid arrows of the 7.4 mermaid figure to be calls on the first pass and had to discard that reading; the caption says otherwise.

### What I learned
- The article's own strength (dense tables) is also the source of its cost: two of the places I read twice are positional references to rows of those tables.

### What was tricky to build
- Distinguishing terms the *article* postpones (machine mode, which is explained two sentences after its first use) from terms the *glossary* covers. I kept only the latter-outcome cases: neither explained here nor in the glossary.

### What warrants a second pair of eyes
- My classification of "RV32", "sp", "linear memory", "capabilities", "flash error" as undefined. A subject-matter reader may hold that some are unavoidable background for this audience.

### What should be done in the future
- A worked example for 7.4–7.5 (see `feedback.md`, "One thing to add").

### Code review instructions
- Compare `feedback.md` "Terms used before they were explained" against `glossary.md` entries to confirm nothing listed is already in the glossary under another name.

### Technical details
- Files read: `TASK.md`, `article.md` (9 sections, 7.1–7.9, plus references), `glossary.md` (6 term groups), `diary-format.md`.

## Step 2: Answer the six quiz questions

I answered the quiz from the article alone, in my own words, marking confidence honestly after each answer. Where a question asked for a definition or a charging rule I quoted the article's terms of art rather than paraphrasing them away, so the editor can see whether my reading matches the intended one.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer questions 1–6 of 7.9 into `answers.md`, two to six sentences each, numbered, each followed by `Confidence: N`.
**Inferred user intent:** Check that the text actually supports the quiz, and surface questions the text does not support.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six answers.
- In Q4 I wrote out the charging walk explicitly: longer branch of an `if`, plus the callee's straight-line cost, inner loops charged by their own back-edges, reactor calls charged at worst case for the arguments.
- In Q5 I gave both halves — why masking still holds and why pattern checking accepts.

### Why
- Q4 is the only question with a procedure in it; showing the walk is the only way to demonstrate I understood it rather than recognised the words.

### What worked
- Q2, Q3, Q5 were fully supported by single paragraphs; I was certain about them (confidence 4–5).

### What didn't work
- Q1: I could answer the "which property" half and the general shape of "contract, not a wall", but not the mechanism by which the loader limits calls, because the article never says. I marked it confidence 4 but flagged the gap in `feedback.md`.

### What I learned
- Question 3's definition is recursive and the article's single sentence is easy to half-read; writing it out is what caught the "largest" and the typed-vs-reactor distinction.

### What was tricky to build
- Q4's answer needs the *reason* the total is an upper bound (each charge bounds its own iteration), which the article states as one subordinate clause. I had to supply that reasoning myself and I could not tell whether my version matches the author's.

### What warrants a second pair of eyes
- Q4 and Q6 answers: whether "cost per memory access: none with pattern checking" and "2 instructions with masking" are the intended full comparison, since masking also has a per-access cost at load time for the length checks.

### What should be done in the future
- If the editor wants Q1 answerable, add one sentence in 7.1 naming the loader's mechanism.

### Code review instructions
- Read `answers.md` against 7.4–7.6 of `article.md`; each answer cites its section.

### Technical details
- Output: `answers.md`, six sections, confidence values 4, 5, 4, 4, 5, 4.

## Step 3: Write the feedback

I wrote `feedback.md` in the six required sections, quoting passages rather than paraphrasing them so the editor can find them, and scoring each numbered section from 1 to 5 with one sentence of reason.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `feedback.md` with exactly the six headings the task lists, honest about where teaching failed.
**Inferred user intent:** Actionable, locatable criticism — quotes plus a diagnosis, not a general impression.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md`: 5 double-read passages, 11 undefined terms, 9 unverifiable claims, scores for 7.1–7.9, the questions the text could not support (Q1 mainly), and one addition plus one cut.

### Why
- I kept the "claims I could not verify" section to claims the *article itself* would have to supply evidence for; citations to published papers I did not attempt to check, since I was told not to use the web and the article is the object under review.

### What worked
- The scoring exercise made the pattern obvious: the article scores best where it presents a table and worst where it chains four cases into one sentence (7.5) or uses positional references (7.6, 7.7).

### What didn't work
- I could not verify "about twenty instructions" or "28 reactor functions" because both are delegated to Articles 5 and 10; I recorded that as an editorial cost of the series format rather than a defect, but it blocked two verifications.

### What I learned
- The hardest thing to review is a section that is *correct but dense* (7.5). There is nothing to quote as wrong, so the criticism has to be about ordering and worked examples, which is a weaker kind of report.

### What was tricky to build
- "One thing to cut" forced a real choice; I chose the tail of 7.7 because it is the only place where two paragraphs could go without removing an argument the quiz depends on.

### What warrants a second pair of eyes
- My low score for 7.7 (3) rests partly on my not knowing the RISC-V privilege levels beforehand; an embedded reader may find it a 4.

### What should be done in the future
- Add `RV32`, `sp`, `bounds check`, `linear memory` and `capability` to `glossary.md`.

### Code review instructions
- Validate each quote in `feedback.md` by searching `article.md` for its opening words; all quotes were copied verbatim from the source.

### Technical details
- Output: `feedback.md`. Scores: 7.1 = 4, 7.2 = 4, 7.3 = 4, 7.4 = 3, 7.5 = 3, 7.6 = 3, 7.7 = 3, 7.8 = 4, 7.9 = 4.

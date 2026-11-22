# Work diary: student read of "6. When to Compile"

## Step 1: Reading the article from start to finish

I read `TASK.md` first to fix the order of work, then read `article.md` straight through once without taking notes, then a second time section by section while jotting the numbers that the later arithmetic would depend on. The article is one chapter of a larger series, so a large part of the reading was distinguishing what this chapter establishes from what it borrows from Articles 1–5.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Perform the four numbered steps of `TASK.md` in this directory, finishing with the single line `DONE`.
**Inferred user intent:** The editor wants a genuine naive-reader test of the chapter before publication, including an honest account of where it fails to teach.
**Commit (code):** N/A — this session produced no code changes.

### What I did
- Read `TASK.md`, `article.md` and `diary-format.md`.
- Re-read `article.md` a second time, tracking every quantitative claim: compile times (1.99 s WebAssembly, 3.14 s native, 3.1 s source-only boot), memory (1.5 MB / 2.5 MB compile peaks, 528 KiB / 710 KiB / 768 KiB world figures), size (88 kB / 240 kB / 71 kB, 4.76 bytes per function-body byte), CJI timings (7,028 ms cold, ~1,450 ms reuse, 7,047 ms rebuild, 140.6 s for Files), and the break-even inputs (1.15 s, 7.2 ms).
- Cross-checked each quiz question against the section it points at before writing anything.

### Why
- I read twice because the first pass was needed to see the shape of the argument (six designs ordered by *when* the work happens), and the arithmetic cannot be checked without the numbers, which are spread across sections 6.1, 6.2, 6.4, 6.5 and 6.6.
- I resolved the terms from Article 1 (reactor, engine, turn) as "used, not defined here" instead of guessing, since my job is to report that gap rather than paper over it.

### What worked
- The three tables in 6.1, 6.3 and 6.4 carried most of the teaching load; re-reading them against the prose caught the one arithmetic inconsistency I report (58 percent of 3.14 s versus the table's "about 1.2 s").
- The mermaid flowchart in 6.8 made the combined design easy to restate, and it confirmed the naming inconsistency "import table" versus "the table of functions the reactor offers".

### What didn't work
- My first read of section 6.4 left me thinking the 240 kB / 88 kB module ratio contradicted the 4.76 figure; I only resolved it on the second pass by noticing "function body". I could not resolve the 58 percent figure at all, with any reading: 58 percent of 3.14 s leaves ~1.32 s, and the text says ~1.2 s. Recovery: I recorded both candidate readings in `feedback.md` rather than picking one.
- I could not find any file in the directory listing other than the three I was given, and there is no listing tool available, so I worked from the named files only.

### What I learned
- The chapter's real spine is not "four moments" but "the cache key must cover five inputs"; almost everything later (determinism, firmware identity, per-function grain) is a consequence of that one table.
- A chapter in a numbered series can be locally clear and still be unreadable standalone: several load-bearing terms are simply inherited.

### What was tricky to build
- The hardest part was keeping my answers *inside* the article. For question 4 the tempting answer is a general judgement about slim binaries; the article only supports Franz and Kistler's own framing, so I wrote their framing and marked the confidence down.
- The other trap was question 2: the article's stated guarantee is about the *record*, not the *module*, and the two-slot detail from earlier in the same section undercuts it. Writing the answer required separating what the article claims from what it has established, which is why that answer carries `Confidence: 3`.

### What warrants a second pair of eyes
- Whether the 58 percent frontend figure is measured against the native or the WebAssembly build; if the article's author meant the WebAssembly build, the table row is right and the prose is right, and my feedback is wrong.
- Whether writes alternate between the two CJI slots. If they do not, the power-loss guarantee in 6.3 is stronger than the implementation allows, which is a correctness claim about a shipped subsystem, not just prose.

### What should be done in the future
- Add the per-phase compile-time table suggested in `feedback.md`; it would let every numeric claim in 6.4 and 6.5 (the 58 percent, the under-20 ms per function) be checked by a reader in one place.
- Either define reactor, engine, turn, CJI and lowering in a glossary at the top of the article or state plainly that the chapter assumes Article 1 has been read.

### Code review instructions
- Nothing to run. Files to inspect: `answers.md` (six answers, each with a `Confidence:` line), `feedback.md` (six required sections), `diary.md` (this file).
- To check my arithmetic: `1.15 / 0.0072 = 159.7` and `140.6 / 0.001 = 140,600`.

### Technical details
- Break-even Editor: 3.14 s − 1.99 s = 1.15 s extra; 8.8 ms − 1.6 ms = 7.2 ms saved per turn; 1,150/7.2 ≈ 160 turns.
- Memory headroom if Editor goes native: 768 KiB − 710 KiB = 58 KiB.
- Per-function average from the article's own numbers: ~2,000 ms / 120 ≈ 16.7 ms.
- References cited but not summarised here: Cooper & Torczon 2023, Mokhov et al. 2018, Franz & Kistler 1997, Franz 1994, Haas et al. 2017, Dunkels et al. 2006, Levis & Culler 2002, Deutsch & Schiffman 1984.

## Step 2: Answering the quiz

I wrote `answers.md` with one answer per question, numbered as in section 6.10, each two to six sentences and each closed by a `Confidence:` line. Where the question asked for a calculation I showed the subtraction and the division before stating the result.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Step 2 of `TASK.md`: answer the "Check your understanding" questions in my own words, numbering them like the questions, two to six sentences each, with a confidence rating 1–5.
**Inferred user intent:** Test whether the text actually enables a reader to answer, and expose questions that need information the chapter does not give.
**Commit (code):** N/A.

### What I did
- Wrote six answers to `answers.md`, in question order, each ending with `Confidence: N`.
- Showed the arithmetic in answers 3 (1,150 ms / 7.2 ms ≈ 159.7), 5 (768 − 710 = 58 KiB) and 6 (~2,000 ms / 120 ≈ 16.7 ms).

### Why
- I kept the arithmetic explicit because two of the questions ask for a computed number and the TASK requires working to be shown.
- I recorded a lower confidence (3) only for question 2, where my answer reproduces the article's claim while privately doubting it; a 5 there would have been dishonest.

### What worked
- Questions 1, 3, 5 and 6 mapped cleanly onto single passages, which let me answer in the article's own terms and still stay within the sentence limit.
- Question 4 was answerable once I separated portability (the motivation) from the speed quotation (the mitigation).

### What didn't work
- Question 1 and question 6 are near-verbatim restatements of sentences in 6.3, so my answers inevitably echo the text; I added the CJI firmware-identity example to question 1 to make the answer mine rather than a quotation.

### What I learned
- The quiz is honest about the article's own priorities: it never asks about Maté or Moddable, which suggests the author knows those are decoration.

### What was tricky to build
- Sentence limits. Several answers wanted a fifth clause about a figure I could not verify (the 0.01 s load time, the one-millisecond call assumption); I moved those doubts into `feedback.md` instead of inflating the answers.

### What warrants a second pair of eyes
- Answer 5 uses 710 KiB against a 768 KiB limit to derive "about 58 KiB headroom"; the article never says the limit is a hard cap that would fail, only that native is "close to it". If the limit is soft or per-arena, my headroom figure is meaningless.

### What should be done in the future
- Author's follow-up: state whether the 768 KiB world limit is a hard failure threshold; that single sentence would make question 5 a stronger question.

### Code review instructions
- Read `answers.md` top to bottom; each `Confidence:` line should be justified by the prose above it. Verify 1,150/7.2 ≈ 160.

### Technical details
- Answers rely only on sections 6.1–6.9 and the references list; no external reading was performed.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections, quoting passages rather than paraphrasing them so the editor can find each one. The section scores are my honest reaction section by section, and the closing pair names one addition (a per-phase compile-time table) and one cut (the Maté paragraph).

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Step 3 of `TASK.md`: produce `feedback.md` with the six named sections, quoting passages and scoring each numbered section 1–5.
**Inferred user intent:** Give the editor actionable, located criticism rather than a general impression.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with all six required sections in the required order.
- Quoted five passages in the first section, listed thirteen undefined-or-late terms, and quoted seven claims I could not verify.
- Scored all ten numbered sections (6.1–6.10) with one sentence of reason each.

### Why
- I quoted exact sentences so each complaint is checkable against the text without searching.
- I put the 58 percent discrepancy in both the "read twice" list and the "could not verify" list, because it is both a comprehension stumble and an unsupported number.

### What worked
- The section scores came out visibly uneven (5s in 6.1, 6.8, 6.9; 3s in 6.4, 6.6, 6.7), which matches my experience: the chapter is strongest when tabulating and weakest when reasoning by analogy.

### What didn't work
- I could not check any of the external references (Franz & Kistler, Mokhov et al., Cooper & Torczon, Haas et al., Dunkels et al., Levis & Culler, Deutsch & Schiffman), because the task forbids using the web. Every quotation attributed to a paper is therefore unverified by me; I did not list those as failures of the article since the article does cite them properly.

### What I learned
- Most of my difficulties came from one root cause: numbers that are consistent only if you already know which measurement they belong to. Fixing that would raise 6.4 and 6.6 without adding a sentence of new argument.

### What was tricky to build
- Choosing the single cut. The Maté paragraph, the Moddable/MicroPython tour and the trace-vocabulary paragraph all compete; I kept Maté as the cut because it is the one place where the conclusion plainly does not follow from the evidence quoted.

### What warrants a second pair of eyes
- My score of 3 for 6.7 rests on the prelude example being under-used; an editor who knows the reader has the Moddable documentation open might reasonably score it 4.

### What should be done in the future
- After the per-phase table is added, re-run this quiz and see whether question 4 can be answered with confidence 5 rather than 4.

### Code review instructions
- Check that `feedback.md` contains exactly the six required headings, that every quoted passage appears in `article.md` verbatim, and that the ten section scores correspond to sections 6.1–6.10.

### Technical details
- Score summary: 6.1 = 5, 6.2 = 4, 6.3 = 4, 6.4 = 3, 6.5 = 4, 6.6 = 3, 6.7 = 3, 6.8 = 5, 6.9 = 5, 6.10 = 4.
- Deliverables in this directory: `answers.md`, `feedback.md`, `diary.md`.

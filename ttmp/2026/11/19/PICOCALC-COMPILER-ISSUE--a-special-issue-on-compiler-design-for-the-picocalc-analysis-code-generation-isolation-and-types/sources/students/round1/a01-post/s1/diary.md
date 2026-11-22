# Investigation entry

## Step 1: Reading the article

I read `TASK.md` first to get the order of work, then read `article.md` straight through once without notes, and a second time with the tables and diagrams in view. The article is Section 1 of a special issue: it defines the PicoCalc device, the six operating-system terms, and the two compilers, then walks one function (`countUnit`) through both pipelines.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Act as a student reader: read the article, answer its quiz, write feedback and a diary, then reply "DONE".
**Inferred user intent:** Find out whether the article teaches what it claims to teach, from the position of a reader who does not already know the system.
**Commit (code):** none — reading and writing only, no code in this directory.

### What I did
- Read `TASK.md`, `article.md` and `diary-format.md`.
- Kept a running list of terms and numbers that were not anchored anywhere in the text.

### Why
- The task asks for evidence about where teaching fails, so I needed to notice my own confusion at first reading rather than after a second pass smoothed it over.

### What worked
- Reading the six-term table before the compiler section made 1.3 and 1.4 readable: "turn", "engine", "world" and "reactor" were all needed later.
- The `countUnit` example carries 1.4 well; I could follow the typed path line by line.

### What didn't work
- No failures of tooling. The only recurring problem was vocabulary: ELF, PSRAM, "linear memory", "lowering", "compressed instructions" and the 768 KiB limit all arrived without a definition, so I marked them and moved on.

### What I learned
- The article is dense but ordered; my confusion clustered in the tables, not in the prose.

### What was tricky to build
- N/A (no code).

### What warrants a second pair of eyes
- Whether "compressed instructions" is intended as the RISC-V C extension; if so it needs one clause.
- Whether the 768 KiB world limit is meant to be introduced earlier; as written it appears first in a table.

### What should be done in the future
- Define the memory limit and the expansion from WebAssembly to RV32 before the cost table in 1.5.

### Code review instructions
- Check `feedback.md` against `article.md` section by section; no commands to run.

### Technical details
- Article sections reviewed: 1.1–1.7. Files written: `answers.md`, `feedback.md`, `diary.md`.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, two to six sentences each, with a `Confidence:` line after each. Where a question asked for a description of a path (question 5) or a comparison (questions 4 and 6) I wrote the steps or the arithmetic out.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer the "Check your understanding" questions in my own words and rate my confidence.
**Inferred user intent:** Test whether the article is sufficient to answer its own quiz.
**Commit (code):** none.

### What I did
- Wrote `answers.md` with six numbered answers and confidence ratings of 5, 5, 4, 3, 5, 5.
- Checked the article's ratios: 290.6 / 52.9 = 5.49 ("5.5 times"), 240,452 / 88,255 = 2.72 ("nearly three times"), 768 − 710 = 58 KiB free.

### Why
- The arithmetic was cheap to verify and lets me separate "the article's numbers are consistent" from "the article explained its numbers".

### What worked
- Questions 1, 2, 5 and 6 are answerable directly from named sentences in the text; I could point at the sentence for each.
- Question 3 is answerable from the middle of 1.4, which names the three facts CJI needs.

### What didn't work
- Question 4 is not answerable as asked. The article gives the sizes but no cause; I had to infer the cause from the 77 bytes → 103 instructions example in 1.4 and say so in the answer. Confidence lowered to 3.
- Question 1 is answerable but only by repeating the text's phrasing; nothing shows what saving progress looks like.

### What I learned
- A quiz question can fail not because the section is missing but because the article asserts a number without a mechanism.

### What was tricky to build
- Deciding whether to answer question 4 with the inference or to refuse. I answered with the inference and flagged it, which seemed more useful to an editor than a blank.

### What warrants a second pair of eyes
- Whether the inferred cause of the native size increase is the one the author had in mind.

### What should be done in the future
- Add one sentence in 1.5 naming the cause, or delete question 4.

### Code review instructions
- Compare each answer in `answers.md` with the paragraph it cites in `article.md`.

### Technical details
- Ratios recomputed by hand: 5.49×, 2.72×, 58 KiB of headroom.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six requested sections. The hardest part was the "Claims I could not verify" section, because the article is mainly a summary of measurements, so almost every number is unverifiable from the text alone; I tried to keep only the ones where the missing step actually matters to a reader.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Give structured, honest criticism of where the article fails to teach.
**Inferred user intent:** Pre-publication review the author can act on.
**Commit (code):** none.

### What I did
- Quoted five passages I read twice, listed nine unexplained terms, quoted nine unverifiable claims, scored all seven sections, identified which quiz questions failed, and named one addition and one cut.
- Wrote this diary in the `diary-format.md` layout with three steps.

### Why
- Section scores are more useful with a reason each, so I kept the reasons to one sentence to stay readable.

### What worked
- The section scores clustered at 4 for definitions and at 3 for the two sections that carry measurements (1.3 and 1.5), which matches where my confusion actually was.

### What didn't work
- "Terms never explained" overlapped with "passages I read twice"; I kept a term in only one list unless the passage was unclear for a different reason.

### What I learned
- The article's weak point is not its prose but its unlabelled assumptions: an undeclared world memory limit and an unexplained size difference.

### What was tricky to build
- Judging question 4 honestly: the text contains a hint, so "could not answer" is too strong and "answered" is too generous. I recorded it as answerable only by inference.

### What warrants a second pair of eyes
- Whether the Files/Agenda rows should be cut, or instead prefaced with their caveat. Cutting loses scale; prefacing keeps it.
- Whether "reactor" is a term the reader will meet again in later articles (the article says it is), which would justify keeping the odd name.

### What should be done in the future
- Give the world memory limit (768 KiB) and its origin in 1.2 or early 1.5.
- Add one sentence explaining why native code is larger than WebAssembly.
- Move the incomparability caveat above the timing table in 1.3.

### Code review instructions
- Read `feedback.md` alongside `article.md` 1.3 and 1.5 first; those two sections carry all the substantive objections.

### Technical details
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. Nothing else in the directory was modified.

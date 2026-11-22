# Investigation entry

## Step 1: Reading the article and the glossary

I read `TASK.md`, then `article.md` from start to finish, then `glossary.md` in full, then `diary-format.md`. I read the article first so that my first pass would be as a reader rather than as someone already holding the definitions, and only afterwards checked which terms the glossary actually covers. I kept a running list of places where I stopped, and of the numbers I could re-derive.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered instructions in `TASK.md`: read the article and glossary, answer the quiz into `answers.md`, write `feedback.md` in the six required sections, write this diary, then reply with one line.
**Inferred user intent:** The editor wants an honest teaching-quality report on a draft article before publication, not a summary of it, and wants the report structured so it can be acted on section by section.
**Commit (code):** none — no commit was made and no code was run.

### What I did
- Read `TASK.md`, `article.md` (531 lines, sections 10.1–10.9 plus references), `glossary.md`, `diary-format.md`.
- Checked the article's arithmetic by hand: Editor 1,730/316 = 5.47; Agenda (468 + 869)/307 = 4.36; screen bytes 17 × 49 = 833 code units, × 2 = 1,666 bytes, plus 17 × 4 = 68 bytes of row header = 1,734 bytes.
- Cross-checked every term in the article against the glossary, noting which of the article's terms have no entry and no in-text definition.

### Why
- Reading the whole article before the glossary is the only way to notice which terms the article uses *before* defining them; reading the glossary first would have masked exactly the defects the task asks me to find.

### What worked
- The glossarial check was decisive: most terms (*world*, *nucleus*, *engine*, *reactor*, *slot*, *trampoline*, *fuel*, *verifier*, *PMP*, *arena*, *typestate*) are covered, so the feedback could stay short and name only the genuinely missing ones (*JSON*, *ELF*, *driver*, *capability*, *garbage collector*, *mutation testing*, *interactive console*, the device itself).
- All three headline multiplications in 10.1 and the byte total in 10.3 reproduce exactly; that let me separate "I could not verify" (the *inputs*, such as 17 rows or six bytes per unit) from "I could not check the arithmetic" (which I could).

### What didn't work
- I initially treated "the device" as something defined elsewhere in the issue and did not flag it; on a second look the article never names the machine, its flash size or its RAM, which is what makes its cost claims unweighable. I added it to the feedback as an undefined term rather than leaving it out.
- I could not check any cross-article figure (593, 1,529, 71 state fields, 14 ms) because Articles 2, 5, 6, 7, 8 are not in this directory. Per the task I recorded them as unverifiable rather than guessing.

### What I learned
- The article is unusually disciplined about conditionals ("could be removed when", "If it fails"), which makes the parts that *are* assertions stand out: "Each was a reasonable step", "the main argument", "the clearest decision is".
- The weakest spot is not any single paragraph but the seam between 10.2 and 10.8: "generates ... the C prototypes" against "should generate all three".

### What was tricky to build
- Nothing was built. The difficult judgement was scale: the task asks for "one line each" in the terms section and a score with one sentence of reason per section, and it was tempting to over-write both, which would have made the report useless to an editor.

### What warrants a second pair of eyes
- Whether my complaint that the device is never described is fair, or whether the series' earlier articles establish it and a reader of the whole issue would have it. A reader who has only this article in front of them does not.
- My reading of the 10.2/10.8 tension: an author might say the C file always stays hand-written and 10.8's "all three" loosely includes "the list of prototypes". If so, the sentence in 10.2 is right and the summary in 10.8 is the one to fix.

### What should be done in the future
- If the article is revised, re-run this reader test against the revised text and check specifically whether questions 1 and 6 have become unambiguous.

### Code review instructions
- Start with `answers.md` (six answers with `Confidence:` lines), then `feedback.md` (six required sections plus section scores). No commands are needed; the arithmetic checks are reproducible by hand from the tables in 10.1 and 10.3.

### Technical details
- Files read: `TASK.md`, `article.md`, `glossary.md`, `diary-format.md`.
- Files written: `answers.md`, `feedback.md`, `diary.md`.
- No tests exist in this directory and none were run.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, numbered as in 10.9, two to six sentences each, in my own words, and showed the working wherever a question involved a calculation or a rewrite. Each answer ends with a `Confidence:` line from 1 to 5.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce a self-contained answer file that a reader could compare against the article, with explicit confidence for each answer.
**Inferred user intent:** The editor wants to know not only whether the questions can be answered but how securely, so that a high-confidence wrong answer points at a teaching error rather than at a careless reader.
**Commit (code):** none.

### What I did
- Wrote six answers to `answers.md`, each with a `Confidence: N` line.
- Reproduced the two rewrite rows for question 3 verbatim in meaning (`(a + b) | 0`, `Math.imul(a, b)`) and added division, `charCodeAt` and `record` as confirming cases.
- Justified question 5 with the section 10.1 figures rather than with the article's assertion: 1,730 vs 316 (5.5) and 468 + 869 vs 307 (4.4), times twelve remaining ports.
- Gave question 6 a first choice (the cache prediction) and a second (the operand-stack prediction), because the question says "choose one".

### Why
- I gave confidence 5 only where the article states the answer in one place and I could re-derive it; question 1's "remove both" half is the only one where I had to supply an assumption, and I said so in the feedback rather than lowering the score silently.

### What worked
- Questions 2 and 3 map almost one to one onto numbered lists and table rows, so they were straightforward and I could be sure of them.
- For question 5, the arithmetic (1,337/307) had to be done by hand since the article only states the rounded factor 4.4; showing it makes the answer checkable.

### What didn't work
- For question 1, the article's own two summaries disagree slightly (prototypes in 10.2, "all three" in 10.8), so there is no single passage that my answer can quote for the order half. I answered from the intent of the remedy and flagged the gap.

### What I learned
- Answering the quiz is a better test of the article than reading it: questions 1 and 6 are exactly where the text is thinnest, and question 5 is where it is strongest, and I would not have seen that asymmetry from reading alone.

### What was tricky to build
- Keeping every answer inside six sentences while still showing working. Question 3 needed both the general reason and two concrete constructs, which is what pushed it to the limit.

### What warrants a second pair of eyes
- Answer 6's phrasing "far from 593" is deliberately vague because the article sets no tolerance; if the editor intends a specific tolerance, the prediction row should state one.

### What should be done in the future
- If any answer here differs from the author's intended answer, that difference is itself the most useful feedback item; the author should diff `answers.md` against their own key.

### Code review instructions
- Read `answers.md` alongside section 10.9 of `article.md` and check the numbering matches question for question.

### Technical details
- Six answers, confidence values: 5, 5, 5, 5, 5, 5.
- Working shown: 833 × 2 + 68 = 1,734 bytes; (468 + 869)/307 = 4.36; 1,730/316 = 5.47.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six sections `TASK.md` requires: passages read twice, terms used before or never explained, claims I could not verify, section scores, questions the article did not let me answer, and one thing to add and one to cut. Each quote is one or two sentences copied from the article, and each is followed by what was unclear or what evidence is missing.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Report, as a reader, only defects that neither the article nor the glossary repairs, with enough quotation that the editor can find each spot.
**Inferred user intent:** Give the editor an actionable list ordered by where the reader actually stumbled, avoiding both vague praise and nitpicking about style that does not affect learning.
**Commit (code):** none.

### What I did
- Wrote `feedback.md` with seven quoted passages, ten undefined-or-late terms, ten unverifiable claims, nine section scores (10.1–10.9) with one sentence of reason each, a per-question note, and one addition and one cut.
- Kept the terms section to one line per term, as instructed, and left out terms the glossary covers (*slot*, *trampoline*, *fuel*, *verifier*, *PMP*, *arena*, *typestate*, *world*, *nucleus*, *engine*, *reactor*).
- Scored 10.5 and 10.8 highest (5) and 10.2, 10.4 and 10.6 lowest (3), with the reason attached in every case.

### Why
- I put the definitions complaint and the cost-budget complaint near the top of their sections because they are the two that block a reader rather than merely slowing them.
- I chose "add a cost budget" over "add more diagrams" because the article's problem is missing denominators, not missing pictures.

### What worked
- The glossary was enough to keep the terms section honest and short; without checking it I would have wrongly reported *trampoline* and *fuel* as undefined, since both are used (in the figure) or defined in passing before the glossary's own numbering suggests.
- Quoting exact sentences made the "read twice" entries specific enough to act on, for example the "code area" versus "slot" mismatch.

### What didn't work
- No failures in the mechanics: the files were written in a single pass and no tool step errored. The limitation is scope — I could only mark the cross-article numbers as unverifiable, not check them, because those articles are not in this directory and the web was out of bounds.

### What I learned
- Several of my "read twice" passages came from the same cause: the article states a design *conclusion* (an interface description, a binary protocol) without showing the artefact, so the reader cannot tell which file would be generated and which stays hand-written. That single gap explains most of the 10.2 and 10.4 marks.

### What was tricky to build
- Calibrating the scores so that they discriminate. Giving everything a 4 would have been useless; I forced myself to name the specific defect behind each 3, and to give 5 only where I could find nothing to fix (10.5's conditional table, 10.8's summary).

### What warrants a second pair of eyes
- The "one thing to cut" recommendation proposes deleting material about asm.js's specification and the committee stage of the type-annotations proposal. An author may consider those the article's intellectual contribution rather than a detour; the case for cutting rests on them not being load-bearing for the table of rewrites.
- The section scores are one reader's. A second reader should score independently before the editor acts on them.

### What should be done in the future
- Publish the tour only after the 10.2/10.8 mismatch is resolved, and consider adding the total flash figure, since almost every cost claim in 10.1 and 10.5 depends on it.

### Code review instructions
- Open `feedback.md` next to `article.md`; each quotation should be findable by search. Verify that every term listed there is genuinely absent from `glossary.md`.

### Technical details
- Sections in `feedback.md`, in order: Passages I had to read twice; Terms used before they were explained, or never explained; Claims I could not verify from the article itself; Section scores; Questions that the article did not let me answer; One thing to add and one thing to cut.
- Score distribution across 10.1–10.9: 4, 3, 4, 3, 5, 3, 4, 5, 4.

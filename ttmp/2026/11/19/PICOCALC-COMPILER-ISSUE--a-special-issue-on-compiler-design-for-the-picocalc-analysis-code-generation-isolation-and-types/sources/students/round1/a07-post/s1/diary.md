## Step 1: Reading the article, start to finish

I read `TASK.md` first to fix the deliverable list, then read `article.md` in one pass without taking notes, to see whether the argument carried me along. This is a teaching article on confining untrusted native code on a PicoCalc-class device, organised as §7.1 problem, §7.2 mechanisms, §7.3–7.5 what the typed language already gives, §7.6 verifying emitted RV32, §7.7 the hardware alternative, §7.8 key points, §7.9 quiz.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four instructions in `TASK.md`: read the article, answer the quiz into `answers.md`, write `feedback.md` with six named sections, and write this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest student-level read-through that surfaces where the article fails to teach, before publication, plus a check on whether the quiz is fair.
**Commit (code):** N/A — no repository, no changes made.

### What I did
- Read `TASK.md`, `diary-format.md`, then `article.md` in full.
- Noted the article's declared dependencies on Article 1 (world, turn budget, engine, reactor, trap) and Article 5 (shape of the emitted code).

### Why
- Reading `diary-format.md` before starting avoided a rewrite of this file at the end; the format is detailed and demands specific headings.
- I read the article without stopping partly to simulate a real reader, so that "passages I had to read twice" would be genuine rather than reconstructed.

### What worked
- The structure is easy to hold in mind: every section follows "claim, table, caveat". §7.8 "Key points" is an accurate restatement, which I later used as a cross-check on my answers.
- The loader quotation in §7.1 does most of the motivating work on its own; I did not need §7.2 to understand why the problem exists.

### What didn't work
- Two dependencies are not declared in the dependency paragraph even though the article leans on them hard: the **nucleus** (§7.5, §7.6, §7.7) and **CJI** (§7.7, and the decisive row of the comparison table). Neither is defined anywhere in the article and neither appears in the Article 1 list, so I could not resolve them by looking back.

### What I learned
- The article's real argument is narrower than its title: it is not "run native code safely" but "run *typed-source-compiled* native code safely", and §7.7's PMP row is the only place that widens it again. Reading it that way made §7.6's verifier table read as a design, and §7.7 as an escape hatch.

### What was tricky to build
- N/A for this step; nothing was constructed.

### What warrants a second pair of eyes
- Whether "the deepest reactor function that chain can reach" is a fixed constant in practice. If different reactor functions have different stack depths and different chains reach different ones, then the single "plus a constant" formula in §7.4 point 3 may be understated. I could not resolve this from the text and it looks like a correctness question, not a clarity question.

### What should be done in the future
- Add `nucleus` and `CJI` to the borrowed-terms paragraph, or define them on first use.

### Code review instructions
- Start at `article.md` §7.1 dependency paragraph, then grep for "nucleus" and "CJI" to confirm they are used before (and without) definition.

### Technical details
- Article is eleven printed pages in this form; sections 7.1 through 7.9; references list 13 entries plus three documentation/source entries.

## Step 2: Answering the quiz into answers.md

I answered all six questions of §7.9 into `answers.md`, two to six sentences each, with a `Confidence:` line per answer. Where a question asked for a calculation or an argument I wrote the working out rather than only the conclusion: the file-order argument for Q2, the stack formula in Q3, and the back-edge trace for Q4.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce `answers.md` numbered like the questions, with per-answer confidence 1–5.
**Inferred user intent:** Check whether the quiz is answerable from the text alone, and produce a model answer set the editor can use to spot underspecified questions.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six sections numbered 1–6 matching §7.9, each with a `Confidence: N` closing line.

### Why
- I deliberately answered only from `article.md` and refused to import outside knowledge about SFI, PMP, Erlang or NaCl, because the point of the exercise is to test the article, not me.
- Confidence values were assigned per answer rather than uniformly, so a low number flags a weak question: 5 for Q2, Q4, Q5, Q6 (fully determined by the text), 4 for Q1 and Q3 (correct but requiring an interpretive step).

### What worked
- Q2 is the article's best-posed question: the answer is a two-line argument plus one concrete diagnostic (`unknown function f`), and the second half ("what must be added") is answered verbatim by the §7.4 caution paragraph.
- Q5 is answerable cleanly once §7.6 is read closely, because the article says pattern checking only confirms "some length word" — the wrong-register bug is exactly a wrong length word.

### What didn't work
- Q3 asks for "the two quantities that are summed", but the article's number is a *maximised sum* plus a constant, not a sum of two quantities. I answered with the actual formula and a worked example (16+32+48+64 = 160 bytes, plus the reactor constant) and noted the mismatch instead of pretending the question's framing fit. Confidence dropped to 4 for that reason alone.
- Q6 asks for one advantage each way, but the §7.7 table lists three verifier advantages and one PMP advantage. There is no unique answer, so I gave the one I judge primary (jump versus trap per reactor call) and mentioned the alternative.

### What I learned
- The quiz is answerable, but two of six questions are answerable in multiple defensible ways, which is a different failure from being unanswerable and is easy to miss if you only ask "did the student get it right?".

### What was tricky to build
- Q4 needed care on one point: fuel bounds the loop but does not resume the handler. The article states this clearly, twice, but it is exactly the point a reader is likely to get wrong, so I wrote it explicitly rather than by implication.

### What warrants a second pair of eyes
- My Q1 answer treats "contract, not a wall" as purely about control safety. A reader could argue the contract also fails to constrain memory safety, since a jump anywhere implies a load or store anywhere. The article's own table assigns it to control safety, so I followed that, but it is a judgement call.

### What should be done in the future
- Rewrite Q3 to say "state the formula and identify what is maximised", and Q6 to name which advantage the author considers primary.

### Code review instructions
- Compare each answer's quoted phrase against `article.md` and confirm every confidence-5 answer is determined by a single passage.

### Technical details
- `answers.md`: six numbered sections, one `Confidence:` line each; values 4,5,4,5,5,5.

## Step 3: Writing feedback.md

I wrote `feedback.md` with the six sections `TASK.md` names: passages read twice, unexplained terms, unverifiable claims, per-section scores, unanswerable quiz questions, and one addition plus one cut. Where a passage was unclear I quoted one or two sentences exactly, and where a section lost points I gave a single reason sentence.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce a structured critique that tells the editor where the article fails to teach, with quotes and scores.
**Inferred user intent:** Actionable editorial feedback before publication, honest about the article's weak sections rather than uniformly polite.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with the six required sections, scoring §7.1 through §7.9.
- Quoted eleven claims I could not verify, each with the specific missing evidence named.
- Picked one addition (§7.4/§7.5 worked numeric example) and one cut (the CHERIoT sentence in §7.7).

### Why
- I scored §7.7 lowest (2) not because it is badly written sentence by sentence, but because it is the only section that ends without telling the reader what follows from the material — it surveys PMP, Tock, ESP-TEE and CHERIoT and stops.
- I chose the worked example as the addition because both of the article's central claims (bounded stack, fuel-bounded loops) are quantitative and both are stated only in symbols, so the reader is asked to trust arithmetic they cannot check.
- I chose CHERIoT as the cut because it is a different processor, advances no decision, and introduces two undefined notions in the article's weakest section.

### What worked
- The section-by-section scoring made the critique concrete; §7.1 and §7.8 both scoring 5 is a real signal, since they are the two places where the article quotes a source directly and then summarises it.
- Quoting "A verifier for this code **would** establish the following" was the clearest single piece of evidence that §7.6's trust table is a design intention written beside a table of measured facts.

### What didn't work
- I could not fully justify the score for §7.2 (3). It contains the single most useful table in the article and also its densest, least explained paragraph — the two pull in opposite directions and I settled on the middle rather than on a defensible average with a method. A rubric would have helped; `TASK.md` gave none.

### What I learned
- The article's weak point is not the prose but the missing artefacts: no list of the 28 reactor functions, no list of the twenty permitted instructions, no frame-size table, no measured reactor stack constant. Every one of the "size of the trusted component" arguments in §7.2 and §7.6 is quantitative and none of the quantities is shown. That is a single defect with many symptoms.

### What was tricky to build
- Distinguishing "passages I had to read twice" from "terms never explained" required judgement, because several passages are unclear precisely *because* they use an undefined term (the §7.2 SFI sentence and the address-masking paragraph in §7.6). I put the mechanism difficulty in the first section and the vocabulary in the second, and accepted some overlap at the boundary.

### What warrants a second pair of eyes
- My claim that the §7.2 SFI sentence misdescribes how jump targets are forced into a region. If Wahbe et al. genuinely handled both stores and jumps by region-forcing, then my "passage read twice" item 1 is wrong about the mechanism and only right about the article's failure to explain it. Someone with the 1993 paper should check that before the item is used editorially.

### What should be done in the future
- Add the missing artefacts: the 28 reactor function signatures, the twenty-instruction encoding table, the measured reactor stack constant, and the line-count command behind 1,070 and "a few hundred".
- Rewrite §7.7 to end on the experiment rather than on CHERIoT.
- Rewrite quiz Q3 and Q6 as described in Step 2.

### Code review instructions
- Read `feedback.md` sections in order; each quote should be findable verbatim in `article.md`. The two `grep` checks worth running are "nucleus" and "CJI", which should each return uses that precede any definition.

### Technical details
- Section scores: 7.1=5, 7.2=3, 7.3=4, 7.4=4, 7.5=4, 7.6=3, 7.7=2, 7.8=5, 7.9=4.
- Deliverables written: `answers.md`, `feedback.md`, `diary.md`. No changes to `article.md` or any other file.

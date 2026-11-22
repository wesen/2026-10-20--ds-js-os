# Investigation entry

## Step 1: Reading the article start to finish

I read `TASK.md` first to learn the deliverables, then `article.md` in one pass without stopping to take notes, then re-read sections 6.3 and 6.4 because those were the two places where my reading stalled. The article is the sixth in a series, so much of its vocabulary (*reactor*, *engine*, *turn*) is carried in from Article 1 and only referenced, which made the first pass slower than the length of the text suggests.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered instructions in `TASK.md`: read the article, answer the quiz into `answers.md`, write `feedback.md` in six named sections, and write a formattted work diary as `diary.md`.
**Inferred user intent:** The editor wants an honest student-eye test of whether the article teaches what it claims to teach, before publication.
**Commit (code):** none — this session produced documents only.

### What I did
- Read `TASK.md`, `diary-format.md` and `article.md` (all files in the working directory).
- Read `article.md` twice: once straight through, once again on 6.3, 6.4 and 6.5 to check the numbers.

### Why
- `TASK.md` step 1 says to read start to finish; the second pass on the numeric sections was needed because steps 2 to 4 all depend on whether the arithmetic in the text closes.

### What worked
- The article is well structured for a first read: every numbered section opens with the question it answers, and section 6.9 restates the conclusions, so I could check my understanding of a section against its own summary line.

### What didn't work
- No failures of tooling. One reading failure: the 1,450 ms "reuse of the stored module" figure in 6.3 versus "about 0.01 s to load, plus hashing" in 6.4. I could not reconcile them from the text and had to carry the doubt forward instead of resolving it.

### What I learned
- That the article's own numbers are the load-bearing part: nearly every unclear passage I found was a place where two numbers from different measurements were placed next to each other without a shared baseline.

### What was tricky to build
- Nothing was built. The tricky part of the reading was keeping track of which measurements belong to Editor (1.99 s WebAssembly, 3.14 s native, 120 functions, 768 KiB limit, 710 vs 528 KiB) versus the unnamed "small test program" of 6.3 (7,028 ms cold, 1,450 ms reuse).

### What warrants a second pair of eyes
- Whether the CJI record's "identity of the firmware build" is genuinely equivalent to three of the five listed inputs. If it is not, section 6.3's worked example contradicts its own table.

### What should be done in the future
- N/A for this step; the gaps are recorded in `feedback.md`.

### Code review instructions
- Compare `answers.md` question 2 and `feedback.md` "Passages I had to read twice" bullet 2: both turn on the unspecified two-slot write alternation.

### Technical details
- Files read: `TASK.md`, `article.md`, `diary-format.md`. No commands that touch the device or the network were run.

## Step 2: Answering the check-your-understanding questions

I wrote the six answers to `answers.md`, numbered to match, each two to six sentences and each followed by a `Confidence:` line. Questions 3 and 6 needed working shown, so those answers carry the arithmetic explicitly (1150 ms ÷ 7.2 ms ≈ 160; and the per-function cost of under 20 ms).

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer in my own words, show working where a calculation is asked for, and grade my own certainty.
**Inferred user intent:** The editor wants to know both whether the questions are answerable and whether a reader is confident in the answers, since low confidence on an answerable question is itself a finding.

### What I did
- Wrote six answers to `answers.md` with an explicit `Confidence: N` line after each.

### Why
- Confidence values are the only signal that separates "the text taught me this" from "I filled a gap"; I set question 2 to 3 for exactly that reason and questions 1, 5 and 6 to 5 because the table rows answer them directly.

### What worked
- Questions 1, 3, 5 and 6 are answerable by pointing at a specific table row or by dividing two quoted numbers, which is a good sign for those sections.

### What didn't work
- Question 4 asks for *the reason Franz and Kistler considered the design worthwhile*, and the article supplies the reason only through a quotation. I answered with the quotation plus the portability motive, but this is paraphrase of a source I cannot see; I marked it 4 rather than 5.

### What I learned
- Answering the quiz surfaced a fact I had missed on the first read: that a per-function cache still needs a link step, so an edit is not free even when only one function misses. Without question 6 I would have written the section 6.3 bullet off as "an edit costs one function's compile" full stop.

### What was tricky to build
- Question 2's answer required an assumption the text does not state. I chose to answer it under the reading that makes the design safe, and to say in the answer itself that the assumption is mine.

### What warrants a second pair of eyes
- My answer 3 uses the article's own subtraction; if the 8.8 ms and 1.6 ms per-turn figures are per turn of a different size (different workload), the 160-turn figure is only reproducible, not correct.

### What should be done in the future
- If the editor wants a stronger test, a version of question 3 that quotes the raw per-turn numbers and asks the reader to derive them would separate arithmetic from trust.

### Code review instructions
- Read `answers.md` against `article.md` sections 6.3, 6.5, 6.6 and 6.3 again for question 6; every answer cites a specific passage.

### Technical details
- Break-even arithmetic as written: 1150 ms ÷ 7.2 ms = 159.72 → about 160 turns. Per-function average: 2000 ms ÷ 120 functions ≈ 16.7 ms, consistent with the article's "under 20 ms".

## Step 3: Writing the feedback

I wrote `feedback.md` in the six requested sections. I quoted rather than paraphrased every unclear passage, listed terms in the order they first appear, and for each unverifiable claim named the specific missing evidence rather than saying only that the claim was unsupported. I also scored the unnumbered introduction, because its list of objectives is what the later sections are judged against.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce publishable reader feedback with the exact section headings required, being honest about where the article fails to teach.
**Inferred user intent:** Give the editor actionable, located complaints it can fix in the draft, not a general impression.

### What I did
- Wrote `feedback.md` with the six sections: passages read twice (7 items), terms unexplained (17 items), unverifiable claims (11 items), per-section scores with one-sentence reasons, quiz questions that could not be answered (questions 2 and 4, partly), and one thing to add plus one to cut.

### Why
- I kept the "terms" list as one line per term with where it first appears, so the editor can add a glossary entry or an inline definition without hunting. I chose the add/cut pair to target the weakest section (the key-to-record mapping in 6.3) and the most redundant paragraph (the hypothetical one-millisecond CJI break-even in 6.5).

### What worked
- The five-input key table in 6.3 was the single most useful piece of text in the article: it let me answer question 1 immediately and it gave me the standard against which to judge the CJI record.

### What didn't work
- I could not verify the 1,450 ms reuse figure, the 58 percent frontend share, or the cost of hashing a 240 kB module. I recorded these as missing evidence rather than guessing, but it means my section 6.4 score of 3 rests partly on numbers I could not check.

### What I learned
- The article's dependence on Articles 1 through 5 is a structural issue, not a wording one: a standalone reader cannot test the claims about the reactor, the turn, or the predicted 1.4–1.8× backend ratio. I noted it in the section scores rather than as a term, since it affects whole sections.

### What was tricky to build
- Deciding whether the 1,450 ms reuse figure was a CJI measurement or a typed-compiler prediction. The sentence sits in a CJI paragraph but says "the one to expect for the typed compiler", so I recorded the ambiguity in both the "read twice" and "unverifiable" sections instead of picking one reading.

### What warrants a second pair of eyes
- My claim that the two-slot design must alternate writes is an inference from the safety argument, not something the article says. An editor who knows the CJI installer should confirm before the wording is changed.

### What should be done in the future
- Add the worked key computation to 6.3 and cut the hypothetical CJI break-even paragraph in 6.5, as stated in the add/cut section.

### Code review instructions
- Check each quotation in `feedback.md` against `article.md` by exact string match; the terms list should be read in first-appearance order to see how much vocabulary the article assumes.

### Technical details
- Deliverables written this session: `answers.md`, `feedback.md`, `diary.md`. Sources used: `article.md` only; no web access, no files outside the working directory.

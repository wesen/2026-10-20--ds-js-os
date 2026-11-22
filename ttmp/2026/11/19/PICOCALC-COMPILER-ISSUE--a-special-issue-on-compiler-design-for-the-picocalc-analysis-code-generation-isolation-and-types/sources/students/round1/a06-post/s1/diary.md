# Investigation entry: Student read of article 6, "When to Compile"

Three steps: reading the article, answering the quiz, writing the feedback. The files produced are
`answers.md` and `feedback.md` in this directory.

## Step 1: Reading the article

I read `TASK.md` first, then `article.md` straight through without stopping, then went back over
6.3, 6.4 and 6.5 with the tables side by side, because those are the sections where the numbers
have to agree with each other. My aim was to read as an ordinary student would: no access to
Articles 1–5 or 7, no access to Article 2's measurements, and no web lookups.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Act as the student reader described in `TASK.md`: read the article, answer its quiz into `answers.md`, write structured criticism into `feedback.md`, and keep this diary.
**Inferred user intent:** The editor wants to know where the teaching article fails before publication, and specifically wants the failure modes named by passage, not a general verdict.
**Commit (code):** N/A — no code changes in this session.

### What I did
- Read `TASK.md`, `diary-format.md`, then the full `article.md` (sections 6.1–6.10 plus references).
- Re-read 6.1, 6.3, 6.4, 6.5, 6.6 in a second pass with the four tables (6.1 moments, 6.2 none, 6.3 inputs, 6.4 storage choices) next to each other.
- Jotted the arithmetic checks by hand: 3.14 − 1.99 = 1.15 s; 1.15 / 0.0072 ≈ 160 turns; 240/88 ≈ 2.7 versus the stated 4.76; 0.58 × 3.14 ≈ 1.82 s removed, leaving ≈1.32 s versus the stated "about 1.2 s"; 140.6 − 0.082 s ≈ 140,500 ms of calls.

### Why
- A single fast pass would have hidden the internal inconsistencies, which only show up when the numbers in prose are compared with the numbers in tables.
- I deliberately did not reconstruct the missing definitions from general knowledge of compilers, because the point of the test is whether the article teaches them.

### What worked
- The structure is genuinely navigable: every section states its claim up front, and the key-points list in 6.9 maps back to the sections without contradiction.
- The 6.4 "what is stored / work at each boot / cost / flash" table and the 6.8 mermaid diagram are the two places where I understood the design without needing anything else.
- The break-even section 6.5 is the only place where I could check the article's arithmetic end to end and have it come out right.

### What didn't work
- Reading section 6.4's slim-binary paragraph, I could not decide whether the design was "as fast as native" or "twice as slow but fine". No amount of re-reading resolved it; I recorded it as a double-read in `feedback.md`.
- The 4.76-per-byte-of-function-body figure versus the 240 kB / 88 kB module sizes looked like an error until I guessed the scope difference. My guess is not stated in the article, so it stays a guess.

### What I learned
- The article's weakest point is not its argument but its inherited vocabulary. Reactor, engine, turn, world, CJI, lower, link and frontend are all load-bearing and all undefined here.
- Its strongest point is that every design choice is attached to a measured consequence, so I could score the sections on clarity rather than on agreement.

### What was tricky to build
- Question 4 of the quiz is the hard case: I could answer it, but only by paraphrasing a paragraph I had just flagged as unclear. I marked that in the feedback rather than pretending the section was fine.
- Question 3 depends on 8.8 ms and 1.6 ms, which appear nowhere else in the article. Answering it is therefore not really a check of the text, and I said so.

### What warrants a second pair of eyes
- Whether the 4.76 ratio and the 88 kB / 240 kB module sizes are meant to be reconcilable — someone with access to Article 2 can settle this in a minute.
- Whether the CJI record's three fields really are equivalent to the five-input key of 6.3, or whether that paragraph needs rewriting.

### What should be done in the future
- If the article is revised, re-run this student read against the revised text, especially quiz question 4, to check that the slim-binary paragraph has become answerable in one reading.

### Code review instructions
- No code. Read `answers.md` first, then `feedback.md`; every criticism in the latter quotes the passage it refers to, so it can be checked against `article.md` by search.

### Technical details
- Files read: `TASK.md`, `diary-format.md`, `article.md`. Files written: `answers.md`, `feedback.md`, `diary.md`.
- Quiz answered: 6 questions, each 2–6 sentences with a `Confidence: N` line.
- Confidence given: 5 on questions 1, 2, 3, 5; 4 on questions 4 and 6.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, numbered 1–6 as the article numbers them, keeping each
to two to six sentences and showing the arithmetic where a question asked for it. I wrote the
answers in my own words rather than copying sentences out of the article, except where the article's
own phrasing is the claim being tested.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce `answers.md` with one numbered answer per quiz question and a `Confidence: N` line under each.
**Inferred user intent:** The editor wants to see not only whether the questions can be answered but how sure a reader feels, since low confidence on an answerable question is itself a signal of unclear writing.
**Commit (code):** N/A.

### What I did
- Wrote six answers, each with a short working line where the question was computational (questions 1, 3, 6).
- Assigned confidence: 5 for 1, 2, 3, 5; 4 for 4 and 6.

### Why
- Q1, Q2, Q3 and Q5 have their answers stated in the text almost directly, so anything below 5 would have been dishonest.
- Q4 got 4 because the paragraph it rests on is self-tensioned; Q6 got 4 because the article says the link step exists and what it does, but not what it costs, so I could not judge whether "one function's compile plus a link" is actually cheap.

### What worked
- The five-input table in 6.3 made Q1 mechanical: change one input, the key changes.
- The write-order bullet in 6.3 made Q2 answerable in one pass.
- Q3's numbers were all present in 6.5 and the arithmetic reproduced exactly (159.7 ≈ 160).

### What didn't work
- For Q6 I initially wrote that only the function is recompiled, which is incomplete: the link step is required because indices shift. Re-reading 6.3's "one entry per function" subsection corrected this.
- For Q4 my first draft repeated the phrase "can almost compensate" without explaining it, which is exactly the failure the article commits; I rewrote it to state the intended reason (smaller file, portability) and to note the tension.

### What I learned
- Answering a quiz is a much sharper test of an article than reading it: three of my first drafts turned out to be restatements of unclear sentences rather than explanations.
- Confidence numbers are a useful forcing device — writing "5" made me go back and confirm the text actually said it.

### What was tricky to build
- Q3 asks specifically how *caching* changes the conclusion, which requires combining 6.5's arithmetic with 6.3's design. The article never states that combined conclusion in one place, so I had to assemble it from "repaid within the first few minutes of use" plus "the answer to 'should this application be native' changes".

### What warrants a second pair of eyes
- My Q4 answer is the one I would want checked against the original Franz & Kistler report; I can only report what this article quotes.

### What should be done in the future
- N/A.

### Code review instructions
- Check `answers.md` against sections 6.3, 6.4, 6.5 and 6.6 of `article.md`; the arithmetic in Q3 should reproduce at 1.15 s / 7.2 ms.

### Technical details
- Q3 working: 3.14 − 1.99 = 1.15 s; 8.8 − 1.6 = 7.2 ms; 1150 / 7.2 = 159.7 → about 160 turns.
- Q1 working: key = H(source, compiler source, reactor, engine, import table); compiler source changes, so the key changes.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six sections `TASK.md` asks for, quoting each passage I criticised so the
editor can find it. The aim was to be specific enough to act on: not "section 6.4 is unclear" but
"this sentence stacks three hedged numbers and here is why I could not extract a claim from it".

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce `feedback.md` with the six required sections: double-read passages, undefined terms, unverifiable claims, per-section scores, unanswerable quiz questions, and one addition plus one cut.
**Inferred user intent:** Give the editor an actionable list of failures, ordered by where to look, plus a prioritised suggestion for what to change.
**Commit (code):** N/A.

### What I did
- Collected four passages I read twice, with the specific reason each time.
- Listed sixteen terms used before definition or never defined, one line each.
- Listed ten claims I could not verify from the article alone, quote plus missing evidence.
- Scored all ten numbered sections 1–5 with a one-sentence reason: 6.1 = 5, 6.2 = 4, 6.3 = 4, 6.4 = 3, 6.5 = 4, 6.6 = 4, 6.7 = 3, 6.8 = 5, 6.9 = 5, 6.10 = 4.
- Answered the "questions the article did not let me answer" section honestly: none of the six was strictly unanswerable, but Q4 and Q3 needed repair work, and Q6 could be answered without being able to judge the cost.

### Why
- I scored 6.4 and 6.7 lowest because those are the two places where I had to guess at missing information (the 1.2 s figure, the determinism claim) rather than merely look something up in an earlier section.
- I chose "add a definition box" as the addition because the undefined-terms list is by far the longest section of my feedback; one fix pays off across the whole article.
- I chose the slim-binary paragraph as the cut because it is both the least clear passage and the one that quiz question 4 depends on.

### What worked
- Quoting each passage made the criticism checkable; I could re-verify every complaint against the file before writing it down.
- The section scores came out spread (3 to 5) rather than uniform, which suggests they are measuring something real.

### What didn't work
- The instruction "questions that the article did not let me answer" presupposed some failure; in fact all six were answerable. I could have simply written "none" but judged that naming the two weak cases was more useful than a one-word answer, so I did both.

### What I learned
- The article's problems cluster: inheritance of vocabulary from earlier articles, and numbers quoted without their source. Almost every item in my list falls into one of those two buckets.
- A table can be clear while the prose beside it is not — 6.4 is the example.

### What was tricky to build
- Distinguishing "I could not verify this" from "I disagree with this". Several claims (the 1.4–1.8× backend prediction, the 58 percent frontend share) are plausible but unsupported *here*; I recorded them as missing evidence rather than as errors.

### What warrants a second pair of eyes
- My score of 3 for 6.4 is the one most likely to be contested, since the section's central idea is well explained and only its supporting paragraph fails.

### What should be done in the future
- If the editor accepts the definition-box suggestion, the sixteen-term list is the specification for what it must contain.

### Code review instructions
- Read `feedback.md` sections in order; each quoted passage can be located in `article.md` by search.

### Technical details
- Section scores: 6.1 = 5, 6.2 = 4, 6.3 = 4, 6.4 = 3, 6.5 = 4, 6.6 = 4, 6.7 = 3, 6.8 = 5, 6.9 = 5, 6.10 = 4.
- Outputs: `feedback.md` (six sections), `answers.md` (six answers), this diary.

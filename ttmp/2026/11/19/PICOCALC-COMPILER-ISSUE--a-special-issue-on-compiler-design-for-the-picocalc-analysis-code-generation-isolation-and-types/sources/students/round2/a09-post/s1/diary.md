## Step 1: Reading the article and the glossary

I read `article.md` once from top to bottom without stopping, then went back through it section by section with `glossary.md` open in a second read, looking up each technical term as a reader would. The article is a survey of six proposed type-system features plus two deferred ones, and it leans heavily on cross-references to Articles 1–8, which I do not have; I noted every place where a claim rested on one of those.

### Prompt Context
**User prompt (verbatim):** "Read `article.md` from start to finish. The series has a glossary, `glossary.md`; look terms up there as a reader would, and report in your feedback only terms that neither the article nor the glossary explains."
**Assistant interpretation:** Read the whole article as a student, keep a running list of unclear passages and undefined terms, and check each candidate term in the glossary before calling it undefined.
**Inferred user intent:** The editor wants a reader's report, not an editor's, so the value is in recording confusion at the point it happened rather than reconstructing it afterwards.

### What I did
- Read `TASK.md`, then `article.md` (sections 9.1–9.12 plus references), then `glossary.md` in full.
- Kept a list of candidate undefined terms: Static TypeScript, ABCD, WIT, substructural, least privilege, arena, typestate, wrapped rows, Agenda, Editor.
- Checked each against `glossary.md`: `arena` and `typestate` are present (so they are only "used in a heading before definition"), the rest are absent.
- Counted the article's own arithmetic where it was checkable: `a🙂b` is 1+4+1 = 6 UTF-8 bytes, 1+2+1 = 4 UTF-16 units, 3 code points, matching the text.

### Why
- Reading the glossary only after the first pass mimics ordinary reading; a term that is defined but defined late still costs the reader something, so I wanted to distinguish "never explained" from "explained after use".

### What worked
- The `a🙂b` example is verifiable and correct, which gave me one anchored fact in section 9.3.
- The glossary covers the system vocabulary (`world`, `turn`, `nucleus`, `trap`, `fuel`, `manifest`, `claim`, `reactor`) well enough that the article's machinery was readable.

### What didn't work
- No failures of commands; I only read files. The one thing that did not resolve: section 9.4 says facts must be discarded at calls because "deciding which calls could change a length would need knowledge of the called function, which the first criterion rules out", while section 9.7 says the compiler does know each callee's declared signature and its effects. I could not reconcile these two sentences and recorded the passage as a double-read.

### What I learned
- The article's structure is uniform (Observation, Mechanism, Cost), which made it easy to locate the evidence for each claim — and easy to notice that in 9.4 the "Observation" carries numbers with no listing to check them against.

### What was tricky to build
- Nothing was built. The tricky part of reading was section 9.4, where five different instruction counts (20, about 4, 2, 7, 9) belong to three different code-generation settings (today's backend, the improved backend of Article 5, hand-written code) and the sentences do not label which is which.

### What warrants a second pair of eyes
- Whether the 404 trap instructions and 85 `charCodeAt` calls are reproducible from Article 2; I could not check them and the article gives no method.

### What should be done in the future
- If the editor can supply Articles 2, 4, 5, 7 and 8, a second reading would test the cross-references properly; several of my "unverifiable" items are only unverifiable because those articles are absent.

### Code review instructions
- N/A — this step produced no code. The reading notes fed `feedback.md`.

### Technical details
- Article structure: 9.1 criterion (three conditions: local checking, no added run-time checks, addresses something observed); 9.2 enumerations; 9.3 distinct integer types; 9.4 flow-sensitive refinement; 9.5 regions/arena; 9.6 linear handles/typestate; 9.7 effects as capabilities; 9.8 two deferred directions; 9.9 non-type-theory gaps; 9.10 summary table; 9.11 key points; 9.12 quiz.

## Step 2: Answering the quiz

I answered the six questions in section 9.12 without looking back at the article for anything except the few numbers, then checked each answer against the text. The questions ask for recall of lists (coordinate systems, rules, discarding events) and of one argument (the unsigned index type), so most answers were transcription-with-understanding rather than reasoning.

### Prompt Context
**User prompt (verbatim):** "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show working where a question asks for a calculation or a translation. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain)."
**Assistant interpretation:** Produce six short prose answers with explicit working where numbers are involved, each ending with a numeric confidence.
**Inferred user intent:** Test whether the article actually supports the quiz it sets; a low confidence score or an impossible question tells the editor where teaching failed.

### What I did
- Wrote `answers.md` with six numbered answers, each 2–6 sentences and each followed by a `Confidence: N` line.
- Showed the arithmetic for question 2 (1+4+1 bytes, 1+2+1 code units, 3 code points) rather than just asserting 6/4/3.

### Why
- The instruction says to show working where a question asks for a calculation, and question 2 is the only one with a number to compute.

### What worked
- All six questions were answerable from the text alone; nothing needed the missing articles. Confidence was 5 for all six, because in each case I could point to the sentence that supplies the answer.

### What didn't work
- Question 3 asks for "the three kinds of event that discard it" but the source sentence lists "`i` or `s` is assigned or any call is made" — two variables and a call, which can be counted as three items or as two kinds. I answered by listing assignment to each variable plus any call, and flagged the ambiguity in `feedback.md` rather than in the answer.

### What I learned
- The quiz is fair: it asks for what the article states, not for what it merely gestures at. The one soft spot is question 2's "wrapped rows", which I could name but not explain.

### What was tricky to build
- Question 4 was the only one needing an argument rather than recall: the point is that a signed comparison gives only an upper bound, while the existing check is unsigned and rejects negatives too, so only an unsigned index type makes the guard equal to the check. Getting the reason into four sentences without losing the "why unsigned" step took a rewrite.

### What warrants a second pair of eyes
- My answer to question 6 says branches may consume the grant differently (one revokes, one stores). The text says exactly this, but it is the kind of claim where a wrong reading of linearity would be silent; a type theorist should confirm.

### What should be done in the future
- N/A.

### Code review instructions
- N/A — prose only. Answers are in `answers.md`, numbered 1–6.

### Technical details
- Confidence values: 5, 5, 5, 5, 5, 5.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections, ranking sections 9.1–9.11 on the 1–5 scale and separating three things I had been conflating while reading: passages that were merely dense, terms that were never defined anywhere, and claims that I could not check because the evidence lives in another article.

### Prompt Context
**User prompt (verbatim):** "Write `feedback.md` with these sections: **Passages I had to read twice** ... **Terms used before they were explained, or never explained** ... **Claims I could not verify from the article itself** ... **Section scores** ... **Questions that the article did not let me answer** ... **One thing to add and one thing to cut**."
**Assistant interpretation:** A structured, quoted, per-section critique, honest about where the article fails to teach.
**Inferred user intent:** The editor needs actionable, located criticism before publication, so every entry should quote the text and name what was missing.

### What I did
- Wrote `feedback.md` with the six headings in the requested order.
- Quoted one or two sentences per "read twice" entry (five entries) and said what was unclear.
- Listed ten terms in the "terms" section, having first checked each against `glossary.md`; noted that `arena` and `typestate` are glossary terms, so they are only "used in a heading before definition".
- Listed twelve unverifiable claims, each with the missing evidence named.
- Scored sections 9.1–9.11 (9.12 is the quiz, not content) with one sentence of reason each.
- Answered the "questions that the article did not let me answer" section by naming the two questions that were only barely answerable and saying why none were impossible.
- Gave one addition (a worked instruction count for the bounds check) and one cut (the ladder table in 9.4).

### Why
- I scored 9.4 lowest (2) because it is the section whose numbers I could not follow and whose two-sentence rule I had to reconstruct from three different measurement settings; scoring it high would have hidden the article's main teaching failure.
- I chose to cut the ladder table rather than the arena section because the article itself says three of the four rungs "belong on a workstation" — it is self-dismissed content that also introduces the undefined "ABCD".

### What worked
- The uniform Observation/Mechanism/Cost structure made section scoring defensible: most scores turn on whether the Observation's evidence is visible in the article.
- Separating "unverifiable" from "unclear" gave a much shorter and more honest list than my raw reading notes.

### What didn't work
- No tool or command failures. The one judgement I could not make cleanly: whether `wrapped rows` counts as "explained" by its one mention. I listed it under terms and also mentioned it under the quiz section, which is slight duplication I left in deliberately.

### What I learned
- Most of my "unverifiable" list is really "cited to a different article". That is a structural property of a series, not a defect of the article, and the feedback says so — but the article could still show one listing (e.g. `countUnit`) so that at least one number is checkable in place.

### What was tricky to build
- The section scores required holding a consistent rubric across eleven sections. I settled on: 5 = mechanism and evidence both visible; 4 = mechanism visible, one supporting fact taken on trust; 3 = mechanism visible but overloaded with new vocabulary or structurally muddled; 2 = I could not follow the argument as written.

### What warrants a second pair of eyes
- The score of 2 for 9.4 is the load-bearing criticism; if the 20-instruction listing of `countUnit` exists in an earlier article and the reader is expected to have it, 9.4 may deserve a 3 or 4 instead.

### What should be done in the future
- Add the `countUnit` listing; expand "ABCD" and "Static TypeScript" on first use; state the ordering principle in 9.10 so the table can be reproduced.

### Code review instructions
- N/A — prose only. `feedback.md` quotes are verbatim from `article.md`; the section scores cover 9.1–9.11.

### Technical details
- Scores: 9.1 = 5, 9.2 = 5, 9.3 = 4, 9.4 = 2, 9.5 = 4, 9.6 = 3, 9.7 = 4, 9.8 = 4, 9.9 = 5, 9.10 = 3, 9.11 = 5.

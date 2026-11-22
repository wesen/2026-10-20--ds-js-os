# Investigation entry

## Step 1: Reading the article as a student, with the glossary open

I opened `TASK.md`, then read `article.md` straight through without stopping, then read `glossary.md` and went back over the passages I had marked. The point of this step was to behave like the intended reader — someone who knows JavaScript but has not built a compiler — and to keep a list of the places where I slowed down, because those are the places the editor needs to hear about.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four numbered instructions in `TASK.md` in order: read the article with the glossary, answer the quiz into `answers.md`, write `feedback.md` in the six required sections, and write this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest pre-publication read of a teaching article: where it teaches, where it does not, and where its numbers do not hang together — from a reader who is not the author and cannot consult the cited literature.
**Commit (code):** none; this session produced only the three markdown files in this directory.

### What I did
- Read `TASK.md`, `article.md` (full), `glossary.md` (full), `diary-format.md` (full).
- Kept a running list of read-twice passages, undefined terms and unsupported numbers while reading, in a scratch list rather than in the article.
- Looked up the terms the article bolds against the glossary: fixpoint, join, widening, demotion, library specialization, range, abstract interpretation, whole-program inference, tier.

### Why
- Reading the whole article before consulting the glossary was deliberate: a first-time reader does not stop at every bold word, and the terms that survive a full read without being understood are the ones worth reporting.
- The glossary uses an article-number convention (`[3]`), and this article is Article 3, so most of its own vocabulary should be resolvable there; checking rather than assuming showed which words are not.

### What worked
- The glossary covers the article's own coinages almost completely: *fixpoint*, *join*, *widening*, *range*, *demotion*, *library specialization*, *abstract interpretation*, *whole-program inference* are all present and all defined as the article uses them.
- The `scale`/`area`/`half` example in 3.1 and the `max + 2` experiment in 3.3 both worked on a first read; they are the two places where the article teaches rather than asserts.

### What didn't work
- No failures of tooling. The only friction was structural: `read` on the directory itself returns `EISDIR: illegal operation on a directory, read`, so I could not list the directory to see whether earlier student passes left files here; I worked with the three named files plus `glossary.md` and `diary-format.md`.

### What I learned
- The article's vocabulary is unusually well served by the glossary; the gaps are not its jargon but ordinary compiler-adjacent words it treats as known — *call site*, *profile*, *hash*, *helper*, *message send*, *bytecode*, *garbage collection*.
- *Claim* is the one genuine collision: the glossary defines it as a manifest permission, and 3.3 uses it for "the integer proof is a claim to be proved". A reader who looks it up is sent somewhere else.

### What was tricky to build
- Nothing was built. The tricky part of the reading was holding two incompatible-looking attributions at once: 88.0 percent of executed instructions to the range analysis in 3.4/3.5, and 94 percent of pass time to library specialization plus the inference it triggers in 3.5. Deciding whether these are two measurements of different quantities or a contradiction required re-reading both paragraphs and the surrounding table.

### What warrants a second pair of eyes
- The 63% / 88% reconciliation in 3.5: if seven analyses are 88% of compile time, dropping six of them should save about 75%, and the article reports 63% with an unquantified exception clause. An editor with access to the project should confirm that the exception explains the whole gap.
- The 95 passes and 11,760 visits: 7 × 14 = 98 and 95 × 124 = 11,780, so both totals are rounded, and no per-round figures exist in the text to check them against.

### What should be done in the future
- The per-round cost table proposed under "One thing to add" in `feedback.md`; it would resolve both of the points above.

### Code review instructions
- Files: `article.md` (sections 3.2, 3.3, 3.4, 3.5), `glossary.md` (entries *Claim*, *Join*, *Widening*).
- Validation: read 3.5 after reading 3.4 and check whether the 88% and 94% figures can both be true of the same measurement; then check the arithmetic in the 3.4 table (79 helpers, 95 passes, 11,760 visits, 11,743,517 joins).

### Technical details
- Article under test: *3. Why Whole-Program Inference Costs Minutes*; subject, CJI compiling Agenda (16,326 bytes) in 1,475 s; totals quoted: 6 specialization rounds, 79 helpers (12 + 58 + 1 + 4 + 3 + 1 = 79, checks out), 7 range analyses, 95 passes, 11,760 function visits, 11,743,517 joins.
- Derived checks I ran: (1475 − 170)/1475 = 88.5% (article: "also 88 percent"); (1475 − 544)/1475 = 63.1% (article: 63%); 11,760/95 = 123.8; 11,743,517/11,760 = 998.6 joins per function visit.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, numbered as in the article, two to six sentences each, and added a `Confidence:` line under each. Where a question asked for a trace or an explanation of an origin, I showed the intermediate steps: the three passes of the loop, the two arithmetic paths in the `max + 2` experiment, and the division behind the 95.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Instruction 2 of `TASK.md`: answer the "Check your understanding" questions in `answers.md`, in my own words, with working shown for calculations and translations.
**Inferred user intent:** The answers double as a test of whether the article teaches what it claims to teach, and the confidence numbers tell the editor where a reasonable reader would guess.
**Commit (code):** none.

### What I did
- Wrote `answers.md` with six numbered sections, one `Confidence: N` line each (5, 4, 4, 3, 4, 5).
- For Question 2, computed the three passes ([0,0] → [0,1] → [0,2]) from the transfer function and join rather than copying the table.
- For Question 3, worked both sides: 2⁵³ + 1 rounded to 2⁵³, then 2⁵³ − (2⁵³ − 1) = 1; and 2⁵³ + 1 − (2⁵³ − 1) = 2 in exact integers.
- For Question 4, checked the totals against each other (95/7, 11,760/95) and reported the two roundings.

### Why
- Six sentences is the cap, so I chose the smallest example that carries the point in each case and pushed everything else into `feedback.md`.
- I lowered confidence where the answer needed knowledge the article does not supply — Question 4 (per-round breakdown absent) at 3, Questions 2 and 3 at 4.

### What worked
- Questions 1, 5 and 6 were fully answerable from the text at confidence 5 or 4; the article's structure deliberately sets up 1 (3.1), 5 (3.5) and 6 (3.6).
- The arithmetic of Question 3 resolves cleanly once the rounding rule is supplied: both answers are "correct" in their own arithmetic and differ only because one path rounds.

### What didn't work
- Question 4's second half defeated me at first: I tried to derive 95 from the round counts and could not, because nothing in the article relates passes to rounds except the average. I recorded that as a limitation rather than inventing a derivation.
- Question 2's "on which pass it produces the fixpoint" is genuinely ambiguous in the table (see `feedback.md`); I answered pass 4, the first unchanged pass, and said so explicitly.

### What I learned
- The article's numbers are mutually consistent to within rounding, but 95 and 11,760 are *measurements* presented next to derived figures, and the reader is given no way to tell which are which. That distinction is the single biggest source of the uncertainty in my Question 4 answer.

### What was tricky to build
- Not building, but deciding: Question 4 asks for an explanation the text only half supplies. Writing "the 95 is the sum of passes to fixpoint over seven analyses" is right, but it risks sounding like an explanation when it is a restatement. I chose to state it as a restatement and then show the two consistency checks, so the reader of my answer can see exactly how much is derived.

### What warrants a second pair of eyes
- My Question 3 answer supplies the round-to-nearest-even rule from outside the article. If the author intends a different explanation (for example that the value is simply stored as the nearest double of larger spacing), the wording of 3.3 should be fixed so the answer is in the text.
- My Question 2 answer asserts the fixpoint is on pass 4. If the author means pass 3, the table needs a rewording, not the answer.

### What should be done in the future
- If the article is revised, re-run these six questions against the revision; Questions 2 and 4 are the two that should become unambiguous and fully derivable.

### Code review instructions
- File: `answers.md`. Compare each answer against the section it cites; the `Confidence` lines are the map of where the article under-served the reader.
- Validation: for Question 3, evaluate `(2**53 - 1 + 2) - (2**53 - 1)` in a JavaScript console and confirm it is 1; for Question 4, divide 11,760 by 95 and check the result against "about 124 functions per pass".

### Technical details
- Confidence distribution: 5, 4, 4, 3, 4, 5 — mean 4.17. The single 3 is Question 4.
- Numbers used: 2⁵³ = 9,007,199,254,740,992; spacing above 2⁵³ is 2; join of [0, 0] and [1, 1] is [0, 1]; 95/7 = 13.57; 11,760/95 = 123.8.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections: read-twice passages quoted and diagnosed, undefined terms one per line, unverifiable claims with the missing evidence named, a score per numbered section, the quiz questions the text does not support, and one addition plus one cut. Each item is quoted from the article rather than paraphrased, so the editor can search for it.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Instructions 1 (report only terms that neither the article nor the glossary explains), 3 and 4 of `TASK.md`; the term list had to be filtered against `glossary.md` before being reported.
**Inferred user intent:** Actionable, located criticism — the editor wants to know what to rewrite, not a general impression.
**Commit (code):** none.

### What I did
- Wrote `feedback.md` with the seven read-twice passages, ten term lines, eight unverifiable claims, scores for 3.1–3.7, four problematic quiz questions (3.8 not scored, being the quiz), and the add/cut pair.
- Filtered the term list: dropped *fixpoint*, *join*, *widening*, *range*, *demotion*, *library specialization*, *abstract interpretation*, *tier*, *frontend*, *CJI* because the glossary or the article itself defines them.
- Scored: 3.1 = 5, 3.2 = 3, 3.3 = 4, 3.4 = 4, 3.5 = 3, 3.6 = 4, 3.7 = 4.

### Why
- Section 3.5 got the joint-lowest score because it is the section the article's whole argument rests on and the one where the numbers could not be reconciled by a reader; 3.2 got a 3 for the narrower reason that its single worked example is ambiguous.
- The addition I chose is the per-round cost table, because it repairs the arithmetic behind Questions 4 and 5 at once instead of adding a new topic.
- The cut I chose is RPython/Shed Skin/CPA, because they are support for one key-point bullet and each contributes a number taken from another source; cutting them loses no mechanism. Self had to be exempted, since Question 6 depends on it.

### What worked
- Quoting rather than paraphrasing made it easy to check that every criticism points at real text, including the table cells in 3.4 and 3.5 where the article's most load-bearing figures live.
- Keeping a list while reading (Step 1) meant the feedback did not depend on memory of the article.

### What didn't work
- I could not verify any external citation (Cooper & Torczon, Kildall, Kam & Ullman, Chambers & Ungar, Hölzle & Ungar, Agesen, Dufour, Ancona et al.), and the task forbids the web, so I did not report them as errors — only as claims the article does not let the reader check, which is what the section asked for. The Self pause statistics are the clearest case: a total is missing, so the proportions cannot be audited even with the paper in hand.
- I could not check whether earlier student passes in this round already reported the same items, because I could not list the directory.

### What I learned
- The strongest finding is arithmetic rather than stylistic: 88% of compile time in seven analyses, six of them dropped, should save about 75%, and the article reports 63%. That single inconsistency makes the fourth row of the evidence table, which carries a third of the section's argument, uninterpretable without a sentence about how many early proofs still ran.
- The second strongest is scale: 998 joins per function visit is asserted nowhere and derivable from the article's own totals, and the reader has no way to judge whether that is plausible. This is why the per-round table is the thing to add.

### What was tricky to build
- The term section required a judgement call on *garbage collection* and *bytecode*: both are standard vocabulary outside this series, and the glossary omits them. I reported them as undefined because the article measures them and names them as candidates for the cost, which invites a reader to wonder what is being measured. The same reasoning excluded *i32*, which 3.3 does explain ("wrap around at 32 bits").
- The section scores had to be defensible per section rather than as a global impression, so each reason names the specific passage that cost the point.

### What warrants a second pair of eyes
- My claim that the 63% and the 88% cannot both be right for the variant described. If the "except where an early proof is needed" clause covers many rounds, the numbers are consistent — but the article gives no way to tell, and that is itself the finding.
- My recommendation to cut RPython/Shed Skin/CPA. It is defensible on the article's own logic (nothing downstream uses them), but an editor may value them as series continuity, since `glossary.md` marks terms by article number and these may recur in later articles.

### What should be done in the future
- Add the per-round cost table; either quantify the early-proof exception in the fourth row of 3.5 or explain why it is unquantifiable; state the rounding rule in 3.3; add *call site*, *profile* and *helper* to the glossary or define them on first use; disambiguate *claim* in 3.3.

### Code review instructions
- File: `feedback.md`. Each quoted item should be searchable in `article.md`; each term line should be checkable against `glossary.md` and against the article text.
- Validation: grep the article for the quoted phrases; check that none of the reported terms appears in `glossary.md` as a headword; re-add 12 + 58 + 1 + 4 + 3 + 1 and confirm 79, and recompute (1475 − 544)/1475.

### Technical details
- Term filter rule applied: report a term only if it is absent from `glossary.md` *and* not defined inline in `article.md`. Ten terms survived; the bold-face vocabulary (fixpoint, join, widening, demotion, library specialization, range, abstract interpretation, whole-program inference, frontend) did not.
- Scores: 5, 3, 4, 4, 3, 4, 4 for 3.1–3.7; mean 3.86. 3.8 excluded as the quiz.
- Cross-references that the article defers and a reader of this article alone cannot follow: Article 1 (`countUnit`, `i32`, the typed compiler timings), Article 6 (tiers, content keys/hashing).

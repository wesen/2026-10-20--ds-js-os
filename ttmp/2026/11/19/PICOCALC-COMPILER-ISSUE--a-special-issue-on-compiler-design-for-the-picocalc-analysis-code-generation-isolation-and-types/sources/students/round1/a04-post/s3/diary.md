# Work diary — student read of article 4

## Step 1: Reading the article

I read `article.md` in one pass from the title to the last reference, then re-read section 4.1 once
more because the table at its head is the map for everything after it. I deliberately did not
write anything during the first pass, so that I could report honestly which passages forced a
second reading rather than which ones I had already resolved.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow TASK.md's four numbered steps: read the article, answer its quiz into `answers.md`, write `feedback.md` in six named sections, write this diary in the `diary-format.md` format.
**Inferred user intent:** An editor wants a genuine first-reader report — where the teaching fails, not a summary or a review of the compiler.
**Commit (code):** none (documentation-only session, no repository commit made)

### What I did
- Read `TASK.md`, `diary-format.md`, and `article.md` in full via the read tool.
- Tracked unclear passages and undefined terms as I went, noting which ones resolved later in the text and which never did.

### Why
- Step 1 of the task is the article read; the feedback sections in step 3 require quotes taken from the text, so collecting them during reading avoids reconstructing them from memory.

### What worked
- Reading 4.4 (Key points) last-but-one acted as a free comprehension check: each bullet either matched something I had understood or flagged a gap.
- The waste table in 4.1 gave a reliable skeleton, so I could hold the five techniques in mind while reading the subsections.

### What didn't work
- No failures in tooling. The only dead end was an attempt to list the directory by reading `.`, which returned `EISDIR`; I proceeded with the three files the task names.

### What I learned
- The article is a survey with a thesis: section 4.1 is whole-program inference made cheap, 4.2 is inference made unnecessary, 4.3 is the claim that they meet at declared boundaries.
- Most of the article's numbers are inherited from a companion "Article 3" that is not in this directory, which limits verification to what the text itself argues.

### What was tricky to build
- Deciding where the boundary sits between "I found this confusing" and "the article did not supply this". The π-renaming passage is the hard case: the article does state what π does in one clause, so it is a clarity problem, not a missing-answer problem. I filed it under "read twice" and kept the "cannot answer" list for questions whose answers are genuinely absent.

### What warrants a second pair of eyes
- My claim that Q5 is only partly answerable. A teacher may reasonably disagree and say the general consequences of local checking *are* the handheld consequences; my objection is that nothing distinguishes the device from a workstation in section 4.2.

### What should be done in the future
- If the editor supplies Article 3, the "claims I could not verify" list shrinks a lot and should be revisited.

### Code review instructions
- Compare the six sections of `feedback.md` against the six headings TASK.md names; compare the Confidence lines in `answers.md` against the answers they follow.

### Technical details
- Files read: `TASK.md`, `diary-format.md`, `article.md` (references section included).
- Files written: `answers.md`, `feedback.md`, `diary.md`.

## Step 2: Answering the quiz

I answered all six questions in `answers.md` in my own words, showing the arithmetic in Q1 and the
renaming argument in Q3 explicitly. I added a `Confidence:` line under each answer and tried to make
the number mean something rather than defaulting to 5.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer 4.5's six questions, numbered like the questions, two to six sentences each, working shown for calculations and translations, with a confidence rating 1–5.
**Inferred user intent:** The editor wants to see whether the article actually transmits the material, and wants the uncertainty signal, not just a correct-looking answer.

### What I did
- Wrote six answers, each four to six sentences, each ending with `Confidence: N`.
- Q1: derived `J₁ = i + 1`, substituted `i ∈ [5,7]`, gave [6, 8] with both bound computations shown.
- Q3: wrote out why a shared name forces a merge, then what π adds.
- Q5: gave the definition plus two consequences, and marked the handheld inference openly inside the answer.

### Why
- The task asks for working on calculations and translations; Q1 is the only pure calculation, Q2/Q3/Q6 are translations of an argument into a different phrasing.

### What worked
- Q1 and Q4 were mechanical: the article's own `[0,9] → [1,10]` example is a template for Q1, and the "inside a component, never between components" sentence fully determines Q4. Both got 5.
- Q6 was answerable from two separate places (Static TypeScript's annotations and the Static Hermes quote), which cross-checked the answer.

### What didn't work
- My first draft of Q2 said the summary "depends on the facts" — which is the article's own misleading phrasing, and would have been wrong. I rewrote it as "a dependence, not a fact".
- My first draft of Q5 listed four consequences; the question asks for two, so I cut to two and kept the rest out.

### What I learned
- Answering is a much sharper test than reading. I only noticed how thin the π explanation is when I tried to state it in my own words.
- Confidence 5 felt justified only where the text gives a rule I could apply without interpretation (Q1, Q4).

### What was tricky to build
- Separating "I can answer this" from "I can answer this with confidence". Q2 is answerable but the phrase I have to rely on is the one I distrust, so I gave it 4 instead of 5.

### What warrants a second pair of eyes
- Whether Q5's answer counts as two consequences or as one consequence stated twice (edit isolation and any-order checking are related but I believe genuinely distinct).

### What should be done in the future
- If the editor wants confidence to be calibrated, a second reader should answer independently and the two sets compared.

### Code review instructions
- Check `answers.md` Q1 arithmetic (5+1 and 7+1) and Q4 against 4.1's "Dependency order" subsection.

### Technical details
- `answers.md`: six `##` sections numbered 1–6, each ending in a `Confidence: N` line.
- Confidence values assigned: 5, 4, 4, 5, 4, 4.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections, quoting short passages verbatim and saying
what was unclear about each, rather than only saying that something was unclear. The hardest part
was keeping the "undefined terms" list useful: it is easy to list every technical word, and that
list teaches the editor nothing.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce `feedback.md` with the six named sections: passages read twice, undefined terms, unverifiable claims, per-section scores, unanswerable quiz questions, and one addition plus one cut.
**Inferred user intent:** Concrete, actionable, honest criticism that a working editor can act on sentence by sentence.

### What I did
- Quoted six passages for the "read twice" section, each one or two sentences, each followed by the specific defect.
- Listed fourteen terms used before explanation or never explained, one line each, with the reason it matters where that reason is load-bearing.
- Quoted twelve claims that cannot be verified from this article and named the missing evidence for each (machine, benchmark identity, method, citation, or scale).
- Scored 4.1–4.5 and gave one sentence of reason per section.
- Answered the "questions the article did not let me answer" question with the two partial cases (Q5, partly Q2) rather than claiming all six failed or all six succeeded.
- Chose to add a premise paragraph and to cut the MicroPython paragraph.

### Why
- Section scores are given with reasons because an unexplained "3" is not actionable.
- The add/cut pair was chosen to point at the same underlying problem — the article assumes Article 3's context — so the editor gets one fix, not two unrelated ones.

### What worked
- Going back to the text to quote exact sentences forced precision: several passages I remembered as unclear turned out to be clear, and several I had skimmed turned out to be the real problems (the 450×/precision sentence, "provisional").

### What didn't work
- The MicroPython cut was my second choice. My first choice was to cut the incremental-analysis subsection, which is one paragraph of citations with no worked example; I rejected it because cutting one of the five techniques breaks the article's own map and the promise in the introduction. The MicroPython paragraph leaves the argument intact, so it is the safer cut. I am not certain the editor will agree.

### What I learned
- Almost every unverifiable number in section 4.1 is inherited from Article 3. That is a structural problem, not a sentence-level one, which is why "add a premise paragraph" is the single most valuable change I can suggest.
- The article is at its best where it does a small calculation in the open (`i + 1` over [0,9] gives [1,10]); each of those places caused me no trouble at all.

### What was tricky to build
- The confidence/blame boundary again, this time for the "passages I had to read twice" section. A passage I found hard because I lack the background (lattices, widening) belongs in the undefined-terms list, not the unclear-prose list, and keeping those apart took a deliberate pass.

### What warrants a second pair of eyes
- The section scores. 4.1 at 4 and 4.3 at 3 are defensible but arguable; 4.3 is short and honest about being a proposal, which some readers would call clear rather than thin.
- The assertion in "claims I could not verify" that the first three remedies do not obviously compose. That is my judgement about the techniques, not something the article says, and a compiler specialist may see the composition as trivial.

### What should be done in the future
- Have the editor decide whether the premise paragraph belongs in this article or in Article 3, since duplicating it in both is the likely failure mode.

### Code review instructions
- Verify every quotation in `feedback.md` appears verbatim in `article.md`; check that the six section headings match TASK.md's list exactly.

### Technical details
- `feedback.md` sections: Passages I had to read twice (6 items), Terms used before they were explained, or never explained (14 items), Claims I could not verify from the article itself (12 items), Section scores (table over 4.1–4.5), Questions that the article did not let me answer, One thing to add and one thing to cut.
- No code was executed at any point in this session; no tests exist to run.

# Investigation entry

## Step 1: Reading the article and the glossary

I read `article.md` once from start to finish without stopping, then read `glossary.md`
term by term looking up the words the article used that I was not sure of, and only then
went back through the article a second time to check the arithmetic and the cross-references
between sections. The article is the tenth in a series, so most of its difficulty comes from
sentences that point at earlier articles rather than from the sentences themselves.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, then do steps 1–4: read the article with the
glossary, answer the quiz, write feedback, write this diary.
**Inferred user intent:** Pre-publication check of a teaching article by a reader who does not
have the earlier nine articles to hand, so that the editor learns where the text fails to
teach rather than where it is merely terse.
**Commit (code):** none — this session produced only prose files.

### What I did
- Read `TASK.md`, `article.md`, `glossary.md`, `diary-format.md`.
- Second pass over `article.md` sections 10.1, 10.3, 10.6 and 10.7 with a calculator:
  1,730/316 = 5.47; (468+869)/307 = 4.35; 17×49 = 833; 833×2 = 1,666; 1,666+17×4 = 1,734;
  1,529/593 = 2.58.
- Looked up in `glossary.md`: world, nucleus, engine, reactor, trampoline, CJI, typed
  compiler, lowering, fuel, verifier, PMP, arena, linear type, typestate, state machine,
  continuation, content key, compile-time operand stack.

### Why
The task asks specifically for terms that *neither* the article *nor* the glossary explains,
so the glossary had to be searched per term rather than skimmed. Checking the arithmetic was
the only way to separate "I did not understand" from "the numbers do not add up".

### What worked
- The glossary covered nearly all of the article's vocabulary: world, engine, reactor,
  trampoline, fuel, verifier, arena, linear type, typestate were all there.
- Most of the article's own arithmetic reproduced exactly (1,666 and 1,734 bytes; 5.5 and
  4.4 multipliers).
- Section 10.3's five-step list was the one passage I could follow without going back.

### What didn't work
- I could not find "firmware", "ELF", "capability", "relocation", "garbage collector",
  "mutation testing", "guard facts", "UTF-16", "code unit", "frontend" or "linker" in the
  glossary, although the article's opening paragraph claims "every term is in the glossary".
  Recovery: I treated them as unexplained and listed them in `feedback.md`.
- "Native code about 2.7 times smaller" in step 5 of the roadmap would not reproduce from
  the two counts given (593 and 1,529, ratio 2.58). Recovery: recorded as an unverifiable
  claim instead of assuming an arithmetic slip.

### What I learned
- The article's difficulty is concentrated in noun phrases built from the earlier articles
  ("the counting model", "71 state fields", "the key-to-pixel measurement"), not in its own
  definitions, which are mostly careful.
- A claim of the form "every term is in the glossary" is itself checkable, and this one is
  not quite true — a useful thing to report to an editor.

### What was tricky to build
Understanding section 10.2 took the longest. Three files must agree; the diagram shows a
proposed single source generating all three; but the check described afterwards compares a
header count against *one* table only. The text never says which file holds the header count,
so I had to reason from the trampoline description ("one jump per function, in the same
order") that the count must belong to the assembly side, and that the C file is simply
unchecked — a gap the interface description closes but the article does not name.

### What warrants a second pair of eyes
- Whether "four structural changes" is meant to include section 10.5, since the article never
  says which four it counts.
- Whether the flowchart in 10.6 is meant to agree with the "Unlocks" column of the roadmap
  table; they differ over step 3 → step 10.

### What should be done in the future
- N/A for this session; the follow-ups belong to the editor (see the "Add/Cut" pair in
  `feedback.md`).

### Code review instructions
- Read `answers.md` against sections 10.2, 10.3, 10.4, 10.1 and 10.7 of `article.md`; every
  answer quotes only this article.
- Check `feedback.md`'s arithmetic: 1,529/593 = 2.58, not "about 2.7".

### Technical details
- Files read: `TASK.md`, `article.md` (~200 lines), `glossary.md`, `diary-format.md`.
- Files written: `answers.md`, `feedback.md`, `diary.md`.
- No code was compiled or run.

## Step 2: Answering the quiz

I answered the six questions in `answers.md`, numbered as in the article, keeping each answer
between two and six sentences, showing the multipliers and byte counts as working, and adding
a `Confidence:` line after each.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer questions 1–6 of section 10.9 in my own words, with
working where a calculation is asked for, and self-report confidence 1–5.
**Inferred user intent:** Test whether the article actually teaches enough to answer its own
questions, and to see which answers had to be reconstructed rather than read off.
**Commit (code):** none.

### What I did
- Wrote six answers to `answers.md`; four quote a section directly, two recompute numbers
  (question 5 the 5.5 and 4.4 multipliers; question 6 the 1,529/593 ratio).
- Assigned confidences 5, 5, 5, 4, 4, 5.

### Why
The confidence line is the only place where I can record the difference between an answer I
found in the text and one I inferred from it, which is the difference the editor cares about.

### What worked
- Questions 2, 3 and 6 were directly answerable: the five steps, the rewrite table and the
  predictions table each supply the whole answer.
- Question 1's two named failures ("catches", "cannot catch") are stated in one sentence
  each, so quoting was enough.

### What didn't work
- Question 5 needed a step the article does not take: it lists three missing features
  (allocation, string operations, `await`) as the cause of the 4–6 times multiplier, then
  orders `await` before the ports because of that multiplier, without saying how much of the
  multiplier `await` accounts for. Recovery: I recomputed the multipliers, quoted the
  ordering sentence, and lowered my confidence to 4.
- Question 4 has an awkward edge I could not settle from the text: a bug in the *emitter*
  would also produce a screen mismatch, so "detects an error in the backend" is right but
  incomplete about how the two mismatch kinds would be told apart. I said so in the answer.

### What I learned
- Answering question 1 exposed that "one interface description removes both" is an
  argument the article makes in one clause; a reader has to reconstruct why generation, and
  not comparison, is what fixes the ordering problem.

### What was tricky to build
Question 6 requires naming the observation that refutes a prediction. The table gives a
"Check" and an "If it fails" column but no threshold for the first row, so "what observation
would refute it" had to be phrased as "a count well above 593 and near 1,529" — the article
supplies the comparison but leaves the margin to the reader.

### What warrants a second pair of eyes
- Answer 4's remark about distinguishing emitter bugs from backend bugs is my own addition;
  an editor should confirm the article does not intend to address it.

### What should be done in the future
- N/A.

### Code review instructions
- Compare each answer with the section it cites; confirm no answer relies on an earlier
  article of the series.

### Technical details
- `answers.md`: 6 numbered answers, each ending in `Confidence: N`.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six requested sections: passages I had to read twice (seven
quotations with the reason), terms used before explanation or never explained (eleven
entries), claims I could not verify (nine quotations), scores for sections 10.1–10.9, the
questions the article did not let me answer, and one thing to add and one to cut.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Report honestly where the article fails to teach, quoting rather
than paraphrasing, and score each numbered section 1–5 with one sentence of reason.
**Inferred user intent:** An actionable pre-publication review: exact quotations so the
editor can find the sentence, and a distinction between "hard for me" and "missing".
**Commit (code):** none.

### What I did
- `feedback.md`, six headed sections matching the task's wording.
- Scored: 10.1 = 4, 10.2 = 4, 10.3 = 4, 10.4 = 3, 10.5 = 4, 10.6 = 3, 10.7 = 4, 10.8 = 5,
  10.9 = 4.
- Cross-checked every listed term against `glossary.md` before writing the line, and dropped
  those the glossary actually defines (world, engine, reactor, trampoline, fuel, verifier,
  PMP, arena, typestate, continuation).
- Proposed adding a worked interface-description example and cutting the WIT
  resource/handle aside.

### Why
Quotation plus one line of diagnosis is the only form the editor can act on; a general
impression ("dense") would be useless. For add/cut I chose the smallest change that repairs
the section the quiz leans on most (10.2) and the passage that carries no roadmap weight.

### What worked
- The arithmetic checks gave objective findings: the 2.7-versus-2.58 discrepancy, and the
  "four to six times" range being wider than the 4.4 and 5.5 actually quoted.
- The glossary-vs-article term sweep produced a concrete list; "firmware" in the very first
  sentence is not defined in either file.

### What didn't work
- The task asks to report only terms that *neither* the article *nor* the glossary explains,
  and for a few entries I am not fully sure the article does not explain them in passing —
  "capability" is used once and might be meant to be the glossary's *Claim*. I listed it with
  that doubt stated rather than silently dropping it. Recovery: noted in the line itself.
- I could not decide which of the article's internal cross-references are deliberate
  forward-references and which are omissions, so the "claims I could not verify" section
  sticks to quoting and naming the missing figure.

### What I learned
- Most of my reading difficulty was not vocabulary but unstated quantities: the article
  argues from measurements in other articles without ever restating one of them, which makes
  its own conditionals ("started only if the measurement confirms") impossible for a reader
  of this article to evaluate.

### What was tricky to build
Keeping the "passages I had to read twice" section honest was the hard part. Some sentences
were hard because they are genuinely unclear (the nested fuel/capability sentence) and some
because I lacked the earlier articles (the 71 state fields). Mixing them would mislead the
editor, so I recorded the second kind under unverifiable claims and cross-references and
labelled it as such inside the entry.

### What warrants a second pair of eyes
- The section score of 3 for 10.6 rests on the flowchart/table mismatch over step 3 → step
  10; if the graph is meant to show only the strongest dependencies, the score should rise.
- The "cut" recommendation removes a sentence that justifies part of the description
  format; an editor may prefer to shorten rather than cut it.

### What should be done in the future
- If the article is revised, restate Article 2's key-to-pixel figure and Article 8's state
  field count in this text, since both are now load-bearing for the roadmap's ordering.

### Code review instructions
- Check each quoted passage against `article.md` (search the distinctive phrase) and each
  term against `glossary.md`; the claim that a term is missing should be reproducible by
  searching both files.
- Re-run the two ratios: 1,730/316 = 5.47 and 1,529/593 = 2.58.

### Technical details
- `feedback.md`: 7 passages, 11 terms, 9 unverifiable claims, 9 section scores, 2 partly
  unanswerable quiz questions, 1 add, 1 cut.
- Terms searched in both files and found missing: firmware, ELF, capability, relocation,
  garbage collector, mutation testing, guard facts, UTF-16/UTF-8/code unit, interpreter,
  Agenda/Files, frontend/linker.

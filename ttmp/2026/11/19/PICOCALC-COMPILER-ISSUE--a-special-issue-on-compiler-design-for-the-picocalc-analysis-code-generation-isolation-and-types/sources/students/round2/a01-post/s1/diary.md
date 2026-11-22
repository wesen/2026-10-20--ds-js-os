# Investigation entry

## Step 1: Reading the article and the glossary

I read `article.md` straight through once without stopping to look anything up, to see where it
lost me, then read `glossary.md` and went back over the sections where I had guessed at a word.
Reading first and looking up second turned out to matter: several terms I thought I understood
(the string type, `text.length`) are explained nowhere, and only the second pass showed that the
glossary does not cover them either.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Act as a student reader of a pre-publication teaching article:
read the article, answer its quiz, then write honest feedback and this diary, all inside this
directory.
**Inferred user intent:** The editor wants to know where the article fails to teach, before it is
published, from someone who had no part in writing it.
**Commit (code):** N/A — no code was written or run.

### What I did
- Read `TASK.md`, `article.md`, `glossary.md`, `diary-format.md`.
- Read Article 1 end to end (sections 1.1–1.8), then re-read 1.2, 1.3 and 1.4 against the
  glossary, checking each bolded term for a glossary entry.

### Why
- Two passes (uninterrupted, then with the glossary) is what a real reader does and it separates
  "I was confused" from "the text never said".

### What worked
- The glossary covers the article's own coined vocabulary completely: world, turn, turn budget,
  claim, manifest, nucleus, engine, reactor, bytecode-adjacent terms, trap, lowering, CJI, typed
  compiler. I did not have to guess at any bolded term.
- Section 1.1's resource table and section 1.5's comparison table were readable at one pass.

### What didn't work
- No failures; nothing was executed or tested in this step.

### What I learned
- The gaps are not in the coined vocabulary but in the *assumed* vocabulary: firmware, code
  unit, JSON, bounds check, counted sequence, RISC-V.
- The glossary's bracketed article numbers are useful for spotting terms the article uses early
  but explains late (e.g. *Verifier* [7] is invoked in section 1.1 in plain words).

### What was tricky to build
- Judging "used before explained" versus "explained later in the same article": I resolved it by
  reporting only terms that neither `article.md` nor `glossary.md` defines anywhere, as TASK.md
  asks.

### What warrants a second pair of eyes
- Whether "firmware" really is undefined or whether the editor counts the phrase "shipped in the
  firmware" in the reactor definition as a definition. I judged it a use, not a definition.

### What should be done in the future
- Have a reader outside embedded systems confirm the firmware/code unit/JSON list.

### Code review instructions
- Compare my term list in `feedback.md` against `glossary.md` for the absence of each entry.

### Technical details
- Files read: `TASK.md`, `article.md` (8 sections), `glossary.md` (~60 entries), `diary-format.md`.

## Step 2: Answering the "Check your understanding" questions

Six questions, six answers in my own words, with the arithmetic shown where a question asked for
a comparison (Q4). I checked the article's own numbers against each other while I was there,
which is how I noticed that 290.6 / 52.9 = 5.5×, 240,452 / 88,255 = 2.7× and 768 − 710 = 58 KiB
all hold, but that "about a thousand" fits the compile-time ratios only roughly.

### Prompt Context
**User prompt (verbatim):** See Step 1.
**Assistant interpretation:** Write `answers.md`, answers numbered like the questions, two to six
sentences each, one `Confidence: N` line per answer.
**Inferred user intent:** Test whether the article teaches what it claims to teach, using the
article's own questions as the test.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers and a confidence line after each.
- Did the multiplications and subtractions for Q4 (103 × 4 = 412 bytes; 710 − 528 = 182 KiB)
  and the divisions for the compile-time ratios while writing `feedback.md`.

### Why
- Showing working where a question asks for a calculation is required by TASK.md, and it also
  exposed one soft claim in the prose.

### What worked
- Q1, Q5 and Q6 came out at confidence 5 — those parts of the article state their rule and then
  apply it, so no inference was needed.
- Q2 and Q3 answerable, but Q2's native case only by inference from "runs with firmware
  privileges".

### What didn't work
- Q4: the article gives the reason (instruction width) clearly, but nothing lets me check the
  182 KiB attribution ("not all of the difference is code"), so I stopped at confidence 4.

### What I learned
- A quiz question can be answerable while the *justification* is missing; that difference is
  what the confidence numbers capture.

### What was tricky to build
- Keeping each answer to two to six sentences while still naming specifics: I cut the glossary-
  style restatements and kept quoted phrases instead.

### What warrants a second pair of eyes
- Q3: "two facts" — I gave two plus a third (the range of `at`). Whether the range fact counts as
  a separate fact from "what `unit` can be" is arguable.

### What should be done in the future
- N/A.

### Code review instructions
- Read `answers.md` beside section 1.8 of `article.md`; check each answer against the paragraph
  it should come from.

### Technical details
- Ratios computed: 425/3.14 ≈ 135; 1475/0.72 ≈ 2049; 206/0.25 ≈ 824; 523/0.72 ≈ 726;
  240,452/88,255 ≈ 2.72; 290.6/52.9 ≈ 5.49; 103 × 4 = 412; 710 − 528 = 182; 768 − 710 = 58.

## Step 3: Writing the feedback

The hardest part was separating three things that feel the same while reading: a passage I had to
re-read because it was dense, a term that was simply never explained, and a claim whose evidence
is in some other document. I kept the sections apart by asking of each candidate sentence: could
re-reading fix this, could a glossary lookup fix it, or is something missing that no amount of
re-reading supplies?

### Prompt Context
**User prompt (verbatim):** See Step 1.
**Assistant interpretation:** Write `feedback.md` with the six named sections, quoting real text
from the article.
**Inferred user intent:** Give the editor a specific, actionable list of failures rather than a
general verdict.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md`: six quotations for the re-read section, nine never-explained terms,
  eleven unverifiable claims, a score for each of sections 1.1–1.8, the two quiz questions that
  needed inference, and one addition plus one cut.
- Scored 1.2 and 1.4 lowest (3) and 1.1, 1.7 highest (5).

### Why
- Section 1.2 introduces eight terms plus their sub-terms in three pages; section 1.4 explains
  CJI's problem superbly and then assumes the reader knows the string layout.

### What worked
- Quoting with the original wording made the "why it was unclear" sentences easy to write and
  keeps them checkable.

### What didn't work
- I could not verify the article's central causal claim ("what is expensive is producing machine
  code from untyped source") because the controlled experiments are in Article 3, which is not in
  this directory. I recorded that as an unverifiable claim rather than solving it.

### What I learned
- The article is honest about its own weaknesses — it warns twice that its compile-time table is
  not a controlled comparison — but the warning is pushed onto the reader instead of the claims
  being narrowed.

### What was tricky to build
- The "one thing to cut" decision. Several candidates (the same-week sentence, the two cautions)
  are true and worth keeping; the QuickJS conclusion sentence is the only one I judged both
  unsupported and actively misleading, because QuickJS's 37 ms makes the typed compiler's 0.52 s
  look slow while the paragraph claims the opposite.

### What warrants a second pair of eyes
- The claim that native code "may also do anything the firmware may do" versus the article's own
  rule that a stopped world leaves the others running: I flagged the missing consequence of a
  native fault, and the editor may consider it out of scope for Article 1.

### What should be done in the future
- Restore, in section 1.6, at least the measurement conditions for the two headline paired
  numbers (1,475 s and 425 s), or link the companion report by section.

### Code review instructions
- Check each quotation in `feedback.md` against `article.md` with a text search; every one is
  verbatim.

### Technical details
- Quoted passages are from sections 1.1, 1.2, 1.3, 1.4, 1.5 and 1.6; term list cross-checked
  against `glossary.md` for the absence of each entry.

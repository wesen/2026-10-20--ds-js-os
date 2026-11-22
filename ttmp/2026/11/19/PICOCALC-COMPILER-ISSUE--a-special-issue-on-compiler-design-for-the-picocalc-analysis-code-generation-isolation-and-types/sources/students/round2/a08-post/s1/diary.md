# Investigation entry

Student read of TASK.md in `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a08-post/s1`. Three steps: reading the article, answering the quiz, writing the feedback.

## Step 1: Reading the article and the glossary

I read `TASK.md` first, then `article.md` straight through once without stopping, then `glossary.md`, then went back over sections 8.2 to 8.6 a second time because that is where the argument is dense. The aim was to read as a student would: no looking ahead at the quiz, no outside sources, and noting every place where I had to stop and reconstruct what the previous paragraph meant.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the article as a test reader, answer its quiz, and write honest feedback plus a diary, all inside the working directory.
**Inferred user intent:** The editor wants to know where the article fails to teach before it is published, so accuracy about my own confusion matters more than a polished verdict.
**Commit (code):** none — no code was changed in this session.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (all sections 8.1–8.9 and the reference list) and `glossary.md`.
- Noted first-read stumbling points in a scratch list as I went: the two-field tag in 8.3, the `sourceLength` versus `length` mismatch between 8.2 and 8.4, the `text` listing that violates the rule stated after it, and the `goto` versus WebAssembly switch in 8.5.
- Looked up, in the glossary, the terms the article uses in passing: continuation, defunctionalization, stack ripping, liveness, split-phase operation, token, frame, fuel, turn budget, reactor, slot, trampoline. All were present.

### Why
- Reading the glossary only after the article avoids the temptation to treat the glossary as the article's explanation; a term that is defined only in the glossary is still a term the article leaned on.
- Keeping a scratch list during the read, rather than reconstructing confusion afterwards, is the only way the feedback can be honest about what was hard at the time.

### What worked
- The article is short enough to hold in one pass, and the key-points list in 8.8 was a useful check that I had not missed a thread.
- The liveness table in 8.4 is the single most helpful device in the article; it turned an abstract rule into something I could verify by hand against the listing.

### What didn't work
- My first pass over 8.3 left me believing the tag was one field. Re-reading 8.5's frame table, which uses `state` alone, made me go back; the article never states the correspondence, so I had to build it myself. Recovery: I treated `readToken` + `reading` as a two-bit encoding and noted the gap in feedback rather than inventing an explanation.

### What I learned
- The article's real subject is the identification "hand-written token fields = defunctionalized continuation", and everything else (liveness, static frames, the state machine) is machinery around that one identification. Reading with that as the spine made 8.4–8.6 fit together.
- Section numbering matters for feedback: several of my complaints were about a rule stated after the example it should have governed, which is a section-order problem, not a wrongness problem.

### What was tricky to build
- Deciding which of my confusions were mine and which were the article's. Several terms (WebAssembly, activation record, scalar) I happen to know from elsewhere, so I had to check deliberately whether the article or the glossary defined them before reporting them.

### What warrants a second pair of eyes
- Whether the wished-for `openFile` listing is intentionally illegal (to motivate the buffer rule) or accidentally so; the editorial intent changes whether this is a bug or a teaching device.
- The count of 71 state fields and the 80-field reactor limit, which I could not check at all from this directory.

### What should be done in the future
- If the editor wants quantitative claims checked, the Editor sources (`worlds/editor/editor.typed`, `worlds/editor/find.typed`) or the design notes would have to be in this directory; the article alone cannot support them.

### Code review instructions
- Nothing to review; validation is reading `feedback.md` against `article.md` section by section.

### Technical details
- Materials read: `TASK.md`, `article.md` (9 numbered sections plus references), `glossary.md`, `diary-format.md`.
- No files outside the working directory were opened and no web access was used.

## Step 2: Answering the six quiz questions

I wrote `answers.md` with one numbered answer per question, each two to six sentences and each followed by a `Confidence:` line. The instruction to show working mattered for question 2, which is the only one that is really a small computation — marking each variable of `openFile` at the second wait — and for question 4, which is a translation from the source form to the two entry points.

### Prompt Context
**User prompt (verbatim):** see Step 1 — "Answer the questions in its 'Check your understanding' section. Write the answers to `answers.md`, numbered like the questions."
**Assistant interpretation:** Answer from the article only, in my own words, with a confidence number per answer.
**Inferred user intent:** The confidence numbers are the point: they show the editor which questions the text genuinely teaches and which it only appears to.
**Commit (code):** none.

### What I did
- Wrote `answers.md` with answers 1–6 and confidence lines (5, 4, 4, 5, 4, 5).
- For question 2, built the live/dead mark-up by hand for each of the eight variables at both waits, then justified `stop` by pointing at where it is recomputed.
- For question 4, wrote out the mapping `frame.state → resumption point` and what each entry point receives.

### Why
- Marking all eight variables rather than only the live ones, because the question asks "which are not" and the dead ones carry the reasoning about `handle` and `stop`.
- Giving confidence 4 rather than 5 on questions 2, 3 and 5 because in each case part of the answer had to be inferred rather than read: the `text` entry conflicts with the listing, the two-field tag is never mapped to `frame.state`, and the frame-layout rule has an unstated alternative.

### What worked
- Question 1 and question 6 could be answered almost verbatim from 8.1 and 8.7, which is a good sign for those sections.
- The framing in 8.5's algorithm block (number the waits, compute liveness, store, reload, clear state) made question 4 mechanical once I had the outline in front of me.

### What didn't work
- Question 5's second half. My first answer said "the compiler must know the number", which is just repeating the article; I could not construct the reason myself, because the article does not say why a declared pool of N frame-sets indexed at run time would not work. I left the answer as the article's claim and recorded the gap in `feedback.md` instead of guessing.

### What I learned
- Answering the quiz revealed a weakness the reading alone did not: question 2 is only answerable if you decide whether `text` is dead or illegal, and the article leaves that undecided.

### What was tricky to build
- Keeping to the two-to-six sentence limit while still showing working. For question 2 I put the mark-up into prose; a reader of `answers.md` can check the conclusion but not step through a table.

### What warrants a second pair of eyes
- My answer to question 3 maps `{readToken, reading}` onto `frame.state ∈ {0,1,2}`; if the editor intends `readToken` alone plus a different flag field, my answer is wrong in detail even though the shape is right.

### What should be done in the future
- N/A for this task; a version of question 2 that asks explicitly about the buffer rule would remove the ambiguity.

### Code review instructions
- Read `answers.md` beside `article.md` 8.4 and 8.5; check that answers 2, 3 and 5 do not assert anything the article does not contain.

### Technical details
- Confidences: 5, 4, 4, 5, 4, 5 (questions 1–6).
- Computation in question 2: live at wait 2 = {`length`, `read`, `written`}; dead = {`handle`, `ok`, `stop`}; excluded by rule = {`text`}; parameter = {`state`}.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six required sections. The hardest part was keeping the sections distinct: a passage I had to read twice is a writing problem, a term used before explanation is a vocabulary problem, and a claim I could not verify is an evidence problem, even when all three come from the same paragraph. I sorted my scratch list into those three buckets and then scored each section.

### Prompt Context
**User prompt (verbatim):** see Step 1 — "Write `feedback.md` with these sections: ... Passages I had to read twice ... Terms used before they were explained ... Claims I could not verify ... Section scores ... Questions that the article did not let me answer ... One thing to add and one thing to cut."
**Assistant interpretation:** Quote verbatim where a quote is asked for, give one sentence of reason per section score, and be specific about what is missing.
**Inferred user intent:** The editor needs actionable items — a quote plus a diagnosis per item — not an overall verdict.
**Commit (code):** none.

### What I did
- Wrote `feedback.md` with five passages quoted, nine term lines, ten unverifiable claims, scores for all nine numbered sections (5, 3, 4, 4, 4, 3, 5, 4, 4), the partially-answerable quiz questions, and the add/cut pair.
- Checked each quoted passage against `article.md` character by character so the quotes are exact.
- Deliberately reported no term that either the article or the glossary explains — `continuation`, `defunctionalization`, `liveness`, `stack ripping`, `frame` and `fuel` are all defined and are therefore absent from the terms list.

### Why
- Scoring 8.2 lower than 8.3 and 8.4 even though 8.2 is the most engaging section, because the listings in 8.2 do not agree with the rules that follow; a section can be vivid and still fail to teach.
- Choosing the number that motivates the two waits as the thing to add, because it would replace four separate unverifiable assertions with one checkable table.
- Choosing the Protothreads/Céu/Embassy paragraph as the thing to cut because it follows the article's hardest argument and dilutes it.

### What worked
- Sorting by bucket first made the write-up fast; almost every item had already been noticed during Step 1 and only needed its quote extracted.
- The liveness table and the algorithm block in 8.5 gave me my two highest-scoring reasons, which kept the scoring from being uniformly negative.

### What didn't work
- My first draft of "Claims I could not verify" contained three items that were really "terms not explained" (activation record, scalar, kind 4). I moved them to the terms section; mixing them would have hidden that the article's problem there is vocabulary rather than evidence.

### What I learned
- Most of the unverifiable claims are counts and quotes attributed to the project's own source and tests (71 fields, six positions, 1,024 units, 80 fields, "The editor is saving."). The article is careful to cite external literature and careless about citing itself, which is the reverse of what I expected.
- The buffer rule in 8.4 is the article's best idea and its worst-presented one: it is stated after the example that breaks it.

### What was tricky to build
- Judging the article's hardest argument (task versus function in 8.6) fairly. I could follow the recursion argument but not the step from "function" to "task", and I could not tell whether that was my limit or the text's; I recorded it as a section-score reason with confidence in the diary rather than as a flat defect.

### What warrants a second pair of eyes
- The scores for 8.5 and 8.6 (both below 5) rest partly on terms I could not find defined anywhere in this directory; if `WebAssembly` and `activation record` were introduced in earlier articles, those two deductions may be unfair and should be checked against Articles 1 and 7.

### What should be done in the future
- Add the worked 64 KiB / 200 ms / 4096-unit arithmetic and a filled-in frame for `openFile`; cut or footnote the survey of Protothreads, Céu and Embassy at the end of 8.6.

### Code review instructions
- Compare each quote in `feedback.md` with `article.md`; the five passages are in 8.3, 8.4 (twice), 8.5 and 8.6 and each can be located by its first four words.

### Technical details
- Section scores: 8.1 = 5, 8.2 = 3, 8.3 = 4, 8.4 = 4, 8.5 = 4, 8.6 = 3, 8.7 = 5, 8.8 = 4, 8.9 = 4.
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. Nothing else in the directory was modified.

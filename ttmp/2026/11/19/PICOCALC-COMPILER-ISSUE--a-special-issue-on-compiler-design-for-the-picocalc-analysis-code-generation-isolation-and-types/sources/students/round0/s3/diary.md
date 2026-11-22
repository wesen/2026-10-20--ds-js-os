# Work diary — student read of the PicoCalc compiler brief

## Step 1: Pre-test answered from memory

I answered the fourteen pre-test questions before opening the brief, so that my later reactions
would be honest about what I already knew versus what I only recognised. I wrote each answer in
two to four sentences and rated my own confidence, marking the two questions where I could only
produce vocabulary rather than a mechanism.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four numbered steps in `TASK.md`: pre-test first, then
read the brief, then reactions, then this diary.
**Inferred user intent:** The editor wants an unflattering, specific record of what a novice
reader does and does not understand in a compressed expert brief, so the brief can be fixed or
turned into a teaching series.
**Commit (code):** N/A — documents only, no code in this directory.

### What I did
- Read `TASK.md` and `diary-format.md`.
- Wrote `pretest-answers.md` with answers to all 14 questions plus confidence ratings.
- Deliberately did not open `dense-brief.md` until the answers were on disk.

### Why
- The task says "Do NOT read `dense-brief.md` yet", and the point of a pre-test is destroyed if
  the reading leaks into it. Writing the file first also gives an auditable timestamp of what I
  knew beforehand.

### What worked
- All fourteen questions were answerable at some level; highest confidence on peephole
  optimisation (4), typestate (4), acyclic-call-graph stack bounds (4) and Amdahl's law (4).
- Lowest confidence on the timed-event-handler question (2) and whole-program inference (3).

### What didn't work
- No failures observed. I did not verify any answer against a source, per the instruction not to
  search the web.

### What I learned
- My knowledge is vocabulary-heavy: I can produce the term and a rough gloss for "widening",
  "defunctionalization" and "sparse analysis" but I could not hand-execute any of them.

### What was tricky to build
- Calibrating confidence honestly. It is tempting to mark everything 4. I marked down the ones
  where I noticed I was reconstructing from the shape of the word.

### What warrants a second pair of eyes
- Whether my pre-test answers are *wrong* rather than merely incomplete. An editor should check
  answers 1, 2, 3, 5, 8, 9 specifically.

### What should be done in the future
- If this pre-test is reused, expand the abbreviation list (CJI, RV32, ESP32-P4) — I had to guess
  at what the questions were about.

### Code review instructions
- Read `pretest-answers.md` and compare against the confidence ratings.

### Technical details
- Files: `pretest-answers.md` (new). No sort of code involved.

---

## Step 2: Read the dense brief

I read `dense-brief.md` once, straight through, then re-read it section by section while
collecting terms and unclear claims. I kept a running list rather than trusting memory, because
the brief compresses a lot of citations into few clauses.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Step 2 is "now read `dense-brief.md`" — read only, no writing yet.
**Inferred user intent:** Establish ground truth for the reaction document; the editor wants to
know what a reader sees when reading the brief cold.
**Commit (code):** N/A

### What I did
- Read `dense-brief.md` in full (it is short, roughly 500 words, but very dense).
- Noted the seven `##` sections for the clarity scoring step.
- Noted which sentences the pre-test had already primed me for (isolation, peephole, arenas) and
  which it had not (jump functions, ABCD, defunctionalized continuations, Slim binaries).

### Why
- Reading twice — once for the argument, once for the paragraph-level details — is how I could
  separate "I disagree" from "I cannot parse this".

### What worked
- The isolation section reads as an argument chain and I could restate it.
- The opening context paragraph is genuinely clear about the two compilers.

### What didn't work
- No failures observed at this step.

### What I learned
- The brief's density is a citation density, not a sentence-length problem. Nearly every
  parenthesis contains a proper noun I do not know.
- Three of the sections (load time, type system directions, architecture) are agenda-shaped: one
  sentence per idea, no problem statement.

### What was tricky to build
- Distinguishing "term I cannot explain" from "claim I cannot follow". Some sentences are both,
  e.g. the defunctionalized-continuations sentence; I filed it under both with different framing.

### What warrants a second pair of eyes
- Whether the brief is *correct*. My reactions can only report comprehension, not truth. In
  particular I could not check the claim that recursion is impossible given only the
  register-name-after-parse rule.

### What should be done in the future
- A glossary of the ~30 names in the brief, or footnote-style one-line glosses, would remove most
  of my comprehension failures without lengthening the argument.

### Code review instructions
- Compare `dense-brief.md` against the "Terms I could not explain" list in
  `brief-reactions.md` and decide which terms deserve glosses.

### Technical details
- `dense-brief.md` `##` sections: What I would do next; Why one compiler is slow and the other
  fast; Code generation; Load time; Isolation; Type system directions; Architecture.

---

## Step 3: Wrote the reaction document

I turned my running list into `brief-reactions.md` with the six required sections: terms I could
not explain (31 items), claims I could not follow (23 items), clarity scores per section, 14
questions, an eight-lesson teaching order, and the three places a worked example would help most.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Step 3 asks for a specific six-part structure; each item must quote
the sentence it came from, and the questions must number at least eight.
**Inferred user intent:** Give the editor actionable, quotable evidence rather than a verdict, so
the brief or the series can be revised at the exact weak points.
**Commit (code):** N/A

### What I did
- Wrote `brief-reactions.md` with the six required headings.
- Quoted the source sentence for every term and every unclear claim.
- Scored all seven `##` sections: 3, 3, 2, 2, 4, 2, 2.
- Wrote 14 questions (requirement: at least 8).
- Proposed eight lessons, each with a "must explain first" line.
- Named three example/picture requests, plus one honourable mention (a cost/benefit table).

### Why
- Quoting is what makes the document useful as a revision checklist; a term list without its
  sentence cannot be acted on.
- I ranked the code-generation and type-system sections lowest because they name techniques
  without giving the mechanism, which is precisely where a novice cannot follow up independently.

### What worked
- The "terms" list was easy to produce and is the most actionable part.
- The teaching order was the clearest output: the brief's own order (context, diagnosis,
  backend, actions, safety, types, architecture) puts the recommendation *before* the safety and
  type material it depends on.

### What didn't work
- No failures observed. I could not check the accuracy of my own glosses where I attempted them
  (e.g. my guess that ABCD might relate to bounds-check elimination), and I flagged that guess as
  a guess in the text.

### What I learned
- Where the brief gives a reasoning chain (isolation), I could follow it fully. Where it gives a
  list of names (code generation, type directions), I retained almost nothing. That is a
  transferable lesson about writing for novices.

### What was tricky to build
- Keeping "terms" and "claims" from swallowing each other: the `await` sentence and the
  recursion sentence each needed a term entry and a claim entry, framed differently.
- Honest scoring. It is tempting to give everything a 3. I gave 4 only to isolation and 2 to
  three sections, and said why in one sentence each as required.

### What warrants a second pair of eyes
- The clarity scores are subjective; an editor may want a second reader's scores to compare.
- My claim that mixed mode "doubles the testing surface" is my inference, not something the brief
  says; it should be marked as such if it is used.

### What should be done in the future
- N/A for this session; follow-ups live in the questions section of `brief-reactions.md`.

### Code review instructions
- Start with the clarity table, then the questions. Read the terms list last, as a glossary
  checklist.

### Technical details
- Files: `brief-reactions.md` (new). Section scores recorded as 3/3/2/2/4/2/2.

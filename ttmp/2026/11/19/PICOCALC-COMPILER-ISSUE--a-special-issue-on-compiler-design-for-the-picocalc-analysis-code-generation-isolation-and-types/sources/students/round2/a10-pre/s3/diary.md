# Investigation diary

## Step 1: Answering a quiz about an article I was not given

I read `TASK.md`, `quiz.md` (six questions on an article titled "10. Architecture and a Roadmap") and
`diary-format.md`, then wrote `answers.md`. The article itself was not in the directory, and the task forbids
looking outside it, so I answered from the wording of each question plus general compiler/runtime knowledge, and
flagged explicitly wherever an answer depends on a fact I cannot have.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow `TASK.md`: read the quiz, write `answers.md` with numbered answers and a
`Confidence: N` line each, then write this diary entry in the `diary-format.md` format, then reply `DONE`.
**Inferred user intent:** Produce a baseline "cold reading" of the quiz so the editor can compare a reader who
never saw the article against readers who did — i.e. measure whether the questions are answerable/guessable from
their wording alone, and where the article must carry the information itself.
**Commit (code):** n/a — no repository work, documents only.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences plus a `Confidence: N` line.
- Wrote this entry.

### Why
- Answering before reading is the point of the exercise; refusing to answer would destroy the signal.
- I kept the reasoning explicit (what the answer *must* look like) instead of pretending to know specifics such
  as the section 10.1 numbers or the exact predictions in 10.7.

### What worked
- Q1–Q4 were answerable in substance from the question text: a count-only header check vs. an interface
  description, text-vs-binary pipeline steps, annotation erasure vs. runtime semantics, and differential testing
  limits are all standard reasoning. These got confidence 3–4.
- Q3 and Q4 in particular have unambiguous answers independent of the article (integer division/truncation and
  value-vs-reference semantics; shared-front-end bugs are invisible to differential testing).

### What didn't work
- Q5 and Q6 could not be answered as posed. Q5 requires the figures of section 10.1; Q6 requires naming an actual
  prediction from section 10.7. No failure command; the limitation is missing source material, consistent with the
  "no web" rule. Recovery: state "I cannot know this without the article" and give the form the answer must take.

### What I learned
- Every question is phrased so that the *shape* of the answer is inferable even when the content is not, which
  makes the quiz a decent test of whether the article adds information beyond what a competent reader can guess.
- Confidence is not uniform across the set: structural questions (4–5) vs. numbers and named predictions (2).

### What was tricky to build
- Q2 was the hardest to answer honestly: "which three of five steps exist only because of text" depends on the
  article's exact five-step enumeration. I named the three that must be formatting/transmission/parsing and the two
  that must be change-detection and device commit, and marked it confidence 3 rather than asserting a list I
  have not read.

### What warrants a second pair of eyes
- Whether my Q2 split (diff → format → transmit → parse → blit) matches the article's actual five steps; if the
  article enumerates them differently, my three/five assignment could be wrong while still sounding plausible.
- Whether the Q1 "mistake it misses" is the permutation case or something else (e.g. a stale but equal count in a
  different table) — the answer reads well but is reconstructed.

### What should be done in the future
- Give the student readers the article, or run a second pass with the article and diff the two answer sets; the
  delta is exactly the information the article adds over a knowledgeable guess.

### Code review instructions
- Read `answers.md` and check each `Confidence` line matches how much of the answer is inference vs. quoted fact;
  Q5 and Q6 should be visibly hedged.

### Technical details
- Directory contains: `TASK.md`, `quiz.md`, `diary-format.md`; produced `answers.md`, `diary.md`.
- Answer keywords: interface description vs. hand-maintained count; format/transmit/parse vs. diff/commit;
  truncation + masking for integer ops, explicit copies for value semantics; differential testing blind to shared
  front-end and to hardware timing/memory.

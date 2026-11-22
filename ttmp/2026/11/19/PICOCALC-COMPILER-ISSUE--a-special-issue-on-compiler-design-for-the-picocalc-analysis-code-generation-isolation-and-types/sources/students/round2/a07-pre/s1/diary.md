## Step 1: Answering a quiz about an article I was never shown

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and confirmed that the directory contains no
copy of the article "7. Safety by Construction: Running Native Code Without Trusting It" — only the
six questions about it. So every answer had to be reconstructed from the wording of the questions
plus what such a design must look like (a small JS OS with a native-code path, a loader with a
whitelist of callables, a stack/cost analysis over a call graph, and a memory-safety story involving
a software verifier and hardware region protection). I wrote the answers to `answers.md` numbered
1–6, each 2–5 sentences, each ending with a `Confidence:` line.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four steps in `TASK.md`: read the quiz, answer it from prior
knowledge into `answers.md` with confidences, write `diary.md` in the format of `diary-format.md`, and
finish with the single line `DONE`.
**Inferred user intent:** Test whether the teaching article is evaluable without the article — i.e.
whether its questions are answerable from general knowledge, and where they leak facts only the text
supplies. The confidences are the measurement.
**Commit (code):** N/A (no repository or commit performed).

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the working directory.
- Wrote `answers.md` with six numbered answers and a `Confidence: N` line after each.
- Wrote this `diary.md` in the full entry format.

### Why
- The instructions explicitly forbid searching for the article or the web, so reasoning from the
  question wording was the only legitimate route.
- I marked the quoted-fact questions (definitions in 7.4, the charge rule in 7.5, the two techniques
  in 7.6) as low confidence rather than inventing precise quotes that a later comparison would expose
  as fabricated.

### What worked
- Q1, Q2 and Q6 were answerable in substance: "contract not a wall" is an interpretable phrase, the
  recursion/fixed-point consequence in Q2 follows from definition-before-use translation, and the
  verifier-versus-PMP tradeoff in Q6 follows from what hardware protection units can and cannot do.
- Q5 was answerable at the level of *which* technique survives a compiler bug, which is the question's
  real point.

### What didn't work
- No tool or command failures. The substantive miss is Q4: without the article I cannot say what the
  "larger amount" is a bound *of* (iteration count vs. weighted work vs. per-component budget), so the
  answer is a spelled-out guess rather than a definition.
- Q3 likewise: the recursive max-over-callees definition is almost certainly the article's, but I
  cannot verify its exact phrasing (frame size plus max vs. plus sum, treatment of spills).

### What I learned
- The quiz is heavily dependent on the article for numbers and definitions: only 1, 2, 5 and 6 are
  reachable by reasoning; 3 and 4 require the text. If the article is meant to be self-contained
  teaching material, questions 3 and 4 are the ones that will read as under-specified to a reader who
  skipped a section.

### What was tricky to build
- Distinguishing "I don't know this" from "I can derive what the answer must look like". Q4's charging
  rule (typed call cheap because statically known, reactor call expensive because opaque) is a forced
  conclusion from the existence of a reactor at all, but the *numbers* and the exact phrase "subtracting
  1 at each back-edge" could be about termination or about iteration budgets; I could not disambiguate.

### What warrants a second pair of eyes
- Answer 5. The claim that the software verifier "accepts" the erroneous code because it checks the
  shape of the emitted instructions rather than the provenance of the base value is my reconstruction;
  the article may instead be describing a fat-pointer/capability scheme versus a bounds-check scheme,
  in which case the roles of "confines" and "accepts" could be swapped.

### What should be done in the future
- Re-run this quiz against the actual article and diff the answers; the confidence-1 answers (4 and 5)
  mark where the article's wording is load-bearing and where the editor should check for ambiguity.

### Code review instructions
- Files: `answers.md` (six answers, confidences 1–2 throughout), `diary.md`. No code to run.

### Technical details
- Confidence assigned: Q1 = 2, Q2 = 2, Q3 = 2, Q4 = 1, Q5 = 1, Q6 = 2.
- Assumed reading of the "three safety properties": memory safety, bounded stack/work, and
  isolation of authority (the callable list bears on the third).

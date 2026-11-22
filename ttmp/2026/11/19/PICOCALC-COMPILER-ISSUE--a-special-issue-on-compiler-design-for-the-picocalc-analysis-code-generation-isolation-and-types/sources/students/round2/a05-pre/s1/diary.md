## Step 1: Answering a quiz about an article I was not given

The directory contained only `TASK.md`, `quiz.md` and `diary-format.md` — not the article
"5. Code Generation: From a Stack Machine to a Register Machine". I read the two files, answered
all six questions in `answers.md` from general compiler knowledge plus reasoning about what the
article's own sections must contain, and marked every answer with a confidence level.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow `TASK.md`: read `quiz.md`, answer it into `answers.md`, write
`diary.md` in the `diary-format.md` format, and reply `DONE`.
**Inferred user intent:** Test whether a reader without the article can be honest about the
boundary between "reasonably inferable" and "only knowable from the text", and whether the
quiz's dependence on specific sections/tables is detectable.
**Commit (code):** N/A — no repository, no commit made.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` (all in the current directory).
- Wrote `answers.md` with six numbered answers, each 2–5 sentences plus a `Confidence: N` line.
- Wrote this `diary.md` in the full investigation format.
- Did not open anything outside the current directory and did not use the web.

### Why
- The task explicitly forbids working outside the directory and forbids the web, so the article
  was treated as unavailable even though it would most likely exist in a parent directory.
- Answers were written as reasoning, not fabrication: where a number or a named list was required
  (5.3's measurement, 5.5's two cases, 5.8's table, 5.9's loop) I stated that it is unknowable
  and then described the *shape* the answer must have.

### What worked
- Q1 and Q2 are self-contained: the offsets are given in the question, so the naive translation
  can be counted (10 instructions) and the lazy-stack translation can be counted (2, best case 1)
  without the article, as long as the naive backend is assumed to spill every value to a fixed
  operand-stack slot (Q1) — that assumption came from the question wording itself.
- Q4's *structure* was answerable: the question already tells you the backend emits both branches,
  so the "why" is "one-op-at-a-time translation cannot know the jump is unnecessary", and the
  direction (not the value) of the 5.3 measurement follows from the framing of the question.
- Q6 was answerable in kind: the two features were identified as (i) cross-block register residency
  and (ii) a fused multi-op idiom, with the required knowledge named for each.

### What didn't work
- Q5 could not be answered at all in the required units. The question asks for "how much smaller
  ... in KiB" from a table in 5.8; no table was provided and nothing in the question fixes either
  the baseline size or the saving, so any number I wrote would be invented. I answered with the
  form of the computation instead and gave confidence 1.
- Q3 and Q5's "why it matters for Editor" needed external facts about the target machine (flash and
  RAM sizes, whether native code is loaded into RAM) that I partly recall but could not verify
  without the web, so I kept that part qualitative.

### What I learned
- The quiz is not uniformly article-dependent: three questions (1, 2, 6) are answerable from first
  principles given the question's own framing, while three (3, 5, and the numeric half of 4) are
  pure look-ups into named sections. That is a useful measure of how much the article carries.
- Question wording does a lot of work here — Q1's explicit offsets are the reason the naive count
  is checkable; without them the answer would have been unconstrained.

### What was tricky to build
- The hardest part was resisting the pull to invent plausible-looking numbers for Q5 and plausible
  section titles for 5.5, since a fluent wrong answer would look identical to a right one. The
  discipline used: any answer whose correctness depends on a table, a measurement or a named list
  in the article gets an explicit "I cannot know this without the article" sentence plus a
  confidence of 1–2, and the reasoning is clearly marked as reconstruction.

### What warrants a second pair of eyes
- Whether the naive-backend instruction count in Q1 matches the article's. If the current backend
  keeps local `y`'s value in a register after loading it, or fuses `local.get` with the following
  `add`, my count of 10 is wrong; the assumption is stated in the answer but worth checking.
- Whether Q2's "lazy" stack is meant to *defer* the `add` entirely into the consumer of `x` (0
  instructions plus a store) or to emit it immediately (1 instruction). I reported both.

### What should be done in the future
- If the quiz is meant to be answered from the article, ship the article with it; if it is meant to
  be answered blind, Q5 and Q3 should be reworded so they ask about the *reasoning* rather than a
  number and a two-item list, which are unreachable without the text.

### Code review instructions
- Files to inspect: `answers.md` (six answers, each followed by `Confidence: N`), `diary.md` (this
  file). No build or test commands apply; validation is a read-through against `quiz.md` to confirm
  every question is answered and every answer carries a confidence line.

### Technical details
- Assumed naive lowering: operand-stack slots at `[fp+8]`, `[fp+12]`; locals `y@0`, `x@4`.
  `local.get`/`local.set`/`i32.const` = 2 instructions each, `i32.add` = 4 (two loads, add, store)
  → total 10.
- Lazy-stack lowering: 0 instructions for push of a local location and of a constant, 1 for
  `add rd, r_y, imm`, 1 for the store of the result to `x` → total 2 (1 if `x` stays in a register).
- Section references treated as opaque: 5.3 (branch measurement), 5.5 (two exemptions), 5.8 (size
  table), 5.9 (hand-written loop).

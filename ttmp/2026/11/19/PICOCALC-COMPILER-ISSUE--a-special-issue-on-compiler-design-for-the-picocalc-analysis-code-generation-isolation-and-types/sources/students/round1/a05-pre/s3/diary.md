# Investigation entry

## Step 1: Answering a quiz about an article I was not given

The working directory contained `TASK.md`, `quiz.md` and `diary-format.md` but no article; I checked
for `article.md` and `README.md` explicitly and both were absent. So I answered all six questions
from background knowledge of stack-machine versus register-machine code generation, flagging in each
answer where the article's own numbers would be required. The interesting outcome is that five of the
six questions are answerable in shape but not in figure: questions 1, 2, 5 and 6 turn on what the
article's backend actually emits and what §5.9's hand-written loop actually looks like, while
questions 3 and 4 are largely conceptual.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task specification, then follow its numbered steps: read
`quiz.md`, answer every question in `answers.md` with per-answer confidence, then write `diary.md` in
the `diary-format.md` format, and finish with the single line `DONE`.
**Inferred user intent:** Test whether a reader without the article can be a useful reviewer — i.e.
whether the quiz is answerable from general compiler knowledge, which questions are genuinely
article-dependent, and how honestly the reader marks its own uncertainty.
**Commit (code):** N/A — no repository, no version control in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in the current directory.
- Confirmed the article was not present by attempting `article.md` and `README.md` (both ENOENT).
- Wrote `answers.md` with six numbered answers, each 2–5 sentences plus a `Confidence: N` line.
- Wrote this `diary.md`.

### Why
- Answering without the article is the whole point of the exercise; fetching it was not possible and
  not permitted, so the honest move was to reason from the WebAssembly and code-generation domain.
- I kept the translations in questions 1 and 2 concrete (explicit offsets, explicit instruction
  lists, explicit counts) because a vague answer there would tell the editor nothing about whether
  the article's own worked example is followable.
- Confidence was kept at 3–4 rather than 5 wherever the answer depended on numbers I could not see.

### What worked
- Questions 3 and 4 answered confidently from first principles: the correctness-versus-quality
  distinction for joins, and the structural `br_if`/`br` reasoning for the redundant jump.
- The two translations came out coherent: nine instructions through memory versus three with an
  abstract stack, with the four-operand-stack-slot round trips as the visible cost.

### What didn't work
- No failures as such. The one limitation: I could not verify the article's actual instruction
  encoding, so the specific mnemonics in answers 1 and 2 (`mov eax,[fp+0]`, `add r0,1`) are my
  reconstruction of a plausible backend, not quotations. I said so in the answers rather than
  pretending to cite the article.

### What I learned
- The quiz is structured so that its pedagogical claims are testable without the text: the numbers
  in §5.3 and §5.9 are evidence, but the arguments around them survive on their own. That suggests
  the article is doing its job.
- Question 5 is the one a reader is most likely to misread: exact reproduction of today's counts is
  evidence about the model, not about the future backend. Worth watching for whether the article
  itself is careful about that gap.

### What was tricky to build
- Counting instructions for question 1 requires committing to a calling convention and a frame
  layout. The offsets given (locals at 0 and 4, stack slots at 8 and 12) imply a memory-resident
  operand stack addressed off a frame pointer; I assumed a single scratch register and chose the
  cheapest reasonable encoding, which landed on 2+2+3+2. A backend that uses memory-to-memory `add`
  or that pushes via `push`/`pop` would give a different total.

### What warrants a second pair of eyes
- My counts in answers 1 and 2 are the load-bearing content of those answers. If the article's
  backend differs (e.g. it caches the top of stack in a register), the comparison the article draws
  changes and the editor should check my reconstruction against the real section 5.2.
- Answer 4 guesses the *direction* of the §5.3 measurement ("only a small percentage needed")
  without the figure.

### What should be done in the future
- Re-run this quiz with the article present to measure how much of the reasoning survives contact
  with the text, and specifically to compare my nine-versus-three against the article's own numbers.
- Note for the editor: quiz questions 1 and 2 are the ones that cannot be answered at all without
  the article, so they are the best candidates for a "read this section first" pointer.

### Code review instructions
- Read `answers.md` alongside `quiz.md`; each answer is numbered to match.
- Check the confidence lines against the hedging in the prose — a confidence of 4 should not appear
  on an answer that openly says "I cannot know this".
- No commands or tests apply; this directory contains prose only.

### Technical details
- Frame layout assumed: `y` at offset 0, `x` at 4, operand-stack slots at 8 (depth 0) and 12
  (depth 1); one scratch register.
- Diagram of the two translations, as used in the answers:

```
current backend (value lives in memory):
  local.get y : mov eax,[fp+0]  mov [fp+8],eax     2
  i32.const 1 : mov eax,1       mov [fp+12],eax    2
  i32.add     : mov eax,[fp+8]  add eax,[fp+12]  mov [fp+8],eax   3
  local.set x : mov eax,[fp+8]  mov [fp+4],eax     2
                                              total 9

abstract operand stack, lazy constants and locals:
  local.get y : [Local y]           emit nothing
  i32.const 1 : [Local y, Const 1]  emit nothing
  i32.add     : [Tmp r0]            mov r0,[fp+0] / add r0,1        2
  local.set x : []                  mov [fp+4],r0                   1
                                              total 3
```

- Confidence assigned: Q1 3, Q2 4, Q3 4, Q4 3, Q5 4, Q6 3.

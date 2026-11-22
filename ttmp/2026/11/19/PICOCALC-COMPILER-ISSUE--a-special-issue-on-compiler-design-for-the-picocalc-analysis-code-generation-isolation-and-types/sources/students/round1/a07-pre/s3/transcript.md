# Transcript: sources/students/round1/a07-pre/s3

- session: `01a1f4e7-709c-72bc-94ee-3807e020383f` started 2026-11-19T17:42:50.781Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `high`

## user

Read TASK.md and carry out every step in order.

## assistant

I'll start by reading the task file.

**tool call** `read` {"path": "TASK.md"}

## toolResult

# Your task (before reading)

You are a student reader helping an editor test a teaching article before it is published.
Work only inside this directory. Do not search the web.

1. Read `quiz.md`. It contains questions about an article you have NOT been given.
2. Answer every question from what you already know and can reason out. Write the answers to
   `answers.md`, numbered like the questions. Two to five sentences each. If a question depends on
   facts you cannot know without the article, say "I cannot know this without the article" and
   then give your best reasoning about what the answer would have to look like.
3. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain).
4. Write `diary.md`: one step, in the format of `diary-format.md`, recording what you did, which
   questions you could answer and which you could not, and why.

Finish by replying with one line: DONE.

## assistant

**tool call** `read` {"path": "quiz.md"}

**tool call** `read` {"path": "diary-format.md"}

## toolResult

# Questions for the article "7. Safety by Construction: Running Native Code Without Trusting It"

1. The native loader's comment says the list of callable functions "is a contract, not a wall". Explain what this means and which of the three safety properties it concerns.
2. Give the argument that two typed functions cannot call each other. Then state what must be added to the compiler if the language later allows a function to be called before it is defined.
3. Why is a compile-time bound on stack use possible for the typed language, and what are the two quantities that are summed to obtain it?
4. A handler contains `while (true) { }`. Describe what happens today when it runs as native code, and what happens with a fuel counter. Does fuel let the handler finish its work later?
5. A compiler bug causes a bounds check to compare against the wrong register. Which of the two memory-safety techniques in section 7.6 still confines the faulty access, and why does the other not?
6. Give one advantage of the software verifier over PMP with user mode, and one advantage of PMP with user mode over the verifier.

## toolResult

# Investigation entry

Use this full format for substantive implementation, design, debugging, or an explicit detailed-diary request. Begin each step with 1–2 prose paragraphs. The prompt is verbatim once, then referenced. Preserve exact failures, not invented or reconstructed diagnostics.

```markdown
## Step N: Descriptive title

One or two short paragraphs explaining intent, change and outcome.

### Prompt Context
**User prompt (verbatim):** "Actual authored request" (or: see Step N)
**Assistant interpretation:** What is being requested.
**Inferred user intent:** Intended outcome and reason.
**Commit (code):** hash — "message" (when available)

### What I did
- Concrete files, symbols and commands.

### Why
- Rationale and considered alternatives.

### What worked
- Evidence-backed outcomes.

### What didn't work
- Exact command, diagnostic, scope and recovery; or no failures observed.

### What I learned
- Corrected assumptions and constraints.

### What was tricky to build
- Underlying cause, symptoms and exact solution, including ordering/lifetime boundaries.

### What warrants a second pair of eyes
- Review-critical correctness, concurrency, security or performance questions.

### What should be done in the future
- Follow-ups implied by this step; N/A if none.

### Code review instructions
- Starting files/symbols and validation commands.

### Technical details
- Concrete contracts, snippets, limits and references.
```

Do not add compatibility shims unless required. 
… [119 more characters]

## assistant

> **thinking**
> Let me check the directory for any other files.

**tool call** `read` {"path": "."}

## toolResult

EISDIR: illegal operation on a directory, read

## assistant

> **thinking**
> Let me try reading directory listing differently — there's no ls tool. Only read/write/edit. I can't list. But maybe I can guess. Let me try reading some plausible files. Actually, the read tool on directory failed. Let me just proceed; quiz.md, TASK.md, diary-format.md exist.
> 
> Let me answer the questions based on my own reasoning. This is about a PicoCalc compiler article, section 7, "Safety by Construction: Running Native Code Without Trusting It". Questions about:
> 1. native loader callable function list "is a contract, not a wall" — three safety properties.
> 2. Two typed functions cannot call each other — mutual recursion impossibility (no forward references, only previously defined functions callable). Need: definition-before-use, so no forward calls; to allow calling before definition, need a prepass collecting signatures / two-pass compiler with symbol table of declared signatures, or check for recursion cycles.
> 3. Compile-time bound on stack use: typed language has no recursion (no self-call, no mutual recursion) → call depth bounded by definition order → stack use bounded. Two quantities summed: local frame size (per function's locals/temps) and ... call chain sum. Actually "the two quantities that are summed to obtain it" — likely the size of the current frame plus the maximum of callee's bound (max over callees). Or: locals size + expression evaluation temporaries. Hmm. Let me reason: a bound function stackBound(f) = frame(f) + max over callees(stackBound(g))? That's a sum of the frame and the max callee bound. That seems the most natural "two quantities summed". Alternatively, sum of frames along the deepest call chain. I'll present both interpretations since we can't know.
> 4. `while (true) { }` in native code: infinite loop, hangs the machine, requires reset/watchdog. With fuel counter: every backward branch decrements fuel; when exhausted, trap and return an error to the interpreter, which then reports a budget error. Fuel doesn't let the handler finish later — it's a hard budget; you cannot resume because state isn't checkpointed; you'd have to re-run with more fuel from the start (or the trap is permanent). So fuel bounds time but doesn't provide partial completion/resumption; unless the design supports re-invocation with larger budget, which re-runs from scratch.
> 5. Two memory-safety techniques in section 7.6 — likely (a) bounds checks emitted by compiler, and (b) sandboxing/isolation: memory access confined within the handler's allocated region (e.g., MPU regions/PMP), or capability/tagging, or address-space separation. If a bounds check compares against the wrong register, the compiler-emitted check is untrustworthy → the hardware confinement (region limit register in PMP/MPU) still confines it because it's independent of compiler correctness. The other (bounds checks) fails because it's part of the same faulty code; a wrong register comparison can pass a bad index.
> 6. Software verifier vs PMP+user mode: advantage of verifier — n
> … [2682 more characters]

**tool call** `write` {"path": "answers.md", "content": "# Answers (no article provided)\n\n## 1. \"A contract, not a wall\"\n\nI cannot know this without the article, but the phrase reads as follows: the comment lists the\nhost functions a handler may call, and the loader resolves exactly those names, so the list is an\nagreement between compiler and runtime (th\n… [5477 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

> **thinking**
> Q6 answer — sentence count: first sentence long, second, third = 3 sentences. OK. But the first sentence of answer 6 is a bit long; fine.
> 
> Now the diary.

**tool call** `write` {"content": "## Step 1: Answering the quiz on \"Safety by Construction\" without the article\n\nI was asked to act as a student reader and answer six quiz questions about an article on running\nnative code without trusting it, using only what I already know and can reason out, then record\nthe work in this diary. I re\n… [6342 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

Wrote `answers.md` (6 numbered answers, each with a `Confidence:` line) and `diary.md` (one step in `diary-format.md`'s format). Notes: `read .` failed (`EISDIR`), so I worked only from the three files named in `TASK.md`; questions 1, 3, 5 and 6 depend on article-specific enumerated lists (three safety properties, two summed quantities, section 7.6's two techniques) and were answered as reconstructions.

DONE

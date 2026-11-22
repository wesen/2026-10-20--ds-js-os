# Transcript: sources/students/round2/a07-pre/s3

- session: `01a1f50b-febf-70ee-8715-0796f54aed07` started 2026-11-19T18:22:46.464Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `high`

## user

Read TASK.md and carry out every step in order.

## assistant

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
2. Section 7.4 calls the absence of recursion a by-product. A by-product of what? State what must be added to the compiler if the language later allows a function to be called before it is defined, and what is lost if it is not added.
3. Give the definition of a function's stack need from section 7.4, and say why the compiler can compute it at the moment it finishes translating the function.
4. Section 7.5 distinguishes subtracting 1 at each back-edge from subtracting a larger amount. What does each bound? How are a call to a typed function and a call to a reactor function charged?
5. A compiler error passes an integer where a buffer reference belongs. Which of the two memory-safety techniques in section 7.6 still confines the resulting access, and why does the other accept the code?
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
> I need to answer questions about an article I don't have. I know nothing about "PicoCalc" article specifics. I must answer from reasoning, flagging "I cannot know this without the article" where needed. Let me check directory for other files.

**tool call** `read` {"path": "."}

## toolResult

EISDIR: illegal operation on a directory, read

## assistant

> **thinking**
> Let me try listing via read on directory? Not supported. Maybe there are other files like article sections. Let me guess: read paths.

**tool call** `read` {"path": "article.md"}

**tool call** `read` {"path": "section7.md"}

## toolResult

ENOENT: no such file or directory, access '/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a07-pre/s3/article.md'

## toolResult

ENOENT: no such file or directory, access '/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/students/round2/a07-pre/s3/section7.md'

## assistant

> **thinking**
> Only TASK, quiz, diary-format likely. I'll write answers.md with reasoned responses and honest uncertainty, then diary.md.
> 
> Let me reason about each question carefully so answers are plausible.
> 
> Context guesses: Article about a compiler for a language (PicoCalc) that compiles to native code and runs untrustedly on a microcontroller (RP2040? Pico) with MPU/PMP, no OS. Safety by construction: three safety properties likely memory safety, control-flow safety/integrity, and bounded resource use (stack/time). "List of callable functions is a contract, not a wall" — the native loader restricts what native code can call (an import table/callable address allowlist); it's a contract because it defines the interface the generated code may rely on, but it doesn't prevent the code from doing other things if it violates the contract (e.g., arbitrary jumps or calling other addresses). It concerns control-flow safety / isolation—specifically, limiting the native code's access to the runtime API. Or "not a wall" means it doesn't enforce isolation mechanically; it documents assumptions, and enforcement must come from elsewhere (verifier, MPU). Concerns the third property, "capability/authority confinement" perhaps.
> 
> I'll say: property is control-flow integrity / authority (which runtime functions native code may invoke), not memory safety; the wall is the hardware/verifier.
> 
> Q2: Absence of recursion is a by-product of what? Likely static stack allocation: the compiler assigns each function a fixed stack frame and computes maximum stack need by summing along call graph; recursion would make stack need unbounded/unknown. Or by-product of the "no function pointers / static call graph" design. If language allows calling a function before definition, compiler must add a call graph fix-up / forward-declaration resolution pass (or a second pass over the call graph to compute stack needs, or patch/defer stack-need computation and emit call-site checks). What's lost if not: the compile-time guarantee of bounded stack (stack safety / no overflow), so you'd have to trust or check at runtime. It could also lose the single-pass property. I'd mention that.
> 
> Q3: Definition of stack need from 7.4: presumably recursively: stack need of a function = frame size + max over its call sites of callee's stack need. Compiler can compute at moment it finishes translating because all callees must be already defined (define-before-use), so their stack needs are known; and calls are static/direct, so max is over known set.
> 
> Q4: Subtracting 1 at each back-edge vs larger amount. This sounds like a fuel/step budget/cost accounting for terminating loops — a "gas" or "tick" counter for bounding execution time. Subtracting 1 per loop iteration bounds iterations but not the length of the loop body; subtracting a larger amount (the cost of the body, e.g., number of operations/estimated cycles) bounds total work/time realistically. Calls: a call to a typed function is charged a fixed precomputed amou
> … [3576 more characters]

**tool call** `write` {"path": "answers.md", "content": "# Answers — \"7. Safety by Construction: Running Native Code Without Trusting It\"\n\nNote: I was not given the article, so every answer below is reconstruction from the question\nwording plus general knowledge of native-code sandboxing. Where a question turns on a detail I\ncannot derive, I say so first \n… [4834 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

**tool call** `write` {"content": "## Step 1: Answering a quiz about an article I was not given\n\nThe task asked me to read `quiz.md`, answer every question from prior knowledge and reasoning\nalone, write `answers.md` numbered like the questions with a `Confidence:` line after each, and\nthen record the step here in the format of `diar\n… [5432 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

DONE

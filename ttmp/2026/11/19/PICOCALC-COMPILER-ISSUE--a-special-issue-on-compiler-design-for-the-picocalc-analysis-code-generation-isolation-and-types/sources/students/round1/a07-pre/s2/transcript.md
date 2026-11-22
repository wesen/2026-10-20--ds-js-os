# Transcript: sources/students/round1/a07-pre/s2

- session: `01a1f4e7-6df7-771a-a356-d66e97d3b14b` started 2026-11-19T17:42:50.103Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `medium`

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
> I need to answer questions about an article I don't have. Let me write answers from reasoning. The article is about a "typed language" with native code execution on a microcontroller (PicoCalc — RP2040, two Cortex-M0+ cores, PMP with 8 regions on... actually RP2040 has no PMP user mode? Actually RP2350 has. PicoCalc is based on RP2040 (Clockwork Pi PicoCalc uses RP2040). Hmm, but PMP with user mode — RP2040 has no PMP (Armv6-M has no MPU). PicoCalc uses RP2040. But there might be a newer version. Anyway, I reason generically.
> 
> Let me craft careful answers, flagging uncertainty, 2-5 sentences each, plus Confidence lines.
> 
> Q1: "contract, not a wall" — the list enumerates which functions native code may call (a promise about what the runtime provides, i.e., the ABI surface), but it does not prevent anything: the loader doesn't check at runtime, the native code can jump anywhere. It concerns isolation / memory safety (the "no unauthorised calls" property) — among three safety properties likely: memory safety, termination/control safety, and something like no cross-handler interference or type safety. I'll say it concerns isolation (confining the code's reach), and note the other two properties probably being termination and type/capability correctness. Confidence 3.
> 
> Q2: Two typed functions cannot call each other: because definitions are ordered/topologically sorted; a function may only call previously defined functions (callee defined before caller), so a cycle would require each to precede the other — impossible in a total order. Adding forward references / mutual recursion requires call graph cycle detection (SCC check) and either pre-declaring signatures or a two-pass name resolution + placing cycle-broken recursion in a separate declaration ordering, plus stack bound becomes unbounded needing a recursion depth check or fuel.
> 
> Q3: Compile-time bound on stack use possible because no recursion and no alloca/variable-length arrays/dynamic dispatch: call structure is a static DAG with known frame sizes. Two quantities summed: the size of the largest frame path — actually "sum of the function's own frame size and the maximum of its callees' stack requirements" — at top level it's the sum of frame sizes along the longest call path (frame sizes plus... ) The two quantities: per-frame local storage (locals + spills) and the maximum of the callee requirements. Confidence 3.
> 
> Q4: `while (true) { }` compiled to native: spins forever, hangs the device/handler, cannot be preempted, watchdog may or may not reset (RP2040 watchdog exists but if not enabled nothing happens); compiler cannot prove termination because the AST-based checker sees a literal true condition — actually a typed language could mark it as non-terminating at compile time and reject it (that would be the "safety by construction" property: termination check). So today: if the checker is a "bounded loop"? Hmm. Question says "Describe what happens today when it runs as native code, and what happ
> … [2305 more characters]

**tool call** `write` {"path": "answers.md", "content": "# Answers — \"7. Safety by Construction: Running Native Code Without Trusting It\"\n\n*(Written without access to the article. Answers are reasoning from the question wording and from\ngeneral compiler/embedded knowledge; guesses about the article's own vocabulary are flagged.)*\n\n## 1\n\n\"Contract\" here me\n… [4749 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

**tool call** `write` {"content": "## Step 1: Answering a quiz about an article I was not given\n\nI read `TASK.md`, then `quiz.md` and `diary-format.md`. The task is a blind read: six questions about\nsection 7 (\"Safety by Construction: Running Native Code Without Trusting It\") of a teaching article\nthat is deliberately not present in \n… [4336 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

DONE.

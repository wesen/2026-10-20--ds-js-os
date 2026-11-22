# Transcript: sources/students/round1/a07-pre/s1

- session: `01a1f4e7-6c8f-75d6-88f2-96c67fac7702` started 2026-11-19T17:42:49.743Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `low`

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
> Let me write answers.md. I need to reason about the article's content from the questions themselves. Let me think carefully.
> 
> The article is "7. Safety by Construction: Running Native Code Without Trusting It" — appears to be part of a series about a PicoCalc, a compiler with an "analysis / code generation / isolation and types" theme. There's a typed language compiled to native code, a native loader with a table of callable functions (like a syscall/import table), isolation via PMP (RISC-V Physical Memory Protection) and user mode, a software verifier, fuel counters, stack bounds computed at compile time, memory safety techniques in section 7.6 (probably: bounds checks inserted by the compiler, and isolation of the handler's memory region so that even a faulty access only touches the handler's own region — or MPU/PMP region confinement).
> 
> Let me answer each.
> 
> 1. "contract, not a wall": the loader exposes a fixed table/list of host functions the native code may call; the native code is compiled against that list, and the verifier/runtime guarantees that only those symbols are resolvable/importable — but it does not physically prevent the native code from doing anything; it's an agreement between compiler and loader, enforced by convention/verification rather than by hardware trapping. It concerns the "capability"/"interface"/"authority" property — likely the property about "a handler can only affect the outside world through declared imports" (i.e., authority confinement / capability safety), not memory safety. Since the three safety properties are probably something like: memory safety, control-flow/termination (progress), and authority/capability confinement. Hmm. I should hedge: the three properties are likely (1) memory safety, (2) termination/boundedness, (3) capability/authority confinement. Question 2 is about functions calling each other → control-flow integrity / no recursion. Question 3 stack bound → termination/stack safety. So the three properties might be: memory safety, stack/termination boundedness, and capability discipline.
> 
> Actually "contract, not a wall" — a wall would be a hardware barrier that traps any call outside the list. A contract is a promise that the compiler only emits calls to listed functions, and the loader only resolves those names. But the native code could in principle compute an address and jump anywhere; the list doesn't stop that — the memory isolation does. So it concerns the third property: "the handler can only interact with the rest of the system through the declared interface" (capability/authority confinement). Since I don't know the exact names of the three properties, I should say: I cannot know the exact naming but the property is the one about which operations the handler can invoke / its authority, rather than memory safety or termination.
> 
> 2. Argument that two typed functions cannot call each other: the language requires definition before use / no forward references, and calls are only to previou
> … [4393 more characters]

Now I'll write the answers.

**tool call** `write` {"path": "answers.md", "content": "# Answers (written before reading the article)\n\n## 1. \"A contract, not a wall\"\n\nA contract is an agreement between parties who are assumed to keep it; a wall is a physical\nobstacle that holds even against someone who does not cooperate. The comment therefore means that\nthe loader's list of callable \n… [3946 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

> **thinking**
> Now diary.md in the full format.

**tool call** `write` {"content": "## Step 1: Answering the quiz blind, to test what the article actually carries\n\nI was asked to act as a student reader testing an unpublished teaching article without being given\nthe article itself: only `quiz.md`, `TASK.md` and `diary-format.md` were present. The point is to\nfind out which question\n… [5843 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

Created `answers.md` (6 numbered answers, each with `Confidence: N`) and `diary.md` (Step 1, full prescribed format). Nothing else in the directory was modified.

DONE

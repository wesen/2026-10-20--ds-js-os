# Transcript: sources/students/round2/a07-post/s3

- session: `01a1f50c-3d67-7688-be4d-553f2c4418fa` started 2026-11-19T18:23:02.503Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `high`

## user

Read TASK.md and carry out every step in order.

## assistant

I'll start by reading the task file.

**tool call** `read` {"path": "TASK.md"}

## toolResult

# Your task (after reading)

You are a student reader helping an editor test a teaching article before it is published.
Work only inside this directory. Do not search the web. Be honest: the editor needs to know
where the article fails to teach.

1. Read `article.md` from start to finish. The series has a glossary, `glossary.md`; look terms up there as a reader would, and report in your feedback only terms that neither the article nor the glossary explains.
2. Answer the questions in its "Check your understanding" section. Write the answers to
   `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show
   working where a question asks for a calculation or a translation. After each answer add a line
   `Confidence: N` with N from 1 (guessing) to 5 (certain).
3. Write `feedback.md` with these sections:
   - **Passages I had to read twice**: quote each (one or two sentences) and say what was unclear.
   - **Terms used before they were explained, or never explained**: one line each.
   - **Claims I could not verify from the article itself**: quote each and say what evidence or
     step is missing.
   - **Section scores**: for each numbered section, a score from 1 (lost) to 5 (clear) and one
     sentence of reason.
   - **Questions that the article did not let me answer**: which quiz questions, if any, could not
     be answered from the text, and what was missing.
   - **One thing to add and one thing to cut**.
4. Write `diary.md`: a work di
… [191 more characters]

## assistant

**tool call** `read` {"path": "article.md"}

**tool call** `read` {"path": "diary-format.md"}

## toolResult

# 7. Safety by Construction: Running Native Code Without Trusting It

Native code on this device runs with the firmware's privileges, so today only code shipped in the firmware may run natively. This article asks what would have to be true for the device to run native code compiled from a source file it does not trust. By the end you should be able to state the three properties a confined program must have, name the four classical ways of enforcing them and what each requires you to trust, explain why the typed language's lack of recursion gives a compile-time bound on stack use, describe a fuel counter and what it does and does not provide, and list the checks a verifier would perform on emitted RV32 code.

The article relies on Article 1 for these terms: a *world* is one scheduled program; the *nucleus* is the kernel that schedules worlds; a *turn budget* is the longest time a world's event handler may run; an *engine* is the mechanism that executes a world's code (QuickJS for JavaScript, WAMR for WebAssembly, or native RV32 machine code); a *reactor* is the prebuilt C module through which a compiled application reaches the nucleus; a *trap* is a fault that ends the handler. The *typed language* is the small language with declared types that the project's second compiler accepts, and CJI is the first compiler, for unannotated JavaScript. Article 5 describes the shape of the native code the typed compiler emits.

## 7.1 What can go wrong

The comment at the top of the device
… [24708 more characters]

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
> Let me read glossary.md too.
> 
> Also the directory may contain other files. Let me check.

**tool call** `read` {"path": "glossary.md"}

## toolResult

# Glossary

Each term is defined as it is used in this issue. The number in brackets is the article that introduces it.

## The system

**Claim** [1]. An entry in the system's manifest stating that a world may open a given kind of hardware or a given directory. The nucleus checks every such use against the world's claims.

**Compositor** [1]. The world that owns the screen. Applications send it a description of their screen; it lays the description out and draws it.

**Engine** [1]. The mechanism that executes a world's code. There are three: QuickJS (JavaScript), WAMR (WebAssembly) and native (RV32 machine code).

**Handle** [9]. A number that stands for an open file or a granted permission. Authority is exercised by presenting a handle to the nucleus.

**Manifest** [1]. The file that lists the system's worlds with their engines, memory limits, turn budgets and claims.

**Nucleus** [1]. The kernel, written in C. It schedules worlds, delivers messages and checks claims.

**Reactor** [1]. A prebuilt C module shipped in the firmware that connects a compiled application to the nucleus. Compiled code is copied into a reserved place inside it. The *shared typed reactor* serves any fully typed application.

**Slot** [5, 7]. Two meanings, distinguished by context. A *frame slot* is a fixed position in a function's stack frame. *The slot* in a reactor is the contiguous region reserved for an application's compiled RV32 code.

**Split-phase operation** [8]. An operation with a request
… [8777 more characters]

## assistant

> **thinking**
> Now let me check the directory for other files.

**tool call** `read` {"path": "."}

## toolResult

EISDIR: illegal operation on a directory, read

## assistant

> **thinking**
> No ls tool. Let me try reading some plausible file names. Actually the tools are read/write/edit only. I can guess the directory contents: TASK.md, article.md, glossary.md, diary-format.md. Maybe there are answers.md/feedback.md/diary.md already, or an example. Let me just proceed.
> 
> Now answer the questions.
> 
> Let me think carefully about each question.
> 
> **Q1.** "The native loader's comment says the list of callable functions 'is a contract, not a wall'. Explain what this means and which of the three safety properties it concerns."
> 
> The loader limits what a module may call — it restricts the set of callable functions in some declared way (an import table/contract). But since the code "can jump to any address", the restriction is only an agreement the module is expected to honour; nothing physically prevents a jump outside the permitted set. So it concerns control safety: executing only its own code and the entry points it was given.
> 
> **Q2.** By-product of what? Of how the compiler happens to register function names: a name is entered into the table only when the compiler has finished translating its body, so a call can only resolve to a function defined earlier in the file. If the language later allows calls before definition (Article 9 argues for this for convenience), the compiler must add an explicit acyclicity check: after reading all signatures, build the call graph and search for a cycle, rejecting the program if one exists. If it is not added, the compile-time stack bound silently disappears (no bound on stack use; the loader can no longer refuse a program by computing max stack need).
> 
> **Q3.** Stack need of a function = size of its own frame + the largest stack need of anything it calls, where a called typed function contributes its own stack need and a called reactor function contributes the stack that function uses. Program's maximum stack use = stack need of entry function. Why computable at the moment the compiler finishes translating it: because every callee is defined (and therefore already translated) before the caller, the callee's stack need is already known; the frame size is fixed by the backend from locals and deepest operand stack; reactor functions' stack use is a fixed measured quantity.
> 
> **Q4.** Subtracting 1 at each back-edge bounds the number of loop iterations and nothing finer. Subtracting a larger amount — the greatest number of instructions one trip around the loop body can execute, not counting inner loops — bounds executed instructions, giving a budget in milliseconds from the processor's speed. Charging a call to a typed function: add that function's own greatest straight-line cost, known because the callee was compiled first; the callee's loops charge for themselves. A call to a reactor function must be charged its worst case for the given arguments — for a search over a span, the length of the span.
> 
> **Q5.** Address masking still confines the access: before each non-frame access the code computes address = base +
> … [29724 more characters]

**tool call** `write` {"path": "answers.md", "content": "# Answers to \"Check your understanding\" (section 7.9)\n\n## 1. \"A contract, not a wall\"\n\nThe loader publishes a list of functions a native module may call, and the module is expected to\nhonour it. Nothing enforces the list in hardware: because the module's own code can jump to any\naddress, once it is \n… [6036 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

> **thinking**
> Oops, my answer 6 says "It also depends on no particular chip feature" — that's fine. But I wrote it slightly oddly ("against ... for PMP with user mode"). Fine.
> 
> Wait, answer 6 sentence count: 4 sentences. OK.
> 
> Now feedback.md.

**tool call** `write` {"content": "# Reader feedback: Article 7, \"Safety by Construction\"\n\n## Passages I had to read twice\n\n1. \"Solid arrows show the order of definitions in the source file. Dotted arrows are calls the\n   compiler accepts; each points from a later function to an earlier one.\" — The pair `helper` →\n   `scan` appears t\n… [10675 more characters]", "path": "feedback.md"}

## toolResult

Successfully wrote to feedback.md

## assistant

> **thinking**
> Note: I wrote "[Wahbe et et al. 1993]" typo. Fix that.
> 
> Also answer 4's arithmetic: 100,000/43 = 2325.58 → 2,325 iterations; 100,000 instructions at 100 million instr/s = 1 ms. Good.
> 
> Fix the typo.

**tool call** `edit` {"path": "feedback.md", "edits": [{"oldText": "[Wahbe et\n   et al. 1993]", "newText": "[Wahbe et\n   al. 1993]"}]}

## toolResult

Successfully replaced 1 block(s) in feedback.md.

## assistant

Now the work diary.

**tool call** `write` {"content": "# Diary: student reading of Article 7, \"Safety by Construction\"\n\n## Step 1: Reading the article against the glossary\n\nI read `TASK.md` first, then `article.md` from the first line to the references, keeping\n`glossary.md` open beside it and looking up every term the article used as if it were new to \n… [11991 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

> **thinking**
> Verify answer counts: answer 1 has 5 sentences? Let's check answer 1: "The loader publishes..." (1) "Nothing enforces..." (2) "That is what..." (3) "The property concerned..." (4) "The same paragraph also admits..." (5). Yes 5.
> 
> Answer 2: 4 sentences. Answer 3: 4. Answer 4: I claimed 6 sentences — count: 1 "Subtracting 1 at each back-edge bounds only..." 2 "Subtracting the greatest number..." 3 "That per-iteration amount ignores inner loops..." 4 "A call to a typed function adds..." 5 "A call to a reactor function cannot be charged..." 6 "Working through the arithmetic..." = 6. Good.
> 
> Answer 5: 4. Answer 6: 4. Diary says 5,4,4,6,4,4 — correct.
> 
> Diary says 6 quiz questions, 2 poorly served (Q4, Q2) — matches feedback. Good.
> 
> Done. Reply with one line: DONE.
> 
> The task says "Finish by replying with one line: DONE."

DONE.

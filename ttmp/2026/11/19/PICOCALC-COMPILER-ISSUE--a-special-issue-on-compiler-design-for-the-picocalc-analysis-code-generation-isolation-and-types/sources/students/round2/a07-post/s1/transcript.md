# Transcript: sources/students/round2/a07-post/s1

- session: `01a1f50c-0829-757d-99b6-16845f894192` started 2026-11-19T18:22:48.873Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `low`

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

**tool call** `read` {"path": "glossary.md"}

**tool call** `read` {"path": "diary-format.md"}

## toolResult

# 7. Safety by Construction: Running Native Code Without Trusting It

Native code on this device runs with the firmware's privileges, so today only code shipped in the firmware may run natively. This article asks what would have to be true for the device to run native code compiled from a source file it does not trust. By the end you should be able to state the three properties a confined program must have, name the four classical ways of enforcing them and what each requires you to trust, explain why the typed language's lack of recursion gives a compile-time bound on stack use, describe a fuel counter and what it does and does not provide, and list the checks a verifier would perform on emitted RV32 code.

The article relies on Article 1 for these terms: a *world* is one scheduled program; the *nucleus* is the kernel that schedules worlds; a *turn budget* is the longest time a world's event handler may run; an *engine* is the mechanism that executes a world's code (QuickJS for JavaScript, WAMR for WebAssembly, or native RV32 machine code); a *reactor* is the prebuilt C module through which a compiled application reaches the nucleus; a *trap* is a fault that ends the handler. The *typed language* is the small language with declared types that the project's second compiler accepts, and CJI is the first compiler, for unannotated JavaScript. Article 5 describes the shape of the native code the typed compiler emits.

## 7.1 What can go wrong

The comment at the top of the device
… [24708 more characters]

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
> Let me check if there are other files in the directory.
> 
> Now write answers.md. Let me answer the 6 questions carefully.
> 
> Q1: "contract, not a wall" — the loader limits which functions a module may call by listing them: that's an agreement/promise, not enforced barrier. Jump can go anywhere. Concerns control safety.
> 
> Q2: by-product of how the compiler registers names (function name entered in table after body translated). Must add: explicit acyclicity check of the call graph after reading all signatures. Lost: the compile-time stack bound.
> 
> Q3: stack need = own frame size + largest stack need of anything it calls (typed function contributes its own stack need; reactor function contributes the stack that function uses). Compiler can compute at finish because every callee is defined earlier, so its stack need is already known; reactor stack use measured once at firmware build.
> 
> Q4: subtract 1 bounds number of loop iterations only. Larger amount (greatest number of instructions one trip can execute, not counting inner loops; for `if` take longer branch; for call to typed function add that function's greatest straight-line cost) bounds executed instructions. Reactor call charged at worst case for given arguments, e.g. length of span for a search.
> 
> Q5: address masking still confines; pattern checking accepts because sequence is complete — it verifies each non-frame access is bounds-checked against *some* length word, and the integer-as-reference would read a "length" from where the integer points, so the sequence is complete and verifier accepts.
> 
> Q6: verifier: no trap cost per reactor call (a jump vs a trap), doesn't depend on chip features, no cost per memory access with pattern checking... advantage: works without chip support / cheapper: cost per reactor call is a jump not a trap; also protects against compiler errors yes... PMP: fully protects against compiler errors (yes) and works for native code from any compiler, including CJI.
> 
> Let me write answers with Confidence lines.
> 
> Then feedback.md, then diary.md.
> 
> Let me note the ambiguous thing: Section 7.2 table says language-based safety "The typed language is safe; its compiler is trusted and unverified". Also the "Trusted" table numbers.
> 
> For feedback: passages read twice. Candidates:
> - "What it may call is limited by the loader, and the comment adds: 'That is a contract, not a wall: its code can jump to any address.'" — the mechanism by which the loader limits calls is not explained.
> - The mermaid diagram: solid arrows show order of definitions A→B→C→D but the thick arrow says "helper calls scan not allowed" while dotted arrows show D calls C and A, C calls B, B calls A. Actually the diagram is confusing: dotted arrow B calls A — but B is defined earlier than... wait A is helper (1), B scan (2), C render (3), D onEvent (4). A is earliest so everything can call A. B calls A allowed. C calls B allowed. D calls C and A allowed. A calls B not allowed. But diagram's solid arrows show definition order
> … [4483 more characters]

**tool call** `write` {"path": "answers.md", "content": "# Answers to \"Check your understanding\" (Article 7)\n\n## 1\n\nThe loader restricts *which* functions a module may call by publishing a list and expecting the module to obey it, but nothing in the loader stops a module from ignoring the list. The article quotes the source comment that \"its code can jump\n… [5581 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

> **thinking**
> Now feedback.md.
> 
> Section scores for each numbered section: 7.1–7.9 (7.9 is the quiz). I'll score 7.1–7.8 and mention 7.9.
> 
> Let me write detailed feedback.

**tool call** `write` {"content": "# Feedback on Article 7 — \"Safety by Construction: Running Native Code Without Trusting It\"\n\nRead as a student: cover to cover, then back for the quiz, looking terms up in `glossary.md` as needed.\n\n## Passages I had to read twice\n\n1. \"What it may call is limited by the loader, and the comment adds: \n… [11011 more characters]", "path": "feedback.md"}

## toolResult

Successfully wrote to feedback.md

## assistant

> **thinking**
> Now diary.md in the full format, with three steps (reading, quiz, feedback).
> 
> Note the format requires "Prompt Context" with verbatim user prompt. The prompt was "Read TASK.md and carry out every step in order." I'll use that.
> 
> Should reference prompt verbatim once then "see Step N"? Format says "The prompt is verbatim once, then referenced." I'll put verbatim in Step 1 and "see Step 1" in steps 2 and 3.

**tool call** `write` {"content": "# Work diary — student read of Article 7\n\n## Step 1: Read the article, the glossary and the diary format\n\nI read `TASK.md` first, then `article.md` from start to finish in one pass without stopping to look anything up, then `glossary.md` and `diary-format.md`. The intent was to get the honest experi\n… [8018 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

> **thinking**
> Fix the diary title for step 3 key "What warrants a second pair of eyes" — fine. Also there's a typo: I wrote "### What warrants a second pair of eyes" — ok.
> 
> Wait, in step 3 I have "### What warrants a second pair of eyes" — good.
> 
> Done. Reply DONE.

Wrote `answers.md`, `feedback.md`, `diary.md` in this directory.

DONE

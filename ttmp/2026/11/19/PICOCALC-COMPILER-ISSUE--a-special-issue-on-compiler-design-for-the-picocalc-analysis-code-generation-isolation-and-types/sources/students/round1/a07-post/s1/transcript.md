# Transcript: sources/students/round1/a07-post/s1

- session: `01a1f4e7-95a1-7182-9afd-59edc9c7bd4d` started 2026-11-19T17:43:00.257Z
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

1. Read `article.md` from start to finish.
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
4. Write `diary.md`: a work diary of this session in the format of `diary-format.md`, with one
   step for reading, one for the quiz and one for the feedback. Record what was hard.

Finish by replying w
… [19 more characters]

## assistant

**tool call** `read` {"path": "article.md"}

**tool call** `read` {"path": "diary-format.md"}

## toolResult

# 7. Safety by Construction: Running Native Code Without Trusting It

Native code on this device runs with the firmware's privileges, so today only code shipped in the firmware may run natively. This article asks what would have to be true for the device to run native code compiled from a source file it does not trust. By the end you should be able to state the three properties a confined program must have, name the four classical ways of enforcing them and what each requires you to trust, explain why the typed language's lack of recursion gives a compile-time bound on stack use, describe a fuel counter and what it does and does not provide, and list the checks a verifier would perform on emitted RV32 code.

The article relies on Article 1 for the terms *world*, *turn budget*, *engine*, *reactor* and *trap*, and on Article 5 for the shape of the emitted code.

## 7.1 What can go wrong

The comment at the top of the device's native loader states the present situation without softening it. Native modules "are for trusted drivers, and nothing here isolates them". A module "can read and write anything, including the kernel". What it may call is limited by the loader, and the comment adds: "That is a contract, not a wall: its code can jump to any address." On time: "a module that never returns stalls the kernel." The loader therefore accepts modules only from the firmware image: "the kernel starts JavaScript and WebAssembly from storage, never machine code."

Those sentences ident
… [21201 more characters]

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
> Let me now write the answers. Questions 1-6.
> 
> Let me think through each carefully.
> 
> **Q1**: "is a contract, not a wall" — loader limits what the module may call (whitelist), but that's an agreement the module's code could ignore because it can jump to any address. Concerns control safety.
> 
> **Q2**: The argument: name entered in table after body finished. f calling f: f not yet in table → `unknown function f`. Two functions f and g: for f to call g, g must appear earlier; for g to call f, f must appear earlier; both cannot hold. Longer cycles similarly. What must be added if forward calls allowed: an explicit acyclicity check after reading all signatures — search call graph for a cycle, reject program. (Also note the stack bound disappears without it.)
> 
> **Q3**: Because no recursion → call graph acyclic and finite, longest chain ≤ number of functions; and each function's frame size is fixed at compile time from locals and deepest operand stack. Two quantities summed: sum of frame sizes along the chain, plus the stack needed by deepest reactor function that chain can reach (a measurable constant).
> 
> **Q4**: Today: `while (true) { }` never returns, the nucleus's turn-budget check happens after handler returns, so check never happens — kernel stalls, all worlds stop. With fuel counter: at each back-edge, subtract, trap when zero → turn ends with a fault, like budget overrun. Does fuel let handler finish later? No — fuel stops the program, it does not schedule it; the program must split its work across turns (Article 8).
> 
> **Q5**: Address masking still confines; it forces address into world's region with mask+add regardless of compiler bug. Pattern checking doesn't: it only confirms bounds check against *some* length word; with wrong register the compare uses a wrong length so the check may pass while address is out of bounds — pattern matches syntactically but bound is wrong.
> 
> **Q6**: Verifier advantage: no per-reactor-call trap cost (a jump vs trap of tens of instructions); no dependence on chip features; works... Actually verifier: cost per reactor call a jump; doesn't depend on chip features. PMP advantage: works for native code from any compiler including CJI; no per-access cost. Also PMP protects against compiler errors too. So verifier advantage: cheaper reactor calls / no chip-feature dependence. PMP advantage: works for output of any compiler including CJI.
> 
> Now let me write the files. Section scores: sections 7.1–7.9 numbered. Should I score each numbered section, i.e. 7.1 through 7.9? 7.9 is the quiz. I'll score 7.1-7.8 and note 7.9.
> 
> Feedback passages I had to read twice:
> - "Their method reserves registers for addresses and inserts instructions before each store and jump that force the address into the program's own region, so that even a wild address lands inside the sandbox" — dense; "force the address into the region" is hand-wavy (masking is only explained in 7.6 and via a different mechanism—jump targets can't be masked that way).
> - "The 
> … [6234 more characters]

Task read. Now writing the three deliverables.

**tool call** `write` {"path": "answers.md", "content": "# Answers to §7.9 \"Check your understanding\"\n\n## 1. \"A contract, not a wall\"\n\nThe loader limits *what a module may call* by handing it a fixed list of permitted entry points, and a module that was compiled honestly will only call those. But that list is enforced by agreement, not by the processor: t\n… [6522 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

> **thinking**
> Now feedback.md.

**tool call** `write` {"content": "# Feedback on \"7. Safety by Construction: Running Native Code Without Trusting It\"\n\n## Passages I had to read twice\n\n1. > \"Their method reserves registers for addresses and inserts instructions before each store and jump that force the address into the program's own region, so that even a wild addre\n… [14574 more characters]", "path": "feedback.md"}

## toolResult

Successfully wrote to feedback.md

## assistant

> **thinking**
> Now diary.md in the format.

**tool call** `write` {"content": "## Step 1: Reading the article, start to finish\n\nI read `TASK.md` first to fix the deliverable list, then read `article.md` in one pass without taking notes, to see whether the argument carried me along. This is a teaching article on confining untrusted native code on a PicoCalc-class device, organi\n… [11379 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

> **thinking**
> Fix the typo "mango:" — that was in my earlier thought, not in files. Let me check I didn't write it. No, that was only in reasoning. Good.
> 
> Verify files exist.

**tool call** `read` {"path": "diary.md", "limit": 15}

## toolResult

## Step 1: Reading the article, start to finish

I read `TASK.md` first to fix the deliverable list, then read `article.md` in one pass without taking notes, to see whether the argument carried me along. This is a teaching article on confining untrusted native code on a PicoCalc-class device, organised as §7.1 problem, §7.2 mechanisms, §7.3–7.5 what the typed language already gives, §7.6 verifying emitted RV32, §7.7 the hardware alternative, §7.8 key points, §7.9 quiz.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four instructions in `TASK.md`: read the article, answer the quiz into `answers.md`, write `feedback.md` with six named sections, and write this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest student-level read-through that surfaces where the article fails to teach, before publication, plus a check on whether the quiz is fair.
**Commit (code):** N/A — no repository, no changes made.

### What I did
- Read `TASK.md`, `diary-format.md`, then `article.md` in full.
- Noted the article's declared dependencies on Article 1 (world, turn budget, engine, reactor, trap) and Article 5 (shape of the emitted code).

### Why

[119 more lines in file. Use offset=16 to continue.]

## assistant

All four steps are complete:

- `answers.md` — six answers numbered as in §7.9, with working shown for the Q2 ordering argument, the Q3 stack-sum formula, and the Q4 back-edge trace; confidence 4/5/4/5/5/5.
- `feedback.md` — the six required sections: five passages quoted with what was unclear, ~20 terms flagged (the two real gaps are **nucleus** and **CJI**, neither declared as borrowed nor defined anywhere), eleven unverifiable claims each with its missing evidence, nine section scores (lowest: §7.7 = 2), a note that all six quiz questions are answerable but Q3 and Q6 admit multiple defensible answers, and one addition (worked numeric example of the stack bound and fuel arithmetic) plus one cut (the CHERIoT sentence).
- `diary.md` — three steps in `diary-format.md` format, recording that the article's weakness is missing artefacts (no 28-function list, no twenty-instruction table, no measured reactor stack constant, no line-count evidence) rather than weak prose.

DONE

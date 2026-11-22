# Transcript: sources/students/round2/a07-post/s2

- session: `01a1f50c-3aba-71e0-ad33-d68d542797eb` started 2026-11-19T18:23:01.819Z
- model: `lunaroute/deepseek-4.1-flash`
- thinking level: `medium`

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
> Let me check the directory for other files.
> 
> Now let me answer the quiz questions carefully.
> 
> Let me re-read key parts to answer Q3, Q4, Q5, Q6 accurately.
> 
> Q1: "is a contract, not a wall" — the loader limits what functions a module may call, but nothing enforces it: since code can jump to any address, the module can just jump directly into kernel code instead of using the permitted entry points. This concerns control safety (executes only its own code and the entry points it was given). Could also be argued memory safety since jumping to arbitrary address allows anything. But primarily control safety.
> 
> Q2: by-product of what? Of how the compiler happens to register names — a function's name is entered in the table only when the compiler has finished translating its body, and a call is translated by looking up the name in the table. So absence of recursion is a side-effect of one-pass, top-to-bottom compilation order, not a stated rule of the language. What must be added: after reading all signatures, search the call graph for a cycle and reject the program if one exists (explicit acyclicity check, a few dozen lines of code) — Article 9 argues for letting functions be called before definition. If not added, the compile-time stack bound silently disappears (stack safety/computable maximum stack use).
> 
> Q3: stack need of a function = size of its own frame plus the largest stack need of anything it calls, where a called typed function contributes its own stack need and a called reactor function contributes the stack that function uses. Why computable at the moment it finishes translating: every callee is defined before its caller (calls go only to earlier functions), so when the compiler finishes a function, all its callees' stack needs are already known; the function's own frame size is fixed from its locals and deepest operand stack (Article 5); reactor functions' stack use is a fixed quantity measured once when firmware is built. So the compiler just takes max over callees.
> 
> Q4: subtracting 1 at each back-edge bounds number of loop iterations and nothing finer. Subtracting a larger amount — the greatest number of instructions one trip around the loop body can execute (not counting inner loops, which have their own back-edges) — bounds executed instructions (and hence, with processor speed, a budget in milliseconds). For an `if` it takes the longer branch. A call to a typed function: adds that function's own greatest straight-line cost, known because the callee was compiled first; the callee's loops charge for themselves. A reactor function call: charge must be its worst case for the given arguments — e.g. for a search over a span, the length of the span (runtime-dependent, data-dependent).
> 
> Hmm — note there's a subtlety: "the greatest number of instructions that one trip around the loop body can execute" — the charge is an upper bound on true cost of each iteration, so counter is upper bound on executed instructions.
> 
> Q5: address masking still con
> … [24076 more characters]

**tool call** `write` {"path": "answers.md", "content": "# Answers to \"Check your understanding\" (Article 7)\n\n1. It means the loader can only *tell* a module which reactor entry points it is\n   allowed to call — the allowed list is a promise the module's code is expected to keep,\n   not a barrier that makes breaking it impossible, because nothing stops a \n… [4652 more characters]"}

## toolResult

Successfully wrote to answers.md

## assistant

> **thinking**
> Now feedback.md.
> 
> Let me get the exact quotes right.
> 
> Quotes for "read twice":
> 
> 1. "Define the stack need of a function as the size of its own frame plus the largest stack need of anything it calls, where a called typed function contributes its own stack need and a called reactor function contributes the stack that function uses." — dense one-sentence recursion + two exception clauses; had to unpack.
> 
> 2. "The amount is an upper bound on the true cost of each iteration, so the counter is an upper bound on executed instructions, and a budget in milliseconds follows from the processor's speed." — the last step is asserted; no instruction timings given.
> 
> 3. "To bound executed instructions, the compiler subtracts a larger amount: the greatest number of instructions that one trip around the loop body can execute, not counting inner loops, which have back-edges of their own. For an `if` it takes the longer branch." — doesn't say whether the fuel code itself and the loop test/branch are included; doesn't say how "longer branch" is decided statically when lengths differ.
> 
> 4. "With pattern checking alone, the compiler's handling of types would remain in the first row." — refers to a row of a table that is never shown.
> 
> 5. Mermaid diagram caption paragraph: "The thick arrow is a call the compiler rejects, because at the time `helper` is translated, `scan` is not yet in the table." — the thick arrow is drawn along the same pair (helper → scan) as the solid definition-order arrow, so the picture shows helper defined before scan and also helper rejected for calling scan; I had to re-read to work out that the solid arrows mean definition order and the thick one means "this call is rejected".
> 
> 6. "The only indirect jump is the return at the end of a function, and the return address was loaded from the frame slot where the function's entry saved it" — long conjunction; unclear what "loaded from" checks (that the value came from that slot via a specific instruction).
> 
> 7. "The last-but-one row is the hardware route's distinctive advantage." — counting rows backwards in a table with no row numbers.
> 
> 8. Section 7.1: "What it may call is limited by the loader, and the comment adds: 'That is a contract, not a wall: its code can jump to any address.'" — actually clear.
> 
> Maybe also: "Fuel can be made to bound work" heading bullet.
> 
> Claims I could not verify: as drafted.
> 
> Also add claim: "A handler that loops forever never returns, and the check never happens." — that's a claim about the nucleus, verifiable only by source.
> 
> And: "Because no unbounded execution can avoid passing a back-edge, the program cannot run indefinitely." — hides assumption that reactor calls terminate (a call into the reactor that blocks or loops internally never passes a back-edge in the compiled code).
> 
> Good, that's a strong feedback point.
> 
> Also "The reactor functions are C code with no recursion" — asserted, no list/measurement.
> 
> Now section scores 7.1-7.9.
> 
> Write feedback.md.

**tool call** `write` {"content": "# Feedback on Article 7, \"Safety by Construction\"\n\n## Passages I had to read twice\n\n1. > \"Define the stack need of a function as the size of its own frame plus the largest stack need\n   > of anything it calls, where a called typed function contributes its own stack need and a called\n   > reactor fun\n… [12242 more characters]", "path": "feedback.md"}

## toolResult

Successfully wrote to feedback.md

## assistant

> **thinking**
> Now diary.md in the prescribed format with 3 steps.
> 
> Prompt verbatim once, then referenced.
> 
> Include "Commit (code): N/A — no commits (reader-only session)".
> 
> Wrap technical details.

**tool call** `write` {"content": "# Investigation entry\n\n## Step 1: Reading the article as a student reader\n\nI read `article.md` straight through without taking notes on my first pass, then read `glossary.md`\nto look up terms in the order I had actually needed them while reading. The point of the pass was to\nnotice where I stumbled,\n… [12753 more characters]", "path": "diary.md"}

## toolResult

Successfully wrote to diary.md

## assistant

> **thinking**
> Verify the feedback file's "cut" paragraph — I wrote an awkward construction: "**Cut:** the CHERIoT sentence ... cutting it keeps..." then parenthetical about alternative. Fine.
> 
> Also, in feedback I quoted "The verifier (estimated at a few hundred lines of C)" — actual text is "(estimated at a few hundred lines of C)" in the table cell: "The verifier (estimated at a few hundred lines of C)". Yes.
> 
> Check quote 11 wording: article: "| The verifier (estimated at a few hundred lines of C) |". Good.
> 
> One issue: feedback claims section 7.2 has two comparison tables — no. In Step 1 diary I wrote "The two comparison tables in 7.1, 7.2 and 7.7 did most of the teaching work" — slightly inaccurate (7.2 has a table too, 7.1 has two tables). Fine-ish but let me make it accurate: "The comparison tables in 7.1, 7.2 and 7.7".
> 
> Also quick sanity: article §7.4 says calls compile with message `unknown function f` — matches.
> 
> Let me fix that one diary phrase.

**tool call** `edit` {"path": "diary.md", "edits": [{"oldText": "- The two comparison tables in 7.1, 7.2 and 7.7 did most of the teaching work; question 6 was answerable\n  almost entirely from one table row.", "newText": "- The comparison tables in 7.1, 7.2 and 7.7 did most of the teaching work; question 6 was answerable\n  almost entirely from one table row."}]}

## toolResult

Successfully replaced 1 block(s) in diary.md.

## assistant

> **thinking**
> All done. Reply with one line "DONE." but maybe brief listing? Task says "Finish by replying with one line: DONE." So reply exactly that.
> 
> I should maybe return the one line only.

DONE.

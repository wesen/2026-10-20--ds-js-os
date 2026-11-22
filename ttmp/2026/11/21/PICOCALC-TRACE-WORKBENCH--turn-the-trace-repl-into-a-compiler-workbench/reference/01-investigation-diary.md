---
Title: Investigation diary
Ticket: PICOCALC-TRACE-WORKBENCH
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T20:10:41.571615113-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

This diary records the work on PICOCALC-TRACE-WORKBENCH: turning the trace REPL (`cmd/trace-repl`, `pkg/trace*`) into the place where Typed compiler candidates are compiled, run, compared and measured. Entries use the investigation format. The evidence that motivated the ticket is in PICOCALC-RAY-PARITY's `analysis/01-using-the-trace-repl-for-compiler-work-field-notes-and-verdict.md`.

## Step 1: Create the ticket and draft the intern guide

This step created the ticket, its tasks (W1–W7 plus the guide and the upload) and a first full draft of the intern guide. I wrote the guide from the REPL source and from what I needed while working on PICOCALC-RAY-PARITY. No REPL code has changed yet. The implementation is handed to a separate agent working in its own git worktree, which continues this diary from Step 2.

### Prompt Context

**User prompt (verbatim):** "also, make a ticket to improve the REPL with all your suggestions. Create a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

**Follow-up prompt (verbatim):** "send off a subagent to do the REPL stuff. tell them to commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

**Assistant interpretation:** Turn the REPL verdict from the RAY-PARITY field notes into a designed, implemented and tested set of changes, with a newcomer guide and a diary.
**Inferred user intent:** Compiler work should happen in one persistent tool instead of ad-hoc Python drivers that push code into a REPL in 30,000-character chunks.

### What I did

- `docmgr ticket create-ticket --ticket PICOCALC-TRACE-WORKBENCH --title "Turn the trace REPL into a compiler workbench" --topics picocalc,compiler,performance`, plus the design doc, this diary, and tasks ttbl (guide), xibi (upload) and kvw7, zus8, 8d4q, u3co, ly11, khld, 1o7d (W1–W7).
- Read `pkg/tracerepl/service.go`, `pkg/tracerepl/http.go`, `pkg/traceapi/install.go`, `cmd/trace-repl/main.go` (`newService`, `serveListener`) and the outline of `pkg/tracearchive/archive.go`.
- Wrote `design-doc/01-turning-the-trace-repl-into-a-compiler-workbench-an-intern-guide.md`: the architecture, the path of a cell, the field evidence table (N1–N8), the designs W1–W7, the implementation order, decision records D1–D4 and a file reference.

### Why

- RAY-PARITY's most valuable REPL use was running the unmodified Typed compiler in a goja VM. goja is a bytecode interpreter like QuickJS on the P4, so it exposes compile-cost problems that V8 hides. That use needed `scripts/repl_client.py` (chunked string binding), one cell per input to stay under the 15 s deadline, and per-study statistics code.

### What worked

- The source confirmed every limit quoted in the guide: `MaxSourceBytes = 64 << 10`, `MaxResultBytes = 512 << 10`, `defaultEvalTimeout = 15 * time.Second`, `MaxSessions = 32` and the server's `WriteTimeout: 25 * time.Second`. `Installer.InitRuntime` deletes `require`.

### What didn't work

- Nothing has been run against the REPL code in this step. The guide's W1 wrapper (two compiler revisions isolated by a function scope that shadows `globalThis`) has not been tried. It must be checked against how `typed-world.js`, `typed-async.js` and `typed-pie-loops.js` refer to one another.

### What I learned

- Each session's JS API is installed through a temporary `__trace` bridge whose results are copied with `JSON.parse`, so sessions never share mutable values. Any new provider (compiler, repo, mounts, stats) should follow the same rule.

### What was tricky to build

- Jobs (W3) must reuse the session gate in `WithRuntime`. A goja runtime cannot be cloned, and two goroutines must never touch one VM.

### What warrants a second pair of eyes

- W1's scope isolation is the riskiest claim in the guide. If it does not hold, D1 (one VM per session) must be revisited.

### What should be done in the future

- Implementation, W1–W7, in the order of guide Section 5. The acceptance test is that RAY-PARITY's Python drivers become unnecessary.

### Code review instructions

- Read the guide against `pkg/tracerepl/service.go` and `http.go`.

### Technical details

- Running services at handoff: ports 3791–3795 belong to other labs and to RAY-PARITY (3795). Do not stop them.

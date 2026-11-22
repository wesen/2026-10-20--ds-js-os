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

## Step 2: Review the guide against the code and test the W1 wrapper

Before writing any service code I read the REPL source, the RAY-PARITY drivers and the seven compiler files that W1 has to load, and I ran the guide's untested W1 wrapper in Node on the two acceptance revisions. The wrapper works: two revisions coexist in one realm without leaking globals, and their images agree and differ exactly where the commits say they should. The review found five places where the guide was wrong or unclear, and I corrected them before uploading it.

This step also found that the worktree cannot build as checked out, because `go.mod` replaces go-go-goja with a path relative to the main checkout. A `GOWORK` file outside the tree fixes that without touching `go.mod`.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Delegated brief (summary, not the user's words):** the parent agent handed this ticket to an implementation agent in its own git worktree. Review the guide against the code first, in particular how `typed-wasm.js`, `typed-async.js`, `typed-world.js`, `typed-rv32.js` and `typed-pie-loops.js` refer to each other, fix the guide, upload it to reMarkable, then implement W4, W5, W2, W1, W3, W7 and W6 in that order with tests and focused commits, and port the RAY-PARITY drivers to REPL-native scripts. Do not touch `picocalc-os/compiler/`, `picocalc-os/tests/` or RAY-PARITY's files, and do not stop the services on ports 3791–3795.
**Assistant interpretation:** Validate the riskiest claim of the design by experiment before building on it, and make the guide match the code.
**Inferred user intent:** The intern guide should be correct when it lands on the reMarkable, and the implementation should not inherit a design error.
**Commit (code):** see the commit that adds `scripts/01-w1-wrapper-check.mjs` (recorded in Step 3).

### What I did

- Fast-forwarded the worktree branch `worktree-agent-a2fb34f1ca31870f0` from `ad48b80` to `main` at `14c95b5` (`git merge --ff-only main`). The branch had been created 228 commits behind `main` and contained neither the ticket nor `cmd/trace-repl`.
- Read `pkg/tracerepl/{service,http}.go`, `pkg/traceapi/install.go`, the framing and help of `pkg/traceapi/query.js`, `pkg/tracearchive/archive.go`, `cmd/trace-repl/main.go` and the tests, and the replsession `Service` API in `../go-go-golems/go-go-goja/pkg/replsession` (`CreateSession`, `WithRuntime`, `Snapshot`, `UnloadSession`).
- Listed every `globalThis` use and bare cross-module name in the seven files with `grep -n 'globalThis' …` and a `grep -noE` over the module names.
- Wrote `scripts/01-w1-wrapper-check.mjs`. It reads each file at `eaf0872` and `3213028` with `git cat-file blob`, builds the guide's wrapper for each, evaluates both in one `vm.createContext` realm and compiles the ray tracer, the Chess world and a PIE build with both.
- Edited the guide: W1 interface and mechanism (with a table of how each file finds the others), the W3 409 rule, the W4 help title and revision, a section on building from a worktree, and `08-score-board` in the workaround list.

### Why

- The handoff named W1's scope isolation as the claim most likely to be wrong, and D1 (one VM per session) depends on it. Testing it in Node took minutes and does not depend on any Go code.

### What worked

- `node scripts/01-w1-wrapper-check.mjs $PWD` printed: `leakedGlobals: []`; ten exports (`compileTyped`, `typedWasm`, `typedAsync`, `typedWorld`, `compileTypedWorld`, `compileTypedWorldRv32`, `typedRv32`, `typedPieLoops`, `typedRv32Interp`, `typedRayBench`); `sameModuleObject: false`; ray `stock` 9564/9564 identical, `default` 8632/8632 identical, `saved+direct` 8632 against 8048, different; candidate opening frame `steps: 12717463`, `digest: b3c26cc8`; Chess world 45,348 B with both; `pieLoops: "pie-empty"` 9,540 B.
- With the `GOWORK` file, `go build ./...`, `go vet ./...` and `go test ./...` pass at `14c95b5` (cmd/trace-repl 0.33 s, traceapi 5.2 s, the rest under 1 s).

### What didn't work

- `go build ./...` in the worktree failed with `pkg/tracerepl/service.go:16:2: github.com/go-go-golems/go-go-goja@v0.10.7: replacement directory ../go-go-golems/go-go-goja does not exist`. The relative replace resolves from the main checkout only. Recovery: a `go.work` in my scratchpad with `use <worktree>` and `replace github.com/go-go-golems/go-go-goja => /home/manuel/code/wesen/go-go-golems/go-go-goja`, selected with `GOWORK=`. The checkout there is at tag `v0.10.7`.
- My first wrapper check called `work.compileTypedWorldRv32(chess, 0, undefined)` and failed with `TypeError: First argument to DataView constructor must be an ArrayBuffer` in `linkSlot`. The function needs a reactor image as its second argument. That was my misuse, not the wrapper. I changed the check to `typedRv32.compile(chess, typedWorld.imports, 96 * 1024)`.

### What I learned

- The files find each other in two ways. Some reads go through `globalThis` (`typed-wasm.js` reads `globalThis.typedAsync?.rewrite` and the firmware's `globalThis.__typedLexIndex` hook; `typed-rv32.js` checks `globalThis.typedPieLoops`), others through bare names (`typedWasm` in four files, `typedRv32` in `typed-world.js`, `typedRv32Interp` in `typed-ray-bench.js`). The wrapper has to provide both, and the `let` bindings have to be live, because `typed-world.js` loads before `typed-rv32.js` and names it only inside functions.
- `typed-world.js` and `typed-wasm.js` publish plain functions (`compileTypedWorldRv32`, `compileTyped`) as well as module objects, so the bundle must expose the whole shadow object.
- `tools/rv32-interp.js` and `tools/typed-ray-bench.js` were added in `eaf0872`. At older revisions they are absent, so the provider must treat them as optional.
- The board inputs the brief names (`scripts/08-score-board.{js,py}`, `various/13-board/`, `various/14-board-scores.json`) are not committed on `main`. They exist only as untracked files in the main checkout, so the acceptance service must read them from there.
- The archive manifest has no title: it is `{variant: {phase: {command, sha256, rawBytes, dumps}}}`. `q.help()` cannot take its title from it.

### What was tricky to build

- File separators. Every file begins with `//` comments and then `(`, and a file may end in a comment. Concatenating files with the assignment on the same line, as the guide's sketch showed, would comment the assignment out or parse the next file's IIFE as a call. Each file is now followed by `\n;name = globalThis.name;\n`.

### What warrants a second pair of eyes

- The shadow object has no prototype, unlike the real QuickJS realm global the files were written for. No current file reads a built-in through `globalThis`. A future file that does so would fail with `undefined` and not silently, which I prefer to letting user globals leak into a compiler.

### What should be done in the future

- Implement W4, W5, W2, W1, W3, W7 and W6 in that order (Steps 3 onward).

### Code review instructions

- Run `node ttmp/2026/11/21/PICOCALC-TRACE-WORKBENCH--…/scripts/01-w1-wrapper-check.mjs $PWD` from the repository root.
- Compare the guide's W1 table with `grep -n globalThis picocalc-os/compiler/typed-*.js picocalc-os/tools/{rv32-interp,typed-ray-bench}.js`.

### Technical details

- Guide corrections: (1) W1 `compiler.sources.*` moved onto the revision object (`work.ray`, `work.world(name)`, `work.read(path)`, `work.typedSources()`), so sources and compiler always share a revision; (2) the wrapper needs `;` separators, a prototype-less shadow object and must return every published name; (3) W3 said both "a cell waits behind a job" and "return 409", and now says 409 at once; (4) W4's help title comes from the ticket directory name and its `index.md` `Title:`; (5) W4's binary revision is only available from `go build` VCS stamping, so `/info` also reports `HEAD` of `--repo`.

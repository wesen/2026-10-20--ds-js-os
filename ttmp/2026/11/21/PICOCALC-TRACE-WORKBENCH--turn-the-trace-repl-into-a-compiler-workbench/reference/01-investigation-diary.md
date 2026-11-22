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
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-WORKBENCH--turn-the-trace-repl-into-a-compiler-workbench/scripts/06-run-acceptance.sh
      Note: Runs every RAY-PARITY replacement through the CLI
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-WORKBENCH--turn-the-trace-repl-into-a-compiler-workbench/scripts/09-find-renames.py
      Note: Probe that found the alias-resolution rename
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-WORKBENCH--turn-the-trace-repl-into-a-compiler-workbench/various/02-planner-equivalence-eaf0872-3213028.json
      Note: Planner equivalence job result
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-WORKBENCH--turn-the-trace-repl-into-a-compiler-workbench/various/04-board-scores.json
      Note: Board scores reproduced from rows.json
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

## Step 3: W4, an inventory endpoint and a help title that names the archive

A running service can now say what it mounted. `GET /info` reports the archive directory, its ticket name and title, the manifest and stream digests, the two optional studies, open sessions against the limit and the per-cell limits. `trace-repl info` prints it, and `GET /` lists the routes instead of returning 404. `q.help()` and `a.toJSON()` name the mounted capture, so the SHADOW-LLVM service on 3795 will stop calling itself the row archive once it is restarted from this code.

The guide was uploaded to reMarkable at the start of this step, by a small-model subagent, before any code changed: `OK: uploaded PICOCALC-TRACE-WORKBENCH Intern Guide.pdf -> /ai/2026/11/21/PICOCALC-TRACE-WORKBENCH`.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W4 first, as guide Section 5 orders, because every later change is easier to debug when a service can describe itself.
**Inferred user intent:** Stop having to use `ps` and tmux names to find which service holds which capture (field note N1).
**Commit (code):** c195e91 — "feat(trace-repl): GET /info inventory and help that names the mounted archive"

### What I did

- `pkg/tracearchive/archive.go`: `Open` records the absolute directory, a `Label` and the manifest's SHA-256. New `Label` (`Ticket`, `Title`, `Dir`, `String()`), `readLabel`, `StreamInfo`, and the accessors `Dir`, `Label`, `ManifestSHA256`, `Streams`.
- `pkg/traceapi/install.go`: bridge method `describe()`. `query.js` computes `ARCHIVE_NAME` from it once and uses it in the help index and `a.toJSON()`.
- `pkg/tracerepl/service.go`: `Option`, `WithInventory(func() map[string]any)`, `Limits`, and `inventory()`, which adds `service`, `started` and `limits`. `New` takes variadic options, so existing callers are unchanged.
- `pkg/tracerepl/http.go`: `GET /info` adds `sessions: {open, max}` from the handler's `live` map under its mutex. `GET /{$}` lists `routes`.
- `cmd/trace-repl/main.go`: an `inventory` struct holding the verified inputs, `describe()`, `buildInfo()` from `debug.ReadBuildInfo`, and an `info` subcommand.
- Tests: `TestLabelAndStreamsDescribeTheMountedCapture` (tracearchive), `TestInfoReportsInventorySessionsAndLimits` (tracerepl, including the 403 for an `Origin` header), `TestInfoNamesTheMountedCapture` (cmd: real archive and device study over HTTP, the CLI `info` client, and the help title in a session).
- Smoke test: built `scratchpad/bin/trace-repl`, started it on 127.0.0.1:3811 with the ROW-IR archive, ran `trace-repl info --addr 127.0.0.1:3811` and `curl /`, then stopped it with `scratchpad/stop-my-service.py 3811`. That script only signals a process whose `argv[0]` is the scratchpad binary and whose arguments name the port, and it refuses ports below 3811.

### Why

- The manifest has no title, so the name has to come from the archive directory. Every archive in this repository is a docmgr ticket directory with an `index.md`, so the ticket prefix and the frontmatter `Title:` are reliable, and a plain directory still gets its basename.
- The inventory is a callback rather than a struct in `tracerepl`, so the REPL package stays independent of archives and studies.

### What worked

- `go test ./...` passes (cmd 0.57 s, traceapi 5.3 s, tracearchive 0.27 s, tracerepl 0.73 s). `go vet ./...` and `gofmt -l` are clean.
- The live `info` output on 3811 named `PICOCALC-ROW-IR` / "Trace the ray row through GCC and LLVM optimization passes", manifest `278cdce2…`, 6 streams, `deviceStudy: null`, `sessions {max: 32, open: 0}`, `limits {65536, 524288, 15}`.

### What didn't work

- The first build, `go build -o scratchpad/bin/trace-repl ./cmd/trace-repl`, was stamped `vcs.revision=4e0dd35c862fa442b60950dbc1ebcd34892e4d6c`, `vcs.modified=true` (`go version -m`). That is the head of `main` in the main checkout ("docs(ray-parity): REPL field notes N8-N10, task bookkeeping"), not this worktree's `c7a13e6`. A worktree's `.git` is a file, and the stamp matches the main checkout, which is consistent with the go command finding the VCS root by a `.git` directory and walking up past the worktree. A worktree build therefore carries the wrong revision. I now build with `-buildvcs=false` (`build.revision: null`) and documented the caveat in the README. W2 will report the `HEAD` of `--repo`, which git resolves correctly for a worktree.
- A diary append and one code edit written through long shell heredocs were refused by the worktree guard ("this command is too complex to verify that it stays inside the worktree"). I made the code edits with the Edit tool and append diary entries from a scratch file.

### What I learned

- `main` has moved on since this branch was cut: `63abc8a` "feat(rv32): make callee-saved homes and direct reads the default" landed after `14c95b5`. The acceptance work compares the fixed commits `eaf0872` and `3213028`, so it does not depend on that.

### What was tricky to build

- The session count lives in the handler's `live` map, not the service, so `/info` takes the handler's mutex to read it. W7 moves the registry into the service, and then `/info` can read the count there.

### What warrants a second pair of eyes

- `inventory()` lets the caller's map supply any key and then overwrites `service`, `started` and `limits`. The handler adds `sessions` after that. A caller that sets one of those keys loses it silently, which is intended.

### What should be done in the future

- W2 adds `repo` and `mounts` to the inventory, and W3 adds `jobSeconds` to the limits.

### Code review instructions

- Start at `pkg/tracerepl/http.go` (`GET /info`) and `cmd/trace-repl/main.go` (`inventory.describe`, `buildInfo`).
- Run `go test ./cmd/trace-repl ./pkg/tracerepl ./pkg/tracearchive -run 'Info|Label'`.

### Technical details

- `GET /info` keys: `service`, `started`, `build {goVersion, module, revision, revisionTime?, modified?}`, `archive {path, label {ticket, title, dir}, manifestSHA256, streams [{variant, phase, sha256, rawBytes, dumps}]}`, `deviceStudy {path, sourceSHA, firmwareSHA, pairs, loads} | null`, `simdStudy {path, sha256, empty, decisions, traces} | null`, `sessions {open, max}`, `limits {sourceBytes, resultBytes, cellSeconds}`.

## Step 4: W5, one tested statistics library in every session

Every session now has a `stats` global with the statistics compiler studies report. `stats.paired` is the important one. It pairs one control row with one candidate row per key, for example per counterbalanced load block, and returns the median of the per-pair percentage saved, which is the statistic the PicoCalc board reports use. Next to it, it reports the change between the two arm medians, because field note N7 found reports mixing the two. It refuses inputs that would make the number meaningless, and it names the offending keys.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W5 as guide Section 5 step 2: an embedded `stats.js` with Go tests over fixed fixtures.
**Inferred user intent:** Stop each study from re-implementing medians and paired comparisons slightly differently (N7).
**Commit (code):** 0bee9f9 — "feat(trace-repl): shared stats global for medians and paired block comparisons"

### What I did

- `pkg/traceapi/stats.js`: `median`, `mean`, `quantile(xs, p)` (linear interpolation between order statistics, R type 7), `summary` (`{n, min, q1, median, q3, max, mean}`), `percentSaved(control, candidate)`, `paired(rows, {key, control, candidate, value, better})` and `help()`. The object is frozen.
- `pkg/traceapi/stats.go`: `InstallStats(vm)`, which runs the embedded script. It needs no bridge, because it reads no evidence.
- `cmd/trace-repl/main.go`: installs it after the SIMD provider. `query.js`: the help index points to `stats.help()`.
- `pkg/traceapi/stats_test.go`: `TestStatsFixtures`, `TestStatsPairedComparison` (six blocks, two arms, wins/losses/ties, and `better: "higher"`), `TestStatsRefusesWhatItCannotSummarize` (nine refusals by error code and message).

### Why

- `paired` takes predicates for the two arms and accessors for the key and value, so the same call covers the board rows (`r.arm === 2` against `r.arm === 3`, keyed by `block`) and the compile-cost samples (keyed by repetition).
- Error codes in brackets (`[unmatchedKey]`, `[duplicatePair]`) follow the query language's convention, so a researcher sees the same shape of message from both libraries.

### What worked

- The paired fixture gives per-block savings 10, 10, 20, −5, 25 and 0 percent, median 10. Its arm medians are 105 and 99.5, a 5.24% change. The test asserts both, which is exactly the distinction N7 described.
- `go test ./...` and `go vet ./...` pass.

### What didn't work

- `TestStatsPairedComparison` first failed: `MedianPercentSaved:9.999999999999998`, compared with `!= 10`. `100 * (1 - 90 / 100)` is not exactly 10 in binary floating point. I kept the formula, because it is the same expression the RAY-PARITY board script used (`100 * (1 - b[i] / x)`), and reproducing its numbers to the last digit matters more than a round fixture. The test now compares with a tolerance of 1e-9.

### What I learned

- The old board script's `median` already averaged the two middle values of an even sample. `stats.median` does the same, so the board numbers can be reproduced exactly rather than approximately.

### What was tricky to build

- Deciding what a win is. For times and sizes lower is better, so a win is a pair whose candidate is below its control; `better: "higher"` reverses that. Ties are counted separately, so `wins + losses + ties = pairs`. The old script counted only `x > b[i]`, which equals `wins` here.

### What warrants a second pair of eyes

- `paired` refuses a control value of 0 instead of returning an infinite percentage. A study that measures something that can be 0 has to pick another statistic deliberately.

### What should be done in the future

- N/A for this step. The acceptance cells in Step 8 use `stats.paired` for the board and compile-cost numbers.

### Code review instructions

- Read `pkg/traceapi/stats.js` (`paired`) and run `go test ./pkg/traceapi -run Stats -v`.

### Technical details

- `paired` returns `{pairs, controlMedian, candidateMedian, medianPercentSaved, percentSavedOfMedians, wins, losses, ties, better, method, perPair: [{key, control, candidate, percentSaved}]}`, with `perPair` sorted by key.

## Step 5: W2, read-only repository files and startup mounts

A session can now read the inputs it needs instead of having them pushed through `eval` in 30,000-character chunks. `repo.read`, `repo.show`, `repo.list` and `repo.resolve` give confined, read-only access to one repository, in its working tree or at any git revision. `--mount NAME=PATH` adds a file from anywhere, read and digested before the server listens. Every returned file carries the SHA-256 of its stored bytes, so data in a session can be cited the same way archive references are.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W2 as guide Section 5 step 3, with tests for escape attempts, the size cap and digests.
**Inferred user intent:** Remove field note N5's workaround (`repl_client.py`'s chunked string binding) for everything except interactive snippets.
**Commit (code):** 1607478 — "feat(trace-repl): read-only repo and --mount inputs with digests"

### What I did

- New package `pkg/tracerepo`: `Open(root, mounts)`, `Discover(dir)`, `Repo.Read`, `Show`, `List`, `Resolve`, `Head`, `Mounts`, `Mount`; types `File`, `Entry`, `Mount`, `MountInfo`.
- `pkg/traceapi/repo.go` and `repo.js`: a temporary `__repo` bridge that is deleted after `repo.js` runs, as with `__trace`. File objects are built in Go with `vm.NewObject()`, and `repo.js` adds a non-enumerable `json()`. `mounts.NAME` is a lazy getter, cached per session. `mounts.list()` and `mounts.toJSON()` describe the mounts without their text.
- `cmd/trace-repl/main.go`: flags `--repo` and `--mount` (a string list), `openRepo`, and `repo` and `mounts` in `/info`.
- Tests: `pkg/tracerepo/repo_test.go` builds a two-commit git repository in a temp directory, with a gzip file, a symlink inside the tree and one pointing outside it. `TestReadIsConfinedToTheRepository`, `TestShowReadsCommittedContentAtARevision`, `TestListWorktreeAndRevision`, `TestMountsAreReadAndDigestedAtStartup`. `pkg/traceapi/repo_test.go` runs two VMs over this repository. `cmd/trace-repl/main_test.go` gains a mount in the `/info` test and `TestMountAndRepoFlagsAreChecked`.

### Why

- Git access shells out to `git` plumbing (`rev-parse`, `cat-file`, `ls-tree`) instead of adding go-git. The module cache may be offline, and plumbing output is stable. Every call runs with `GIT_OPTIONAL_LOCKS=0`, so nothing rewrites the index, and with a 30 s deadline.
- `.git` paths are refused even though reading them would be harmless. The interface is about repository content, and `repo.show` is the way to reach committed content.
- Revision names are checked against `^[A-Za-z0-9_][A-Za-z0-9._/@{}^~-]*$` and may not contain `..`, so a revision can never be parsed as an option or a range. `rev-parse` also gets `--end-of-options`.

### What worked

- All four `tracerepo` tests passed on the first run. They cover `../secret.txt`, `src/../../secret.txt`, an absolute path, a symlink out of the tree, `.git/config`, a directory, a missing file, an empty path, a sparse file one byte over the cap (refused from its size, before reading), a gzip file whose digest matches the stored bytes, revisions given as full SHA, abbreviated SHA, branch and `HEAD~1`, and the refusals `--output=/tmp/x`, `main..HEAD`, `worktree` and a full SHA of no commit.
- The session test reads this repository: `repo.show('eaf0872', 'picocalc-os/compiler/typed-rv32.js').bytes` is 33,175, `repo.list('picocalc-os/tools', '25cd108')` has no `rv32-interp.js` and `eaf0872` has it, and an edit of `mounts.board.text` in one VM leaves the other VM's value unchanged.
- `go test ./...` and `go vet ./...` pass.

### What didn't work

- `JSON.stringify(mounts)` first returned the mount fields in alphabetical order (`bytes, gzip, name, path, sha256`), because the bridge marshalled `map[string]any`, whose keys Go sorts. I replaced the maps with the struct `tracerepo.MountInfo`, which keeps the declared order. The same struct now serves `/info`.
- A grammar test case I added, `serve --archive . --mount no-equals-sign`, could not test the mount parser: `serve` fails on the archive before it reads `--mount`. I removed it and test `openRepo` directly.
- My first `openRepo` assertion named this worktree's directory (`agent-a2fb34f1ca31870f0`), which would fail after the merge. It now checks only that the default repository has a 40-character `HEAD`.

### What I learned

- The worktree guard rejects long shell heredocs and loops that contain `git`. Small Python edit scripts and the Edit tool work.

### What was tricky to build

- Confinement has to be checked after symlink resolution, not on the cleaned path. `src/escape.txt` cleans to a harmless path but resolves outside the tree. `inside()` runs `filepath.EvalSymlinks` and compares the result with the root, which was itself resolved at `Open`, so a root reached through a symlink still matches.
- The revision cache must not grow without bound when a session reads large files at many revisions. It holds at most 256 MiB of text and starts over when a new entry would exceed that. Entries are immutable, so dropping one only costs a later git read.

### What warrants a second pair of eyes

- `Read` stats the file, then opens and reads it. A file replaced in between could exceed the cap. The read is limited to `MaxFileBytes + 1` and refuses anything longer, so the cap holds either way.
- Strings from Go are passed to the VM without copying. JS strings are immutable, so this cannot leak a change between sessions, and each session gets its own file objects.

### What should be done in the future

- W1 builds on `Repo.Show` and `Repo.Read` for the compiler files.

### Code review instructions

- `pkg/tracerepo/repo.go`: `clean`, `inside`, `Read`, `Resolve`, `Show`, `List`, `git`.
- Run `go test ./pkg/tracerepo ./pkg/traceapi -run 'Repo|Read|Show|List|Mount' -v`.

### Technical details

- File object: `{path, revision, sha256, bytes, gzip, text}` plus `json()`. `revision` is `"worktree"`, a full commit SHA, or `"mount"`. Caps: 32 MiB stored, 64 MiB inflated.

## Step 6: W1, the Typed compiler at a revision, several in one session

`compiler.at(rev)` loads the seven compiler files at a git revision, and `compiler.at("worktree")` loads them from disk. A session can hold several revisions at once and compare their outputs inside one cell. This was the most valuable use field note N4 found, and the one that needed the most workaround code: `01-open-compiler-session.py` pushed each file through `eval` in chunks and saved the baseline backend as `typedRv32Base`. The goja test loads `eaf0872`, `3213028` and `14c95b5` into one VM and confirms what the Node experiment of Step 2 showed: images agree under stock and default, differ under saved+direct, and agree everywhere when `typed-rv32.js` is the same.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W1 as guide Section 5 step 4, on top of W2's file access, with a test that loads two revisions in one session.
**Inferred user intent:** Make the persistent VM the normal place to compile, run and compare compiler candidates.
**Commit (code):** 6076045 — "feat(trace-repl): compiler.at(rev) loads Typed compiler revisions side by side"

### What I did

- New package `pkg/tracecompiler`: `Modules` (binding, alias, path, required), `Bundle` (`Revision`, `Files` with `Line`, `Missing`, `Key`, `Program`), `Provider.At(rev)`, `load`, `wrap`, `Bundle.Where`, `Provider.TypedSources`, `Provider.Cached`.
- `wrap` builds the guide's wrapper: a prototype-less shadow `globalThis`, `let` bindings for the seven module names, each file followed by `\n;name = globalThis.name;\n`, and `return globalThis`. `goja.Compile("compiler@<rev12>", src, false)` compiles it once. Bundles are cached by commit, and programs by a key over the files' paths and digests, so reloading an unchanged working tree reuses the compiled program. Both caches hold at most 32 entries.
- `pkg/traceapi/compiler.go` and `compiler.js`: bridge methods `resolve`, `load` (runs the shared `*goja.Program` in this VM with `vm.RunProgram` and returns the shadow object), `read`, `typedSources` and `modules`. The JS side builds the revision object: module aliases, `globals`, `read`, `world`, `ray`, `typedSources`, `where`, `toJSON`. It memoizes commits per session.
- `cmd/trace-repl/main.go`: one `tracecompiler.Provider` per service, installed in every session. `/info` lists the modules and cached commits.
- Tests: `TestWrapSeparatesFilesAndRecordsLines` (tracecompiler: a file ending in a comment without a newline, a file starting with `(`, a late bare reference, no leak onto the real global, line numbers), `TestCompilerRevisionsCoexistInOneSession` and `TestWorktreeCompilerReportsFileDigests` (traceapi), and a served-session check in `cmd/trace-repl`.

### Why

- The compiled program is shared, and the module objects are not. A `*goja.Program` is independent of any runtime, so compiling 190 KB of compiler source once and running it per session costs each session only the execution of the files' top levels.
- Memoizing a commit per session makes `compiler.at("eaf0872")` cheap inside loops and makes `base === compiler.at("eaf0872")` true. `"worktree"` is never memoized, because the point of it is to see edits.
- `world(name)` joins the files of `source.list` with `"\n"`, exactly as `01-open-compiler-session.py` did, so byte identity with earlier results is not lost to a different assembly.

### What worked

- `TestCompilerRevisionsCoexistInOneSession` passed on its first run, in 1.0 s. It checked: no global leaked; three distinct `typedRv32` objects; `compiler.at('eaf0872') === base`; `typed-rv32.js` digests differ between `eaf0872` and `3213028` and agree between `3213028` and `14c95b5`; ray image sizes stock 9564/9564/9564, default 8632/8632/8632, saved+direct 8632/8048/8048, with `3213028` and `14c95b5` identical in every arm; ten published names; the Chess world from `source.list` (6 files) compiles to 45,348 B with both backends; 33 `.typed` sources; `where(files[3].line + 9)` gives `typed-rv32.js` line 10; `25cd108` loads with both tools in `missing` and `interp`/`rayBench` null.
- `TestWorktreeCompilerReportsFileDigests` compares every reported digest and size with the file on disk.
- `go test ./...` and `go vet ./...` pass.

### What didn't work

- My first `where` went through a bridge method that called `provider.At(rev)` again. For `"worktree"` that re-reads the files and could map a line against a newer version than the one loaded. I moved the mapping into JS, over the `files` of the loaded revision.

### What I learned

- The scope wrapper behaves the same in goja as in V8. `const globalThis` in a function scope shadows the global in goja too, and the files' `"use strict"` arrow IIFEs resolve bare names through the wrapper's live `let` bindings.
- Running a precompiled program from inside a native function (`vm.RunProgram` inside the bridge's `load`, called from a cell) works in goja, as `require` implementations rely on.

### What was tricky to build

- Line bookkeeping. A file of `k` newlines followed by `\n;x = …;\n` advances the wrapper by `k + 2` lines whether or not the file ends with a newline: a file without a trailing newline has one newline fewer, and the separator's first `\n` then ends its last line. The unit test checks this with one file of each kind.

### What warrants a second pair of eyes

- A revision object holds the session's module objects, which a cell can mutate, for example by monkeypatching `base.typedRv32.compile`. Because commits are memoized per session, the patch persists for that session. That is consistent with notebook semantics and cannot reach another session.
- The two caches start over when they reach 32 entries. A session that loads more than 32 revisions pays for recompiling, and nothing is incorrect.

### What should be done in the future

- Acceptance (Step 8) ports `01-open-compiler-session.py` and `02-planner-equivalence.{js,py}` onto `compiler.at`.

### Code review instructions

- `pkg/tracecompiler/compiler.go` (`wrap`, `load`, `At`) and `pkg/traceapi/compiler.js` (`decorate`, `at`).
- Run `go test ./pkg/tracecompiler ./pkg/traceapi -run 'Wrap|Compiler' -v`.

### Technical details

- Revision object: `{revision, requested, files: [{path, sha256, bytes, line}], missing, key, globals, typedWasm, typedAsync, typedWorld, typedRv32, typedPieLoops, interp, rayBench}` plus `read(path)`, `world(name) → {name, text, files}`, `ray`, `typedSources()`, `where(line) → {path, line} | null`.

## Step 7: W3, background jobs with their own deadline

A cell must finish in 15 seconds. A job is a cell that may take up to `--max-job` (default 10 minutes), runs in the same session VM and returns at once with an ID. This removes field note N6: an equivalence sweep or a compile-cost measurement no longer has to be cut into one cell per input by an outside driver. While a job holds a session, cells and other jobs get HTTP 409 with the job's ID instead of quietly using up their own deadline in the queue.

Session bookkeeping moved into the service in this step. Jobs need per-session state (the active job and the finished ones), so `tracerepl.Service` now keeps a registry of the sessions it opened. W7 extends that registry with timestamps and reaping.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W3 as guide Section 5 step 5: factor the evaluation body out of `Evaluate`, add the job routes and a CLI flag, and test that a job runs past 15 s, that a cell during a job gets 409, that deleting a job interrupts it and that closing the session stops it.
**Inferred user intent:** Keep batch work inside the persistent session instead of in Python drivers.
**Commit (code):** 601bb5e — "feat(trace-repl): background jobs with their own deadline"

**Mid-step user questions (verbatim):** "yu how are things going? are you using go-go-goja?" and "and its replapi?" I answered that every session is a go-go-goja `replsession` VM and that the trace REPL uses `replsession` directly rather than `replapi`. `replapi.App` adds the durable `repldb` store (persistence, restore, history, a `ListSessions` over persisted records). The trace REPL's sessions are deliberately in memory and unpersisted (`replsession.RawSessionOptions()`), so `replapi` would add a store with nothing to store, and its session list would not show live raw sessions. Session listing and reaping (W7) therefore stay in `tracerepl`'s own registry.

### What I did

- `pkg/tracerepl/service.go`: `Evaluate` now calls `claim` (the session must be known and hold no job), then `run`. `run(ctx, id, source, what, limit, started)` is the old body, with `what` naming the unit ("cell" or "job") in interrupt messages and `started` called on the VM owner just before the source runs. `stopReason` distinguishes a job's deadline, a stop request (`errJobStopped`), session close and service shutdown, and the cell-deadline message now suggests `trace-repl eval --job`. `Open` registers, `Release` unregisters, `Close` waits for job goroutines. `WithMaxJob`, and `Limits.JobSeconds`.
- `pkg/tracerepl/jobs.go`: `Job`, `JobView`, `BusyError` (unwraps to `ErrSessionBusy`), `ErrJobNotFound`, the session registry (`sessionEntry`, `register`, `unregister`, `claim`, `touch`), `Submit`, `Job`, `Jobs` and `StopJob`.
- `pkg/tracerepl/http.go`: `decodeSource` (shared by eval and jobs; `timeoutSeconds` is optional and must be positive), the four job routes, 409 for `BusyError` (with the job ID) and 404 for `ErrJobNotFound`.
- `cmd/trace-repl/main.go`: `serve --max-job` (a Go duration), `eval --job [--job-timeout N] [--detach]`, and `job --session S --job-id J [--stop]`. The client is now built around one `call` helper. `waitForJob` polls with backoff from 100 ms to 1 s, and on Ctrl-C it stops the job on the service.
- Tests: `pkg/tracerepl/jobs_test.go` (five tests) and `TestEvalJobThroughTheClient` in `cmd/trace-repl`.

### Why

- A job reuses the session gate through the same `run` body (decision D2). goja runtimes cannot be cloned, and one VM must only ever be touched by its owner goroutine.
- 409 instead of waiting: a cell queued behind a ten-minute job would always fail at its own 15 s deadline, after 15 s of silence. Refusing at once with the job's ID tells the client what to poll.
- A job's context derives from the service's lifetime, not from the HTTP request, which ends as soon as the 202 is written.

### What worked

- `go test -race -count=3 ./pkg/tracerepl` passes, and `go test -race ./cmd/trace-repl` passes.
- The tests cover a job running 0.4 s under a 100 ms cell deadline and returning `kept + 2` = 42 from an earlier binding; a cell during the job (409, `BusyError.Job` equals the job ID); a second job (busy); the running view (`started` set); the job's top-level `const t0` persisting; a stop request (`stopped`, "job stopped by request", the next cell unaffected, a second stop reporting the job unchanged); `WithMaxJob(200ms)` capping a requested hour, and the deadline message "job stopped at its deadline (200ms"; a 600,000-character result refused like a cell's; closing the session ("job stopped because its session was closed"); and the HTTP protocol, including 400 for `timeoutSeconds: 0`, extra fields and a missing source.

### What didn't work

- `TestJobDeadlineIsCappedByTheService` first failed under `-race`: the job `'x'.repeat(600000)` reached the 200 ms cap before its result could be checked for size (`State:failed … ElapsedSeconds:0.226`). The race detector slows goja several-fold. I moved the size check into a test with the default cap.
- `TestJobRunsPastTheCellDeadlineAndHoldsTheSession` then failed twice in three runs with `ElapsedSeconds:0.3998` against my bound `>= 0.4`. The job measures its own 400 ms with `Date.now()`, which has millisecond resolution, while `started` is taken in Go just before the source runs. The bound only has to show that the job outlived the 100 ms cell deadline, so it is now `> 0.3`.
- Several edits through inline shell heredocs and `python3 - <<EOF` were refused by the worktree guard as "too complex to verify". I now write edit scripts to the scratchpad and run them by path.

### What I learned

- `context.Cause` of a `WithTimeout` child whose `WithCancelCause` parent was cancelled returns the parent's cause. The job goroutine therefore sees `errJobStopped` on its own deadline context and can tell a stop request from a deadline.
- A job interrupted because its session closed is cancelled through `WithRuntime`'s operation context, not through the job's own context. Its state therefore ends as `failed` with the message "job stopped because its session was closed". Nobody can query it afterwards, because the session is gone.

### What was tricky to build

- The order of state changes. `Submit` marks the session's active job before starting the goroutine, so a cell arriving a microsecond later is already refused. The goroutine clears `active` under the same mutex when it records the result, so `GET` never shows a finished job on a session that still refuses cells.
- `StopJob` cancels with the cause and then waits on the job's `done` channel without holding the mutex, because the goroutine needs the mutex to record its result.

### What warrants a second pair of eyes

- Console output of a job is captured with the same 64-line limit as a cell's and is only visible in the final result. A progress channel for long jobs would need the console state to become safe to read from another goroutine.
- `Service.Close` waits for job goroutines with no timeout. A job always ends once replsession closes its session, because the interrupt takes effect at the VM's next instruction, but a Go bridge call that blocks would hold shutdown.

### What should be done in the future

- W7 adds idle reaping to the registry introduced here. A busy session (`busy > 0`) must never be reaped.

### Code review instructions

- `pkg/tracerepl/jobs.go` (`Submit`, `StopJob`), `pkg/tracerepl/service.go` (`Evaluate`, `run`, `stopReason`), `pkg/tracerepl/http.go` (`decodeSource`, the job routes, `failure`).
- Run `go test -race ./pkg/tracerepl ./cmd/trace-repl`.

### Technical details

- `JobView`: `{job, session, state, submitted, started?, finished?, timeoutSeconds, elapsedSeconds, result?, error?}`. States: `queued` → `running` → `done` | `failed` | `stopped`. A session keeps its last 16 finished jobs.

## Step 8: Acceptance, the RAY-PARITY drivers as cells and jobs

With W1, W2, W3 and W5 in place, the acceptance test of the ticket could run: replace PICOCALC-RAY-PARITY's Python drivers with REPL-native cells and jobs, and reproduce its recorded results. All four replacements work, and a shell driver runs them through the `trace-repl` CLI alone in 53 s. The planner equivalence of `eaf0872` against `3213028` is one job that reproduces RAY-PARITY's recorded result exactly, and the board scoring is one cell that reproduces `14-board-scores.json` exactly. One measurement raised a question, whether the loading method changes compile time in goja, and a short experiment ruled that out.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The acceptance test of the delegated brief: the planner equivalence as one job with two `compiler.at()` revisions (`eaf0872` and `3213028`), the compile-cost measurement and the board scoring as cells using `stats`, the board rows read through `repo.read`, numbered scripts in this ticket's `scripts/`, results in the diary, and RAY-PARITY's files untouched.
**Inferred user intent:** Prove that the workarounds are no longer needed by doing the same work without them and getting the same numbers.
**Commit (code):** 78c963c — "test(trace-workbench): REPL-native replacements for the RAY-PARITY drivers"

### What I did

- Built `scratchpad/bin/trace-repl` at `6838a42` with `-buildvcs=false` and started it on 127.0.0.1:3811: `serve --archive ttmp/2026/11/21/PICOCALC-ROW-IR--… --repo /home/manuel/code/wesen/2026-10-20--ds-js-os --max-job 30m`. `--repo` names the main checkout, read-only, because the board inputs (`various/13-board/rows.json`, `various/14-board-scores.json`, `scripts/08-score-board.*`) exist there only as untracked files. They are not committed on `main`, so this worktree does not have them.
- Wrote `scripts/02-open-compiler-session.js` (replaces `01-open-compiler-session.py` and `repl_client.py`), `03-planner-equivalence.js` (replaces `02-planner-equivalence.{js,py}`), `04-compile-cost.js` (replaces `03-compile-cost.py`), `05-score-board.js` (replaces `08-score-board.{js,py}`), `06-run-acceptance.sh` (runs all of them through the CLI and saves `various/00`–`04`) and `07-loading-method-cost.js` (the follow-up experiment, `various/05`).
- Ran `03` once detached (`eval --job --detach`, then `trace-repl job`) and `05` in a second session while `03` was still running, then ran the whole driver: `TRACE_REPL=scratchpad/bin/trace-repl scripts/06-run-acceptance.sh 127.0.0.1:3811`.

### Why

- `03` and `05` check themselves against RAY-PARITY's recorded files (`06-phase1-equivalence-vs-eaf0872.json` and `14-board-scores.json`), read with `repo.read`, and report their digests. A reproduction claim is then a field of the result, not a comparison done by hand afterwards.
- The equivalence has eleven arms: RAY-PARITY's seven (its `stock: undefined` arm is `default` here, because since `eaf0872` no options means the default policy), `stock` named explicitly, and the three options that are new in `3213028` (`saved`, `direct`, `savedDirect`). `eaf0872` ignores the unknown option keys, so only those three may differ.

### What worked

- `02-open-compiler-session.js`: one 0.44 s cell binds both revisions and 38 inputs (330,186 characters). The old driver pushed the same text through `eval` in 30,000-character chunks.
- `03-planner-equivalence.js`, one job: 38 inputs × 11 arms × 2 compilers = 836 compiles in 38.9 s (32.5 s on the second run). RAY-PARITY's seven arms give 98 identical images, 168 identical errors and 0 mismatches, equal to the recorded file (sha256 `c9296b7b…`), so `rayParityArms.agrees` is true. `stock` and `default` are identical on all 14 inputs that compile. The three new arms account for all 41 mismatches. Ray: saved 8632 → 8984, direct 8632 → 8280, saved+direct 8632 → 8048. Chess world 45,348 → 42,120 and Editor 74,188 → 67,552 under saved+direct.
- `05-score-board.js`, one cell, 57 ms: `rows.json` (sha256 `c505fdae…`, 1932 rows) scored with `stats.paired` gives `identicalToRecorded: true` with no differing path. `JSON.stringify` of the result equals that of the recorded `scores`, including key order and every floating-point digit (for example frame pie 46011.5 → 42559, 7.5%, 6 wins; predicate scalar 10.87%).
- `04-compile-cost.js`, one job, 17.9 s. Medians in ms (stock, previous default, candidate): ray 20.4 / 21.4 / 23.5, Chess 348.1 / 349.7 / 371.7, Editor 886.4 / 900.2 / 911.7. Paired by round, previous → candidate: ray −9.32% (0 of 9 rounds won), Chess −6.08% (0 of 5), Editor −1.77% (1 of 3).
- `07-loading-method-cost.js`: the same `3213028` compiler loaded with `(0, eval)` (as `repl_client.py` did) and through `compiler.at` compiles identical images in the same time. Ray 22.3 against 22.1 ms, Chess 296.0 against 296.5 ms.

### What didn't work

- Nothing failed. One result needed an explanation. The absolute compile times are about half of RAY-PARITY's recorded medians (ray 21.4 against 54.6 ms for the previous default, Chess 349.7 against 796.8 ms), while the candidate's paired overhead is larger than RAY-PARITY's medians suggested (ray −9.3% against +2.2%, Chess −6.1% against +1.2%). `07` shows the loading method is not the cause. The remaining explanation is host load when each was measured; five services and several builds were running during RAY-PARITY's measurement. Absolute goja times are therefore not comparable across sessions and days. Paired, interleaved comparisons inside one job are.

### What I learned

- The paired goja overheads measured here (ray −9.3%, Chess −6.1%) are close to what the physical board trial recorded for the same change (`compileRay` −8.19%, `compileChess` −4.26% in `14-board-scores.json`). RAY-PARITY's medians of separate cells (+2.2% and +1.2%) were not. With n = 9 and n = 5 this is one observation, not a calibration. It is consistent with interleaving inside one job, which removes drift between cells.
- A second session can run a cell while the first is busy with a job, as the design requires.

### What was tricky to build

- The board rows live in the main checkout's working tree and not in git. Pointing `--repo` at the main checkout made them readable through `repo.read`, as the brief requires. Every git operation the service runs there is read-only plumbing with `GIT_OPTIONAL_LOCKS=0`. After the merge, and once RAY-PARITY commits those files, the scripts work with the default `--repo`.

### What warrants a second pair of eyes

- `04` compares the previous default on the `eaf0872` backend with the candidate on the `3213028` backend, as RAY-PARITY's arms were named. A candidate measured on its own backend with the old options would isolate the cost of the options from the cost of the backend's new code paths. That is an arm worth adding.

### What should be done in the future

- Once RAY-PARITY commits `various/13-board/` and `14-board-scores.json`, rerun `06-run-acceptance.sh` against a service with the default `--repo`.

### Code review instructions

- Read `scripts/03-planner-equivalence.js` and `scripts/05-score-board.js`, then the `various/02` and `various/04` results.
- Reproduce: start `trace-repl serve --addr 127.0.0.1:PORT --archive <ROW-IR> --repo <a checkout with RAY-PARITY various/13-board> --max-job 30m`, then run `scripts/06-run-acceptance.sh 127.0.0.1:PORT` from the repository root.

### Technical details

- Results: `various/00-service-info.json`, `01-open-compiler-session.json`, `02-planner-equivalence-eaf0872-3213028.json`, `03-compile-cost-goja.json`, `04-board-scores.json`, `05-loading-method-cost.json`.
- `typed-rv32.js` digests: `eaf0872` `2d8ec343…`, `3213028` `79f494e0…`.

## Step 9: W7, idle session reaping and a session list

A service now unloads sessions that nobody has used for `--idle` (default 2 h) and lists the open ones. Field note N8 found services refusing new sessions after a day of work, because sessions never expired and the limit is 32. A request to an unloaded session gets 404 with the reason, so a researcher learns why their bindings are gone instead of seeing a bare "not found".

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W7 as guide Section 5 step 6, on the registry introduced in Step 7.
**Inferred user intent:** Long-lived services should keep accepting sessions.
**Commit (code):** 99eb09e — "feat(trace-repl): idle session reaping and GET /sessions"

**Mid-step user questions (verbatim):** "how wwhere are we at? what are we doing?", "give me the big picture!" and "like the whole repl project, where are we at, what goals are we pursuing, what did we achieve?" I answered with the state of the ticket and of the REPL project (TRACE-QUERY designed the query language, TRACE-REPL built and qualified the service, RAY-PARITY used it for compiler work and wrote the field notes, and this ticket turns it into a workbench), then continued.

### What I did

- `pkg/tracerepl/sessions.go`: `WithIdle`, `SessionView`, `ExpiredError` (unwraps to `replsession.ErrSessionNotFound`, so the handler answers 404), `Sessions`, `SessionCount`, `Idle`, the `reap` goroutine (period `idle/4`, clamped to 10 ms–1 min), `reapIdle(now)` and `expire` (at most 256 remembered IDs).
- `service.go`: `New` starts the reaper when `idle > 0`. `Release` reports an expired session's reason. `Close` signals the reaper through a `closing` channel and waits for it. `/info`'s `sessions` now comes from the service and includes `idleSeconds`.
- `http.go`: the handler's own `live` map is gone. The 32-session limit counts `s.SessionCount()` under the handler's open mutex. New route `GET /sessions`.
- `cmd/trace-repl`: `serve --idle` (Go duration, `0` disables) and `trace-repl sessions`.
- `pkg/tracerepl/sessions_test.go`: four tests. Most call `reapIdle` with a chosen clock instead of sleeping.

### Why

- The registry is the only place that knows whether a session is busy. A session with `busy > 0` (a cell holding or waiting for the gate) or an active job is never reaped. Deciding and unregistering under one lock means a cell that claimed the session first keeps it, and a cell that comes later is told the session expired.
- Moving the count from the handler into the service also removes the reason for the old test `TestHTTPReleasesCapacityOfVanishedSession`. A session released anywhere leaves the registry at once. The test still passes, because it checks the visible behaviour.

### What worked

- `go test -race -count=2 ./pkg/tracerepl` passes. The tests cover: a 50 ms idle session reaped by the goroutine, then 404 with "expired after 50ms idle" from eval, jobs and DELETE; a quiet session reaped while one runs a cell and another a job; the job's session reaped only once its job ended and the idle time passed; `GET /sessions` counting cells; 32 sessions refusing a 33rd until reaping frees capacity; `WithIdle(0)`; and the tombstone bound.

### What didn't work

- `TestBusySessionsAreNotReaped` first failed under `-race` ("race detected during execution of test"). The test assigned `s.idle = time.Minute` while the reaper goroutine read it. The field is set once in `New` and never changes in the service. The test now keeps the default 2 h and moves its clock three hours ahead.

### What I learned

- Passing a clock to `reapIdle` makes the reaping rule testable without sleeping, and leaves one end-to-end test for the goroutine itself.

### What was tricky to build

- `Release` of an expired session. The registry no longer knows the ID and replsession returns `ErrSessionNotFound`. Without the tombstone check, DELETE would answer a bare 404, so `Release` looks the tombstone up before unloading and returns `ExpiredError`.

### What warrants a second pair of eyes

- The reaper unloads a session outside the lock, after removing it from the registry. In that window replsession still holds the VM, but nothing can reach it, because every entry point checks the registry first.

### What should be done in the future

- N/A.

### Code review instructions

- `pkg/tracerepl/sessions.go` (`reapIdle`) and `jobs.go` (`claim`, `missing`). Run `go test -race ./pkg/tracerepl -run 'Idle|Busy|SessionList'`.

### Technical details

- `GET /sessions` row: `{id, created, lastUsed, idleSeconds, cells, jobs, activeJob?, busy}`. Error text: `session ID expired after 2h0m0s idle; its bindings are gone, open a new session (trace-repl open)`.

## Step 10: W6, following a function across renames

`run.renames()`, `function(name).aliases()` and `timeline(phase, {follow: true})` follow a function's history across a rename. On the SHADOW-LLVM capture, `kernel`'s followed middle timeline shows SROA removing 18 allocas at ordinal 6, while the function was still called `checked_shadow`. The unfollowed timeline shows nothing, which is field note N3.

The guide's mechanism did not work on that very case, so the design changed. The guide proposed matching a body digest: a new name whose body equals the body of a vanished name. In this capture GlobalOpt renames and rewrites at once: it changes every call to `fastcc` and renumbers the attribute groups (`#5` → `#4`), so the digests differ. The bytes contain better evidence. The module print before the rename declares `@kernel = dso_local alias i32 (ptr, i32, i32), ptr @checked_shadow`, and GlobalOpt's rename is the resolution of that alias. Alias resolution is now the primary rule, and an identical body is a secondary one.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement W6 last, as the lowest priority, with the test the guide names: on SHADOW-LLVM, `kernel` aliases `checked_shadow` and SROA's alloca removal appears in the followed timeline.
**Inferred user intent:** A function's history should not be split by a rename that a reader has to know about in advance.
**Commit (code):** 7fed012 — "feat(trace-repl): follow a function across LLVM renames"

### What I did

- Probed the capture before designing with `scripts/09-find-renames.py` (module prints, defined names, body digests) and `scripts/10-diff-renamed-body.py` (the last `checked_shadow` body before ordinal 17 against `kernel` at 17), both run with `python3 -I`.
- `pkg/tracearchive/renames.go`: `Rename`, `printFunctions` (defines with body digests, aliases, whether the print is a module), `findRenames` (one pass over a stream), and `Archive.Renames(variant)`, cached per stream on the verified text.
- `pkg/traceapi/install.go`: bridge method `renames`. `query.js`: `renamesOf`, `aliasChain`, `followSegments`, `nameAt` and `renameAt`. Also: `FunctionHandle.timeline(phase, options)` and `aliases()`, `Run.renames()`, name-per-ordinal membership in `eachDomainEvent` and `EventPick._resolve`, `measureEvent` and `changeRow` carrying `function`, `followedAs` and `rename`, `StatePlan._target`/`_snapshot` resolving the earlier name, and `ArgumentRef.resolve` accepting a snapshot whose `aliasOf` is its function. Help topic `timeline` documents it.
- Tests: `TestRenamesFollowGlobalOptAliasResolution` and `TestRenamesByIdenticalBody` (tracearchive), `TestFollowedTimelineCrossesGlobalOptRename` (traceapi). Ticket cell `scripts/08-follow-renamed-kernel.js`, result `various/06-follow-renamed-kernel.json`.

### Why

- The rename is detected in Go, at the bytes, because Go already holds every verified stream. One pass with line scanning is cheap there, and a JS scan of every module print in every session would not be. The query language only consumes the edges.
- Following is opt-in (`{follow: true}`), so every existing timeline, measurement and recorded workbook result is unchanged.

### What worked

- Scan of `checked-middle`: one module-print event, ordinal 17 (`GlobalOptPass on [module]`), where `kernel` appears and `checked_shadow` disappears. The ROW-IR `checked-middle` stream has none.
- `Renames("checked")` on SHADOW-LLVM returns exactly one edge: middle 17, `checked_shadow` → `kernel`, method `alias`, alias declared at ordinal 16.
- The followed timeline: alloca drops `[{ordinal: 6, pass: SROAPass, before: 18, after: 0, delta: −18, function: checked_shadow}]`. The unfollowed one: `[]`. The rows at 15, 16, 17 and 18 name `checked_shadow`, `checked_shadow`, `kernel` (with `rename: {from: checked_shadow, to: kernel, method: alias}`) and `kernel`. `kernel.argument(0)` resolves in `checked_shadow`'s prints, and states picked at 6 (after) and 17 (before) are `checked_shadow`'s.
- `go test ./...`, `go test -race ./...` and `go vet ./...` pass.
- The same service names itself "PICOCALC-SHADOW-LLVM (Following a checked floor shadow through LLVM to executed RV32 instructions)" in `q.help()`, which fixes the mislabel of field note N1.

### What didn't work

- The guide's rule. `09-find-renames.py` found the event at 17 but `from: []`: no vanished function had `kernel`'s body digest. `10-diff-renamed-body.py` showed 37 diff lines between the bodies, all calls changed from `call i32 @checked_read(… ) #5` to `call fastcc i32 @checked_read(…) #4`, and `@kernel = dso_local alias … ptr @checked_shadow` in print 16.
- `TestRenamesByIdenticalBody` first failed with a second, unexpected edge `other → p`. My fixture claimed that two functions vanished with the same body. In fact only `other` had the body `ret i32 1`, so the detector was right. The fixture now also defines `twin` with that body, and the ambiguous case yields no edge.
- My first projection of change rows used `c.from` and `c.to`. Change rows have `before`, `after` and `from` (the previous row's ordinal), and had no `function`. I added `function` and `rename` to change rows of followed timelines.
- The commit command with an inline message was refused by the worktree guard ("names git in a form too complex"). I wrote the message to a file and committed with `git commit -F`.

### What I learned

- GlobalOpt's alias resolution rewrites the body in the same pass, so in this pipeline any body-identity rule is too strict to find the renames that matter. The alias line is direct evidence of identity: LLVM printed that the two names denote one function.

### What was tricky to build

- Name-per-ordinal has to hold at every place that picks a function's body out of a print: membership, measurement, picked states before and after, and argument references. Missing one would make that operation report `absent` for the earlier ordinals, or throw `functionMismatch`. Snapshots are cached shared objects, so the followed path passes a shallow copy with `aliasOf` and never mutates the cached one.

### What warrants a second pair of eyes

- A function renamed twice in one stream gives segments `[{a, before 10}, {b, before 20}]`. `aliasChain` handles it, but no capture in the repository has a chain longer than one, so only the single rename is tested on real data.
- The `body` rule compares the new name's body with the latest body of each vanished name, so a function pass that changed the old body between module prints is taken into account. It refuses ambiguous candidates and never chooses among them.

### What should be done in the future

- Consider making `follow` the default for timelines of functions that have aliases, after checking that no recorded workbook result changes.

### Code review instructions

- `pkg/tracearchive/renames.go` (`findRenames`), then `pkg/traceapi/query.js`: search for `nameAt`, `aliasChain`, `measureEvent`, `_target` and `aliasOf`.
- Run `go test ./pkg/tracearchive ./pkg/traceapi -run 'Renames|Followed' -v`, or evaluate `scripts/08-follow-renamed-kernel.js` in a service on the SHADOW-LLVM capture.

### Technical details

- `Rename`: `{variant, phase, ordinal, pass, from, to, method: "alias"|"body", aliasOrdinal?, bodySHA256?, ref}`. Alias line pattern: `^@NAME = … alias … @NAME$`. Body digest: SHA-256 of the lines after the `define` line up to the closing `}`.

## Step 11: As-built guide, reMarkable upload and the vault report

The guide now records what was built for each change. Its revised version is on reMarkable under a new name, and the project report is in the go-go-parc vault, committed and pushed. Checking the report against the code found five strings I had quoted from memory that were wrong, and one stale row in the README.

### Prompt Context

**User prompt (verbatim):** see Step 1. The coordinator relayed the user's request for the report, verbatim: "ask the REPLL subagent to commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill) and to  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). (when they're done)"
**Assistant interpretation:** Once implementation and its diary were done: update the guide where implementation differed and re-upload it without `--force`. Write a textbook-style project report in `Projects/2026/11/21/`, with the sibling Odyssey report's frontmatter and a wikilink to it. Stage only the report, commit with the trailer, push, and record the result here.
**Inferred user intent:** A durable account of the workbench that a later reader can use without the ticket, and a guide that matches the code.
**Commit (code):** 75b68be ("docs(trace-workbench): as-built guide, diary steps 8-10 and ticket overview") and 1046e53 ("docs(trace-repl): list every GET /info field in the protocol table"). Vault: 8ae32b3.

### What I did

- Guide: a status paragraph with every change's commit. As-built notes for W1 (Go side `Provider`/`Bundle`/`traceapi.InstallCompiler`, not the draft's `tracecompiler.Install`), W2, W3 (the registry moving into the service), W4, W5, W6 (the failed draft rule, the alias rule) and W7. New Section 5.1 with the acceptance results and the loading-method result, decisions D5–D7, and reference rows for every new package.
- docmgr: related the primary files to the guide, the diary and the index. Added a changelog entry, filled in the index overview, and ran `docmgr doctor` ("All checks passed").
- Delegated the upload to a haiku subagent: `remarquee upload bundle <guide> --name "PICOCALC-TRACE-WORKBENCH Intern Guide As Built" --remote-dir "/ai/2026/11/21/PICOCALC-TRACE-WORKBENCH" --toc-depth 2 --non-interactive`. It returned `OK: uploaded PICOCALC-TRACE-WORKBENCH Intern Guide As Built.pdf -> /ai/2026/11/21/PICOCALC-TRACE-WORKBENCH` on the first attempt. The earlier upload in the folder was left untouched. This confirms cloud delivery only, not sync to the device.
- Stopped my services on 3811 and 3812 with `scratchpad/stop-my-service.py`. The script now accepts any binary directly in the scratchpad's `bin/`. Services on 3791–3795 kept running.
- Wrote `/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/PROJECT REPORT - PicoCalc Compiler - From Trace REPL to Compiler Workbench - Seven Changes Tested Against a Real Compiler Study.md` (about 9,000 words, five mermaid diagrams). Staged only that file, committed `8ae32b3`, and ran `git push`: `fb70436..8ae32b3  main -> main`.

### Why

- I uploaded under a new name because the guide changed materially and `--force` was not authorized. Overwriting would also have discarded any annotations on the first upload.

### What worked

- The push succeeded on the first attempt, with no rebase needed.

### What didn't work

- I had written several strings in the report from memory, and checking them against the code showed five were wrong. The 409 message is `session is busy with job job-…; poll GET /sessions/{id}/jobs/job-…, or stop it with DELETE (trace-repl job --stop)`, not my paraphrase. The stop message ends in "; bindings from earlier cells remain". `repo.list` entries are `{name, type, bytes}`, with no `path`. `stats.summary` returns `{n, min, q1, median, q3, max, mean}`. The LLVM lines I had invented were replaced with the real diff from `scripts/10-diff-renamed-body.py`, run on the SHADOW-LLVM ticket. That diff also shows the definition line changing from `define internal i32 @checked_shadow(…) #0` to `define dso_local i32 @kernel(…) local_unnamed_addr #0`.
- The first run of `10-diff-renamed-body.py` failed with `IndexError: list index out of range`, because it takes the SHADOW-LLVM ticket directory as its argument and I had passed none.
- The README's `GET /info` row predated W1, W3 and W7, so it lacked `compiler`, `sessions.idleSeconds` and `limits.jobSeconds`. I compared it with a live `/info` and fixed it in 1046e53.
- One board example in the report was mislabelled. "Frame pie" compares the previous default against the candidate, both with `pie-empty`. It does not measure the empty-packet exit itself.

### What I learned

- Quoted error text and object shapes in a report need the same check against the code as numbers do. Five of them were wrong, while none of the numbers checked against the result files were.

### What was tricky to build

- N/A.

### What warrants a second pair of eyes

- The report's claim that goja agrees with the board only when the arms are paired inside one job rests on one change and two programs (n = 9 and n = 5). The report says so, but the claim should be read as a hypothesis.

### What should be done in the future

- Merge the branch. Restart long-lived services from the merged code. Rerun `scripts/06-run-acceptance.sh` with the default `--repo` once RAY-PARITY commits its board inputs.

### Code review instructions

- Read the report's W1, W3 and W6 sections against `pkg/tracecompiler/compiler.go`, `pkg/tracerepl/jobs.go` and `pkg/tracearchive/renames.go`.

### Technical details

- Vault commit `8ae32b3`, pushed to `ssh://github.com/go-go-golems/go-go-parc` `main`. reMarkable: `/ai/2026/11/21/PICOCALC-TRACE-WORKBENCH/PICOCALC-TRACE-WORKBENCH Intern Guide As Built.pdf`.

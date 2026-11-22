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

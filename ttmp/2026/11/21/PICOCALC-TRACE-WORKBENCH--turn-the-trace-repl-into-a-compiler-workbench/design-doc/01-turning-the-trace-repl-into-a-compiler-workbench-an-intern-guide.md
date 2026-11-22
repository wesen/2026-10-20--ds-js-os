---
Title: Turning the trace REPL into a compiler workbench - an intern guide
Ticket: PICOCALC-TRACE-WORKBENCH
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: cmd/trace-repl/main.go
      Note: CLI and service wiring (serve, open, eval, close)
    - Path: pkg/traceapi/install.go
      Note: Installs the query language and the archive bridge in each VM
    - Path: pkg/traceapi/query.js
      Note: The compiler-evidence query language
    - Path: pkg/tracearchive/archive.go
      Note: LLVM pass-dump archive loading and verification
    - Path: pkg/tracerepl/http.go
      Note: HTTP protocol, session limit, loopback checks
    - Path: pkg/tracerepl/service.go
      Note: Session VMs, cell evaluation, deadline and size limits
    - Path: repo://pkg/traceapi/stats.js
      Note: W5 shared statistics
    - Path: repo://pkg/tracearchive/renames.go
      Note: W6 rename detection from alias declarations and bodies
    - Path: repo://pkg/tracecompiler/compiler.go
      Note: W1 scope wrapper and revision provider
    - Path: repo://pkg/tracerepl/jobs.go
      Note: W3 background jobs and the session registry
    - Path: repo://pkg/tracerepl/sessions.go
      Note: W7 idle reaping and the session list
    - Path: repo://pkg/tracerepo/repo.go
      Note: W2 confined read-only repository and mounts
ExternalSources: []
Summary: How the trace REPL works today, what using it for a real compiler change showed, and the design and implementation plan for seven changes that make it the inner loop of Typed compiler work.
LastUpdated: 2026-11-21T20:15:00-05:00
WhatFor: Onboarding an engineer who will extend cmd/trace-repl
WhenToUse: Before changing the trace REPL service, its providers or its HTTP protocol
---

# Turning the trace REPL into a compiler workbench

The trace REPL is a local Go service that keeps JavaScript sessions alive between requests, so a researcher can ask a sequence of questions about compiler evidence without reloading anything. It was built to query LLVM pass dumps of one ray-tracer loop. PICOCALC-RAY-PARITY then used it as the main workbench for a real change to the Typed compiler. There it turned out to be most useful for something it was not designed for: holding the Typed compiler itself in a persistent VM. This guide explains how the service works, what that use showed, and how to change it so that it becomes the normal place to compile, run, compare and measure Typed compiler candidates. It assumes you can read Go and JavaScript. Everything specific to this repository is explained where it first matters.

**Status.** All seven changes are implemented and tested on the ticket's branch: W4 `c195e91`, W5 `0bee9f9`, W2 `1607478`, W1 `6076045`, W3 `601bb5e`, W7 `99eb09e`, W6 `7fed012`. The acceptance run (`78c963c`, Section 5.1) replaced RAY-PARITY's four Python drivers with cells and jobs that reproduce its recorded results. Where implementation showed that the first draft was wrong, the section below describes what was built, and a note says what changed and why. The largest change is W6, whose detection rule did not work on the case it was designed for. The investigation diary records each step.

## 1. What the service does today

A researcher starts one service process, then opens sessions and sends JavaScript **cells** to them. A cell is one piece of source evaluated in the session's VM. Top-level `const`, `let`, `function` and `class` declarations persist for later cells, the way they do in a notebook.

```sh
go run ./cmd/trace-repl serve --addr 127.0.0.1:3791 \
    --archive ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes
sid=$(go run ./cmd/trace-repl open --addr 127.0.0.1:3791)
go run ./cmd/trace-repl eval --addr 127.0.0.1:3791 --session "$sid" --code 'q.help()'
go run ./cmd/trace-repl close --addr 127.0.0.1:3791 --session "$sid"
```

Each session starts with five globals:

- `q`, the **query language**: lazy *plans* over LLVM pass prints. `q.run(plan)` evaluates one.
- `a`, the **archive**: variants such as `checked`, their phases (`middle`, `backend`), functions and timelines.
- `profiles`: guest instruction counts recorded for named compiler arms.
- `hardware`: P4 timing rows from an optional device study.
- `simd`: SIMD decision ranges and per-address execution counts from an optional SIMD study.

A typical question is "which pass first reduced the number of buffer-capacity loads in the checked row?"

```js
const row = a.variant("checked").function("row")
const capacity = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count()
q.run(row.timeline("middle").measure(capacity).changes().where(c => c.status === "known" && c.delta < 0).first())
// → ordinal 74, EarlyCSEPass, 11 → 6 sites, with a reference {variant, phase, streamSHA, ordinal, start, end}
```

Every value that comes from the archive carries such a **reference**. It names a verified stream by SHA-256 and a byte interval within it, so a claim in a report can be traced to the exact compiler output it came from.

## 2. Architecture

```mermaid
flowchart TD
    subgraph Startup["serve (cmd/trace-repl/main.go: newService)"]
        AR["tracearchive.Open + Verify<br/>pass-dump streams, indexes, manifest digests"]
        HW["tracehardware.Open<br/>(--device-study, optional)"]
        SD["tracesimd.Open<br/>(--simd-study, optional)"]
    end
    AR --> INST
    HW --> INST
    SD --> INST
    INST["Installer (per session)<br/>traceapi.Install / InstallHardware / InstallSIMD"]
    INST --> VM["goja VM for one session<br/>q, a, profiles, hardware, simd, console"]
    subgraph Service["tracerepl.Service (go-go-goja replsession)"]
        VM
        EV["Evaluate(id, source)<br/>64 KiB source, 15 s deadline, 512 KiB result"]
    end
    HTTP["tracerepl.Handler<br/>POST /sessions · POST /sessions/{id}/eval · DELETE /sessions/{id}<br/>loopback only, 32 sessions"] --> EV
    CLI["trace-repl open / eval / close"] --> HTTP
    style AR fill:#e2f0fd
    style VM fill:#fde2e2
```

The parts, from the bottom up:

- **`pkg/tracearchive`** reads a ticket's `various/llvm-pipeline/manifest.json`. That file lists, for each variant and phase, a gzip stream of pass prints, its index and its SHA-256. `Open` validates the indexes. `Verify` inflates every stream once and checks the digest, so a damaged capture stops the service at startup rather than after a researcher has cited it. `Events`, `Text` and `Profile` serve read-only views. The archive is immutable and shared by all sessions.
- **`pkg/tracehardware`** and **`pkg/tracesimd`** load the two optional study formats, with the same verify-at-startup rule.
- **`pkg/traceapi`** installs the JavaScript API into a VM. `Install` binds a temporary `__trace` bridge object whose methods copy archive data into fresh JS values. Copying goes through `JSON.parse`, so a session can mutate its results without touching shared Go data. It then runs the embedded `query.js`, which defines `q` and `a`, and deletes the bridge.
- **`pkg/tracerepl`** owns sessions through go-go-goja's `replsession` service. Each session has its own goja runtime with an **owner** goroutine; every VM access goes through `rt.Owner.Call`, so cells in one session run one at a time. `Installer.InitRuntime` deletes `require`, so there is no host module loader. It also installs a capturing `console` (at most 64 lines of 2,048 characters) and keeps `JSON.stringify` for result serialization. `Evaluate` rejects source over `MaxSourceBytes` (64 KiB). It runs the cell under a `context.WithTimeout` of `defaultEvalTimeout` (15 s), which interrupts the VM on expiry, and serializes the result up to `MaxResultBytes` (512 KiB).
- **`Handler`** (`http.go`) serves three routes, rejects any request with an `Origin` header or a non-loopback `Host`, caps open sessions at `MaxSessions` (32) and bounds request bodies at six wire bytes per source byte.
- **`cmd/trace-repl`** is a Glazed/Cobra CLI. `serve` builds the service from `--archive` (required), `--device-study` and `--simd-study`. The HTTP server has a 25 s write timeout.

### 2.1 What happens to one cell

1. `POST /sessions/{id}/eval` with `{"source": "..."}` reaches `Handler`. It checks the content type, the size and that the body has exactly one field.
2. `Service.Evaluate` takes the session's gate through `WithRuntime` and schedules a callback on the VM's owner.
3. `parseCell` parses the source as a script. A cell consisting of exactly `await <expr>` is wrapped in an async arrow, and other uses of `await` get a hint. `lexicalNames` records the cell's top-level `let`/`const`/`class` names, so that a cell which fails after declaring a name can explain why the name is unusable afterwards.
4. The cell runs. When the deadline fires, `vm.Interrupt` stops it with a message naming the 15 s limit. The interrupt is cleared before the gate is released.
5. The result value is serialized with the VM's own `JSON.stringify`, and console lines are attached.

## 3. What a real compiler change needed

PICOCALC-RAY-PARITY changed `picocalc-os/compiler/typed-rv32.js`, the RV32 backend of the Typed compiler. Its analysis document `analysis/01-using-the-trace-repl-for-compiler-work-field-notes-and-verdict.md` records every observation with the exact error. The essential findings are these:

| # | Observation | Consequence |
|---|---|---|
| N1 | Five services were running on ports 3791–3795, each started by a different lab. `GET /` returns 404 and nothing reports what a service mounts. The help text names the "row archive" on a service that mounts another capture. | Finding the right service took `ps` and tmux session names. |
| N2 | The query language answered LLVM questions precisely. `q.run(run.functions())` still produces the `[notAPlan]` error the persona studies recorded. | The query layer is sound. Its eager/lazy split still trips users. |
| N3 | SROA promoted the shadow kernel's locals while the function was called `checked_shadow`. GlobalOpt then renamed it `kernel`, whose timeline shows no promotion. | Function history is split at renames. |
| N4 | The session VM runs the Typed compiler unmodified. goja is a bytecode interpreter like QuickJS on the P4, so compile-cost problems invisible under V8 show up. `operandLocations: {}` cost +24% of a ray compile; this located a real defect in minutes. | The most valuable use was not an evidence query at all. |
| N5 | `typed-wasm.js` (70,183 B) exceeded the 64 KiB cell limit, and the assembled Editor source returned HTTP 413. A Python client had to append 30,000-character chunks to a global string and `eval` it. | Every user rebuilds a loader. Earlier labs pushed data rows 64 at a time. |
| N6 | Comparing 38 inputs × 7 option sets × 2 compilers stopped at the 15 s deadline. A Python driver now sends one input per cell. | Batch work is driven from outside and loses the "persistent notebook" property. |
| N7 | Every study re-implements `median` and paired comparisons. | Small inconsistencies between reports, such as a median of paired percentages against a ratio of medians. |
| N8 | Sessions never expire. A day of work leaves dozens open, and `MaxSessions` is 32. | Long-lived services eventually refuse new sessions. |

The pattern is consistent. The REPL's guarantees, verified inputs, persistent bindings and serialized access, are what compiler work needs. Its interface, though, assumes the only inputs are the archives given at startup and that every question is a short query.

## 4. The design

The changes below keep the existing guarantees. All new inputs are read-only and digest-identified, every value that matters can be traced to bytes, and the service stays loopback-only for trusted local users. Each change is independent and can be reviewed and merged on its own.

### W1. A compiler workbench provider

**Purpose.** Let a session load the Typed compiler at a named git revision, or from the working tree, and keep several revisions side by side.

**Interface.** Everything that depends on a revision hangs off the object `compiler.at` returns, so a base and a candidate can never be mixed up by accident.

```js
const base = compiler.at("eaf0872")        // git revision, resolved once to a full commit
const work = compiler.at("worktree")       // the files on disk now; a later call re-reads them
work.revision                               // full commit SHA, or "worktree"
work.files                                  // [{path, sha256, bytes, line}] for provenance
work.typedRv32.compile(source, imports, max, options)
work.typedWasm.compileFunctions(...)
work.typedWorld.imports
work.globals.compileTypedWorldRv32(...)     // every name the files published, not only the modules
work.interp.run(program, entry, args, memory)   // picocalc-os/tools/rv32-interp.js
work.rayBench.frameProfile(program)             // picocalc-os/tools/typed-ray-bench.js
work.ray                                    // text of picocalc-os/worlds/raytrace/raytrace.typed at the same revision
work.world("editor")                        // {name, text, files}, assembled from worlds/editor/source.list
work.read("picocalc-os/worlds/files/files.typed")  // any file at the same revision, as repo.read returns it
work.typedSources()                         // paths of every picocalc-os/worlds/**/*.typed at the revision
```

**How the files refer to each other.** The seven files are classic scripts. Each wraps its body in an arrow IIFE with `"use strict"` and publishes its module with `globalThis.<name> = …`. They then find each other in two different ways, which the wrapper below has to support both of:

| File | Publishes on `globalThis` | Reads |
|---|---|---|
| `typed-wasm.js` | `typedWasm`, `compileTyped` | `globalThis.typedAsync?.rewrite` at compile time (typed-async is optional); `globalThis.__typedLexIndex`, a native lexer hook that only the P4 firmware provides |
| `typed-async.js` | `typedAsync` | bare `typedWasm` |
| `typed-world.js` | `typedWorld`, `compileTypedWorld`, `compileTypedWorldRv32` | bare `typedWasm` and `typedRv32`, both only inside function bodies |
| `typed-rv32.js` | `typedRv32` | bare `typedWasm`; `globalThis.typedPieLoops` as a presence check, then bare `typedPieLoops.lower` |
| `typed-pie-loops.js` | `typedPieLoops` | bare `typedWasm` |
| `tools/rv32-interp.js` | `typedRv32Interp` | nothing |
| `tools/typed-ray-bench.js` | `typedRayBench` | bare `typedRv32Interp` |

`typed-world.js` loads before `typed-rv32.js` but names `typedRv32` only when one of its functions is called, so the bindings must be live rather than copied at load time. The two tools exist only from `eaf0872` on, so at an older revision they are absent, not an error.

**Mechanism.** Two revisions coexist in one VM if each is evaluated inside a function scope that shadows `globalThis` and declares the bare names as `let` bindings:

```js
// generated by the service for one revision; not user code
(function () {
const globalThis = Object.create(null);
let typedWasm, typedAsync, typedWorld, typedRv32, typedPieLoops, typedRv32Interp, typedRayBench;
/* contents of picocalc-os/compiler/typed-wasm.js */
;typedWasm = globalThis.typedWasm;
/* contents of picocalc-os/compiler/typed-async.js */
;typedAsync = globalThis.typedAsync;
/* … the same for typed-world, typed-rv32, typed-pie-loops, rv32-interp, typed-ray-bench … */
return globalThis;
})()
```

Writes such as `globalThis.typedRv32 = …` inside each file land on the shadowing object. Bare names resolve to the wrapper's `let` bindings, which are assigned before any later file's functions run and are visible to earlier files' functions when they are called. Three details matter:

- Each file is followed by a newline and a leading `;`. A file can end in a `//` comment, and every file begins with `(`, so without the separator the next file's IIFE would be parsed as a call of the previous one's result.
- The wrapper returns the whole shadow object, because `typed-world.js` and `typed-wasm.js` publish functions (`compileTypedWorldRv32`, `compileTyped`) that are not module objects.
- The shadow object has no prototype. A read of `globalThis.typedAsync` or `globalThis.__typedLexIndex` then finds nothing rather than a value a user cell happened to define on the real global, so a revision without typed-async cannot pick up another revision's.

This was checked in Node before implementation: loading `eaf0872` and `3213028` into one realm leaks no global, gives distinct module objects, compiles the ray tracer to byte-identical images under `{policy: "stock"}` (9,564 B) and the default (8,632 B), and to different images under `operandLocations.saved` and `direct` (8,632 B against 8,048 B). The candidate's interpreter runs the default image's opening frame in 12,717,463 instructions, the figure PICOCALC-RAY-PARITY recorded. The wrapper is assembled in Go and compiled once per set of file digests with `goja.Compile`. A `*goja.Program` is not tied to a runtime, so every session runs the same compiled program, and the 64 KiB cell limit does not apply. Each entry of `files` records the wrapper line at which that file starts, so a stack trace position can be mapped back to a file.

**Go side (as built).** The package `pkg/tracecompiler` reads files through W2's `tracerepo.Repo` and never touches the VM:

```go
var Modules = []Module{{Binding: "typedWasm", Alias: "typedWasm", Path: "picocalc-os/compiler/typed-wasm.js", Required: true}, …}
type Bundle struct {
    Revision string        // full commit SHA, or "worktree"
    Files    []File        // {Path, SHA256, Bytes, Line}: Line is the wrapper line where the file starts
    Missing  []string      // optional files absent at this revision
    Key      string        // SHA-256 over the files' paths and digests
    Program  *goja.Program // the compiled wrapper, shared by all sessions
}
func New(repo *tracerepo.Repo) *Provider
func (p *Provider) At(rev string) (*Bundle, error)       // "worktree" re-reads; a commit is cached
func (p *Provider) TypedSources(rev string) ([]string, error)
```

`pkg/traceapi/compiler.go` (`InstallCompiler`) and `compiler.js` define the `compiler` global through a temporary `__compiler` bridge, which is deleted afterwards like `__trace`. Its `load` method runs the bundle's program with `vm.RunProgram` inside the session's VM and returns the shadow object. The JS side builds the revision object and memoizes commits per session. Programs are also cached by `Key`, so reloading an unchanged working tree does not recompile. Both caches hold at most 32 entries. `serve --repo` defaults to the git work tree containing the current directory.

**Validation (done).** `TestCompilerRevisionsCoexistInOneSession` loads `eaf0872`, `3213028` and `14c95b5` into one goja VM. `3213028` and `14c95b5` have the same `typed-rv32.js`, and `eaf0872` has a different one. Ray images: stock 9564/9564/9564 and default 8632/8632/8632, identical; saved+direct 8632/8048/8048, different only where the backend differs. The test also checks no leaked globals, distinct module objects, the ten published names, the Chess world (45,348 B with both backends), `where()`, and that `25cd108` loads with both tools missing. `TestWorktreeCompilerReportsFileDigests` compares every reported digest with the file on disk. `TestWrapSeparatesFilesAndRecordsLines` checks the separators and line numbers.

### W2. Read-only repository and mounted inputs

**Purpose.** Remove eval-shipped data (N5).

**Interface.**

```js
repo.read("picocalc-os/worlds/raytrace/raytrace.typed")   // {path, sha256, bytes, text}
repo.show("eaf0872", "picocalc-os/compiler/typed-rv32.js") // same, at a revision
repo.list("ttmp/2026/11/21/PICOCALC-RAY-PARITY--…/various") // names and sizes
mounts.board                                                // --mount board=/tmp/…/bench.log
mounts.board.json()                                         // parsed when the file is JSON
```

**Rules.** Paths are cleaned and must stay inside `--repo` after symlink resolution. `--mount name=path` admits one explicit outside file per flag and is read and digested at startup. Files are capped (for example 32 MiB). Nothing writes. A `.gz` file is inflated transparently, and the reported digest names the file as stored. Every returned object carries its SHA-256, matching the archive's reference discipline.

**As built** (`pkg/tracerepo`, `pkg/traceapi/repo.{go,js}`). A file object is `{path, revision, sha256, bytes, gzip, text}` plus a non-enumerable `json()`. `revision` is `"worktree"`, a full commit SHA, or `"mount"`. Three further rules came out of implementation:
- Paths with a `.git` component are refused. The interface is about repository content, and `repo.show` reaches committed content.
- Revision names must match `^[A-Za-z0-9_][A-Za-z0-9._/@{}^~-]*$` and may not contain `..`, so a name can never be parsed as an option or a range.
- Git access is read-only plumbing (`rev-parse`, `cat-file`, `ls-tree`), run with `GIT_OPTIONAL_LOCKS=0` and a 30 s deadline, rather than a Go git library.

Content at a commit is cached for all sessions, up to 256 MiB of text. Working-tree reads are never cached. Mount names must be JavaScript identifiers other than `list`, `help` and `toJSON`. `mounts.NAME` is a lazy getter, so a session that does not use a large mount does not pay for it. `repo.list(path, rev?)` and `repo.resolve(rev)` complete the interface. The tests build a two-commit repository with a symlink inside the tree, a symlink out of it, a gzip file and a sparse file over the cap.

### W3. Background jobs

**Purpose.** Run batch cells, such as equivalence sweeps and profiles, inside the session without the 15 s limit (N6), while keeping the interactive limit for ordinary cells.

**Protocol.**

```text
POST /sessions/{id}/jobs      {"source": "...", "timeoutSeconds": 600}   → 202 {"job": "job-…"}
GET  /sessions/{id}/jobs/{job}                                            → 200 {"state": "running"|"done"|"failed"|"stopped", "result": Result?}
DELETE /sessions/{id}/jobs/{job}                                          → interrupt
```

**Semantics.** A job takes the session's gate exactly as a cell does, so cells and jobs in one session stay serialized. A cell or a second job sent while a job is queued or running does not wait behind it: it gets `409 Conflict` at once, with the job's ID. Waiting would only spend the cell's own 15 s budget behind a job that may run for minutes. The job's deadline is its own, capped by a service flag `--max-job` (default 10 min). Its result obeys `MaxResultBytes`. The HTTP write timeout does not apply, because the response returns at once. `trace-repl eval --job` submits and polls.

**Implementation (as built, `pkg/tracerepl/jobs.go`).**

```go
func (s *Service) Submit(id, source string, timeout time.Duration) (JobView, error) {
    // under s.mu: the session must be in the registry and hold no job
    ctx, cancel := context.WithCancelCause(s.lifetime)        // the service lifetime, not the HTTP request
    job := &Job{id: newID("job-"), state: JobQueued, timeout: min(timeout, s.maxJob), cancel: cancel, done: make(chan struct{})}
    entry.active = job                                         // from now on cells and jobs get 409
    go func() {
        runCtx, stop := context.WithTimeout(ctx, job.timeout)
        defer stop()
        result, err := s.run(runCtx, id, source, "job", job.timeout, markRunning)  // Evaluate's body
        // under s.mu: record done / failed / stopped, clear entry.active
    }()
}
```

`run` is the old `Evaluate` body with two parameters: `what` ("cell" or "job"), which names the unit in interrupt messages, and a `started` callback that runs on the VM owner just before the source. `DELETE` cancels the job's context with the cause `errJobStopped`, so a stop request can be told apart from a deadline. Per-session job state needs per-session bookkeeping, so this change moved the session registry from the HTTP handler into `tracerepl.Service` (decision D6). States are `queued` → `running` → `done` | `failed` | `stopped`, and a session keeps its last 16 finished jobs. On the CLI: `eval --job [--job-timeout N] [--detach]`, `job --session S --job-id J [--stop]`, and `serve --max-job 10m`. Ctrl-C during `eval --job` stops the job on the service.

### W4. An inventory endpoint and correct help

**Purpose.** Make a running service describe itself (N1).

```text
GET /info → {
  "version": "...", "revision": "<git commit of the binary's source>",
  "archive": {"path": "...", "streams": [{"variant": "checked", "phase": "middle", "sha256": "..."}]},
  "deviceStudy": {"path": "...", "sha256": "..."} | null,
  "simdStudy":   {"path": "...", "sha256": "..."} | null,
  "mounts": [...], "repo": "...",
  "sessions": {"open": 7, "max": 32},
  "limits": {"sourceBytes": 65536, "resultBytes": 524288, "cellSeconds": 15, "jobSeconds": 600}
}
```

`trace-repl info --addr …` prints it. `q.help()` should name the archive the service actually mounted instead of the fixed string "PicoCalc LLVM row archive". The manifest has no title field: it maps variant to phase to stream. The name therefore comes from the archive directory, which is a docmgr ticket (`PICOCALC-SHADOW-LLVM--following-a-checked-floor-shadow-…`), and from the `Title:` line of that ticket's `index.md` when one exists.

The binary's own revision is only known when the Go toolchain stamped it. `go build` in a git checkout records `vcs.revision` and `vcs.modified` in the build info, and `go run` does not. `/info` reports the build info when it is present and otherwise says so, and it always reports the `HEAD` of `--repo` at startup, which is what a researcher usually wants to know. In practice the stamp is also wrong for a binary built inside a git worktree. There the go command stamped the main checkout's `HEAD` (`4e0dd35`) instead of the worktree's (`c7a13e6`). A worktree's `.git` is a file, and the go command appears to look for a `.git` directory. Build worktree binaries with `-buildvcs=false`.

**As built.** `GET /info` returns `service`, `started`, `build`, `repo {root, head}`, `mounts`, `compiler {modules, cachedCommits}`, `archive {path, label {ticket, title, dir}, manifestSHA256, streams}`, `deviceStudy`, `simdStudy`, `sessions {open, max, idleSeconds}` and `limits {sourceBytes, resultBytes, cellSeconds, jobSeconds}`. `GET /` lists the routes instead of answering 404. The inventory is a callback (`tracerepl.WithInventory`), so `tracerepl` stays independent of archives and studies.

### W5. A shared statistics global

**Purpose.** One tested implementation of the comparisons every study reports (N7).

```js
stats.median([3, 1, 2])                                    // 2
stats.paired(rows, {key: r => r.block, control: r => r.arm === 0, candidate: r => r.arm === 4, value: r => r.value})
// → {pairs: 6, controlMedian, candidateMedian, medianPercentSaved, wins, losses,
//    method: "median of per-pair percentage change"}
stats.summary(xs)                                          // {n, min, q1, median, q3, max}
```

`stats.paired` refuses unmatched keys and duplicate pairs with an error naming them. Earlier studies checked this by hand in each script. Implement it in an embedded `stats.js` installed like `query.js`, with Go tests that evaluate fixed fixtures.

**As built** (`pkg/traceapi/stats.{js,go}`). The signature is `stats.paired(rows, {key, control, candidate, value, better})`. `key` and `value` are field names or functions, `control` and `candidate` are predicates, and `better` is `"lower"` (default) or `"higher"`. The result is `{pairs, controlMedian, candidateMedian, medianPercentSaved, percentSavedOfMedians, wins, losses, ties, better, method, perPair}`. The percentage saved per pair is `100 * (1 - candidate / control)`, the same expression the board scripts used. A reproduction therefore agrees with them to the last floating-point digit, and that matters more than a round fixture: `100 * (1 - 90 / 100)` is 9.999999999999998. `percentSavedOfMedians` is reported next to the median of per-pair savings because they differ, and N7 found reports mixing them. Quantiles interpolate linearly (R type 7). Errors carry codes: `notAnArray`, `empty`, `notFinite`, `badArgument`, `badKey`, `ambiguousRow`, `duplicatePair`, `unmatchedKey` and `zeroControl`.

### W6. Rename-aware function identity

**Purpose.** Follow one function's history across renames (N3).

**Mechanism (first draft).** During indexing, `tracearchive` computes a digest of each function body in each print. When a name first appears in a module print with the same body digest as a name that disappears in that print, the archive records an alias edge `checked_shadow → kernel` at that ordinal. `run.function("kernel").aliases()` returns the earlier names. `timeline("middle", {follow: true})` concatenates the histories and marks the rename event. A rename that also changes the body cannot be detected this way and is reported as two functions.

**What the capture showed.** The draft rule finds nothing in the case it was designed for. In the SHADOW-LLVM `checked` middle stream, `kernel` appears and `checked_shadow` disappears at ordinal 17 (`GlobalOptPass on [module]`), but their bodies differ in 37 lines: GlobalOpt rewrote every `call i32 @checked_read(…) #5` to `call fastcc i32 @checked_read(…) #4` in the same pass. The print before, ordinal 16, contains the explanation: `@kernel = dso_local alias i32 (ptr, i32, i32), ptr @checked_shadow`. The source defined `kernel` as an alias, and GlobalOpt resolved it by giving the aliasee the alias's name.

**Mechanism (as built, `pkg/tracearchive/renames.go`).** One pass over each verified stream keeps the latest body digest of every name (from function prints as well as module prints) and the defined names and aliases of the previous module print. At each module print, a newly defined name `To` is a rename of `From` when either:
- **alias:** the previous module print declared `@To = … alias …, ptr @From`, `From` was defined there, and `From` is gone now; or
- **body:** exactly one vanished name had, in its latest print, the body `To` has now. A tie is ambiguous and yields no edge.

The query language then consumes the edges:
- `run.renames()` lists them: `{phase, ordinal, pass, from, to, method, aliasOrdinal?, bodySHA256?, ref}`.
- `function(name).aliases()` returns the earlier names, newest first.
- `timeline(phase, {follow: true})` uses each earlier name before its rename. Membership, `measure()`, picked states (`.at(n).after`, `.before`) and argument references all resolve the name the function had at that ordinal. Measurement and change rows carry `function`, `followedAs` and, at the rename, `rename: {from, to, method}`.

Following is opt-in, so no existing result changes. On the capture, `kernel`'s followed middle timeline shows SROA at ordinal 6 removing 18 allocas while the function was `checked_shadow`. The unfollowed timeline shows none. A rename that changes the body and leaves no alias is still not detected.

### W7. Session lifetime

**Purpose.** Stop long-lived services from filling up (N8).

`GET /sessions` lists `{id, created, lastUsed, cells, jobs}`. A `--idle` flag (default 2 h) unloads sessions unused for that long. A request to an unloaded session returns 404 with the reason "session expired after 2h idle". `trace-repl sessions` prints the list.

**As built** (`pkg/tracerepl/sessions.go`). Rows are `{id, created, lastUsed, idleSeconds, cells, jobs, activeJob?, busy}`. A session that is running or queueing a cell or job is never idle, and its idle time starts when that work ends. The reaper decides and removes a session from the registry under one lock, so a cell that claims the session first keeps it, and one that comes later gets `session ID expired after 2h0m0s idle; its bindings are gone, open a new session`. The 32-session limit counts the registry, so reaped and vanished sessions free capacity at once. `--idle 0` disables reaping. The last 256 expired IDs keep their explanation. `reapIdle(now)` takes the clock as a parameter, so the rule is tested without sleeping.

## 5. Implementation order

The order follows value and dependency. Each step is one reviewed change with tests.

1. **W4 inventory.** Small, and needed to debug everything after it. Files: `pkg/tracerepl/http.go`, `cmd/trace-repl/main.go`. Test: `GET /info` on a service built from the test fixtures in `pkg/tracearchive`.
2. **W5 stats.** Pure JS plus Go tests. Files: new `pkg/traceapi/stats.js` and `stats.go`, installed from `newService`.
3. **W2 repo and mounts.** Files: new `pkg/tracerepo`. Flags `--repo` and `--mount`. Tests: path escape attempts (`../`, symlinks out of the tree), size cap, digest.
4. **W1 compiler provider.** Depends on W2's file access. Files: new `pkg/tracecompiler`. Test: two revisions in one session, as above.
5. **W3 jobs.** Files: `pkg/tracerepl/service.go` (factor `evaluate(ctx, id, source, timeout)` out of `Evaluate`), `http.go`, a CLI flag. Tests: a job that runs past 15 s completes; a cell sent during a job gets 409; deleting a job interrupts it; closing the session stops its job.
6. **W7 session lifetime.** Files: `http.go` (the `live` map gains timestamps), `service.go`.
7. **W6 rename identity.** The most delicate, because it touches indexing. Files: `pkg/tracearchive/archive.go`, `query.js`. Test on the SHADOW-LLVM capture: `kernel` aliases `checked_shadow`, and SROA's alloca removal appears in the followed timeline.

After W1–W3, port PICOCALC-RAY-PARITY's Python drivers (`scripts/01-open-compiler-session.py`, `02-planner-equivalence.py`, `03-compile-cost.py`, `08-score-board.py`) to single cells or jobs. That they become unnecessary is the acceptance test for the ticket.

### 5.1 Acceptance results

The ticket's `scripts/` hold the replacements, and `scripts/06-run-acceptance.sh ADDR` runs them all through the CLI alone, in 53 s. The service ran with `--repo` set to the main checkout, because RAY-PARITY's board inputs were untracked files there.

| Replaced driver | Replacement | Result |
|---|---|---|
| `01-open-compiler-session.py`, `repl_client.py` | `02-open-compiler-session.js`, one cell | both revisions and 38 inputs (330,186 characters) bound in 0.44 s |
| `02-planner-equivalence.{js,py}`, one cell per input | `03-planner-equivalence.js`, one job | 836 compiles in 32–39 s; RAY-PARITY's seven arms give 98 identical, 168 identical errors, 0 mismatches, as recorded; `stock` and `default` identical on all 14 compiling inputs; only `saved`, `direct` and `savedDirect` differ (41 mismatches; ray 8632 → 8048 under both) |
| `03-compile-cost.py`, one cell per compile | `04-compile-cost.js`, one job with `stats` | previous → candidate, paired by round: ray −9.3%, Chess −6.1%, Editor −1.8% |
| `08-score-board.{js,py}`, chunked rows | `05-score-board.js`, one cell with `repo.read` and `stats.paired` | `14-board-scores.json` reproduced exactly, including serialization |

Absolute goja compile times were about half of RAY-PARITY's. `07-loading-method-cost.js` shows the loading method is not the cause: `(0, eval)` and `compiler.at` compile the ray in 22.3 and 22.1 ms. Absolute times depend on host load, and only paired comparisons inside one job carry over. Those paired overheads (ray −9.3%, Chess −6.1%) are close to the P4 board's measured compile overheads for the same change (−8.19%, −4.26%). RAY-PARITY's separate-cell medians (+2.2%, +1.2%) were not close.

**Building from a git worktree.** `go.mod` replaces `github.com/go-go-golems/go-go-goja` with the relative path `../go-go-golems/go-go-goja`. That resolves from the main checkout, but not from a worktree under `.claude/worktrees/`, where `go build` fails with `replacement directory ../go-go-golems/go-go-goja does not exist`. Do not edit `go.mod`. Point `GOWORK` at a `go.work` file outside the tree that `use`s the worktree and replaces the same module with the absolute path of the checkout. A `go.work` replace overrides the module's own.

## 6. Decision records

**D1. Keep one VM per session, and isolate revisions by scope, not by VM.** Alternative: one VM per compiler revision. That loses the ability to compare two compilers' outputs inside one cell, which is the most common operation. The wrapper scope from W1 isolates the modules, and a test proves it.

**D2. Jobs reuse the session gate.** Alternative: run jobs in a cloned VM. goja runtimes cannot be cloned, and rebuilding a session's bindings defeats the purpose. Serializing cells behind jobs is simple and correct.

**D3. Read-only file access is scoped to the repository, with explicit mounts for anything else.** The REPL is for trusted local users, but a confined, read-only interface keeps references meaningful: every input has a path and a digest.

**D4. Do not grow the query language for compiler execution.** Compilation and interpretation are plain JavaScript functions from the compiler's own files. The query layer stays a language over archived evidence.

**D5. Build on go-go-goja's `replsession`, not `replapi`.** `replapi.App` adds the durable `repldb` store to `replsession`: persistence, restore, history, and a `ListSessions` over persisted records. Trace sessions are deliberately in memory (`replsession.RawSessionOptions()`), because their value is live VM state such as compiled programs and module objects. A store would hold nothing useful, and its session list would not show live raw sessions. The session list and reaping therefore live in `tracerepl`.

**D6. The session registry belongs to the service, not the HTTP handler.** Jobs need per-session state (the active job and the finished ones), and reaping needs to know whether a session is busy. The first draft kept a `live` map in the handler. The service now owns one registry under one mutex. Admission of cells (`claim`), job submission, reaping and the session limit all read it, so they cannot disagree.

**D7. Detect renames from the alias declaration first.** W6's body-digest rule misses GlobalOpt's alias resolution, which rewrites the body in the same pass. The alias line in the previous module print is direct evidence that LLVM treats the two names as one function. Body identity remains a secondary rule and refuses ties.

## 7. Reference

| Item | Location |
|---|---|
| CLI and service construction | `cmd/trace-repl/main.go`: `serve`, `newService`, `serveListener` |
| Session VMs, limits, cell parsing | `pkg/tracerepl/service.go`: `Installer.InitRuntime`, `Evaluate`, `parseCell`, `MaxSourceBytes`, `MaxResultBytes`, `defaultEvalTimeout` |
| HTTP routes | `pkg/tracerepl/http.go`: `Handler`, `MaxSessions`, `localAddress` |
| Query language | `pkg/traceapi/query.js`, installed by `pkg/traceapi/install.go: Install` |
| Device and SIMD providers | `pkg/traceapi/hardware.go: InstallHardware`, `pkg/traceapi/simd.go: InstallSIMD` |
| Archive format | `pkg/tracearchive/archive.go`: `Open` (expects `various/llvm-pipeline/manifest.json`), `Verify`, `Events`, `Text` |
| Session runtime library | `github.com/go-go-golems/go-go-goja/pkg/replsession`, `pkg/engine` |
| Field evidence | `ttmp/2026/11/21/PICOCALC-RAY-PARITY--…/analysis/01-using-the-trace-repl-for-compiler-work-field-notes-and-verdict.md` |
| Workarounds to replace | `ttmp/2026/11/21/PICOCALC-RAY-PARITY--…/scripts/repl_client.py`, `01-open-compiler-session.py`, `02-planner-equivalence.{js,py}`, `03-compile-cost.py`, `08-score-board.{js,py}` |
| Files W1 must load | `picocalc-os/compiler/{typed-wasm,typed-async,typed-world,typed-rv32,typed-pie-loops}.js`, `picocalc-os/tools/{rv32-interp,typed-ray-bench}.js` |
| W1 compiler provider | `pkg/tracecompiler/compiler.go` (`Modules`, `wrap`, `Provider.At`), `pkg/traceapi/compiler.{go,js}` |
| W2 repository and mounts | `pkg/tracerepo/repo.go` (`Read`, `Show`, `List`, `Resolve`, `Mount`), `pkg/traceapi/repo.{go,js}` |
| W3 jobs, W7 lifetime | `pkg/tracerepl/jobs.go` (`Submit`, `StopJob`, the registry), `pkg/tracerepl/sessions.go` (`reapIdle`), `pkg/tracerepl/http.go` |
| W4 inventory | `pkg/tracerepl/service.go` (`WithInventory`, `inventory`), `cmd/trace-repl/main.go` (`inventory.describe`, `buildInfo`), `pkg/tracearchive/archive.go` (`Label`, `Streams`) |
| W5 statistics | `pkg/traceapi/stats.{js,go}` |
| W6 renames | `pkg/tracearchive/renames.go` (`findRenames`), `pkg/traceapi/query.js` (`aliasChain`, `nameAt`, `measureEvent`) |
| Acceptance scripts and results | this ticket's `scripts/02`–`08`, `various/00`–`06` |

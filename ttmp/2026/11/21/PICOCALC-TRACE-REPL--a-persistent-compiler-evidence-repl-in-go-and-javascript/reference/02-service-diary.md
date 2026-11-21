---
Title: Persistent JavaScript service investigation diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Runtime selection, session lifecycle, HTTP boundary, verification and integration."
LastUpdated: 2026-11-21
WhatFor: "Reproduce the service implementation and its tests."
WhenToUse: "When reviewing persistent state, cancellation, transport or dependency selection."
---

# Persistent JavaScript service investigation diary

## Step 1: Choose a session boundary for compiler evidence

The researcher needs to reuse both computed values and the functions that produced them. A serialized table can reproduce the first, while a closure can capture the table and represent a second query. Keeping a VM alive preserves both. I put the runtime lifecycle in the local go-go-goja engine and used its session service to serialize operations from separate clients.

### Prompt Context

The two verbatim user prompts are recorded in [the supervisor diary, Step 1](01-supervisor-investigation-diary.md). I interpreted the service part as a host-side laboratory with one preselected capture, independent researcher sessions and persistent definitions across evaluations. The user wants to query several phases without paying archive and analysis setup time for every observation.

### What I did

- Inspected the local engine factory, runtime initialization hooks, session service, ownership gate, standalone REPL HTTP server and raw versus instrumented session policy.
- Checked this repository for Go modules and sources. It had neither. The new top-level module names the adjacent checkout explicitly and records the corresponding upstream tag.
- Agreed on a small HTTP protocol with the independent persona runner before implementing it.
- Read both vault articles requested by the user. The homolog-bench playbook asks the author to distinguish a reusable room binding from a shared source cache. The chromobench playbook asks the reviewer to reproduce an observed failure and classify its cause before changing an API. These criteria led to separate session-boundary and HTTP transport tests.

### Why

- go-go-goja already has an operation gate that prevents overlapping accesses to mutable VM state. Its runtime owner schedules JavaScript on the VM's owner goroutine. These are distinct concerns. The gate also gives a close operation a way to interrupt a cell that is still using the runtime.
- The archive is selected on the server command line once. A persona receives a session ID and composes expressions over the installed evidence API. Researchers cannot select host paths from JavaScript.
- The standard go-go-goja REPL can store complete cell reports, source histories and binding metadata. Here the persona harness owns observation history and the service owns live values. Using its raw session with an owned runtime callback avoids a second copy of query outputs in that history.

### What worked

- Local checkout revision `e9bc7891a7b4435ec659577dc346647daa548050` was tagged `v0.10.7`. The relative module replacement is `../go-go-golems/go-go-goja`.
- `go mod tidy` resolved the new module from the available Go toolchain and module caches.

### What didn't work

- No integration failure during protocol selection. The working tree initially lacked the JS library used by the query adapter's go:embed directive. Independent service tests install a one-field evidence object. The full acceptance check requires the production library.

### What I learned

- The engine enables a module loader by default. Selecting an empty middleware list does not remove its fallback module set. I disabled both registry defaults and removed the loader from the global object before user code could run.
- The useful ownership API is `replsession.Service.WithRuntime`. Merely evaluating code with a Go context can release a waiter while work continues. The code holds the session gate until both script execution and JSON encoding finish.

### What was tricky to build

- Returning an object can execute JavaScript a second time when JSON formatting invokes an object's serialization method. The deadline must cover this code too. A per-cell cancellation callback interrupts the VM, and its completion is synchronized before clearing the interrupt and releasing the gate. This prevents a delayed interrupt from hitting the next cell.
- Plain script declarations preserve lexical bindings naturally. A standalone `await expression` cell is wrapped as an async expression. Queries use synchronous capture data. An unresolved promise produces a diagnostic because there is no external event source in the session.

### What warrants a second pair of eyes

- A JavaScript timeout cannot preempt a blocking Go callback. Archive adapters must finish within a bounded amount of work or add explicit context polling. A bounded wire result controls response size after serialization; the host process has no per-VM heap quota.
- Check any future native function for filesystem or process capabilities before exposing it in this otherwise local session.
- Bindings and any successful mutations before an exception remain in VM memory through later calls. Deleting the session or restarting the process frees them.

### What should be done in the future

- Replay the generated query implementation through the public CLI when it is available. Use real persona reports to decide which further result forms or service controls users need.

### Code review instructions

- Start at `pkg/tracerepl/service.go`, then inspect `pkg/tracerepl/http.go` and `cmd/trace-repl/main.go`.
- Run `go test ./pkg/tracerepl -count=1` and inspect `TestTimeoutDuringComputationAndResultSerialization` and `TestPersistentSessionBoundary`.
- Session-only checks do not validate LLVM query meaning. The sibling archive and query tests own the evidence boundary.

### Technical details

- The HTTP routes are `POST /sessions`, `POST /sessions/{id}/eval` and `DELETE /sessions/{id}`. Evaluation input is JSON with one `source` string. A successful result returns `ok`, `value` and optional captured console lines. Plain JS null differs from a declaration returning undefined through the optional `kind` tag.
- The process accepts loopback traffic, limits live sessions to 32 and rejects browser-origin requests. A cell accepts 64 KiB of source, allows 15 seconds including queue time, and can return 512 KiB of serialized value. Each console cell is capped separately. The service does not survive a process restart.
- On this host, `GOCACHE=/tmp/picocalc-trace-gocache go test ./pkg/tracerepl -count=1 -timeout 35s` passed in 0.207 seconds. Sixteen concurrent increments in one session produced 16. Both the ordinary loop timeout and the timeout during JSON conversion left a working session.

## Step 2: Test command ownership and stopping an active cell

I added a client-facing command test after the first service commit. A test for an invalid address surfaced a dependency behavior that a successful help invocation concealed. The command parser exited the entire test process. Selecting the current Glazed command API restored the application's ability to return an error through Cobra and allowed the test to inspect its message.

### Prompt Context

See the supervisor diary, Step 1. I treated a usable service as including the ordinary command entry point and an operator's ability to close a busy session. **Commit (code):** `b8456db` introduced the host, CLI, original tests and operator guide.

### What I did

- Tested command discovery, the required session flag, and rejection of a non-loopback address.
- Added `TestClosingSessionInterruptsActiveCell`, which synchronizes on entry to a real JS cell before asking go-go-goja to close its runtime.
- Used a temporary Go build overlay for the isolated CLI check while the JS query implementation was in a separate lane. The overlay replaced only the query installer with a no-op. It was never used for the live persona service or for validation of query results.

### Why

- The module version used by the local go-go-goja checkout initially selected Glazed v1.3.5. The compiler-evidence CLI itself can use Glazed v1.4.4 through Go's normal module version selection.
- A failing CLI command should propagate the diagnostic to its caller. Top-level process exit belongs in main. This also lets a test call exactly the same command path users invoke.

### What worked

- With v1.4.4, `go test -overlay <temporary-overlay> ./cmd/trace-repl ./pkg/tracerepl -count=1 -timeout 20s` passed. The two packages took 0.009 s and 0.210 s respectively.
- `go test -race ./pkg/tracerepl -count=1 -timeout 50s` passed the initial session, cancellation, concurrency and HTTP test group in 1.234 s.

### What didn't work

- The first isolated CLI test command under Glazed v1.3.5 printed `Error: use a loopback host and port, for example 127.0.0.1:3791` and then `FAIL github.com/go-go-golems/picocalc-trace/cmd/trace-repl`. The application-level rejection was correct. The framework's `cobra.CheckErr` terminated the test process before its assertion could run. The v1.4.4 builder assigns `RunE` and returns this error.

### What I learned

- Matching a framework version to a library dependency alone does not establish the CLI's observable behavior. Returning an error versus exiting immediately is a distinct part of that contract.

### What was tricky to build

- A timed sleep cannot establish whether a close request interrupted an executing cell or simply disposed of an idle session. The test installs an explicit marker function and waits for its signal from inside the cell before closing it.

### What warrants a second pair of eyes

- Confirm real archive queries and the independent persona harness talk to the same frozen implementation revision.

### What should be done in the future

- Complete the live integration qualification against the production embedded JS library.

### Code review instructions

- Review `cmd/trace-repl/main_test.go`, `pkg/tracerepl/service_test.go` and the direct dependency in `go.mod`.
- Repeat with `go test -race ./cmd/trace-repl ./pkg/tracerepl` on the integrated tree.

### Technical details

The wrapped timeout spans both the owner call and result serialization, and the kernel session gate spans interrupt cleanup. A request to release a session cancels its active operation, which runs the same interrupt path exercised by a timeout.

The final command wiring also accepts the optional `--device-study` flag. Selecting the PIE-LOOPS root opens the physical trial table once and installs a fresh JS wrapper per session. Omitting it passes a nil study to the adapter, which can explain how to enable the evidence. Preflight `lsof-who -p 3791 -j` reported `no process listening/bound on port 3791`. The extended race test, including close-during-evaluation, passed in 1.234 s. An interim CLI overlay failed with `pkg/traceapi/hardware.go:12:19: undefined: importer` after the query installer gained a shared native importer. Preserving that importer in the isolated overlay recovered the CLI smoke check (0.010 s) and service suite (0.210 s). Final service qualification uses the real embedded query implementation.

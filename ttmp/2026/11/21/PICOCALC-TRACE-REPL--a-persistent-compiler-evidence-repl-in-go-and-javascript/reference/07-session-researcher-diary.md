---
Title: Session lifetime researcher diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological Opus High research and editorial review with empirical measurements and corrections."
LastUpdated: 2026-11-21
WhatFor: "Understand and reproduce the independent session lifetime experiment."
WhenToUse: "When reviewing persistent bindings, archive retention, interpreting compiler evidence or designing persona tests."
---

# Diary — Persistent session and evidence lifetime study

## Step 1: Opening the study before reading the evidence

I am starting an independent study of how an engineer who designs and validates a compiler optimization can use a live query session over the PicoCalc ray-row archive. Before reading any source or diary, I am recording what I was asked to do, what I am allowed to touch, and which questions I expect the evidence to answer, so that later entries can be checked against an honest starting point.

No reading, assay or writing beyond this entry has happened yet. The only material in the room is `brief.md` and the `evidence/` directory. The deliverables are `article.md` (a newcomer-oriented vault deep dive) and this diary.

### Prompt Context
**User prompt (verbatim):** "Read brief.md first and complete the study. Your only allowed assay command is /tmp/picocalc-opus-session-study.kizLBz/assays/run . Write article.md and diary.md as specified."
**Assistant interpretation:** Follow `brief.md` as the study specification: read the listed evidence and both methodology articles, run the single read-only assay command exactly once with no arguments, and write the two Markdown deliverables in the room directory.
**Inferred user intent:** Obtain an independent, evidence-backed explanation of session and evidence lifetimes that a newcomer can use to choose, support and falsify a compiler change, with a diary that lets a reviewer audit how each claim was reached.
**Commit (code):** N/A — no repository and no product edits in scope.

### What I did
- Read `brief.md`.
- Listed `evidence/` (14 files: `service.go`, `service_test.go`, `http.go`, `operator.md`, `archive.go`, `archive_test.go`, `archive-diary.md`, `supervisor-diary.md`, `homolog.md`, `chromobench.md`, `SKILL.md`, `vault-writing.md`, `investigation-entry.md`).
- Read `evidence/investigation-entry.md` first, only to learn the diary format required for this entry.

### Why
- The brief asks for the opening entry before the evidence is read. Writing it now fixes my starting assumptions so that later corrections stay visible.

### What worked
- The room contains every file the brief names.

### What didn't work
- No failures observed yet.

### What I learned
- Constraints from the brief: no product edits, no other external services, one exact no-argument assay command, no invented quotes, repo-relative citations, no ns/op claim about whole-query latency or compiler or PicoCalc speed, and a JS query counts as observed only if I execute it against a running workbench.

### What was tricky to build
- Nothing has been built yet. The open question is which evidence I can produce myself and which I can only cite.

### What warrants a second pair of eyes
- Whether the assay harness exercises a JS query against a running workbench, or only package tests. This decides whether any JS result can be called "observed".

### What should be done in the future
- Read the evidence in the order the brief lists, extract one criterion from each methodology article, run the assay, then draft and revise.

### Code review instructions
- Not applicable for this entry.

### Technical details
- Room: `/tmp/picocalc-opus-session-study.kizLBz/room`.
- Assay: `/tmp/picocalc-opus-session-study.kizLBz/assays/run` (no arguments).

## Step 2: Reading the code, the diaries and the two methodology articles

I read the session service, its HTTP layer, the archive reader and their tests, and then the two project diaries. The goal was to separate three kinds of statement before running anything. Some facts are enforced by code I can read. Some are asserted by tests that my assay will run. The rest are only described in prose. The main correction to my starting picture was that the evidence holds two independent caches with different owners and lifetimes. JavaScript bindings live in one session's Goja VM. Verified LLVM text lives in one process's `Archive`. Nothing in the evidence connects their lifetimes except the process itself.

I then read both methodology articles and took one concrete criterion from each. I use these criteria in Step 3 and in the article to decide what my own assay supports.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Read every file the brief names and extract one usable criterion from each methodology article.
**Inferred user intent:** The article should rest on the actual code and on the lab's stated method, not on general knowledge of REPLs.
**Commit (code):** N/A.

### What I did
- Read `evidence/service.go` (`pkg/tracerepl/service.go`): `Installer.InitRuntime` (l.46–96), `New` (l.108), `Open`/`Release`/`Close` (l.122–136), `Evaluate` (l.138–173), `evalCell` (l.177–218).
- Read `evidence/service_test.go` (`pkg/tracerepl/service_test.go`): five tests, all built on the test installer `vm.Set("answer", 42)` (l.19) or `markStarted` (l.158ff).
- Read `evidence/http.go` (`pkg/tracerepl/http.go`): `MaxSessions = 32`, Origin and loopback Host check (l.91), `failure` status mapping (l.115–127).
- Read `evidence/operator.md` (operator guide for `cmd/trace-repl`; the brief did not give its repository path).
- Read `evidence/archive.go` (`pkg/tracearchive/archive.go`) and `evidence/archive_test.go` (`pkg/tracearchive/archive_test.go`).
- Read `evidence/archive-diary.md` and `evidence/supervisor-diary.md`. The verbatim user direction is quoted in the supervisor diary, Step 1 and Step 2.
- Read `evidence/homolog.md`, `evidence/chromobench.md`, `evidence/SKILL.md`, `evidence/vault-writing.md`.

### Why
- The brief requires that every claim about lifetime come from code or test evidence. Reading before running let me predict what each test proves, so that a pass could be checked against a stated expectation.

### What worked
- Every lifetime question in the brief maps to one location in the source:
  - Binding reuse: the session VM, `TestPersistentSessionBoundary` (`service_test.go:49`).
  - Two sessions: the same test, `typeof x` in the second session is `"undefined"` (l.56).
  - Two callers in one session: `TestSameSessionSerializesEvaluations` (l.92), 16 × `n += 1` → `16`.
  - Timeout during JS conversion: `({toJSON() { while (true) {} }})` (l.81). The loop runs inside `state.stringify` in `evalCell` (`service.go:206`), after the cell's script has returned.
  - Deletion during execution: `TestClosingSessionInterruptsActiveCell` (l.158).
  - Queueing and interrupt cleanup: `Evaluate` l.142–162.
  - Cached bytes: `Archive.Text` (`archive.go:237–259`), `TestConcurrentReadsShareSuccessfulInflation` (`archive_test.go:97`).
- Criterion from the homolog-bench playbook (§9 and §10.1): *every status word names its scope, and every fact the agent must report needs an observation that shows it, for example whether new work ran.* In this system "cached" or "warm" has to say which cache it means: a VM binding, the archive's verified stream, or a profile tree. The observation that shows no new work ran is the `Archive.Stats()` counter pair `streamInflations` and `textReads`. A short time is not that observation.
- Criterion from the chromobench playbook ("Verifying findings" and "Recording what is left"): *a finding is a symptom, not a diagnosis. It is confirmed only by a probe with exact inputs. A round ends with fixed, left and not-reproduced lists.* I apply this as a three-way label on every claim: observed by my assay, asserted in source I did not run, or not executed. A JS query against the archive belongs in the third group until someone runs it against a running workbench.

### What didn't work
- No failures. One gap: the native adapter `pkg/traceapi/install.go` is described in the supervisor diary (Step 1: "Go copies archive records into the requesting JavaScript VM as plain data") but is not in `evidence/`. I cannot cite its lines or its JS names. The only JS name the evidence documents is `q.help()` in the operator guide.

### What I learned
- The session tests never touch the LLVM corpus, and the archive tests never touch JavaScript. The corpus is real (the tests glob `../../ttmp/2026/11/21/PICOCALC-ROW-IR--*`, `archive_test.go:18`). The JS probes use an explicit test installer. Neither suite runs a JS query over the archive.
- `Evaluate` passes `context.WithoutCancel(opCtx)` to `rt.Owner.Call` (`service.go:148`). Evaluate therefore waits for the callback even after a deadline. The comment at l.146–147 says this keeps the session gate held until the interrupt is consumed and cleared.
- `Archive.Text` holds the per-stream mutex for both inflation and slicing (l.245–258), and it takes no context. A cancellation cannot stop a Go archive call that is already running. Goja delivers `vm.Interrupt` while it executes JavaScript, so the interrupt takes effect once control returns to JS. This is my inference from the Goja API. No test exercises it.
- `Profile` returns a deep copy on every call (`cloneJSON`, l.332). Recomputing a metric from a profile works on a private tree each time. `TestProfileOwnershipAndModuleIdentity` asserts this, but it is outside the assay's `-run` filter.

### What was tricky to build
- Keeping "reuse" precise. Four different things are often called reuse: a JS binding that is still in the VM, a callback that runs again over bytes the archive already verified, a metric computed again from those bytes, and a process restart that loses both caches. They have different owners, different invalidation events and different counters.

### What warrants a second pair of eyes
- The HTTP handler's `live` map (`http.go:24`) is decremented only on a successful DELETE. A session that is unloaded some other way would keep its slot until the process exits. I did not find such a path in the evidence I have, but I did not read `replsession`.

### What should be done in the future
- Run the assay and compare each verdict with the expectation above.

### Code review instructions
- Read `service.go:138–173` together with `service_test.go:77–90` and `:158–189`. Then read `archive.go:237–259` with `archive_test.go:97–119`.

### Technical details
- Limits: `MaxSourceBytes = 64 << 10`, `MaxResultBytes = 512 << 10`, `defaultEvalTimeout = 15 s` (`service.go:19–23`). `MaxSessions = 32` (`http.go:17`). Console: 64 lines plus one omission warning, 2048 bytes per line (`service.go:59–78`). HTTP body limit: `6*MaxSourceBytes+1024` (`http.go:47`).

## Step 3: Running the single assay

I ran the harness once, with no arguments, exactly as the invocation allows. It executes two prebuilt test binaries: the real `pkg/tracerepl` session package and the real `pkg/tracearchive` archive package, which reads the actual LLVM archive. Every test passed. The benchmark produced four lines, two per sub-benchmark.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Use only `/tmp/picocalc-opus-session-study.kizLBz/assays/run` for empirical evidence and preserve its output exactly.
**Inferred user intent:** Every measurement in the article should trace back to one recorded run.
**Commit (code):** N/A.

### What I did
- Command, run once with no arguments: `/tmp/picocalc-opus-session-study.kizLBz/assays/run`
- I did not open or modify the harness script. Its internal flags are therefore known only from what its output shows.

### Why
- The brief allows exactly one assay command. One run is a single sample, so I report it as one sample.

### What worked
Verbatim output:

```text
=== RUN   TestPersistentSessionBoundary
--- PASS: TestPersistentSessionBoundary (0.00s)
=== RUN   TestTimeoutDuringComputationAndResultSerialization
--- PASS: TestTimeoutDuringComputationAndResultSerialization (0.20s)
=== RUN   TestSameSessionSerializesEvaluations
--- PASS: TestSameSessionSerializesEvaluations (0.00s)
=== RUN   TestHTTPProtocol
--- PASS: TestHTTPProtocol (0.00s)
=== RUN   TestClosingSessionInterruptsActiveCell
--- PASS: TestClosingSessionInterruptsActiveCell (0.00s)
PASS
=== RUN   TestArchivedPassesAndEvidenceRanges
--- PASS: TestArchivedPassesAndEvidenceRanges (0.08s)
=== RUN   TestConcurrentReadsShareSuccessfulInflation
--- PASS: TestConcurrentReadsShareSuccessfulInflation (0.01s)
=== RUN   TestArchivedPassesAndEvidenceRanges
--- PASS: TestArchivedPassesAndEvidenceRanges (0.08s)
=== RUN   TestConcurrentReadsShareSuccessfulInflation
--- PASS: TestConcurrentReadsShareSuccessfulInflation (0.01s)
goos: linux
goarch: amd64
pkg: github.com/go-go-golems/picocalc-trace/pkg/tracearchive
cpu: 11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz
BenchmarkCheckedMiddleDump
BenchmarkCheckedMiddleDump/open-and-first-read
BenchmarkCheckedMiddleDump/open-and-first-read-8         	      10	   6918053 ns/op	 5948150 B/op	    4799 allocs/op
BenchmarkCheckedMiddleDump/open-and-first-read-8         	      10	   7413779 ns/op	 5948123 B/op	    4799 allocs/op
BenchmarkCheckedMiddleDump/resident-read
BenchmarkCheckedMiddleDump/resident-read-8               	      10	       186.8 ns/op	       0 B/op	       0 allocs/op
BenchmarkCheckedMiddleDump/resident-read-8               	      10	       172.4 ns/op	       0 B/op	       0 allocs/op
PASS
```

- Verdicts: 5/5 session tests PASS. 2 archive tests × 2 counts, 4/4 PASS. Both packages report `PASS`.
- The timeout test took 0.20 s: two cells, each hitting the 100 ms test deadline (`service_test.go:79`), consistent with the code.
- The archive assertions that passed on the real corpus are 4,133 events, 0 inflations after listing, 6 after reading one terminal event per stream, checked/middle has 195 events, ordinal 74 is `EarlyCSEPass` with stream SHA `bbd3b983…795b4`, `load i32, ptr %work,` occurs 11 times at ordinal 73 and 6 at ordinal 74, checked/backend 74 and 78 are both `virtregrewriter` (only 78 has `NoVRegs` on line 2), 12 concurrent readers give `textReads=12`, `streamInflations=1`, `inflatedBytes=1027953`.

### What didn't work
- No failures. Limitations of this run:
  - The output does not print the Go version, `-race`, or the exact `go test` flags. The shape (`-v` lines, two counts, 10 iterations) matches the public reproduction command in the brief. I infer the flags from that match. The operator guide documents toolchain 1.26.10 and go-go-goja v0.10.7. The run does not confirm them.
  - `-8` is the GOMAXPROCS suffix.
  - `-benchtime 10x` means 10 iterations per line. At about 180 ns/op that is about 1.8 µs of timed work, so timer resolution and noise dominate the resident line. The archive diary's earlier 300 ms runs reported 103.2–132.2 ns/op on the same CPU model. I treat both as order-of-magnitude figures.
  - The `-run` filter excludes `TestProfileOwnershipAndModuleIdentity` and `TestIndexIntegrityAndInflatedByteAddressing`. I did not observe them.
  - No JS query was executed against a running workbench. No `trace-repl serve` process was started.

### What I learned
- Applying the homolog criterion: the resident read's low cost would be ambiguous alone, because it could mean "fast inflation" or "no inflation". The counter assertion (`streamInflations == 1` after 12 reads) is the observation that names the scope: the bytes were verified once per `Archive`, which means once per process.
- Applying the chromobench criterion: the 11 → 6 load count is observed through a probe with exact inputs (variant `checked`, phase `middle`, ordinals 73/74, literal pattern). Any JS form of that query is unreproduced here.

### What was tricky to build
- Describing what each ns/op number contains. `open-and-first-read` covers the fixture glob, `Open` (manifest and six gzipped indexes), and one `Text` that inflates, hashes and header-checks 1,027,953 bytes. `resident-read` covers a mutex lock, a counter increment and a substring. Neither includes HTTP, JSON decoding, session queueing, Goja execution, the adapter's copy into the VM, result serialization, process start or PicoCalc execution.

### What warrants a second pair of eyes
- Whether the harness ran with `-race`. The archive diary's 2.4–2.6 s timings came from `-race` runs, so they are not comparable to the 0.08 s here.

### What should be done in the future
- Mark any later warm product measurement as a separate addendum, with its own boundary.

### Code review instructions
- Reproduce with `go test -v ./pkg/tracerepl` and `go test -v ./pkg/tracearchive -run 'TestArchivedPassesAndEvidenceRanges|TestConcurrentReadsShareSuccessfulInflation' -bench BenchmarkCheckedMiddleDump -benchtime 10x -count 2` from the repository root.

### Technical details
- Host: linux/amd64, Intel i7-1165G7 @ 2.80 GHz, GOMAXPROCS 8. Package path `github.com/go-go-golems/picocalc-trace/pkg/tracearchive`.

## Step 4: Drafting the article, rereading it as a newcomer, and the final verdict

I wrote `article.md` as a body without frontmatter, because the publisher supplies the ticket YAML. It covers the three runtime terms, the two caches, a four-row reuse table, seven lifetime traces, a source → operation → result walkthrough for ordinals 73/74, one compiler hypothesis with static checks and a dynamic falsifier, the benchmark boundary, the trust boundary, the two playbook criteria and a limits table. I then reread it as a compiler student who has never seen the workbench. I listed the comprehension gaps separately from technical corrections and revised both.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the vault deep dive, revise it for a newcomer, and record the fixes and the verdict here.
**Inferred user intent:** A newcomer can use the article alone to plan, support and falsify a compiler change with the workbench, without being misled about what was measured.
**Commit (code):** N/A.

### What I did
- Wrote `article.md` (about 6,400 words) with two Mermaid diagrams: a lifetime architecture flowchart and an `Evaluate` timeout sequence.
- Reread the whole draft as the reader's only explanation, then made the fixes below.

### Why
- The SKILL guide requires a second pass that separates comprehension gaps from technical corrections, and an author's reread is not independent reader testing. I record it as an author's reread only.

### What worked
- Comprehension fixes:
  1. The first draft used "pass dump", "stream", "ordinal", "variant", "phase", `EarlyCSEPass`, `virtregrewriter` and "guest instructions" before defining any of them. I added a section, "What the archive contains", ahead of the runtime terms.
  2. The `await` rule said that declarations inside an awaited cell are local. The wrapper actually turns the cell into one parenthesized expression (`service.go:183`), so the cell cannot contain a declaration at all. I rewrote the rule and added the pending-promise error (`service.go:192–193`).
  3. The walkthrough presented `IR Dump After EarlyCSEPass on row` as ordinal 74's exact header. The test asserts only the parsed pass name. I reworded it as the header form plus the asserted pass.
  4. The hypothesis attributed 11 → 6 to EarlyCSE without checking that ordinal 73 is the preceding dump of the same function. The tests do not assert ordinal 73's header. I added static check S0 and stated the assumption in the hypothesis.
- Technical corrections:
  5. "`restrict` in C" assumed a C frontend. The evidence does not say what language the frontend compiles. I replaced it with "`noalias` on that pointer in the IR the frontend emits".
  6. The P4 row named "stock treatment" as baseline. That belongs to the existing PIE study, which tests a different change. I changed it to a new paired study with the same design, using the unchanged build as baseline.
  7. "If two cells ran at once, increments would be lost" overstated what one passing run shows. I rewrote it as an expectation of the gate, not a proof.
  8. "A web page cannot drive it" overstated the Origin check. I narrowed it to the mechanism: browser pages send `Origin` on these requests.
  9. "The remaining loads cost nothing at run time" overstated what an unchanged guest instruction total shows. I narrowed it to "did not contribute to the executed instruction count, across repeated captures".
  10. The hypothesis said the six remaining loads "are not all necessary" and then "They are reloads…", which contradict each other. I changed it to "at least some of the six … are unnecessary".
  11. A supervisor-diary quotation had its first letter lower-cased inside the quote marks. I restored the exact text: "The original study never recorded per-PC samples."
- A scan for analogy and filler phrases found only one "most clearly", which I removed as part of fix 9.

### What didn't work
- A `cat >> diary.md <<'EOF'` append through Bash was denied by the permission mode ("Permission to use Bash has been denied because Claude Code is running in don't ask mode"). I made the same append with the Edit tool. No content was lost.

### What I learned
- The firmest dynamic number the evidence offers for the checked build (1,233,611 guest instructions) comes from a test outside the assay filter. The hypothesis can use it as a baseline only as source evidence, and a new capture of the unchanged build is needed anyway to establish run-to-run stability.

### What was tricky to build
- Writing a falsifiable hypothesis without per-PC samples. The static fact (11 → 6) cannot show which loads execute often. The design therefore puts three static checks (S0–S2) before any build, uses S3 as a cross-variant control, and makes the dynamic test compare totals and output identity, with a separate paired-timing study.

### What warrants a second pair of eyes
- The inference that a running `Archive.Text` call cannot be interrupted, and that release cancels `opCtx`, rests on the code and the test outcome, not on reading `replsession` or Goja internals.
- Whether `pkg/traceapi/install.go` copies whole dump strings into each VM, which affects per-session memory. I did not read it.

### What should be done in the future
- Run the JS form of the 73/74 query against a live `trace-repl serve` and record it as an observation. Until then it stays on the not-reproduced list.
- Run S0–S3 in a session and decide whether the `noalias` candidate is the right change before building it.
- Add a test of two JavaScript sessions reading the archive concurrently, and one of the 408 and 410 paths.
- Put any future warm product measurement in a separately marked addendum.

### Code review instructions
- Read `article.md` sections "Four kinds of reuse", "Trace 6", "Walkthrough" and "One compiler hypothesis" against `service.go:138–173`, `archive.go:237–259` and `archive_test.go:29–119`.

### Technical details
- Final verdict: the session and archive lifetimes described in the article are supported by passing tests on this host (9 of 9 test executions passed, covering 7 distinct test functions) and by the source. The 11 → 6 `%work` load count at checked/middle 73 → 74 is observed static evidence. Its run-time significance is untested, and no data in the archive can decide it. No JS query against the archive was executed. The benchmark figures are Go reader component costs from one 10-iteration run, not query, compiler or PicoCalc latency. The service is suitable for trusted local use only, with no memory bound.
- Paths written: `/tmp/picocalc-opus-session-study.kizLBz/room/article.md`, `/tmp/picocalc-opus-session-study.kizLBz/room/diary.md`.

## Step 5: Revising after the independent editorial review

An independent reviewer checked the draft against the compiler evidence and wrote `editorial-review.md`. I revised `article.md` in place and added this entry. I left Steps 1–4 unchanged. Where they contain a claim that is now wrong, the correction is recorded below, so the chronological record shows both what I first wrote and why it changed. The review also supplied two new local evidence files: `evidence/row-ir-study.md` (the PICOCALC-ROW-IR analysis) and `evidence/adapter.go` (`pkg/traceapi/install.go`). Both changed the article substantially. I did not run the assay again, and none of the corrections needed a new measurement.

### Prompt Context
**User prompt (verbatim):** "You are the Opus High author of this compiler-evidence session study. Read editorial-review.md, article.md, and diary.md and revise the article and append the review entry in place following the brief. This is a focused precision revision; you may use the two supplemental local evidence documents named there. Deliver the corrected article.md and diary.md."
**Assistant interpretation:** Treat `editorial-review.md` as the revision brief. Fix every point it raises in `article.md`, read the two supplemental evidence files, keep the measured results and the record of what was and was not run, and append a detailed review entry here without erasing earlier steps.
**Inferred user intent:** A compiler student should be able to read the article without being misled about what a static count, an unchanged instruction total or a mismatching output proves. The student should also learn whose compiler produced the archive and how a JavaScript cell actually reaches the Go archive.
**Commit (code):** N/A. No repository, no product edits.

### What I did
- Read `editorial-review.md`, the full `article.md` and this diary.
- Read `evidence/row-ir-study.md` and `evidence/adapter.go` in full.
- Re-read `evidence/archive.go` in full to check the signatures the adapter relies on (`Events`, `Profile`, `InitialModule`, `Stats`), and to check every place where the archive package caches something. I also read `archive_test.go:110–149` to confirm what `TestProfileOwnershipAndModuleIdentity` asserts.
- Tried to read `evidence/live-query.json`. The file does not exist (the read returned "File does not exist"). As the brief instructs for that case, I kept the article component-only and did not wait for the file. The article states that no operator trace of a deployed workbench was available. It does not cite a receipt that does not exist.
- Rewrote `article.md` with the Write tool. The changes are listed below by review item.

### Why
- The review found claims that overstated what the evidence shows. Two were the most serious: that an unchanged instruction total would show the removed loads were not on the hot path, and that a CRC change would show the aliasing assumption was false. The review also found two gaps that the new evidence fills: what the three builds are, and how the bridge converts values.

### What worked
Review item 1: falsification logic.
- I replaced the dynamic-test table and its interpretation. The table now separates three questions: legality (semantic equivalence), generated work (the preregistered net reduction in executed guest instructions) and device benefit (paired timing).
- An unchanged total with fewer static loads is now described as evidence against the preregistered net reduction. The article states that it cannot show the removed loads were cold or cost nothing, because new or moved instructions, different spills or list scheduling, or a different branch mix can offset a real saving. Attribution needs an assembly diff and, if captured, per-PC counts.
- A mismatching return value or buffer byte now disqualifies semantic equivalence on that fixture, and the article says explicitly that it does not diagnose a specific aliasing error.
- Identical fixture outputs are described as necessary but not sufficient for legality. I added an out-of-bounds trap case, citing the ROW-IR study's acceptance test: "the same rows, memory, exceptions and writes before a trap."
- The primary output check is now a full comparison: the return value and all 4,100 buffer bytes against the WebAssembly-computed expected rows, which is the ROW-IR study's own method. The device CRCs are kept as a compact smoke test, and the article says that the full comparison is stronger.
- **Correction to Step 4, fix 9.** In Step 4 I recorded narrowing "the remaining loads cost nothing at run time" to "did not contribute to the executed instruction count, across repeated captures". That narrowing was still wrong. An unchanged total cannot attribute zero contribution to the removed loads, because other changes can offset their saving. The article now says only that the outcome counts against the net reduction.
- **Correction to Step 4, fix 5, and to the draft's candidate change.** The `noalias` candidate does not fit the evidence. In the checked control, the depth and ID stores go into the same shared buffer through pointers derived from `%work` itself. A `noalias` attribute constrains accesses through other pointers and says nothing about these. The article now explains why the earlier candidate does not fit. It proposes C1, a hand-supplied capacity reuse in the C control (all checks kept), as a measurement of the upper gain, and C2, the compiler change. C2's form depends on S2: an alias fact if stores separate the loads, or later redundancy elimination or hoisting if EarlyCSE's dominance requirement is the cause.
- I removed the draft's sentence "An output CRC change refutes the change itself, not only the hypothesis."

Review item 2: lexical bindings.
- "Bindings … are properties of that VM's global scope" and "`x` is a property of the first VM's global scope" now read as bindings in the VM's global lexical environment. The article states that such a binding is not a property of `globalThis`, and that in standard JavaScript only top-level `var` and function declarations create global-object properties. That point is JavaScript semantics, and no test checks the `globalThis` form.

Review item 3: what the builds are and whose compiler is involved.
- **Correction to Step 2 and to the draft ("The evidence does not explain how the builds differ beyond their names").** That was true of the original evidence set, but the ROW-IR study explains the builds. `checked` is a C control written to mirror the Typed row, and its inline helper loads the capacity, compares it with the index and traps. `unchecked` is the same control assuming valid accesses, which is a different contract. `firmware` is the production `trace_row`, compiled by LLVM from the same preprocessed unit that GCC 14.2.0 builds for the shipped firmware. Both controls used signed wraparound and had strict aliasing disabled.
- I added a section saying whose compiler does what. Typed's compiler is the project's own and runs on the ESP32-P4, with a WebAssembly target used as a result oracle and a native RV32 target. LLVM 18.1.3 and GCC compile only C, and the archive holds only LLVM dumps of C.
- At the first mention of the computation, the article now says that a ray-row step computes the nearest sphere hits for one scanline. At the first mention of `%work`, it says that the buffer's header holds its capacity and that bounds checks compare indexes against it to keep memory accesses inside the buffer. The `load i32, ptr %work,` pattern is therefore the capacity load of a bounds check.
- I added the ROW-IR study's contrasts as reported evidence: 1,233,611 / 632,124 / 1,136,142 / 3,608,697 guest instructions, 1,275,560 with LLVM loop strength reduction disabled, and stack operations of 320/320 for checked LLVM. I also added the study's report of 11 inlined checks, EarlyCSE reducing 11 → 6 header-load sites, and a header load remaining in the hot loop. The study independently corroborates the assay's 11 → 6.
- S1 and S3 changed as a result. S1 no longer offers "count at 194 is zero" as a likely outcome, because the earlier study reports a header load in the hot loop. S3 no longer treats the unchecked build as a control for the load count, since that build has no capacity checks. It now bounds the cost of the whole checked contract: 1,233,611 − 632,124 = 601,487 instructions.

Review item 4: the bridge.
- **Correction to Step 2 ("not in evidence") and to the draft's Trace 7 and Limits row.** `install.go` is now read. A new section describes it concretely. `Install` builds a JSON importer from the VM's own `JSON.parse`, creates a `__trace` bridge with six methods, runs the embedded `trace/query.js`, and then deletes `__trace`. The section lists each method's conversion: `text` and `profileSHA` arrive as JavaScript strings through `vm.ToValue`, and `events`, `profile`, `initialModule` and `stats` arrive through `json.Marshal` followed by `JSON.parse`. It also states that Go errors become JavaScript `TypeError`s.
- The article now shows that a cell can bind a result derived from a bridge call. It also explains how to check immutable archive data against a session's possibly edited value: recompute from a fresh bridge call, and cite by `Ref` or `profileSHA`, where `profileSHA` identifies the file, not the session's copy.
- **Correction to Step 4 ("second pair of eyes", whole dump strings per VM) and to the draft's "every session … holds its own JavaScript copy".** Structured records are new per call, and an `initialModule` call carries the whole module through JSON. For `text`, whether Goja copies the bytes is a Goja internal that is not in the evidence. The article now leaves that question open.

Review item 5: caching claims.
- The draft's "a metric is never cached on the Go side" and "Nothing is cached unless you bind the result" were replaced by an explicit list of four places. `tracearchive` caches stream text, profile trees and initial modules, but no computed results. The bridge keeps no state beyond its reference to the archive. `query.js` was not read, so memoization there is not ruled out. User bindings are the explicit cache. The article states that this is not a claim about the whole product.
- I added the initial-module cache, which the draft omitted. Its digest is computed on first load and is not compared with a manifest (`archive.go:366–394`).
- "The zero allocations show that a resident read creates no new Go data" became a scoped statement. No heap allocation occurred in this benchmark invocation on this Go build. The mutex, the counter and the returned string header still move data, and the bridge's conversion into the VM is outside the benchmark.

Review item 6: structure.
- I moved the scope boundaries into one "Methods and limits" section near the top, with the four evidence labels and the merged limits table. I removed the repeated per-paragraph status sentences, and each trace heading now carries a short label instead. I removed the separate "Limits" section at the end. All reproduction commands and all numbers from Step 3 are kept unchanged.

### What didn't work
- `evidence/live-query.json` is absent, so the article contains no operator-generated trace, no keys or values from one, and no session-isolation result from a deployed program. I did not invent a citation for it.
- The new evidence does not include `trace/query.js`. The article still cannot name the public JavaScript query functions beyond `q.help()`, and it cannot rule out caching in that layer.

### What I learned
- The literal pattern in the archive test is not an arbitrary load count. It counts the capacity loads of inlined bounds checks. That changes which compiler change is plausible. The surviving loads are separated from each other either by stores into the same buffer or by control flow that EarlyCSE cannot cross. They are not separated by a foreign pointer.
- Disabling strict aliasing for the controls removes type-based alias analysis as a way to separate the `i32` header from 16-bit element stores. Any proof of disjointness must come from address arithmetic.
- The C controls never run on the device. Device timing is therefore a question about the Typed compiler, not about the LLVM build in the archive.

### What was tricky to build
- Stating the legality argument for capacity reuse without letting the fixtures stand in for a proof. The argument rests on three things: the buffer layout (elements follow the header), the order of check before access, and the absence of calls that write the buffer (S2). The fixtures only test it, and they include no trap case unless one is added.
- Keeping three questions apart that are easy to merge: was the transformation legal, did the optimization reduce generated work, and is a device program faster.

### What warrants a second pair of eyes
- Whether LLVM 18's address-based alias analysis can already prove that a store at `%work` plus a constant offset plus a non-negative scaled index misses the 4-byte header. If it can, the surviving loads are a control-flow (dominance) effect, and C2 belongs in a later pass. S2 is designed to settle this. I have not inspected the dumps.
- My reading that `query.js` must capture the bridge before `__trace` is deleted. This is an inference from `install.go:57–64`, not from `query.js`.

### What should be done in the future
- Run S0–S3 in a live session against the real archive, and record the result as an observation.
- If C1 is built, preregister the primary outcome (row-function guest instructions over 160 calls below 1,233,611). Compare all 4,100 bytes for every row, add an out-of-bounds trap case, and diff the final assembly.
- Obtain `trace/query.js`, then either name the public query functions or confirm whether they memoize anything.
- If an operator-generated trace of the deployed program becomes available, report it separately from these component assays, cite its receipt by name, and draw no timing conclusions from one uncontrolled sequence.

### Code review instructions
- Read the article sections "Methods and limits", "What the archive describes", "The native bridge" and "One compiler hypothesis, with a falsifier" against `evidence/row-ir-study.md` ("Two kinds of evidence", "Pass 2", "Pass 4", "The decision for an on-device compiler"), `evidence/adapter.go:18–88` and `evidence/archive.go:56–76, 300–404`.
- Check that every number in the measurement table and the reproduction commands matches Step 3 exactly.

### Technical details
- Revised verdict, superseding the Step 4 verdict where the two differ. The session and archive lifetimes are supported by 9 passing test executions on this host and by the source. The 11 → 6 count of `%work` capacity loads at checked/middle 73 → 74 is observed static evidence, and the ROW-IR study corroborates it. Its run-time significance is untested. A candidate that lowers the static count with an unchanged total would count against a net reduction, but it would not show that the removed loads were cold. A mismatching output would disqualify equivalence on that fixture without diagnosing the cause. No JavaScript query against the real archive was executed. The bridge's conversion rules are source evidence. Benchmark figures are Go reader component costs from one 10-iteration run. The service is suitable for trusted local use only, with no memory bound.
- Evidence files read in this step: `editorial-review.md`, `evidence/row-ir-study.md`, `evidence/adapter.go`, `evidence/archive.go`, `evidence/archive_test.go` (l.110–149). Absent: `evidence/live-query.json`.

# Integration diary — query.js into the Go trace REPL

Owner: Claude Opus xhigh (product owner for integration fixes in `pkg/traceapi/query.js` and Go).
Format: one entry per investigation step — source, observation, action, command, evidence.
All commands ran in `/tmp/picocalc-trace-repl-ownership-20261121/project`. No git operations.

## Step 1 — Reproduce the reported failure

- Source: `integration-brief.md`, `owner-scratch/first-integration-tests.txt`.
- Command: `go test ./pkg/traceapi`.
- Observed: `TestCompilerEvidence` and `TestWorkbookExamples` failed at the common bindings with
  `[unknownFunction] function in variant checked "row" is unknown. Valid: ` (empty list).
- A second run a minute later printed a different message (`… (named by its event scopes)`) and a
  later failure (`[notInSelection] ordinal 74 … is not in …function("row").timeline("middle")`):
  `query.js` had been replaced on disk between runs (it now resolves backend scopes from prints, so
  `row` was found from machine-function prints, but no middle-end event belonged to `row`).
  From here on every edit used the Edit tool, which refuses to write if the file changed after it was read.

## Step 2 — Root cause of the empty catalog

- Source: `query.js` `parseHeader`; `pkg/tracearchive/archive.go` `inflate`/`parsePass`.
- The archive index normalizes headers: the Go verifier strips `;`/`#`, the leading `*** ` and a
  trailing ` ***`. Middle-end index headers are therefore `IR Dump After EarlyCSEPass on row`; backend
  ones keep `***:` (machine printer) or have nothing (IR-level llc passes).
- `parseHeader` required a literal trailing ` ***` in both regular expressions, so every middle-end
  event got `scope.kind = 'unknown'`, `function = null`, and the function catalog was empty.
- Fix (small Edit, as directed): both expressions accept ` ***`, ` ***:` or nothing, anchored at the end.
- Command: `go test -count=1 ./pkg/traceapi` → `ok`.

## Step 3 — Read every workbook result, not just the pass/fail

- Command: `go test -count=1 -run TestWorkbookExamples -v ./pkg/traceapi`.
- Evidence: numbers equal to the independent oracle (`pkg/tracearchive/workbook_oracle_test.go`):
  4,133; 195; ordinal 74 EarlyCSEPass; 6; 11 → 6; first drop 73 → 74, −5; 0 allocas / 3 phis at 6;
  16 → 0; virtregrewriter at 74 and 78 only; NoVRegs false → true; 1,136,142; 1,290,106;
  1,136,142 vs 1,233,611; 1,275,560 → 1,233,611; `missingDebugLocations`; `missingPCSamples`.
- Genuine open defect: example 13 fails loudly with `[noEvent] … scope.kind === "loop" … matched no event`.
  Loop-pass headers name the loop by its header block (brief: `for.body29`, `for.cond25`) and parse
  as functions.

## Step 4 — Checkpoint 1

- Commands: `go test -race -count=1 ./...` → ok ×5; `go vet ./...` → clean; `sha256sum pkg/traceapi/query.js`.
- Recorded in `INTEGRATION-CHECKPOINT.md` (sha256 `5434331b…a7b411`) so blind trials can start.

## Step 5 — Measure real header shapes before designing the loop fix

- Source: scratch Go probe over `tracearchive` (every stream; initial-module `define` names).
- Evidence: checked/unchecked define `element`, `row`; firmware defines 24 functions. checked middle:
  22 module, 10 CGSCC, 121 function, 42 other names (`for.body`, `for.body29`, `for.cond25`, …).
  firmware middle: 438 other names incl. `for.body4.i.2`, `while.cond`, and one
  `for.cond1.preheader.i (invalidated)`. Loop prints start `; Preheader:`; the invalidated one is a
  module print. Neither the header nor the `Running pass:` line names the loop's function.
  Backend: 79 headers end `***:`, 37 (IR-level llc passes) have no stars.

## Step 6 — Measure the scientific impact through query.js (scratch probe in pkg/traceapi)

- `run.functions()`: checked 8 names (6 loop labels), firmware 55 (24 real).
- `row`'s middle timeline skipped 88–105 and 110–121 (its own loop passes). `changes()` reported
  87→106 and 109→122 as `known` (deltas 0 today; a LICM effect would have been credited to the next
  function pass). Also `RequireAnalysisPass<…, llvm::Module, …>` (ordinal 26, a module pass) had no
  scope at all: the `(\S+)` pass pattern cannot match names with spaces, so it was dropped from every timeline.
- Print 98 ended with `Running pass: SimpleLoopUnswitchPass on for.body29`.

## Step 7 — Fix loop scopes from module functions and print evidence

- `parseScopeName`: recognizes ` (invalidated)`; bare names stay provisional functions.
- `parseHeader`: splits pass/scope at the first ` on ` (same rule as `archive.go` `parsePass`).
- `assignLoopScopes` (index time, header only): a name is a function if the initial module defines it or
  a CGSCC header names it; otherwise a loop whose function is the nearest earlier single-function event
  of the stream (`functionEvidence.anchorOrdinal`). Module events reset the anchor.
- `confirmLoop` (lazy, on scope access): print kind must be a loop fragment (or a module print for an
  invalidated loop); records `headerBlockInPrint` and `headerBlockInAnchorPrint`; a print that defines
  the name reclassifies it as a pipeline-created function.
- `covers`: loop membership uses the header-time assignment and keeps unassigned loops in every timeline
  (conservative: an extra loop row can only turn a change into `unknown`).
- Audit (all streams): no `unknown` scope remains; 42/42/438 loops all assigned; all checked/unchecked loop
  prints are fragments with the header block present in the anchor print. 24 loop prints lack their own
  header block: all `LoopRotatePass` (the banner names the pre-rotation header) — kept as truthful
  evidence with a note. 8 firmware loops (`for.body4.i.1/2`, created by the full unroll) are absent from
  the anchor print, as expected.

## Step 8 — Evidence boundary for prints

- `printOf` splits trailing pass-manager lines (`Running pass|analysis:`, `Invalidating …`, `Clearing …`,
  `Skipping pass:`) off the print; `printBase` uses the byte length actually read, so offsets still
  address archive bytes. `text()` reports `trailer`, whole-print excerpts report `excluded`.
- Evidence: SROA print (73) whole-print search for `EarlyCSEPass` → 0 hits (was 1, the announcement);
  EarlyCSE print (74) → 1 hit (its own header); capacity-load hit offset 240865 unchanged and equal to
  `ref.start + offsetInPrint`; Go `archive.Text` bytes at that offset start with `load i32, ptr %work`.

## Step 9 — Regression tests and checkpoint 2

- `pkg/traceapi/integration_test.go`: catalog = module functions; all four scope kinds, 522 loops;
  module pass with spaces in `row`'s timeline; loop 98 scope and anchor; LoopRotate note; contiguous
  86–122; example 13 `unavailable`/`loopFragment`; **no `known` change spans an event that can modify
  `row`** (three metrics); 106 `unknown`; firmware `prepare`: invalidated loop 584 (module print,
  `available` with coverage `module`), unroll copy 585, another function's loop → `notInSelection`,
  0 unassigned loops; evidence boundary with a Go byte cross-check.
- Commands: `go test -race -count=1 ./...` ok ×5; `go vet ./...` clean; `gofmt -l` clean.
- Checkpoint 2 recorded (sha256 `4f7cf409…923d4`).

## Step 10 — Cell-deadline review finds a regression introduced in step 8

- Source: timing probe through `tracerepl.Service` + `traceapi.Install` (the served path), 15 s deadline.
- Observed (cold-ish session): firmware `trace_row` backend timeline 7,594 ms; misspelled function 1,576 ms.
- Hypothesis 1 (line split of each print in `splitTrailer`): rewritten to scan the tail only → still 8,908 ms. Rejected.
- `go test -cpuprofile` + `go tool pprof` were not approved here, so stages were timed from JS:
  Go `archive.Text` ×1,450 → 0 ms; regexes over all prints → ~35 ms; fetching all prints through
  query.js → 8,244 ms. Cause: `utf8Length(whole)` in `printOf` (added in step 8): an interpreted
  per-character loop over 14 MB.
- Fix: `rawBytesOf` computes the length lazily, only in `printBase` (excerpt offsets), from print + tail.
- Evidence (fresh session, cold): backend timeline 334 ms; typo error 388 ms; all prints 69 ms;
  `TestExcerptsExcludeTheNextPassAnnouncement` (byte cross-check) still passes.
- Guard: `TestColdFirmwareBackendTimelineFitsTheCellDeadline` with `race_on/off_test.go` build tags.
- Gate: plain and `-race` suites ok ×5; vet and gofmt clean. Checkpoint 3 recorded (sha256 `b6a92aac…1011a`);
  checkpoint 2 marked superseded.

## Step 11 — Contract content of the workbook examples, not only non-silence

- Source: scratch probe of examples 08, 11, 16, 17, 21, 24, 25 and a typed-vs-checked comparison.
- Evidence: 08 → `first` then `gap` (endpoint delta 6, 15 skipped); 11 → 10 use edges (`icmp`, operand 0);
  16 → endpoints `false→true`, interval with 3 intervening events and the "cannot be assigned" note;
  `percentChange` on it → `typeError`; 17 → `missingRemarksArtifact` with the event witness;
  21 → −41,949 / −3.2887 % with all four match keys equal; 24 → 1 row at 5, 0 at 6;
  25 → one shared node, one source timeline; typed-pie vs checked-llc → `incomparable`.
- Gap found: a profile total did not state that no captured pipeline is linked to its arm (workbook 26
  warns that the normal build's NoVRegs says nothing about `checked-llc-nolsr`). The manifest records
  commands per variant and the summaries record no identity, so no mapping can be asserted.
- Fix: `pipeline: { status: "notLinked", … }` on every total; results help updated.
- Gap found: `q.help()` never mentioned the separate `hardware` global. Fix: a live help line
  (installed / available / unavailable in this session; never mixed into `profiles`).
- Tests: harness contract assertions added for 08, 11, 13, 16, 17, 25, 26 (none removed);
  `TestAmbiguityAndArmLinkageAreExplicit` (14: `.one()` → `ambiguous`, 2; 26: `notLinked`);
  `cmd/trace-repl` served test checks the help line with and without `--device-study`.

## Step 12 — Checkpoint 4, report and receipt

- Commands: `go test -count=1 ./...` ok ×5; `go test -race -count=1 ./...` ok ×5; `go vet ./...` clean;
  `gofmt -l cmd pkg` clean; `sha256sum pkg/traceapi/query.js` → `771e4973…d9949d`.
- Wrote `INTEGRATION-CHECKPOINT.md` (checkpoint 4 = current baseline), `INTEGRATION-REPORT.md`,
  `integration-receipt.json`; emptied the three scratch probe files.

## Limitations of this investigation

- CPU profiling was not available; latency causes were isolated by timing stages from JS.
- `query.js` changed on disk between my first two test runs; my edits apply to the later file.
- The latency guard is time-based and skipped under `-race`.
- Loop-to-function assignment rests on pass-manager adjacency plus byte checks, because the archive
  records no loop identity; the report lists this as a negative capability.

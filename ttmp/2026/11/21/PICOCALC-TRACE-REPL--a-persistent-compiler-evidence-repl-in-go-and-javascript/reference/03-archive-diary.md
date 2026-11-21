---
Title: Archive reader investigation diary
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://pkg/tracearchive/archive.go
      Note: Archive identity, validation, shared cache and reference contract
    - Path: repo://pkg/tracearchive/archive_test.go
      Note: Real-corpus and synthetic corruption tests and cache benchmark
ExternalSources: []
Summary: Design and verification of the Go reader for actual indexed LLVM evidence.
LastUpdated: 2026-11-21T14:24:16-05:00
WhatFor: Review the evidence identity, cache lifecycle and regression probes below the JavaScript API.
WhenToUse: When adding a query source, diagnosing a suspect count, or reproducing a persona finding.
---

# Archive reader investigation diary

## Step 1. Establish an addressable evidence record

A REPL query may evaluate the same function hundreds of times while an engineer investigates one pass. I inspected the original Python capture program and a checked LLVM trace to determine what the Go server can retain and how a second reader can recover the same evidence. An event records an occurrence at an ordinal in one stream. Its header names the pass, and its reference identifies bytes by digest and half-open range.

### Prompt Context

**User prompt (verbatim)**

> Ok, write a go version using ~/code/wesen/go-go-golems/go-go-goja, with a REPL service so that you don't need to recompute everything all the time but can keep things in the sandbox emmory. Create a new docmgr ticket, use subagents at your leisure, run subagents as personas with pi coding agent deepseek-4.1-flash that pretend to be these compiler engineers / researchers, and analyze how well they use the tool / the API / the .
>
> Look at /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21/ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md and
>
> Write up the design and spec and examples that you put out above, in the same level of detail (verbatim, if you want). Use opus xhigh to implement, and tell it to use deepseek-4.1-flash thinking high subagents (or a mix, if they want, with opus high and opus medium personas too), to do various optimization based tasks, simple but also complex. Have them write a playbook for the persona based testing (and update it as they improve their methods).

**Additional user prompt (verbatim)**

> also point them at Projects/2026/11/21/ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md

**Assistant interpretation.** This lane supplies a shared Go reader to the REPL service and its JavaScript bindings. The other lanes own session management and evaluation.

**Inferred user intent.** A compiler engineer can query one observation repeatedly, reproduce a result from its underlying bytes, and see when queries actually read new data.

### What I did

- Read both persona-testing playbooks, the archived manifest, the capture script `09-archive-llvm.py`, the previous Python extractor `10-read-pass.py` and the previous query workbook's independent verifier.
- Inspected first, last, and repeated headers in all three variants and both phases. Checked the complete dataset for the middle-end and backend pass-ID syntax used by the parser.
- Specified the shared Go API and the exact JSON field names for each event and reference with the query implementer and service owner.

### Why

Each invocation of virtual register rewriting has the same printed name. The compiler engineer needs an individual address for each invocation. Both playbooks emphasize reproducing symptoms at their source. For an incorrect answer in the REPL, a reader must be able to locate its evidence independently.

### What worked

The six headers tables decode from gzip archives. Checked middle has 195 entries, checked backend 116. Ordinals 74 and 78 in checked backend both name `virtregrewriter`.

### What didn't work

A lookup by pass name alone cannot distinguish the two backend occurrences. This is a limitation of that proposed key. The archive's original per-stream ordinal distinguishes them.

### What I learned

The checked middle-end stream starts its first indexed dump at byte 50. LLVM had printed a diagnostic preamble. The backend stream begins at zero. An individual event's range can also contain printer diagnostics for the next pass, so consumers need function-aware parsing when measuring instructions.

### What was tricky to build

LLVM's middle-end uses a title of the form `EarlyCSEPass on row`; the backend prints a readable title, an identifier in parentheses and, in some dumps, a trailing ` ***:`. The index preserves that colon and the preceding asterisks. The reader preserves the raw header and extracts the correct ID separately.

### What warrants a second pair of eyes

The index supplies the claimed evidence reference before the body has been verified. The first body read verifies that the stream digest, length and every indexed header match. Document this distinction for callers working with a damaged corpus.

### What should be done in the future

Run the real checked-row measurements, check failed-read recovery on a synthetic corrupted record, and exercise concurrent first reads.

### Code review instructions

Read the old capture script alongside `pkg/tracearchive/archive.go`. Compare ordinals 73 and 74 of checked middle with their headers, and compare the second line of backend ordinals 74 and 78.

### Technical details

The address is `{variant,phase,streamSHA,ordinal,start,end}`. The SHA-256 covers the uncompressed stream. Both offsets address bytes in that stream. The final event ends at the manifest's exact raw byte count. Summary citations use a separate digest over the original JSON file.

## Step 2. Validate cache ownership and measure a repeated read

I implemented the reader in Go, retaining immutable decompressed strings for the life of an archive. The race test launched twelve readers against the same checked stream. They produced twelve successful references and one inflation of 1,027,953 bytes. This is a direct check that a later REPL turn can reuse the original data even when another session reads at the same time.

### Prompt Context

**User prompt.** See Step 1. **Assistant interpretation.** Make each evidence read addressable and keep successfully loaded data resident for subsequent requests. **Inferred user intent.** Re-exploring the same checked function should be inexpensive and repeatable.

**Commit (code).** `f7447b1` — Read and verify indexed LLVM evidence once per resident archive.

### What I did

- Implemented metadata-only event listing, lazy digest-verified stream reads, independently owned JSON profile projections, raw initial-module bytes, profile and module digests, and per-archive counters.
- Added real-archive tests for every stream's terminal event, both virtual register rewriters, the checked header-load change at 73–74, all three initial modules and the LLVM execution count.
- Added synthetic probes for a non-ASCII code point before a later header, two equal offsets, a forged header and a damaged stream that is repaired after the first failed query.
- Added a benchmark comparing a fresh archive plus one read with an already verified stream read.

### Why

A mutable JavaScript object containing profile totals could allow a user to change the result presented to a colleague in another session. A private JSON tree copy at the reader boundary preserves isolation. Immutable event text can instead point directly at the retained string. Failure is recoverable because only a successfully validated stream enters the cache.

### What worked

`go test -mod=mod -race ./pkg/tracearchive` passed in 2.568 s on this host. Each synthetic corruption produced its expected diagnostic. In particular, repairing the log allowed the next read to succeed without constructing another archive.

`go test ./pkg/tracearchive -run '^$' -bench BenchmarkCheckedMiddleDump -benchtime=300ms -count=3` ran on a Linux/amd64 Intel i7-1165G7. The three fresh-open measurements were 6.738, 7.564 and 27.388 ms/op, with about 5.95 MB of Go allocations per operation. The hot measurements were 132.2, 117.3 and 103.2 ns/op, each with zero allocations. The fresh case includes locating the fixture, reading six indexes and validating one stream. The hot case calls the Go reader and returns its existing substring. End-to-end JS evaluation, HTTP, output encoding, profile cloning and physical PicoCalc timings have different measurement boundaries.

### What didn't work

`go test ./pkg/tracearchive` initially reported `missing go.sum entry for module providing package golang.org/x/sync/errgroup`. The root module was being assembled concurrently. Running with `-mod=mod` populated the checksum and completed the tests. The service engineer owns the top-level dependency files. A subsequent sandboxed run reported a read-only Go build cache. Running the same explicit `go test -race ./pkg/tracearchive` command with normal cache access passed in 2.375 s.

### What I learned

A lazy stream reader can keep index-only browsing independent of multi-megabyte IR logs. Profile files have different sharing requirements from observation text. Returning Go strings directly gives a cheap second read, while returning independent JSON trees allows users to manipulate local copies.

### What was tricky to build

An ordinal can be valid in multiple streams; addressing it requires a variant and phase. A lock per stream guards validation and publication of its bytes, allowing unrelated streams to load independently. Metadata copies contain only Go values. Profile JSON requires a recursive copy across both maps and lists.

### What warrants a second pair of eyes

Counter readings reflect a shared service, so a change across a sample interval may include activity from another session. The fixed study's readable streams total 30,912,391 bytes under its manifest. If larger archives become routine, record measured residency and choose a byte budget or admission policy for that new workload.

### What should be done in the future

Exercise the session-level binding and classification probes in the persona study. Physical trial pairing requires a dedicated adapter for the separate device ticket. A future indexed source with per-pixel records should retain its own fixture and binary identity.

### Code review instructions

Run `go test -race ./pkg/tracearchive` and `go test ./pkg/tracearchive -run '^$' -bench BenchmarkCheckedMiddleDump -benchmem`. Read `Open`, `Text`, `inflate`, and `Profile` in that order. The synthetic corruption cases in `archive_test.go` give compact reproduction fixtures.

### Technical details

`ProfileSHA(name)` hashes the original JSON file, which allows a citation to combine a digest and JSON pointer. `InitialModule(variant)` hashes the decompressed standalone textual module on its first read. Both return the calculated digest independently of the pass-stream manifest. Statistics distinguish successful stream inflations, text reads, profile loads, profile reads, initial-module loads and retained stream bytes.
